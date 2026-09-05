import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  chatCanPinMessages,
  chatPinnedMessagesPage,
  chatRoomSharedCalls,
  chatRoomSharedLinks,
  chatRoomSharedMedia,
  chatSearchMessages,
  chatStarredMessagesPage,
  chatUnpinMessage,
} from './chatApi.js'
import ChatSharedLinkCard, {
  groupSharedLinksByMonth,
  sharedLinkMatchesQuery,
} from './ChatSharedLinkCard.jsx'
import { bodyTextWithLinkPreview } from '../../utils/linkifyText.jsx'

/**
 * @param {{
 *   open: boolean,
 *   title: string,
 *   onBack: () => void,
 *   children: import('react').ReactNode,
 *   zIndex?: number,
 * }} props
 */
function AuxSheetShell({ open, title, onBack, children, zIndex = 96 }) {
  if (!open || typeof document === 'undefined') return null
  return createPortal(
    <div className="fixed inset-0 flex flex-col bg-zinc-950" style={{ zIndex }} data-chat-feature>
      <div
        className="flex shrink-0 items-center gap-2 border-b border-zinc-800/80 px-3 pb-3"
        style={{ paddingTop: 'calc(max(env(safe-area-inset-top,0px),var(--edge-sat,0px)) + 0.5rem)' }}
      >
        <button
          type="button"
          onClick={onBack}
          className="chat-header-glass flex h-10 w-10 items-center justify-center rounded-full text-zinc-100 touch-manipulation active:opacity-70"
          aria-label="Back"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <h1 className="min-w-0 flex-1 truncate text-[17px] font-bold text-zinc-50">{title}</h1>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 py-4 pb-8">
        {children}
      </div>
    </div>,
    document.body,
  )
}

/**
 * @param {{
 *   open: boolean,
 *   onBack: () => void,
 *   supabaseClient: import('@supabase/supabase-js').SupabaseClient,
 *   roomId: string,
 *   onJumpToMessage: (messageId: string) => void,
 * }} props
 */
