import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  chatRoomSharedLinks,
  chatRoomSharedMedia,
  chatStarredMessagesPage,
} from './chatApi.js'
import { ChatGroupMediaSheet, ChatGroupStarredSheet } from './ChatGroupAuxSheets.jsx'
import { SectionLabel, SettingsGroup } from './chatSettingsUi.jsx'

/**
 * Group member contact info - iMessage-style profile from group settings.
 *
 * @param {{
 *   open: boolean,
 *   onBack: () => void,
 *   member: { user_id: string, display_name?: string | null, handle?: string | null, avatar_url?: string | null } | null,
 *   roomId: string,
 *   supabaseClient: import('@supabase/supabase-js').SupabaseClient,
 *   viewerUserId: string,
 *   onJumpToMessage: (messageId: string) => void,
 *   onOpenDm?: ((userId: string) => void | Promise<void>) | null,
 *   onViewProfile?: ((userId: string) => void) | null,
 *   onCloseAll?: () => void,
 * }} props
 */
export default function ChatGroupMemberProfileSheet({
  open,
  onBack,
  member,
  roomId,
  supabaseClient,
  viewerUserId,
  onJumpToMessage,
  onOpenDm = null,
  onViewProfile = null,
  onCloseAll,
}) {
  const [auxView, setAuxView] = useState(/** @type {null | 'media' | 'starred'} */ (null))
  const [mediaCount, setMediaCount] = useState(0)
  const [linksCount, setLinksCount] = useState(0)
  const [starredCount, setStarredCount] = useState(0)
  const [countsLoading, setCountsLoading] = useState(false)

  const userId = member?.user_id || null
  const displayName = member?.display_name || member?.handle || 'Member'
  const handle = member?.handle ? String(member.handle).replace(/^@/, '') : null
  const initial = displayName.replace(/^@/, '')[0]?.toUpperCase() || '?'
  const isMe = userId === viewerUserId

  useEffect(() => {
    if (!open || !userId) {
      setAuxView(null)
      setMediaCount(0)
      setLinksCount(0)
      setStarredCount(0)
      return
    }
    setCountsLoading(true)
    void (async () => {
      try {
        const [media, links, stars] = await Promise.all([
          chatRoomSharedMedia(supabaseClient, roomId, 80, userId).catch(() => []),
          chatRoomSharedLinks(supabaseClient, roomId, { docsOnly: false, senderUserId: userId }).catch(() => []),
          chatStarredMessagesPage(supabaseClient, roomId, 50, userId).catch(() => []),
        ])
        setMediaCount(media.length)
        setLinksCount(links.length)
        setStarredCount(stars.length)
      } finally {
        setCountsLoading(false)
      }
    })()
  }, [open, userId, roomId, supabaseClient])

  if (!open || !member || !userId || typeof document === 'undefined') return null

  const sharedContentCount = mediaCount + linksCount
  const jump = (messageId) => {
    onJumpToMessage(messageId)
    onCloseAll?.()
  }

  return createPortal(
    <>
      <div className="fixed inset-0 z-[97] flex flex-col bg-zinc-950" data-chat-feature>
        <div
          className="flex shrink-0 items-center gap-3 border-b border-zinc-800/60 px-3 pb-3"
          style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.5rem)' }}
        >
          <button
            type="button"
            onClick={onBack}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-zinc-400 touch-manipulation active:bg-zinc-800"
            aria-label="Back"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <h1 className="flex-1 text-center text-[17px] font-semibold text-zinc-100">Contact info</h1>
          <div className="h-9 w-9 shrink-0" aria-hidden />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain pb-10">
          <div className="flex flex-col items-center px-4 pb-5 pt-6">
            {member.avatar_url ? (
              <img
                src={member.avatar_url}
                alt={displayName}
                className="h-[84px] w-[84px] rounded-full object-cover shadow-lg ring-2 ring-white/15"
              />
            ) : (
              <div className="grid h-[84px] w-[84px] place-items-center rounded-full bg-zinc-700 text-[28px] font-bold text-zinc-300 shadow-lg ring-2 ring-white/15">
                {initial}
              </div>
            )}
            <h2 className="mt-3 text-center text-[20px] font-bold text-zinc-50">{displayName}</h2>
            {handle ? (
              <p className="mt-0.5 text-[14px] text-zinc-500">@{handle}</p>
            ) : null}
          </div>

          <div className="mx-4 mb-5 grid grid-cols-3 gap-2">
            <ActionChip
              label="Message"
              disabled={isMe || !onOpenDm}
              onClick={() => {
                if (!onOpenDm || isMe) return
                void onOpenDm(userId)
                onCloseAll?.()
              }}
              icon={<IconMessage enabled={!isMe && Boolean(onOpenDm)} />}
            />
            <ActionChip label="Audio" disabled icon={<IconPhone disabled />} />
            <ActionChip label="Video" disabled icon={<IconVideo disabled />} />
          </div>

          <SettingsGroup>
            <SettingsNavRow
              icon={<IconMedia />}
              label="Media, links & docs"
              value={countsLoading ? '…' : sharedContentCount > 0 ? String(sharedContentCount) : 'None'}
              dim={!countsLoading && sharedContentCount === 0}
              onPress={sharedContentCount > 0 ? () => setAuxView('media') : null}
            />
            <SettingsNavRow
              icon={<IconStar />}
              label="Starred messages"
              value={countsLoading ? '…' : starredCount > 0 ? String(starredCount) : 'None'}
              dim={!countsLoading && starredCount === 0}
              onPress={starredCount > 0 ? () => setAuxView('starred') : null}
            />
          </SettingsGroup>

          {onViewProfile ? (
            <>
              <SectionLabel>Profile</SectionLabel>
              <SettingsGroup>
                <SettingsNavRow
                  icon={<IconProfile />}
                  label="View Edge profile"
                  onPress={() => {
                    onViewProfile(userId)
                    onCloseAll?.()
                  }}
                />
              </SettingsGroup>
            </>
          ) : null}
        </div>
      </div>

      <ChatGroupMediaSheet
        open={open && auxView === 'media'}
        onBack={() => setAuxView(null)}
        supabaseClient={supabaseClient}
        roomId={roomId}
        senderUserId={userId}
        title={`Media, links & docs`}
        onJumpToMessage={jump}
        zIndex={98}
      />
      <ChatGroupStarredSheet
        open={open && auxView === 'starred'}
        onBack={() => setAuxView(null)}
        supabaseClient={supabaseClient}
        roomId={roomId}
        senderUserId={userId}
        title="Starred messages"
        onJumpToMessage={jump}
        zIndex={98}
      />
    </>,
    document.body,
  )
}

