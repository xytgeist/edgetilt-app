import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react'
import { createAutoplayStore } from './loungeFeedVideoAutoplayStore.js'
import {
  readLoungeFeedVideoAutoplayEnabled,
  subscribeLoungeFeedVideoAutoplayEnabled,
} from '../../utils/loungeFeedVideoAutoplayPref.js'
import {
  readLoungeFeedVideoDebugEnabled,
  subscribeLoungeFeedVideoDebugEnabled,
  syncLoungeFeedVideoDebugFromUrl,
} from '../../utils/loungeFeedVideoDebugPref.js'
import LoungeFeedVideoAutoplayDebugHud from './LoungeFeedVideoAutoplayDebugHud.jsx'

const LoungeFeedVideoAutoplayContext = createContext(null)

/**
 * Wrap a lounge scroll column (feed, post detail, search panel).
 * @param {{ scrollRootRef: React.RefObject<HTMLElement | null>, children: React.React.ReactNode, showDebugHud?: boolean }} props
 */
export function LoungeFeedVideoAutoplayProvider({ scrollRootRef, children, showDebugHud = false }) {
  const [store] = useState(() => createAutoplayStore())
  const feedAutoplayEnabled = useSyncExternalStore(
    subscribeLoungeFeedVideoAutoplayEnabled,
    readLoungeFeedVideoAutoplayEnabled,
    () => true,
  )
  const videoDebugEnabled = useSyncExternalStore(
    subscribeLoungeFeedVideoDebugEnabled,
    readLoungeFeedVideoDebugEnabled,
    () => false,
  )

  /**
   * Feed-wide sound mode: default muted until user taps “Tap for sound” on any tile.
   * While enabled, visibility bands (60% / 40%) govern mute on the active clip.
   */
  const [feedInlineSoundUnmuted, setFeedInlineSoundUnmuted] = useState(false)
  const [feedInlineSoundExplicitlyMuted, setFeedInlineSoundExplicitlyMuted] = useState(false)
  const toggleFeedInlineSound = useCallback(() => {
    setFeedInlineSoundUnmuted((wasUnmuted) => {
      const next = !wasUnmuted
      setFeedInlineSoundExplicitlyMuted(wasUnmuted && !next)
      return next
    })
  }, [])
  const restoreFeedInlineSound = useCallback((unmuted, explicitlyMuted) => {
    setFeedInlineSoundUnmuted(Boolean(unmuted))
    setFeedInlineSoundExplicitlyMuted(Boolean(explicitlyMuted))
  }, [])
  const forceFeedAutoplayActive = useCallback(
    (clientId) => {
      if (clientId) store.forceActive(clientId)
    },
    [store],
  )
  const enterFeedHeroLock = useCallback(
    (clientId) => {
      if (clientId) store.enterHeroLock(clientId)
    },
    [store],
  )
  const exitFeedHeroLock = useCallback(() => {
    store.exitHeroLock()
  }, [store])

  useEffect(() => {
    syncLoungeFeedVideoDebugFromUrl()
  }, [])

  useEffect(() => {
    if (!feedAutoplayEnabled) {
      setFeedInlineSoundUnmuted(false)
      setFeedInlineSoundExplicitlyMuted(false)
    }
  }, [feedAutoplayEnabled])

  useEffect(() => {
    store.setScrollRootRef(scrollRootRef)
  }, [store, scrollRootRef])

  useEffect(() => {
    const onScrollOrResize = () => store.markScroll()
    const el = scrollRootRef?.current
    if (el) {
      el.addEventListener('scroll', onScrollOrResize, { passive: true })
    }
    window.addEventListener('resize', onScrollOrResize)

    const ro =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => store.schedule())
        : null
    if (ro && el) ro.observe(el)

    store.schedule()
    const kick = requestAnimationFrame(() => {
      store.schedule()
    })

    return () => {
      cancelAnimationFrame(kick)
      if (el) el.removeEventListener('scroll', onScrollOrResize)
      window.removeEventListener('resize', onScrollOrResize)
      if (ro && el) ro.disconnect()
    }
  }, [store, scrollRootRef])

  const resetFeedInlineSound = useCallback(() => {
    setFeedInlineSoundUnmuted(false)
    setFeedInlineSoundExplicitlyMuted(false)
  }, [])

  const value = useMemo(
    () => ({
      store,
      feedInlineSoundUnmuted,
      feedInlineSoundExplicitlyMuted,
      toggleFeedInlineSound,
      restoreFeedInlineSound,
      resetFeedInlineSound,
      forceFeedAutoplayActive,
      enterFeedHeroLock,
      exitFeedHeroLock,
    }),
    [
      store,
      feedInlineSoundUnmuted,
      feedInlineSoundExplicitlyMuted,
      toggleFeedInlineSound,
      restoreFeedInlineSound,
      resetFeedInlineSound,
      forceFeedAutoplayActive,
      enterFeedHeroLock,
      exitFeedHeroLock,
    ],
  )

  return (
    <LoungeFeedVideoAutoplayContext.Provider value={value}>
      {children}
      {showDebugHud && videoDebugEnabled ? (
        <LoungeFeedVideoAutoplayDebugHud store={store} scrollRootRef={scrollRootRef} />
      ) : null}
    </LoungeFeedVideoAutoplayContext.Provider>
  )
}

/** Schedule coordinator recompute (pagination append, layout). */
// eslint-disable-next-line react-refresh/only-export-components -- colocated store hook for this context module
export function useLoungeFeedVideoAutoplaySchedule() {
  const ctx = useContext(LoungeFeedVideoAutoplayContext)
  return ctx?.store?.schedule ?? (() => {})
}

