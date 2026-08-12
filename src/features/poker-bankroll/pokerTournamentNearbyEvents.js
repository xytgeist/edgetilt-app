/**
 * Live tournament picker: actionable buy-in window (today + ~24h) near GPS-matched venues.
 * Catalog rows may exist further out in DB; only near-term rows are shown here.
 * User soft events: day-of + Day 2 grace (swap clusters), unchanged.
 */

import { normalizeTournamentVenue } from './pokerTournamentEventKeys.js'
import { fmtPoker$ } from './pokerBankrollMath.js'
import {
  pokerOnlineSiteLabelFromId,
  pokerOnlineSiteSelectValue,
} from './pokerSessionLabels.js'

export const POKER_TOURNAMENT_MANUAL_PICK_ID = '__manual__'

/**
 * Picker only: catalog rows through tomorrow (calendar fallback when starts_at is null).
 * Seeding can store weeks ahead; display stays buy-in-now/near-term.
 */
export const CATALOG_PICKER_LOOKAHEAD_DAYS = 1

/** When starts_at is set, show flights starting within this window from now. */
export const CATALOG_BUY_IN_WINDOW_MS = 24 * 60 * 60 * 1000

/** Still list a catalog row briefly after start (late reg / clocking in). */
export const CATALOG_LATE_REG_GRACE_MS = 2 * 60 * 60 * 1000

/** Keep older user soft events if anyone logged/swapped against them this recently. */
export const SOFT_EVENT_ACTIVITY_GRACE_MS = 36 * 60 * 60 * 1000
const FETCH_LIMIT = 200

/**
 * @param {Date} [now]
 * @returns {string}
 */
export function pokerPickerTodayIso(now = new Date()) {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * User soft events: calendar today by event_date, plus 36h activity grace.
 * @param {Date} [now]
 * @returns {{ today: string, activitySinceIso: string }}
 */
export function softEventDateWindow(now = new Date()) {
  const today = pokerPickerTodayIso(now)
  return {
    today,
    activitySinceIso: new Date(now.getTime() - SOFT_EVENT_ACTIVITY_GRACE_MS).toISOString(),
  }
}

/**
 * Catalog rows eligible for the picker: today through tomorrow (~24h buy-in window).
 * @param {Date} [now]
 * @returns {{ from: string, to: string, today: string }}
 */
export function catalogPickerDateWindow(now = new Date()) {
  const today = pokerPickerTodayIso(now)
  const end = new Date(now.getTime())
  end.setDate(end.getDate() + CATALOG_PICKER_LOOKAHEAD_DAYS)
  const to = pokerPickerTodayIso(end)
  return { from: today, to, today }
}

/**
 * @param {object} row
 * @param {Date} [now]
 */
export function isCatalogRowInBuyInWindow(row, now = new Date()) {
  if (String(row?.source || '') !== 'catalog') return true
  const startsAtRaw = row?.starts_at
  if (startsAtRaw) {
    const startsAt = new Date(startsAtRaw)
    if (!Number.isNaN(startsAt.getTime())) {
      const t = startsAt.getTime()
      const earliest = now.getTime() - CATALOG_LATE_REG_GRACE_MS
      const latest = now.getTime() + CATALOG_BUY_IN_WINDOW_MS
      return t >= earliest && t <= latest
    }
  }
  const { from, to } = catalogPickerDateWindow(now)
  const d = String(row?.event_date || '').slice(0, 10)
  return d >= from && d <= to
}

/**
 * @param {string} isoDate YYYY-MM-DD
 */
export function formatPickerEventDateLabel(isoDate) {
  const d = new Date(`${isoDate}T12:00:00`)
  if (Number.isNaN(d.getTime())) return isoDate
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()]
  return `${dow} ${d.getMonth() + 1}/${d.getDate()}`
}

/**
 * @param {string | null | undefined} iso
 */
