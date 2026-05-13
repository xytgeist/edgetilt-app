import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'

const LoungeFeedVideoAutoplayContext = createContext(null)

/** Match `LAZY_ATTACH_ROOT_MARGIN` in `LoungePostStreamVideo.jsx` (expanded intersection for prefetch). */
const SCROLL_ROOT_PAD_TOP = 180
const SCROLL_ROOT_PAD_BOTTOM = 240

/**
 * @param {React.RefObject<HTMLElement | null>} scrollRootRef
 */
function createAutoplayStore(scrollRootRef) {
  /** @type {string | null} */
  let winnerId = null
  /** @type {Map<string, () => HTMLElement | null>} */
  const entries = new Map()
  /** @type {Set<() => void>} */
  const listeners = new Set()
  let scheduled = false
  /** @type {React.RefObject<HTMLElement | null> | null} */
  let rootRef = scrollRootRef

  const emit = () => {
    listeners.forEach((l) => {
      try {
        l()
      } catch {
        // ignore
      }
    })
  }

  const recompute = () => {
    scheduled = false
    const rootEl = rootRef?.current ?? null
    const rootRect = rootEl ? rootEl.getBoundingClientRect() : null
    const midY = rootRect ? rootRect.top + rootRect.height / 2 : typeof window !== 'undefined' ? window.innerHeight / 2 : 400
    const rootTop = rootRect?.top ?? 0
    const rootBottom = rootRect ? rootRect.bottom : typeof window !== 'undefined' ? window.innerHeight : 800
    const vh = typeof window !== 'undefined' ? window.innerHeight : rootBottom

    /** @type {{ id: string, centerY: number, top: number, bottom: number }[]} */
    const candidates = []
    for (const [id, getEl] of entries) {
      const el = getEl()
      if (!el) continue
      const rect = el.getBoundingClientRect()
      if (rect.width < 2 || rect.height < 2) continue
      const intersectsRootLoose =
        rect.bottom > rootTop - SCROLL_ROOT_PAD_TOP && rect.top < rootBottom + SCROLL_ROOT_PAD_BOTTOM
      const intersectsRootStrict = rect.bottom > rootTop && rect.top < rootBottom
      const intersectsViewport = rect.bottom > 0 && rect.top < vh
      if (!intersectsViewport || (!intersectsRootLoose && !intersectsRootStrict)) continue
      const centerY = (rect.top + rect.bottom) / 2
      candidates.push({ id, centerY, top: rect.top, bottom: rect.bottom })
    }

    /** @type {string | null} */
    let next = null
    if (candidates.length === 0) {
      /** Last resort: registered tiles with layout but strict root missed (e.g. first paint timing). */
      for (const [id, getEl] of entries) {
        const el = getEl()
        if (!el) continue
        const rect = el.getBoundingClientRect()
        if (rect.width < 2 || rect.height < 2) continue
        if (rect.bottom <= 0 || rect.top >= vh) continue
        const centerY = (rect.top + rect.bottom) / 2
        candidates.push({ id, centerY, top: rect.top, bottom: rect.bottom })
      }
    }

    if (candidates.length === 0) {
      next = null
    } else if (candidates.length === 1) {
      next = candidates[0].id
    } else {
      const containing = candidates.filter((c) => c.top <= midY && c.bottom >= midY)
      if (containing.length === 1) {
        next = containing[0].id
      } else if (containing.length > 1) {
        next = containing.reduce((a, b) => (a.top <= b.top ? a : b)).id
      } else {
        const above = candidates.filter((c) => c.centerY < midY)
        if (above.length > 0) {
          next = above.reduce((a, b) => (a.centerY >= b.centerY ? a : b)).id
        } else {
          next = candidates.reduce((a, b) => (a.centerY <= b.centerY ? a : b)).id
        }
      }
    }

    if (next !== winnerId) {
      winnerId = next
      emit()
    }
  }

  const schedule = () => {
    if (scheduled) return
    scheduled = true
    requestAnimationFrame(recompute)
  }

  return {
    /** @param {React.RefObject<HTMLElement | null> | null} ref */
    setScrollRootRef(ref) {
      rootRef = ref
    },
    /** @returns {() => void} */
    register(id, getEl) {
      entries.set(id, getEl)
      queueMicrotask(() => {
        schedule()
      })
      return () => {
        entries.delete(id)
        queueMicrotask(() => {
          schedule()
        })
      }
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    getSnapshot() {
      return winnerId
    },
    schedule,
  }
}

/**
 * Wrap the main lounge scroll area (children of the `overflow-y-auto` feed column).
 * @param {{ scrollRootRef: React.RefObject<HTMLElement | null>, children: React.ReactNode }} props
 */
export function LoungeFeedVideoAutoplayProvider({ scrollRootRef, children }) {
  const storeRef = useRef(null)
  if (!storeRef.current) {
    storeRef.current = createAutoplayStore(scrollRootRef)
  }

  /** Shared across feed/embed Stream tiles: one “Tap for sound” enables inline audio on whichever tile is autoplaying. */
  const [feedInlineSoundUnmuted, setFeedInlineSoundUnmuted] = useState(false)
  const toggleFeedInlineSound = useCallback(() => {
    setFeedInlineSoundUnmuted((m) => !m)
  }, [])

  useEffect(() => {
    storeRef.current?.setScrollRootRef(scrollRootRef)
  }, [scrollRootRef])

  useEffect(() => {
    const store = storeRef.current
    if (!store) return undefined

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
  }, [scrollRootRef])

  const value = useMemo(
    () => ({
      store: storeRef.current,
      feedInlineSoundUnmuted,
      toggleFeedInlineSound,
    }),
    [feedInlineSoundUnmuted, toggleFeedInlineSound],
  )

  return <LoungeFeedVideoAutoplayContext.Provider value={value}>{children}</LoungeFeedVideoAutoplayContext.Provider>
}

/**
 * Single-feed autoplay: only `clientId` matching the mid-scroll winner may attach/play inline.
 * @param {string | null | undefined} clientId stable id per post+asset (e.g. `${postId}:${streamUid}`)
 * @param {() => HTMLElement | null} getContainerEl
 */
export function useLoungeFeedVideoAutoplay(clientId, getContainerEl) {
  const ctx = useContext(LoungeFeedVideoAutoplayContext)
  const getEl = useCallback(() => getContainerEl(), [getContainerEl])

  useLayoutEffect(() => {
    if (!ctx?.store || !clientId) return undefined
    return ctx.store.register(clientId, getEl)
  }, [ctx, clientId, getEl])

  const winnerId = useSyncExternalStore(
    ctx?.store ? ctx.store.subscribe : () => () => {},
    ctx?.store ? ctx.store.getSnapshot : () => null,
    () => null,
  )

  const coordinatorActive = Boolean(ctx && clientId)
  const isWinner = Boolean(ctx && clientId && winnerId === clientId)

  return {
    coordinatorActive,
    isWinner,
    scheduleRecompute: ctx?.store?.schedule ?? (() => {}),
    feedSoundFromProvider: Boolean(ctx),
    feedInlineSoundUnmuted: ctx?.feedInlineSoundUnmuted ?? false,
    toggleFeedInlineSound: ctx?.toggleFeedInlineSound ?? (() => {}),
  }
}
