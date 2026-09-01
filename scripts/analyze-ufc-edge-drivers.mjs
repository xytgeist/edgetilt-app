#!/usr/bin/env node
/**
 * Investigate what drives inflated model edges and whether direction beats market.
 *
 * Usage:
 *   npm run backtest:ufc:drivers
 *   npm run backtest:ufc:drivers -- --from 2024-01-01 --to 2025-12-31
 *
 * Requires THE_ODDS_API_KEY in .env.supabase.test (or warm data/ufc/odds-cache/).
 */
import fs from 'node:fs'
import path from 'node:path'
import { parseUfcCsv, normalizeName } from './lib/ufcCsvParser.mjs'
import { applyWalkForwardSnapshots } from './lib/ufcWalkForward.mjs'
import { analyzeUfcMatchupFromSnapshots, pickScottSide } from './lib/ufcMatchupEngine.mjs'
import { attachCsvOdds } from './lib/ufcCsvOdds.mjs'
import { attachHistoricalOdds } from './lib/ufcHistoricalOdds.mjs'
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

function winnerSide(fight) {
  if (normalizeName(fight.winner) === normalizeName(fight.fighterA)) return 'A'
  if (normalizeName(fight.winner) === normalizeName(fight.fighterB)) return 'B'
  return null
}

function pickImplied(row) {
  return row.pickSide === 'A' ? row.impA : row.impB
}

function bucketEdge(edge) {
  if (edge <= 0.05) return '0-5%'
  if (edge <= 0.1) return '5-10%'
  if (edge <= 0.15) return '10-15%'
  if (edge <= 0.2) return '15-20%'
  if (edge <= 0.3) return '20-30%'
  return '30%+'
}

function avgKey(arr, key) {
  return arr.length ? arr.reduce((s, r) => s + r[key], 0) / arr.length : 0
}

function summarizeBucket(label, rows) {
  if (!rows.length) return null
  const wins = rows.filter((r) => r.won).length
  const imp = rows.reduce((s, r) => s + pickImplied(r), 0) / rows.length
  const model = rows.reduce((s, r) => s + r.pickModelProb, 0) / rows.length
  const units = rows.reduce((s, r) => s + calcNetUnits(r.pickOdds, r.won), 0)
  const hit = wins / rows.length
  return {
    label,
    n: rows.length,
    hit: (hit * 100).toFixed(1),
    marketImp: (imp * 100).toFixed(1),
    modelProb: (model * 100).toFixed(1),
    liftVsMarket: ((hit - imp) * 100).toFixed(1),
    roi: ((units / rows.length) * 100).toFixed(1),
    units: units.toFixed(1),
  }
}

/** @param {import('./lib/ufcCsvParser.mjs').UfcFightRow[]} fights */
export function collectEdgeDriverRows(fights) {
  /** @type {object[]} */
  const rows = []

  for (const fight of fights) {
    if (fight.skippedForDebut) continue
    const oddsA = fight.marketOdds?.oddsA
    const oddsB = fight.marketOdds?.oddsB
    if (!oddsA || !oddsB) continue
    const actual = winnerSide(fight)
    if (!actual) continue

    const matchup = analyzeUfcMatchupFromSnapshots(fight.modelA, fight.modelB, {
      isApexCage: fight.isApexCage,
      isFiveRounds: fight.isFiveRounds,
    })
    const pick = pickScottSide(matchup, oddsA, oddsB)
    if (!pick?.side || pick.edge <= 0) continue

    const impA = americanToImplied(oddsA)
    const impB = americanToImplied(oddsB)
    const pickOdds = pick.side === 'A' ? oddsA : oddsB
    const pickImp = pick.side === 'A' ? impA : impB
    const mA = fight.modelA
    const mB = fight.modelB

    const netStrA = mA.slpm - mA.sapm
    const netStrB = mB.slpm - mB.sapm
    const strikeDiffPick = pick.side === 'A' ? netStrA - netStrB : netStrB - netStrA
    const tdPick =
      pick.side === 'A'
        ? matchup.takedownControlA - matchup.takedownControlB
        : matchup.takedownControlB - matchup.takedownControlA
    const reachPick = pick.side === 'A' ? mA.reach_inches - mB.reach_inches : mB.reach_inches - mA.reach_inches
    const finishPick = pick.side === 'A' ? mA.finish_rate - mB.finish_rate : mB.finish_rate - mA.finish_rate
    const slpmPick = pick.side === 'A' ? mA.slpm - mB.slpm : mB.slpm - mA.slpm

    rows.push({
      date: fight.eventDate,
      bout: `${fight.fighterA} vs ${fight.fighterB}`,
      pickName: pick.side === 'A' ? fight.fighterA : fight.fighterB,
      pickSide: pick.side,
      pickEdge: pick.edge,
      pickModelProb: pick.prob,
      pickOdds,
      pickImp,
      impA,
      impB,
      won: pick.side === actual,
      isDog: pickImp < 0.5,
      strikeDiffPick,
      tdPick,
      reachPick,
      finishPick,
      slpmPick,
    })
  }

  return rows
}

