import {
  buildTournamentFingerprintKey,
  eventDisplayNamesDiffer,
  pickCanonicalEventDisplayName,
} from './pokerTournamentEventKeys.js'
import { localYmd, pokerSessionTotalCost } from './pokerBankrollMath.js'
import { parseSwapPct } from './pokerTournamentSwapMath.js'
import { parseGuestNotifyContact } from '../../utils/guestNotifyContact.js'

export function isMissingTournamentSwapTableError(err) {
  const msg = String(err?.message || err?.details || '')
  const code = String(err?.code || '')
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    /poker_tournament_swaps|poker_tournament_events/i.test(msg)
  )
}

/**
 * @param {object} session
 * @returns {{ buyIn: number, prize: number } | null}
 */
export function sessionResultSnapshot(session) {
  if (!session || session.cash_out == null || session.cash_out === '') return null
  const buyIn = pokerSessionTotalCost(session)
  const prize = (Number(session.cash_out) || 0) + (Number(session.bounty_winnings) || 0)
  return { buyIn, prize }
}

/**
 * Resolve or create a soft event. When an existing cluster has a different display
 * name and `forceSibling` is false, returns `{ needsConfirm: true, existing }`.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {{
 *   venue_name: string,
 *   event_date: string,
 *   buy_in: number,
 *   game_variant?: string | null,
 *   currency?: string | null,
 *   display_name?: string | null,
 *   forceSibling?: boolean,
 *   confirmSameEvent?: boolean,
 * }} input
 */
export async function ensureTournamentEvent(supabase, userId, input) {
  const fingerprint_key = buildTournamentFingerprintKey(input)
  if (!fingerprint_key) {
    return { error: new Error('Need venue, date, buy-in, and game to link an event.') }
  }

  const { data: existingRows, error: findErr } = await supabase
    .from('poker_tournament_events')
    .select('*')
    .eq('fingerprint_key', fingerprint_key)
    .order('fingerprint_sibling', { ascending: true })

  if (findErr) return { error: findErr }

  const rows = existingRows || []
  const displayName = String(input.display_name || '').trim() || null

  if (!input.forceSibling && rows.length > 0) {
    const primary = rows[0]
    if (
      !input.confirmSameEvent &&
      eventDisplayNamesDiffer(displayName, primary.display_name)
    ) {
      return { needsConfirm: true, existing: primary, candidates: rows }
    }
    // Join primary cluster; refresh canonical label when useful.
    if (displayName) {
      const nextLabel = pickCanonicalEventDisplayName([
        primary.display_name,
        displayName,
      ])
      if (nextLabel && nextLabel !== primary.display_name) {
        const { data: updated, error: uErr } = await supabase
          .from('poker_tournament_events')
          .update({ display_name: nextLabel })
          .eq('id', primary.id)
          .select('*')
          .single()
        if (!uErr && updated) return { event: updated }
      }
    }
    return { event: primary }
  }

  let sibling = 0
  if (input.forceSibling && rows.length > 0) {
    sibling = Math.max(...rows.map((r) => Number(r.fingerprint_sibling) || 0)) + 1
  }

  const { data: created, error: cErr } = await supabase
    .from('poker_tournament_events')
    .insert({
      source: 'user',
      fingerprint_key,
      fingerprint_sibling: sibling,
      venue_name: String(input.venue_name || '').trim(),
      event_date: String(input.event_date).slice(0, 10),
      buy_in: Number(input.buy_in),
      game_variant: input.game_variant || null,
      currency: String(input.currency || 'USD').toUpperCase(),
      display_name: displayName,
      created_by: userId,
    })
    .select('*')
    .single()

  if (cErr) return { error: cErr }
  return { event: created }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 */
export async function loadMyTournamentSwaps(supabase, userId) {
  const { data, error } = await supabase
    .from('poker_tournament_swaps')
    .select('*')
    .or(`creator_user_id.eq.${userId},counterparty_user_id.eq.${userId}`)
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) return { swaps: [], error }
  return { swaps: data || [], error: null }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string[]} userIds
 */
