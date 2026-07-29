/**
 * Flexible CSV importer for bankroll sessions.
 * Handles exports from Poker Income, PBT (Poker Bankroll Tracker),
 * and similar apps, mapping their varied column names to our schema.
 *
 * Poker Income exports often have multiple sections (Cash Games + Tourneys);
 * we parse every matching header block. PBT is usually one flat table with a
 * `variant` column (Cash Game / Tournament).
 */

// ── Synonym dictionary ────────────────────────────────────────────────────────
// Maps each of our fields to every reasonable column name variant we might see.
// Normalization: lowercase, underscores/hyphens → space, trimmed.

const FIELD_SYNONYMS = {
  start_at: [
    'start time', 'starttime', 'start time (local)', 'start date', 'startdate',
    'date', 'session date', 'sessiondate', 'played', 'play date',
    'time in', 'begin', 'begin time', 'date played', 'session start',
    'date/time', 'datetime', 'started',
  ],
  end_at: [
    'end time', 'endtime', 'end time (local)', 'end date', 'enddate',
    'finish time', 'finishtime', 'time out', 'session end', 'sessionend',
    'stop time', 'ended', 'finished at',
  ],
  start_amount: [
    'buy in', 'buyin', 'buy in amount', 'buyin amount',
    'amount in', 'investment', 'money in', 'cash in', 'cashin',
    'initial buy in', 'initial buyin', 'opening stack',
  ],
  end_amount: [
    'cashed out', 'cashout', 'cash out', 'cashedout', 'amount out',
    'winnings', 'payout', 'money out', 'cash out amount', 'total out',
    'ending stack', 'final stack', 'closing stack',
  ],
  rebuy_costs: [
    'rebuycosts', 'rebuy costs', 'rebuy amount', 'rebuy $',
  ],
  addon_costs: [
    'addoncosts', 'addon costs', 'add on costs', 'add-on costs', 'add on', 'addon',
  ],
  rebuys_count: [
    'rebuys', 're buys', 're-buys', 'reentries', 're entries', 're-entries',
  ],
  casino_name: [
    'location', 'casino', 'venue', 'place', 'room', 'club',
    'casino name', 'property', 'site', 'cardroom', 'casino/location',
  ],
  notes: [
    'note', 'notes', 'comment', 'comments', 'memo', 'description', 'session notes',
  ],
  session_note: [
    'sessionnote', 'session note',
  ],
  game_col: [
    'game', 'variant game', 'game type', 'gametype', 'game variant',
  ],
  // PBT: Cash Game / Tournament. Keep ahead of generic "type" venue column.
  session_variant: [
    'variant', 'session type', 'sessiontype', 'gamemode', 'game mode',
  ],
  limit_col: [
    'limit', 'limit type', 'limittype', 'betting limit',
  ],
  table_size_col: [
    'tablesize', 'table size', 'table', 'format',
  ],
  venue_kind_col: [
    'location type', 'locationtype', 'venue type', 'venue kind', 'venuekind',
  ],
  // PBT uses bare "type" for Casino / Online after other columns match.
  venue_type_col: [
    'type',
  ],
  currency_col: [
    'currency', 'curr', 'ccy',
  ],
  small_blind: [
    'smallblind', 'small blind', 'sb',
  ],
  big_blind: [
    'bigblind', 'big blind', 'bb',
  ],
  third_blind: [
    '3rdblind', '3rd blind', 'thirdblind', 'third blind', 'straddle',
  ],
  ante: [
    'ante',
  ],
  // Poker Income cash "Stake" e.g. 2/5 — not buy-in.
  stake_col: [
    'stake', 'stakes', 'blinds', 'blind level',
  ],
  bounty_winnings: [
    'bounties', 'bounty', 'bounty winnings', 'bountywon', 'bounty won',
  ],
  tournament_name: [
    'mttname', 'mtt name', 'tournament name', 'tournament', 'event', 'event name',
    'tourney name', 'tourney',
  ],
  field_size: [
    'player', 'players', 'field', 'field size', 'fieldsize', 'entrants',
  ],
  finish_place: [
    'place', 'rank', 'finish', 'finish place', 'finishing place', 'position',
  ],
  start_stack: [
    'startstack', 'start stack', 'starting stack', 'starting chips',
  ],
  state_col: [
    'state', 'status', 'session status', 'session state',
  ],
}

