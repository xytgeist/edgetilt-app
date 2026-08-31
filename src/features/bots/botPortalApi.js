/**
 * Admin bot management portal API.
 */

import { openExternalBillingUrl } from '../../utils/edgeNative.js'

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {string} functionName
 * @param {Record<string, unknown>} body
 */
async function invokeAdminEdgeFunction(supabaseClient, functionName, body) {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()
  if (!supabaseUrl || !anonKey) {
    return { data: null, error: new Error('Supabase env not configured.') }
  }

  let {
    data: { session },
  } = await supabaseClient.auth.getSession()
  if (!session?.access_token) {
    return { data: null, error: new Error('Sign in again, then retry.') }
  }

  const nowSecs = Math.floor(Date.now() / 1000)
  if (!session.expires_at || session.expires_at - nowSecs < 60) {
    const { data: refreshed } = await supabaseClient.auth.refreshSession()
    if (refreshed?.session?.access_token) session = refreshed.session
  }

  let res
  try {
    res = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: anonKey,
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(body),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Network error'
    return { data: null, error: new Error(msg) }
  }

  const text = await res.text().catch(() => '')
  let data = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      if (!res.ok) {
        return {
          data: null,
          error: new Error(text.slice(0, 400) || `${functionName} failed (HTTP ${res.status}).`),
        }
      }
    }
  }

  if (!res.ok) {
    const fromBody = data?.error != null ? String(data.error).trim() : ''
    if (fromBody) return { data: null, error: new Error(fromBody) }
    if (res.status === 503) {
      return {
        data: null,
        error: new Error(
          `Server misconfigured (check Edge secrets for ${functionName}, e.g. X_API_BEARER_TOKEN).`,
        ),
      }
    }
    if (res.status === 502) {
      return { data: null, error: new Error(fromBody || text.slice(0, 400) || 'Upstream X API error.') }
    }
    if (res.status === 401) {
      return { data: null, error: new Error('Sign in again, then retry (session expired).') }
    }
    if (res.status === 403) {
      return { data: null, error: new Error('Admin access required.') }
    }
    return {
      data: null,
      error: new Error(text.slice(0, 400) || `${functionName} failed (HTTP ${res.status}).`),
    }
  }

  if (data?.error) return { data: null, error: new Error(String(data.error)) }
  return { data, error: null }
}

/**
 * Poll pg_net response for async Scott queue (admin_lounge_bot_queue_odds_* request_id).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {number | string} requestId
 */
