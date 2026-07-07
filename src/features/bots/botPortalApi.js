/**
 * Admin bot management portal API.
 */

/**
 * Surface `{ error }` from Edge Function JSON when invoke returns non-2xx.
 * @param {unknown} error
 * @param {Response | undefined} response
 * @param {{ functionName?: string, defaultMessage?: string }} [opts]
 */
async function messageFromEdgeInvokeError(error, response, opts = {}) {
  const functionName = opts.functionName || 'edge function'
  const defaultMessage = opts.defaultMessage || 'Request failed.'
  const fallback = String(
    (error && typeof error === 'object' && 'message' in error && error.message) || defaultMessage,
  ).trim()

  const ctx = error && typeof error === 'object' ? /** @type {{ context?: Response }} */ (error).context : null
  const res =
    ctx && typeof ctx.status === 'number'
      ? ctx
      : response && typeof response.status === 'number'
        ? response
        : null

  if (res) {
    try {
      const raw = await res.clone().text()
      if (raw) {
        try {
          const body = JSON.parse(raw)
          if (body?.error != null) return String(body.error).trim() || fallback
          if (body?.message != null) return String(body.message).trim() || fallback
        } catch {
          return raw.slice(0, 400) || fallback
        }
      }
    } catch {
      // ignore
    }
    if (res.status === 503) {
      return `Server misconfigured (check Edge secrets for ${functionName}, e.g. X_API_BEARER_TOKEN).`
    }
    if (res.status === 401) return 'Sign in again, then retry (session expired).'
    if (res.status === 403) return 'Admin access required.'
    if (res.status === 404) return `Not found (${functionName} or requested resource).`
    return fallback || `Service returned HTTP ${res.status}.`
  }

  return fallback || defaultMessage
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
 * @param {{ slug?: string, action?: 'poll_edges' | 'daily_slates' | 'best_bet_hour' | 'value_bet_radar', dryRun?: boolean, force?: boolean }} [opts]
 */
export async function invokeLoungeOddsPoll(supabaseClient, opts = {}) {
  const action = opts.action || 'poll_edges'
  const dryRun = opts.dryRun === true
  const slug = opts.slug || 'sports-odds'
  const force = opts.force === true

  if (!dryRun) {
    const { data, error } = await supabaseClient.rpc('admin_lounge_bot_queue_odds_poll', {
      p_slug: slug,
      p_action: action,
      p_dry_run: false,
      p_force: force,
    })
    if (error) return { data: null, error: new Error(error.message || 'Scott poll queue failed') }
    return { data: { ...(data || {}), asyncQueued: true }, error: null }
  }

  const { data, error } = await supabaseClient.functions.invoke('lounge-odds-poll', {
    body: { slug, action, dryRun: true, force },
  })
  if (error) return { data: null, error: new Error(error.message || 'lounge-odds-poll failed') }
  if (data?.error) return { data: null, error: new Error(String(data.error)) }
  return { data, error: null }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {{ slug?: string, dryRun?: boolean }} [opts]
 */
export async function invokeLoungeXIngest(supabaseClient, opts = {}) {
  const { data, error, response } = await supabaseClient.functions.invoke('lounge-x-ingest', {
    body: {
      slug: opts.slug,
      dryRun: opts.dryRun === true,
      tweetUrl: opts.tweetUrl ? String(opts.tweetUrl).trim() : undefined,
    },
  })
  if (error) {
    const msg = await messageFromEdgeInvokeError(error, response, {
      functionName: 'lounge-x-ingest',
      defaultMessage: 'lounge-x-ingest failed.',
    })
    return { data: null, error: new Error(msg) }
  }
  if (data?.error) return { data: null, error: new Error(String(data.error)) }
  return { data, error: null }
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
 * @param {{ botUserId: string, caption: string, categoryPills?: string[] }} opts
 */
export async function publishBotPost(supabaseClient, opts) {
  const { data, error } = await supabaseClient.rpc('admin_lounge_bot_publish_post', {
    p_bot_user_id: opts.botUserId,
    p_caption: String(opts.caption || '').trim(),
    p_category_pills: opts.categoryPills?.length ? opts.categoryPills : null,
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
