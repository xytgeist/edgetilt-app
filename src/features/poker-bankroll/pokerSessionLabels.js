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

/** Live cash “Game name” options when Game = New game… */
export const POKER_LIVE_CASH_GAME_CUSTOM_ID = 'custom_name'

export const POKER_LIVE_CASH_GAME_NAMES = [
  { id: 'holdem', label: "Hold'em" },
  { id: 'omaha', label: 'Omaha' },
  { id: 'omaha5', label: 'Omaha 5' },
  { id: 'omaha6', label: 'Omaha 6' },
  { id: 'short_deck', label: 'Short Deck (6+)' },
  { id: 'stud', label: 'Stud' },
  { id: 'draw', label: 'Draw' },
  { id: 'mixed', label: 'Mixed' },
  { id: 'ofc', label: 'Chinese Poker / OFC' },
  { id: POKER_LIVE_CASH_GAME_CUSTOM_ID, label: 'Custom' },
]

/** @param {string | null | undefined} name */
export function pokerLiveCashGameNameSelectValue(name) {
  const raw = String(name || '').trim()
  if (!raw) return 'holdem'
  const hit = POKER_LIVE_CASH_GAME_NAMES.find(
    (g) => g.id !== POKER_LIVE_CASH_GAME_CUSTOM_ID && g.label.toLowerCase() === raw.toLowerCase(),
  )
  return hit ? hit.id : POKER_LIVE_CASH_GAME_CUSTOM_ID
}

/** @param {string} id */
export function pokerLiveCashGameNameLabelFromId(id) {
  if (id === POKER_LIVE_CASH_GAME_CUSTOM_ID) return ''
  const hit = POKER_LIVE_CASH_GAME_NAMES.find((g) => g.id === id)
  return hit?.label || ''
}

/**
 * Collapse stake/format variants into a Games-card family label.
 * e.g. "2/5 NLH", "100NL" → "NLH"; "5/10 PLO", "100PLO" → "PLO";
 * Omaha 5 → PLO5; Omaha 6 → PLO6; Omaha Hi/Lo / 8-or-better → Omaha Hi/Lo.
 * @param {string | null | undefined} rawName
 * @returns {string | null} family label, or null if empty / unknown bucket
 */
export function pokerGameFamilyLabel(rawName) {
  const raw = String(rawName || '').trim()
  if (!raw || raw === 'custom' || raw === 'other') return null

  const s = raw
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  // Legacy stored ids
  if (s === 'nlh' || s === 'nlhe') return 'NLH'
  if (s === 'limit_holdem') return "Limit Hold'em"
  if (s === 'plo') return 'PLO'
  if (s === 'plo5') return 'PLO5'
  if (s === 'plo6') return 'PLO6'
  if (s === 'plo8') return 'Omaha Hi/Lo'
  if (s === 'mixed' || s === 'mix') return 'Mixed'

  if (/\bofc\b/.test(s) || /chinese\s*poker/.test(s) || /open\s*face/.test(s)) return 'OFC'

  if (/short\s*deck/.test(s) || /\b6\+\b/.test(s) || /\bsd\b/.test(s)) return 'Short Deck'

  // Omaha Hi/Lo (8-or-better) — before PLO5 / PLO6 / plain PLO
  if (
    /\bplo\s*8\b/.test(s) ||
    /\bplo8\b/.test(s) ||
    /\bo8\b/.test(s) ||
    /\bomaha\s*8\b/.test(s) ||
    /\bomaha\s*8\s*or\s*better\b/.test(s) ||
    /\b8\s*or\s*better\b/.test(s) ||
    /\b8ob\b/.test(s) ||
    /\bomaha\s*hi[\s/-]*lo\b/.test(s) ||
    /\bomaha\s*h\s*\/\s*l\b/.test(s) ||
    (/\b(omaha|plo)\b/.test(s) && /hi[\s/-]*lo|\bh\/l\b|\bhl\b/.test(s))
  ) {
    return 'Omaha Hi/Lo'
  }

  // PLO5 / Omaha 5 (incl. Big O) — blinds ignored
  if (
    /\bplo\s*5\b/.test(s) ||
    /\bplo5\b/.test(s) ||
    /\bomaha\s*5\b/.test(s) ||
    /\bbig\s*o\b/.test(s) ||
    /\bo5\b/.test(s)
  ) {
    return 'PLO5'
  }

  // PLO6 / Omaha 6 — blinds ignored
  if (/\bplo\s*6\b/.test(s) || /\bplo6\b/.test(s) || /\bomaha\s*6\b/.test(s) || /\bo6\b/.test(s)) {
    return 'PLO6'
  }

  // Plain PLO / Omaha (any blinds, pot-limit omaha, 100PLO, etc.)
  if (
    /\bpot\s*limit\s*omaha\b/.test(s) ||
    /\bplo\b/.test(s) ||
    /\bomaha\b/.test(s) ||
    /\b\d+\s*plo\b/.test(s)
  ) {
    return 'PLO'
  }

  if (/\bstud\b/.test(s)) return 'Stud'

  if (/\bdraw\b/.test(s) || /\b2[\s-]*7\b/.test(s) || /\bbadeuce\b/.test(s)) return 'Draw'

  if (
    /\bmixed\b/.test(s) ||
    /\bmix\b/.test(s) ||
    /\bhorse\b/.test(s) ||
    /\b8[\s-]*game\b/.test(s) ||
    /\bdealers?\s*choice\b/.test(s)
  ) {
    return 'Mixed'
  }

  // NLH before Limit Hold'em so "No Limit Hold'em" is not misread as Limit
  if (
    /\bnlhe?\b/.test(s) ||
    /\bno\s*limit\s*hold/.test(s) ||
    /\bnl\s*texas/.test(s) ||
    /\btexas\s*hold/.test(s) ||
    /\b\d+\s*nl\b/.test(s) ||
    /\bnl\s*\d+\b/.test(s)
  ) {
    return 'NLH'
  }

  if (/(?<!\bno\s)limit\s*hold/.test(s) || /\blhe\b/.test(s) || /\bfl\s*hold/.test(s)) {
    return "Limit Hold'em"
  }

  if (/\bhold\s*ems?\b/.test(s) || /\bholdem\b/.test(s) || s === 'hold em') return 'NLH'

  return raw
}

