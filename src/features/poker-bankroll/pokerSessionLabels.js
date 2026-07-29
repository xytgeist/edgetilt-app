/** Cash Game dropdown: New game… plus presets built from prior cash sessions. */
export const POKER_CASH_NEW_GAME_ID = 'new'

/** @param {string | null | undefined} name */
export function cashGamePresetIdFromName(name) {
  return `cg:${String(name || '').trim().toLowerCase()}`
}

/**
 * Unique cash games from session history (most recent first).
 * @param {Array<object>} sessions
 */
export function buildCashGamePresetsFromSessions(sessions) {
  const seen = new Map()
  for (const s of sessions || []) {
    if (s.session_type !== 'cash') continue
    const label = String(s.game_variant || '').trim()
    if (!label || label === 'custom' || label === 'other') continue
    const id = cashGamePresetIdFromName(label)
    if (seen.has(id)) continue
    seen.set(id, {
      id,
      label,
      limit_type: s.limit_type || 'no_limit',
      small_blind: s.small_blind != null ? String(s.small_blind) : '',
      big_blind: s.big_blind != null ? String(s.big_blind) : '',
      third_blind: s.third_blind != null ? String(s.third_blind) : '',
      ante: s.ante != null ? String(s.ante) : '',
    })
  }
  return [...seen.values()]
}

/** @param {Array<{ id: string, label: string }>} presets */
export function cashGameSelectOptions(presets) {
  return [
    { id: POKER_CASH_NEW_GAME_ID, label: 'New game…' },
    ...(presets || []).map((p) => ({ id: p.id, label: p.label })),
  ]
}

/** Apply a saved cash game (or clear for New game…). */
export function applyCashGamePreset(form, preset) {
  if (!preset) {
    return {
      ...form,
      cash_game_pick: POKER_CASH_NEW_GAME_ID,
      game_variant: 'custom',
      game_custom_name: '',
      limit_type: 'no_limit',
      small_blind: '',
      big_blind: '',
      third_blind: '',
      ante: '',
    }
  }
  return {
    ...form,
    cash_game_pick: preset.id,
    game_variant: 'custom',
    game_custom_name: preset.label,
    limit_type: preset.limit_type || 'no_limit',
    small_blind: preset.small_blind ?? '',
    big_blind: preset.big_blind ?? '',
    third_blind: preset.third_blind ?? '',
    ante: preset.ante ?? '',
  }
}

/** Default cash Game pick to most recent preset when opening a sheet. */
export function formWithDefaultCashGame(baseForm, presets) {
  const list = presets || []
  if (baseForm.session_type !== 'cash' || list.length === 0) {
    return { ...baseForm, cash_game_pick: POKER_CASH_NEW_GAME_ID }
  }
  return applyCashGamePreset(baseForm, list[0])
}

/** Labels for legacy cash game_variant ids (display / edit hydrate). */
export const POKER_GAME_VARIANTS = [
  { id: 'nlh', label: "Hold'em" },
  { id: 'plo', label: 'Omaha' },
  { id: 'plo5', label: 'PLO5' },
  { id: 'mixed', label: 'Mix' },
  { id: 'custom', label: 'New game…' },
]

/** Tournament Game dropdown (prefilled variants). */
export const POKER_TOURNAMENT_GAME_VARIANTS = [
  { id: 'nlh', label: 'NLH' },
  { id: 'limit_holdem', label: "Limit Hold'em" },
  { id: 'plo', label: 'PLO' },
  { id: 'plo8', label: 'PLO8' },
  { id: 'mixed', label: 'Mix' },
  { id: 'custom', label: 'New game…' },
]

export const POKER_KNOWN_GAME_IDS = new Set([
  'nlh',
  'plo',
  'plo5',
  'plo8',
  'limit_holdem',
  'mixed',
])

export const POKER_LIMIT_TYPES = [
  { id: 'no_limit', label: 'No Limit' },
  { id: 'pot_limit', label: 'Pot Limit' },
  { id: 'spread_limit', label: 'Spread Limit' },
  { id: 'limit', label: 'Limit' },
  { id: 'mixed', label: 'Mix' },
]

export const POKER_TABLE_SIZES = [
  { id: 'full_ring', label: 'Full-ring' },
  { id: '6max', label: '6-max' },
  { id: 'heads_up', label: 'HU' },
]

/** Free-text Site when the room isn’t in the known list. */
export const POKER_ONLINE_OTHER_SITE_ID = 'other'

/** Known online card rooms for the Site dropdown (stored as label in venue_name). */
export const POKER_ONLINE_SITES = [
  { id: 'pokerstars', label: 'PokerStars' },
  { id: 'ggpoker', label: 'GGPoker' },
  { id: 'wsop', label: 'WSOP.com' },
  { id: 'clubwpt', label: 'ClubWPT' },
  { id: 'wpt-global', label: 'WPT Global' },
  { id: 'acr', label: 'ACR' },
  { id: 'ignition', label: 'Ignition' },
  { id: 'bovada', label: 'Bovada' },
  { id: 'betonline', label: 'BetOnline' },
  { id: '888poker', label: '888poker' },
  { id: 'partypoker', label: 'partypoker' },
  { id: 'unibet', label: 'Unibet' },
  { id: 'winamax', label: 'Winamax' },
  { id: 'betmgm', label: 'BetMGM Poker' },
  { id: 'draftkings', label: 'DraftKings Poker' },
  { id: 'fanduel', label: 'FanDuel Poker' },
  { id: 'coinpoker', label: 'CoinPoker' },
  { id: 'clubgg', label: 'ClubGG' },
  { id: 'pppoker', label: 'PPPoker' },
  { id: 'pokerbros', label: 'PokerBROS' },
  { id: 'upoker', label: 'Upoker' },
  { id: 'kkpoker', label: 'KKPoker' },
  { id: 'xpoker', label: 'X-Poker' },
  { id: 'global-poker', label: 'Global Poker' },
  { id: 'tigergaming', label: 'TigerGaming' },
  { id: 'pokerking', label: 'PokerKing' },
  { id: 'blackchip', label: 'BlackChip Poker' },
  { id: 'juicystakes', label: 'Juicy Stakes' },
  { id: 'intertops', label: 'Intertops' },
  { id: 'luxon', label: 'Luxon Poker' },
  { id: 'revolution', label: 'Revolution' },
  { id: 'swc', label: 'SwC Poker' },
]

