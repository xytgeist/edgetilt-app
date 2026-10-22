import { formatAmericanOdds, noVigTwoWay } from '../../features/sports-bet-tracker/sportsBetCalcMath.js'
import { americanText, field, pct, setResult, wire } from './bind.js'

const form = document.querySelector('[data-calc]')
const out = document.querySelector('[data-out]')

wire(form, () => {
  const pack = noVigTwoWay(field(form, 'a'), field(form, 'b'))
  if (!pack) {
    setResult(out, { hint: 'Enter both sides in American odds, such as -110 and -110.' })
    return
  }
  setResult(out, {
    rows: [
      { label: 'Hold', value: pct(pack.vigPct, 2), tone: pack.vigPct > 0 ? 'bad' : 'good' },
      { label: 'Overround', value: pct(pack.overround * 100, 2) },
      { label: 'Fair A', value: americanText(formatAmericanOdds, pack.fairAmericanA), tone: 'accent' },
      { label: 'Fair B', value: americanText(formatAmericanOdds, pack.fairAmericanB), tone: 'accent' },
      { label: 'True A', value: pct(pack.fairA * 100, 2) },
      { label: 'True B', value: pct(pack.fairB * 100, 2) },
    ],
  })
})