export function formatPickerStartTimeLabel(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

/**
 * @param {Array<{ name?: string, distanceMi?: number }>} nearbyCasinos
 * @returns {Map<string, number>}
 */
export function buildVenueDistanceMap(nearbyCasinos) {
  /** @type {Map<string, number>} */
  const map = new Map()
  for (const c of nearbyCasinos || []) {
    const key = normalizeTournamentVenue(c?.name)
    if (!key) continue
    const dist = Number(c.distanceMi)
    if (!Number.isFinite(dist)) continue
    const prev = map.get(key)
    if (prev == null || dist < prev) map.set(key, dist)
  }
  return map
}

/**
 * @param {string | null | undefined} venueName
 * @param {Map<string, number>} venueDistanceMap
 * @returns {number | null}
 */
export function distanceForVenue(venueName, venueDistanceMap) {
  const key = normalizeTournamentVenue(venueName)
  if (!key || !venueDistanceMap?.size) return null
  if (venueDistanceMap.has(key)) return venueDistanceMap.get(key) ?? null
  // Loose contains match (e.g. "Park MGM" vs "Park MGM Las Vegas")
  let best = null
  for (const [casinoKey, dist] of venueDistanceMap) {
    if (key.includes(casinoKey) || casinoKey.includes(key)) {
      if (best == null || dist < best) best = dist
    }
  }
  return best
}

/**
 * MTTDB / catalog display_name often opens with "$100 NLH …"; skip duplicate buy-in prefix.
 * @param {string | null | undefined} displayName
 * @param {number} buyIn
 */
export function displayNameAlreadyHasLeadingBuyIn(displayName, buyIn) {
  const name = String(displayName || '').trim()
  if (!name || !Number.isFinite(buyIn)) return false
  const match = name.match(/^\$(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?)/)
  if (!match) return false
  const leading = Number(match[1].replace(/,/g, ''))
  if (!Number.isFinite(leading)) return false
  return Math.abs(leading - buyIn) < 0.005
}

/**
 * @param {object} event
 * @param {number | null} distanceMi
 * @param {string} [todayIso]
 */
export function formatSoftTournamentOptionLabel(event, distanceMi, todayIso) {
  const buyIn = Number(event?.buy_in)
  const buyStr = Number.isFinite(buyIn) ? fmtPoker$(buyIn) : ''
  const name = String(event?.display_name || '').trim()
  const venue = String(event?.venue_name || '').trim()
  const title = name || venue || 'Tournament'
  const eventDate = String(event?.event_date || '').trim().slice(0, 10)
  const startTime = formatPickerStartTimeLabel(event?.starts_at)
  const bits = []
  if (buyStr && !displayNameAlreadyHasLeadingBuyIn(name, buyIn)) bits.push(buyStr)
  bits.push(title)
  if (startTime) bits.push(startTime)
  else if (todayIso && eventDate && eventDate !== todayIso) {
    bits.push(formatPickerEventDateLabel(eventDate))
  }
  if (name && venue && normalizeTournamentVenue(name) !== normalizeTournamentVenue(venue)) {
    bits.push(venue)
  }
  if (distanceMi != null && Number.isFinite(distanceMi)) {
    bits.push(distanceMi < 10 ? `${distanceMi.toFixed(1)} mi` : `${Math.round(distanceMi)} mi`)
  }
  return bits.join(' · ')
}

const PICKER_SELECT_COLS =
  'id, source, fingerprint_key, fingerprint_sibling, venue_name, event_date, starts_at, buy_in, game_variant, currency, display_name, last_activity_at'

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{
 *   venueKind?: string | null,
 *   nearbyCasinos?: Array<{ name?: string, distanceMi?: number }>,
 *   onlineSitePick?: string | null,
 * }} [opts]
 * @returns {Promise<{
 *   events: Array<object & { distanceMi: number | null, optionLabel: string }>,
 *   error: Error | null,
 * }>}
 */
