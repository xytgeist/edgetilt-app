import { createClient } from 'npm:@supabase/supabase-js@2'
import {
  openaiResponsesReasoningNone,
  resolveOpenAiVisionModel,
} from '../_shared/openaiModelDefaults.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
}

const OFFER_TYPES = new Set(['free_play', 'hotel', 'dining', 'gift', 'multiplier', 'tournament', 'drawing', 'other'])

type ParsedOffer = {
  confidence?: number
  warnings?: string[]
  has_specific_time?: boolean
  time_evidence?: string | null
  has_explicit_year?: boolean
  year_evidence?: string | null
  casino_name?: string
  offer_type?: string
  title?: string
  start_at?: string
  end_at?: string | null
  value_amount?: number | null
  notes?: string | null
}

const OPENAI_MODEL = resolveOpenAiVisionModel()
const AUTO_CREATE_CONFIDENCE = Number(Deno.env.get('AI_AUTO_CREATE_CONFIDENCE') ?? '0.78')
const MAX_BATCH_SIZE = Number(Deno.env.get('AI_PROCESS_BATCH_SIZE') ?? '20')
const MAX_EVENTS_PER_IMAGE = Number(Deno.env.get('AI_MAX_EVENTS_PER_IMAGE') ?? '30')
const DEFAULT_TIMEZONE = Deno.env.get('AI_DEFAULT_TIMEZONE') ?? 'America/Los_Angeles'
const CASINO_MATCH_THRESHOLD = Number(Deno.env.get('AI_CASINO_MATCH_THRESHOLD') ?? '0.35')

type KnownCasino = { name: string; aliases: string[] }

function normalizeText(value: string | null | undefined): string {
  return (value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

// ── Casino fuzzy matching ────────────────────────────────────────────────────

function trigramSet(str: string): Set<string> {
  const s = ` ${str} `
  const grams = new Set<string>()
  for (let i = 0; i < s.length - 2; i++) grams.add(s.slice(i, i + 3))
  return grams
}

function trigramSimilarity(a: string, b: string): number {
  if (!a || !b) return 0
  const ga = trigramSet(a)
  const gb = trigramSet(b)
  let shared = 0
  for (const g of ga) if (gb.has(g)) shared++
  return (2 * shared) / (ga.size + gb.size)
}

function matchCasinoName(
  extracted: string,
  casinos: KnownCasino[]
): { matched: boolean; canonical: string | null } {
  if (!casinos.length) return { matched: false, canonical: null }
  const norm = normalizeText(extracted)
  if (!norm) return { matched: false, canonical: null }

  let bestScore = 0
  let bestName: string | null = null

  for (const casino of casinos) {
    const candidates = [casino.name, ...casino.aliases].map(normalizeText).filter(Boolean)
    for (const candidate of candidates) {
      // Exact match shortcut
      if (candidate === norm) return { matched: true, canonical: casino.name }
      // Substring shortcut (e.g. "bellagio" in "bellagio hotel casino")
      if (candidate.includes(norm) || norm.includes(candidate)) {
        const score = 0.85
        if (score > bestScore) { bestScore = score; bestName = casino.name }
        continue
      }
      const score = trigramSimilarity(norm, candidate)
      if (score > bestScore) { bestScore = score; bestName = casino.name }
    }
  }

  return bestScore >= CASINO_MATCH_THRESHOLD
    ? { matched: true, canonical: bestName }
    : { matched: false, canonical: null }
}

function textOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length ? trimmed : null
}

function numberOrNull(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return null
  const parsed = Number(value.replace(/[^0-9.-]/g, ''))
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeOfferType(value: unknown): string {
  const raw = textOrNull(value)?.toLowerCase().replace(/\s+/g, '_')
  return raw && OFFER_TYPES.has(raw) ? raw : 'other'
}

function inferOfferTypeFromText(parts: Array<string | null | undefined>): string | null {
  const text = parts
    .filter(Boolean)
    .map((p) => String(p).toLowerCase())
    .join(' ')
  if (!text) return null

  if (/\b(free\s*slot\s*play|free\s*play|slot\s*credits?)\b/.test(text)) return 'free_play'
  if (/\b(food|beverage|dining|restaurant|meal)\b/.test(text)) return 'dining'
  if (/\bhotel|room|suite|stay\b/.test(text)) return 'hotel'
  if (/\bmultiplier|tier\s*x|point\s*multiplier\b/.test(text)) return 'multiplier'
  if (/\bdrawing|raffle\b/.test(text)) return 'drawing'
  if (/\btournament\b/.test(text)) return 'tournament'
  if (/\bgift\b/.test(text)) return 'gift'
  return null
}

function defaultTitleForOfferType(offerType: string | null | undefined): string {
  switch (offerType) {
    case 'free_play':
      return 'Free play'
    case 'hotel':
      return 'Hotel stay'
    case 'dining':
      return 'Dining credit'
    case 'gift':
      return 'Gift'
    case 'multiplier':
      return 'Tier multiplier'
    case 'tournament':
      return 'Tournament'
    case 'drawing':
      return 'Drawing'
    default:
      return 'Offer'
  }
}

function maybeIso(value: unknown): string | null {
  const str = textOrNull(value)
  if (!str) return null
  const dt = new Date(str)
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString()
}

function extractJsonObject(rawText: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(rawText)
    if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>
  } catch (_) {
    // fall through to fenced extraction
  }
  const match = rawText.match(/\{[\s\S]*\}/)
  if (!match) return null
  try {
    const parsed = JSON.parse(match[0])
    if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>
  } catch (_) {
    return null
  }
  return null
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize)
    binary += String.fromCharCode(...chunk)
  }
  return btoa(binary)
}

