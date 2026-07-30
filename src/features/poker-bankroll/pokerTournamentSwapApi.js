import {
  buildTournamentFingerprintKey,
  eventDisplayNamesDiffer,
  pickCanonicalEventDisplayName,
} from './pokerTournamentEventKeys.js'
import { pokerSessionTotalCost } from './pokerBankrollMath.js'
import { parseSwapPct } from './pokerTournamentSwapMath.js'

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
  const phone = String(draft.counterparty_guest_phone || '').trim() || null
  const email = String(draft.counterparty_guest_email || '').trim().toLowerCase() || null
  if (!phone && !email) {
    return { error: 'Guest swaps need a phone and/or email so we can send the claim link.' }
  }
  return {
    row: {
      creator_user_id: creatorUserId,
      counterparty_kind: 'guest',
      counterparty_guest_label: label,
      counterparty_guest_phone: phone,
      counterparty_guest_email: email,
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
  if (!snap) return { error: null }
  const { data: swaps, error } = await supabase
    .from('poker_tournament_swaps')
    .select('id, status')
    .eq('creator_session_id', sessionId)
    .eq('status', 'active')
  if (error) return { error }
  for (const swap of swaps || []) {
    const { error: uErr } = await supabase
      .from('poker_tournament_swaps')
      .update({
        creator_buy_in: snap.buyIn,
        creator_prize: snap.prize,
        creator_result_ready: true,
      })
      .eq('id', swap.id)
    if (uErr) return { error: uErr }
    const { error: sErr } = await supabase.rpc('poker_tournament_swap_try_settle', {
      p_swap_id: swap.id,
    })
    if (sErr) return { error: sErr }
  }
  return { error: null }
}

/**
 * Sync counterparty result from their linked session and try settle.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} sessionId
 * @param {object} session
 */
export async function syncCounterpartyResultsForSession(supabase, sessionId, session) {
  const snap = sessionResultSnapshot(session)
  if (!snap) return { error: null }
  const { data: swaps, error } = await supabase
    .from('poker_tournament_swaps')
    .select('id, status, counterparty_session_accepted_at')
    .eq('counterparty_session_id', sessionId)
    .eq('status', 'active')
  if (error) return { error }
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
    if (uErr) return { error: uErr }
    const { error: sErr } = await supabase.rpc('poker_tournament_swap_try_settle', {
      p_swap_id: swap.id,
    })
    if (sErr) return { error: sErr }
  }
  return { error: null }
}

/**
 * Creator manually enters counterparty prize (guest never claimed / no app).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} swapId
 * @param {number} buyIn
 * @param {number} prize
 */
export async function setCounterpartyManualResult(supabase, swapId, buyIn, prize) {
  const { error: uErr } = await supabase
    .from('poker_tournament_swaps')
    .update({
      counterparty_buy_in: buyIn,
      counterparty_prize: prize,
      counterparty_result_source: 'manual',
      counterparty_result_ready: true,
    })
    .eq('id', swapId)
  if (uErr) return { error: uErr }
  const { data, error } = await supabase.rpc('poker_tournament_swap_try_settle', {
    p_swap_id: swapId,
  })
  if (error) return { error }
  return { swap: data, error: null }
}

/**
 * Counterparty accepts binding this swap onto one of their sessions.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} swapId
 * @param {string} sessionId
 * @param {object} session
 */
export async function acceptCounterpartySessionBind(supabase, swapId, sessionId, session) {
  const snap = sessionResultSnapshot(session)
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
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} swapId
 * @param {'creator' | 'counterparty'} role
 * @param {boolean} paid
 */
export async function markSwapPaid(supabase, swapId, role, paid) {
  const patch =
    role === 'creator'
      ? { creator_marked_paid: Boolean(paid) }
      : { counterparty_marked_paid: Boolean(paid) }
  const { data, error } = await supabase
    .from('poker_tournament_swaps')
    .update(patch)
    .eq('id', swapId)
    .select('*')
    .single()
  return { swap: data, error }
}

/**
 * Notify guest (Twilio SMS + email) or Edge user (in-app + push) via Edge Function.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} swapId
 */
export async function notifyTournamentSwap(supabase, swapId) {
  const { data, error } = await supabase.functions.invoke('poker-tournament-swap-notify', {
    body: { swap_id: swapId },
  })
  if (error) return { error }
  if (data?.error) return { error: new Error(data.error) }
  return { data, error: null }
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

/**
 * Pick the counterparty session that should bind to an incoming swap.
 * Prefers same soft event; then sole active tourney when the swap has no event id.
 * @param {object} swap
 * @param {object[]} sessions
 */
export function findCounterpartyBindSession(swap, sessions) {
  const list = Array.isArray(sessions) ? sessions : []
  const tourneys = list.filter(
    (s) => s?.session_type === 'tournament' && (s.status === 'active' || s.status === 'completed'),
  )
  const eventId = swap?.tournament_event_id || null
  let candidates = eventId
    ? tourneys.filter((s) => s.tournament_event_id === eventId)
    : tourneys.filter((s) => s.status === 'active')
  if (!eventId && candidates.length !== 1) {
    if (tourneys.length === 1) candidates = tourneys
    else return null
  }
  if (!candidates.length) return null
  candidates = [...candidates].sort((a, b) => {
    if (a.status === 'active' && b.status !== 'active') return -1
    if (b.status === 'active' && a.status !== 'active') return 1
    return new Date(b.start_at).getTime() - new Date(a.start_at).getTime()
  })
  return candidates[0] || null
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