export function printEdgeDriverReport(rows, opts = {}) {
  console.log('')
  console.log('=== UFC edge driver report ===')
  console.log(`+EV picks analyzed: ${rows.length}`)
  console.log('')
  console.log('=== Edge bucket: hit rate vs MARKET implied (direction, not calibration) ===')

  const order = ['0-5%', '5-10%', '10-15%', '15-20%', '20-30%', '30%+']
  for (const b of order) {
    const s = summarizeBucket(b, rows.filter((r) => bucketEdge(r.pickEdge) === b))
    if (s) {
      console.log(
        `${s.label.padEnd(6)} n=${String(s.n).padStart(3)} | hit ${s.hit}% vs market ${s.marketImp}% | lift ${s.liftVsMarket}pp | model ${s.modelProb}% | ROI ${s.roi}% (${s.units}u)`,
      )
    }
  }

  const huge = rows.filter((r) => r.pickEdge > 0.15)
  const hugeDogs = huge.filter((r) => r.isDog)
  const hugeFavs = huge.filter((r) => !r.isDog)
  const rest = rows.filter((r) => r.pickEdge <= 0.15)

  console.log('')
  console.log('=== Huge edge (>15%): dogs vs favorites ===')
  for (const [label, subset] of [
    ['All >15%', huge],
    ['Dogs >15%', hugeDogs],
    ['Favs >15%', hugeFavs],
  ]) {
    const s = summarizeBucket(label, subset)
    if (s) {
      console.log(
        `${s.label.padEnd(12)} n=${String(s.n).padStart(3)} | hit ${s.hit}% vs market ${s.marketImp}% | lift ${s.liftVsMarket}pp | ROI ${s.roi}%`,
      )
    }
  }

  console.log('')
  console.log('=== Avg drivers on picked fighter (huge edge >15% vs rest) ===')
  for (const [key, label] of [
    ['strikeDiffPick', 'Net striking diff (SLpM-SApM)'],
    ['slpmPick', 'Raw SLpM diff'],
    ['tdPick', 'TD control score diff'],
    ['reachPick', 'Reach diff (in)'],
    ['finishPick', 'Finish rate diff'],
  ]) {
    console.log(`${label}: huge=${avgKey(huge, key).toFixed(2)} | rest=${avgKey(rest, key).toFixed(2)}`)
  }

  console.log('')
  console.log('=== Pattern: stat-favored dog vs market favorite ===')
  const dogUpsets = rows.filter((r) => r.isDog && r.strikeDiffPick > 0.5)
  const dogStrike = summarizeBucket('dog+strike', dogUpsets)
  if (dogStrike) {
    console.log(
      `Dog pick + net striking advantage >0.5: n=${dogStrike.n} hit ${dogStrike.hit}% vs market ${dogStrike.marketImp}% lift ${dogStrike.liftVsMarket}pp ROI ${dogStrike.roi}%`,
    )
  }

  if (opts.exampleBout) {
    const hit = rows.find(
      (r) =>
        r.bout.toLowerCase().includes(String(opts.exampleBout).toLowerCase()) ||
        (opts.exampleBout.includes(' vs ')
          ? false
          : r.bout.toLowerCase().includes(String(opts.exampleBout).toLowerCase())),
    )
    const guida = rows.find((r) => r.bout.includes('Chase Hooper') && r.bout.includes('Clay Guida'))
    const example = guida || hit
    if (example) {
      console.log('')
      console.log(`=== Example: ${example.bout} ===`)
      console.log(JSON.stringify(example, null, 2))
    }
  }

  if (huge.length) {
    const hugeHit = huge.filter((r) => r.won).length / huge.length
    const hugeImp = avgKey(huge, 'pickImp')
    console.log('')
    console.log('=== Takeaway ===')
    console.log(
      `Huge-edge (>15%) subset beats market implied by ~${((hugeHit - hugeImp) * 100).toFixed(1)}pp on average.`,
    )
    console.log(
      'Inflated model edge often means walk-forward stats love a dog the market is sleeping on ... not literal +40% EV.',
    )
    console.log('Next: calibrate probability magnitude, preserve directional flags (striking/TD/finish on dogs).')
  }

  console.log('')
}

async function main() {
  const csvPath =
    argValue('--csv') ||
    (fs.existsSync('data/ufc/UFC_full_data_silver_v2.csv') ? 'data/ufc/UFC_full_data_silver_v2.csv' : null)
  if (!csvPath) {
    console.error('Missing data/ufc/UFC_full_data_silver_v2.csv — run npm run fetch:ufc-data first.')
    process.exit(1)
  }

  const from = argValue('--from') || '2024-01-01'
  const to = argValue('--to') || '2025-12-31'
  const exampleBout = argValue('--example') || 'Clay Guida'

  const raw = fs.readFileSync(csvPath, 'utf8')
  const { fights } = parseUfcCsv(raw)
  applyWalkForwardSnapshots(fights, { minPrior: 1 })
  const inRange = fights.filter((f) => f.eventDate >= from && f.eventDate <= to)

  attachCsvOdds(inRange)
  const key = loadOddsApiKey()
  if (!key) {
    console.error('THE_ODDS_API_KEY not set. Add to .env.supabase.test (uses odds-cache when warm).')
    process.exit(1)
  }

  const summary = await attachHistoricalOdds(inRange, key, { verbose: false })
  console.log(`Odds attached: ${summary.attached}/${inRange.length} fights (${from} → ${to})`)

  const rows = collectEdgeDriverRows(inRange)
  printEdgeDriverReport(rows, { exampleBout })
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