function outputTextFromResponsesApi(payload: any): string {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) return payload.output_text
  const output = Array.isArray(payload?.output) ? payload.output : []
  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : []
    for (const part of content) {
      if (typeof part?.text === 'string' && part.text.trim()) return part.text
    }
  }
  return ''
}

function normalizeParsedOffer(raw: Record<string, unknown>): ParsedOffer {
  return {
    confidence: typeof raw.confidence === 'number' ? raw.confidence : 0,
    warnings: Array.isArray(raw.warnings) ? raw.warnings.map((w) => String(w)) : [],
    has_specific_time: raw.has_specific_time === true,
    time_evidence: textOrNull(raw.time_evidence),
    has_explicit_year: raw.has_explicit_year === true,
    year_evidence: textOrNull(raw.year_evidence),
    casino_name: textOrNull(raw.casino_name) ?? undefined,
    offer_type: normalizeOfferType(raw.offer_type),
    title: textOrNull(raw.title) ?? undefined,
    start_at: maybeIso(raw.start_at) ?? undefined,
    end_at: maybeIso(raw.end_at),
    value_amount: numberOrNull(raw.value_amount),
    notes: textOrNull(raw.notes)
  }
}

async function parseOffersFromImage(openaiApiKey: string, mimeType: string, bytes: Uint8Array): Promise<ParsedOffer[]> {
  const base64 = bytesToBase64(bytes)
  const prompt = `
Extract all casino offer events visible in this image.
Return strict JSON (no markdown, no prose) with this shape:
{
  "events": [
    {
      "confidence": 0.0-1.0,
      "warnings": ["optional warning strings"],
      "has_specific_time": true or false,
      "time_evidence": "exact text snippet showing the visible time, or null",
      "has_explicit_year": true or false,
      "year_evidence": "exact text snippet showing the year, or null",
      "casino_name": "string or null",
      "offer_type": "free_play|hotel|dining|gift|multiplier|tournament|drawing|other",
      "title": "string or null",
      "start_at": "ISO8601 datetime or null",
      "end_at": "ISO8601 datetime or null",
      "value_amount": number or null,
      "notes": "string or null"
    }
  ],
  "image_warnings": ["optional image-level warnings"]
}

Rules:
- Return one event object per distinct offer session day from the image.
- Discrete days for the same session (examples: "DECEMBER 10 & 11", "Dec 10 and 11", "Dec 10-11" with the same registration/start times each day) MUST be separate event objects ... one per calendar day with the same times. Do not collapse those into a single multi-day start_at/end_at range, and do not skip the middle day.
- Continuous hotel/stay ranges without per-day session times may stay as one event with start_at and end_at.
- Use local date text from the flyer. When month and day are visible but no 4-digit year, still set start_at/end_at with a provisional ISO year (prefer the nearest upcoming occurrence of that month/day within about one year). Never leave start_at null only because the year is missing ... set has_explicit_year false and you may add a short warning.
- Only leave start_at null when the flyer does not show a usable month/day (or clearer date). For other uncertain fields, keep them null and add a warning.
- confidence should reflect how complete and reliable the extraction is.
- Set has_specific_time to true ONLY when an explicit clock time is visible in the image.
- If has_specific_time is true, include time_evidence copied from the image (example: "5:00 PM").
- Set has_explicit_year to true ONLY if a 4-digit year appears in the image.
- If has_explicit_year is true, include year_evidence copied from the image (example: "2026").
`.trim()

  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openaiApiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      ...openaiResponsesReasoningNone(),
      input: [
        {
          role: 'user',
          content: [
            { type: 'input_text', text: prompt },
            {
              type: 'input_image',
              image_url: `data:${mimeType};base64,${base64}`
            }
          ]
        }
      ]
    })
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`OpenAI error (${res.status}): ${errText.slice(0, 300)}`)
  }

  const payload = await res.json()
  const outputText = outputTextFromResponsesApi(payload)
  if (!outputText) {
    throw new Error('OpenAI returned no text output.')
  }

  const parsed = extractJsonObject(outputText)
  if (!parsed) throw new Error('Could not parse JSON from OpenAI output.')
  const eventsRaw = Array.isArray(parsed.events) ? parsed.events : []
  const normalized = eventsRaw
    .filter((e) => e && typeof e === 'object')
    .slice(0, Math.max(1, MAX_EVENTS_PER_IMAGE))
    .map((e) => normalizeParsedOffer(e as Record<string, unknown>))

  // Backward-compatible fallback if model returns old single-event shape.
  if (normalized.length === 0) {
    const single = normalizeParsedOffer(parsed)
    const hasAnySignal = !!(single.casino_name || single.title || single.start_at || single.notes || single.value_amount !== null)
    if (hasAnySignal) return [single]
  }
  return normalized
}