/**
 * @param {{ label: string, icon: import('react').ReactNode, disabled?: boolean, onClick?: () => void }} props
 */
function ActionChip({ label, icon, disabled = false, onClick }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex flex-col items-center gap-1.5 rounded-2xl bg-zinc-900/70 px-2 py-3 touch-manipulation ${
        disabled ? 'opacity-45' : 'active:bg-zinc-800'
      }`}
    >
      <span className="grid h-10 w-10 place-items-center">{icon}</span>
      <span className={`text-[12px] font-medium ${disabled ? 'text-zinc-500' : 'text-zinc-200'}`}>{label}</span>
    </button>
  )
}

/**
 * @param {{
 *   icon: import('react').ReactNode,
 *   label: string,
 *   value?: string,
 *   dim?: boolean,
 *   onPress?: (() => void) | null,
 * }} props
 */
function SettingsNavRow({ icon, label, value, dim = false, onPress }) {
  const Tag = onPress ? 'button' : 'div'
  return (
    <Tag
      type={onPress ? 'button' : undefined}
      onClick={onPress || undefined}
      className={`flex w-full items-center gap-3 border-b border-zinc-800/50 px-4 py-3.5 last:border-b-0 ${
        onPress ? 'touch-manipulation active:bg-zinc-800' : ''
      }`}
    >
      <span className={`shrink-0 ${dim ? 'text-zinc-600' : 'text-zinc-400'}`}>{icon}</span>
      <span className={`flex-1 text-left text-[14px] font-medium ${dim ? 'text-zinc-500' : 'text-zinc-100'}`}>
        {label}
      </span>
      {value ? (
        <span className={`shrink-0 text-[13px] ${dim ? 'text-zinc-600' : 'text-zinc-500'}`}>{value}</span>
      ) : null}
      {onPress ? (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="shrink-0 text-zinc-600">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      ) : null}
    </Tag>
  )
}

function IconMessage({ enabled }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={enabled ? 'text-emerald-400' : 'text-zinc-500'}>
      <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
    </svg>
  )
}

function IconPhone({ disabled }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={disabled ? 'text-zinc-500' : 'text-emerald-400'}>
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  )
}

function IconVideo({ disabled }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={disabled ? 'text-zinc-500' : 'text-emerald-400'}>
      <polygon points="23 7 16 12 23 17 23 7" />
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
    </svg>
  )
}

function IconMedia() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="18" height="18" rx="2" />
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

function IconProfile() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )
}
