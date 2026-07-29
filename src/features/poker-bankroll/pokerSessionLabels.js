/** Cash Game dropdown: New game… plus defaults + user-created stake/game labels. */
export const POKER_CASH_NEW_GAME_ID = 'new'

/** @param {string | null | undefined} name */
export function cashGamePresetIdFromName(name) {
  return `cg:${String(name || '').trim().toLowerCase()}`
}

/**
 * Live cash Game defaults (blinds + family).
 * @type {Array<{ label: string, small_blind: string, big_blind: string, third_blind: string, limit_type: string, family: string }>}
 */
export const POKER_DEFAULT_CASH_GAMES_LIVE = [
  { label: '1/2 NLH', small_blind: '1', big_blind: '2', third_blind: '', limit_type: 'no_limit', family: 'NLH' },
  { label: '1/3 NLH', small_blind: '1', big_blind: '3', third_blind: '', limit_type: 'no_limit', family: 'NLH' },
  { label: '2/5 NLH', small_blind: '2', big_blind: '5', third_blind: '', limit_type: 'no_limit', family: 'NLH' },
  { label: '5/10 NLH', small_blind: '5', big_blind: '10', third_blind: '', limit_type: 'no_limit', family: 'NLH' },
  { label: '5/10/20 NLH', small_blind: '5', big_blind: '10', third_blind: '20', limit_type: 'no_limit', family: 'NLH' },
  { label: '10/20 NLH', small_blind: '10', big_blind: '20', third_blind: '', limit_type: 'no_limit', family: 'NLH' },
  { label: '25/50 NLH', small_blind: '25', big_blind: '50', third_blind: '', limit_type: 'no_limit', family: 'NLH' },
  { label: '1/2 PLO', small_blind: '1', big_blind: '2', third_blind: '', limit_type: 'pot_limit', family: 'PLO' },
  { label: '1/2/5 PLO', small_blind: '1', big_blind: '2', third_blind: '5', limit_type: 'pot_limit', family: 'PLO' },
  { label: '2/5 PLO', small_blind: '2', big_blind: '5', third_blind: '', limit_type: 'pot_limit', family: 'PLO' },
  { label: '5/10 PLO', small_blind: '5', big_blind: '10', third_blind: '', limit_type: 'pot_limit', family: 'PLO' },
  { label: '5/10/20 PLO', small_blind: '5', big_blind: '10', third_blind: '20', limit_type: 'pot_limit', family: 'PLO' },
  { label: '10/20 PLO', small_blind: '10', big_blind: '20', third_blind: '', limit_type: 'pot_limit', family: 'PLO' },
  { label: '25/50 PLO', small_blind: '25', big_blind: '50', third_blind: '', limit_type: 'pot_limit', family: 'PLO' },
]

/** @deprecated use POKER_DEFAULT_CASH_GAMES_LIVE */
export const POKER_DEFAULT_CASH_GAMES = POKER_DEFAULT_CASH_GAMES_LIVE

/**
 * Club cash Game defaults (micro → mid blinds + family).
 * @type {Array<{ label: string, small_blind: string, big_blind: string, third_blind: string, limit_type: string, family: string }>}
 */
export const POKER_DEFAULT_CASH_GAMES_CLUB = [
  { label: '0.10/0.25 NLH', small_blind: '0.10', big_blind: '0.25', third_blind: '', limit_type: 'no_limit', family: 'NLH' },
  { label: '0.25/0.50 NLH', small_blind: '0.25', big_blind: '0.50', third_blind: '', limit_type: 'no_limit', family: 'NLH' },
  { label: '0.50/1 NLH', small_blind: '0.50', big_blind: '1', third_blind: '', limit_type: 'no_limit', family: 'NLH' },
  { label: '1/2 NLH', small_blind: '1', big_blind: '2', third_blind: '', limit_type: 'no_limit', family: 'NLH' },
  { label: '2/5 NLH', small_blind: '2', big_blind: '5', third_blind: '', limit_type: 'no_limit', family: 'NLH' },
  { label: '5/10 NLH', small_blind: '5', big_blind: '10', third_blind: '', limit_type: 'no_limit', family: 'NLH' },
  { label: '0.10/0.25 PLO', small_blind: '0.10', big_blind: '0.25', third_blind: '', limit_type: 'pot_limit', family: 'PLO' },
  { label: '0.25/0.50 PLO', small_blind: '0.25', big_blind: '0.50', third_blind: '', limit_type: 'pot_limit', family: 'PLO' },
  { label: '0.50/1 PLO', small_blind: '0.50', big_blind: '1', third_blind: '', limit_type: 'pot_limit', family: 'PLO' },
  { label: '1/2 PLO', small_blind: '1', big_blind: '2', third_blind: '', limit_type: 'pot_limit', family: 'PLO' },
  { label: '2/5 PLO', small_blind: '2', big_blind: '5', third_blind: '', limit_type: 'pot_limit', family: 'PLO' },
  { label: '5/10 PLO', small_blind: '5', big_blind: '10', third_blind: '', limit_type: 'pot_limit', family: 'PLO' },
]

