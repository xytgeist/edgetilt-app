import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fetchKlipyGifs } from '../../utils/klipyGifs'

/** Cap auto-fetched pages (per search / trending session) to limit Klipy + edge invocations if user scrolls endlessly. */
const KLIPY_PICKER_MAX_PAGES = 15
const SHEET_HEIGHT_CAP_PX = 640
const SHEET_HEIGHT_RATIO = 0.78

function measureLayoutSheetHeightPx() {
  if (typeof window === 'undefined') return 480
  return Math.min(Math.round(window.innerHeight * SHEET_HEIGHT_RATIO), SHEET_HEIGHT_CAP_PX)
}

function readVisualViewportFrame() {
  if (typeof window === 'undefined') return { top: 0, height: 640 }
  const vv = window.visualViewport
  return {
    top: vv?.offsetTop ?? 0,
    height: vv?.height ?? window.innerHeight,
  }
}

/**
 * Full-screen-ish sheet: search or trending GIFs via Klipy (Edge Function `klipy-gifs`).
 */
export default function KlipyGifPicker({ open, onClose, onPick, supabaseClient }) {
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [loadingMode, setLoadingMode] = useState(/** @type {null | 'refresh' | 'append'} */ (null))
  const [err, setErr] = useState('')
  const [page, setPage] = useState(1)
  const [hasNext, setHasNext] = useState(false)
  const [sheetHeightPx, setSheetHeightPx] = useState(measureLayoutSheetHeightPx)
  const [viewportFrame, setViewportFrame] = useState(readVisualViewportFrame)
  const debounceRef = useRef(0)
  const scrollRef = useRef(null)
  const sentinelRef = useRef(null)
  const pageRef = useRef(1)
  const hasNextRef = useRef(false)
  const loadingRef = useRef(false)
  const loadRef = useRef(async () => {})
  const appendInflightRef = useRef(false)
  const debouncedRef = useRef(debounced)

  useEffect(() => {
    debouncedRef.current = debounced
  }, [debounced])

  useEffect(() => {
    pageRef.current = page
  }, [page])
  useEffect(() => {
    hasNextRef.current = hasNext
  }, [hasNext])
  useEffect(() => {
    loadingRef.current = loading
  }, [loading])

  useEffect(() => {
    if (!open) return
    setSheetHeightPx(measureLayoutSheetHeightPx())
    const syncViewport = () => setViewportFrame(readVisualViewportFrame())
    syncViewport()
    const vv = window.visualViewport
    vv?.addEventListener('resize', syncViewport)
    vv?.addEventListener('scroll', syncViewport)
    return () => {
      vv?.removeEventListener('resize', syncViewport)
      vv?.removeEventListener('scroll', syncViewport)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    window.clearTimeout(debounceRef.current)
    debounceRef.current = window.setTimeout(() => setDebounced(query.trim()), 320)
    return () => window.clearTimeout(debounceRef.current)
  }, [query, open])

  const load = useCallback(
    async (opts) => {
      if (!supabaseClient || !open) return
      const nextPage = opts?.page ?? 1
      const append = Boolean(opts?.append)
      const requestQuery = debouncedRef.current
      if (!append) {
        appendInflightRef.current = false
      } else {
        if (appendInflightRef.current) return
        appendInflightRef.current = true
      }
      setLoading(true)
      setLoadingMode(append ? 'append' : 'refresh')
      setErr('')
      try {
        const kind = requestQuery ? 'search' : 'trending'
        const { items: next, hasNext: hn, errorMessage } = await fetchKlipyGifs(supabaseClient, {
          kind,
          q: requestQuery,
          page: nextPage,
          per_page: 20,
        })
        if (requestQuery !== debouncedRef.current) return
        if (errorMessage) {
          setErr(errorMessage)
          if (!append) setItems([])
          return
        }
        setHasNext(hn)
        setPage(nextPage)
        if (append) {
          setItems((prev) => {
            const seen = new Set(prev.map((x) => x.gifUrl))
            const merged = [...prev]
            for (const it of next) {
              if (!seen.has(it.gifUrl)) {
                seen.add(it.gifUrl)
                merged.push(it)
              }
            }
            return merged
          })
        } else {
          setItems(next)
          const scroller = scrollRef.current
          if (scroller) scroller.scrollTop = 0
        }
      } finally {
        if (requestQuery === debouncedRef.current) {
          setLoading(false)
          setLoadingMode(null)
        }
        if (append) appendInflightRef.current = false
      }
    },
    [open, supabaseClient],
  )

  useEffect(() => {
    loadRef.current = load
  }, [load])

  useEffect(() => {
    if (!open) return
    setPage(1)
    setHasNext(false)
    void load({ page: 1, append: false })
  }, [open, debounced, load])

  useEffect(() => {
    if (!open) {
      setQuery('')
      setDebounced('')
      setItems([])
      setErr('')
      setPage(1)
      setHasNext(false)
      setLoading(false)
      setLoadingMode(null)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const root = scrollRef.current
    const target = sentinelRef.current
    if (!root || !target || typeof IntersectionObserver === 'undefined') return

    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.some((e) => e.isIntersecting)
        if (!visible) return
        if (loadingRef.current || !hasNextRef.current) return
        if (pageRef.current >= KLIPY_PICKER_MAX_PAGES) return
        void loadRef.current({ page: pageRef.current + 1, append: true })
      },
      { root, rootMargin: '280px 0px', threshold: 0 }
    )
    io.observe(target)
    return () => io.disconnect()
  }, [open, debounced, items.length, hasNext])

  const resolvedSheetHeightPx = useMemo(() => {
    const visibleCap = Math.max(240, Math.round(viewportFrame.height - 32))
    return Math.min(sheetHeightPx, visibleCap)
  }, [sheetHeightPx, viewportFrame.height])

  const refreshing = loading && loadingMode === 'refresh'
  const loadingMore = loading && loadingMode === 'append'
  const showEmpty = !loading && items.length === 0 && !err

  if (!open) return null

  return (
    <div
      className="fixed left-0 right-0 z-[101] flex items-end justify-center bg-black/45 px-2 backdrop-blur-[3px]"
      role="dialog"
      aria-modal="true"
      aria-label="Choose a GIF"
      style={{
        top: viewportFrame.top,
        height: viewportFrame.height,
      }}
    >
      <button
        type="button"
        className="absolute inset-0 z-0 cursor-default touch-manipulation bg-transparent"
        aria-label="Close GIF picker"
        onClick={onClose}
      />
      <div
        className="klipy-gif-sheet relative z-10 mb-0 flex w-full max-w-lg shrink-0 flex-col overflow-hidden rounded-t-2xl border border-zinc-700/80 bg-[#14161c]/92 shadow-xl backdrop-blur-md"
        style={{ height: resolvedSheetHeightPx }}
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-zinc-800 px-3 py-2">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search GIFs…"
            className="min-w-0 flex-1 rounded-xl border border-zinc-700 bg-zinc-900/80 px-3 py-2 text-[16px] text-zinc-100 placeholder:text-zinc-500 focus:border-cyan-600/70 focus:outline-none focus:ring-0"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 touch-manipulation rounded-full px-3 py-2 text-[14px] font-semibold text-zinc-400 hover:bg-zinc-800 hover:text-white"
          >
            Cancel
          </button>
        </div>
        <div className="relative min-h-0 flex-1">
          <div ref={scrollRef} className="absolute inset-0 overflow-y-auto overscroll-contain px-2 py-2">
            <div className="min-h-[1.375rem] px-2 pb-1">
              {!debounced ? (
                <p className="text-[13px] text-zinc-500">Trending - type to search.</p>
              ) : (
                <p className="text-[13px] text-zinc-500" aria-hidden>
                  &nbsp;
                </p>
              )}
            </div>
            {err ? (
              <div className="mx-1 mb-2 rounded-xl border border-rose-500/40 bg-rose-950/25 px-3 py-2 text-[14px] text-rose-200">
                {err}
              </div>
            ) : null}
            <div
              className={`grid grid-cols-2 gap-2 transition-opacity duration-150 sm:grid-cols-3 ${
                refreshing && items.length > 0 ? 'pointer-events-none opacity-45' : ''
              }`}
            >
              {items.map((it) => {
                const animatedPreview =
                  it.previewUrl && /\.(gif|webp)(\?|#|$)/i.test(it.previewUrl) ? it.previewUrl : ''
                const gridSrc = animatedPreview || it.gifUrl || it.previewUrl
                return (
                  <button
                    key={it.id + it.gifUrl}
                    type="button"
                    onClick={() => {
                      onPick({ gifUrl: it.gifUrl, previewUrl: it.previewUrl, title: it.title })
                      onClose()
                    }}
                    className="group relative aspect-square overflow-hidden rounded-xl border border-zinc-700/70 bg-zinc-900/60 touch-manipulation hover:border-cyan-600/50"
                  >
                    <img
                      src={gridSrc}
                      alt=""
                      className="h-full w-full object-cover"
                      loading="lazy"
                      decoding="async"
                    />
                    {it.title ? (
                      <span className="pointer-events-none absolute inset-x-0 bottom-0 line-clamp-2 bg-gradient-to-t from-black/85 to-transparent px-1.5 pb-1 pt-6 text-left text-[11px] font-medium text-zinc-100 opacity-0 transition-opacity group-hover:opacity-100">
                        {it.title}
                      </span>
                    ) : null}
                  </button>
                )
              })}
            </div>
            {refreshing && items.length === 0 ? (
              <div className="py-10 text-center text-[15px] text-zinc-500">Loading…</div>
            ) : null}
            {showEmpty ? (
              <div className="py-10 text-center text-[15px] text-zinc-500">No GIFs found.</div>
            ) : null}
            {hasNext && items.length > 0 && page < KLIPY_PICKER_MAX_PAGES ? (
              <div ref={sentinelRef} className="h-1 w-full shrink-0" aria-hidden />
            ) : null}
            {loadingMore ? (
              <div className="py-2 text-center text-[13px] text-zinc-500">Loading more…</div>
            ) : null}
            {hasNext && page >= KLIPY_PICKER_MAX_PAGES && items.length > 0 ? (
              <p className="px-2 pb-2 text-center text-[12px] leading-snug text-zinc-500">
                Showing {KLIPY_PICKER_MAX_PAGES} pages of results - refine your search to dig deeper.
              </p>
            ) : null}
          </div>
          {refreshing && items.length > 0 ? (
            <div className="pointer-events-none absolute inset-x-0 top-12 z-10 flex justify-center">
              <span className="rounded-full border border-zinc-600/80 bg-zinc-900/95 px-3 py-1.5 text-[13px] font-medium text-zinc-200 shadow-lg">
                Searching…
              </span>
            </div>
          ) : null}
        </div>
        <div className="shrink-0 border-t border-zinc-800 px-3 py-2 text-center text-[11px] text-zinc-500">
          GIF search by{' '}
          <a href="https://klipy.com" target="_blank" rel="noreferrer noopener" className="text-cyan-400/90 underline">
            Klipy
          </a>
        </div>
      </div>
    </div>
  )
}