function hasExplicitTimeEvidence(value: string | null | undefined): boolean {
  if (!value) return false
  const s = value.toLowerCase()
  const ampm = /\b([1-9]|1[0-2])(?::[0-5]\d)?\s?(am|pm)\b/.test(s)
  const twentyFourHour = /\b([01]?\d|2[0-3]):[0-5]\d\b/.test(s)
  return ampm || twentyFourHour
}

function offsetMinutesForTimeZone(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  })
  const parts = dtf.formatToParts(date)
  const pick = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0')
  const y = pick('year')
  const m = pick('month')
  const d = pick('day')
  const hh = pick('hour')
  const mm = pick('minute')
  const ss = pick('second')
  const asUtc = Date.UTC(y, m - 1, d, hh, mm, ss)
  return Math.round((date.getTime() - asUtc) / 60000)
}

function normalizeToAllDayIfNeeded(offer: ParsedOffer, timezoneOffsetMinutes?: number): ParsedOffer {
  const keepTime = offer.has_specific_time === true && hasExplicitTimeEvidence(offer.time_evidence)
  if (keepTime) return offer

  const normalize = (iso?: string | null): string | null | undefined => {
    if (!iso) return iso
    const dt = new Date(iso)
    if (Number.isNaN(dt.getTime())) return iso
    const effectiveOffset =
      typeof timezoneOffsetMinutes === 'number' && Number.isFinite(timezoneOffsetMinutes)
        ? timezoneOffsetMinutes
        : offsetMinutesForTimeZone(dt, DEFAULT_TIMEZONE)
    // Convert to the user's local midnight (based on client offset), then store as UTC ISO.
    const utcMs =
      Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate(), 0, 0, 0, 0) + effectiveOffset * 60 * 1000
    return new Date(utcMs).toISOString()
  }

  return {
    ...offer,
    has_specific_time: false,
    start_at: normalize(offer.start_at) ?? undefined,
    end_at: normalize(offer.end_at) ?? null
  }
}

