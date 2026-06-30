/**
 * Flexible CSV importer for bankroll sessions.
 * Handles exports from Poker Income, PBT (Poker Bankroll Tracker),
 * and similar apps, mapping their varied column names to our schema.
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
    'amount in', 'investment', 'stake', 'money in', 'cash in', 'cashin',
    'initial buy in', 'initial buyin', 'starting stack', 'opening stack',
  ],
  end_amount: [
    'cashed out', 'cashout', 'cash out', 'cashedout', 'amount out',
    'winnings', 'payout', 'money out', 'cash out amount', 'total out',
    'ending stack', 'final stack', 'closing stack',
  ],
  // Rebuy and add-on costs are tracked separately; both get added to start_amount
  rebuy_costs: [
    'rebuycosts', 'rebuy costs', 'rebuy amount', 'rebuys',
  ],
  addon_costs: [
    'addoncosts', 'addon costs', 'add on costs', 'add-on costs', 'add on',
  ],
  casino_name: [
    'location', 'casino', 'venue', 'place', 'room', 'club',
    'casino name', 'property', 'site', 'cardroom', 'casino/location',
  ],
  notes: [
    'note', 'notes', 'comment', 'comments', 'sessionnote', 'session note',
    'memo', 'description', 'session notes',
  ],
  // Detected but not written to DB - used for filter logic only
  game_col: [
    'game', 'variant', 'game type', 'gametype', 'type', 'game variant',
  ],
  // "State" column in PBT to identify incomplete sessions
  state_col: [
    'state', 'status', 'session status', 'session state',
  ],
}

const REQUIRED_FIELDS = ['start_at', 'start_amount', 'end_amount']

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalize(str) {
  return str.toLowerCase().replace(/[_\-]/g, ' ').trim()
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

function parseCsvText(text) {
  // Strip UTF-8 BOM
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1)

  // Split on real newlines (CR+LF or LF), respecting quoted newlines
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

  // Build flat set of every known synonym for fast membership checks
  const allSynonyms = new Set(Object.values(FIELD_SYNONYMS).flat())

  // Scan every line to find the first one that looks like our target header.
  // We require at least 2 matching synonyms so we don't false-positive on
  // preamble lines like "Bankroll Name" or section titles.
  let headerLineIdx = -1
  for (let i = 0; i < allLines.length; i++) {
    const line = allLines[i]
    if (!line.includes(',')) continue
    const fields = parseLine(line).map(normalize)
    const hits = fields.filter(f => allSynonyms.has(f)).length
    if (hits >= 2) { headerLineIdx = i; break }
  }

  if (headerLineIdx === -1) return { headers: [], rows: [] }

  const headers = parseLine(allLines[headerLineIdx])

  // Collect data rows that follow the header.
  // Stop when we hit a blank line (after at least one data row) or a line
  // with fewer than 3 fields - both signal the start of a new section
  // (e.g. "Tourneys" or "Players" in the Poker Income export).
  const rows = []
  for (let i = headerLineIdx + 1; i < allLines.length; i++) {
    const line = allLines[i]
    if (!line.trim()) {
      if (rows.length > 0) break  // blank line after data = end of section
      continue                     // blank line before first row = skip
    }
    const parsed = parseLine(line)
    if (parsed.length < 3) break  // section title like "Tourneys" or "Players"
    rows.push(parsed)
  }

  return { headers, rows }
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
  const requiredMissing = REQUIRED_FIELDS.filter(f => columnMap[f] == null)
  return { columnMap, requiredMissing }
}

/**
 * Parse a date string from various formats into an ISO 8601 string.
 * Handles:
 *   - ISO:        "2024-10-18 22:10:48"
 *   - M/D/YY:     "12/1/25 6:30 AM"
 *   - M/D/YYYY:   "12/1/2025 6:30 AM"
 */
function parseDate(str) {
  if (!str || !str.trim()) return null
  str = str.trim()

  // ISO-like: 2024-10-18[ T]22:10:48
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    const d = new Date(str.replace(' ', 'T'))
    return isNaN(d.getTime()) ? null : d.toISOString()
  }

  // M/D/YY(YY) H:MM [AM|PM]
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

  // Fallback: native Date
  const d = new Date(str)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

function parseAmount(str) {
  if (str == null || str === '') return null
  const n = parseFloat(String(str).replace(/[$,\s]/g, ''))
  return isNaN(n) ? null : n
}

function detectGameType(raw) {
  if (!raw) return null
  const g = raw.toLowerCase()
  if (g.includes('slot')) return 'slots'
  if (
    g.includes('hold') || g.includes('holdem') || g.includes('poker') ||
    g.includes('omaha') || g.includes('stud') || g.includes('razz') ||
    g.includes('badugi') || g.includes('draw') || g.includes('hi-lo')
  ) return 'tables'
  return null
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
  const { headers, rows } = parseCsvText(text)

  if (!headers.length) {
    return { error: 'Could not parse CSV. Make sure the data has a header row and is comma-separated.' }
  }

  const { columnMap, requiredMissing } = buildColumnMap(headers)

  if (requiredMissing.length > 0) {
    const friendly = {
      start_at: 'session start date/time (e.g. "Start Time")',
      start_amount: 'buy-in amount (e.g. "Buy In")',
      end_amount: 'cashout amount (e.g. "Cash Out")',
    }
    return {
      error:
        `Missing required columns: ${requiredMissing.map(f => friendly[f]).join('; ')}. ` +
        `Found headers: ${headers.slice(0, 8).join(', ')}${headers.length > 8 ? '…' : ''}.`,
      requiredMissing,
      columnMap,
      headers,
    }
  }

  const get = (row, field) => {
    const idx = columnMap[field]
    return idx != null && idx < row.length ? row[idx] : null
  }

  const sessions = []
  const skipped = []

  for (const row of rows) {
    // Skip sessions that were never completed (PBT "state" = "Started")
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

    let start_amount = parseAmount(get(row, 'start_amount'))
    if (start_amount == null) {
      skipped.push({ reason: 'invalid_amount', raw: row })
      continue
    }

    const end_amount = parseAmount(get(row, 'end_amount'))
    if (end_amount == null) {
      skipped.push({ reason: 'invalid_amount', raw: row })
      continue
    }

    // Add rebuy/addon costs into start_amount (total invested)
    const rebuy = parseAmount(get(row, 'rebuy_costs')) ?? 0
    const addon = parseAmount(get(row, 'addon_costs')) ?? 0
    if (rebuy > 0 || addon > 0) {
      start_amount = parseFloat((start_amount + rebuy + addon).toFixed(2))
    }

    const end_at = parseDate(get(row, 'end_at')) ?? null
    const casino_name = (get(row, 'casino_name') || '').trim() || null
    const notes = (get(row, 'notes') || '').trim() || null
    const detectedGameType = detectGameType(get(row, 'game_col'))

    sessions.push({ start_at, end_at, start_amount, end_amount, casino_name, notes, detectedGameType })
  }

  const hasGameColumn = columnMap.game_col != null
  const hasMixedGames =
    hasGameColumn &&
    sessions.some(s => s.detectedGameType === 'slots') &&
    sessions.some(s => s.detectedGameType === 'tables')

  return { sessions, skipped, hasGameColumn, hasMixedGames, columnMap, headers }
}