/** Apply a saved cash game (or clear for New game…). */
export function applyCashGamePreset(form, preset) {
  if (!preset) {
    return {
      ...form,
      cash_game_pick: POKER_CASH_NEW_GAME_ID,
      game_variant: 'custom',
      live_game_name_pick: 'holdem',
      game_custom_name: "Hold'em",
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
    live_game_name_pick: pokerLiveCashGameNameSelectValue(preset.label),
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

/** Known online card rooms for the Site dropdown (stored as label in venue_name). */
export const POKER_ONLINE_SITES = [
  { id: 'pokerstars', label: 'PokerStars' },
  { id: 'ggpoker', label: 'GGPoker' },
  { id: 'wsop', label: 'WSOP.com' },
  { id: 'clubwpt', label: 'ClubWPT' },
  { id: 'clubwpt-gold', label: 'ClubWPT Gold' },
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
  return [{ id: '', label: 'Select site…' }, ...POKER_ONLINE_SITES]
}

/** Map stored venue_name → Select value ('' if not in known list). */
export function pokerOnlineSiteSelectValue(venueName) {
  const raw = String(venueName || '').trim()
  if (!raw) return ''
  const hit = POKER_ONLINE_SITES.find((s) => s.label.toLowerCase() === raw.toLowerCase())
  return hit ? hit.id : ''
}

/** @param {string} siteId */
export function pokerOnlineSiteLabelFromId(siteId) {
  const hit = POKER_ONLINE_SITES.find((s) => s.id === siteId)
  return hit?.label || ''
}

/**
 * Most recent known online site (sessions expected newest-first).
 * Skips rooms that aren’t in POKER_ONLINE_SITES.
 * @param {Array<object>} sessions
 * @returns {{ venue_name: string, online_site_pick: string } | null}
 */
export function lastOnlineSiteFromSessions(sessions) {
  for (const s of sessions || []) {
    if (s?.venue_kind !== 'online') continue
    const name = String(s.venue_name || '').trim()
    if (!name) continue
    const pick = pokerOnlineSiteSelectValue(name)
    if (!pick) continue
    return { venue_name: pokerOnlineSiteLabelFromId(pick), online_site_pick: pick }
  }
  return null
}

/** Known club apps for the Club dropdown (stored as label in venue_name). */
export const POKER_CLUB_APPS = [
  { id: 'pppoker', label: 'PPPoker' },
  { id: 'clubgg', label: 'ClubGG' },
  { id: 'pokerbros', label: 'PokerBros' },
  { id: 'xpoker', label: 'X-Poker' },
  { id: 'suprema', label: 'Suprema Poker' },
  { id: 'pokerrrr2', label: 'Pokerrrr 2' },
  { id: 'qqpoker', label: 'QQPoker' },
  { id: 'wpt-home', label: 'WPT Home' },
]

/** @returns {{ id: string, label: string }[]} */
export function pokerClubAppSelectOptions() {
  return [{ id: '', label: 'Select club…' }, ...POKER_CLUB_APPS]
}

/** Map stored venue_name → Select value ('' if not in known list). */
export function pokerClubAppSelectValue(venueName) {
  const raw = String(venueName || '').trim()
  if (!raw) return ''
  const hit = POKER_CLUB_APPS.find((s) => s.label.toLowerCase() === raw.toLowerCase())
  return hit ? hit.id : ''
}

/** @param {string} clubId */
export function pokerClubAppLabelFromId(clubId) {
  const hit = POKER_CLUB_APPS.find((s) => s.id === clubId)
  return hit?.label || ''
}

/**
 * Most recent known club app (sessions expected newest-first).
 * @param {Array<object>} sessions
 * @returns {{ venue_name: string, club_app_pick: string } | null}
 */
export function lastClubAppFromSessions(sessions) {
  for (const s of sessions || []) {
    if (s?.venue_kind !== 'club') continue
    const name = String(s.venue_name || '').trim()
    if (!name) continue
    const pick = pokerClubAppSelectValue(name)
    if (!pick) continue
    return { venue_name: pokerClubAppLabelFromId(pick), club_app_pick: pick }
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
  bits.push(
    session.venue_kind === 'online' ? 'Online' : session.venue_kind === 'club' ? 'Club' : 'Live',
  )
  if (session.venue_name) bits.push(String(session.venue_name))
  return bits.join(' · ')
}
