/**
 * Slip / CSV bones. Heuristic only … user confirms in the composer before save.
 */

function numOrNull(v) {
  if (v == null || v === '') return null
  const n = Number(String(v).replace(/[$,u]/gi, '').trim())
  return Number.isFinite(n) ? n : null
}

function americanOrNull(v) {
  const s = String(v || '').trim()
  const m = /^([+-]?\d{2,4})$/.exec(s)
  if (!m) return null
  const n = Number(m[1])
  if (!Number.isFinite(n) || n === 0) return null
  return Math.round(n)
}

function cleanHeader(h) {
  return String(h || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function pickCol(row, names) {
  for (const name of names) {
    if (row[name] != null && String(row[name]).trim() !== '') return String(row[name]).trim()
  }
  return ''
}

function guessMarketAndSide(text) {
  const s = String(text || '')
  const total = /\b(over|under)\s+([0-9]+(?:\.[0-9]+)?)/i.exec(s)
  if (total) {
    return {
      market: 'total',
      side: total[1].toLowerCase() === 'under' ? 'under' : 'over',
      line: Number(total[2]),
      selection_label: `${total[1][0].toUpperCase()}${total[1].slice(1).toLowerCase()} ${total[2]}`,
    }
  }
  if (/\b(ml|moneyline|money line)\b/i.test(s)) {
    return { market: 'h2h', side: 'home', line: null, selection_label: s.slice(0, 80) }
  }
  const spread = /([+-][0-9]+(?:\.[0-9]+)?)/.exec(s)
  if (spread && !americanOrNull(spread[1])) {
    return { market: 'spread', side: 'home', line: Number(spread[1]), selection_label: s.slice(0, 80) }
  }
  return { market: 'other', side: 'home', line: null, selection_label: s.slice(0, 80) }
}

function draftFromBits({
  selection,
  odds,
  stake,
  book,
  event,
  source,
}) {
  const american = americanOrNull(odds)
  if (american == null) return null
  const guessed = guessMarketAndSide(selection || event)
  return {
    book: book || '',
    market: guessed.market,
    side: guessed.side,
    line: guessed.line != null ? String(guessed.line) : '',
    odds: String(american),
    stake_units: stake != null && Number(stake) > 0 ? String(stake) : '',
    selection_label: guessed.selection_label || selection || '',
    notes: event && event !== selection ? event : '',
    home_team: '',
    away_team: '',
    sport_label: '',
    event_id: '',
    sport_key: '',
    commence_time: '',
    source,
  }
}

/** Free-text bet slip / share-sheet paste. */
export function parseSportsBetSlipText(text) {
  const raw = String(text || '').replace(/\r/g, '').trim()
  if (!raw) return []

  const drafts = []
  const chunks = raw.split(/\n{2,}/).map((c) => c.trim()).filter(Boolean)
  const blocks = chunks.length > 1 ? chunks : raw.split('\n').reduce((acc, line) => {
    const t = line.trim()
    if (!t) return acc
    if (americanOrNull(t) || /[+-]\d{3,4}/.test(t)) acc.push(t)
    else if (acc.length) acc[acc.length - 1] += ` ${t}`
    else acc.push(t)
    return acc
  }, [])

  for (const block of blocks.length ? blocks : [raw]) {
    const oddsMatch = /(?<![.\d])([+-]\d{3,4})(?!\d)/.exec(block)
    if (!oddsMatch) continue
    const stakeMatch = /(?:stake|wager|risk|bet)\s*[:=]?\s*\$?\s*([0-9]+(?:\.[0-9]+)?)\s*(u|units?)?/i.exec(block)
      || /(\d+(?:\.\d+)?)\s*u(?:nits?)?\b/i.exec(block)
    drafts.push(
      draftFromBits({
        selection: block.replace(oddsMatch[0], ' ').replace(/\s+/g, ' ').trim(),
        odds: oddsMatch[1],
        stake: stakeMatch ? Number(stakeMatch[1]) : null,
        book: /\b(draftkings|fanduel|betmgm|caesars|fanatics|circa|pinnacle|bovada)\b/i.exec(block)?.[1] || '',
        event: '',
        source: 'slip',
      }),
    )
  }

  return drafts.filter(Boolean)
}

function parseDelimited(text) {
  const lines = String(text || '').replace(/\r/g, '').split('\n').filter((l) => l.trim())
  if (lines.length < 2) return []
  const delim = (lines[0].match(/,/g) || []).length >= (lines[0].match(/\t/g) || []).length ? ',' : '\t'

  const split = (line) => {
    const out = []
    let cur = ''
    let q = false
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i]
      if (ch === '"') {
        q = !q
        continue
      }
      if (!q && ch === delim) {
        out.push(cur.trim())
        cur = ''
        continue
      }
      cur += ch
    }
    out.push(cur.trim())
    return out
  }

  const headers = split(lines[0]).map(cleanHeader)
  const rows = []
  for (const line of lines.slice(1)) {
    const cells = split(line)
    const row = {}
    headers.forEach((h, i) => {
      row[h] = cells[i] || ''
    })
    rows.push(row)
  }
  return rows
}

const ODDS_HEADERS = ['odds', 'price', 'american', 'american odds', 'odds american']
const STAKE_HEADERS = ['stake', 'wager', 'risk', 'amount', 'units', 'stake units']
const SEL_HEADERS = ['selection', 'pick', 'bet', 'outcome', 'team', 'wager selection']
const EVENT_HEADERS = ['event', 'game', 'match', 'fixture', 'description']
const BOOK_HEADERS = ['book', 'sportsbook', 'bookmaker']
const MARKET_HEADERS = ['market', 'bet type', 'type']

function marketFromCsv(raw) {
  const s = String(raw || '').toLowerCase()
  if (s.includes('spread') || s.includes('puck') || s.includes('run line')) return 'spread'
  if (s.includes('money') || s === 'ml' || s.includes('h2h')) return 'h2h'
  if (s.includes('total') || s.includes('over') || s.includes('under')) return 'total'
  return ''
}

/** DK / FD-ish bet history CSV. Odds column required. */
export function parseSportsBetCsv(text) {
  const rows = parseDelimited(text)
  const drafts = []
  for (const row of rows) {
    const odds = pickCol(row, ODDS_HEADERS)
    const selection = pickCol(row, SEL_HEADERS)
    const event = pickCol(row, EVENT_HEADERS)
    const draft = draftFromBits({
      selection: selection || event,
      odds,
      stake: numOrNull(pickCol(row, STAKE_HEADERS)),
      book: pickCol(row, BOOK_HEADERS),
      event,
      source: 'csv',
    })
    if (!draft) continue
    const m = marketFromCsv(pickCol(row, MARKET_HEADERS))
    if (m) draft.market = m
    if (draft.market === 'total' && /under/i.test(selection)) draft.side = 'under'
    drafts.push(draft)
  }
  return drafts
}

export function parseSportsBetIntake(text) {
  const raw = String(text || '')
  const first = raw.split('\n').find((l) => l.trim()) || ''
  const looksCsv = /odds|price|american|stake|selection/i.test(first) && /[,|\t]/.test(first)
  return looksCsv ? parseSportsBetCsv(raw) : parseSportsBetSlipText(raw)
}
