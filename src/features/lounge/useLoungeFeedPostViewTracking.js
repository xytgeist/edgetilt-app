import { useEffect, useRef } from 'react'
import { loungeFeedPostViewId, recordLoungeFeedPostView } from './loungeFeedPostViews.js'

/**
 * When a feed post card is mostly visible, record one unique view for the signed-in viewer.
 *
 * @param {object} opts
 * @param {boolean} opts.enabled
 * @param {string | null | undefined} opts.postId
 * @param {string | null | undefined} opts.authorUserId
 * @param {string | null | undefined} opts.viewerUserId
 * @param {import('@supabase/supabase-js').SupabaseClient | null | undefined} opts.supabaseClient
 * @param {import('react').RefObject<Element | null>} opts.targetRef
 * @param {import('react').RefObject<Element | null>} [opts.scrollRootRef]
 * @param {(postId: string, viewCount: number) => void} [opts.onViewCounted]
 */
export function useLoungeFeedPostViewTracking({
  enabled,
  postId,
  authorUserId,
  viewerUserId,
  supabaseClient,
  targetRef,
  scrollRootRef,
  onViewCounted,
}) {
  const onViewCountedRef = useRef(onViewCounted)
  onViewCountedRef.current = onViewCounted
  const armedRef = useRef(false)

  useEffect(() => {
    armedRef.current = false
    const id = loungeFeedPostViewId(postId)
    if (!enabled || !id || !viewerUserId || !supabaseClient) return undefined
    const el = targetRef?.current
    if (!el || typeof window === 'undefined' || !('IntersectionObserver' in window)) return undefined

    let dwellTimer = 0
    const root = scrollRootRef?.current instanceof Element ? scrollRootRef.current : null

    const flush = () => {
      if (armedRef.current) return
      armedRef.current = true
      void recordLoungeFeedPostView(supabaseClient, id, {
        authorUserId,
        viewerUserId,
      }).then((count) => {
        if (typeof count === 'number' && typeof onViewCountedRef.current === 'function') {
          onViewCountedRef.current(id, count)
        }
      })
    }

    const observer = new window.IntersectionObserver(
      (entries) => {
        const hit = entries?.[0]
        if (hit?.isIntersecting && (hit.intersectionRatio ?? 0) >= 0.45) {
          if (dwellTimer) return
          dwellTimer = window.setTimeout(() => {
            dwellTimer = 0
            flush()
          }, 700)
          return
        }
        if (dwellTimer) {
          window.clearTimeout(dwellTimer)
          dwellTimer = 0
        }
      },
      { root, threshold: [0, 0.45, 0.75, 1] },
    )
    observer.observe(el)
    return () => {
      observer.disconnect()
      if (dwellTimer) window.clearTimeout(dwellTimer)
    }
  }, [
    enabled,
    postId,
    authorUserId,
    viewerUserId,
    supabaseClient,
    targetRef,
    scrollRootRef,
  ])
}
