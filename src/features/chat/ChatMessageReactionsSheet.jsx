import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import LoungeFlameIcon from '../lounge/LoungeFlameIcon.jsx'
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
  onToggleReaction,
  reloadToken = 0,
}) {
  const [rows, setRows] = useState(/** @type {any[]} */ ([]))
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [filterEmoji, setFilterEmoji] = useState(/** @type {string | null} */ (null))
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
      setDragY(0)
      setDragging(false)
      dragRef.current.active = false
      return
    }
    if (!messageId) return
    setFilterEmoji(null)
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

  const filteredRows = useMemo(() => {
    if (!filterEmoji) return rows
    return rows.filter((r) => r.emoji === filterEmoji)
  }, [rows, filterEmoji])

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

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex flex-col justify-end bg-black/50"
      data-chat-feature
      onClick={onClose}
    >
      <div
        className="flex max-h-[min(70dvh,520px)] flex-col rounded-t-2xl border-t border-zinc-700/60 bg-zinc-950 shadow-2xl"
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
          <div className="h-1 w-10 rounded-full bg-zinc-700" />
        </div>

        <div className="border-b border-zinc-800/80 px-4 pb-3 pt-1 text-center">
          <h2 className="text-[17px] font-semibold text-zinc-100">{title}</h2>
        </div>

        {emojiSummaries.length > 1 ? (
          <div className="flex gap-2 overflow-x-auto px-4 py-3 scrollbar-none">
            <FilterChip
              active={filterEmoji === null}
              onClick={() => setFilterEmoji(null)}
              label={`All ${totalCount}`}
            />
            {emojiSummaries.map(({ emoji, count }) => (
              <FilterChip
                key={emoji}
                active={filterEmoji === emoji}
                onClick={() => setFilterEmoji((cur) => (cur === emoji ? null : emoji))}
              >
                <ReactionGlyph emoji={emoji} liked />
                <span className="text-[13px] font-semibold text-zinc-300">{count}</span>
              </FilterChip>
            ))}
          </div>
        ) : null}

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-2 pb-2">
          {loading ? (
            <div className="py-10 text-center text-[14px] text-zinc-500">Loading…</div>
          ) : err ? (
            <div className="mx-2 py-8 text-center text-[14px] text-rose-300">{err}</div>
          ) : filteredRows.length === 0 ? (
            <div className="py-10 text-center text-[14px] text-zinc-500">No reactions yet.</div>
          ) : (
            <ul className="divide-y divide-zinc-800/70">
              {filteredRows.map((row) => {
                const isViewer = row.user_id === viewerUserId
                const label = isViewer
                  ? 'You'
                  : row.display_name || (row.handle ? `@${row.handle}` : 'Member')
                const sub = !isViewer && row.display_name && row.handle
                  ? `@${row.handle.replace(/^@/, '')}`
                  : null
                return (
                  <li key={`${row.user_id}-${row.emoji}-${row.created_at}`}>
                    <button
                      type="button"
                      onClick={() => {
                        if (isViewer) onToggleReaction(row.emoji)
                      }}
                      disabled={!isViewer}
                      className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left touch-manipulation ${
                        isViewer ? 'active:bg-zinc-800/80' : 'cursor-default'
                      }`}
                    >
                      {row.avatar_url ? (
                        <img
                          src={row.avatar_url}
                          alt=""
                          className="h-11 w-11 shrink-0 rounded-full object-cover"
                        />
                      ) : (
                        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-zinc-700 text-[15px] font-bold text-zinc-300">
                          {(label.replace(/^@/, '')[0] || '?').toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[15px] font-semibold text-zinc-100">{label}</div>
                        {sub ? (
                          <div className="truncate text-[13px] text-zinc-500">{sub}</div>
                        ) : null}
                      </div>
                      <ReactionGlyph emoji={row.emoji} liked className="shrink-0" />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

function FilterChip({ active, onClick, children, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 touch-manipulation transition-colors ${
        active
          ? 'border-cyan-500/50 bg-cyan-500/15'
          : 'border-zinc-700/80 bg-zinc-900/80 active:bg-zinc-800'
      }`}
    >
      {label ? (
        <span className="text-[13px] font-semibold text-zinc-200">{label}</span>
      ) : (
        children
      )}
    </button>
  )
}

function ReactionGlyph({ emoji, liked = false, className = '' }) {
  if (emoji === '❤️') {
    return <LoungeFlameIcon liked={liked} className={`${REACTION_CHIP_CLASS} ${className}`.trim()} />
  }
  return <span className={`${FILTER_EMOJI_CLASS} ${className}`.trim()}>{emoji}</span>
}