/**
 * Re-run coordinator after feed length changes (infinite scroll append).
 * @param {{ postCount: number }} props
 */
export function LoungeFeedAutoplayPostsKick({ postCount }) {
  const schedule = useLoungeFeedVideoAutoplaySchedule()
  useLayoutEffect(() => {
    schedule()
    const raf1 = requestAnimationFrame(() => {
      schedule()
      requestAnimationFrame(schedule)
    })
    const tid = window.setTimeout(schedule, 160)
    return () => {
      cancelAnimationFrame(raf1)
      window.clearTimeout(tid)
    }
  }, [postCount, schedule])
  return null
}

/**
 * Binds `resetRef.current` to `resetFeedInlineSound` from the nearest provider (for callers outside the subtree).
 * @param {{ resetRef: React.MutableRefObject<() => void> }} props
 */
export function LoungeFeedInlineSoundResetBinder({ resetRef }) {
  const ctx = useContext(LoungeFeedVideoAutoplayContext)
  useLayoutEffect(() => {
    const fn = ctx?.resetFeedInlineSound
    resetRef.current = typeof fn === 'function' ? fn : () => {}
    return () => {
      resetRef.current = () => {}
    }
  }, [ctx, resetRef])
  return null
}

/**
 * Suspend coordinator handoff/ring expansion (e.g. feed hidden under post detail overlay).
 * @param {{ suspended: boolean }} props
 */
export function LoungeFeedCoordinatorSuspendBinder({ suspended }) {
  const ctx = useContext(LoungeFeedVideoAutoplayContext)
  useLayoutEffect(() => {
    ctx?.store?.setCoordinatorSuspended(Boolean(suspended))
    return () => {
      ctx?.store?.setCoordinatorSuspended(false)
    }
  }, [ctx, suspended])
  return null
}

/** @type {import('./loungeFeedVideoAutoplayStore.js').LoungeFeedAutoplaySnapshot} */
const EMPTY_AUTOPLAY_SNAPSHOT = Object.freeze({
  activeId: null,
  prefetchPrevId: null,
  prefetchNextId: null,
  ringIds: Object.freeze([]),
  flingerMode: false,
  heroLocked: false,
  heroClientId: null,
  coordinatorSuspended: false,
  tileRatios: Object.freeze({}),
})

/**
 * Visibility-band autoplay: `{prev, active, next}` HLS ring + hero resource lock.
 * @param {string | null | undefined} clientId stable id per feed row surface + asset
 * @param {() => HTMLElement | null} getContainerEl
 */
// eslint-disable-next-line react-refresh/only-export-components -- colocated store hook for this context module
export function useLoungeFeedVideoAutoplay(clientId, getContainerEl) {
  const ctx = useContext(LoungeFeedVideoAutoplayContext)
  const feedAutoplayEnabled = useSyncExternalStore(
    subscribeLoungeFeedVideoAutoplayEnabled,
    readLoungeFeedVideoAutoplayEnabled,
    () => true,
  )
  const getEl = useCallback(() => getContainerEl(), [getContainerEl])

  useLayoutEffect(() => {
    if (!ctx?.store || !clientId || !feedAutoplayEnabled) return undefined
    return ctx.store.register(clientId, getEl)
  }, [ctx, clientId, getEl, feedAutoplayEnabled])

  const autoplaySnapshot = useSyncExternalStore(
    ctx?.store && feedAutoplayEnabled ? ctx.store.subscribe : () => () => {},
    ctx?.store && feedAutoplayEnabled ? ctx.store.getSnapshot : () => EMPTY_AUTOPLAY_SNAPSHOT,
    () => EMPTY_AUTOPLAY_SNAPSHOT,
  )

  const coordinatorActive = Boolean(ctx && clientId && feedAutoplayEnabled)
  const isActive = Boolean(
    ctx && clientId && autoplaySnapshot.activeId === clientId && feedAutoplayEnabled,
  )
  const inRing = Boolean(
    ctx && clientId && feedAutoplayEnabled && autoplaySnapshot.ringIds.includes(clientId),
  )
  const tileRatio =
    clientId && feedAutoplayEnabled ? Number(autoplaySnapshot.tileRatios[clientId] ?? 0) : 0

  return {
    coordinatorActive,
    isActive,
    inRing,
    tileRatio,
    flingerMode: autoplaySnapshot.flingerMode,
    heroLocked: autoplaySnapshot.heroLocked,
    coordinatorSuspended: autoplaySnapshot.coordinatorSuspended,
    feedAutoplayEnabled,
    scheduleRecompute: ctx?.store?.schedule ?? (() => {}),
    feedSoundFromProvider: Boolean(ctx),
    feedInlineSoundUnmuted: ctx?.feedInlineSoundUnmuted ?? false,
    feedInlineSoundExplicitlyMuted: ctx?.feedInlineSoundExplicitlyMuted ?? false,
    toggleFeedInlineSound: ctx?.toggleFeedInlineSound ?? (() => {}),
    restoreFeedInlineSound: ctx?.restoreFeedInlineSound ?? (() => {}),
    forceFeedAutoplayActive: ctx?.forceFeedAutoplayActive ?? (() => {}),
    enterFeedHeroLock: ctx?.enterFeedHeroLock ?? (() => {}),
    exitFeedHeroLock: ctx?.exitFeedHeroLock ?? (() => {}),
    releaseStalledActive: ctx?.store?.releaseStalledActive ?? (() => {}),
    /** @deprecated use isActive */
    isWinner: isActive,
    /** @deprecated unused */
    isStaged: inRing && !isActive,
    /** @deprecated use forceFeedAutoplayActive */
    forceFeedAutoplayWinner: ctx?.forceFeedAutoplayActive ?? (() => {}),
  }
}
