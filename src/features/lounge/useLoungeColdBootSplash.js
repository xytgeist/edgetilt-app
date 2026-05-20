import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import {
  LOUNGE_COLD_BOOT_ANON_MAX_MS,
  LOUNGE_COLD_BOOT_ANON_MIN_MS,
  LOUNGE_COLD_BOOT_MEMBER_MAX_MS,
  LOUNGE_COLD_BOOT_MEMBER_MIN_MS,
  markLoungeColdBootBackgroundAt,
  markLoungeColdBootSplashCycleDone,
  shouldShowLoungeColdBootResumeSplash,
  shouldShowLoungeColdBootSplash,
} from '../../utils/loungeColdBootSplash.js'
import {
  readLoungeColdBootFeedMounted,
  subscribeLoungeColdBootFeedMounted,
} from '../../utils/loungeColdBootFeedMounted.js'
import {
  readLoungeColdBootPendingWork,
  subscribeLoungeColdBootPendingWork,
} from '../../utils/loungeColdBootPendingWork.js'

const SPLASH_FADE_MS = 320

/**
 * Lounge home-tab cold boot splash: eligibility, readiness gate, long-background resume.
 *
 * @param {{
 *   tab: string,
 *   browseMode: 'member' | 'anonymous',
 *   communityFeedLoading: boolean,
 *   communityFeedQueryErr: string,
 *   communityPostsCount: number,
 * }} opts
 */
export function useLoungeColdBootSplash({
  tab,
  browseMode,
  communityFeedLoading,
  communityFeedQueryErr,
  communityPostsCount,
}) {
  const pendingWork = useSyncExternalStore(
    subscribeLoungeColdBootPendingWork,
    readLoungeColdBootPendingWork,
    () => false,
  )
  const socialFeedMounted = useSyncExternalStore(
    subscribeLoungeColdBootFeedMounted,
    readLoungeColdBootFeedMounted,
    () => false,
  )

  const [visible, setVisible] = useState(false)
  const [dismissing, setDismiss] = useState(false)
  const shownAtRef = useRef(0)
  const dismissTimerRef = useRef(0)
  const cycleDoneRef = useRef(false)

  const isMember = browseMode === 'member'

  const feedSettled =
    Boolean(communityFeedQueryErr) ||
    (!communityFeedLoading && (communityPostsCount > 0 || socialFeedMounted))

  const beginSplash = useCallback(() => {
    if (visible) return
    shownAtRef.current = Date.now()
    setDismiss(false)
    setVisible(true)
  }, [visible])

  const finishSplash = useCallback(() => {
    if (!visible || dismissing) return
    if (!cycleDoneRef.current) {
      cycleDoneRef.current = true
      markLoungeColdBootSplashCycleDone()
    }
    setDismiss(true)
    window.clearTimeout(dismissTimerRef.current)
    dismissTimerRef.current = window.setTimeout(() => {
      setVisible(false)
      setDismiss(false)
    }, SPLASH_FADE_MS)
  }, [visible, dismissing])

  /** Initial cold boot (killed app / fresh tab). */
  useEffect(() => {
    if (tab !== 'home') return
    if (
      shouldShowLoungeColdBootSplash({
        tab,
        pendingWork,
      })
    ) {
      beginSplash()
    }
  }, [tab, pendingWork, beginSplash])

  /** Long background resume (>10 min) on Home without pending work. */
  useEffect(() => {
    if (typeof document === 'undefined') return undefined
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        markLoungeColdBootBackgroundAt()
        return
      }
      if (document.visibilityState !== 'visible') return
      if (
        shouldShowLoungeColdBootResumeSplash({
          tab,
          pendingWork,
        })
      ) {
        cycleDoneRef.current = false
        beginSplash()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [tab, pendingWork, beginSplash])

  /** Readiness gate + min/max display time. */
  useEffect(() => {
    if (!visible || dismissing) return undefined

    const minMs = isMember ? LOUNGE_COLD_BOOT_MEMBER_MIN_MS : LOUNGE_COLD_BOOT_ANON_MIN_MS
    const maxMs = isMember ? LOUNGE_COLD_BOOT_MEMBER_MAX_MS : LOUNGE_COLD_BOOT_ANON_MAX_MS

    const tryFinish = () => {
      const elapsed = Date.now() - shownAtRef.current
      if (elapsed < minMs) return false
      if (!isMember) return true
      if (feedSettled && socialFeedMounted) return true
      if (elapsed >= maxMs) return true
      return false
    }

    if (tryFinish()) {
      finishSplash()
      return undefined
    }

    const tick = window.setInterval(() => {
      if (tryFinish()) finishSplash()
    }, 48)

    const maxTimer = window.setTimeout(() => {
      finishSplash()
    }, maxMs + 48)

    return () => {
      window.clearInterval(tick)
      window.clearTimeout(maxTimer)
    }
  }, [
    visible,
    dismissing,
    isMember,
    feedSettled,
    socialFeedMounted,
    finishSplash,
  ])

  useEffect(
    () => () => {
      window.clearTimeout(dismissTimerRef.current)
    },
    [],
  )

  return { splashVisible: visible, splashDismissing: dismissing }
}
