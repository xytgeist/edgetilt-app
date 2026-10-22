import { impliedFromAmerican, kellyStake } from '../../features/sports-bet-tracker/sportsBetCalcMath.js'
import { field, pct, setResult, usd, wire } from './bind.js'

const form = document.querySelector('[data-calc]')
const out = document.querySelector('[data-out]')

wire(form, () => {
  const odds = field(form, 'odds')
  const implied = impliedFromAmerican(odds)
  const win = Number(field(form, 'win'))
  const pack = kellyStake(field(form, 'bankroll'), odds, win / 100, Number(field(form, 'fraction')))
  const book = implied == null
    ? 'Enter American odds such as +150 or -110.'
    : `The book's price implies ${pct(implied * 100, 1)}. Kelly uses your win percent, not that number.`

  if (!pack) {
    setResult(out, { hint: `${book} Add a bankroll and a win percent between 0 and 100.` })
    return
  }
  if (pack.noBet) {
    setResult(out, {
      hint: 'No edge at that win percent. Kelly says sit this one out.',
      warn: true,
    })
    return
  }
  setResult(out, {
    hint: book,
    rows: [
      { label: 'Stake', value: usd(pack.stake), tone: 'accent' },
      { label: 'Bankroll percent', value: pct(pack.usedFraction * 100, 2) },
      { label: 'Full Kelly', value: pct(pack.fullFraction * 100, 2) },
      { label: 'Fraction used', value: pct(Number(field(form, 'fraction')) * 100, 0) },
    ],
  })
})