export async function loadSwapCounterpartyProfiles(supabase, userIds) {
  const ids = [...new Set((userIds || []).filter(Boolean))]
  if (ids.length === 0) return { byId: {}, error: null }
  const { data, error } = await supabase
    .from('profiles')
    .select('user_id, display_name, handle, avatar_url')
    .in('user_id', ids)
  if (error) return { byId: {}, error }
  /** @type {Record<string, object>} */
  const byId = {}
  for (const row of data || []) byId[row.user_id] = row
  return { byId, error: null }
}

/**
 * Draft row from the form → DB insert payload pieces.
 * @param {object} draft
 */
export function draftSwapToInsertFields(draft, creatorUserId) {
  const pctYou = parseSwapPct(draft.pct_you_give)
  const pctThem = parseSwapPct(draft.pct_they_give)
  if (pctYou == null || pctThem == null) {
    return { error: 'Enter valid swap %s (0–100).' }
  }
  if (draft.counterparty_kind === 'user') {
    if (!draft.counterparty_user_id) return { error: 'Pick an Edge user for the swap.' }
    return {
      row: {
        creator_user_id: creatorUserId,
        counterparty_kind: 'user',
        counterparty_user_id: draft.counterparty_user_id,
        pct_creator_gives: pctYou,
        pct_counterparty_gives: pctThem,
      },
    }
  }
  const label = String(draft.counterparty_guest_label || '').trim()
  if (!label) return { error: 'Enter a guest name for the swap.' }
  let phone = null
  let email = null
  try {
    ;({ phone, email } = parseGuestNotifyContact({
      email: draft.counterparty_guest_email,
      // SMS dropped for guest swaps (carrier TFV). Email only.
      phone: '',
      label: 'Guest swap',
    }))
  } catch (err) {
    return { error: err?.message || 'Enter valid guest contact info.' }
  }
  return {
    row: {
      creator_user_id: creatorUserId,
      counterparty_kind: 'guest',
      counterparty_guest_label: label,
      counterparty_guest_phone: phone || null,
      counterparty_guest_email: email || null,
      pct_creator_gives: pctYou,
      pct_counterparty_gives: pctThem,
    },
  }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} sessionId
 * @param {object[]} drafts
 * @param {string | null} tournamentEventId
 * @param {object | null} creatorSession For result snapshot when completed
 */
export async function persistDraftSwapsForSession(
  supabase,
  userId,
  sessionId,
  drafts,
  tournamentEventId,
  creatorSession = null,
) {
  if (!drafts?.length) return { swaps: [], error: null }
  const snap = creatorSession ? sessionResultSnapshot(creatorSession) : null
  const rows = []
  for (const draft of drafts) {
    const built = draftSwapToInsertFields(draft, userId)
    if (built.error) return { swaps: [], error: new Error(built.error) }
    rows.push({
      ...built.row,
      creator_session_id: sessionId,
      tournament_event_id: tournamentEventId,
      creator_buy_in: snap?.buyIn ?? (creatorSession ? pokerSessionTotalCost(creatorSession) : null),
      creator_prize: snap?.prize ?? null,
      creator_result_ready: Boolean(snap),
    })
  }
  const { data, error } = await supabase
    .from('poker_tournament_swaps')
    .insert(rows)
    .select('*')
  if (error) return { swaps: [], error }
  return { swaps: data || [], error: null }
}

/**
 * Sync creator result from session and try settle.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} sessionId
 * @param {object} session
 */
export async function syncCreatorResultsForSession(supabase, sessionId, session) {
  const snap = sessionResultSnapshot(session)
  if (!snap) return { error: null, swapIds: [] }
  const { data: swaps, error } = await supabase
    .from('poker_tournament_swaps')
    .select('id, status')
    .eq('creator_session_id', sessionId)
    .eq('status', 'active')
  if (error) return { error, swapIds: [] }
  const swapIds = []
  for (const swap of swaps || []) {
    const { error: uErr } = await supabase
      .from('poker_tournament_swaps')
      .update({
        creator_buy_in: snap.buyIn,
        creator_prize: snap.prize,
        creator_result_ready: true,
      })
      .eq('id', swap.id)
    if (uErr) return { error: uErr, swapIds }
    const { error: sErr } = await supabase.rpc('poker_tournament_swap_try_settle', {
      p_swap_id: swap.id,
    })
    if (sErr) return { error: sErr, swapIds }
    swapIds.push(swap.id)
  }
  return { error: null, swapIds }
}