const REQUIRED_FIELDS = ['start_at', 'start_amount', 'end_amount']

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalize(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/[_\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseLine(line) {
  const result = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      result.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  result.push(current)
  return result
}

/**
 * True session headers must include start-time + buy-in + cash-out columns.
 * Looser “any 2 synonyms” matching falsely treats data cells like "Casino" as headers.
 */
function looksLikeHeader(fields) {
  const set = new Set(fields)
  const hasStart = FIELD_SYNONYMS.start_at.some((s) => set.has(s))
  const hasBuyIn = FIELD_SYNONYMS.start_amount.some((s) => set.has(s))
  const hasCashOut = FIELD_SYNONYMS.end_amount.some((s) => set.has(s))
  return hasStart && hasBuyIn && hasCashOut
}

/**
 * Parse every CSV section that has a recognizable session header.
 * Poker Income: Cash Games block, then Tourneys block.
 * PBT: single flat header after a title line.
 */
function parseAllCsvSections(text) {
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1)

  const allLines = []
  let current = ''
  let inQ = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '"') {
      if (inQ && text[i + 1] === '"') { current += '"'; i++ }
      else inQ = !inQ
    } else if (ch === '\n' && !inQ) {
      allLines.push(current.replace(/\r$/, ''))
      current = ''
    } else {
      current += ch
    }
  }
  if (current.trim()) allLines.push(current)

  const sections = []

  let i = 0
  while (i < allLines.length) {
    const line = allLines[i]
    if (!line.includes(',')) {
      i++
      continue
    }
    const fields = parseLine(line).map(normalize)
    if (!looksLikeHeader(fields)) {
      i++
      continue
    }

    const headers = parseLine(line)
    const titleHint = i > 0 ? allLines[i - 1].trim() : ''
    const rows = []
    i++
    for (; i < allLines.length; i++) {
      const dataLine = allLines[i]
      if (!dataLine.trim()) {
        // Poker Income separates sections with blank lines; keep scanning for the
        // next real header instead of ending the whole file.
        if (rows.length > 0) {
          i++
          break
        }
        continue
      }
      // Next section title (no commas) or another header row
      if (!dataLine.includes(',')) break
      const parsed = parseLine(dataLine)
      const asHeader = parsed.map(normalize)
      if (rows.length > 0 && looksLikeHeader(asHeader)) break
      if (parsed.length < 3) break
      rows.push(parsed)
    }

    sections.push({
      headers,
      rows,
      sectionHint: detectSectionHint(titleHint, headers),
    })
  }

  return sections
}

function detectSectionHint(titleHint, headers) {
  const t = normalize(titleHint).replace(/"/g, '')
  if (t.includes('tourney') || t.includes('tournament') || t.includes('mtt')) return 'tournament'
  if (t.includes('cash')) return 'cash'
  const headerNorm = headers.map(normalize).join(' ')
  if (
    headerNorm.includes('tourney type') ||
    headerNorm.includes('place paid') ||
    headerNorm.includes('mttname') ||
    headerNorm.includes('mtt name')
  ) {
    return 'tournament'
  }
  if (headerNorm.includes('stake') && !headerNorm.includes('mtt')) return 'cash'
  return null
}

function buildColumnMap(headers) {
  const norm = headers.map(normalize)
  const columnMap = {}
  for (const [field, synonyms] of Object.entries(FIELD_SYNONYMS)) {
    for (let i = 0; i < norm.length; i++) {
      if (synonyms.includes(norm[i])) {
        columnMap[field] = i
        break
      }
    }
  }
  // Prefer explicit venue kind over bare "type" when both exist
  if (columnMap.venue_kind_col != null && columnMap.venue_type_col === columnMap.venue_kind_col) {
    delete columnMap.venue_type_col
  }
  // Don't let bare "type" steal game when a real game column exists
  if (columnMap.game_col != null && columnMap.venue_type_col === columnMap.game_col) {
    delete columnMap.venue_type_col
  }
  const requiredMissing = REQUIRED_FIELDS.filter((f) => columnMap[f] == null)
  return { columnMap, requiredMissing }
}

/**
 * Parse a date string from various formats into an ISO 8601 string.
 */
function parseDate(str) {
  if (!str || !String(str).trim()) return null
  // Poker Income often uses narrow no-break spaces before AM/PM
  str = String(str)
    .replace(/[\u202f\u00a0]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    const d = new Date(str.replace(' ', 'T'))
    return isNaN(d.getTime()) ? null : d.toISOString()
  }

  const m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)?/i)
  if (m) {
    let [, mo, day, yr, hr, min, ampm] = m
    yr = parseInt(yr, 10)
    if (yr < 100) yr += 2000
    hr = parseInt(hr, 10)
    if (ampm?.toUpperCase() === 'PM' && hr !== 12) hr += 12
    if (ampm?.toUpperCase() === 'AM' && hr === 12) hr = 0
    const d = new Date(yr, parseInt(mo, 10) - 1, parseInt(day, 10), hr, parseInt(min, 10))
    return isNaN(d.getTime()) ? null : d.toISOString()
  }

  const d = new Date(str)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

