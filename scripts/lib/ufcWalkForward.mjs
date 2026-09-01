/**
 * Walk-forward fighter snapshots from prior fight totals (no future leakage).
 */
import { normalizeName } from './ufcCsvParser.mjs'

const DEFAULT_SNAPSHOT = {
  slpm: 3.5,
  sapm: 3.5,
  str_acc: 45,
  str_def: 50,
  td_avg: 0.8,
  td_acc: 40,
  td_def: 60,
  sub_avg: 0.3,
  finish_rate: 45,
  ko_finish_rate: 30,
  sub_finish_rate: 15,
  reach_inches: 72,
  stance: 'Orthodox',
}

/** @param {import('./ufcCsvParser.mjs').FightTotals[]} history */
function buildSnapshotFromHistory(fighterName, division, history) {
  if (!history.length) {
    return {
      fighter_name: fighterName,
      division,
      priorFightCount: 0,
      ...DEFAULT_SNAPSHOT,
      isDebut: true,
    }
  }

  let sigLanded = 0
  let sigAttempted = 0
  let oppSigLanded = 0
  let tdLanded = 0
  let tdAttempted = 0
  let oppTdAttempted = 0
  let oppTdLanded = 0
  let subAttempts = 0
  let fightMinutes = 0
  let finishes = 0
  let wins = 0

  for (const h of history) {
    sigLanded += h.sigStrikesLanded
    sigAttempted += h.sigStrikesAttempted
    tdLanded += h.takedownsLanded
    tdAttempted += h.takedownsAttempted
    subAttempts += h.subAttempts
    fightMinutes += h.fightSeconds / 60
    if (h.won) wins += 1
    if (h.finishWin) finishes += 1
    if (h.oppSigStrikesLanded != null) oppSigLanded += h.oppSigStrikesLanded
    if (h.oppTakedownsAttempted != null) oppTdAttempted += h.oppTakedownsAttempted
    if (h.oppTakedownsLanded != null) oppTdLanded += h.oppTakedownsLanded
  }

  const minutes = Math.max(fightMinutes, 1)
  const slpm = sigLanded / minutes
  const sapm = oppSigLanded > 0 ? oppSigLanded / minutes : DEFAULT_SNAPSHOT.sapm
  const td_avg = (tdLanded * 15) / minutes
  const sub_avg = (subAttempts * 15) / minutes
  const str_acc = sigAttempted > 0 ? Math.round((sigLanded / sigAttempted) * 100) : DEFAULT_SNAPSHOT.str_acc
  const td_acc = tdAttempted > 0 ? Math.round((tdLanded / tdAttempted) * 100) : DEFAULT_SNAPSHOT.td_acc
  const td_def =
    oppTdAttempted > 0
      ? Math.round(((oppTdAttempted - oppTdLanded) / oppTdAttempted) * 100)
      : DEFAULT_SNAPSHOT.td_def
  const finish_rate = Math.round((finishes / history.length) * 100)

  const last = history[history.length - 1]

  return {
    fighter_name: fighterName,
    division,
    priorFightCount: history.length,
    reach_inches: last.reach_inches ?? DEFAULT_SNAPSHOT.reach_inches,
    stance: last.stance ?? DEFAULT_SNAPSHOT.stance,
    slpm: Math.round(slpm * 100) / 100,
    sapm: Math.round(sapm * 100) / 100,
    str_acc,
    str_def: DEFAULT_SNAPSHOT.str_def,
    td_avg: Math.round(td_avg * 100) / 100,
    td_acc,
    td_def,
    sub_avg: Math.round(sub_avg * 100) / 100,
    finish_rate,
    ko_finish_rate: Math.round(finish_rate * 0.6),
    sub_finish_rate: Math.round(finish_rate * 0.4),
    isDebut: false,
  }
}

/**
 * Attach walk-forward snapshots to fights in chronological order.
 * @param {import('./ufcCsvParser.mjs').UfcFightRow[]} fights
 * @param {{ minPrior?: number, useEmbeddedStats?: boolean }} opts
 */
export function applyWalkForwardSnapshots(fights, opts = {}) {
  const minPrior = opts.minPrior ?? 1
  const useEmbedded = opts.useEmbeddedStats ?? false

  /** @type {Map<string, import('./ufcCsvParser.mjs').FightTotals[]>} */
  const historyByFighter = new Map()

  for (const fight of fights) {
    const keyA = normalizeName(fight.fighterA)
    const keyB = normalizeName(fight.fighterB)
    const histA = historyByFighter.get(keyA) || []
    const histB = historyByFighter.get(keyB) || []

    const wfA = buildSnapshotFromHistory(fight.fighterA, fight.division, histA)
    const wfB = buildSnapshotFromHistory(fight.fighterB, fight.division, histB)

    const embeddedA = fight.snapshotA
    const embeddedB = fight.snapshotB

    fight.walkForwardA = wfA
    fight.walkForwardB = wfB
    fight.modelA =
      useEmbedded && (embeddedA.slpm > 0 || embeddedA.sapm > 0) && wfA.priorFightCount >= minPrior
        ? { ...embeddedA, priorFightCount: wfA.priorFightCount }
        : wfA
    fight.modelB =
      useEmbedded && (embeddedB.slpm > 0 || embeddedB.sapm > 0) && wfB.priorFightCount >= minPrior
        ? { ...embeddedB, priorFightCount: wfB.priorFightCount }
        : wfB

    fight.skippedForDebut = wfA.priorFightCount < minPrior || wfB.priorFightCount < minPrior

    // Record this fight's totals + static bios for next iteration
    const aTotals = {
      ...fight.fightTotals.a,
      reach_inches: embeddedA.reach_inches,
      stance: embeddedA.stance,
      oppSigStrikesLanded: fight.fightTotals.b.sigStrikesLanded,
      oppTakedownsAttempted: fight.fightTotals.b.takedownsAttempted,
      oppTakedownsLanded: fight.fightTotals.b.takedownsLanded,
    }
    const bTotals = {
      ...fight.fightTotals.b,
      reach_inches: embeddedB.reach_inches,
      stance: embeddedB.stance,
      oppSigStrikesLanded: fight.fightTotals.a.sigStrikesLanded,
      oppTakedownsAttempted: fight.fightTotals.a.takedownsAttempted,
      oppTakedownsLanded: fight.fightTotals.a.takedownsLanded,
    }

    historyByFighter.set(keyA, [...histA, aTotals])
    historyByFighter.set(keyB, [...histB, bTotals])
  }

  return fights
}