/**
 * Sync counterparty result from their linked session and try settle.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} sessionId
 * @param {object} session
 */
export async function syncCounterpartyResultsForSession(supabase, sessionId, session) {
  const snap = sessionResultSnapshot(session)
  if (!snap) return { error: null, swapIds: [] }
  const { data: swaps, error } = await supabase
    .from('poker_tournament_swaps')
    .select('id, status, counterparty_session_accepted_at')
    .eq('counterparty_session_id', sessionId)
    .eq('status', 'active')
  if (error) return { error, swapIds: [] }
  const swapIds = []
  for (const swap of swaps || []) {
    if (!swap.counterparty_session_accepted_at) continue
    const { error: uErr } = await supabase
      .from('poker_tournament_swaps')
      .update({
        counterparty_buy_in: snap.buyIn,
        counterparty_prize: snap.prize,
        counterparty_result_source: 'session',
        counterparty_result_ready: true,
      })
      .eq('id', swap.id)
    if (uErr) return { error: uErr, swapIds }
    const { error: sErr } = await supabase.rpc('poker_tournament_swap_try_settle', {
      p_swap_id: swap.id,
    })
    if (sErr) return { error: sErr, swapIds }
    swapIds.push(swap.id)
  }
  return { error: null, swapIds }
}

/**
 * Manually enter one side's buy-in + prize (override / guest path), then try settle.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} swapId
 * @param {'creator' | 'counterparty'} side
 * @param {number} buyIn
 * @param {number} prize
 */
export async function setSwapSideManualResult(supabase, swapId, side, buyIn, prize) {
  const patch =
    side === 'creator'
      ? {
          creator_buy_in: buyIn,
          creator_prize: prize,
          creator_result_ready: true,
        }
      : {
          counterparty_buy_in: buyIn,
          counterparty_prize: prize,
          counterparty_result_source: 'manual',
          counterparty_result_ready: true,
        }
  const { error: uErr } = await supabase
    .from('poker_tournament_swaps')
    .update(patch)
    .eq('id', swapId)
  if (uErr) return { error: uErr }
  const { data, error } = await supabase.rpc('poker_tournament_swap_try_settle', {
    p_swap_id: swapId,
  })
  if (error) return { error }
  return { swap: data, error: null }
}

/**
 * Creator manually enters counterparty prize (guest never claimed / no app).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} swapId
 * @param {number} buyIn
 * @param {number} prize
 */
export async function setCounterpartyManualResult(supabase, swapId, buyIn, prize) {
  return setSwapSideManualResult(supabase, swapId, 'counterparty', buyIn, prize)
}

/**
 * Soft-event fields derived from a logged tournament session (local calendar date).
 * @param {object | null | undefined} session
 */
export function sessionTournamentEventInput(session) {
  if (!session?.start_at) return null
  const start = new Date(session.start_at)
  if (Number.isNaN(start.getTime())) return null
  return {
    venue_name: session.venue_name || '',
    event_date: localYmd(start),
    buy_in: Number(session.buy_in) || 0,
    game_variant: session.game_variant || null,
    currency: session.currency || 'USD',
    display_name: session.tournament_name || null,
  }
}

/** @param {object | null | undefined} session */
export function sessionTournamentFingerprintKey(session) {
  const input = sessionTournamentEventInput(session)
  if (!input) return null
  return buildTournamentFingerprintKey(input)
}

/**
 * Soft-link a tournament session to `poker_tournament_events` when fields allow.
 * No-op when `tournament_event_id` is already set.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {object} session
 * @param {{ onNeedsConfirm?: (existing: object, input: object) => boolean | Promise<boolean> }} [opts]
 */