function parseAmount(str) {
  if (str == null || str === '') return null
  const n = parseFloat(String(str).replace(/[$,\s]/g, ''))
  return isNaN(n) ? null : n
}

function parseIntSafe(str) {
  if (str == null || str === '') return null
  const n = parseInt(String(str).replace(/[,\s]/g, ''), 10)
  return Number.isFinite(n) ? n : null
}

function detectGameType(raw) {
  if (!raw) return null
  const g = raw.toLowerCase()
  if (g.includes('slot')) return 'slots'
  if (
    g.includes('hold') || g.includes('holdem') || g.includes('poker') ||
    g.includes('omaha') || g.includes('stud') || g.includes('razz') ||
    g.includes('badugi') || g.includes('draw') || g.includes('hi-lo') ||
    g.includes('short deck') || g.includes('ofc')
  ) return 'tables'
  return null
}

function detectSessionType(variantRaw, sectionHint, columnMap) {
  const v = normalize(variantRaw)
  if (v.includes('tournament') || v.includes('tourney') || v === 'mtt' || v === 'sng') {
    return 'tournament'
  }
  if (v.includes('cash')) return 'cash'
  if (sectionHint === 'tournament' || sectionHint === 'cash') return sectionHint
  if (
    columnMap.tournament_name != null ||
    columnMap.finish_place != null ||
    columnMap.field_size != null
  ) {
    // Soft signal only when section already hinted tourney-ish headers
    if (sectionHint === 'tournament') return 'tournament'
  }
  return null
}

function detectVenueKind(locationTypeRaw, typeRaw, locationName) {
  const candidates = [locationTypeRaw, typeRaw, locationName]
  for (const raw of candidates) {
    const v = normalize(raw)
    if (!v) continue
    if (v.includes('online') || v.includes('internet')) return 'online'
    if (v.includes('club') || v.includes('home game') || v.includes('home')) return 'club'
    if (v.includes('casino') || v.includes('live') || v.includes('card room') || v.includes('cardroom')) {
      return 'live'
    }
  }
  const n = normalize(locationName)
  if (
    n.includes('pokerstars') || n.includes('ggpoker') || n.includes('clubwpt') ||
    n.includes('acr') || n.includes('partypoker') || n.includes('888poker') ||
    n.includes('wsop.com') || n.includes('ignition') || n.includes('bovada') ||
    n.includes('pppoker') || n.includes('clubgg') || n.includes('pokerbros')
  ) {
    return 'online'
  }
  if (n.includes('club') || n.includes('pppoker') || n.includes('clubgg')) return 'club'
  return null
}

function normalizeLimitType(raw) {
  const v = normalize(raw)
  if (!v) return null
  if (v.includes('no limit') || v === 'nl' || v === 'nlh') return 'no_limit'
  if (v.includes('pot limit') || v === 'pl' || v === 'plo') return 'pot_limit'
  if (v.includes('spread')) return 'spread_limit'
  if (v.includes('mix')) return 'mixed'
  if (v === 'limit' || v.includes('fixed limit') || v.includes('limit hold')) return 'limit'
  return null
}

function normalizeTableSize(raw) {
  const v = normalize(raw)
  if (!v) return null
  if (v.includes('full') || v.includes('9') || v.includes('10') || v === 'fr') return 'full_ring'
  if (v.includes('6') || v.includes('six') || v === '6max' || v === '6-max') return '6max'
  if (v.includes('head') || v === 'hu' || v.includes('2-max') || v === '2max') return 'heads_up'
  return null
}

