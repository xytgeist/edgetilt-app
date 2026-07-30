/**
 * Soft tournament events for the Start/Log proximity picker.
 * Distance comes from matching venue_name → nearby casino GPS rows.
 */

import { normalizeTournamentVenue } from './pokerTournamentEventKeys.js'
import { fmtPoker$ } from './pokerBankrollMath.js'

export const POKER_TOURNAMENT_MANUAL_PICK_ID = '__manual__'

/** Past window (days) for soft-event picker by event_date (yesterday…). */
const PAST_DAYS = 1
/** Future window (days) for soft-event picker. */
const FUTURE_DAYS = 60
/** Keep older event_date rows if anyone logged/swapped against them this recently. */
export const SOFT_EVENT_ACTIVITY_GRACE_MS = 36 * 60 * 60 * 1000
const FETCH_LIMIT = 200

/**
 * @param {Date} [now]
 * @returns {{ from: string, to: string, activitySinceIso: string }}
 */
export function softEventDateWindow(now = new Date()) {
  const from = new Date(now)
  from.setDate(from.getDate() - PAST_DAYS)
  const to = new Date(now)
  to.setDate(to.getDate() + FUTURE_DAYS)
  const ymd = (d) => {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }
  return {
    from: ymd(from),
    to: ymd(to),
    activitySinceIso: new Date(now.getTime() - SOFT_EVENT_ACTIVITY_GRACE_MS).toISOString(),
  }
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
 * @param {object} event
 * @param {number | null} distanceMi
 */
export function formatSoftTournamentOptionLabel(event, distanceMi) {
  const buyIn = Number(event?.buy_in)
  const buyStr = Number.isFinite(buyIn) ? fmtPoker$(buyIn) : ''
  const name = String(event?.display_name || '').trim()
  const venue = String(event?.venue_name || '').trim()
  const title = name || venue || 'Tournament'
  const bits = []
  if (buyStr) bits.push(buyStr)
  bits.push(title)
  if (name && venue && normalizeTournamentVenue(name) !== normalizeTournamentVenue(venue)) {
    bits.push(venue)
  }
  if (distanceMi != null && Number.isFinite(distanceMi)) {
    bits.push(distanceMi < 10 ? `${distanceMi.toFixed(1)} mi` : `${Math.round(distanceMi)} mi`)
  }
  return bits.join(' · ')
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{
 *   venueKind?: string | null,
 *   nearbyCasinos?: Array<{ name?: string, distanceMi?: number }>,
 * }} [opts]
 * @returns {Promise<{
 *   events: Array<object & { distanceMi: number | null, optionLabel: string }>,
 *   error: Error | null,
 * }>}
 */
export async function loadNearbySoftTournamentEvents(supabase, opts = {}) {
  if (!supabase) return { events: [], error: new Error('Missing supabase client.') }

  const { from, to, activitySinceIso } = softEventDateWindow()
  const selectCols =
    'id, fingerprint_key, fingerprint_sibling, venue_name, event_date, buy_in, game_variant, currency, display_name, last_activity_at'

  // Date window (yesterday → future) OR recent logging activity (Day 2 / late reg).
  const [byDate, byActivity] = await Promise.all([
    supabase
      .from('poker_tournament_events')
      .select(selectCols)
      .gte('event_date', from)
      .lte('event_date', to)
      .order('event_date', { ascending: true })
      .limit(FETCH_LIMIT),
    supabase
      .from('poker_tournament_events')
      .select(selectCols)
      .gte('last_activity_at', activitySinceIso)
      .order('last_activity_at', { ascending: false })
      .limit(FETCH_LIMIT),
  ])

  if (byDate.error) {
    const msg = String(byDate.error.message || '')
    if (/last_activity_at/i.test(msg)) {
      const legacy = await supabase
        .from('poker_tournament_events')
        .select(
          'id, fingerprint_key, fingerprint_sibling, venue_name, event_date, buy_in, game_variant, currency, display_name',
        )
        .gte('event_date', from)
        .lte('event_date', to)
        .order('event_date', { ascending: true })
        .limit(FETCH_LIMIT)
      if (legacy.error) return { events: [], error: legacy.error }
      return decorateSoftTournamentEvents(legacy.data || [], opts)
    }
    return { events: [], error: byDate.error }
  }

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

  return decorateSoftTournamentEvents([...byId.values()], opts)
}

/**
 * @param {object[]} data
 * @param {{ venueKind?: string | null, nearbyCasinos?: Array<{ name?: string, distanceMi?: number }> }} opts
 */
function decorateSoftTournamentEvents(data, opts = {}) {

  const venueKind = String(opts.venueKind || 'live')
  const useDistance = venueKind === 'live'
  const distMap = useDistance ? buildVenueDistanceMap(opts.nearbyCasinos || []) : new Map()

  const rows = (data || []).map((row) => {
    const distanceMi = useDistance ? distanceForVenue(row.venue_name, distMap) : null
    return {
      ...row,
      distanceMi,
      optionLabel: formatSoftTournamentOptionLabel(row, distanceMi),
    }
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
 */
export function applySoftTournamentEventToForm(prevForm, event, helpers) {
  if (!event?.id) {
    return { ...prevForm, tournament_event_pick: POKER_TOURNAMENT_MANUAL_PICK_ID }
  }
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

  const buyIn = Number(event.buy_in)
  const eventDate = String(event.event_date || '').trim().slice(0, 10)
  const displayName = String(event.display_name || '').trim()

  return {
    ...prevForm,
    tournament_event_pick: String(event.id),
    venue_kind,
    venue_name,
    online_site_pick,
    club_app_pick,
    buy_in: Number.isFinite(buyIn) ? String(buyIn) : prevForm.buy_in,
    currency: helpers.normalizeCurrency(event.currency),
    game_variant: gamePick.game_variant,
    game_custom_name: gamePick.game_custom_name,
    tournament_name: displayName || prevForm.tournament_name,
    date: eventDate || prevForm.date,
  }
}
