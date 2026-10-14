/**
 * LLM fallback when heuristic slip parse fails or looks weak.
 * Edge: sports-bet-slip-parse (JWT + OPENAI_API_KEY).
 */

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ text?: string, imageBase64?: string, mimeType?: string }} opts
 * @returns {Promise<{ draft: object|null, error: string|null, engine?: string }>}
 */
export async function parseSportsBetSlipWithLlm(supabase, opts = {}) {
  if (!supabase?.functions?.invoke) {
    return { draft: null, error: 'Not signed in' }
  }
  const text = String(opts.text || '').trim()
  const imageBase64 = String(opts.imageBase64 || '').replace(/^data:[^;]+;base64,/, '').trim()
  if (!text && !imageBase64) {
    return { draft: null, error: 'No slip text or image for AI' }
  }
  try {
    const { data, error, response } = await supabase.functions.invoke('sports-bet-slip-parse', {
      body: {
        text: text || undefined,
        imageBase64: imageBase64 || undefined,
        mimeType: opts.mimeType || 'image/jpeg',
      },
    })
    if (error) {
      let msg = error.message || 'AI slip parse failed'
      try {
        const body = await response?.json?.()
        if (body?.error) msg = String(body.error)
      } catch {
        /* keep msg */
      }
      return { draft: null, error: msg }
    }
    if (data?.error && !data?.draft) {
      return { draft: null, error: String(data.error) }
    }
    const draft = data?.draft && typeof data.draft === 'object' ? data.draft : null
    if (!draft) return { draft: null, error: 'AI returned no draft' }
    return {
      draft: { ...draft, source: 'slip' },
      error: null,
      engine: data?.engine ? String(data.engine) : 'openai',
    }
  } catch (err) {
    return {
      draft: null,
      error: err instanceof Error ? err.message : 'AI slip parse failed',
    }
  }
}