/** Parse "2/5", "1/2/5", "2-5" into blinds. */
function parseStakeBlinds(raw) {
  if (!raw) return { small_blind: null, big_blind: null, third_blind: null }
  const s = String(raw).trim().replace(/\$/g, '')
  const parts = s.split(/[/\-–—]/).map((p) => p.trim()).filter(Boolean)
  if (parts.length < 2) return { small_blind: null, big_blind: null, third_blind: null }
  const nums = parts.map((p) => parseAmount(p))
  if (nums.some((n) => n == null || n < 0)) {
    return { small_blind: null, big_blind: null, third_blind: null }
  }
  return {
    small_blind: nums[0],
    big_blind: nums[1],
    third_blind: nums.length >= 3 ? nums[2] : null,
  }
}

function normalizeCurrency(raw) {
  const v = String(raw || '').trim().toUpperCase()
  if (/^[A-Z]{3}$/.test(v)) return v
  return null
}

function sanitizeNotePart(raw) {
  const s = String(raw || '').trim()
  if (!s) return null
  // PBT tags / chipgraph JSON sometimes lands in note-like columns
  if (s.startsWith('[{') || s.startsWith('[') || s.startsWith('{')) return null
  return s
}

function combineNotes(...parts) {
  const cleaned = parts.map(sanitizeNotePart).filter(Boolean)
  if (!cleaned.length) return null
  return [...new Set(cleaned)].join('\n')
}

function positiveAmount(n) {
  return n != null && Number(n) > 0 ? Number(n) : null
}

function positiveInt(n) {
  return n != null && Number(n) > 0 ? Number(n) : null
}

