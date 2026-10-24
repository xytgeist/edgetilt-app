/**
 * Legal-books mode for fantasy card props. Kalshi / Polymarket stay as they are (the game hub shows them in every
 * state); a sportsbook consensus prop is rebuilt from only the books licensed in the viewer's state: the line most of
 * those books hang, their fair prices averaged. No licensed book there, no consensus prop.
 */
import { isLegalBook } from '../lounge/gameHub/gameHubLegalBooks.js'

export function legalConsensusProp(prop, state) {
  if (prop?.source !== 'consensus' || !state || !Array.isArray(prop.lines)) return prop
  let best = null
  for (const line of prop.lines) {
    const legal = (line.books || []).filter((b) => isLegalBook(b.key, state))
    if (!legal.length) continue
    const p = legal.reduce((a, b) => a + Number(b.p || 0), 0) / legal.length
    if (!best || legal.length > best.n || (legal.length === best.n && Math.abs(p - 0.5) < Math.abs(best.p - 0.5))) {
      best = { point: Number(line.point), p, n: legal.length }
    }
  }
  if (!best) return null
  const word = String(prop.label || '').replace(/^\d+\+\s*/, '')
  return {
    ...prop,
    label: `${Math.floor(best.point) + 1}+ ${word}`,
    price: Math.round(best.p * 100) / 100,
    no: Math.round((1 - best.p) * 100) / 100,
    volume: best.n,
  }
}

/** Cards for one sport with consensus props narrowed to `state`'s licensed books (unchanged when the mode is off). */
export function withLegalProps(cards, state) {
  if (!cards || !state) return cards
  const out = {}
  for (const [id, card] of Object.entries(cards)) {
    if (!card?.props?.some((p) => p?.source === 'consensus')) {
      out[id] = card
      continue
    }
    const props = card.props.map((p) => legalConsensusProp(p, state)).filter(Boolean)
    out[id] = { ...card, props, main_prop: props[0] || null }
  }
  return out
}
