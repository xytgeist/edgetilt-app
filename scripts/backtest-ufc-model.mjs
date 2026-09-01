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
 *   node scripts/backtest-ufc-model.mjs --with-odds --audit-odds
 *   node scripts/backtest-ufc-model.mjs --with-odds --quiet-odds          # v0.6 calibrated (default)
 *   node scripts/backtest-ufc-model.mjs --with-odds --raw-prob              # v0.5 coefficient probs only
 *
 * Env:
 *   KAGGLE_API_TOKEN — kagglehub auth (or kaggle auth login / ~/.kaggle/kaggle.json)
 *   THE_ODDS_API_KEY — required for --with-odds / --audit-odds (Edge mirror in .env.supabase.test)
 */
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { parseUfcCsv, probeCsvColumns, normalizeName } from './lib/ufcCsvParser.mjs'
import { applyWalkForwardSnapshots } from './lib/ufcWalkForward.mjs'
import { analyzeUfcMatchupFromSnapshots, analyzeUfcMatchupCalibrated, pickScottSide } from './lib/ufcMatchupEngine.mjs'
import { fitProbCalibration, fightsBeforeDate } from './lib/ufcProbCalibration.mjs'
import { attachHistoricalOdds } from './lib/ufcHistoricalOdds.mjs'
import { attachCsvOdds } from './lib/ufcCsvOdds.mjs'
import { collectOddsAuditRows, printOddsAudit } from './lib/ufcOddsAudit.mjs'
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

