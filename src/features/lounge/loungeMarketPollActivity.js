import { useEffect, useRef } from 'react'

/** No market poll while the user has been idle longer than this (ms). */
export const LOUNGE_MARKET_POLL_IDLE_MS = 90_000
/** Pause in-feed Stream autoplay after this idle window so older Android is not decoding forever. */
export const LOUNGE_VIDEO_IDLE_PAUSE_MS = 15_000

let lastActivityAt = Date.now()
/** @type {Set<() => void>} */
const resumeListeners = new Set()
/** @type {Set<(idle: boolean) => void>} */
const videoIdleListeners = new Set()
let listenersInstalled = false
let listenerInstallCount = 0
let videoIdleTimer = 0
let videoIdle = false

function setVideoIdle(next) {
  const value = Boolean(next)
  if (videoIdle === value) return
  videoIdle = value
  for (const fn of videoIdleListeners) fn(value)
}

function armVideoIdleTimer() {
  if (typeof window === 'undefined') return
  if (videoIdleTimer) window.clearTimeout(videoIdleTimer)
  videoIdleTimer = window.setTimeout(() => {
    videoIdleTimer = 0
    setVideoIdle(true)
  }, LOUNGE_VIDEO_IDLE_PAUSE_MS)
}

function notifyResumeIfNeeded() {
  for (const fn of resumeListeners) fn()
}

export function markLoungeUserActivity() {
  const wasIdle =
    Date.now() - lastActivityAt >= LOUNGE_MARKET_POLL_IDLE_MS ||
    (typeof document !== 'undefined' && document.visibilityState === 'hidden')
  lastActivityAt = Date.now()
  setVideoIdle(false)
  armVideoIdleTimer()
  if (wasIdle) notifyResumeIfNeeded()
}

/**
 * Feed Stream tiles: `true` after {@link LOUNGE_VIDEO_IDLE_PAUSE_MS} with no pointer/scroll.
 * @param {(idle: boolean) => void} fn
 */
export function subscribeLoungeVideoIdlePause(fn) {
  videoIdleListeners.add(fn)
  fn(videoIdle)
  if (!videoIdle) armVideoIdleTimer()
  return () => {
    videoIdleListeners.delete(fn)
  }
}

/**
 * @param {{ requireFeedActive?: boolean, feedActive?: boolean }} [opts]
 * @returns {boolean}
 */
export function isLoungeMarketPollAllowed(opts = {}) {
  const { requireFeedActive = false, feedActive = true } = opts
  if (requireFeedActive && !feedActive) return false
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return false
  return Date.now() - lastActivityAt < LOUNGE_MARKET_POLL_IDLE_MS
}

function installGlobalActivityListeners() {
  if (listenersInstalled || typeof window === 'undefined') return
  listenersInstalled = true

  const bump = () => markLoungeUserActivity()
  for (const ev of ['pointerdown', 'keydown', 'wheel', 'touchstart']) {
    window.addEventListener(ev, bump, { capture: true, passive: true })
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      lastActivityAt = 0
      setVideoIdle(true)
      return
    }
    markLoungeUserActivity()
  })
}

function attachScrollRoot(root) {
  if (!root) return () => {}
  const bump = () => markLoungeUserActivity()
  root.addEventListener('scroll', bump, { passive: true })
  return () => root.removeEventListener('scroll', bump)
}

/**
 * Track user interaction so market polls pause while idle.
 * @param {{ feedActive?: boolean, scrollRootRef?: import('react').RefObject<HTMLElement | null> }} [opts]
 */
export function useLoungeMarketPollActivityTracker(opts = {}) {
  const { feedActive = true, scrollRootRef = null } = opts
  const feedActiveRef = useRef(feedActive)
  feedActiveRef.current = feedActive

  useEffect(() => {
    listenerInstallCount += 1
    installGlobalActivityListeners()
    markLoungeUserActivity()

    return () => {
      listenerInstallCount -= 1
    }
  }, [])

  useEffect(() => {
    if (feedActive) markLoungeUserActivity()
  }, [feedActive])

  useEffect(() => {
    if (!feedActive) return undefined
    const root = scrollRootRef?.current
    if (!root) return undefined
    return attachScrollRoot(root)
  }, [feedActive, scrollRootRef])
}

/**
 * Run `fn` when polling resumes after idle (user interaction, tab visible + active, etc.).
 * @param {() => void} fn
 * @param {{ requireFeedActive?: boolean, feedActive?: boolean, enabled?: boolean }} [opts]
 */
export function useLoungeMarketPollOnResume(fn, opts = {}) {
  const { requireFeedActive = false, feedActive = true, enabled = true } = opts
  const fnRef = useRef(fn)
  fnRef.current = fn
  const optsRef = useRef({ requireFeedActive, feedActive })
  optsRef.current = { requireFeedActive, feedActive }

  useEffect(() => {
    if (!enabled) return undefined
    const handler = () => {
      const { requireFeedActive: req, feedActive: active } = optsRef.current
      if (!isLoungeMarketPollAllowed({ requireFeedActive: req, feedActive: active })) return
      fnRef.current()
    }
    resumeListeners.add(handler)
    return () => {
      resumeListeners.delete(handler)
    }
  }, [enabled])
}
