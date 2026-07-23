import { useCallback, useEffect, useMemo, useState } from 'react'
import { extractCashtagsFromCaption } from '../../utils/loungeMarketCaptionParse.js'
import { loungeMarketResolveCashtags } from '../../utils/loungeMarketApi.js'
import { getComposerMarketSymbolForCashtag } from './loungeMarketSymbolUtils.js'

/**
 * Debounced Edge `resolve_cashtags` for compose / post-edit captions.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient | null | undefined} supabaseClient
 * @param {string} caption
 */
export function useLoungeCashtagDisambiguation(supabaseClient, caption) {
  const tags = useMemo(() => extractCashtagsFromCaption(caption), [caption])
  const tagsKey = tags.join(',')

  const [byTag, setByTag] = useState(/** @type {Record<string, object>} */ ({}))
  const [loading, setLoading] = useState(false)
  const [confirmedTags, setConfirmedTags] = useState(() => new Set())

  useEffect(() => {
    setConfirmedTags((prev) => {
      const next = new Set([...prev].filter((t) => tags.includes(t)))
      return next.size === prev.size ? prev : next
    })
  }, [tags, tagsKey])

  useEffect(() => {
    if (!supabaseClient || !tags.length) {
      setByTag({})
      setLoading(false)
      return undefined
    }
    let cancelled = false
    const timer = window.setTimeout(() => {
      setLoading(true)
      void loungeMarketResolveCashtags(supabaseClient, tags)
        .then((data) => {
          if (cancelled) return
          if (data?.error) {
            console.warn('[lounge] resolve_cashtags:', data.error)
          }
          setByTag(data?.by_tag && typeof data.by_tag === 'object' ? data.by_tag : {})
        })
        .catch((err) => {
          if (!cancelled) {
            console.warn('[lounge] resolve_cashtags failed:', err)
            setByTag({})
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    }, 320)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [supabaseClient, tagsKey, tags.length])

  const ambiguousTags = useMemo(
    () => tags.filter((t) => byTag[t]?.ambiguous === true),
    [tags, byTag],
  )

  const confirmTag = useCallback((tag) => {
    const u = String(tag || '').trim().toUpperCase()
    if (!u) return
    setConfirmedTags((prev) => {
      if (prev.has(u)) return prev
      const next = new Set(prev)
      next.add(u)
      return next
    })
  }, [])

  const resetConfirmed = useCallback(() => {
    setConfirmedTags(new Set())
  }, [])

  const blockMarketSubmit = useMemo(() => {
    if (!ambiguousTags.length) return false
    return ambiguousTags.some((t) => !confirmedTags.has(t))
  }, [ambiguousTags, confirmedTags])

  const isTagConfirmed = useCallback(
    (tag) => {
      const u = String(tag || '').trim().toUpperCase()
      if (!u) return true
      if (!byTag[u]?.ambiguous) return true
      return confirmedTags.has(u)
    },
    [byTag, confirmedTags],
  )

  return {
    byTag,
    loading,
    ambiguousTags,
    blockMarketSubmit,
    confirmTag,
    resetConfirmed,
    isTagConfirmed,
    getComposerMarketSymbolForCashtag,
  }
}