function auditOddsSampleSize() {
  const eq = process.argv.find((a) => a.startsWith('--audit-odds='))
  if (eq) {
    const n = Number(eq.split('=')[1])
    return Number.isFinite(n) && n > 0 ? n : 20
  }
  return hasFlag('--audit-odds') ? 20 : 0
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
  const useRawOnly = Boolean(opts.useRawProb)
  const calibration = opts.calibration
  const marketBlend = Number(opts.marketBlend ?? 0.25)
  const minEdge = Number(opts.minEdge ?? 0.03)

  /** @param {'raw' | 'calibrated'} mode */
  function makeStats(mode) {
    return {
      graded: 0,
      wins: 0,
      losses: 0,
      skippedDebut: 0,
      skippedNoPick: 0,
      favoriteWins: 0,
      favoriteGraded: 0,
      brierSum: 0,
      brierN: 0,
      marketBrierSum: 0,
      units: 0,
      bets: 0,
      positiveEdgeBets: 0,
      positiveEdgeWins: 0,
      statDogPicks: 0,
      statDogWins: 0,
      misses: [],
      mode,
    }
  }

  const primary = makeStats(useRawOnly ? 'raw' : 'calibrated')
  const compareRaw = !useRawOnly ? makeStats('raw') : null

  for (const fight of fights) {
    if (fight.skippedForDebut) {
      primary.skippedDebut += 1
      if (compareRaw) compareRaw.skippedDebut += 1
      continue
    }

    const matchupOpts = {
      isApexCage: fight.isApexCage,
      isFiveRounds: fight.isFiveRounds,
    }
    const oddsA = fight.marketOdds?.oddsA
    const oddsB = fight.marketOdds?.oddsB

    const rawMatchup = analyzeUfcMatchupFromSnapshots(fight.modelA, fight.modelB, matchupOpts)
    const calMatchup =
      calibration &&
      analyzeUfcMatchupCalibrated(fight.modelA, fight.modelB, {
        ...matchupOpts,
        oddsA,
        oddsB,
        marketBlend: oddsA && oddsB ? marketBlend : 0,
      }, calibration)

    /** @param {ReturnType<typeof analyzeUfcMatchupFromSnapshots>} matchup @param {ReturnType<typeof makeStats>} bucket */
    function gradeFight(matchup, bucket) {
      if (!matchup) return

      let pick = null
      if (oddsA && oddsB) {
        pick = pickScottSide(matchup, oddsA, oddsB)
        const fav = favoriteSide(oddsA, oddsB)
        const actual = winnerSide(fight)
        if (actual) {
          bucket.favoriteGraded += 1
          if (fav === actual) bucket.favoriteWins += 1
        }
      } else {
        pick = matchup.projectedWinProbA >= matchup.projectedWinProbB
          ? { side: 'A', edge: 0, prob: matchup.projectedWinProbA }
          : { side: 'B', edge: 0, prob: matchup.projectedWinProbB }
      }

      if (!pick?.side) {
        bucket.skippedNoPick += 1
        return
      }

      const actual = winnerSide(fight)
      if (!actual) return

      bucket.graded += 1
      const won = pick.side === actual
      if (won) bucket.wins += 1
      else bucket.losses += 1

      const probPicked = pick.side === 'A' ? matchup.projectedWinProbA : matchup.projectedWinProbB
      bucket.brierSum += (probPicked - (won ? 1 : 0)) ** 2
      bucket.brierN += 1

      const statDog =
        pick.side === 'A' ? matchup.flags?.statDogA : matchup.flags?.statDogB
      if (statDog) {
        bucket.statDogPicks += 1
        if (won) bucket.statDogWins += 1
      }

      if (oddsA && oddsB) {
        const marketProb = pick.side === 'A' ? americanToImplied(oddsA) : americanToImplied(oddsB)
        bucket.marketBrierSum += (marketProb - (won ? 1 : 0)) ** 2

        if (pick.edge >= minEdge) {
          bucket.positiveEdgeBets += 1
          if (won) bucket.positiveEdgeWins += 1
          const price = pick.side === 'A' ? oddsA : oddsB
          bucket.units += calcNetUnits(price, won)
          bucket.bets += 1
        }
      }

      if (!won && opts.verboseMisses && bucket.misses.length < 15 && bucket === primary) {
        bucket.misses.push({
          date: fight.eventDate,
          bout: `${fight.fighterA} vs ${fight.fighterB}`,
          pick: pick.side === 'A' ? fight.fighterA : fight.fighterB,
          winner: fight.winner,
          modelProb: Math.round(probPicked * 1000) / 10,
          edgePct: Math.round((pick.edge || 0) * 1000) / 10,
          odds: pick.side === 'A' ? oddsA : oddsB,
          statDog: Boolean(statDog),
        })
      }
    }

    if (useRawOnly) {
      gradeFight(rawMatchup, primary)
    } else {
      gradeFight(calMatchup, primary)
      if (compareRaw) gradeFight(rawMatchup, compareRaw)
    }
  }

  function finalize(bucket) {
    return {
      ...bucket,
      hitRate: bucket.graded ? bucket.wins / bucket.graded : 0,
      brier: bucket.brierN ? bucket.brierSum / bucket.brierN : null,
      marketBrier: bucket.brierN && bucket.favoriteGraded ? bucket.marketBrierSum / bucket.brierN : null,
      roi: bucket.bets ? bucket.units / bucket.bets : 0,
      positiveEdgeHitRate: bucket.positiveEdgeBets ? bucket.positiveEdgeWins / bucket.positiveEdgeBets : 0,
      favoriteHitRate: bucket.favoriteGraded ? bucket.favoriteWins / bucket.favoriteGraded : 0,
      statDogHitRate: bucket.statDogPicks ? bucket.statDogWins / bucket.statDogPicks : 0,
    }
  }

  return {
    primary: finalize(primary),
    raw: compareRaw ? finalize(compareRaw) : null,
    useRawOnly,
  }
}

