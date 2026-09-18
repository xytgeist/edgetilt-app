#!/usr/bin/env node
/**
 * Independence test: hide Scott's fair% / +EV. Rocco must still print Side or PASS
 * from last-5 + 3/5 + cage. Fail if he needs Scott or cannot sit.
 */
import { readFileSync } from 'node:fs'
import { decideRoccoUfc } from './lib/ufcRoccoDecide.mjs'

const src = readFileSync(new URL('./lib/ufcRoccoDecide.mjs', import.meta.url), 'utf8')
const banned = src.match(/\b(fair%?|projectedWin|edgePct|americanToImplied|oddsA|scottSide|modelFair)\b/i)
if (banned) {
  console.error(`FAIL: ufcRoccoDecide.mjs mentions Scott/price token: ${banned[0]}`)
  process.exit(1)
}

const wrestler = {
  fightCount: 5,
  wins: 4,
  losses: 1,
  koWins: 0,
  subWins: 1,
  decWins: 3,
  tdLanded: 12,
  sigStrLanded: 40,
  roundsFought: 14,
  distanceFights: 3,
  stance: 'Orthodox',
}
const liner = {
  fightCount: 5,
  wins: 3,
  losses: 2,
  koWins: 2,
  subWins: 0,
  decWins: 1,
  tdLanded: 0,
  sigStrLanded: 55,
  roundsFought: 11,
  distanceFights: 1,
  stance: 'Orthodox',
}
const twin = { ...wrestler }

const missing = decideRoccoUfc({
  fighterA: 'A',
  fighterB: 'B',
  last5A: null,
  last5B: liner,
  scheduledRounds: 3,
  isApex: false,
})
if (missing.side !== 'PASS') {
  console.error('FAIL: missing last-5 must PASS', missing)
  process.exit(1)
}

const thin = decideRoccoUfc({
  fighterA: 'A',
  fighterB: 'B',
  last5A: { ...wrestler, fightCount: 2 },
  last5B: liner,
  scheduledRounds: 3,
  isApex: false,
})
if (thin.side !== 'PASS') {
  console.error('FAIL: thin tape must PASS', thin)
  process.exit(1)
}

const close = decideRoccoUfc({
  fighterA: 'A',
  fighterB: 'B',
  last5A: twin,
  last5B: twin,
  scheduledRounds: 3,
  isApex: false,
})
if (close.side !== 'PASS') {
  console.error('FAIL: identical last-5 must PASS', close)
  process.exit(1)
}

const styles = decideRoccoUfc({
  fighterA: 'Merab',
  fighterB: 'Liner',
  last5A: wrestler,
  last5B: liner,
  scheduledRounds: 3,
  isApex: true,
})
if (styles.side !== 'A') {
  console.error('FAIL: wrestler vs liner should be A without Scott', styles)
  process.exit(1)
}

const hiddenScott = decideRoccoUfc({
  fighterA: 'Merab',
  fighterB: 'Liner',
  last5A: wrestler,
  last5B: liner,
  scheduledRounds: 5,
  isApex: false,
})
if (hiddenScott.side !== 'A' && hiddenScott.side !== 'PASS') {
  console.error('FAIL: hide-Scott rerun did not emit Side or PASS', hiddenScott)
  process.exit(1)
}
if (hiddenScott.rationale.toLowerCase().includes('fair') || hiddenScott.rationale.toLowerCase().includes('+ev')) {
  console.error('FAIL: rationale leans on Scott price', hiddenScott)
  process.exit(1)
}

const resultBase = {
  fightCount: 5,
  wins: 4,
  losses: 1,
  roundsFought: 12,
  distanceFights: 2,
  tdLanded: 0,
  sigStrLanded: 0,
  countsMeasured: false,
  stance: 'Orthodox',
}
const subber = { ...resultBase, koWins: 0, subWins: 4, decWins: 0 }
const decisionGuy = { ...resultBase, koWins: 0, subWins: 0, decWins: 4 }
const resultStyle = decideRoccoUfc({
  fighterA: 'Subber',
  fighterB: 'Decider',
  last5A: subber,
  last5B: decisionGuy,
  scheduledRounds: 3,
  isApex: true,
})
if (resultStyle.side !== 'A' || resultStyle.features.includes('wrestling_a') || resultStyle.features.includes('apex_wrestle')) {
  console.error('FAIL: unmeasured zeros must not count as wrestling', resultStyle)
  process.exit(1)
}
const tinyForm = decideRoccoUfc({
  fighterA: 'A',
  fighterB: 'B',
  last5A: { ...decisionGuy, wins: 3, losses: 2, decWins: 3 },
  last5B: { ...decisionGuy, wins: 2, losses: 3, decWins: 2 },
  scheduledRounds: 3,
  isApex: false,
})
if (tinyForm.side !== 'PASS') {
  console.error('FAIL: tiny result-tape win gap must PASS', tinyForm)
  process.exit(1)
}

console.log('ok')
console.log(JSON.stringify({ missing: missing.side, thin: thin.side, close: close.side, styles }, null, 2))
