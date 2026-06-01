import { useCallback, useRef, useState } from 'react'

/** Allowed emoji reactions. */
const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥']

/**
 * @param {{
 *   message: {
 *     id: string,
 *     body: string,
 *     image_urls?: string[],
 *     sender_id: string,
 *     created_at: string,
 *     deleted_at?: string | null,
 *     reply_to_message_id?: string | null,
 *     reply_to_preview?: string | null,
 *   },
 *   senderLabel: string,
 *   senderAvatarUrl?: string | null,
 *   isMine: boolean,
 *   reactions?: { emoji: string, count: number, viewerReacted: boolean }[],
 *   viewerUserId: string,
 *   onReply: (message: object) => void,
 *   onDeleteMessage: (messageId: string) => void,
 *   onAddReaction: (messageId: string, emoji: string) => void,
 *   onRemoveReaction: (messageId: string, emoji: string) => void,
 * }} props
 */
export default function ChatBubble({
  message,
  senderLabel,
  senderAvatarUrl = null,
  isMine,
  reactions = [],
  viewerUserId,
  onReply,
  onDeleteMessage,
  onAddReaction,
  onRemoveReaction,
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [reactionPickerOpen, setReactionPickerOpen] = useState(false)
  const longPressTimer = useRef(null)
  const isDeleted = Boolean(message.deleted_at)

  const handlePointerDown = useCallback(() => {
    longPressTimer.current = setTimeout(() => {
      setMenuOpen(true)
    }, 450)
  }, [])

  const handlePointerUp = useCallback(() => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current)
  }, [])

  const handlePointerCancel = useCallback(() => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current)
  }, [])

  // reactions are already aggregated by the server — build lookup by emoji
  const reactionGroups = reactions.reduce((acc, r) => {
    acc[r.emoji] = { count: r.count, viewerReacted: r.viewerReacted }
    return acc
  }, /** @type {Record<string, { count: number, viewerReacted: boolean }>} */ ({}))

  const toggleReaction = (emoji) => {
    const group = reactionGroups[emoji]
    if (group?.viewerReacted) {
      onRemoveReaction(message.id, emoji)
    } else {
      onAddReaction(message.id, emoji)
    }
    setReactionPickerOpen(false)
    setMenuOpen(false)
  }

  const formattedTime = message.created_at
    ? new Date(message.created_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : ''

  const imageUrls = Array.isArray(message.image_urls) ? message.image_urls.filter(Boolean) : []

  return (
    <div className="relative">
    <div className={`flex items-end gap-2 ${isMine ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* Avatar — only for others' messages */}
      {!isMine && (
        <div className="shrink-0 self-end mb-1">
          {senderAvatarUrl ? (
            <img
              src={senderAvatarUrl}
              alt={senderLabel}
              className="h-7 w-7 rounded-full object-cover"
            />
          ) : (
            <div className="grid h-7 w-7 place-items-center rounded-full bg-zinc-700 text-[11px] font-bold text-zinc-300">
              {(senderLabel?.replace(/^@/, '') || '?')[0].toUpperCase()}
            </div>
          )}
        </div>
      )}

      <div className={`flex max-w-[78%] flex-col gap-1 ${isMine ? 'items-end' : 'items-start'}`}>
        {/* Sender name — others only */}
        {!isMine && (
          <div className="px-1 text-[11px] font-semibold text-zinc-500">{senderLabel}</div>
        )}

        {/* Reply quote strip */}
        {!isDeleted && message.reply_to_message_id && message.reply_to_preview && (
          <div
            className={`flex items-start gap-1.5 rounded-xl px-2.5 py-1.5 text-[12px] leading-snug ${
              isMine ? 'bg-cyan-900/40 text-cyan-300/80' : 'bg-zinc-800/80 text-zinc-400'
            }`}
          >
            <span aria-hidden className="mt-0.5 shrink-0 text-[10px]">↩</span>
            <span className="line-clamp-2">{message.reply_to_preview}</span>
          </div>
        )}

        {/* Bubble */}
        <div
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          onPointerLeave={handlePointerCancel}
          className={`relative select-none rounded-2xl px-3 py-2 text-[15px] leading-snug touch-manipulation ${
            isDeleted
              ? 'border border-zinc-800 bg-transparent italic text-zinc-600'
              : isMine
              ? 'bg-cyan-800/70 text-cyan-50'
              : 'bg-zinc-800/90 text-zinc-100'
          }`}
          style={{ WebkitUserSelect: 'none', userSelect: 'none' }}
        >
          {isDeleted ? (
            <span>This message was deleted</span>
          ) : (
            <>
              {message.body && (
                <div className="whitespace-pre-wrap break-words">{message.body}</div>
              )}
              {imageUrls.length > 0 && (
                <div className={`mt-1.5 grid gap-1 ${imageUrls.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
                  {imageUrls.map((url) => (
                    <img
                      key={url}
                      src={url}
                      alt=""
                      className="max-h-56 w-full rounded-xl object-cover"
                      loading="lazy"
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Reaction row */}
        {Object.keys(reactionGroups).length > 0 && (
          <div className="flex flex-wrap gap-1 px-1">
            {Object.entries(reactionGroups).map(([emoji, { count, viewerReacted }]) => (
              <button
                key={emoji}
                type="button"
                onClick={() => toggleReaction(emoji)}
                className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] touch-manipulation transition-colors ${
                  viewerReacted
                    ? 'bg-cyan-800/60 text-cyan-200'
                    : 'bg-zinc-800/80 text-zinc-300 hover:bg-zinc-700'
                }`}
              >
                <span>{emoji}</span>
                <span className="font-semibold">{count}</span>
              </button>
            ))}
          </div>
        )}

      </div>
    </div>

    {/* Timestamp — hidden to the right, revealed when the user swipes the message list left.
        Positioned 76px past the row edge; ChatConversation clips with overflow-x:hidden
        and translates the list layer up to 76px left on horizontal swipe. */}
    {formattedTime ? (
      <div
        className="pointer-events-none absolute bottom-0 select-none text-right text-[10px] text-zinc-500"
        style={{ right: '-76px', width: '72px', paddingBottom: '4px' }}
        aria-hidden
      >
        {formattedTime}
      </div>
    ) : null}

    {/* Long-press action menu — fixed so it escapes the relative container */}
    {menuOpen && (
      <div
        className="fixed inset-0 z-[110] flex items-end justify-center pb-8"
        onClick={() => { setMenuOpen(false); setReactionPickerOpen(false) }}
      >
        <div
          className="w-full max-w-sm rounded-2xl border border-zinc-700/50 bg-zinc-900 shadow-2xl mx-4"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Reaction picker */}
          <div className="flex justify-around border-b border-zinc-800 px-4 py-3">
            {REACTION_EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => toggleReaction(e)}
                className="text-2xl touch-manipulation active:scale-90 transition-transform"
              >
                {e}
              </button>
            ))}
          </div>

          {/* Actions */}
          {!isDeleted && (
            <button
              type="button"
              onClick={() => { onReply(message); setMenuOpen(false) }}
              className="flex w-full items-center gap-3 px-5 py-4 text-[15px] font-semibold text-zinc-100 touch-manipulation hover:bg-zinc-800/60"
            >
              <span aria-hidden className="text-lg">↩</span>
              Reply
            </button>
          )}

          {!isDeleted && isMine && (
            <button
              type="button"
              onClick={() => { onDeleteMessage(message.id); setMenuOpen(false) }}
              className="flex w-full items-center gap-3 rounded-b-2xl px-5 py-4 text-[15px] font-semibold text-rose-400 touch-manipulation hover:bg-zinc-800/60"
            >
              <span aria-hidden className="text-lg">🗑</span>
              Delete message
            </button>
          )}

          <button
            type="button"
            onClick={() => setMenuOpen(false)}
            className="flex w-full items-center justify-center rounded-b-2xl border-t border-zinc-800 px-5 py-4 text-[15px] font-semibold text-zinc-400 touch-manipulation hover:bg-zinc-800/60"
          >
            Cancel
          </button>
        </div>
      </div>
    )}
  </div>
  )
}