export async function ensureSessionTournamentEventLink(supabase, userId, session, opts = {}) {
  if (!session?.id || session.session_type !== 'tournament') {
    return { session, eventId: session?.tournament_event_id || null, error: null }
  }
  if (session.tournament_event_id) {
    return { session, eventId: session.tournament_event_id, error: null }
  }

  const eventInput = sessionTournamentEventInput(session)
  if (!eventInput) {
    return { session, eventId: null, error: null }
  }

  let eventRes = await ensureTournamentEvent(supabase, userId, eventInput)
  if (eventRes.needsConfirm && eventRes.existing) {
    const confirmSame = opts.onNeedsConfirm
      ? await opts.onNeedsConfirm(eventRes.existing, eventInput)
      : false
    eventRes = await ensureTournamentEvent(supabase, userId, {
      ...eventInput,
      confirmSameEvent: confirmSame,
      forceSibling: !confirmSame,
    })
  }

  if (eventRes.error) {
    return { session, eventId: null, error: eventRes.error }
  }

  const eventId = eventRes.event?.id || null
  if (!eventId) {
    return { session, eventId: null, error: null }
  }

  const { error: linkErr } = await supabase
    .from('poker_bankroll_sessions')
    .update({ tournament_event_id: eventId })
    .eq('id', session.id)
    .eq('user_id', userId)

  if (linkErr) {
    return { session, eventId: null, error: linkErr }
  }

  return {
    session: { ...session, tournament_event_id: eventId },
    eventId,
    error: null,
  }
}

function sortCounterpartyBindCandidates(candidates) {
  return [...candidates].sort((a, b) => {
    if (a.status === 'active' && b.status !== 'active') return -1
    if (b.status === 'active' && a.status !== 'active') return 1
    return new Date(b.start_at).getTime() - new Date(a.start_at).getTime()
  })
}

/**
 * @param {object} session
 * @param {object} swap
 * @param {object | null | undefined} swapEvent
 */
export function sessionMatchesSwapEvent(session, swap, swapEvent) {
  const swapEventId = swap?.tournament_event_id || null
  if (swapEventId && session.tournament_event_id === swapEventId) return true
  const swapFingerprint = swapEvent?.fingerprint_key || null
  if (!swapFingerprint) return false
  const sessionFp = sessionTournamentFingerprintKey(session)
  return Boolean(sessionFp && sessionFp === swapFingerprint)
}

/**
 * When a linked swap has a soft event but the session does not match it (UUID or fingerprint).
 * @param {object} session
 * @param {object} swap
 * @param {object | null | undefined} swapEvent
 * @returns {{ swapEvent: object, swapLabel: string } | null}
 */
export function sessionSwapEventMismatch(session, swap, swapEvent) {
  if (!swap?.tournament_event_id || !swapEvent) return null
  if (sessionMatchesSwapEvent(session, swap, swapEvent)) return null
  return {
    swapEvent,
    swapLabel: formatTournamentEventLabel(swapEvent),
  }
}

/**
 * Tournament sessions that can bind to an incoming swap (exact event id or fingerprint match).
 * @param {object} swap
 * @param {object[]} sessions
 * @param {object | null | undefined} [swapEvent]
 */
export function findCounterpartyBindCandidates(swap, sessions, swapEvent = null) {
  const list = Array.isArray(sessions) ? sessions : []
  const tourneys = list.filter(
    (s) => s?.session_type === 'tournament' && (s.status === 'active' || s.status === 'completed'),
  )
  const eventId = swap?.tournament_event_id || null
  const ev = swapEvent || null

  if (eventId || ev?.fingerprint_key) {
    const matched = tourneys.filter((s) => sessionMatchesSwapEvent(s, swap, ev))
    if (matched.length) return sortCounterpartyBindCandidates(matched)
  }

  // Legacy: swap with no soft event — sole active tourney or only tourney on file.
  if (!eventId) {
    let candidates = tourneys.filter((s) => s.status === 'active')
    if (candidates.length !== 1) {
      if (tourneys.length === 1) candidates = tourneys
      else return []
    }
    return sortCounterpartyBindCandidates(candidates)
  }

  return []
}

/**
 * Pick the counterparty session that should bind to an incoming swap.
 * Returns null when zero or multiple candidates (use findCounterpartyBindCandidates + picker).
 * @param {object} swap
 * @param {object[]} sessions
 * @param {object | null | undefined} [swapEvent]
 */
