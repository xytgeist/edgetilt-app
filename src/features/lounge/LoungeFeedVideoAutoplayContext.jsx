import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from 'react'

const LoungeFeedVideoAutoplayContext = createContext(null)

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
      const intersectsRoot = rect.bottom > rootTop && rect.top < rootBottom
      const intersectsViewport = rect.bottom > 0 && rect.top < vh
      if (!intersectsRoot || !intersectsViewport) continue
      const centerY = (rect.top + rect.bottom) / 2
      candidates.push({ id, centerY, top: rect.top, bottom: rect.bottom })
    }

    /** @type {string | null} */
    let next = null
    if (candidates.length === 0) {
      next = null
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
      schedule()
      return () => {
        entries.delete(id)
        schedule()
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

    return () => {
      if (el) el.removeEventListener('scroll', onScrollOrResize)
      window.removeEventListener('resize', onScrollOrResize)
      if (ro && el) ro.disconnect()
    }
  }, [scrollRootRef])

  const value = useMemo(() => ({ store: storeRef.current }), [])

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

  useEffect(() => {
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

  return { coordinatorActive, isWinner, scheduleRecompute: ctx?.store?.schedule ?? (() => {}) }
}