function printBacktestBlock(label, results) {
  console.log(`--- ${label} ---`)
  console.log(`Graded: ${results.graded} (skipped debut/low history: ${results.skippedDebut})`)
  console.log(`Record: ${results.wins}-${results.losses} (${(results.hitRate * 100).toFixed(1)}%)`)
  if (results.brier != null) {
    console.log(`Brier score (model): ${results.brier.toFixed(4)} (lower is better)`)
  }
  if (results.marketBrier != null) {
    console.log(`Brier score (market on picked side): ${results.marketBrier.toFixed(4)}`)
  }
  if (results.positiveEdgeBets) {
    console.log(`+EV bets: ${results.positiveEdgeBets} | hit ${(results.positiveEdgeHitRate * 100).toFixed(1)}% | ROI ${(results.roi * 100).toFixed(1)}% (${results.units >= 0 ? '+' : ''}${results.units.toFixed(2)}u)`)
  }
  if (results.statDogPicks) {
    console.log(`Stat-dog picks: ${results.statDogPicks} (${(results.statDogHitRate * 100).toFixed(1)}% hit)`)
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
  const useRawProb = hasFlag('--raw-prob')
  const calibrateBefore = argValue('--calibrate-before') || from
  const marketBlend = Number(argValue('--market-blend') ?? 0.25)
  const minEdge = Number(argValue('--min-edge') ?? 0.03)
  const auditSample = auditOddsSampleSize()
  const withOddsApi = hasFlag('--with-odds') || auditSample > 0
  const skipCsvOdds = hasFlag('--no-csv-odds')
  const verboseMisses = hasFlag('--verbose-misses')

  const raw = fs.readFileSync(csvPath, 'utf8')
  const { fights: allFights, format, csvOddsInFile } = parseUfcCsv(raw)

  // Walk-forward must see full chronological history before slicing the test window.
  applyWalkForwardSnapshots(allFights, { minPrior, useEmbeddedStats: useEmbedded })
  const inRange = filterByDate(allFights, from, to)

  const trainFights = fightsBeforeDate(allFights, calibrateBefore)
  const calibration = fitProbCalibration(trainFights)

  let csvOddsSummary = null
  if (!skipCsvOdds) {
    csvOddsSummary = attachCsvOdds(inRange)
  }

  let oddsApiSummary = null
  if (withOddsApi) {
    const apiKey = loadOddsApiKey()
    if (!apiKey) {
      console.error('THE_ODDS_API_KEY not set. Add to .env.supabase.test (or .env.local) for --with-odds / --audit-odds.')
      process.exit(1)
    }
    oddsApiSummary = await attachHistoricalOdds(inRange, apiKey, { verbose: !hasFlag('--quiet-odds') })
  }

  const backtestOut = runBacktest(inRange, {
    verboseMisses,
    useRawProb,
    calibration: useRawProb ? null : calibration,
    marketBlend,
    minEdge,
  })
  const results = backtestOut.primary

  if (auditSample > 0) {
    const auditRows = collectOddsAuditRows(inRange)
    printOddsAudit(auditRows, { sampleSize: auditSample, seed: Number(argValue('--audit-seed') || 42) })
  }

  console.log('')
  console.log('=== UFC Syndicate Model Backtest ===')
  console.log(`CSV: ${csvPath} (${format})`)
  console.log(`Window: ${from} → ${to}`)
  console.log(`Fights in window: ${inRange.length}`)
  console.log(`Stats mode: ${useEmbedded ? 'embedded pre-fight columns when present' : 'walk-forward only'}`)
  console.log(`Min prior UFC fights per fighter: ${minPrior}`)
  if (!useRawProb) {
    console.log(`Prob layer: v0.6 calibrated (train before ${calibrateBefore}, n=${calibration.graded})`)
    console.log(`Market blend when odds present: ${(marketBlend * 100).toFixed(0)}% | +EV min edge ${(minEdge * 100).toFixed(0)}% (devigged market)`)
  } else {
    console.log('Prob layer: v0.5 raw coefficients (--raw-prob)')
  }
  if (csvOddsSummary) {
    console.log(
      `CSV odds (f_1_odds/f_2_odds): ${csvOddsSummary.attached}/${inRange.length} fights (${(csvOddsSummary.coverage * 100).toFixed(1)}% in file: ${csvOddsInFile ?? 0})`,
    )
  }
  console.log('')

  printBacktestBlock(useRawProb ? 'Model (Scott ML pick, raw v0.5)' : 'Model (Scott ML pick, calibrated v0.6)', results)

  if (backtestOut.raw) {
    console.log('')
    printBacktestBlock('Comparison (raw v0.5 coefficients)', backtestOut.raw)
  }

  console.log('')
  console.log('--- Market baseline ---')
  console.log(`Favorite ML hit rate: ${(results.favoriteHitRate * 100).toFixed(1)}% (${results.favoriteGraded} fights with odds)`)

  if (csvOddsSummary?.attached && results.positiveEdgeBets) {
    console.log('')
    console.log('--- +EV subset (Scott: model edge > 0 vs CSV close) ---')
    console.log(`See calibrated block above for bet count / ROI.`)
  }

  if (withOddsApi && oddsApiSummary) {
    console.log('')
    console.log('--- Odds API coverage ---')
    console.log(`Matched closing lines: ${oddsApiSummary.attached}`)
    console.log(`Missed: ${oddsApiSummary.missed}`)
    if (oddsApiSummary.attached && !csvOddsSummary?.attached && results.positiveEdgeBets) {
      console.log('Use --audit-odds to spot-check line matches.')
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
      console.log(`  Picked ${m.pick} (${m.modelProb}% model, +${m.edgePct}% edge @ ${m.odds ?? 'n/a'}${m.statDog ? ', stat-dog' : ''}) → ${m.winner} won`)
    }
  }

  console.log('')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
