import { createPortal } from 'react-dom'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  chatMuteRoom,
  chatPinnedMessagesPage,
  chatRoomIsMuted,
  chatStarredMessagesPage,
  chatUnmuteRoom,
} from './chatApi.js'
import {
  ChatGroupMediaSheet,
  ChatGroupPinnedSheet,
  ChatGroupSearchSheet,
  ChatGroupStarredSheet,
} from './ChatGroupAuxSheets.jsx'
import { SectionLabel, SettingsGroup, SettingsToggleRow } from './chatSettingsUi.jsx'

/**
 * DM chat info - opened from the header avatar / name pill.
 *
 * @param {{
 *   open: boolean,
 *   onClose: () => void,
 *   supabaseClient: import('@supabase/supabase-js').SupabaseClient,
 *   room: { id: string, kind?: string, muted_until?: string | null },
 *   peerDisplayName: string,
 *   peerAvatarUrl?: string | null,
 *   peerHandle?: string | null,
 *   peerUserId?: string | null,
 *   viewerUserId: string,
 *   onJumpToMessage?: (messageId: string) => void,
 *   onPinsChanged?: () => void,
 *   onViewProfile?: ((userId: string) => void) | null,
 *   onRoomUpdated?: ((patch: Record<string, unknown>) => void) | null,
 *   viewerReadReceiptsEnabled: boolean,
 *   onViewerReadReceiptsEnabledChange?: ((enabled: boolean) => void | Promise<void>) | null,
 *   readReceiptsBusy?: boolean,
 * }} props
 */
