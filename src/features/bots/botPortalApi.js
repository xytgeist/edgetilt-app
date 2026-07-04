/**
 * Admin bot management portal API.
 */

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
      slug: opts.slug || 'financial-wire',
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
 * @param {{ slug?: string, dryRun?: boolean, sportKey?: string, calendarSlug?: string, postMode?: string }} [opts]
 */
export async function invokeLoungeOddsIngest(supabaseClient, opts = {}) {
  const { data, error } = await supabaseClient.functions.invoke('lounge-odds-ingest', {
    body: {
      slug: opts.slug,
      dryRun: opts.dryRun === true,
      sportKey: opts.sportKey || undefined,
      calendarSlug: opts.calendarSlug || undefined,
      postMode: opts.postMode || 'auto',
    },
  })
  if (error) return { data: null, error: new Error(error.message || 'lounge-odds-ingest failed') }
  if (data?.error) return { data: null, error: new Error(String(data.error)) }
  return { data, error: null }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {{ slug?: string, action?: 'poll_edges' | 'daily_slates', dryRun?: boolean }} [opts]
 */
export async function invokeLoungeOddsPoll(supabaseClient, opts = {}) {
  const { data, error } = await supabaseClient.functions.invoke('lounge-odds-poll', {
    body: {
      slug: opts.slug,
      action: opts.action || 'poll_edges',
      dryRun: opts.dryRun === true,
    },
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
  const { data, error } = await supabaseClient.functions.invoke('lounge-x-ingest', {
    body: { slug: opts.slug, dryRun: opts.dryRun === true },
  })
  if (error) return { data: null, error: new Error(error.message || 'lounge-x-ingest failed') }
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