function enforceOfferTypeConsistency(offer: ParsedOffer): ParsedOffer {
  const inferred = inferOfferTypeFromText([offer.title, offer.notes])
  if (!inferred || inferred === offer.offer_type) return offer
  return {
    ...offer,
    offer_type: inferred,
    warnings: [
      ...(offer.warnings || []),
      `Offer type adjusted to "${inferred}" from text cues.`
    ]
  }
}

/** Calendar Y/M/D in a named zone (or UTC if Intl fails). */
function ymdInTimeZone(date: Date, timeZone: string): { y: number; m: number; d: number } {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(date)
    const pick = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 'NaN')
    const y = pick('year')
    const m = pick('month')
    const d = pick('day')
    if (Number.isFinite(y) && Number.isFinite(m) && Number.isFinite(d)) return { y, m, d }
  } catch (_) {
    // fall through
  }
  return { y: date.getUTCFullYear(), m: date.getUTCMonth() + 1, d: date.getUTCDate() }
}

/**
 * When the flyer omits a year: pick this year if that month/day is still today-or-later,
 * otherwise next year (e.g. Nov → January). Always the nearest upcoming occurrence within ~364 days.
 */
function inferUpcomingYearForMonthDay(month: number, day: number, now = new Date(), timeZone = DEFAULT_TIMEZONE): number {
  const nowParts = ymdInTimeZone(now, timeZone)
  const eventMd = month * 100 + day
  const nowMd = nowParts.m * 100 + nowParts.d
  if (eventMd >= nowMd) return nowParts.y
  return nowParts.y + 1
}

/** Re-year start/end when the flyer had no explicit 4-digit year. */
function applyInferredUpcomingYear(offer: ParsedOffer): ParsedOffer {
  if (offer.has_explicit_year === true || !offer.start_at) return offer
  const start = new Date(offer.start_at)
  if (Number.isNaN(start.getTime())) return offer

  const month = start.getUTCMonth() + 1
  const day = start.getUTCDate()
  const inferredYear = inferUpcomingYearForMonthDay(month, day)
  const priorYear = start.getUTCFullYear()

  const startAdjusted = new Date(start)
  startAdjusted.setUTCFullYear(inferredYear)

  let endAdjustedIso = offer.end_at ?? null
  if (offer.end_at) {
    const end = new Date(offer.end_at)
    if (!Number.isNaN(end.getTime())) {
      const endAdjusted = new Date(end)
      // Preserve multi-day span: shift end by the same year delta as start, then fix wrap.
      const endYear = end.getUTCFullYear() + (inferredYear - priorYear)
      endAdjusted.setUTCFullYear(endYear)
      if (endAdjusted.getTime() < startAdjusted.getTime()) {
        endAdjusted.setUTCFullYear(inferredYear + 1)
      }
      endAdjustedIso = endAdjusted.toISOString()
    }
  }

  const priorWarnings = (offer.warnings || []).filter((w) => !/\byear\b/i.test(String(w)))
  return {
    ...offer,
    start_at: startAdjusted.toISOString(),
    end_at: endAdjustedIso,
    warnings: [
      ...priorWarnings,
      `No explicit year on flyer; assumed ${inferredYear} (nearest upcoming date within a year).`
    ]
  }
}

const MONTH_NAME_TO_NUM: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12
}