export default function ChatDmInfoSheet({
  open,
  onClose,
  supabaseClient,
  room,
  peerDisplayName,
  peerAvatarUrl = null,
  peerHandle = null,
  peerUserId = null,
  viewerUserId,
  onJumpToMessage,
  onPinsChanged,
  onViewProfile = null,
  onRoomUpdated = null,
  viewerReadReceiptsEnabled,
  onViewerReadReceiptsEnabledChange = null,
  readReceiptsBusy = false,
}) {
  const [err, setErr] = useState('')
  const [muteBusy, setMuteBusy] = useState(false)
  const [auxView, setAuxView] = useState(/** @type {null | 'search' | 'pinned' | 'media' | 'starred'} */ (null))
  const [starred, setStarred] = useState(/** @type {any[]} */ ([]))
  const [pinnedCount, setPinnedCount] = useState(0)
  const scrollBodyRef = useRef(null)
  const heroTitleRef = useRef(null)
  const topChromeRef = useRef(null)
  const titleRevealRafRef = useRef(0)
  const [titleBarReveal, setTitleBarReveal] = useState(0)

  const muted = chatRoomIsMuted(room.muted_until)
  const initial = (peerDisplayName || '?').replace(/^@/, '')[0]?.toUpperCase() || '?'
  const contactDisplayName = String(peerDisplayName || 'Member').trim() || 'Member'

  const reloadCounts = useCallback(async () => {
    if (!room?.id) return
    try {
      const stars = await chatStarredMessagesPage(supabaseClient, room.id, 40)
      setStarred(stars)
    } catch {
      setStarred([])
    }
    try {
      const pins = await chatPinnedMessagesPage(supabaseClient, room.id, 50)
      setPinnedCount(pins.length)
    } catch {
      setPinnedCount(0)
    }
  }, [room?.id, supabaseClient])

  useEffect(() => {
    if (!open) return
    setErr('')
    setAuxView(null)
    void reloadCounts()
  }, [open, reloadCounts])

  const updateTitleBarReveal = useCallback(() => {
    const hero = heroTitleRef.current
    const chrome = topChromeRef.current
    if (!hero || !chrome) {
      setTitleBarReveal(0)
      return
    }
    const chromeBottom = chrome.getBoundingClientRect().bottom
    const heroRect = hero.getBoundingClientRect()
    const overlap = chromeBottom - heroRect.top
    const heroH = Math.max(heroRect.height, 1)
    setTitleBarReveal(Math.max(0, Math.min(1, overlap / heroH)))
  }, [])

  useEffect(() => {
    if (!open) return undefined
    setTitleBarReveal(0)
    if (scrollBodyRef.current) scrollBodyRef.current.scrollTop = 0

    const queueReveal = () => {
      if (titleRevealRafRef.current) return
      titleRevealRafRef.current = window.requestAnimationFrame(() => {
        titleRevealRafRef.current = 0
        updateTitleBarReveal()
      })
    }

    queueReveal()
    const el = scrollBodyRef.current
    if (!el) return undefined
    el.addEventListener('scroll', queueReveal, { passive: true })
    window.addEventListener('resize', queueReveal)
    return () => {
      el.removeEventListener('scroll', queueReveal)
      window.removeEventListener('resize', queueReveal)
      if (titleRevealRafRef.current) window.cancelAnimationFrame(titleRevealRafRef.current)
    }
  }, [open, updateTitleBarReveal, contactDisplayName])

  useLayoutEffect(() => {
    if (!open) return
    updateTitleBarReveal()
  }, [open, contactDisplayName, updateTitleBarReveal])

  if (typeof document === 'undefined' || !open) return null

  const handleToggleMute = async () => {
    setMuteBusy(true)
    setErr('')
    try {
      if (muted) {
        await chatUnmuteRoom(supabaseClient, room.id)
        onRoomUpdated?.({ muted_until: null })
      } else {
        await chatMuteRoom(supabaseClient, room.id, 8)
        onRoomUpdated?.({ muted_until: new Date(Date.now() + 8 * 3600000).toISOString() })
      }
    } catch (e) {
      setErr(e?.message || 'Could not update mute.')
    } finally {
      setMuteBusy(false)
    }
  }

  const jump = (messageId) => {
    onJumpToMessage?.(messageId)
    onClose()
  }

  const scrollTopInset = 'calc(env(safe-area-inset-top, 0px) + 3.75rem)'

  return (
    <>
      {createPortal(
        <div className="fixed inset-0 z-[95] flex flex-col bg-zinc-950" data-chat-feature>
          {/* Fixed glass chrome - back + scroll-reveal title */}
          <div
            ref={topChromeRef}
            className="pointer-events-none absolute inset-x-0 top-0 z-20"
            style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.5rem)' }}
          >
            <div className="relative flex items-center justify-between gap-2 px-3 pb-3">
              <button
                type="button"
                onClick={onClose}
                aria-label="Back"
                className="chat-header-glass pointer-events-auto relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-zinc-100 touch-manipulation active:opacity-70"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>

              <p
                className="pointer-events-none absolute inset-x-14 top-0 h-10 truncate text-center text-[17px] font-semibold leading-10 text-zinc-100"
                style={{ opacity: titleBarReveal }}
                aria-hidden={titleBarReveal < 0.08}
              >
                {contactDisplayName}
              </p>

              <div className="h-10 w-10 shrink-0" aria-hidden />
            </div>
          </div>

          {/* Scroll body - content slides under fixed chrome + top fade */}
          <div className="relative min-h-0 flex-1 overflow-hidden">
            <div
              className="chat-info-top-fade pointer-events-none absolute inset-x-0 top-0 z-10"
              style={{ height: scrollTopInset }}
            />
            <div
              ref={scrollBodyRef}
              className="min-h-0 h-full overflow-y-auto overscroll-y-contain pb-10"
              style={{ paddingTop: scrollTopInset }}
            >
            {err ? (
              <div className="mx-4 mt-3 rounded-xl border border-rose-500/30 bg-rose-950/30 px-3 py-2.5 text-[13px] text-rose-300">
                {err}
              </div>
            ) : null}

            <div className="flex flex-col items-center px-4 pb-5 pt-6">
              {peerAvatarUrl ? (
                <img
                  src={peerAvatarUrl}
                  alt={peerDisplayName}
                  className="h-[84px] w-[84px] rounded-full object-cover shadow-lg ring-2 ring-white/15"
                />
              ) : (
                <div className="grid h-[84px] w-[84px] place-items-center rounded-full bg-zinc-700 text-[28px] font-bold text-zinc-300 shadow-lg ring-2 ring-white/15">
                  {initial}
                </div>
              )}
              <h2
                ref={heroTitleRef}
                className="mt-3 text-center text-[20px] font-bold text-zinc-50"
              >
                {contactDisplayName}
              </h2>
              {peerHandle ? (
                <p className="mt-0.5 text-[14px] text-zinc-500">@{peerHandle.replace(/^@/, '')}</p>
              ) : null}
            </div>

            <SettingsGroup>
              <SettingsRow
                icon={<IconSearch />}
                label="Search messages"
                onPress={() => setAuxView('search')}
              />
              <SettingsRow
                icon={<IconPin />}
                label="Pinned messages"
                badge={pinnedCount > 0 ? String(pinnedCount) : null}
                onPress={() => setAuxView('pinned')}
              />
              <SettingsRow
                icon={<IconMedia />}
                label="Media, links & docs"
                onPress={() => setAuxView('media')}
              />
              <SettingsRow
                icon={<IconStar />}
                label="Starred messages"
                badge={starred.length > 0 ? String(starred.length) : null}
                onPress={starred.length > 0 ? () => setAuxView('starred') : null}
                dim={starred.length === 0}
              />
            </SettingsGroup>

            {peerUserId && onViewProfile ? (
              <>
                <SectionLabel>Profile</SectionLabel>
                <SettingsGroup>
                  <button
                    type="button"
                    onClick={() => { onClose(); onViewProfile(peerUserId) }}
                    className="flex w-full items-center gap-3 px-4 py-3.5 text-left touch-manipulation active:bg-zinc-800"
                  >
                    <span className="flex-1 text-[14px] font-medium text-zinc-100">View profile</span>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="shrink-0 text-zinc-600">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </button>
                </SettingsGroup>
              </>
            ) : null}

            <SectionLabel>Privacy</SectionLabel>
            <SettingsGroup>
              <SettingsToggleRow
                label="Read receipts"
                hint="When off, you won't send or see read receipts."
                enabled={viewerReadReceiptsEnabled}
                busy={readReceiptsBusy}
                onToggle={() => onViewerReadReceiptsEnabledChange?.(!viewerReadReceiptsEnabled)}
              />
            </SettingsGroup>

            <SectionLabel>Notifications</SectionLabel>
            <SettingsGroup>
              <button
                type="button"
                disabled={muteBusy}
                onClick={() => void handleToggleMute()}
                className="flex w-full items-center gap-3 px-4 py-3.5 text-left touch-manipulation active:bg-zinc-800 disabled:opacity-50"
              >
                <span className="flex-1 text-[14px] font-medium text-zinc-100">
                  {muted ? 'Unmute notifications' : 'Mute notifications'}
                </span>
                <span className={`text-[13px] ${muted ? 'text-amber-400' : 'text-zinc-500'}`}>
                  {muted ? 'On' : 'Off'}
                </span>
              </button>
            </SettingsGroup>
          </div>
          </div>
        </div>,
        document.body,
      )}

      <ChatGroupSearchSheet
        open={open && auxView === 'search'}
        onBack={() => setAuxView(null)}
        supabaseClient={supabaseClient}
        roomId={String(room.id)}
        onJumpToMessage={jump}
      />
      <ChatGroupPinnedSheet
        open={open && auxView === 'pinned'}
        onBack={() => setAuxView(null)}
        supabaseClient={supabaseClient}
        room={room}
        viewerUserId={viewerUserId}
        onJumpToMessage={jump}
        onPinsChanged={onPinsChanged}
      />
      <ChatGroupMediaSheet
        open={open && auxView === 'media'}
        onBack={() => setAuxView(null)}
        supabaseClient={supabaseClient}
        roomId={String(room.id)}
        onJumpToMessage={jump}
      />
      <ChatGroupStarredSheet
        open={open && auxView === 'starred'}
        onBack={() => setAuxView(null)}
        supabaseClient={supabaseClient}
        roomId={String(room.id)}
        onJumpToMessage={jump}
      />
    </>
  )
}

