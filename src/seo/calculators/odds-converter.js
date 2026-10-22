import {
  americanToDecimal,
  americanToFractional,
  formatAmericanOdds,
  impliedFromAmerican,
  parseAnyOdds,
} from '../../features/sports-bet-tracker/sportsBetCalcMath.js'
import { americanText, field, pct, setResult, wire } from './bind.js'

const form = document.querySelector('[data-calc]')
const out = document.querySelector('[data-out]')

wire(form, () => {
  const american = parseAnyOdds(field(form, 'odds'))
  if (american == null) {
    setResult(out, { hint: 'Try +150, 2.50, or 3/2.' })
    return
  }
  const decimal = americanToDecimal(american)
  const implied = impliedFromAmerican(american)
  setResult(out, {
    rows: [
      { label: 'American', value: americanText(formatAmericanOdds, american), tone: 'accent' },
      { label: 'Decimal', value: decimal == null ? 'n/a' : decimal.toFixed(2) },
      { label: 'Fractional', value: americanToFractional(american) || 'n/a' },
      { label: 'Implied', value: implied == null ? 'n/a' : pct(implied * 100, 2) },
    ],
  })
})