function utcDayStamp(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
}

function cloneOfferOnUtcDay(offer: ParsedOffer, year: number, month: number, day: number): ParsedOffer {
  const start = offer.start_at ? new Date(offer.start_at) : new Date(Date.UTC(year, month - 1, day, 12, 0, 0))
  const dayStart = new Date(start)
  dayStart.setUTCFullYear(year, month - 1, day)
  return {
    ...offer,
    start_at: dayStart.toISOString(),
    end_at: null
  }
}

/**
 * "DECEMBER 10 & 11" (or "10 and 11") in title/notes with only one structured day → emit both days.
 */
function expandAmpersandListedDays(offer: ParsedOffer): ParsedOffer[] {
  if (!offer.start_at) return [offer]
  const blob = [offer.title, offer.notes].filter(Boolean).join(' ')
  if (!blob) return [offer]
  const match = blob.match(
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})\s*(?:&|and)\s+(\d{1,2})\b/i
  )
  if (!match) return [offer]
  const month = MONTH_NAME_TO_NUM[match[1].toLowerCase()]
  const dayA = Number(match[2])
  const dayB = Number(match[3])
  if (!month || !Number.isFinite(dayA) || !Number.isFinite(dayB) || dayA === dayB) return [offer]
  if (dayA < 1 || dayA > 31 || dayB < 1 || dayB > 31) return [offer]

  const start = new Date(offer.start_at)
  if (Number.isNaN(start.getTime())) return [offer]
  const year = start.getUTCFullYear()
  const startDay = start.getUTCDate()
  const startMonth = start.getUTCMonth() + 1
  // Only expand when the structured start is one of the listed days in that month.
  if (startMonth !== month || (startDay !== dayA && startDay !== dayB)) return [offer]

  const first = Math.min(dayA, dayB)
  const second = Math.max(dayA, dayB)
  // Guard: only adjacent or near pairs (same weekend block), not wild spans.
  if (second - first > 3) return [offer]

  const days: number[] = []
  for (let d = first; d <= second; d++) days.push(d)
  if (days.length < 2) return [offer]

  return days.map((d, idx) => ({
    ...cloneOfferOnUtcDay(offer, year, month, d),
    warnings: [
      ...((offer.warnings || []).filter((w) => !/expand/i.test(String(w)))),
      ...(idx === 0 ? [`Expanded "${match[0]}" into one event per day.`] : [])
    ]
  }))
}

/**
 * Model collapsed a short multi-day session into start_at..end_at → one event per calendar day.
 * Timed sessions and tournament/drawing blocks only (hotel stays stay as ranges).
 */
function expandMultiDaySessionRange(offer: ParsedOffer): ParsedOffer[] {
  if (!offer.start_at || !offer.end_at) return [offer]
  const allow =
    offer.has_specific_time === true || offer.offer_type === 'tournament' || offer.offer_type === 'drawing'
  if (!allow) return [offer]

  const start = new Date(offer.start_at)
  const end = new Date(offer.end_at)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [offer]

  const daySpan = Math.round((utcDayStamp(end) - utcDayStamp(start)) / 86400000) + 1
  if (daySpan < 2 || daySpan > 4) return [offer]

  const out: ParsedOffer[] = []
  for (let i = 0; i < daySpan; i++) {
    const dayStart = new Date(start)
    dayStart.setUTCDate(start.getUTCDate() + i)
    out.push({
      ...offer,
      start_at: dayStart.toISOString(),
      end_at: null,
      warnings: [
        ...((offer.warnings || []).filter((w) => !/expand/i.test(String(w)))),
        ...(i === 0 ? [`Expanded ${daySpan}-day session into one event per day.`] : [])
      ]
    })
  }
  return out
}

