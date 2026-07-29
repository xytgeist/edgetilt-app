export const POKER_GAME_VARIANTS = [
  { id: 'nlh', label: 'NL Hold\'em' },
  { id: 'plo', label: 'PLO' },
  { id: 'plo5', label: 'PLO5' },
  { id: 'mixed', label: 'Mixed' },
  { id: 'other', label: 'Other' },
]

export const POKER_LIMIT_TYPES = [
  { id: 'no_limit', label: 'No Limit' },
  { id: 'pot_limit', label: 'Pot Limit' },
  { id: 'limit', label: 'Limit' },
]

export const POKER_TABLE_SIZES = [
  { id: 'heads_up', label: 'Heads-up' },
  { id: '6max', label: '6-max' },
  { id: 'full_ring', label: 'Full ring' },
]

/** @param {string | null | undefined} id @param {{ id: string, label: string }[]} list */
function labelFrom(id, list) {
  const hit = list.find((x) => x.id === id)
  return hit?.label || ''
}

/** Compact stakes line for list cards. */
export function pokerSessionStakesLabel(session) {
  if (!session) return 'Session'
  if (session.session_type === 'tournament') {
    const bi = Number(session.buy_in)
    const biStr = Number.isFinite(bi) ? `$${bi % 1 === 0 ? bi.toFixed(0) : bi.toFixed(2)}` : ''
    const name = String(session.tournament_name || '').trim()
    if (name && biStr) return `${biStr} · ${name}`
    if (name) return name
    if (biStr) return `${biStr} buy-in`
    return 'Tournament'
  }
  const sb = Number(session.small_blind)
  const bb = Number(session.big_blind)
  if (Number.isFinite(sb) && Number.isFinite(bb) && sb > 0 && bb > 0) {
    const fmt = (n) => (n % 1 === 0 ? String(n) : n.toFixed(2))
    const game = labelFrom(session.game_variant, POKER_GAME_VARIANTS)
    return game ? `$${fmt(sb)}/${fmt(bb)} ${game}` : `$${fmt(sb)}/$${fmt(bb)}`
  }
  const game = labelFrom(session.game_variant, POKER_GAME_VARIANTS)
  return game || 'Cash game'
}

/** @param {object} session */
export function pokerSessionMetaLine(session) {
  const bits = []
  bits.push(session.session_type === 'tournament' ? 'Tourney' : 'Cash')
  bits.push(session.venue_kind === 'online' ? 'Online' : 'Live')
  if (session.venue_name) bits.push(String(session.venue_name))
  return bits.join(' · ')
}