/** @returns {{ id: string, label: string }[]} */
export function pokerOnlineSiteSelectOptions() {
  return [
    { id: '', label: 'Select site…' },
    ...POKER_ONLINE_SITES,
    { id: POKER_ONLINE_OTHER_SITE_ID, label: 'Other…' },
  ]
}

/** Map stored venue_name → Select value. */
export function pokerOnlineSiteSelectValue(venueName) {
  const raw = String(venueName || '').trim()
  if (!raw) return ''
  const hit = POKER_ONLINE_SITES.find((s) => s.label.toLowerCase() === raw.toLowerCase())
  return hit ? hit.id : POKER_ONLINE_OTHER_SITE_ID
}

/** @param {string} siteId */
export function pokerOnlineSiteLabelFromId(siteId) {
  const hit = POKER_ONLINE_SITES.find((s) => s.id === siteId)
  return hit?.label || ''
}

/**
 * Most recent online session site (sessions expected newest-first).
 * @param {Array<object>} sessions
 * @returns {{ venue_name: string, online_site_pick: string } | null}
 */
export function lastOnlineSiteFromSessions(sessions) {
  for (const s of sessions || []) {
    if (s?.venue_kind !== 'online') continue
    const name = String(s.venue_name || '').trim()
    if (!name) continue
    return {
      venue_name: name,
      online_site_pick: pokerOnlineSiteSelectValue(name),
    }
  }
  return null
}

/** @param {'cash' | 'tournament' | string | null | undefined} sessionType */
export function pokerGameOptionsForSessionType(sessionType) {
  return sessionType === 'tournament' ? POKER_TOURNAMENT_GAME_VARIANTS : POKER_CASH_GAME_TYPE_OPTIONS
}

/** @param {string | null | undefined} id @param {{ id: string, label: string }[]} list */
function labelFrom(id, list) {
  const hit = list.find((x) => x.id === id)
  return hit?.label || ''
}

/** Free-text / display name for a stored game_variant. */
export function pokerCashGameNameFromStored(stored) {
  const raw = String(stored || '').trim()
  if (!raw || raw === 'custom' || raw === 'other') return ''
  if (POKER_KNOWN_GAME_IDS.has(raw)) {
    return (
      labelFrom(raw, POKER_TOURNAMENT_GAME_VARIANTS) ||
      labelFrom(raw, POKER_GAME_VARIANTS) ||
      raw
    )
  }
  return raw
}

function gameLabel(stored) {
  return pokerCashGameNameFromStored(stored)
}

/** Resolve stored game_variant to select id + optional custom / cash name. */
export function pokerGamePickFromStored(stored, sessionType = 'cash') {
  const raw = String(stored || '').trim()
  if (sessionType === 'cash') {
    return {
      game_variant: 'custom',
      game_custom_name: pokerCashGameNameFromStored(raw),
    }
  }
  if (!raw || POKER_KNOWN_GAME_IDS.has(raw)) {
    return { game_variant: raw || 'nlh', game_custom_name: '' }
  }
  if (raw === 'custom' || raw === 'other') {
    return { game_variant: 'custom', game_custom_name: '' }
  }
  return { game_variant: 'custom', game_custom_name: raw }
}

/** Persist select + optional New game… / cash name into game_variant text. */
export function pokerGameVariantToStored(sessionType, gameVariant, gameCustomName) {
  if (sessionType === 'cash' || gameVariant === 'custom') {
    const name = String(gameCustomName || '').trim()
    return name || 'custom'
  }
  return gameVariant || 'nlh'
}

/**
 * When switching Cash ↔ Tournament, cash always uses New game…;
 * tournament keeps a shared id or falls back to NLH.
 */
export function coercePokerGameForSessionType(sessionType, gameVariant) {
  if (sessionType === 'cash') return 'custom'
  const options = pokerGameOptionsForSessionType(sessionType)
  if (options.some((o) => o.id === gameVariant)) return gameVariant
  return 'nlh'
}

/** Compact stakes line for list cards. */
export function pokerSessionStakesLabel(session) {
  if (!session) return 'Session'
  if (session.session_type === 'tournament') {
    const bi = Number(session.buy_in)
    const biStr = Number.isFinite(bi) ? `$${bi % 1 === 0 ? bi.toFixed(0) : bi.toFixed(2)}` : ''
    const name = String(session.tournament_name || '').trim()
    const game = gameLabel(session.game_variant)
    if (name && biStr) return `${biStr} · ${name}`
    if (name) return name
    if (biStr && game) return `${biStr} · ${game}`
    if (biStr) return `${biStr} buy-in`
    return game || 'Tournament'
  }
  const sb = Number(session.small_blind)
  const bb = Number(session.big_blind)
  const game = gameLabel(session.game_variant)
  if (Number.isFinite(sb) && Number.isFinite(bb) && sb > 0 && bb > 0) {
    const fmt = (n) => (n % 1 === 0 ? String(n) : n.toFixed(2))
    // Prefer free-text game name ("2/5 NLH"); fall back to blinds + name
    if (game) return game
    return `$${fmt(sb)}/$${fmt(bb)}`
  }
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