/**
 * Online stake buy-in → blinds (25NL / PLO25 share blinds, etc.).
 * @type {Record<number, { small_blind: string, big_blind: string }>}
 */
export const POKER_ONLINE_STAKE_BLINDS = {
  25: { small_blind: '0.10', big_blind: '0.25' },
  50: { small_blind: '0.25', big_blind: '0.50' },
  100: { small_blind: '0.50', big_blind: '1' },
  200: { small_blind: '1', big_blind: '2' },
  500: { small_blind: '2.50', big_blind: '5' },
  1000: { small_blind: '5', big_blind: '10' },
}

/**
 * Online cash Game defaults (25NL / PLO25 notation).
 * @type {Array<{ label: string, small_blind: string, big_blind: string, third_blind: string, limit_type: string, family: string }>}
 */
export const POKER_DEFAULT_CASH_GAMES_ONLINE = (() => {
  const buyins = [25, 50, 100, 200, 500, 1000]
  const nlh = buyins.map((buyin) => {
    const blinds = POKER_ONLINE_STAKE_BLINDS[buyin]
    return {
      label: `${buyin}NL`,
      small_blind: blinds.small_blind,
      big_blind: blinds.big_blind,
      third_blind: '',
      limit_type: 'no_limit',
      family: 'NLH',
    }
  })
  const plo = buyins.map((buyin) => {
    const blinds = POKER_ONLINE_STAKE_BLINDS[buyin]
    return {
      label: `PLO${buyin}`,
      small_blind: blinds.small_blind,
      big_blind: blinds.big_blind,
      third_blind: '',
      limit_type: 'pot_limit',
      family: 'PLO',
    }
  })
  return [...nlh, ...plo]
})()

/** @param {string | null | undefined} venueKind */
export function defaultCashGamesForVenue(venueKind) {
  if (venueKind === 'online') return POKER_DEFAULT_CASH_GAMES_ONLINE
  if (venueKind === 'club') return POKER_DEFAULT_CASH_GAMES_CLUB
  return POKER_DEFAULT_CASH_GAMES_LIVE
}

/** @param {string | null | undefined} family */
export function cashFamilyToLiveGamePick(family) {
  switch (String(family || '').trim()) {
    case 'NLH':
    case 'PLH':
    case 'LHE':
    case "Limit Hold'em":
      return 'holdem'
    case 'PLO':
      return 'omaha'
    case 'PLO5':
      return 'omaha5'
    case 'PLO6':
      return 'omaha6'
    case 'Mix':
    case 'Mixed':
      return 'mixed'
    case 'SD':
    case 'Short Deck':
      return 'short_deck'
    case 'Stud':
      return 'stud'
    case 'Draw':
      return 'draw'
    case 'OFC':
      return 'ofc'
    default:
      return null
  }
}

/** @param {string | null | undefined} family */
export function cashFamilyToLimitType(family) {
  switch (String(family || '').trim()) {
    case 'PLO':
    case 'PLO5':
    case 'PLO6':
    case 'PLO8':
    case 'PLH':
      return 'pot_limit'
    case 'Mix':
    case 'Mixed':
      return 'mixed'
    case 'LHE':
    case "Limit Hold'em":
      return 'limit'
    default:
      return 'no_limit'
  }
}

/** Format a blind amount for stake labels (.25/.50 not 0.25/0.50; 2 not 2.00). */
export function formatCashBlindPart(value) {
  if (value == null || value === '') return null
  const raw = String(value).trim()
  const num = Number(raw)
  if (!Number.isFinite(num) || num <= 0) return null
  if (/^\d+$/.test(raw)) return String(parseInt(raw, 10))
  // Preserve typed decimals; 0.50 → .50, .50 → .50
  if (/^0\.\d+$/.test(raw)) return raw.slice(1)
  if (/^\.\d+$/.test(raw)) return raw
  if (/^\d+\.\d+$/.test(raw)) return raw
  if (Number.isInteger(num)) return String(num)
  const s = String(num)
  return s.startsWith('0.') ? s.slice(1) : s
}

