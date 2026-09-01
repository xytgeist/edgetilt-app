#!/usr/bin/env node
/**
 * UFC Syndicate model backtest harness (2024-2025 default window).
 *
 * Data sources:
 *   Layer 1 — fight outcomes from CSV (Kaggle scarekrow or HuggingFace xtinkarpiu format)
 *   Layer 2 — walk-forward fighter stats (no future leakage) or embedded pre-fight columns (HF)
 *   Layer 3 — CSV moneyline columns (Kaggle f_1_odds / f_2_odds) auto-attached when populated
 *   Layer 4 — The Odds API historical MMA snapshots (--with-odds, overrides CSV where matched)
 *
 * Setup:
 *   npm run fetch:ufc-data          # kagglehub → data/ufc/UFC_full_data_silver_v2.csv
 *   or drop CSV manually from https://www.kaggle.com/datasets/scarekrow/ufc-data
 *   OR use bundled sample: data/ufc/sample_200.csv (HF format, partial dates)
 *
 * Usage:
 *   npm run fetch:ufc-data
 *   node scripts/backtest-ufc-model.mjs --fetch-kaggle
 *   node scripts/backtest-ufc-model.mjs --csv data/ufc/UFC_full_data_silver_v2.csv --from 2024-01-01 --to 2025-12-31
 *   node scripts/backtest-ufc-model.mjs --csv data/ufc/sample_200.csv --from 2024-01-01 --with-odds
 *   node scripts/backtest-ufc-model.mjs --probe-csv data/ufc/UFC_full_data_silver_v2.csv
 *   node scripts/backtest-ufc-model.mjs --use-embedded-stats
 *
 * Env:
 *   KAGGLE_API_TOKEN — kagglehub auth (or kaggle auth login / ~/.kaggle/kaggle.json)
 *   THE_ODDS_API_KEY — required for --with-odds (Business/paid historical tier)
 */
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { parseUfcCsv, probeCsvColumns, normalizeName } from './lib/ufcCsvParser.mjs'
import { applyWalkForwardSnapshots } from './lib/ufcWalkForward.mjs'
import { analyzeUfcMatchupFromSnapshots, pickScottSide } from './lib/ufcMatchupEngine.mjs'
import { attachHistoricalOdds } from './lib/ufcHistoricalOdds.mjs'
import { attachCsvOdds } from './lib/ufcCsvOdds.mjs'
import { americanToImplied, calcNetUnits } from './lib/ufcOddsMath.mjs'

function parseEnvFile(filePath) {
  const env = {}
  if (!fs.existsSync(filePath)) return env
  for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
    const idx = line.indexOf('=')
    if (idx <= 0) continue
    env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim()
  }
  return env
}

function loadOddsApiKey() {
  if (process.env.THE_ODDS_API_KEY) return process.env.THE_ODDS_API_KEY.trim()
  for (const f of ['.env', '.env.local', '.env.supabase.test', '.env.supabase.production']) {
    const env = parseEnvFile(path.join(process.cwd(), f))
    if (env.THE_ODDS_API_KEY) return env.THE_ODDS_API_KEY.trim()
  }
  return ''
}

function argValue(flag) {
  const eq = process.argv.find((a) => a.startsWith(`${flag}=`))
  if (eq) return eq.split('=').slice(1).join('=')
  const idx = process.argv.indexOf(flag)
  if (idx >= 0 && process.argv[idx + 1] && !process.argv[idx + 1].startsWith('--')) {
    return process.argv[idx + 1]
  }
  return null
}

function hasFlag(flag) {
  return process.argv.includes(flag)
}

function filterByDate(fights, from, to) {
  return fights.filter((f) => f.eventDate >= from && f.eventDate <= to)
}

function winnerSide(fight) {
  if (normalizeName(fight.winner) === normalizeName(fight.fighterA)) return 'A'
  if (normalizeName(fight.winner) === normalizeName(fight.fighterB)) return 'B'
  return null
}

function favoriteSide(oddsA, oddsB) {
  const impA = americanToImplied(oddsA)
  const impB = americanToImplied(oddsB)
  return impA >= impB ? 'A' : 'B'
}

