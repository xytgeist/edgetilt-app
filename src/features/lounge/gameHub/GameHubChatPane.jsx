import { X } from 'lucide-react'
import { formatPostAge } from './gameHubFormatters.js'

/**
 * Game Hub live chat room. Newest message sits right under the tabs so the
 * field hero stays in view (composer is pinned in the hub footer).
 */
export default function GameHubChatPane({ messages, loading, error, viewerId, onDelete, readOnly }) {
  if (loading && !messages.length) {
    return <div className="py-8 text-center text-sm text-zinc-500">Loading chat…</div>
  }
  if (error && !messages.length) {
    return <div className="py-8 text-center text-sm text-lv-red">{error}</div>
  }
  if (!messages.length) {
    return (
      <div className="py-10 text-center text-sm text-zinc-500">
        {readOnly ? 'No messages yet.' : 'No messages yet. Start the conversation.'}
      </div>
    )
  }
  const newestFirst = messages.slice().reverse()
  return (
    <ul data-lounge-game-chat-list className="space-y-3 py-1">
      {newestFirst.map((msg) => {
        const profile = msg.profile
        const name = profile?.display_name || profile?.handle || 'Member'
        const mine = Boolean(viewerId && msg.user_id === viewerId)
        return (
          <li key={msg.id} className="group flex gap-2.5">
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt="" className="h-7 w-7 shrink-0 rounded-full object-cover" />
            ) : (
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-[11px] font-bold text-zinc-300">
                {name.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-1.5">
                <span className="truncate text-[13px] font-bold">{name}</span>
                {profile?.handle ? (
                  <span className="truncate text-[12px] text-zinc-500">@{profile.handle}</span>
                ) : null}
                <span className="shrink-0 text-[12px] text-zinc-500">· {formatPostAge(msg.created_at)}</span>
              </div>
              <p className="whitespace-pre-wrap break-words text-[14px] leading-snug text-zinc-200">{msg.body}</p>
            </div>
            {mine ? (
              <button
                type="button"
                onClick={() => onDelete?.(msg.id)}
                className="shrink-0 self-start rounded-full p-1 text-zinc-500 touch-manipulation active:bg-zinc-800"
                aria-label="Delete message"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}
