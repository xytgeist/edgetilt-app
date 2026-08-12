import { useState } from 'react'
import { MessageCircle, Users } from 'lucide-react'
import { APP_MODAL_OVERLAY_CLASS } from '../../constants/appZIndex.js'
import { chatCreateGroup } from '../chat/chatApi.js'
import { edgeProfileDisplayName } from './pokerStableTerms.js'

function peerLabel(profile, userId) {
  const name = edgeProfileDisplayName(profile)
  if (name) return name
  return 'Edge user'
}

function peerInitials(profile) {
  const display = String(profile?.display_name || '').trim()
  if (display) {
    const parts = display.split(/\s+/).filter(Boolean)
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
    return display.slice(0, 2).toUpperCase()
  }
  const handle = String(profile?.handle || '').replace(/^@+/, '')
  if (handle) return handle.slice(0, 2).toUpperCase()
  return '?'
}

/**
 * Creator multi-backer stake chat menu: DM any Edge peer or create a group.
 */
export default function PokerStakeChatMenuSheet({
  open,
  onClose,
  deal,
  dmPeers = [],
  canCreateGroup = false,
  groupMemberIds = [],
  profilesById = {},
  supabaseClient,
  onOpenChatWithUser,
  onOpenChatRoom,
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (!open || !deal) return null

  const title = deal.label?.trim() || 'Stake chat'

  const openDm = (peerUserId) => {
    if (!peerUserId || typeof onOpenChatWithUser !== 'function') return
    onOpenChatWithUser(peerUserId)
    onClose?.()
  }

  const createGroup = async () => {
    if (!canCreateGroup || !supabaseClient || typeof onOpenChatRoom !== 'function') return
    const members = (groupMemberIds || []).filter(Boolean)
    if (members.length < 2) {
      setError('Need at least one other Edge user for a group.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const res = await chatCreateGroup(supabaseClient, {
        title,
        memberUserIds: members,
      })
      const roomId = res?.room_id
      if (!roomId) throw new Error('Could not create group.')
      onOpenChatRoom(roomId)
      onClose?.()
    } catch (e) {
      setError(e?.message || 'Could not create group.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className={`${APP_MODAL_OVERLAY_CLASS} z-[140] overflow-x-hidden bg-black/70 backdrop-blur-sm`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="poker-stake-chat-menu-title"
      onClick={() => !busy && onClose?.()}
    >
      <div
        data-poker-stake-chat-menu
        className="relative z-10 w-full max-w-lg overflow-hidden rounded-t-3xl border-t border-zinc-700/50 bg-zinc-900 px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-10 shrink-0 rounded-full bg-zinc-600/70" aria-hidden />
        <h2
          id="poker-stake-chat-menu-title"
          className="text-center text-lg font-black tracking-tight text-white"
        >
          Chat
        </h2>
        <p className="mt-1 text-center text-sm text-zinc-400">{title}</p>

        <div className="mt-4 space-y-1.5">
          {dmPeers.map((peerId) => {
            const profile = profilesById[peerId] || null
            const label = peerLabel(profile, peerId)
            const avatar = profile?.avatar_url
            return (
              <button
                key={peerId}
                type="button"
                disabled={busy}
                data-poker-stake-chat-dm
                onClick={() => openDm(peerId)}
                className="flex w-full items-center gap-3 rounded-2xl bg-zinc-800/80 px-3 py-3 text-left touch-manipulation active:bg-zinc-700/80 disabled:opacity-50"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-zinc-700 text-xs font-bold text-zinc-200">
                  {avatar ? (
                    <img src={avatar} alt="" className="h-full w-full object-cover" />
                  ) : (
                    peerInitials(profile)
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-white">{label}</span>
                  <span className="block text-xs text-zinc-500">Direct message</span>
                </span>
                <MessageCircle className="h-4 w-4 shrink-0 text-cyan-300" strokeWidth={2.1} aria-hidden />
              </button>
            )
          })}
        </div>

        {canCreateGroup ? (
          <button
            type="button"
            disabled={busy}
            data-poker-stake-chat-group
            onClick={() => void createGroup()}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-cyan-600 px-4 py-3.5 text-sm font-bold text-white touch-manipulation active:bg-cyan-500 disabled:opacity-50"
          >
            <Users className="h-4 w-4" strokeWidth={2.2} aria-hidden />
            {busy ? 'Creating…' : 'Create group chat'}
          </button>
        ) : null}

        {error ? <p className="mt-3 text-center text-sm text-rose-400">{error}</p> : null}

        <button
          type="button"
          disabled={busy}
          onClick={() => onClose?.()}
          className="mt-3 w-full rounded-2xl bg-zinc-800 px-4 py-3 text-sm font-semibold text-zinc-300 touch-manipulation active:bg-zinc-700 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
