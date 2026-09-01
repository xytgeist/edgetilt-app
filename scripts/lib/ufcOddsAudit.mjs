/**
 * Odds match audit for UFC backtest sanity checks.
 */
import { analyzeUfcMatchupFromSnapshots, pickScottSide } from './ufcMatchupEngine.mjs'
import { americanToImplied, calcNetUnits } from './ufcOddsMath.mjs'
import { normalizeName } from './ufcCsvParser.mjs'

function winnerSide(fight) {
  if (normalizeName(fight.winner) === normalizeName(fight.fighterA)) return 'A'
  if (normalizeName(fight.winner) === normalizeName(fight.fighterB)) return 'B'
  return null
}

function seededShuffle(arr, seed) {
  const out = [...arr]
  let s = seed >>> 0
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0
    const j = s % (i + 1)
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** @param {import('./ufcCsvParser.mjs').UfcFightRow[]} fights */
export function collectOddsAuditRows(fights) {
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

    const impA = americanToImplied(oddsA)
    const impB = americanToImplied(oddsB)
    const edgeA = matchup.projectedWinProbA - impA
    const edgeB = matchup.projectedWinProbB - impB
    const pick = pickScottSide(matchup, oddsA, oddsB)
    if (!pick?.side) continue

    const won = pick.side === actual
    const pickOdds = pick.side === 'A' ? oddsA : oddsB
    const pickName = pick.side === 'A' ? fight.fighterA : fight.fighterB
    const vigSum = impA + impB
    const edgeSum = edgeA + edgeB
    const plusEv = pick.edge > 0

    rows.push({
      date: fight.eventDate,
      eventName: fight.eventName,
      fighterA: fight.fighterA,
      fighterB: fight.fighterB,
      winner: fight.winner,
      apiHome: fight.marketOdds?.apiHome || '',
      apiAway: fight.marketOdds?.apiAway || '',
      book: fight.marketOdds?.book || '',
      commenceTime: fight.marketOdds?.commenceTime || '',
      oddsA,
      oddsB,
      impA,
      impB,
      vigSum,
      modelProbA: matchup.projectedWinProbA,
      modelProbB: matchup.projectedWinProbB,
      edgeA,
      edgeB,
      edgeSum,
      pickSide: pick.side,
      pickName,
      pickEdge: pick.edge,
      pickOdds,
      plusEv,
      won,
      units: plusEv ? calcNetUnits(pickOdds, won) : 0,
      flags: {
        hugeEdge: pick.edge > 0.1,
        heavyDog: Number(pickOdds) >= 200,
        heavyFav: Number(pickOdds) <= -200,
        bothEdgesNegative: edgeA <= 0 && edgeB <= 0,
        nameMismatch:
          fight.marketOdds?.apiHome &&
          fight.marketOdds?.apiAway &&
          !(
            (normalizeName(fight.marketOdds.apiHome) === normalizeName(fight.fighterA) &&
              normalizeName(fight.marketOdds.apiAway) === normalizeName(fight.fighterB)) ||
            (normalizeName(fight.marketOdds.apiHome) === normalizeName(fight.fighterB) &&
              normalizeName(fight.marketOdds.apiAway) === normalizeName(fight.fighterA))
          ),
      },
    })
  }

  return rows
}

function avg(nums) {
  if (!nums.length) return 0
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

function pct(n, d) {
  return d ? (n / d) * 100 : 0
}

export function printOddsAudit(rows, opts = {}) {
  const sampleSize = opts.sampleSize ?? 20
  const seed = opts.seed ?? 42
  const plusEvRows = rows.filter((r) => r.plusEv)
  const plusEvWins = plusEvRows.filter((r) => r.won)
  const units = plusEvRows.reduce((s, r) => s + r.units, 0)

  console.log('')
  console.log('=== Odds audit summary ===')
  console.log(`Fights with matched odds (graded): ${rows.length}`)
  console.log(`+EV bets (Scott edge > 0): ${plusEvRows.length} (${pct(plusEvRows.length, rows.length).toFixed(1)}% of matched)`)
  console.log(
    `Structural: both edges ≤ 0 (should not bet): ${rows.filter((r) => r.flags.bothEdgesNegative).length}`,
  )
  console.log(`Avg vig (impA + impB): ${(avg(rows.map((r) => r.vigSum)) * 100).toFixed(1)}%`)
  console.log(`Avg edge sum (edgeA + edgeB): ${(avg(rows.map((r) => r.edgeSum)) * 100).toFixed(2)}%`)
  if (plusEvRows.length) {
    console.log(`+EV avg pick odds: ${avg(plusEvRows.map((r) => r.pickOdds)).toFixed(0)} (American)`)
    console.log(`+EV avg edge: ${(avg(plusEvRows.map((r) => r.pickEdge)) * 100).toFixed(2)}%`)
    console.log(`+EV avg win payout: ${avg(plusEvWins.map((r) => r.units)).toFixed(2)}u`)
    console.log(`+EV avg loss: -1.00u`)
    console.log(
      `+EV flat 1u: ${plusEvWins.length}-${plusEvRows.length - plusEvWins.length} (${pct(plusEvWins.length, plusEvRows.length).toFixed(1)}%) → ${units >= 0 ? '+' : ''}${units.toFixed(2)}u`,
    )
  }
  console.log(`Huge edge (>10%): ${rows.filter((r) => r.flags.hugeEdge && r.plusEv).length}`)
  console.log(`Heavy dogs (+200+): ${plusEvRows.filter((r) => r.flags.heavyDog).length}`)

  const sample = seededShuffle(plusEvRows.length ? plusEvRows : rows, seed).slice(0, sampleSize)
  console.log('')
  console.log(`=== Sample ${sample.length} fights (seed ${seed}${plusEvRows.length ? ', +EV pool' : ''}) ===`)
  for (const r of sample) {
    console.log('')
    console.log(`${r.date} · ${r.fighterA} vs ${r.fighterB}`)
    console.log(`  CSV winner: ${r.winner}`)
    console.log(`  Odds API: ${r.apiAway || '?'} @ ${r.apiHome || '?'} (${r.book || 'book?'})`)
    console.log(`  Lines A/B: ${r.oddsA} / ${r.oddsB}  (implied ${(r.impA * 100).toFixed(1)}% / ${(r.impB * 100).toFixed(1)}%)`)
    console.log(
      `  Model A/B: ${(r.modelProbA * 100).toFixed(1)}% / ${(r.modelProbB * 100).toFixed(1)}%  edge ${(r.edgeA * 100).toFixed(1)}% / ${(r.edgeB * 100).toFixed(1)}%`,
    )
    console.log(
      `  Scott pick: ${r.pickName} @ ${r.pickOdds} (+${(r.pickEdge * 100).toFixed(1)}% edge) → ${r.won ? 'WIN' : 'LOSS'}${r.plusEv ? ` (${r.units >= 0 ? '+' : ''}${r.units.toFixed(2)}u)` : ' (no bet: edge ≤ 0)'}`,
    )
    const flagList = Object.entries(r.flags)
      .filter(([, v]) => v)
      .map(([k]) => k)
    if (flagList.length) console.log(`  Flags: ${flagList.join(', ')}`)
  }
  console.log('')
}
