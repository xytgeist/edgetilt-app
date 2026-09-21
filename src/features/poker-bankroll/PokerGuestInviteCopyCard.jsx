import { useState } from 'react'
import { Copy, Share2 } from 'lucide-react'
import { APP_MODAL_SHEET_PANEL_CLASS } from '../../constants/appZIndex.js'
import AppModalOverlay from '../../components/AppModalOverlay.jsx'
import {
  copyGuestInviteText,
  guestStakeInviteSheetTitle,
  guestSwapInviteSheetTitle,
  invitesAreStakeInvites,
  invitesAreTournamentSwaps,
  shareGuestInvite,
} from './pokerGuestInviteShare.js'

export function PokerGuestInviteCopyCard({
  title = 'Text them this',
  text,
  url,
  shareTitle = 'EdgeTilt invite',
  onShared,
}) {
  const [copied, setCopied] = useState(false)
  const body = String(text || '').trim()
  const link = String(url || '').trim()

  async function onCopy() {
    const ok = await copyGuestInviteText(body)
    if (!ok) return
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  async function onShare() {
    const result = await shareGuestInvite({ title: shareTitle, text: body, url: link })
    if (result?.mode === 'aborted' || result?.mode === 'failed') return
    onShared?.()
  }

  if (!body) return null

  return (
    <div
      data-poker-guest-invite
      className="rounded-2xl border border-cyan-500/25 bg-cyan-950/20 p-3"
    >
      <p className="text-[10px] font-semibold uppercase tracking-wide text-cyan-200/80">{title}</p>
      <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-snug text-zinc-100">
        {body}
      </p>
      <div className="mt-2.5 flex gap-2">
        <button
          type="button"
          data-poker-guest-invite-copy-text-btn
          onClick={() => void onCopy()}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-zinc-600 py-2.5 text-xs font-semibold text-zinc-200 touch-manipulation active:bg-zinc-800"
        >
          <Copy size={14} aria-hidden />
          {copied ? 'Copied' : 'Copy text'}
        </button>
        <button
          type="button"
          data-poker-guest-invite-share-btn
          onClick={() => void onShare()}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-2.5 text-xs font-bold text-white touch-manipulation active:bg-emerald-500"
        >
          <Share2 size={14} aria-hidden />
          Share
        </button>
      </div>
    </div>
  )
}

function inviteShareKey(row, idx) {
  return String(row?.id || row?.url || `invite:${idx}`)
}

export default function PokerGuestInvitesSheet({
  invites = [],
  heading,
  onClose,
}) {
  const all = Array.isArray(invites) ? invites.filter((row) => row?.text) : []
  const [sharedKeys, setSharedKeys] = useState(() => new Set())
  const remaining = all.filter((row, idx) => !sharedKeys.has(inviteShareKey(row, idx)))

  function handleShared(row, idx) {
    if (remaining.length <= 1) {
      onClose()
      return
    }
    setSharedKeys((prev) => {
      const next = new Set(prev)
      next.add(inviteShareKey(row, idx))
      return next
    })
  }

  if (!all.length || !remaining.length) return null
  const title =
    String(heading || '').trim()
    || (invitesAreTournamentSwaps(remaining)
      ? guestSwapInviteSheetTitle(remaining)
      : invitesAreStakeInvites(remaining)
        ? guestStakeInviteSheetTitle(remaining)
        : 'Send in your own text')

  return (
    <AppModalOverlay className="overflow-x-hidden" onClick={onClose}>
      <div
        data-poker-guest-invites-sheet
        className={`relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto ${APP_MODAL_SHEET_PANEL_CLASS}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <h3 className="min-w-0 text-lg font-bold leading-snug text-white">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-xl px-3 py-1.5 text-sm font-semibold text-zinc-400 touch-manipulation"
          >
            Done
          </button>
        </div>
        <div className="space-y-3">
          {all.map((row, idx) => {
            const key = inviteShareKey(row, idx)
            if (sharedKeys.has(key)) return null
            return (
              <PokerGuestInviteCopyCard
                key={key}
                title={row.title || 'Text them this'}
                text={row.text}
                url={row.url}
                shareTitle={row.shareTitle || 'EdgeTilt invite'}
                onShared={() => handleShared(row, idx)}
              />
            )
          })}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-2xl border border-zinc-700 py-3 text-sm font-semibold text-zinc-300 touch-manipulation"
        >
          Done
        </button>
      </div>
    </AppModalOverlay>
  )
}