export async function fetchPgNetRequestResult(supabaseClient, requestId) {
  const { data, error } = await supabaseClient.rpc('admin_lounge_bot_pg_net_result', {
    p_request_id: Number(requestId),
  })
  return { data, error }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {number | string} requestId
 * @param {{ maxMs?: number, intervalMs?: number }} [opts]
 */
export async function waitForPgNetRequestResult(supabaseClient, requestId, opts = {}) {
  const maxMs = opts.maxMs ?? 185_000
  const intervalMs = opts.intervalMs ?? 2_000
  const started = Date.now()

  while (Date.now() - started < maxMs) {
    const { data, error } = await fetchPgNetRequestResult(supabaseClient, requestId)
    if (error) return { ready: false, error }
    if (data?.ready) return { ready: true, result: data }
    await new Promise((resolve) => {
      window.setTimeout(resolve, intervalMs)
    })
  }

  return { ready: false, timedOut: true }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 */
export async function fetchBotPortalSnapshot(supabaseClient) {
  const { data, error } = await supabaseClient.rpc('admin_lounge_bot_portal_snapshot')
  return { data, error }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {string} [status]
 * @param {string} [botUserId]
 */
export async function fetchEditorialInbox(supabaseClient, status = 'pending_review', botUserId = null) {
  const { data, error } = await supabaseClient.rpc('admin_lounge_bot_editorial_inbox', {
    p_status: status,
    p_bot_user_id: botUserId || null,
    p_limit: 50,
  })
  return { data: data || [], error }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {string} userId
 * @param {Record<string, unknown>} patch
 */
export async function saveBotSettings(supabaseClient, userId, patch) {
  const { data, error } = await supabaseClient.rpc('admin_lounge_bot_save_settings', {
    p_user_id: userId,
    p_patch: patch,
  })
  return { data, error }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {string} queueId
 * @param {Record<string, unknown>} patch
 */
export async function updateEditorialQueueRow(supabaseClient, queueId, patch) {
  const { data, error } = await supabaseClient.rpc('admin_lounge_bot_queue_update', {
    p_queue_id: queueId,
    p_patch: patch,
  })
  return { data, error }
}

/**
 * Hard-delete a queue row so Transform can re-ingest the same tweet (dedupe key freed).
 * Published rows also delete the linked Lounge feed post.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {string} queueId
 */
export async function deleteEditorialQueueRow(supabaseClient, queueId) {
  const { data, error } = await supabaseClient.rpc('admin_lounge_bot_queue_delete', {
    p_queue_id: queueId,
  })
  return { data, error }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {string} botUserId
 * @param {string} handle
 */
export async function addBotXSource(supabaseClient, botUserId, handle) {
  const { data, error } = await supabaseClient.rpc('admin_lounge_bot_add_x_source', {
    p_bot_user_id: botUserId,
    p_handle: handle,
  })
  return { data, error }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {string} sourceId
 */
export async function removeBotXSource(supabaseClient, sourceId) {
  const { data, error } = await supabaseClient.rpc('admin_lounge_bot_remove_x_source', {
    p_source_id: sourceId,
  })
  return { data, error }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {Record<string, unknown>} payload
 */
export async function createBotAccount(supabaseClient, payload) {
  const { data, error } = await supabaseClient.functions.invoke('lounge-bot-admin', {
    body: { action: 'create_bot', ...payload },
  })
  if (error) return { data: null, error: new Error(error.message || 'create_bot failed') }
  if (data?.error) return { data: null, error: new Error(String(data.error)) }
  return { data, error: null }
}

/**
 * Admin-only: mint a one-time magic-link token to sign in as a Lounge bot (fan subs, profile, Settings).
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {string} botUserId
 */
export async function staffSignInAsBot(supabaseClient, botUserId) {
  const id = String(botUserId || '').trim()
  if (!id) throw new Error('Bot user id required.')
  const { data, error, response } = await supabaseClient.functions.invoke('lounge-bot-admin', {
    body: { action: 'staff_sign_in_as_bot', bot_user_id: id },
  })
  if (error) {
    let detail = error.message || 'staff_sign_in_as_bot failed'
    try {
      const raw = await response?.clone()?.text()
      if (raw) {
        const body = JSON.parse(raw)
        if (body?.error) detail = String(body.error)
      }
    } catch {
      // ignore
    }
    throw new Error(detail)
  }
  if (data?.error) throw new Error(String(data.error))
  if (!data?.email || !data?.token_hash) throw new Error('Bot sign-in token missing.')
  return data
}

/** SessionStorage keys used after staff bot impersonation (SocialFeed reads on next load). */
export const BOT_IMPERSONATE_SETTINGS_FOCUS_KEY = 'edge:post-auth-lounge-settings'
export const BOT_IMPERSONATE_OPEN_DOCK_KEY = 'edge:post-auth-lounge-dock'

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {string} botUserId
 * @param {{ settingsFocus?: string }} [opts]
 */
export async function staffSignInAsBotAndReload(supabaseClient, botUserId, opts = {}) {
  const payload = await staffSignInAsBot(supabaseClient, botUserId)
  // generateLink returns hashed_token — verify with token_hash, not token (plain OTP / URL token).
  const otpType = payload.otp_type === 'magiclink' ? 'magiclink' : 'email'
  await supabaseClient.auth.signOut({ scope: 'local' })
  const { error: otpErr } = await supabaseClient.auth.verifyOtp({
    token_hash: payload.token_hash,
    type: otpType,
  })
  if (otpErr) throw new Error(otpErr.message || 'Could not sign in as bot.')
  if (typeof window !== 'undefined') {
    sessionStorage.setItem(BOT_IMPERSONATE_OPEN_DOCK_KEY, 'settings')
    sessionStorage.setItem(BOT_IMPERSONATE_SETTINGS_FOCUS_KEY, opts.settingsFocus || 'subscriptions-fan')
    window.location.assign('/')
  }
  return payload
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {string} botUserId
 */
export async function staffBotFanConnectOnboard(supabaseClient, botUserId) {
  const id = String(botUserId || '').trim()
  if (!id) throw new Error('Bot user id required.')
  const { data, error } = await invokeAdminEdgeFunction(supabaseClient, 'lounge-bot-admin', {
    action: 'staff_bot_fan_connect',
    bot_user_id: id,
    subaction: 'onboard',
  })
  if (error) throw error
  if (!data?.url) throw new Error('Connect URL missing from server.')
  await openExternalBillingUrl(data.url)
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {string} botUserId
 */
export async function staffBotFanConnectRefresh(supabaseClient, botUserId) {
  const id = String(botUserId || '').trim()
  if (!id) throw new Error('Bot user id required.')
  const { data, error } = await invokeAdminEdgeFunction(supabaseClient, 'lounge-bot-admin', {
    action: 'staff_bot_fan_connect',
    bot_user_id: id,
    subaction: 'refresh',
  })
  if (error) throw error
  return data
}

/** @returns {{ fanConnect: string, botSlug: string } | null} */
export function botFanConnectReturnFromUrl() {
  if (typeof window === 'undefined') return null
  const params = new URLSearchParams(window.location.search)
  if (params.get('tab') !== 'bots') return null
  const fanConnect = (params.get('fan_connect') || '').trim()
  if (fanConnect !== 'return' && fanConnect !== 'refresh') return null
  return {
    fanConnect,
    botSlug: (params.get('bot') || '').trim().toLowerCase(),
  }
}

export function clearBotFanConnectQueryParams() {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  if (url.searchParams.get('tab') !== 'bots') return
  url.searchParams.delete('fan_connect')
  url.searchParams.delete('bot')
  const next = `${url.pathname}${url.search}${url.hash}`
  window.history.replaceState(window.history.state, '', next)
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {{ slug?: string, dryRun?: boolean, force?: boolean }} [opts]
 */
export async function invokeLoungeNewsPoll(supabaseClient, opts = {}) {
  const { data, error } = await supabaseClient.functions.invoke('lounge-news-poll', {
    body: {
      slug: opts.slug || 'market-edge',
      dryRun: opts.dryRun === true,
      force: opts.force === true,
    },
  })
  if (error) return { data: null, error: new Error(error.message || 'lounge-news-poll failed') }
  if (data?.error) return { data: null, error: new Error(String(data.error)) }
  return { data, error: null }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 */
export async function fetchSportsBettingCalendarToday(supabaseClient) {
  const { data, error } = await supabaseClient.rpc('admin_lounge_sports_betting_calendar_today')
  const rows = Array.isArray(data) ? data : []
  return { data: rows, error }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 */
export async function fetchSportsBettingCalendarAll(supabaseClient) {
  const { data, error } = await supabaseClient.rpc('admin_lounge_sports_betting_calendar_list')
  const rows = Array.isArray(data) ? data : []
  return { data: rows, error }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {Record<string, unknown>} row
 */
export async function saveSportsBettingCalendarRow(supabaseClient, row) {
  const { data, error } = await supabaseClient.rpc('admin_lounge_sports_betting_calendar_save', {
    p_row: row,
  })
  return { data, error }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {{ slug?: string, dryRun?: boolean, sportKey?: string, calendarSlug?: string, postMode?: string, action?: string }} [opts]
 */
export async function invokeLoungeOddsIngest(supabaseClient, opts = {}) {
  const dryRun = opts.dryRun === true
  const slug = opts.slug || 'sports-odds'
  const action = opts.action || undefined

  if (!dryRun) {
    const { data, error } = await supabaseClient.rpc('admin_lounge_bot_queue_odds_ingest', {
      p_slug: slug,
      p_sport_key: action === 'publish_examples' ? null : (opts.sportKey || null),
      p_calendar_slug: opts.calendarSlug || null,
      p_post_mode: opts.postMode || 'edge_only',
      p_action: action === 'publish_examples' ? 'publish_examples' : null,
    })
    if (error) return { data: null, error: new Error(error.message || 'Scott ingest queue failed') }
    return { data: { ...(data || {}), asyncQueued: true }, error: null }
  }

  const { data, error } = await supabaseClient.functions.invoke('lounge-odds-ingest', {
    body: {
      slug,
      dryRun: true,
      sportKey: opts.sportKey || undefined,
      calendarSlug: opts.calendarSlug || undefined,
      postMode: opts.postMode || 'auto',
      action: action || undefined,
    },
  })
  if (error) return { data: null, error: new Error(error.message || 'lounge-odds-ingest failed') }
  if (data?.error) return { data: null, error: new Error(String(data.error)) }
  return { data, error: null }
}

/**
 * Fetch the overall and per-picker win/loss/units record for predictive picks.
 * Supports multi-timeframe (week, month, season, all_time) and per-sport breakdowns.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {string} botUserId
 * @param {{ timeframe?: string, sportKey?: string }} [filters]
 */
export async function fetchBotPicksRecord(
  supabaseClient,
  botUserId,
  { timeframe = 'all_time', sportKey = 'all' } = {},
) {
  if (!supabaseClient || !botUserId) return { data: null, error: null }
  const { data, error } = await supabaseClient.rpc('lounge_bot_get_picks_record', {
    p_bot_user_id: botUserId,
    p_timeframe: timeframe,
    p_sport_key: sportKey,
  })
  if (error) return { data: null, error: new Error(error.message || 'Failed to fetch picks record') }
  return { data, error: null }
}

/**
 * Fetch recent predictive picks logged for a bot.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {string} botUserId
 * @param {number} [limit]
 */
export async function fetchBotRecentPicks(supabaseClient, botUserId, limit = 50) {
  if (!supabaseClient || !botUserId) return { data: [], error: null }
  const { data, error } = await supabaseClient
    .from('lounge_bot_picks')
    .select('*')
    .eq('bot_user_id', botUserId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) return { data: [], error: new Error(error.message || 'Failed to fetch recent picks') }
  return { data: data || [], error: null }
}

/**
 * Trigger on-demand generation and publishing of a Solo or Syndicate predictive pick.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {{
 *   slug?: string,
 *   cardMode?: 'auto' | 'solo' | 'syndicate',
 *   pickerName?: 'Scott' | 'Rocco' | 'Chedda' | 'Tank',
 *   sportKey?: string,
 *   cardTitle?: string,
 *   dryRun?: boolean,
 * }} [opts]
 */
export async function invokeLoungeOddsPredictivePick(supabaseClient, opts = {}) {
  const slug = opts.slug || 'sports-odds'
  const { data, error } = await supabaseClient.functions.invoke('lounge-odds-poll', {
    body: {
      slug,
      action: 'predictive_pick',
      cardMode: opts.cardMode || 'auto',
      pickerName: opts.pickerName || undefined,
      sportKey: opts.sportKey || undefined,
      cardTitle: opts.cardTitle || undefined,
      dryRun: opts.dryRun === true,
    },
  })
  if (error) return { data: null, error: new Error(error.message || 'Predictive pick drop failed') }
  if (data?.error) return { data: null, error: new Error(String(data.error)) }
  return { data, error: null }
}

/**
 * Trigger on-demand grading of pending picks via The Odds API scores endpoint.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {{ slug?: string }} [opts]
 */
export async function invokeLoungeOddsGradePicks(supabaseClient, opts = {}) {
  const slug = opts.slug || 'sports-odds'
  const { data, error } = await supabaseClient.functions.invoke('lounge-odds-poll', {
    body: {
      slug,
      action: 'grade_picks',
    },
  })
  if (error) return { data: null, error: new Error(error.message || 'Grading failed') }
  if (data?.error) return { data: null, error: new Error(String(data.error)) }
  return { data, error: null }
}

/**
 * Trigger on-demand generation and publishing of full ATS Slate Card (NFL or CFB).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {{ slug?: string, sportKey?: string, dryRun?: boolean }} [opts]
 */
export async function invokeLoungeOddsSlateCard(supabaseClient, opts = {}) {
  const slug = opts.slug || 'sports-odds'
  const { data, error } = await supabaseClient.functions.invoke('lounge-odds-poll', {
    body: {
      slug,
      action: 'nfl_slate_card',
      sportKey: opts.sportKey || 'americanfootball_nfl',
      dryRun: opts.dryRun === true,
    },
  })
  if (error) return { data: null, error: new Error(error.message || 'Slate card drop failed') }
  if (data?.error) return { data: null, error: new Error(String(data.error)) }
  return { data, error: null }
}

/**
 * Trigger on-demand generation and publishing of NFL Wong 6-pt Teasers.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {{ slug?: string, dryRun?: boolean }} [opts]
 */
export async function invokeLoungeOddsWongTeaser(supabaseClient, opts = {}) {
  const slug = opts.slug || 'sports-odds'
  const { data, error } = await supabaseClient.functions.invoke('lounge-odds-poll', {
    body: {
      slug,
      action: 'nfl_wong_teaser',
      dryRun: opts.dryRun === true,
    },
  })
  if (error) return { data: null, error: new Error(error.message || 'Wong teaser drop failed') }
  if (data?.error) return { data: null, error: new Error(String(data.error)) }
  return { data, error: null }
}

/**
 * Trigger on-demand generation and publishing of NFL Primetime Spotlight (TNF / SNF / MNF).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {{ slug?: string, primetimeType?: 'TNF' | 'SNF' | 'MNF', dryRun?: boolean }} [opts]
 */
export async function invokeLoungeOddsPrimetimeSpotlight(supabaseClient, opts = {}) {
  const slug = opts.slug || 'sports-odds'
  const { data, error } = await supabaseClient.functions.invoke('lounge-odds-poll', {
    body: {
      slug,
      action: 'nfl_primetime_spotlight',
      primetimeType: opts.primetimeType || undefined,
      dryRun: opts.dryRun === true,
    },
  })
  if (error) return { data: null, error: new Error(error.message || 'Primetime spotlight drop failed') }
  if (data?.error) return { data: null, error: new Error(String(data.error)) }
  return { data, error: null }
}

/**
 * Trigger on-demand generation and publishing of Tuesday Morning Weekly Syndicate Ledger & Post-Mortem.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {{ slug?: string, dryRun?: boolean }} [opts]
 */
export async function invokeLoungeOddsWeeklyRecap(supabaseClient, opts = {}) {
  const slug = opts.slug || 'sports-odds'
  const { data, error } = await supabaseClient.functions.invoke('lounge-odds-poll', {
    body: {
      slug,
      action: 'weekly_syndicate_recap',
      dryRun: opts.dryRun === true,
    },
  })
  if (error) return { data: null, error: new Error(error.message || 'Weekly recap failed') }
  if (data?.error) return { data: null, error: new Error(String(data.error)) }
  return { data, error: null }
}

/**
 * Trigger on-demand generation and publishing of NFL Halftime Pivot into Scott's VIP Sub-Chat.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {{ slug?: string, dryRun?: boolean }} [opts]
 */
export async function invokeLoungeOddsHalftimePivot(supabaseClient, opts = {}) {
  const slug = opts.slug || 'sports-odds'
  const { data, error } = await supabaseClient.functions.invoke('lounge-odds-poll', {
    body: {
      slug,
      action: 'nfl_halftime_pivot',
      dryRun: opts.dryRun === true,
    },
  })
  if (error) return { data: null, error: new Error(error.message || 'Halftime pivot failed') }
  if (data?.error) return { data: null, error: new Error(String(data.error)) }
  return { data, error: null }
}

/**
 * Trigger on-demand generation and publishing of NFL Anytime TD / Player Props card.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {{ slug?: string, dryRun?: boolean }} [opts]
 */
export async function invokeLoungeOddsAnytimeTd(supabaseClient, opts = {}) {
  const slug = opts.slug || 'sports-odds'
  const { data, error } = await supabaseClient.functions.invoke('lounge-odds-poll', {
    body: {
      slug,
      action: 'nfl_anytime_td',
      dryRun: opts.dryRun === true,
    },
  })
  if (error) return { data: null, error: new Error(error.message || 'Anytime TD drop failed') }
  if (data?.error) return { data: null, error: new Error(String(data.error)) }
  return { data, error: null }
}

/**
 * Trigger on-demand scanning and VIP drop for Live Middle & Arbitrage opportunities.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {{ slug?: string, dryRun?: boolean, sportKeys?: string[] }} [opts]
 */
export async function invokeLoungeOddsMiddleArb(supabaseClient, opts = {}) {
  const slug = opts.slug || 'sports-odds'
  const { data, error } = await supabaseClient.functions.invoke('lounge-odds-poll', {
    body: {
      slug,
      action: 'nfl_live_middle_arb',
      dryRun: opts.dryRun === true,
      sportKeys: opts.sportKeys,
    },
  })
  if (error) return { data: null, error: new Error(error.message || 'Live Middle/Arb scanner failed') }
  if (data?.error) return { data: null, error: new Error(String(data.error)) }
  return { data, error: null }
}

/**
 * Trigger on-demand generation and drop for UFC 4-Desk Syndicate card.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {{ slug?: string, dryRun?: boolean, cardTitle?: string }} [opts]
 */
export async function invokeLoungeOddsUfcCard(supabaseClient, opts = {}) {
  const slug = opts.slug || 'sports-odds'
  const { data, error } = await supabaseClient.functions.invoke('lounge-odds-poll', {
    body: {
      slug,
      action: 'ufc_slate_card',
      dryRun: opts.dryRun === true,
      cardTitle: opts.cardTitle || 'UFC Fight Night',
    },
  })
  if (error) return { data: null, error: new Error(error.message || 'UFC slate card failed') }
  if (data?.error) return { data: null, error: new Error(String(data.error)) }
  return { data, error: null }
}

/**
 * Publish one example Lounge post per Scott alert type (portal smoke pack).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {{ slug?: string }} [opts]
 */
export async function invokeLoungeOddsPublishExamples(supabaseClient, opts = {}) {
  return invokeLoungeOddsIngest(supabaseClient, {
    slug: opts.slug,
    action: 'publish_examples',
  })
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {{
 *   slug?: string,
 *   action?: 'poll_edges' | 'poll_live' | 'daily_slates' | 'best_bet_hour' | 'value_bet_radar',
 *   dryRun?: boolean,
 *   force?: boolean,
 *   alertKind?: string | null,
 * }} [opts]
 */
export async function invokeLoungeOddsPoll(supabaseClient, opts = {}) {
  const action = opts.action || 'poll_edges'
  const dryRun = opts.dryRun === true
  const slug = opts.slug || 'sports-odds'
  const force = opts.force === true
  const alertKind = opts.alertKind ? String(opts.alertKind).trim() : null

  if (!dryRun) {
    const { data, error } = await supabaseClient.rpc('admin_lounge_bot_queue_odds_poll', {
      p_slug: slug,
      p_action: action,
      p_dry_run: false,
      p_force: force,
      p_alert_kind: alertKind || null,
    })
    if (error) return { data: null, error: new Error(error.message || 'Scott poll queue failed') }
    return { data: { ...(data || {}), asyncQueued: true }, error: null }
  }

  const { data, error } = await supabaseClient.functions.invoke('lounge-odds-poll', {
    body: {
      slug,
      action,
      dryRun: true,
      force,
      ...(alertKind ? { alertKind } : {}),
    },
  })
  if (error) return { data: null, error: new Error(error.message || 'lounge-odds-poll failed') }
  if (data?.error) return { data: null, error: new Error(String(data.error)) }
  return { data, error: null }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {{ slug?: string, dryRun?: boolean, tweetUrl?: string, sourceText?: string }} [opts]
 */
export async function invokeLoungeXIngest(supabaseClient, opts = {}) {
  return invokeAdminEdgeFunction(supabaseClient, 'lounge-x-ingest', {
    slug: opts.slug,
    dryRun: opts.dryRun === true,
    tweetUrl: opts.tweetUrl ? String(opts.tweetUrl).trim() : undefined,
    sourceText: opts.sourceText ? String(opts.sourceText).trim() : undefined,
  })
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {{ queueId?: string, publishDue?: boolean }} opts
 */
export async function invokeLoungeBotPublishDue(supabaseClient, opts = {}) {
  const { data, error } = await supabaseClient.functions.invoke('lounge-bot-publish-due', {
    body: opts.queueId
      ? { queueId: opts.queueId }
      : { publishDue: opts.publishDue === true, botUserId: opts.botUserId || undefined },
  })
  if (error) return { data: null, error: new Error(error.message || 'publish failed') }
  if (data?.error) return { data: null, error: new Error(String(data.error)) }
  return { data, error: null }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {string} postId
 * @param {string} caption
 */
/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {{
 *   botUserId: string,
 *   caption: string,
 *   categoryPills?: string[],
 *   imageUrls?: string[],
 *   marketEmbeds?: object[],
 * }} opts
 */
export async function publishBotPost(supabaseClient, opts) {
  const imageUrls = Array.isArray(opts.imageUrls)
    ? opts.imageUrls.map((u) => String(u || '').trim()).filter(Boolean).slice(0, 6)
    : []
  const marketEmbeds = Array.isArray(opts.marketEmbeds)
    ? opts.marketEmbeds.filter((row) => row && typeof row === 'object' && String(row.symbol || '').trim()).slice(0, 12)
    : []
  const { data, error } = await supabaseClient.rpc('admin_lounge_bot_publish_post', {
    p_bot_user_id: opts.botUserId,
    p_caption: String(opts.caption || '').trim(),
    p_category_pills: opts.categoryPills?.length ? opts.categoryPills : null,
    p_image_urls: imageUrls.length ? imageUrls : [],
    p_market_embeds: marketEmbeds.length ? marketEmbeds : [],
  })
  if (error) return { data: null, error }
  return { data, error: null }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {{ botUserId: string, postId: string, body: string, parentId?: string | null }} opts
 */
export async function postBotComment(supabaseClient, opts) {
  const { data, error } = await supabaseClient.rpc('admin_lounge_bot_post_comment', {
    p_bot_user_id: opts.botUserId,
    p_post_id: opts.postId,
    p_body: String(opts.body || '').trim(),
    p_parent_id: opts.parentId || null,
  })
  if (error) return { data: null, error }
  return { data, error: null }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {string} postId
 */
export async function fetchPostForBotReply(supabaseClient, postId) {
  const id = String(postId || '').trim()
  if (!id) return { data: null, error: new Error('Post id required.') }

  const { data, error } = await supabaseClient
    .from('community_feed_posts')
    .select('id, caption, user_id, created_at, comment_count')
    .eq('id', id)
    .is('hidden_at', null)
    .maybeSingle()

  if (error) return { data: null, error }
  if (!data?.id) return { data: null, error: new Error('Post not found.') }

  const { data: profile } = await supabaseClient
    .from('profiles')
    .select('user_id, handle, display_name')
    .eq('user_id', data.user_id)
    .maybeSingle()

  return { data: { ...data, author_profile: profile || null }, error: null }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {string} postId
 */
export async function fetchBotPostComments(supabaseClient, postId) {
  const { data, error } = await supabaseClient
    .from('feed_comments')
    .select('id, body, user_id, parent_id, created_at, comment_count')
    .eq('post_id', postId)
    .is('hidden_at', null)
    .order('created_at', { ascending: true })
    .limit(100)
  return { data: data || [], error }
}

export async function updateBotPostCaption(supabaseClient, postId, caption) {
  const { data, error } = await supabaseClient
    .from('community_feed_posts')
    .update({ caption: String(caption || '').trim(), edited_at: new Date().toISOString() })
    .eq('id', postId)
    .select('id, caption, edited_at')
    .single()
  return { data, error }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {string} postId
 */
export async function deleteBotPost(supabaseClient, postId) {
  const { error } = await supabaseClient.from('community_feed_posts').delete().eq('id', postId)
  return { error }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {string} sourceId
 * @param {boolean} enabled
 */
export async function toggleBotNewsSource(supabaseClient, sourceId, enabled) {
  const { error } = await supabaseClient.from('lounge_news_sources').update({ enabled }).eq('id', sourceId)
  return { error }
}