/**
 * Family abbrev from Limit + Game name (any combo, not a fixed allowlist).
 * Hold'em uses limit: NLH / PLH / LHE. Omaha picks → PLO / PLO5 / PLO6.
 * @param {{ live_game_name_pick?: string, game_custom_name?: string, limit_type?: string }} form
 */
export function cashGameFamilyAbbrev(form) {
  const pick = form?.live_game_name_pick || 'holdem'
  const limit = form?.limit_type || 'no_limit'
  switch (pick) {
    case 'holdem':
      if (limit === 'pot_limit') return 'PLH'
      if (limit === 'limit' || limit === 'spread_limit') return 'LHE'
      return 'NLH'
    case 'omaha':
      return 'PLO'
    case 'omaha5':
      return 'PLO5'
    case 'omaha6':
      return 'PLO6'
    case 'short_deck':
      return 'SD'
    case 'stud':
      return 'Stud'
    case 'draw':
      return 'Draw'
    case 'mixed':
      return 'Mix'
    case 'ofc':
      return 'OFC'
    case 'custom_name': {
      const custom = String(form?.game_custom_name || '').trim()
      if (!custom) return 'Custom'
      const fam = pokerGameFamilyLabel(custom)
      if (fam === 'Mixed') return 'Mix'
      if (fam === 'Short Deck') return 'SD'
      if (fam === "Limit Hold'em") return 'LHE'
      if (fam === 'Omaha Hi/Lo') return 'PLO8'
      if (fam && fam !== custom) return fam
      return custom
    }
    default:
      return 'NLH'
  }
}

/** Match blinds to an online buy-in stake (25 / 50 / …). */
export function onlineBuyinFromBlinds(smallBlind, bigBlind) {
  const sb = Number(smallBlind)
  const bb = Number(bigBlind)
  if (!Number.isFinite(sb) || !Number.isFinite(bb)) return null
  for (const [buyinRaw, blinds] of Object.entries(POKER_ONLINE_STAKE_BLINDS)) {
    if (Number(blinds.small_blind) === sb && Number(blinds.big_blind) === bb) {
      return Number(buyinRaw)
    }
  }
  return null
}

/**
 * Compose stake/game label from whatever blinds + limit + game the user entered.
 * Live/Club: `{sb}/{bb}[/{3rd}] {family}`. Online NLH/PLO: `25NL` / `PLO25` when blinds match.
 * @param {{ live_game_name_pick?: string, game_custom_name?: string, limit_type?: string, venue_kind?: string, small_blind?: string|number, big_blind?: string|number, third_blind?: string|number|null }} form
 * @returns {string | null}
 */
export function formatCashGameLabel(form) {
  const family = cashGameFamilyAbbrev(form)
  if (!family) return null
  const hasThird = form?.third_blind != null && String(form.third_blind).trim() !== ''
  if (
    form?.venue_kind === 'online' &&
    !hasThird &&
    (family === 'NLH' || family === 'PLO')
  ) {
    const buyin = onlineBuyinFromBlinds(form.small_blind, form.big_blind)
    if (buyin != null) return family === 'PLO' ? `PLO${buyin}` : `${buyin}NL`
  }
  const parts = [form?.small_blind, form?.big_blind, form?.third_blind]
    .map(formatCashBlindPart)
    .filter(Boolean)
  if (parts.length < 2) return null
  return `${parts.join('/')} ${family}`
}

/**
 * Parse "2/5/10 PLO", "25NL", "PLO100" → blinds + family.
 * @param {string | null | undefined} label
 */
