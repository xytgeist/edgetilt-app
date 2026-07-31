/**
 * Entitlement-checked AP guide markdown fetch (replaces direct guides.content_markdown SELECT).
 */

/** @typedef {{ id?: string, slug?: string, title?: string, content_markdown?: string }} GuideContentPayload */

/**
 * @param {import('@supabase/supabase-js').PostgrestError | null | undefined} error
 */
export function guideContentFetchErrorMessage(error) {
  if (!error) return 'Could not load guide.'
  const code = String(error.code || '')
  const msg = String(error.message || '')
  if (code === '42501' || /access denied/i.test(msg)) {
    return 'This guide requires Slots Edge.'
  }
  if (code === '53300' || /rate limit/i.test(msg)) {
    return 'Too many guide opens in a short window. Wait a minute and try again.'
  }
  if (code === 'P0002' || /not found/i.test(msg)) {
    return 'Guide not found.'
  }
  return msg || 'Could not load guide.'
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {string | null | undefined} slug Machine or guide slug
 * @returns {Promise<{ data: GuideContentPayload | null, error: import('@supabase/supabase-js').PostgrestError | null }>}
 */
export async function fetchGuideContentBySlug(supabaseClient, slug) {
  const normalized = String(slug || '').trim().toLowerCase()
  if (!normalized || !supabaseClient) {
    return { data: null, error: null }
  }

  const { data, error } = await supabaseClient.rpc('get_guide_content', {
    p_slug: normalized,
  })

  if (error) return { data: null, error }

  const payload = /** @type {GuideContentPayload | null} */ (data && typeof data === 'object' ? data : null)
  return { data: payload, error: null }
}

/**
 * Admin slot-guide-form load (includes nested machines + content_markdown).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {string} guideId
 */
export async function fetchAdminGuideForEdit(supabaseClient, guideId) {
  const id = String(guideId || '').trim()
  if (!id || !supabaseClient) {
    return { data: null, error: new Error('Missing guide id.') }
  }

  const { data, error } = await supabaseClient.rpc('admin_get_guide_for_edit', {
    p_guide_id: id,
  })

  if (error) return { data: null, error: new Error(error.message || 'Could not load guide.') }
  return { data: data || null, error: null }
}
