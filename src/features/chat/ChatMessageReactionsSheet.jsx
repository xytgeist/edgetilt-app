import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import LoungeFlameIcon from '../lounge/LoungeFlameIcon.jsx'
import ChatEmojiPicker from './ChatEmojiPicker'
import { chatMessageReactionsPage } from './chatApi.js'

const DISMISS_THRESHOLD_PX = 80
const DISMISS_VELOCITY = 0.4

const REACTION_CHIP_CLASS = 'block h-5 w-5 shrink-0 translate-y-px'
const FILTER_EMOJI_CLASS = 'text-[18px] leading-none'

/**
 * @param {{
 *   open: boolean,
 *   onClose: () => void,
 *   messageId: string | null,
 *   supabaseClient: import('@supabase/supabase-js').SupabaseClient,
 *   viewerUserId: string,
 *   viewerProfile?: { display_name?: string | null, handle?: string | null, avatar_url?: string | null } | null,
 *   onToggleReaction: (emoji: string) => void,
 *   reloadToken?: number,
 * }} props
 */
export default function ChatMessageReactionsSheet({
  open,
  onClose,
  messageId,
  supabaseClient,
  viewerUserId,
  viewerProfile = null,
  onToggleReaction,
  reloadToken = 0,
}) {
  const [rows, setRows] = useState(/** @type {any[]} */ ([]))
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false)
  const [ready, setReady] = useState(false)
  const [dragY, setDragY] = useState(0)
  const [dragging, setDragging] = useState(false)
  const dragRef = useRef({ active: false, startY: 0, lastY: 0, lastT: 0, velocity: 0 })
  const scrollRef = useRef(/** @type {HTMLDivElement | null} */ (null))

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!messageId) return
    if (!silent) {
      setLoading(true)
      setErr('')
    }
    try {
      const data = await chatMessageReactionsPage(supabaseClient, messageId)
      setRows(data)
      if (!silent) setReady(true)
    } catch (e) {
      if (!silent) {
        setRows([])
        setErr(e?.message || 'Could not load reactions.')
        setReady(true)
      }
    } finally {
      if (!silent) setLoading(false)
    }
  }, [messageId, supabaseClient])

  useEffect(() => {
    if (!open) {
      setReady(false)
      setEmojiPickerOpen(false)
      setDragY(0)
      setDragging(false)
      dragRef.current.active = false
      return
    }
    if (!messageId) return
    void load({ silent: false })
  }, [open, messageId, load])

  useEffect(() => {
    if (!open || !messageId || reloadToken === 0) return
    void load({ silent: true })
  }, [reloadToken, open, messageId, load])

  const emojiSummaries = useMemo(() => {
    const map = new Map()
    for (const row of rows) {
      const prev = map.get(row.emoji) || 0
      map.set(row.emoji, prev + 1)
    }
    return [...map.entries()]
      .map(([emoji, count]) => ({ emoji, count }))
      .sort((a, b) => b.count - a.count || a.emoji.localeCompare(b.emoji))
  }, [rows])

  const viewerReactedEmojis = useMemo(
    () => new Set(rows.filter((r) => r.user_id === viewerUserId).map((r) => r.emoji)),
    [rows, viewerUserId],
  )

  const handleToggleReaction = useCallback((emoji) => {
    // Optimistic update so the modal reflects the change instantly
    setRows((prev) => {
      const alreadyReacted = prev.some((r) => r.user_id === viewerUserId && r.emoji === emoji)
      if (alreadyReacted) {
        return prev.filter((r) => !(r.user_id === viewerUserId && r.emoji === emoji))
      }
      return [
        ...prev,
        {
          user_id: viewerUserId,
          emoji,
          display_name: viewerProfile?.display_name || null,
          handle: viewerProfile?.handle || null,
          avatar_url: viewerProfile?.avatar_url || null,
          created_at: new Date().toISOString(),
        },
      ]
    })
    onToggleReaction(emoji)
  }, [viewerUserId, viewerProfile, onToggleReaction])

  const totalCount = rows.length
  const title = totalCount === 1 ? '1 Reaction' : `${totalCount} Reactions`

  const onSheetPointerDown = useCallback((e) => {
    if (e.button !== undefined && e.button !== 0) return
    const scrollEl = scrollRef.current
    if (scrollEl && scrollEl.scrollTop > 4) return
    dragRef.current = { active: true, startY: e.clientY, lastY: e.clientY, lastT: Date.now(), velocity: 0 }
    setDragging(true)
    setDragY(0)
    e.currentTarget.setPointerCapture(e.pointerId)
  }, [])

  const onSheetPointerMove = useCallback((e) => {
    const d = dragRef.current
    if (!d.active) return
    const now = Date.now()
    const dt = Math.max(1, now - d.lastT)
    d.velocity = (e.clientY - d.lastY) / dt
    d.lastY = e.clientY
    d.lastT = now
    setDragY(Math.max(0, e.clientY - d.startY))
  }, [])

  const onSheetPointerUp = useCallback(() => {
    const d = dragRef.current
    if (!d.active) return
    d.active = false
    setDragging(false)
    const currentDragY = Math.max(0, d.lastY - d.startY)
    if (currentDragY > DISMISS_THRESHOLD_PX || d.velocity > DISMISS_VELOCITY) {
      setDragY(0)
      onClose()
    } else {
      setDragY(0)
    }
  }, [onClose])

  if (typeof document === 'undefined' || !open || !messageId || !ready) return null

  return (
    <>
      {createPortal(
        <div
          className="fixed inset-0 z-[120] flex flex-col justify-end bg-black/50"
          data-chat-feature
          onClick={onClose}
        >
          <div
            className="chat-sheet-glass flex max-h-[min(70dvh,520px)] flex-col rounded-t-2xl shadow-2xl"
            style={{
              paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))',
              transform: dragY > 0 ? `translateY(${dragY}px)` : undefined,
              transition: dragging ? 'none' : 'transform 0.22s ease',
            }}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={onSheetPointerDown}
            onPointerMove={onSheetPointerMove}
            onPointerUp={onSheetPointerUp}
            onPointerCancel={onSheetPointerUp}
          >
            <div className="flex justify-center pt-2.5 pb-1">
              <div className="h-1 w-10 rounded-full bg-white/20" />
            </div>

            <div className="border-b border-white/10 px-4 pb-3 pt-1 text-center">
              <h2 className="text-[17px] font-semibold text-zinc-100">{title}</h2>
            </div>

            {/* Reaction pills: + opens picker, emoji pills toggle your reaction */}
            <div className="flex gap-2 overflow-x-auto px-4 py-3 scrollbar-none">
              <button
                type="button"
                onClick={() => setEmojiPickerOpen(true)}
                className="inline-flex shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/8 px-3 py-1.5 touch-manipulation active:bg-white/15"
                aria-label="Add reaction"
              >
                <AddReactionIcon />
              </button>
              {emojiSummaries.map(({ emoji, count }) => {
                const iReacted = viewerReactedEmojis.has(emoji)
                return (
                  <button
                    key={emoji}
                    type="button"
                onClick={() => handleToggleReaction(emoji)}
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 touch-manipulation transition-colors ${
                      iReacted
                        ? 'border-cyan-500/50 bg-cyan-500/15'
                        : 'border-white/15 bg-white/8 active:bg-white/15'
                    }`}
                    aria-label={iReacted ? `Remove ${emoji} reaction` : `React with ${emoji}`}
                    aria-pressed={iReacted}
                  >
                    <ReactionGlyph emoji={emoji} liked />
                    <span className="text-[13px] font-semibold text-zinc-300">{count}</span>
                  </button>
                )
              })}
            </div>

            <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-2 pb-2">
              {loading ? (
                <div className="py-10 text-center text-[14px] text-zinc-500">Loading…</div>
              ) : err ? (
                <div className="mx-2 py-8 text-center text-[14px] text-rose-300">{err}</div>
              ) : rows.length === 0 ? (
                <div className="py-10 text-center text-[14px] text-zinc-500">No reactions yet.</div>
              ) : (
                <ul className="divide-y divide-white/8">
                  {rows.map((row) => {
                    const isViewer = row.user_id === viewerUserId
                    const label = isViewer
                      ? 'You'
                      : row.display_name || (row.handle ? `@${row.handle}` : 'Member')
                    const sub = !isViewer && row.display_name && row.handle
                      ? `@${row.handle.replace(/^@/, '')}`
                      : null
                    return (
                      <li key={`${row.user_id}-${row.emoji}-${row.created_at}`}>
                        <div className="flex w-full items-center gap-3 px-3 py-3">
                          {row.avatar_url ? (
                            <img src={row.avatar_url} alt="" className="h-11 w-11 shrink-0 rounded-full object-cover" />
                          ) : (
                            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-zinc-700 text-[15px] font-bold text-zinc-300">
                              {(label.replace(/^@/, '')[0] || '?').toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-[15px] font-semibold text-zinc-100">{label}</div>
                            {sub ? <div className="truncate text-[13px] text-zinc-500">{sub}</div> : null}
                          </div>
                          <ReactionGlyph emoji={row.emoji} liked className="shrink-0" />
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
      {emojiPickerOpen && createPortal(
        <ChatEmojiPicker
          onSelect={(emoji) => { handleToggleReaction(emoji); setEmojiPickerOpen(false) }}
          onClose={() => setEmojiPickerOpen(false)}
          zIndex={125}
        />,
        document.body,
      )}
    </>
  )
}

function AddReactionIcon() {
  return (
    <svg
      viewBox="0 0 26 22"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-[26px] text-zinc-400"
      aria-hidden="true"
    >
      {/* Smiley face */}
      <circle cx="10" cy="11" r="8.5" />
      <circle cx="7" cy="8.5" r="0.85" fill="currentColor" stroke="none" />
      <circle cx="13" cy="8.5" r="0.85" fill="currentColor" stroke="none" />
      <path d="M7 13.5 Q10 16.5 13 13.5" />
      {/* Plus sign (top-right) */}
      <line x1="21" y1="4" x2="21" y2="11" />
      <line x1="17.5" y1="7.5" x2="24.5" y2="7.5" />
    </svg>
  )
}

function ReactionGlyph({ emoji, liked = false, className = '' }) {
  if (emoji === '❤️') {
    return <LoungeFlameIcon liked={liked} className={`${REACTION_CHIP_CLASS} ${className}`.trim()} />
  }
  return <span className={`${FILTER_EMOJI_CLASS} ${className}`.trim()}>{emoji}</span>
}