export function parseCashGameLabel(label) {
  const raw = String(label || '').trim()
  if (!raw) return null

  const onlineNl = raw.match(/^(\d+)\s*nl$/i)
  if (onlineNl) {
    const buyin = Number(onlineNl[1])
    const blinds = POKER_ONLINE_STAKE_BLINDS[buyin]
    if (blinds) {
      return {
        label: `${buyin}NL`,
        small_blind: blinds.small_blind,
        big_blind: blinds.big_blind,
        third_blind: '',
        family: 'NLH',
        limit_type: 'no_limit',
        live_game_name_pick: 'holdem',
      }
    }
  }

  const onlinePlo = raw.match(/^plo\s*(\d+)$/i)
  if (onlinePlo) {
    const buyin = Number(onlinePlo[1])
    const blinds = POKER_ONLINE_STAKE_BLINDS[buyin]
    if (blinds) {
      return {
        label: `PLO${buyin}`,
        small_blind: blinds.small_blind,
        big_blind: blinds.big_blind,
        third_blind: '',
        family: 'PLO',
        limit_type: 'pot_limit',
        live_game_name_pick: 'omaha',
      }
    }
  }

  const m = raw.match(/^(\d*\.?\d+(?:\/\d*\.?\d+){1,2})\s+(.+)$/)
  if (!m) return null
  const blindParts = m[1].split('/')
  const family = m[2].trim()
  if (!family) return null
  return {
    label: raw,
    small_blind: blindParts[0] || '',
    big_blind: blindParts[1] || '',
    third_blind: blindParts[2] || '',
    family,
    limit_type: cashFamilyToLimitType(family),
    live_game_name_pick: cashFamilyToLiveGamePick(family) || 'custom_name',
  }
}

/** @param {string | null | undefined} venueKind */
function defaultCashGamePresets(venueKind = 'live') {
  return defaultCashGamesForVenue(venueKind).map((d) => ({
    id: cashGamePresetIdFromName(d.label),
    label: d.label,
    limit_type: d.limit_type,
    small_blind: d.small_blind,
    big_blind: d.big_blind,
    third_blind: d.third_blind,
    ante: '',
    family: d.family,
    live_game_name_pick: cashFamilyToLiveGamePick(d.family) || 'holdem',
    isDefault: true,
  }))
}

/** Best stake/game label for a cash session row (formats legacy rows when possible). */
export function cashGameLabelFromSession(session) {
  const stored = String(session?.game_variant || '').trim()
  if (stored && stored !== 'custom' && stored !== 'other' && parseCashGameLabel(stored)) {
    return stored
  }
  const fromName = pokerCashGameNameFromStored(stored)
  const family =
    pokerGameFamilyLabel(stored) || pokerGameFamilyLabel(fromName) || null
  const livePick =
    cashFamilyToLiveGamePick(family) ||
    pokerLiveCashGameNameSelectValue(fromName || stored) ||
    'holdem'
  const formatted = formatCashGameLabel({
    live_game_name_pick: livePick,
    game_custom_name:
      livePick === 'custom_name' ? fromName || stored : pokerLiveCashGameNameLabelFromId(livePick),
    limit_type: session?.limit_type || cashFamilyToLimitType(family) || 'no_limit',
    venue_kind: session?.venue_kind || 'live',
    small_blind: session?.small_blind != null ? String(session.small_blind) : '',
    big_blind: session?.big_blind != null ? String(session.big_blind) : '',
    third_blind: session?.third_blind != null ? String(session.third_blind) : '',
  })
  return formatted || (stored && stored !== 'custom' && stored !== 'other' ? stored : null)
}

/**
 * User/session games for this Where first (most recent), then venue defaults.
 * @param {Array<object>} sessions
 * @param {string | null | undefined} venueKind live | online | club
 */
export function buildCashGamePresetsFromSessions(sessions, venueKind = 'live') {
  const kind = venueKind === 'online' || venueKind === 'club' ? venueKind : 'live'
  const defaults = defaultCashGamePresets(kind)
  const byId = new Map(defaults.map((p) => [p.id, p]))
  const extras = []

  for (const s of sessions || []) {
    if (s.session_type !== 'cash') continue
    const sKind = s.venue_kind === 'online' || s.venue_kind === 'club' ? s.venue_kind : 'live'
    if (sKind !== kind) continue
    const label = cashGameLabelFromSession(s)
    if (!label) continue
    const id = cashGamePresetIdFromName(label)
    if (byId.has(id)) continue
    const parsed = parseCashGameLabel(label)
    const preset = {
      id,
      label,
      limit_type: s.limit_type || parsed?.limit_type || 'no_limit',
      small_blind:
        s.small_blind != null ? String(s.small_blind) : parsed?.small_blind || '',
      big_blind: s.big_blind != null ? String(s.big_blind) : parsed?.big_blind || '',
      third_blind:
        s.third_blind != null ? String(s.third_blind) : parsed?.third_blind || '',
      ante: s.ante != null ? String(s.ante) : '',
      family: parsed?.family || pokerGameFamilyLabel(label) || label,
      live_game_name_pick:
        parsed?.live_game_name_pick ||
        cashFamilyToLiveGamePick(pokerGameFamilyLabel(label)) ||
        'holdem',
      isDefault: false,
    }
    byId.set(id, preset)
    extras.push(preset)
  }

  return [...extras, ...defaults]
}

