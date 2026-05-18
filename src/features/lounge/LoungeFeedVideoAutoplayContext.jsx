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

const LoungeFeedVideoAutoplayContext = createContext(null)

/**
 * Wrap the main lounge scroll area (children of the `overflow-y-auto` feed column).
 * @param {{ scrollRootRef: React.RefObject<HTMLElement | null>, children: React.React.ReactNode }} props
 */
export function LoungeFeedVideoAutoplayProvider({ scrollRootRef, children }) {
  const [store] = useState(() => createAutoplayStore())
  const feedAutoplayEnabled = useSyncExternalStore(
    subscribeLoungeFeedVideoAutoplayEnabled,
    readLoungeFeedVideoAutoplayEnabled,
    () => true,
  )

  /** Shared across feed/embed Stream tiles: one “Tap for sound” enables inline audio on whichever tile is autoplaying. */
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
    const onScrollOrResize = () => store.schedule()
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
    }),
    [
      store,
      feedInlineSoundUnmuted,
      feedInlineSoundExplicitlyMuted,
      toggleFeedInlineSound,
      restoreFeedInlineSound,
      resetFeedInlineSound,
    ],
  )

  return <LoungeFeedVideoAutoplayContext.Provider value={value}>{children}</LoungeFeedVideoAutoplayContext.Provider>
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
 * Single-feed autoplay: only `clientId` matching the mid-scroll winner may attach/play inline.
 * @param {string | null | undefined} clientId stable id per feed row surface + asset (e.g. `${rowId}:${streamUid}`, `${rowId}:embed:${streamUid}`)
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

  const winnerId = useSyncExternalStore(
    ctx?.store && feedAutoplayEnabled ? ctx.store.subscribe : () => () => {},
    ctx?.store && feedAutoplayEnabled ? ctx.store.getSnapshot : () => null,
    () => null,
  )

  const coordinatorActive = Boolean(ctx && clientId && feedAutoplayEnabled)
  const isWinner = Boolean(ctx && clientId && winnerId === clientId && feedAutoplayEnabled)

  return {
    coordinatorActive,
    isWinner,
    feedAutoplayEnabled,
    scheduleRecompute: ctx?.store?.schedule ?? (() => {}),
    feedSoundFromProvider: Boolean(ctx),
    feedInlineSoundUnmuted: ctx?.feedInlineSoundUnmuted ?? false,
    feedInlineSoundExplicitlyMuted: ctx?.feedInlineSoundExplicitlyMuted ?? false,
    toggleFeedInlineSound: ctx?.toggleFeedInlineSound ?? (() => {}),
    restoreFeedInlineSound: ctx?.restoreFeedInlineSound ?? (() => {}),
  }
}