export async function loadNearbySoftTournamentEvents(supabase, opts = {}) {
  if (!supabase) return { events: [], error: new Error('Missing supabase client.') }

  const now = new Date()
  const { today, activitySinceIso } = softEventDateWindow(now)
  const catalogWindow = catalogPickerDateWindow(now)
  const venueKind = String(opts.venueKind || 'live')
  const onlineSitePick = String(opts.onlineSitePick || '').trim()
  const onlineSiteLabel =
    venueKind === 'online' && onlineSitePick ? pokerOnlineSiteLabelFromId(onlineSitePick) : ''

  // Online: filter by site in SQL. A global 200-row cap was GGPoker-heavy and hid PokerStars etc.
  let catalogQuery = supabase
    .from('poker_tournament_events')
    .select(PICKER_SELECT_COLS)
    .eq('source', 'catalog')
    .gte('event_date', catalogWindow.from)
    .lte('event_date', catalogWindow.to)
    .order('event_date', { ascending: true })
    .limit(FETCH_LIMIT)
  if (onlineSiteLabel) {
    catalogQuery = catalogQuery.eq('venue_name', onlineSiteLabel)
  }

  const [catalogRes, userTodayRes, userActivityRes] = await Promise.all([
    catalogQuery,
    supabase
      .from('poker_tournament_events')
      .select(PICKER_SELECT_COLS)
      .eq('event_date', today)
      .or('source.eq.user,source.is.null')
      .order('event_date', { ascending: true })
      .limit(FETCH_LIMIT),
    supabase
      .from('poker_tournament_events')
      .select(PICKER_SELECT_COLS)
      .gte('last_activity_at', activitySinceIso)
      .or('source.eq.user,source.is.null')
      .order('last_activity_at', { ascending: false })
      .limit(FETCH_LIMIT),
  ])

  if (catalogRes.error && /source|column/i.test(String(catalogRes.error.message || ''))) {
    return loadLegacyPickerEvents(supabase, opts, today, activitySinceIso)
  }

  const firstErr = catalogRes.error || userTodayRes.error || userActivityRes.error
  if (firstErr) {
    const msg = String(firstErr.message || '')
    if (/last_activity_at/i.test(msg)) {
      return loadLegacyPickerEvents(supabase, opts, today, activitySinceIso)
    }
    return { events: [], error: firstErr }
  }

  /** @type {Map<string, object>} */
  const byId = new Map()
  for (const row of catalogRes.data || []) {
    if (row?.id && isCatalogRowInBuyInWindow(row, now)) byId.set(String(row.id), row)
  }
  for (const row of userTodayRes.data || []) {
    if (row?.id) byId.set(String(row.id), row)
  }
  if (!userActivityRes.error) {
    for (const row of userActivityRes.data || []) {
      if (row?.id && !byId.has(String(row.id))) byId.set(String(row.id), row)
    }
  }

  return decorateSoftTournamentEvents([...byId.values()], opts, today, now)
}

/**
 * Pre-catalog migration fallback: today-only query (previous behavior).
 */
async function loadLegacyPickerEvents(supabase, opts, today, activitySinceIso) {
  const legacyCols =
    'id, fingerprint_key, fingerprint_sibling, venue_name, event_date, buy_in, game_variant, currency, display_name, last_activity_at'

  const [byDate, byActivity] = await Promise.all([
    supabase
      .from('poker_tournament_events')
      .select(legacyCols)
      .eq('event_date', today)
      .order('event_date', { ascending: true })
      .limit(FETCH_LIMIT),
    supabase
      .from('poker_tournament_events')
      .select(legacyCols)
      .gte('last_activity_at', activitySinceIso)
      .order('last_activity_at', { ascending: false })
      .limit(FETCH_LIMIT),
  ])

  if (byDate.error) return { events: [], error: byDate.error }

  /** @type {Map<string, object>} */
  const byId = new Map()
  for (const row of byDate.data || []) {
    if (row?.id) byId.set(String(row.id), row)
  }
  if (!byActivity.error) {
    for (const row of byActivity.data || []) {
      if (row?.id && !byId.has(String(row.id))) byId.set(String(row.id), row)
    }
  }

  return decorateSoftTournamentEvents([...byId.values()], opts, today)
}