export function ChatGroupSearchSheet({ open, onBack, supabaseClient, roomId, onJumpToMessage }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(/** @type {any[]} */ ([]))
  const [busy, setBusy] = useState(false)
  const timerRef = useRef(null)

  useEffect(() => {
    if (!open) {
      setQuery('')
      setResults([])
      return undefined
    }
    if (timerRef.current) clearTimeout(timerRef.current)
    const q = query.trim()
    if (q.length < 2) {
      setResults([])
      return undefined
    }
    setBusy(true)
    timerRef.current = setTimeout(async () => {
      try {
        const rows = await chatSearchMessages(supabaseClient, roomId, q)
        setResults(rows)
      } catch {
        setResults([])
      } finally {
        setBusy(false)
      }
    }, 250)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [open, query, roomId, supabaseClient])

  return (
    <AuxSheetShell open={open} title="Search messages" onBack={onBack}>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search in this group…"
        autoFocus
        className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-[15px] text-zinc-100 placeholder:text-zinc-500"
      />
      <p className="mt-2 text-[12px] text-zinc-500">Type at least 2 characters.</p>
      {busy && results.length === 0 ? (
        <p className="mt-4 text-[13px] text-zinc-500">Searching…</p>
      ) : null}
      <ul className="mt-4 space-y-2">
        {results.map((r) => (
          <li key={r.message_id}>
            <button
              type="button"
              className="w-full rounded-xl bg-zinc-900/80 px-3 py-2.5 text-left touch-manipulation active:bg-zinc-800"
              onClick={() => {
                onJumpToMessage(r.message_id)
                onBack()
              }}
            >
              <div className="line-clamp-2 text-[14px] text-zinc-200">{r.body}</div>
              <div className="mt-1 text-[11px] text-zinc-500">
                {new Date(r.created_at).toLocaleString()}
              </div>
            </button>
          </li>
        ))}
      </ul>
      {!busy && query.trim().length >= 2 && results.length === 0 ? (
        <p className="mt-4 text-[13px] text-zinc-500">No messages found.</p>
      ) : null}
    </AuxSheetShell>
  )
}

/**
 * @param {{
 *   open: boolean,
 *   onBack: () => void,
 *   supabaseClient: import('@supabase/supabase-js').SupabaseClient,
 *   room: Record<string, unknown>,
 *   viewerUserId: string,
 *   onJumpToMessage: (messageId: string) => void,
 *   onPinsChanged?: () => void,
 * }} props
 */
export function ChatGroupPinnedSheet({
  open,
  onBack,
  supabaseClient,
  room,
  viewerUserId,
  onJumpToMessage,
  onPinsChanged,
}) {
  const canManagePins = chatCanPinMessages(room, viewerUserId)
  const [pins, setPins] = useState(/** @type {any[]} */ ([]))
  const [err, setErr] = useState('')

  const reload = useCallback(async () => {
    if (!room?.id) return
    const rows = await chatPinnedMessagesPage(supabaseClient, room.id)
    setPins(rows)
  }, [room?.id, supabaseClient])

  useEffect(() => {
    if (!open) return
    setErr('')
    void reload().catch(() => setPins([]))
  }, [open, reload])

  return (
    <AuxSheetShell open={open} title="Pinned messages" onBack={onBack}>
      {err ? (
        <div className="mb-3 rounded-xl border border-rose-500/40 bg-rose-950/30 px-3 py-2 text-[13px] text-rose-200">
          {err}
        </div>
      ) : null}
      {pins.length === 0 ? (
        <p className="text-[13px] text-zinc-500">
          {canManagePins
            ? (room.kind === 'dm'
              ? 'Long-press a message and tap Pin to pin it.'
              : 'Long-press a message and tap Pin to pin it for everyone.')
            : 'No pinned messages yet.'}
        </p>
      ) : (
        <ul className="space-y-2">
          {pins.map((p) => (
            <li key={p.message_id} className="rounded-xl bg-zinc-900/80 px-3 py-2">
              <button
                type="button"
                className="w-full text-left touch-manipulation active:opacity-80"
                onClick={() => {
                  onJumpToMessage(p.message_id)
                  onBack()
                }}
              >
                <div className="line-clamp-2 text-[14px] text-zinc-200">
                  {p.body || (Array.isArray(p.image_urls) && p.image_urls.length ? '[Photo]' : '[Message]')}
                </div>
                <div className="mt-1 text-[11px] text-zinc-500">
                  Pinned {new Date(p.pinned_at).toLocaleString()}
                </div>
              </button>
              {canManagePins ? (
                <button
                  type="button"
                  className="mt-2 text-[12px] font-semibold text-rose-400 touch-manipulation active:opacity-70"
                  onClick={async () => {
                    try {
                      await chatUnpinMessage(supabaseClient, room.id, p.message_id)
                      await reload()
                      onPinsChanged?.()
                    } catch (ex) {
                      setErr(ex?.message || 'Could not unpin.')
                    }
                  }}
                >
                  Unpin
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </AuxSheetShell>
  )
}

const MEDIA_TABS = [
  { id: 'media', label: 'Media' },
  { id: 'links', label: 'Links' },
  { id: 'docs', label: 'Docs' },
  { id: 'calls', label: 'Calls' },
]

/** @param {string | null | undefined} bodyPreview @param {object | null | undefined} linkPreview */
function linkMessageFooter(bodyPreview, linkPreview) {
  const t = bodyTextWithLinkPreview(bodyPreview, linkPreview)
  if (!t) return null
  return t
}

/**
 * @param {any[]} items
 * @param {string} query
 * @param {string} [itemLabel]
 */
function SharedLinksList({ items, query, onJumpToMessage, onBack, itemLabel = 'links' }) {
  const filtered = useMemo(
    () => items.filter((item) => sharedLinkMatchesQuery(item, query)),
    [items, query],
  )
  const groups = useMemo(() => groupSharedLinksByMonth(filtered), [filtered])

  if (filtered.length === 0) {
    return (
      <p className="text-[13px] text-zinc-500">
        {query.trim() ? `No matching ${itemLabel}.` : `No ${itemLabel} found.`}
      </p>
    )
  }

  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <section key={group.label}>
          <h2 className="mb-2 text-[15px] font-semibold text-zinc-100">{group.label}</h2>
          <ul className="space-y-2.5">
            {group.items.map((item, i) => (
              <li key={`${item.message_id}-${item.url}-${i}`}>
                <ChatSharedLinkCard
                  url={item.url}
                  linkPreview={item.link_preview}
                  bodyPreview={linkMessageFooter(item.body_preview, item.link_preview) || 'View message'}
                  onViewMessage={() => {
                    onJumpToMessage(item.message_id)
                    onBack()
                  }}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

/**
 * @param {{
 *   items: any[],
 *   onJumpToMessage: (messageId: string) => void,
 *   onBack: () => void,
 * }} props
 */
function SharedCallsList({ items, onJumpToMessage, onBack }) {
  return (
    <ul className="space-y-2.5">
      {items.map((item) => {
        const encoding = String(item.content_encoding || '')
        const isRecording = encoding === 'call_recording'
        const preview = item.link_preview && typeof item.link_preview === 'object' ? item.link_preview : null
        const mediaMode = preview?.media_mode === 'audio' ? 'audio' : 'video'
        const durationSec = Number(preview?.duration_seconds) > 0 ? Number(preview.duration_seconds) : 0
        const durationLabel = durationSec > 0 ? formatSharedCallDuration(durationSec) : null
        const whenLabel = formatSharedCallWhen(item.created_at || preview?.ended_at || preview?.started_at)
        const status = String(preview?.status || '')
        const title = isRecording
          ? 'Call recording'
          : mediaMode === 'audio'
            ? 'Voice call'
            : 'Video call'
        const subtitle = (() => {
          if (isRecording) {
            const parts = [mediaMode === 'audio' ? 'Voice' : 'Video']
            if (durationLabel) parts.push(durationLabel)
            if (whenLabel) parts.push(whenLabel)
            return parts.join(' · ')
          }
          if (status === 'missed') return whenLabel ? `Missed · ${whenLabel}` : 'Missed call'
          if (status === 'declined') return whenLabel ? `Declined · ${whenLabel}` : 'Call declined'
          if (durationLabel && whenLabel) return `${durationLabel} · ${whenLabel}`
          if (durationLabel) return durationLabel
          if (whenLabel) return whenLabel
          return String(item.body || 'Call ended')
        })()
        const poster = String(item.stream_poster_url || '').trim()

        return (
          <li key={item.message_id}>
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/80 px-2.5 py-2 text-left touch-manipulation active:bg-zinc-800"
              onClick={() => {
                onJumpToMessage(item.message_id)
                onBack()
              }}
            >
              <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-zinc-800">
                {isRecording && poster ? (
                  <img src={poster} alt="" className="h-full w-full object-cover" loading="lazy" />
                ) : isRecording && !poster ? (
                  <div className="grid h-full w-full place-items-center bg-zinc-800" aria-label="Processing">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/25 border-t-white" />
                  </div>
                ) : (
                  <div
                    className={`grid h-full w-full place-items-center ${
                      status === 'missed' || status === 'declined'
                        ? 'bg-amber-500/15 text-amber-300'
                        : isRecording
                          ? 'bg-[#ea4335]/15 text-[#ea4335]'
                          : 'bg-[#25d366]/15 text-[#25d366]'
                    }`}
                  >
                    {isRecording ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                        <polygon points="5 3 19 12 5 21 5 3" />
                      </svg>
                    ) : mediaMode === 'video' ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                        <path d="M17 10.5V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3.5l4 4v-11l-4 4z" />
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                        <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1.1-.3 1.2.4 2.5.6 3.8.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.6.6 3.8.1.4 0 .8-.3 1.1L6.6 10.8z" />
                      </svg>
                    )}
                  </div>
                )}
                {isRecording ? (
                  <span className="absolute left-1 top-1 rounded bg-black/70 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
                    Rec
                  </span>
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-semibold text-zinc-50">{title}</p>
                <p className="mt-0.5 truncate text-[12px] text-zinc-400">{subtitle}</p>
              </div>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                className="shrink-0 text-zinc-500"
                aria-hidden
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

/** @param {number} totalSec */
function formatSharedCallDuration(totalSec) {
  const s = Math.max(0, Math.floor(totalSec))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${String(r).padStart(2, '0')}`
}

/** @param {string | null | undefined} iso */
function formatSharedCallWhen(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return ''
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/**
 * @param {{
 *   open: boolean,
 *   onBack: () => void,
 *   supabaseClient: import('@supabase/supabase-js').SupabaseClient,
 *   roomId: string,
 *   onJumpToMessage: (messageId: string) => void,
 *   senderUserId?: string | null,
 *   title?: string,
 *   zIndex?: number,
 * }} props
 */
export function ChatGroupMediaSheet({
  open,
  onBack,
  supabaseClient,
  roomId,
  onJumpToMessage,
  senderUserId = null,
  title = 'Media, links & docs',
  zIndex = 96,
}) {
  const [tab, setTab] = useState('media')
  const [media, setMedia] = useState(/** @type {any[]} */ ([]))
  const [links, setLinks] = useState(/** @type {any[]} */ ([]))
  const [docs, setDocs] = useState(/** @type {any[]} */ ([]))
  const [calls, setCalls] = useState(/** @type {any[]} */ ([]))
  const [loading, setLoading] = useState(false)
  const [loadErr, setLoadErr] = useState('')
  const [linksErr, setLinksErr] = useState('')
  const [callsErr, setCallsErr] = useState('')
  const [linkSearch, setLinkSearch] = useState('')

  useEffect(() => {
    if (!open) {
      setLinkSearch('')
      return
    }
    setLoading(true)
    setLoadErr('')
    setLinksErr('')
    setCallsErr('')
    void (async () => {
      const mediaP = chatRoomSharedMedia(supabaseClient, roomId, 80, senderUserId)
        .then((m) => { setMedia(m); return m })
        .catch((e) => { setMedia([]); setLoadErr(e?.message || 'Failed to load media.'); return [] })
      const linksP = chatRoomSharedLinks(supabaseClient, roomId, { docsOnly: false, senderUserId })
        .then((l) => { setLinks(l); return l })
        .catch((e) => { setLinks([]); setLinksErr(e?.message || 'Failed to load links.'); return [] })
      const docsP = chatRoomSharedLinks(supabaseClient, roomId, { docsOnly: true, senderUserId })
        .then((d) => { setDocs(d); return d })
        .catch((e) => { setDocs([]); setLinksErr((prev) => prev || e?.message || 'Failed to load docs.'); return [] })
      const callsP = chatRoomSharedCalls(supabaseClient, roomId, 80, senderUserId)
        .then((c) => { setCalls(c); return c })
        .catch((e) => { setCalls([]); setCallsErr(e?.message || 'Failed to load calls.'); return [] })

      await Promise.all([mediaP, linksP, docsP, callsP])
      setLoading(false)
    })()
  }, [open, roomId, supabaseClient, senderUserId])

  const showLinkSearch = tab === 'links' || tab === 'docs'
  const tabError =
    tab === 'media' ? loadErr : tab === 'calls' ? callsErr : tab === 'links' || tab === 'docs' ? linksErr : ''

  return (
    <AuxSheetShell open={open} title={title} onBack={onBack} zIndex={zIndex}>
      <div className="mb-4 flex flex-wrap gap-2">
        {MEDIA_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-full px-3 py-1.5 text-[13px] font-semibold touch-manipulation ${
              tab === t.id
                ? 'bg-cyan-600 text-zinc-950'
                : 'border border-zinc-600 text-zinc-300 active:bg-zinc-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {showLinkSearch ? (
        <div className="relative mb-4">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
            aria-hidden
          >
            <circle cx="11" cy="11" r="7" />
            <line x1="16.5" y1="16.5" x2="21" y2="21" />
          </svg>
          <input
            value={linkSearch}
            onChange={(e) => setLinkSearch(e.target.value)}
            placeholder="Search"
            className="w-full rounded-xl border border-zinc-700/80 bg-zinc-900 py-2.5 pl-9 pr-3 text-[15px] text-zinc-100 placeholder:text-zinc-500 focus:border-cyan-500/50 focus:outline-none"
          />
        </div>
      ) : null}
      {tabError ? (
        <p className="text-[13px] text-rose-400">{tabError}</p>
      ) : loading ? (
        <p className="text-[13px] text-zinc-500">Loading…</p>
      ) : tab === 'media' ? (
        media.length === 0 ? (
          <p className="text-[13px] text-zinc-500">No photos shared yet.</p>
        ) : (
          <div className="grid grid-cols-3 gap-1.5">
            {media.map((item, i) => (
              <button
                key={`${item.message_id}-${item.url}-${i}`}
                type="button"
                className="aspect-square overflow-hidden rounded-lg touch-manipulation active:opacity-80"
                onClick={() => {
                  onJumpToMessage(item.message_id)
                  onBack()
                }}
              >
                <img src={item.url} alt="" className="h-full w-full object-cover" loading="lazy" />
              </button>
            ))}
          </div>
        )
      ) : tab === 'links' ? (
        links.length === 0 ? (
          <p className="text-[13px] text-zinc-500">No links found.</p>
        ) : (
          <SharedLinksList
            items={links}
            query={linkSearch}
            onJumpToMessage={onJumpToMessage}
            onBack={onBack}
          />
        )
      ) : tab === 'docs' ? (
        docs.length === 0 ? (
          <p className="text-[13px] text-zinc-500">No docs found.</p>
        ) : (
          <SharedLinksList
            items={docs}
            query={linkSearch}
            onJumpToMessage={onJumpToMessage}
            onBack={onBack}
            itemLabel="docs"
          />
        )
      ) : tab === 'calls' ? (
        calls.length === 0 ? (
          <p className="text-[13px] text-zinc-500">No calls yet.</p>
        ) : (
          <SharedCallsList
            items={calls}
            onJumpToMessage={onJumpToMessage}
            onBack={onBack}
          />
        )
      ) : null}
    </AuxSheetShell>
  )
}

/**
 * @param {{
 *   open: boolean,
 *   onBack: () => void,
 *   supabaseClient: import('@supabase/supabase-js').SupabaseClient,
 *   roomId: string,
 *   onJumpToMessage: (messageId: string) => void,
 *   senderUserId?: string | null,
 *   title?: string,
 *   zIndex?: number,
 * }} props
 */
export function ChatGroupStarredSheet({
  open,
  onBack,
  supabaseClient,
  roomId,
  onJumpToMessage,
  senderUserId = null,
  title = 'Starred',
  zIndex = 96,
}) {
  const [rows, setRows] = useState(/** @type {any[]} */ ([]))
  const [loading, setLoading] = useState(false)
  const [loadErr, setLoadErr] = useState('')

  useEffect(() => {
    if (!open) return
    setLoading(true)
    setLoadErr('')
    void (async () => {
      try {
        const stars = await chatStarredMessagesPage(supabaseClient, roomId, 50, senderUserId)
        setRows(stars)
      } catch (e) {
        setRows([])
        setLoadErr(e?.message || 'Failed to load starred messages.')
      } finally {
        setLoading(false)
      }
    })()
  }, [open, roomId, supabaseClient, senderUserId])

  return (
    <AuxSheetShell open={open} title={title} onBack={onBack} zIndex={zIndex}>
      {loadErr ? (
        <p className="text-[13px] text-rose-400">{loadErr}</p>
      ) : loading ? (
        <p className="text-[13px] text-zinc-500">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="mt-4 text-center text-[14px] text-zinc-500">
          {senderUserId ? 'No starred messages from this member.' : 'Long-press any message and tap Star.'}
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((s) => (
            <li key={s.message_id}>
              <button
                type="button"
                className="w-full rounded-xl bg-zinc-900/80 px-3 py-2.5 text-left touch-manipulation active:bg-zinc-800"
                onClick={() => {
                  onJumpToMessage(s.message_id)
                  onBack()
                }}
              >
                <div className="line-clamp-2 text-[14px] text-zinc-200">{s.body || '[media]'}</div>
                <div className="mt-1 text-[11px] text-zinc-500">
                  {new Date(s.created_at).toLocaleString()}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </AuxSheetShell>
  )
}