/**
 * Rows for the cash Game menu: New game…, then Your games, then Defaults.
 * @param {Array<{ id: string, label: string, isDefault?: boolean }>} presets
 * @param {{ id: string, label: string } | null} [orphan] selected game missing from presets
 * @returns {{ rows: Array<{ type: 'label'|'option', id?: string, label: string }> }}
 */
export function buildCashGamePickerRows(presets, orphan = null) {
  const list = Array.isArray(presets) ? [...presets] : []
  if (orphan?.id && orphan.label && !list.some((p) => p.id === orphan.id)) {
    list.unshift({ id: orphan.id, label: orphan.label, isDefault: false })
  }

  const yours = list.filter((p) => !p.isDefault)
  const defaults = list.filter((p) => p.isDefault)

  /** @type {Array<{ type: 'label'|'option', id?: string, label: string }>} */
  const rows = [{ type: 'option', id: POKER_CASH_NEW_GAME_ID, label: 'New game…' }]
  if (yours.length) {
    rows.push({ type: 'label', label: 'Your games' })
    for (const p of yours) rows.push({ type: 'option', id: p.id, label: p.label })
  }
  if (defaults.length) {
    rows.push({ type: 'label', label: 'Defaults' })
    for (const p of defaults) rows.push({ type: 'option', id: p.id, label: p.label })
  }

  return { rows }
}

/** @param {Array<{ id: string, label: string }>} presets */
export function cashGameSelectOptions(presets) {
  return [
    { id: POKER_CASH_NEW_GAME_ID, label: 'New game…' },
    ...(presets || []).map((p) => ({ id: p.id, label: p.label })),
  ]
}

/**
 * Resolve label to persist on cash session create/edit.
 * @param {object} form
 * @param {Array<{ id: string, label: string }>} presets
 * @returns {string | null}
 */
export function resolveCashGameLabelForSave(form, presets) {
  if (form?.cash_game_pick && form.cash_game_pick !== POKER_CASH_NEW_GAME_ID) {
    const preset = (presets || []).find((p) => p.id === form.cash_game_pick)
    if (preset?.label) return preset.label
  }
  return formatCashGameLabel(form)
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

  // Legacy stored ids / short family tags from composed labels
  if (s === 'nlh' || s === 'nlhe') return 'NLH'
  if (s === 'plh') return 'PLH'
  if (s === 'limit_holdem' || s === 'lhe') return "Limit Hold'em"
  if (s === 'plo') return 'PLO'
  if (s === 'plo5') return 'PLO5'
  if (s === 'plo6') return 'PLO6'
  if (s === 'plo8') return 'Omaha Hi/Lo'
  if (s === 'mixed' || s === 'mix') return 'Mixed'
  // Online stake tags: 25NL / PLO25 (before PLO5 / plain PLO)
  if (/^\d+nl$/.test(s)) return 'NLH'
  if (/^plo\d+$/.test(s)) return 'PLO'

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

  // Pot-limit Hold'em before plain NLH / Limit
  if (/\bplh\b/.test(s) || /\bpot\s*limit\s*hold/.test(s)) return 'PLH'

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
  const parsed = parseCashGameLabel(preset.label)
  const livePick =
    preset.live_game_name_pick ||
    parsed?.live_game_name_pick ||
    cashFamilyToLiveGamePick(preset.family) ||
    'holdem'
  return {
    ...form,
    cash_game_pick: preset.id,
    game_variant: 'custom',
    live_game_name_pick: livePick,
    game_custom_name:
      livePick === POKER_LIVE_CASH_GAME_CUSTOM_ID
        ? String(preset.family || preset.label || '').trim()
        : pokerLiveCashGameNameLabelFromId(livePick) || preset.label,
    limit_type: preset.limit_type || parsed?.limit_type || 'no_limit',
    small_blind: preset.small_blind ?? parsed?.small_blind ?? '',
    big_blind: preset.big_blind ?? parsed?.big_blind ?? '',
    third_blind: preset.third_blind ?? parsed?.third_blind ?? '',
    ante: preset.ante ?? '',
  }
}

/** Default cash Game pick to first built-in for this venue (not a user-added game). */
export function formWithDefaultCashGame(baseForm, presets) {
  const list = presets || []
  if (baseForm.session_type !== 'cash' || list.length === 0) {
    return applyCashGamePreset(baseForm, null)
  }
  const pick = list.find((p) => p.isDefault) || list[0]
  return applyCashGamePreset(baseForm, pick)
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
