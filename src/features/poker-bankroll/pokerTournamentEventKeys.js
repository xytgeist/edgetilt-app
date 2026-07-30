/**
 * Soft tournament event fingerprints.
 * Identity = venue + calendar date + buy-in + game_variant + currency.
 * Free-text tournament name is display-only (never in the match key).
 */

/** @param {unknown} s */
export function normalizeTournamentVenue(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

/** @param {unknown} s */
function normalizeVenue(s) {
  return normalizeTournamentVenue(s)
}

/** @param {unknown} s */
function normalizeGame(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

/**
 * @param {{
 *   venue_name?: string | null,
 *   event_date?: string | null,
 *   buy_in?: number | string | null,
 *   game_variant?: string | null,
 *   currency?: string | null,
 * }} parts
 */
export function buildTournamentFingerprintKey(parts) {
  const venue = normalizeVenue(parts.venue_name)
  const date = String(parts.event_date || '').trim().slice(0, 10)
  const buyIn = Number(parts.buy_in)
  const buyinCents = Number.isFinite(buyIn) ? Math.round(buyIn * 100) : NaN
  const game = normalizeGame(parts.game_variant)
  const currency = String(parts.currency || 'USD')
    .trim()
    .toUpperCase() || 'USD'
  if (!venue || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(buyinCents)) {
    return null
  }
  return `${venue}|${date}|${buyinCents}|${game}|${currency}`
}

/**
 * Pick a canonical display label for a soft-event cluster.
 * Prefer most common non-empty name; else longest; else first.
 * @param {string[]} names
 */
export function pickCanonicalEventDisplayName(names) {
  const cleaned = (names || [])
    .map((n) => String(n || '').trim())
    .filter(Boolean)
  if (cleaned.length === 0) return null
  /** @type {Map<string, { count: number, sample: string }>} */
  const counts = new Map()
  for (const name of cleaned) {
    const key = name.toLowerCase()
    const prev = counts.get(key)
    if (prev) prev.count += 1
    else counts.set(key, { count: 1, sample: name })
  }
  let best = null
  for (const entry of counts.values()) {
    if (
      !best ||
      entry.count > best.count ||
      (entry.count === best.count && entry.sample.length > best.sample.length)
    ) {
      best = entry
    }
  }
  return best?.sample || cleaned[0]
}

/**
 * True when free-text names look different enough to warrant a “same event?” confirm.
 * @param {string | null | undefined} a
 * @param {string | null | undefined} b
 */
export function eventDisplayNamesDiffer(a, b) {
  const left = String(a || '')
    .trim()
    .toLowerCase()
  const right = String(b || '')
    .trim()
    .toLowerCase()
  if (!left || !right) return false
  return left !== right
}