function runBacktest(fights, opts) {
  let graded = 0
  let wins = 0
  let losses = 0
  let skippedDebut = 0
  let skippedNoPick = 0
  let favoriteWins = 0
  let favoriteGraded = 0
  let brierSum = 0
  let brierN = 0
  let marketBrierSum = 0
  let units = 0
  let bets = 0
  let positiveEdgeBets = 0
  let positiveEdgeWins = 0

  /** @type {Array<object>} */
  const misses = []

  for (const fight of fights) {
    if (fight.skippedForDebut) {
      skippedDebut += 1
      continue
    }

    const matchup = analyzeUfcMatchupFromSnapshots(fight.modelA, fight.modelB, {
      isApexCage: fight.isApexCage,
      isFiveRounds: fight.isFiveRounds,
    })

    const oddsA = fight.marketOdds?.oddsA
    const oddsB = fight.marketOdds?.oddsB

    let pick = null
    if (oddsA && oddsB) {
      pick = pickScottSide(matchup, oddsA, oddsB)
      const fav = favoriteSide(oddsA, oddsB)
      const actual = winnerSide(fight)
      if (actual) {
        favoriteGraded += 1
        if (fav === actual) favoriteWins += 1
      }
    } else {
      pick = matchup.projectedWinProbA >= matchup.projectedWinProbB
        ? { side: 'A', edge: 0, prob: matchup.projectedWinProbA }
        : { side: 'B', edge: 0, prob: matchup.projectedWinProbB }
    }

    if (!pick?.side) {
      skippedNoPick += 1
      continue
    }

    const actual = winnerSide(fight)
    if (!actual) continue

    graded += 1
    const won = pick.side === actual
    if (won) wins += 1
    else losses += 1

    const probPicked = pick.side === 'A' ? matchup.projectedWinProbA : matchup.projectedWinProbB
    brierSum += (probPicked - (won ? 1 : 0)) ** 2
    brierN += 1

    if (oddsA && oddsB) {
      const marketProb = pick.side === 'A' ? americanToImplied(oddsA) : americanToImplied(oddsB)
      marketBrierSum += (marketProb - (won ? 1 : 0)) ** 2

      if (pick.edge > 0) {
        positiveEdgeBets += 1
        if (won) positiveEdgeWins += 1
        const price = pick.side === 'A' ? oddsA : oddsB
        units += calcNetUnits(price, won)
        bets += 1
      }
    }

    if (!won && opts.verboseMisses && misses.length < 15) {
      misses.push({
        date: fight.eventDate,
        bout: `${fight.fighterA} vs ${fight.fighterB}`,
        pick: pick.side === 'A' ? fight.fighterA : fight.fighterB,
        winner: fight.winner,
        modelProb: Math.round(probPicked * 1000) / 10,
        edgePct: Math.round((pick.edge || 0) * 1000) / 10,
        odds: pick.side === 'A' ? oddsA : oddsB,
      })
    }
  }

  return {
    graded,
    wins,
    losses,
    hitRate: graded ? wins / graded : 0,
    skippedDebut,
    skippedNoPick,
    favoriteHitRate: favoriteGraded ? favoriteWins / favoriteGraded : 0,
    favoriteGraded,
    brier: brierN ? brierSum / brierN : null,
    marketBrier: brierN && favoriteGraded ? marketBrierSum / brierN : null,
    units,
    bets,
    roi: bets ? units / bets : 0,
    positiveEdgeBets,
    positiveEdgeHitRate: positiveEdgeBets ? positiveEdgeWins / positiveEdgeBets : 0,
    misses,
  }
}