/**
 * @param {object[]} data
 * @param {{ venueKind?: string | null, nearbyCasinos?: Array<{ name?: string, distanceMi?: number }> }} opts
 * @param {string} todayIso
 * @param {Date} [now]
 */
function decorateSoftTournamentEvents(data, opts = {}, todayIso, now = new Date()) {
  const venueKind = String(opts.venueKind || 'live')
  const useDistance = venueKind === 'live'
  const useOnlineSite = venueKind === 'online'
  const onlineSitePick = String(opts.onlineSitePick || '').trim()
  const onlineSiteLabel = onlineSitePick ? pokerOnlineSiteLabelFromId(onlineSitePick) : ''
  const nearbyCasinos = opts.nearbyCasinos || []
  const gpsReady = useDistance && nearbyCasinos.length > 0
  const distMap = useDistance ? buildVenueDistanceMap(nearbyCasinos) : new Map()

  const rows = (data || [])
    .map((row) => {
      const distanceMi = useDistance ? distanceForVenue(row.venue_name, distMap) : null
      return {
        ...row,
        distanceMi,
        optionLabel: formatSoftTournamentOptionLabel(row, distanceMi, todayIso),
      }
    })
    .filter((row) => {
      if (String(row.source || '') === 'catalog' && useOnlineSite) {
        if (!onlineSitePick) return false
        const siteId = pokerOnlineSiteSelectValue(row.venue_name)
        if (siteId && siteId === onlineSitePick) return isCatalogRowInBuyInWindow(row, now)
        if (
          onlineSiteLabel &&
          normalizeTournamentVenue(row.venue_name) === normalizeTournamentVenue(onlineSiteLabel)
        ) {
          return isCatalogRowInBuyInWindow(row, now)
        }
        return false
      }
      if (String(row.source || '') === 'catalog' && gpsReady && row.distanceMi == null) {
        return false
      }
      if (String(row.source || '') === 'catalog') {
        return isCatalogRowInBuyInWindow(row, now)
      }
      if (useOnlineSite) {
        if (!onlineSitePick) return false
        const siteId = pokerOnlineSiteSelectValue(row.venue_name)
        if (siteId && siteId === onlineSitePick) return true
        if (
          onlineSiteLabel &&
          normalizeTournamentVenue(row.venue_name) === normalizeTournamentVenue(onlineSiteLabel)
        ) {
          return true
        }
        return false
      }
      return true
    })

  rows.sort((a, b) => {
    if (useDistance) {
      const ad = a.distanceMi
      const bd = b.distanceMi
      const aHas = ad != null && Number.isFinite(ad)
      const bHas = bd != null && Number.isFinite(bd)
      if (aHas && bHas && ad !== bd) return ad - bd
      if (aHas && !bHas) return -1
      if (!aHas && bHas) return 1
    }

    const aStart = a.starts_at ? new Date(a.starts_at).getTime() : NaN
    const bStart = b.starts_at ? new Date(b.starts_at).getTime() : NaN
    const aHasStart = Number.isFinite(aStart)
    const bHasStart = Number.isFinite(bStart)
    if (aHasStart && bHasStart && aStart !== bStart) return aStart - bStart
    if (aHasStart && !bHasStart) return -1
    if (!aHasStart && bHasStart) return 1

    const da = String(a.event_date || '')
    const db = String(b.event_date || '')
    if (da !== db) return da.localeCompare(db)

    return String(a.optionLabel || '').localeCompare(String(b.optionLabel || ''), undefined, {
      sensitivity: 'base',
    })
  })

  return { events: rows, error: null }
}

