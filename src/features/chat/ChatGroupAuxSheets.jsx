import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  chatCanPinMessages,
  chatPinnedMessagesPage,
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
import { textIsOnlyUrls } from '../../utils/linkifyText.jsx'

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
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.5rem)' }}
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
]

/** @param {string | null | undefined} bodyPreview */
function linkMessageFooter(bodyPreview) {
  const t = String(bodyPreview || '').trim()
  if (!t || textIsOnlyUrls(t)) return null
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
                  bodyPreview={linkMessageFooter(item.body_preview) || 'View message'}
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
  const [loading, setLoading] = useState(false)
  const [loadErr, setLoadErr] = useState('')
  const [linksErr, setLinksErr] = useState('')
  const [linkSearch, setLinkSearch] = useState('')

  useEffect(() => {
    if (!open) {
      setLinkSearch('')
      return
    }
    setLoading(true)
    setLoadErr('')
    setLinksErr('')
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

      await Promise.all([mediaP, linksP, docsP])
      setLoading(false)
    })()
  }, [open, roomId, supabaseClient, senderUserId])

  const showLinkSearch = tab === 'links' || tab === 'docs'

  return (
    <AuxSheetShell open={open} title={title} onBack={onBack} zIndex={zIndex}>
      <div className="mb-4 flex gap-2">
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
      {loadErr && tab === 'media' ? (
        <p className="text-[13px] text-rose-400">{loadErr}</p>
      ) : linksErr && tab !== 'media' ? (
        <p className="text-[13px] text-rose-400">{linksErr}</p>
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