function expandSessionDays(offers: ParsedOffer[]): ParsedOffer[] {
  const expanded: ParsedOffer[] = []
  for (const offer of offers) {
    const fromRange = expandMultiDaySessionRange(offer)
    for (const piece of fromRange) {
      expanded.push(...expandAmpersandListedDays(piece))
    }
  }
  // Dedupe same casino+title+UTC day (expansion can double-hit).
  const seen = new Set<string>()
  const deduped: ParsedOffer[] = []
  for (const offer of expanded) {
    if (!offer.start_at) {
      deduped.push(offer)
      continue
    }
    const start = new Date(offer.start_at)
    if (Number.isNaN(start.getTime())) {
      deduped.push(offer)
      continue
    }
    const key = [
      normalizeText(offer.casino_name),
      normalizeText(offer.title),
      start.toISOString().slice(0, 10)
    ].join('|')
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(offer)
  }
  return deduped
}

function toDraftPayload(offer: ParsedOffer): Record<string, unknown> {
  return {
    has_specific_time: offer.has_specific_time === true,
    casino_name: offer.casino_name ?? '',
    offer_type: offer.offer_type ?? 'other',
    title: offer.title ?? '',
    start_at: offer.start_at ?? '',
    end_at: offer.end_at ?? '',
    value_amount: offer.value_amount ?? null,
    notes: offer.notes ?? ''
  }
}