/**
 * @param {{
 *   icon: import('react').ReactNode,
 *   label: string,
 *   badge?: string | null,
 *   onPress?: (() => void) | null,
 *   dim?: boolean,
 * }} props
 */
function SettingsRow({ icon, label, badge, onPress, dim = false }) {
  const Tag = onPress ? 'button' : 'div'
  return (
    <Tag
      type={onPress ? 'button' : undefined}
      onClick={onPress || undefined}
      className={`flex w-full items-center gap-3 border-b border-zinc-800/50 px-4 py-3 last:border-b-0 ${onPress ? 'touch-manipulation active:bg-zinc-800' : ''}`}
    >
      <span className={`shrink-0 ${dim ? 'text-zinc-600' : 'text-zinc-400'}`}>{icon}</span>
      <span className={`flex-1 text-left text-[14px] font-medium ${dim ? 'text-zinc-500' : 'text-zinc-100'}`}>{label}</span>
      {badge ? (
        <span className="shrink-0 rounded-full bg-zinc-800 px-2 py-0.5 text-[12px] font-semibold text-zinc-300">
          {badge}
        </span>
      ) : null}
      {onPress ? (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="shrink-0 text-zinc-600">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      ) : null}
    </Tag>
  )
}

function IconSearch() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  )
}

function IconPin() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  )
}

function IconMedia() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  )
}

function IconStar() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  )
}
