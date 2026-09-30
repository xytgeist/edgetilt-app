import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { APP_MODAL_OVERLAY_CLASS, APP_MODAL_SHEET_PANEL_CLASS } from '../../constants/appZIndex.js'
import { profileAvatarInitials, profileAvatarToneClass } from '../profiles/profileGate'

/**
 * Admin-only list of accounts that viewed a Lounge feed post (RPC `lounge_feed_post_viewers`).
 */
export default function LoungePostViewersSheet({
  open,
  postId,
  viewCount = 0,
  supabaseClient,
  ageLabel,
  onClose,
  onOpenProfile,
}) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return undefined
    const onKey = (event) => {
      if (event.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, open])

  useEffect(() => {
    if (!open || !postId || !supabaseClient) return undefined
    let cancelled = false
    void (async () => {
      const { data, error: rpcError } = await supabaseClient.rpc('lounge_feed_post_viewers', {
        p_post_id: postId,
      })
      if (cancelled) return
      setLoading(false)
      if (rpcError) {
        setError(rpcError.message || 'Could not load viewers.')
        return
      }
      setRows(Array.isArray(data) ? data : [])
    })()
    return () => {
      cancelled = true
    }
  }, [open, postId, supabaseClient])

  if (!open || typeof document === 'undefined') return null

  const total = Math.max(viewCount, rows.length)

  return createPortal(
    <div
      data-lounge-post-viewers-sheet=""
      className={APP_MODAL_OVERLAY_CLASS}
      onPointerDown={(event) => event.stopPropagation()}
      onTouchStart={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation()
        if (event.target === event.currentTarget) onClose?.()
      }}
    >
      <div className={`${APP_MODAL_SHEET_PANEL_CLASS} flex flex-col`}>
        <div className="mx-auto mb-4 h-1 w-10 shrink-0 rounded-full bg-zinc-700" aria-hidden />
        <h2 className="shrink-0 text-lg font-semibold text-white">Viewed by</h2>
        <p className="mt-1 shrink-0 text-sm text-zinc-400">
          {loading
            ? 'Loading…'
            : `${rows.length.toLocaleString()} ${rows.length === 1 ? 'account' : 'accounts'}${
                total > rows.length ? ` of ${total.toLocaleString()} views` : ''
              }`}
        </p>
        <div className="mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {error ? <p className="py-4 text-sm text-rose-300">{error}</p> : null}
          {!loading && !error && rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-zinc-500">No tracked viewers yet.</p>
          ) : null}
          {rows.map((row) => {
            const name = String(row.display_name || '').trim() || String(row.handle || '').trim() || 'Member'
            const handle = String(row.handle || '').trim()
            return (
              <button
                key={row.user_id}
                type="button"
                className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left touch-manipulation active:bg-zinc-800/60 [-webkit-tap-highlight-color:transparent]"
                onClick={() => onOpenProfile?.(row)}
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full" aria-hidden>
                  {row.avatar_url ? (
                    <img
                      src={row.avatar_url}
                      alt=""
                      className="h-full w-full object-cover"
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <span
                      className={`grid h-full w-full place-items-center text-sm font-bold text-white ${profileAvatarToneClass(
                        row.user_id || handle || 'member',
                      )}`}
                    >
                      {profileAvatarInitials(row.display_name, row.handle)}
                    </span>
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold text-zinc-100">{name}</span>
                  {handle ? <span className="block truncate text-xs text-zinc-500">@{handle}</span> : null}
                </span>
                <span className="shrink-0 text-xs text-zinc-500">
                  {typeof ageLabel === 'function' ? ageLabel(row.first_viewed_at) : ''}
                </span>
              </button>
            )
          })}
        </div>
        <button
          type="button"
          className="mt-4 min-h-11 w-full shrink-0 rounded-xl bg-zinc-800 text-sm font-semibold text-zinc-100"
          onClick={onClose}
        >
          Close
        </button>
      </div>
    </div>,
    document.body,
  )
}