function parseSectionSessions(section) {
  const { headers, rows, sectionHint } = section
  const { columnMap, requiredMissing } = buildColumnMap(headers)
  if (requiredMissing.length > 0) {
    return { sessions: [], skipped: [], columnMap, requiredMissing, headers, ok: false }
  }

  const get = (row, field) => {
    const idx = columnMap[field]
    return idx != null && idx < row.length ? row[idx] : null
  }

  const sessions = []
  const skipped = []

  for (const row of rows) {
    if (columnMap.state_col != null) {
      const state = (get(row, 'state_col') || '').toLowerCase().trim()
      if (state && state !== 'completed' && state !== 'finished' && state !== 'done') {
        skipped.push({ reason: 'incomplete', raw: row })
        continue
      }
    }

    const start_at = parseDate(get(row, 'start_at'))
    if (!start_at) {
      skipped.push({ reason: 'invalid_date', raw: row })
      continue
    }

    const buyIn = parseAmount(get(row, 'start_amount'))
    if (buyIn == null) {
      skipped.push({ reason: 'invalid_amount', raw: row })
      continue
    }

    const end_amount = parseAmount(get(row, 'end_amount'))
    if (end_amount == null) {
      skipped.push({ reason: 'invalid_amount', raw: row })
      continue
    }

    const rebuy_amount = Math.max(0, parseAmount(get(row, 'rebuy_costs')) ?? 0)
    const addon_amount = Math.max(0, parseAmount(get(row, 'addon_costs')) ?? 0)
    // Slots bankroll treats invested total as start_amount; poker keeps parts split.
    const start_amount = parseFloat((buyIn + rebuy_amount + addon_amount).toFixed(2))

    const end_at = parseDate(get(row, 'end_at')) ?? null
    const casino_name = (get(row, 'casino_name') || '').trim() || null
    const noteMain = (get(row, 'notes') || '').trim() || null
    const sessionNote = (get(row, 'session_note') || '').trim() || null
    const gameRaw = (get(row, 'game_col') || '').trim() || null
    const detectedGameType = detectGameType(gameRaw)
    const variantRaw = get(row, 'session_variant')
    const session_type = detectSessionType(variantRaw, sectionHint, columnMap)
    const venue_kind = detectVenueKind(
      get(row, 'venue_kind_col'),
      get(row, 'venue_type_col'),
      casino_name,
    )
    const currency = normalizeCurrency(get(row, 'currency_col'))
    const limit_type = normalizeLimitType(get(row, 'limit_col'))
    const table_size = normalizeTableSize(get(row, 'table_size_col'))

    let small_blind = parseAmount(get(row, 'small_blind'))
    let big_blind = parseAmount(get(row, 'big_blind'))
    let third_blind = parseAmount(get(row, 'third_blind'))
    const ante = parseAmount(get(row, 'ante'))
    if ((small_blind == null || big_blind == null) && columnMap.stake_col != null) {
      const fromStake = parseStakeBlinds(get(row, 'stake_col'))
      if (small_blind == null) small_blind = fromStake.small_blind
      if (big_blind == null) big_blind = fromStake.big_blind
      if (third_blind == null) third_blind = fromStake.third_blind
    }

    const bounty_winnings = parseAmount(get(row, 'bounty_winnings'))
    const tournament_name = (get(row, 'tournament_name') || '').trim() || null
    const field_size = parseIntSafe(get(row, 'field_size'))
    const finish_place = parseIntSafe(get(row, 'finish_place'))
    const start_stack = parseAmount(get(row, 'start_stack'))
    const reentries = parseIntSafe(get(row, 'rebuys_count'))
    const isTourney = session_type === 'tournament'

    sessions.push({
      start_at,
      end_at,
      // slots: invested total; poker import uses buy_in + rebuy/addon split
      start_amount,
      buy_in: buyIn,
      end_amount,
      rebuy_amount,
      addon_amount,
      casino_name,
      notes: combineNotes(sessionNote, noteMain),
      detectedGameType,
      game_label: gameRaw,
      session_type,
      venue_kind,
      currency,
      limit_type,
      table_size,
      // PBT tourney blinds are end-of-session levels, not cash stakes
      small_blind: isTourney ? null : positiveAmount(small_blind),
      big_blind: isTourney ? null : positiveAmount(big_blind),
      third_blind: isTourney ? null : positiveAmount(third_blind),
      ante: positiveAmount(ante),
      bounty_winnings: positiveAmount(bounty_winnings),
      tournament_name: isTourney ? tournament_name : null,
      field_size: isTourney ? positiveInt(field_size) : null,
      finish_place: isTourney ? positiveInt(finish_place) : null,
      start_stack: isTourney ? positiveAmount(start_stack) : null,
      reentries: positiveInt(reentries),
    })
  }

  return { sessions, skipped, columnMap, requiredMissing: [], headers, ok: true }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Parse raw CSV text and return a structured import result.
 *
 * Returns:
 *   { sessions, skipped, hasGameColumn, hasMixedGames, columnMap, headers }
 * or on hard error:
 *   { error, requiredMissing?, columnMap?, headers? }
 */
export function parseCsvImport(text) {
  const sections = parseAllCsvSections(text)

  if (!sections.length) {
    return { error: 'Could not parse CSV. Make sure the data has a header row and is comma-separated.' }
  }

  const sessions = []
  const skipped = []
  let lastFail = null
  let firstOk = null

  for (const section of sections) {
    const parsed = parseSectionSessions(section)
    if (!parsed.ok) {
      lastFail = parsed
      continue
    }
    if (!firstOk) firstOk = parsed
    sessions.push(...parsed.sessions)
    skipped.push(...parsed.skipped)
  }

  if (!firstOk) {
    const friendly = {
      start_at: 'session start date/time (e.g. "Start Time")',
      start_amount: 'buy-in amount (e.g. "Buy In")',
      end_amount: 'cashout amount (e.g. "Cash Out")',
    }
    const headers = lastFail?.headers || sections[0].headers
    const requiredMissing = lastFail?.requiredMissing || REQUIRED_FIELDS
    return {
      error:
        `Missing required columns: ${requiredMissing.map((f) => friendly[f]).join('; ')}. ` +
        `Found headers: ${headers.slice(0, 8).join(', ')}${headers.length > 8 ? '…' : ''}.`,
      requiredMissing,
      columnMap: lastFail?.columnMap || {},
      headers,
    }
  }

  const hasGameColumn = sessions.some((s) => s.game_label)
  const hasMixedGames =
    hasGameColumn &&
    sessions.some((s) => s.detectedGameType === 'slots') &&
    sessions.some((s) => s.detectedGameType === 'tables')
  const hasSessionTypeColumn = sessions.some((s) => s.session_type != null)

  return {
    sessions,
    skipped,
    hasGameColumn,
    hasMixedGames,
    hasSessionTypeColumn,
    columnMap: firstOk.columnMap,
    headers: firstOk.headers,
    sectionCount: sections.length,
  }
}
