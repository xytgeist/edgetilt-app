import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchKlipyGifs } from '../../utils/klipyGifs'

/**
 * Full-screen-ish sheet: search or trending GIFs via Klipy (Edge Function `klipy-gifs`).
 */
export default function KlipyGifPicker({ open, onClose, onPick, supabaseClient }) {
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [page, setPage] = useState(1)
  const [hasNext, setHasNext] = useState(false)
  const debounceRef = useRef(0)

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
      setLoading(true)
      setErr('')
      if (!append) setItems([])
      try {
        const kind = debounced ? 'search' : 'trending'
        const { items: next, hasNext: hn, errorMessage } = await fetchKlipyGifs(supabaseClient, {
          kind,
          q: debounced,
          page: nextPage,
          per_page: 20,
        })
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
        }
      } finally {
        setLoading(false)
      }
    },
    [debounced, open, supabaseClient],
  )

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
    }
  }, [open])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[95] flex items-end justify-center bg-black/60 px-2 pt-8 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label="Choose a GIF"
    >
      <button
        type="button"
        className="absolute inset-0 z-0 cursor-default touch-manipulation bg-transparent"
        aria-label="Close GIF picker"
        onClick={onClose}
      />
      <div className="relative z-10 mb-0 flex max-h-[min(78dvh,640px)] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-zinc-700/80 bg-[#14161c] shadow-xl">
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
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2">
          {!debounced ? (
            <p className="px-2 pb-1 text-[13px] text-zinc-500">Trending — type to search.</p>
          ) : null}
          {err ? (
            <div className="mx-1 mb-2 rounded-xl border border-rose-500/40 bg-rose-950/25 px-3 py-2 text-[14px] text-rose-200">{err}</div>
          ) : null}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
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
          {loading && items.length === 0 ? (
            <div className="py-10 text-center text-[15px] text-zinc-500">Loading…</div>
          ) : null}
          {!loading && items.length === 0 && !err ? (
            <div className="py-10 text-center text-[15px] text-zinc-500">No GIFs found.</div>
          ) : null}
          {hasNext && items.length > 0 ? (
            <div className="pb-3 pt-2 text-center">
              <button
                type="button"
                disabled={loading}
                onClick={() => void load({ page: page + 1, append: true })}
                className="rounded-full border border-zinc-600 px-4 py-2 text-[14px] font-semibold text-zinc-200 touch-manipulation hover:bg-zinc-800 disabled:opacity-45"
              >
                {loading ? 'Loading…' : 'Load more'}
              </button>
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