/**
 * Menu options for Tournament picker (includes Enter manually…).
 * @param {Array<object & { id: string, optionLabel: string }>} events
 */
export function softTournamentPickerOptions(events) {
  const opts = [{ id: '', label: 'Select tournament…' }]
  for (const e of events || []) {
    opts.push({
      id: String(e.id),
      label: e.optionLabel || 'Tournament',
    })
  }
  opts.push({ id: POKER_TOURNAMENT_MANUAL_PICK_ID, label: 'Enter manually…' })
  return opts
}

/**
 * Whether form.tournament_event_pick is a real soft-event UUID.
 * @param {unknown} pick
 */
export function isSoftTournamentEventPick(pick) {
  const id = String(pick || '').trim()
  if (!id || id === POKER_TOURNAMENT_MANUAL_PICK_ID) return false
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    id,
  )
}

/**
 * Autofill Start/Log form fields from a soft event row.
 * Switches Where to Live/Online/Club based on venue match when possible.
 *
 * @param {object} prevForm
 * @param {object} event
 * @param {{
 *   normalizeCurrency: (c: unknown) => string,
 *   pokerGamePickFromStored: (stored: unknown, sessionType?: string) => { game_variant: string, game_custom_name: string },
 *   pokerOnlineSiteSelectValue: (venueName: string) => string,
 *   pokerOnlineSiteLabelFromId: (id: string) => string,
 *   pokerClubAppSelectValue: (venueName: string) => string,
 *   pokerClubAppLabelFromId: (id: string) => string,
 * }} helpers
 * @param {{ preserveVenueContext?: boolean }} [opts]
 */
export function applySoftTournamentEventToForm(prevForm, event, helpers, opts = {}) {
  if (!event?.id) {
    return { ...prevForm, tournament_event_pick: POKER_TOURNAMENT_MANUAL_PICK_ID }
  }
  const preserveVenueContext = Boolean(opts.preserveVenueContext)
  const venue = String(event.venue_name || '').trim()
  const gamePick = helpers.pokerGamePickFromStored(event.game_variant, 'tournament')
  const onlinePick = helpers.pokerOnlineSiteSelectValue(venue)
  const clubPick = helpers.pokerClubAppSelectValue(venue)

  let venue_kind = 'live'
  let online_site_pick = ''
  let club_app_pick = ''
  let venue_name = venue

  if (onlinePick) {
    venue_kind = 'online'
    online_site_pick = onlinePick
    venue_name = helpers.pokerOnlineSiteLabelFromId(onlinePick) || venue
  } else if (clubPick) {
    venue_kind = 'club'
    club_app_pick = clubPick
    venue_name = helpers.pokerClubAppLabelFromId(clubPick) || venue
  }

  const venueFields = preserveVenueContext
    ? {
        venue_kind: prevForm.venue_kind,
        online_site_pick: prevForm.online_site_pick,
        club_app_pick: prevForm.club_app_pick,
        venue_name:
          prevForm.venue_kind === 'live'
            ? venue || prevForm.venue_name
            : prevForm.venue_name,
      }
    : {
        venue_kind,
        venue_name,
        online_site_pick,
        club_app_pick,
      }

  const buyIn = Number(event.buy_in)
  const eventDate = String(event.event_date || '').trim().slice(0, 10)
  const displayName = String(event.display_name || '').trim()

  return {
    ...prevForm,
    tournament_event_pick: String(event.id),
    ...venueFields,
    buy_in: Number.isFinite(buyIn) ? String(buyIn) : prevForm.buy_in,
    currency: helpers.normalizeCurrency(event.currency),
    game_variant: gamePick.game_variant,
    game_custom_name: gamePick.game_custom_name,
    tournament_name: displayName || prevForm.tournament_name,
    date: eventDate || prevForm.date,
  }
}
