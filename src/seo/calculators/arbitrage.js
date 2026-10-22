import { arbTwoWay, formatAmericanOdds, noVigTwoWay } from '../../features/sports-bet-tracker/sportsBetCalcMath.js'
import { americanText, field, pct, setResult, signedUsd, usd, wire } from './bind.js'

const form = document.querySelector('[data-calc]')
const out = document.querySelector('[data-out]')

wire(form, () => {
  const a = field(form, 'a')
  const b = field(form, 'b')
  const fair = noVigTwoWay(a, b)
  const arb = arbTwoWay(a, b, field(form, 'bank'))
  if (!fair || !arb) {
    setResult(out, { hint: 'Enter two American prices and a stake to split.' })
    return
  }
  const rows = [
    { label: 'Hold', value: pct(fair.vigPct, 2), tone: fair.vigPct > 0 ? 'bad' : 'good' },
    { label: 'Combined implied', value: pct(arb.overround * 100, 2) },
    { label: 'Fair A', value: americanText(formatAmericanOdds, fair.fairAmericanA) },
    { label: 'Fair B', value: americanText(formatAmericanOdds, fair.fairAmericanB) },
  ]
  if (arb.isArb) {
    rows.push(
      { label: 'Locked profit', value: signedUsd(arb.profit), tone: 'good' },
      { label: 'Return', value: pct(arb.profitPct, 2), tone: 'good' },
      { label: 'Stake A', value: usd(arb.stakeA), tone: 'accent' },
      { label: 'Stake B', value: usd(arb.stakeB), tone: 'accent' },
    )
    setResult(out, { hint: 'These prices arb. The split locks the same profit either way.', rows })
    return
  }
  setResult(out, {
    hint: `No arb. Combined implied is ${pct(arb.overround * 100, 2)}. An arb needs that under 100%.`,
    rows,
  })
})