export function findCounterpartyBindSession(swap, sessions, swapEvent = null) {
  const candidates = findCounterpartyBindCandidates(swap, sessions, swapEvent)
  if (candidates.length === 1) return candidates[0]
  return null
}

/**
 * Whether Accept should relink the session to the swap soft event before bind.
 * @param {object} session
 * @param {object} swap
 */
export function counterpartySessionNeedsSwapEventRelink(session, swap) {
  const swapEventId = swap?.tournament_event_id || null
  if (!swapEventId) return false
  return String(session?.tournament_event_id || '') !== String(swapEventId)
}

/**
 * Counterparty accepts binding this swap onto one of their sessions.
 * Links manual (or mismatched-id) sessions onto the swap soft event when fingerprints match.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} swapId
 * @param {string} sessionId
 * @param {object} session
 * @param {{ swapEvent?: object | null, swapEventId?: string | null }} [opts]
 */
export async function acceptCounterpartySessionBind(
  supabase,
  swapId,
  sessionId,
  session,
  opts = {},
) {
  const swapEvent = opts.swapEvent || null
  const swapEventId = opts.swapEventId || swapEvent?.id || null
  let boundSession = session

  if (swapEventId && counterpartySessionNeedsSwapEventRelink(session, { tournament_event_id: swapEventId })) {
    const swapFingerprint = swapEvent?.fingerprint_key || null
    const sessionFp = sessionTournamentFingerprintKey(session)
    if (swapFingerprint && sessionFp !== swapFingerprint) {
      return { error: new Error('Session does not match this swap tournament.') }
    }
    const { error: linkErr } = await supabase
      .from('poker_bankroll_sessions')
      .update({ tournament_event_id: swapEventId })
      .eq('id', sessionId)
    if (linkErr) return { error: linkErr }
    boundSession = { ...session, tournament_event_id: swapEventId }
  }

  const snap = sessionResultSnapshot(boundSession)
  const patch = {
    counterparty_session_id: sessionId,
    counterparty_session_accepted_at: new Date().toISOString(),
  }
  if (snap) {
    patch.counterparty_buy_in = snap.buyIn
    patch.counterparty_prize = snap.prize
    patch.counterparty_result_source = 'session'
    patch.counterparty_result_ready = true
  }
  const { error: uErr } = await supabase
    .from('poker_tournament_swaps')
    .update(patch)
    .eq('id', swapId)
  if (uErr) return { error: uErr }
  if (snap) {
    const { data, error } = await supabase.rpc('poker_tournament_swap_try_settle', {
      p_swap_id: swapId,
    })
    if (error) return { error }
    return { swap: data, error: null }
  }
  return { error: null }
}

/**
 * Cancel an active / unsettled swap (wrong counterparty, etc.).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} swapId
 */
export async function cancelTournamentSwap(supabase, swapId) {
  const { data, error } = await supabase
    .from('poker_tournament_swaps')
    .update({ status: 'cancelled' })
    .eq('id', swapId)
    .neq('status', 'cancelled')
    .select('*')
    .maybeSingle()
  if (error) return { swap: null, error }
  if (!data) return { swap: null, error: new Error('Swap not found or already cancelled.') }
  return { swap: data, error: null }
}

/** True when either party has confirmed cash settled (DB: *_marked_paid). */
export function swapIsMarkedPaid(swap) {
  return Boolean(swap?.creator_marked_paid || swap?.counterparty_marked_paid)
}

/**
 * Mark cash settled and post settlement_amount to personal bankrolls (both parties).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} swapId
 * @param {'creator' | 'counterparty'} _role unused (kept for call-site compat)
 * @param {boolean} paid
 */
export async function markSwapPaid(supabase, swapId, _role, paid) {
  const { data, error } = await supabase.rpc('poker_tournament_swap_mark_paid', {
    p_swap_id: swapId,
    p_paid: paid !== false,
  })
  return { swap: data || null, error }
}

/**
 * Notify guest (Twilio SMS + email) or Edge user (in-app + push) via Edge Function.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} swapId
 * @param {{ kind?: 'offer' | 'result' }} [opts]
 */
