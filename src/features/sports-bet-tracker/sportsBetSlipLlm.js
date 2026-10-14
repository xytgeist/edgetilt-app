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
    let body = data
    if (error) {
      let msg = error.message || 'AI slip parse failed'
      try {
        const fromRes = await response?.json?.()
        if (fromRes && typeof fromRes === 'object') {
          body = fromRes
          if (fromRes.error) msg = String(fromRes.error)
        }
      } catch {
        /* keep msg */
      }
      const partial = body?.draft && typeof body.draft === 'object' ? body.draft : null
      // 422 unusable still returns a partial draft … keep it for Failed Fill
      if (partial) {
        return {
          draft: { ...partial, source: 'slip' },
          error: msg,
          engine: body?.engine ? String(body.engine) : 'openai',
          partial: true,
        }
      }
      return { draft: null, error: msg }
    }
    if (body?.error && !body?.draft) {
      return { draft: null, error: String(body.error) }
    }
    const draft = body?.draft && typeof body.draft === 'object' ? body.draft : null
    if (!draft) return { draft: null, error: 'AI returned no draft' }
    return {
      draft: { ...draft, source: 'slip' },
      error: body?.error ? String(body.error) : null,
      engine: body?.engine ? String(body.engine) : 'openai',
      partial: Boolean(body?.error),
    }
  } catch (err) {
    return {
      draft: null,
      error: err instanceof Error ? err.message : 'AI slip parse failed',
    }
  }
}
