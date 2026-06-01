import { createPortal } from 'react-dom'
import { useCallback, useRef, useState } from 'react'
import ChatEmojiPicker, { saveRecentEmoji } from './ChatEmojiPicker'
import LoungeFlameIcon from '../lounge/LoungeFlameIcon'

const QUICK_REACTIONS = ['👍','❤️','😂','🔥','😮','😢','🎉','😍','👏','💯','🙏','🤣']

/**
 * Frosted-glass style shared by the floating menus.
 * backdrop-filter picks up the colors of content behind the element,
 * approximating the iOS vibrancy / material effect.
 */

/**
 * Compute absolute positions for the floating emoji pill and action card,
 * keeping both on screen regardless of where the bubble sits.
 *
 * iOS rule: emoji pill above the bubble, action card below — flip sides
 * when there isn't room.
 */
function computeLayout(rect, isMine) {
  const vw  = window.innerWidth
  const vh  = window.innerHeight
  const SAFE_TOP    = 52   // generous for notch / Dynamic Island
  const SAFE_BOTTOM = 40   // home indicator
  const PILL_H      = 60
  const MENU_H      = 230  // estimated max action card height
  const GAP         = 10
  const PILL_W      = Math.min(360, vw - 32)
  const MENU_W      = Math.min(252, vw - 32)

  // Horizontal: right-align with bubble for "mine", left-align for others
  const rawPillLeft = isMine ? rect.right - PILL_W : rect.left
  const pillLeft    = Math.max(16, Math.min(rawPillLeft, vw - PILL_W - 16))

  const rawMenuLeft = isMine ? rect.right - MENU_W : rect.left
  const menuLeft    = Math.max(16, Math.min(rawMenuLeft, vw - MENU_W - 16))

  const spaceAbove = rect.top  - SAFE_TOP
  const spaceBelow = vh - rect.bottom - SAFE_BOTTOM

  let pillTop, menuTop

  if (spaceAbove >= PILL_H + GAP * 2) {
    // Room above → emoji pill above bubble
    pillTop = rect.top - PILL_H - GAP
    // Action card below if room, else stack above pill
    menuTop = spaceBelow >= MENU_H + GAP
      ? rect.bottom + GAP
      : pillTop - MENU_H - GAP
  } else {
    // Pill below bubble
    pillTop = rect.bottom + GAP
    // Card above bubble
    menuTop = rect.top - MENU_H - GAP
    // If card would be clipped at top, put it below the pill
    if (menuTop < SAFE_TOP + 4) {
      menuTop = pillTop + PILL_H + GAP
    }
  }

  // Clamp both to the safe viewport
  pillTop = Math.max(SAFE_TOP + 4, Math.min(pillTop, vh - PILL_H      - SAFE_BOTTOM - 4))
  menuTop = Math.max(SAFE_TOP + 4, Math.min(menuTop, vh - MENU_H      - SAFE_BOTTOM - 4))

  return { pillTop, pillLeft, pillW: PILL_W, menuTop, menuLeft, menuW: MENU_W }
}

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
 *     reply_to_sender_id?: string | null,
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
 *   hideSenderInfo?: boolean,
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
  hideSenderInfo = false,
}) {
  const [menuOpen, setMenuOpen]           = useState(false)
  const [fullPickerOpen, setFullPickerOpen] = useState(false)
  const [bubbleRect, setBubbleRect]       = useState(/** @type {DOMRect | null} */ (null))

  const longPressTimer = useRef(null)
  const bubbleRef      = useRef(null)
  const isDeleted      = Boolean(message.deleted_at)

  // ── Long-press detection ────────────────────────────────────────────────────
  // Cancel if the pointer moves > 8px (user is scrolling, not holding).

  const handlePointerDown = useCallback(() => {
    let cancelled = false

    const onMove = (e) => {
      if (Math.abs(e.movementX) > 8 || Math.abs(e.movementY) > 8) {
        cancelled = true
        clearTimeout(longPressTimer.current)
        document.removeEventListener('pointermove', onMove)
      }
    }

    document.addEventListener('pointermove', onMove, { passive: true })

    longPressTimer.current = setTimeout(() => {
      document.removeEventListener('pointermove', onMove)
      if (cancelled) return
      const rect = bubbleRef.current?.getBoundingClientRect()
      if (rect) {
        // Clear any text selection iOS may have started during the hold
        window.getSelection()?.removeAllRanges()
        setBubbleRect(rect)
        setMenuOpen(true)
      }
    }, 450)
  }, [])

  const cancelLongPress = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }, [])

  const closeMenu = useCallback(() => {
    setMenuOpen(false)
    setBubbleRect(null)
    setFullPickerOpen(false)
  }, [])

  // ── Reaction helpers ────────────────────────────────────────────────────────

  const reactionGroups = reactions.reduce((acc, r) => {
    acc[r.emoji] = { count: r.count, viewerReacted: r.viewerReacted }
    return acc
  }, /** @type {Record<string, { count: number, viewerReacted: boolean }>} */ ({}))

  const toggleReaction = useCallback((emoji) => {
    const group = reactionGroups[emoji]
    if (group?.viewerReacted) {
      onRemoveReaction(message.id, emoji)
    } else {
      saveRecentEmoji(emoji)
      onAddReaction(message.id, emoji)
    }
    closeMenu()
  }, [reactionGroups, onRemoveReaction, onAddReaction, message.id, closeMenu])

  const handleCopy = useCallback(() => {
    if (message.body) {
      navigator.clipboard?.writeText(message.body).catch(() => {})
    }
    closeMenu()
  }, [message.body, closeMenu])

  // ── Formatting ──────────────────────────────────────────────────────────────

  const formattedTime = message.created_at
    ? new Date(message.created_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : ''

  const imageUrls = Array.isArray(message.image_urls) ? message.image_urls.filter(Boolean) : []

  // Floating menu layout — computed fresh each render so it tracks the latest rect
  const layout = bubbleRect ? computeLayout(bubbleRect, isMine) : null

  return (
    // eslint-disable-next-line react/forbid-dom-props
    <div className="relative select-none" style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none' }}>
      <div className={`flex items-end gap-2 ${isMine ? 'flex-row-reverse' : 'flex-row'}`}>
        {/* Avatar — only for others' messages; hidden in DMs (header already shows peer) */}
        {!isMine && !hideSenderInfo && (
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
          {/* Sender name — others only; hidden in DMs */}
          {!isMine && !hideSenderInfo && (
            <div className="px-1 text-[11px] font-semibold text-zinc-500">{senderLabel}</div>
          )}

          {/* Twitter-style reply pill — compact quoted bubble above the reply */}
          {!isDeleted && message.reply_to_message_id && message.reply_to_preview && (() => {
            const isQuoteFromMe = message.reply_to_sender_id != null
              ? message.reply_to_sender_id === viewerUserId
              : !isMine
            return (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden
                  className={`text-zinc-400 ${isMine ? 'self-end mr-3' : 'self-start ml-3 scale-x-[-1]'}`}>
                  <path d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z"/>
                </svg>
                <div className={`rounded-2xl px-3 py-1.5 text-[12px] leading-snug opacity-70 ${
                  isQuoteFromMe
                    ? 'bg-cyan-800/70 text-cyan-50'
                    : 'bg-zinc-800/90 text-zinc-100'
                }`}>
                  <p className="line-clamp-2">{message.reply_to_preview}</p>
                </div>
              </>
            )
          })()}

          {/* Bubble */}
          <div
            ref={bubbleRef}
            onPointerDown={handlePointerDown}
            onPointerUp={cancelLongPress}
            onPointerCancel={cancelLongPress}
            onPointerLeave={cancelLongPress}
            onContextMenu={(e) => e.preventDefault()}
            className={`relative select-none rounded-2xl px-3 py-2 text-[15px] leading-snug touch-manipulation transition-opacity ${
              isDeleted
                ? 'border border-zinc-800 bg-transparent italic text-zinc-600'
                : isMine
                ? 'bg-cyan-800/70 text-cyan-50'
                : 'bg-zinc-800/90 text-zinc-100'
            } ${menuOpen ? 'opacity-80' : 'opacity-100'}`}
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

          {/* Reaction pill — combined, overlaps bubble bottom */}
          {reactions.length > 0 && (() => {
            const totalCount = reactions.reduce((sum, r) => sum + r.count, 0)
            return (
              <div className={`-mt-3 relative z-10 flex px-2 ${isMine ? 'justify-end' : 'justify-start'}`}>
                <div className="reaction-pill flex items-center gap-0.5 rounded-full px-1.5 py-0.5">
                  {reactions.map((r) => (
                    r.emoji === '❤️'
                      ? <LoungeFlameIcon key={r.emoji} liked className="h-[15px] w-[15px]" />
                      : <span key={r.emoji} className="text-[14px] leading-none">{r.emoji}</span>
                  ))}
                  {totalCount >= 2 && (
                    <span className="ml-0.5 text-[11px] font-semibold leading-none text-zinc-400">{totalCount}</span>
                  )}
                </div>
              </div>
            )
          })()}
        </div>
      </div>

      {/* Timestamp — hidden to the right, revealed when the user swipes the message list left */}
      {formattedTime ? (
        <div
          className="pointer-events-none absolute bottom-0 select-none text-right text-[10px] text-zinc-500"
          style={{ right: '-76px', width: '72px', paddingBottom: '4px' }}
          aria-hidden
        >
          {formattedTime}
        </div>
      ) : null}

      {/* ── Floating long-press menus (via portal so they escape any transform containers) ── */}
      {menuOpen && layout && createPortal(
        <>
          {/* Scrim — catches taps to dismiss */}
          <div
            className="fixed inset-0 z-[108] bg-black/30"
            onClick={closeMenu}
          />

          {/* Floating emoji pill */}
          <div
            className="chat-menu-glass fixed z-[109] flex items-center overflow-x-auto rounded-full px-2 py-1 scrollbar-none"
            style={{
              top:   layout.pillTop,
              left:  layout.pillLeft,
              width: layout.pillW,
              height: 56,
              touchAction: 'pan-x',
              overscrollBehaviorX: 'contain',
            }}
            onClick={(e) => e.stopPropagation()}
            onTouchMove={(e) => e.stopPropagation()}
          >
            {QUICK_REACTIONS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => toggleReaction(e)}
                className={`shrink-0 touch-manipulation px-1.5 transition-transform active:scale-90 ${
                  reactionGroups[e]?.viewerReacted ? 'scale-110' : ''
                }`}
              >
                {e === '❤️'
                  ? <LoungeFlameIcon liked className="h-[32px] w-[32px] translate-y-0.5" />
                  : <span className="text-[26px]">{e}</span>
                }
              </button>
            ))}

            {/* Separator */}
            <div className="mx-1 h-6 shrink-0 w-px bg-zinc-600/70" />

            {/* Open full picker */}
            <button
              type="button"
              onClick={() => setFullPickerOpen(true)}
              className="shrink-0 flex h-9 w-9 items-center justify-center rounded-full bg-zinc-700/60 text-zinc-400 touch-manipulation transition-colors active:bg-zinc-600"
              aria-label="More emoji"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-5 w-5">
                <circle cx="12" cy="12" r="10" />
                <path d="M8 13.5s1.5 2 4 2 4-2 4-2" strokeLinecap="round" />
                <circle cx="9" cy="9.5"  r="1" fill="currentColor" stroke="none" />
                <circle cx="15" cy="9.5" r="1" fill="currentColor" stroke="none" />
              </svg>
            </button>
          </div>

          {/* Floating action card */}
          <div
            className="chat-menu-glass fixed z-[109] overflow-hidden rounded-2xl"
            style={{
              top:   layout.menuTop,
              left:  layout.menuLeft,
              width: layout.menuW,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {!isDeleted && (
              <ActionRow
                icon={<ReplyIcon />}
                label="Reply"
                onClick={() => { onReply(message); closeMenu() }}
              />
            )}

            {!isDeleted && (
              <>
                <Divider />
                <ActionRow
                  icon={<CopyIcon />}
                  label="Copy"
                  onClick={handleCopy}
                />
                <ActionRow
                  icon={<ForwardIcon />}
                  label="Forward"
                  onClick={() => { closeMenu() /* TODO: forward */ }}
                  dim
                />
              </>
            )}

            <Divider />
            <ActionRow
              icon={<FlagIcon />}
              label="Report"
              onClick={() => { closeMenu() /* TODO: report */ }}
              dim
            />

            {!isDeleted && isMine && (
              <>
                <Divider />
                <ActionRow
                  icon={<TrashIcon />}
                  label="Delete"
                  danger
                  onClick={() => { onDeleteMessage(message.id); closeMenu() }}
                />
              </>
            )}
          </div>
        </>,
        document.body
      )}

      {/* Full emoji picker sheet */}
      {fullPickerOpen && createPortal(
        <ChatEmojiPicker
          onSelect={(emoji) => toggleReaction(emoji)}
          onClose={() => setFullPickerOpen(false)}
        />,
        document.body
      )}
    </div>
  )
}

// ── Small reusable action row ──────────────────────────────────────────────

function ActionRow({ icon, label, onClick, danger = false, dim = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 px-4 py-3.5 text-[15px] font-semibold touch-manipulation transition-colors active:bg-white/10 ${
        danger ? 'text-rose-400' : dim ? 'text-zinc-500' : 'text-zinc-100'
      }`}
    >
      <span className="shrink-0 opacity-80">{icon}</span>
      {label}
    </button>
  )
}

function Divider() {
  return <div className="mx-4 h-px bg-white/10" />
}

// ── SVG icons ──────────────────────────────────────────────────────────────

const S = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '1.8', strokeLinecap: 'round', strokeLinejoin: 'round' }

function ReplyIcon()   { return <svg {...S}><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg> }
function CopyIcon()    { return <svg {...S}><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> }
function ForwardIcon() { return <svg {...S}><polyline points="15 17 20 12 15 7"/><path d="M4 18v-2a4 4 0 0 1 4-4h12"/></svg> }
function FlagIcon()    { return <svg {...S}><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg> }
function TrashIcon()   { return <svg {...S}><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg> }