async function findPotentialDuplicateEvent(
  admin: ReturnType<typeof createClient>,
  userId: string,
  parsed: ParsedOffer
): Promise<{ id: string } | null> {
  if (!parsed.start_at || !parsed.title) return null

  const start = new Date(parsed.start_at)
  if (Number.isNaN(start.getTime())) return null
  const from = new Date(start.getTime() - 24 * 60 * 60 * 1000).toISOString()
  const to = new Date(start.getTime() + 24 * 60 * 60 * 1000).toISOString()
  const offerType = parsed.offer_type ?? 'other'

  const { data, error } = await admin
    .from('offer_events')
    .select('id, casino_name, title, offer_type, start_at')
    .eq('user_id', userId)
    .eq('offer_type', offerType)
    .gte('start_at', from)
    .lte('start_at', to)
    .limit(50)

  if (error) throw error
  if (!data?.length) return null

  const targetCasino = normalizeText(parsed.casino_name)
  const targetTitle = normalizeText(parsed.title)
  const targetDay = start.toISOString().slice(0, 10)

  const dup = data.find((row) => {
    const rowDay = new Date(row.start_at).toISOString().slice(0, 10)
    const rowCasino = normalizeText(row.casino_name)
    const casinoMatch = targetCasino ? rowCasino === targetCasino : true
    return casinoMatch && normalizeText(row.title) === targetTitle && rowDay === targetDay
  })
  return dup ? { id: dup.id } : null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')
    if (!supabaseUrl || !serviceRoleKey || !openaiApiKey) {
      throw new Error('Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or OPENAI_API_KEY.')
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const admin = createClient(supabaseUrl, serviceRoleKey)
    const token = authHeader.replace(/^Bearer\s+/i, '').trim()
    const { data: userData, error: userError } = await admin.auth.getUser(token)
    if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: 'Invalid user token.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    const userId = userData.user.id

    const body = await req.json().catch(() => ({}))
    const batchId = typeof body?.batchId === 'string' ? body.batchId : null
    const timezoneOffsetMinutes =
      body && Object.prototype.hasOwnProperty.call(body, 'timezoneOffsetMinutes') && Number.isFinite(Number(body?.timezoneOffsetMinutes))
        ? Number(body.timezoneOffsetMinutes)
        : undefined

    let query = admin
      .from('offer_uploads')
      .select('id, user_id, batch_id, bucket_id, storage_path, file_name, mime_type, status')
      .eq('user_id', userId)
      .eq('status', 'queued')
      .order('created_at', { ascending: true })
      .limit(MAX_BATCH_SIZE)

    if (batchId) query = query.eq('batch_id', batchId)

    const { data: uploads, error: uploadsError } = await query
    if (uploadsError) throw uploadsError
    if (!uploads?.length) {
      return new Response(JSON.stringify({ processed: 0, created: 0, queued_for_review: 0, failed: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (batchId) {
      await admin.from('offer_import_batches').update({ status: 'processing', error_message: null }).eq('id', batchId).eq('user_id', userId)
    }

    // Load the global casino name list once per request (empty = no validation)
    let knownCasinos: KnownCasino[] = []
    try {
      const { data: casinoRows } = await admin
        .from('casinos')
        .select('name, aliases')
        .order('name', { ascending: true })
      if (Array.isArray(casinoRows)) knownCasinos = casinoRows as KnownCasino[]
    } catch (_) {
      // Table may not exist yet; proceed without casino validation
    }

    let created = 0
    let queuedForReview = 0
    let failed = 0

    for (const upload of uploads) {
      await admin.from('offer_uploads').update({ status: 'parsing', parse_error: null }).eq('id', upload.id).eq('user_id', userId)

      try {
        const bucketId = upload.bucket_id || 'offer-mailers'
        let fileBlob: Blob
        if (bucketId === 'cf-r2') {
          // storage_path is the full R2 public URL
          const r2Res = await fetch(upload.storage_path)
          if (!r2Res.ok) throw new Error(`R2 image fetch failed (${r2Res.status}): ${upload.storage_path}`)
          fileBlob = await r2Res.blob()
        } else {
          const { data, error: fileError } = await admin.storage.from(bucketId).download(upload.storage_path)
          if (fileError || !data) throw fileError || new Error('Image download failed.')
          fileBlob = data
        }

        const parsedRawList = await parseOffersFromImage(openaiApiKey, upload.mime_type || 'image/jpeg', new Uint8Array(await fileBlob.arrayBuffer()))
        const parsedList = expandSessionDays(
          parsedRawList
            .map((p) => applyInferredUpcomingYear(enforceOfferTypeConsistency(normalizeToAllDayIfNeeded(p, timezoneOffsetMinutes))))
            .map((p) => {
              if (!p.title || !p.title.trim()) p.title = defaultTitleForOfferType(p.offer_type)
              return p
            })
        )

        if (parsedList.length === 0) {
          const { error: reviewError } = await admin.from('offer_ai_review_items').insert({
            user_id: userId,
            upload_id: upload.id,
            batch_id: upload.batch_id ?? null,
            draft: toDraftPayload({ offer_type: 'other', title: 'Offer', warnings: ['No casino offer event visible in the image.'] }),
            warnings: ['No casino offer event visible in the image.']
          })
          if (reviewError) throw reviewError
          await admin
            .from('offer_uploads')
            .update({ status: 'parsed', parse_error: null, review_required: true })
            .eq('id', upload.id)
            .eq('user_id', userId)
          queuedForReview += 1
          continue
        }

        let createdForUpload = 0
        let reviewForUpload = 0

        for (let idx = 0; idx < parsedList.length; idx++) {
          const parsed = parsedList[idx]
          const confidence = Number.isFinite(parsed.confidence) ? Math.max(0, Math.min(1, Number(parsed.confidence))) : 0
          const warnings = Array.isArray(parsed.warnings) ? parsed.warnings.filter(Boolean) : []
          const hasCasino = !!(parsed.casino_name && parsed.casino_name.trim())
          const hasTitle = !!(parsed.title && parsed.title.trim())
          const hasStart = !!parsed.start_at

          // Casino name validation — only runs when the global list is populated
          let casinoKnown = true
          if (hasCasino && knownCasinos.length > 0) {
            const match = matchCasinoName(parsed.casino_name!, knownCasinos)
            if (match.matched) {
              parsed.casino_name = match.canonical ?? parsed.casino_name
            } else {
              casinoKnown = false
              warnings.push(`Unrecognized casino: "${parsed.casino_name}" — please verify and add to the casino list.`)
            }
          }

          const hasRequiredFields = hasCasino && casinoKnown && hasTitle && hasStart
          const shouldAutoCreate = confidence >= AUTO_CREATE_CONFIDENCE && hasRequiredFields

          if (shouldAutoCreate) {
            const dup = await findPotentialDuplicateEvent(admin, userId, parsed)
            if (dup) {
              const duplicateWarnings = [`Possible duplicate of existing event ${dup.id}; auto-create skipped.`, ...warnings]
              const { error: reviewError } = await admin.from('offer_ai_review_items').insert({
                user_id: userId,
                upload_id: upload.id,
                batch_id: upload.batch_id ?? null,
                draft: { ...toDraftPayload(parsed), ai_sequence: idx + 1 },
                warnings: duplicateWarnings
              })
              if (reviewError) throw reviewError
              reviewForUpload += 1
              continue
            }

            const eventRow = {
              user_id: userId,
              casino_name: parsed.casino_name,
              offer_type: parsed.offer_type ?? 'other',
              title: parsed.title,
              start_at: parsed.start_at,
              end_at: parsed.end_at,
              value_amount: parsed.value_amount ?? null,
              notes: parsed.notes ?? null,
              source_type: 'image_ai',
              source_image_path: upload.storage_path,
              ai_confidence: Number((confidence * 100).toFixed(2))
            }
            const { error: eventError } = await admin.from('offer_events').insert(eventRow)
            if (eventError) throw eventError
            createdForUpload += 1
            continue
          }

          const reviewRow = {
            user_id: userId,
            upload_id: upload.id,
            batch_id: upload.batch_id ?? null,
            draft: { ...toDraftPayload(parsed), ai_sequence: idx + 1 },
            warnings:
              warnings.length > 0
                ? warnings
                : hasRequiredFields
                  ? [`Auto-create skipped: confidence ${confidence.toFixed(2)} below threshold ${AUTO_CREATE_CONFIDENCE.toFixed(2)}.`]
                  : [
                      `Auto-create skipped: missing required field(s): ${
                        [
                          hasCasino && casinoKnown ? null : !hasCasino ? 'casino_name' : 'unrecognized casino',
                          hasTitle ? null : 'title',
                          hasStart ? null : 'start_at'
                        ]
                          .filter(Boolean)
                          .join(', ') || 'unknown'
                      }.`
                    ]
          }
          const { error: reviewError } = await admin.from('offer_ai_review_items').insert(reviewRow)
          if (reviewError) throw reviewError
          reviewForUpload += 1
        }

        await admin
          .from('offer_uploads')
          .update({ status: 'parsed', parse_error: null, review_required: reviewForUpload > 0 })
          .eq('id', upload.id)
          .eq('user_id', userId)
        created += createdForUpload
        queuedForReview += reviewForUpload
      } catch (err) {
        failed += 1
        const message = err instanceof Error ? err.message : String(err)
        await admin
          .from('offer_uploads')
          .update({ status: 'failed', parse_error: message.slice(0, 500) })
          .eq('id', upload.id)
          .eq('user_id', userId)
      }
    }

    if (batchId) {
      const { data: batchUploads } = await admin
        .from('offer_uploads')
        .select('status')
        .eq('user_id', userId)
        .eq('batch_id', batchId)

      const statuses = (batchUploads ?? []).map((row) => row.status)
      let batchStatus = 'completed'
      let errorMessage: string | null = null
      if (statuses.some((s) => s === 'queued' || s === 'parsing')) {
        batchStatus = 'processing'
      } else if (statuses.some((s) => s === 'failed')) {
        batchStatus = 'completed_with_errors'
        errorMessage = 'One or more uploads failed parsing. Check offer_uploads.parse_error.'
      }
      await admin
        .from('offer_import_batches')
        .update({ status: batchStatus, error_message: errorMessage })
        .eq('id', batchId)
        .eq('user_id', userId)
    }

    return new Response(
      JSON.stringify({
        processed: uploads.length,
        created,
        queued_for_review: queuedForReview,
        failed
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected error'
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
