import { clvLinePoints, clvPricePoints } from '../../features/sports-bet-tracker/sportsBetCalcMath.js'
import { field, setResult, wire } from './bind.js'

const form = document.querySelector('[data-calc]')
const out = document.querySelector('[data-out]')

function signedPts(n, digits) {
  const x = Number(n)
  if (!Number.isFinite(x)) return 'n/a'
  const sign = x > 0 ? '+' : ''
  return `${sign}${x.toFixed(digits)} pts`
}

function toneFor(n) {
  if (n > 0) return 'good'
  if (n < 0) return 'bad'
  return ''
}

function verdict(n) {
  if (n > 0) return 'You beat the close.'
  if (n < 0) return 'The close beat your number.'
  return 'Same number as the close. That is not a beat.'
}

wire(form, () => {
  const market = field(form, 'market')
  for (const panel of form.querySelectorAll('[data-market-panel]')) {
    panel.hidden = panel.getAttribute('data-market-panel') !== market
  }

  if (market === 'price') {
    const pts = clvPricePoints(field(form, 'betOdds'), field(form, 'closeOdds'))
    if (pts == null) {
      setResult(out, { hint: 'Enter the price you bet and the closing price.' })
      return
    }
    setResult(out, {
      hint: `${verdict(pts)} Price CLV is probability points, not the spread points stored on a bet.`,
      rows: [{ label: 'Price CLV', value: signedPts(pts, 2), tone: toneFor(pts) }],
    })
    return
  }

  const pts = market === 'total'
    ? clvLinePoints('total', field(form, 'side'), field(form, 'totalLine'), field(form, 'totalClose'))
    : clvLinePoints('spread', '', field(form, 'spreadLine'), field(form, 'spreadClose'))

  if (pts == null) {
    setResult(out, { hint: 'Enter your number and the close.' })
    return
  }
  setResult(out, {
    hint: verdict(pts),
    rows: [{ label: 'Line CLV', value: signedPts(pts, 1), tone: toneFor(pts) }],
  })
})