export async function notifyTournamentSwap(supabase, swapId, opts = {}) {
  const kind = opts.kind === 'result' ? 'result' : 'offer'
  const { data, error } = await supabase.functions.invoke('poker-tournament-swap-notify', {
    body: { swap_id: swapId, kind },
  })
  if (error) return { error }
  if (data?.error) return { error: new Error(data.error) }
  return { data, error: null }
}

/**
 * After syncing session results, notify the other party on each affected swap.
 * Runs notifies in parallel ... callers should fire-and-forget so End Session UI
 * is not blocked on Edge Function / auth-lock latency.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string[]} swapIds
 */
export async function notifyTournamentSwapResults(supabase, swapIds) {
  const unique = [...new Set((swapIds || []).filter(Boolean))]
  if (!unique.length) return
  const results = await Promise.allSettled(
    unique.map((swapId) => notifyTournamentSwap(supabase, swapId, { kind: 'result' })),
  )
  results.forEach((result, i) => {
    if (result.status === 'rejected') {
      console.warn(
        '[poker-bankroll] swap result notify failed',
        unique[i],
        result.reason?.message || result.reason,
      )
      return
    }
    if (result.value?.error) {
      console.warn(
        '[poker-bankroll] swap result notify failed',
        unique[i],
        result.value.error.message || result.value.error,
      )
    }
  })
}

/**
 * Viewer's linked session on a swap (creator or counterparty), if any.
 * @param {object | null | undefined} swap
 * @param {string | null | undefined} viewerUserId
 * @returns {string | null}
 */
export function viewerSessionIdFromSwap(swap, viewerUserId) {
  if (!swap || !viewerUserId) return null
  if (swap.creator_user_id === viewerUserId) {
    return swap.creator_session_id ? String(swap.creator_session_id) : null
  }
  if (swap.counterparty_user_id === viewerUserId) {
    return swap.counterparty_session_id ? String(swap.counterparty_session_id) : null
  }
  return null
}

/**
 * Compact label for a soft tournament event (incoming swap card / notify copy).
 * @param {object | null | undefined} ev
 */
export function formatTournamentEventLabel(ev) {
  if (!ev) return 'Tournament'
  const name = String(ev.display_name || '').trim()
  const venue = String(ev.venue_name || '').trim()
  const bi = Number(ev.buy_in)
  const biStr = Number.isFinite(bi) ? `$${bi % 1 === 0 ? bi.toFixed(0) : bi.toFixed(2)}` : ''
  const date = ev.event_date ? String(ev.event_date).slice(0, 10) : ''
  if (name && biStr) return `${biStr} · ${name}`
  if (name) return name
  if (venue && biStr) return date ? `${biStr} · ${venue} · ${date}` : `${biStr} · ${venue}`
  if (venue) return date ? `${venue} · ${date}` : venue
  if (biStr) return `${biStr} buy-in`
  return 'Tournament'
}

/** @returns {object} */
export function emptyDraftSwap() {
  return {
    localId: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    counterparty_kind: 'user',
    counterparty_user_id: '',
    counterparty_display_name: '',
    counterparty_handle: '',
    counterparty_guest_label: '',
    counterparty_guest_phone: '',
    counterparty_guest_email: '',
    pct_you_give: '5',
    pct_they_give: '5',
  }
}

/**
 * @param {object} swap
 * @param {string} viewerUserId
 */
export function swapViewerRole(swap, viewerUserId) {
  if (swap?.creator_user_id === viewerUserId) return 'creator'
  if (swap?.counterparty_user_id === viewerUserId) return 'counterparty'
  return null
}

/**
 * @param {object} swap
 * @param {Record<string, object>} profilesById
 */
export function swapOtherPartyLabel(swap, profilesById, viewerUserId) {
  const role = swapViewerRole(swap, viewerUserId)
  if (role === 'creator') {
    if (swap.counterparty_kind === 'guest') {
      return swap.counterparty_guest_label || 'Guest'
    }
    const p = profilesById[swap.counterparty_user_id]
    return p?.display_name || (p?.handle ? `@${p.handle}` : 'Player')
  }
  const p = profilesById[swap.creator_user_id]
  return p?.display_name || (p?.handle ? `@${p.handle}` : 'Player')
}