async function main() {
  if (hasFlag('--fetch-kaggle')) {
    const fetchScript = path.join(process.cwd(), 'scripts/fetch-ufc-kaggle-data.mjs')
    const force = hasFlag('--force-fetch')
    const run = spawnSync(process.execPath, [fetchScript, ...(force ? ['--force'] : [])], {
      stdio: 'inherit',
    })
    if (run.status !== 0) process.exit(run.status ?? 1)
  }

  const csvPath =
    argValue('--csv') ||
    (fs.existsSync('data/ufc/UFC_full_data_silver_v2.csv')
      ? 'data/ufc/UFC_full_data_silver_v2.csv'
      : fs.existsSync('data/ufc/sample_200.csv')
        ? 'data/ufc/sample_200.csv'
        : null)

  if (hasFlag('--probe-csv')) {
    const probePath = argValue('--probe-csv') || csvPath
    if (!probePath || !fs.existsSync(probePath)) {
      console.error('Missing CSV for --probe-csv')
      process.exit(1)
    }
    const text = fs.readFileSync(probePath, 'utf8')
    const headers = text.split(/\r?\n/)[0].split(',')
    console.log(JSON.stringify(probeCsvColumns(headers), null, 2))
    process.exit(0)
  }

  if (!csvPath || !fs.existsSync(csvPath)) {
    console.error(`CSV not found at data/ufc/UFC_full_data_silver_v2.csv`)
    console.error(`  npm run fetch:ufc-data   # kagglehub (scarekrow/ufc-data)`)
    console.error(`  https://www.kaggle.com/datasets/scarekrow/ufc-data`)
    process.exit(1)
  }

  const from = argValue('--from') || '2024-01-01'
  const to = argValue('--to') || '2025-12-31'
  const minPrior = Number(argValue('--min-prior') || 1)
  const useEmbedded = hasFlag('--use-embedded-stats')
  const withOddsApi = hasFlag('--with-odds')
  const skipCsvOdds = hasFlag('--no-csv-odds')
  const verboseMisses = hasFlag('--verbose-misses')

  const raw = fs.readFileSync(csvPath, 'utf8')
  const { fights: allFights, format, csvOddsInFile } = parseUfcCsv(raw)

  // Walk-forward must see full chronological history before slicing the test window.
  applyWalkForwardSnapshots(allFights, { minPrior, useEmbeddedStats: useEmbedded })
  const inRange = filterByDate(allFights, from, to)

  let csvOddsSummary = null
  if (!skipCsvOdds) {
    csvOddsSummary = attachCsvOdds(inRange)
  }

  let oddsApiSummary = null
  if (withOddsApi) {
    const apiKey = loadOddsApiKey()
    if (!apiKey) {
      console.error('THE_ODDS_API_KEY not set. Add to .env.local for --with-odds.')
      process.exit(1)
    }
    oddsApiSummary = await attachHistoricalOdds(inRange, apiKey, { verbose: true })
  }

  const results = runBacktest(inRange, { verboseMisses })

  console.log('')
  console.log('=== UFC Syndicate Model Backtest ===')
  console.log(`CSV: ${csvPath} (${format})`)
  console.log(`Window: ${from} → ${to}`)
  console.log(`Fights in window: ${inRange.length}`)
  console.log(`Stats mode: ${useEmbedded ? 'embedded pre-fight columns when present' : 'walk-forward only'}`)
  console.log(`Min prior UFC fights per fighter: ${minPrior}`)
  if (csvOddsSummary) {
    console.log(
      `CSV odds (f_1_odds/f_2_odds): ${csvOddsSummary.attached}/${inRange.length} fights (${(csvOddsSummary.coverage * 100).toFixed(1)}% in file: ${csvOddsInFile ?? 0})`,
    )
  }
  console.log('')

  console.log('--- Model (Scott ML pick) ---')
  console.log(`Graded: ${results.graded} (skipped debut/low history: ${results.skippedDebut})`)
  console.log(`Record: ${results.wins}-${results.losses} (${(results.hitRate * 100).toFixed(1)}%)`)
  if (results.brier != null) {
    console.log(`Brier score (model): ${results.brier.toFixed(4)} (lower is better)`)
  }
  if (results.marketBrier != null) {
    console.log(`Brier score (market on picked side): ${results.marketBrier.toFixed(4)}`)
  }

  console.log('')
  console.log('--- Market baseline ---')
  console.log(`Favorite ML hit rate: ${(results.favoriteHitRate * 100).toFixed(1)}% (${results.favoriteGraded} fights with odds)`)

  if (csvOddsSummary?.attached) {
    console.log('')
    console.log('--- +EV subset (Scott: model edge > 0 vs CSV close) ---')
    console.log(`Bets: ${results.positiveEdgeBets}`)
    console.log(`Hit rate: ${(results.positiveEdgeHitRate * 100).toFixed(1)}%`)
    console.log(`Flat 1u ROI: ${(results.roi * 100).toFixed(1)}% (${results.units >= 0 ? '+' : ''}${results.units.toFixed(2)}u)`)
  }

  if (withOddsApi && oddsApiSummary) {
    console.log('')
    console.log('--- Odds API coverage ---')
    console.log(`Matched closing lines: ${oddsApiSummary.attached}`)
    console.log(`Missed: ${oddsApiSummary.missed}`)
    if (oddsApiSummary.attached && !csvOddsSummary?.attached) {
      console.log('')
      console.log('--- +EV subset (Scott: model edge > 0 vs Odds API close) ---')
      console.log(`Bets: ${results.positiveEdgeBets}`)
      console.log(`Hit rate: ${(results.positiveEdgeHitRate * 100).toFixed(1)}%`)
      console.log(`Flat 1u ROI: ${(results.roi * 100).toFixed(1)}% (${results.units >= 0 ? '+' : ''}${results.units.toFixed(2)}u)`)
    }
  } else if (!csvOddsSummary?.attached && !withOddsApi) {
    console.log('')
    console.log('Tip: Kaggle f_1_odds/f_2_odds empty in this export? Add THE_ODDS_API_KEY and re-run with --with-odds.')
  }

  if (results.misses.length) {
    console.log('')
    console.log('--- Sample misses ---')
    for (const m of results.misses) {
      console.log(`${m.date} · ${m.bout}`)
      console.log(`  Picked ${m.pick} (${m.modelProb}% model, +${m.edgePct}% edge @ ${m.odds ?? 'n/a'}) → ${m.winner} won`)
    }
  }

  console.log('')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
