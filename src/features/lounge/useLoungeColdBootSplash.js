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
  readLoungeColdBootPendingWork,
  subscribeLoungeColdBootPendingWork,
} from '../../utils/loungeColdBootPendingWork.js'

const SPLASH_FADE_MS = 320

/** Sync eligibility on first paint — avoids one frame of feed "Loading…" before splash. */
function readInitialColdBootSplashVisible(tab) {
  if (typeof window === 'undefined') return false
  const pendingWork = readLoungeColdBootPendingWork()
  return shouldShowLoungeColdBootSplash({ tab, pendingWork })
}

/**
 * Lounge home-tab cold boot splash: eligibility, long-background resume, Lottie dismiss.
 *
 * @param {{ tab: string, browseMode: 'member' | 'anonymous' }} opts
 */
export function useLoungeColdBootSplash({ tab, browseMode }) {
  const pendingWork = useSyncExternalStore(
    subscribeLoungeColdBootPendingWork,
    readLoungeColdBootPendingWork,
    () => false,
  )

  const [visible, setVisible] = useState(() => readInitialColdBootSplashVisible(tab))
  const [dismissing, setDismiss] = useState(false)
  const shownAtRef = useRef(visible ? Date.now() : 0)
  const dismissTimerRef = useRef(0)
  const cycleDoneRef = useRef(false)
  /** Set to true when the Lottie animation fires complete. Members wait for this before dismissing. */
  const animationDoneRef = useRef(false)

  const isMember = browseMode === 'member'

  const beginSplash = useCallback(() => {
    if (visible) return
    shownAtRef.current = Date.now()
    animationDoneRef.current = false
    setDismiss(false)
    setVisible(true)
  }, [visible])

  const onSplashAnimationComplete = useCallback(() => {
    animationDoneRef.current = true
  }, [])

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
      if (animationDoneRef.current) return true
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
    finishSplash,
  ])

  useEffect(
    () => () => {
      window.clearTimeout(dismissTimerRef.current)
    },
    [],
  )

  // After the splash fully fades out, the iOS status bar is still dark (it was forced
  // black by the splash's preFrameCover and statusBar strip). iOS only resamples the
  // translucent status bar on native history mutations — the same signal that fires when
  // React Router navigates (e.g. menu → slots). We can't fire that during the animation,
  // so we wait for the first user touchstart after the splash exits, then fire a
  // replaceState (same URL, no back-button side effects) to trigger the resample.
  //
  // If replaceState turns out not to be sufficient (iOS may only resample on pushState),
  // swap in: history.pushState(null, '', location.href) + rAF replaceState to collapse.
  const splashRanRef = useRef(false)
  useEffect(() => {
    if (visible) {
      splashRanRef.current = true
      return
    }
    if (!splashRanRef.current) return
    splashRanRef.current = false

    const handler = () => {
      window.history.replaceState(window.history.state, '', window.location.href)
    }
    window.addEventListener('touchstart', handler, { once: true, capture: true })
    return () => window.removeEventListener('touchstart', handler, true)
  }, [visible])

  return { splashVisible: visible, splashDismissing: dismissing, onSplashAnimationComplete }
}
