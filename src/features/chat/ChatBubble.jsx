import { createPortal } from 'react-dom'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import ChatEmojiPicker, { saveRecentEmoji } from './ChatEmojiPicker'
import LoungeFlameIcon from '../lounge/LoungeFlameIcon'

const QUICK_REACTIONS = ['👍','❤️','😂','🔥','😮','😢','🎉','😍','👏','💯','🙏','🤣']

const IS_IOS = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent)

/** SVG chip art inset in 24×24 viewBox (~75% fill) — slightly larger than emoji em-square. */
const REACTION_CHIP_CLASS = 'h-6 w-6 shrink-0'
const QUICK_CHIP_CLASS = 'h-7 w-7 shrink-0'

/**
 * Frosted-glass style shared by the floating menus.
 * backdrop-filter picks up the colors of content behind the element,
 * approximating the iOS vibrancy / material effect.
 */

const PILL_H = 64
const BUBBLE_EXPANDED_RADIUS_PX = 16
const MENU_ROW_H = 50
const MENU_DIV_H = 1
const LAYOUT_GAP = 12

/** Match rendered action-card rows (Reply / Copy / … / Delete). */
function estimateMenuHeight(isDeleted, isMine, enableStar = false, enablePin = false) {
  if (isDeleted) return MENU_ROW_H + 8
  let rows = 4 // Reply, Copy, Forward, Report
  let divs = 2
  if (enableStar) {
    rows += 1
    divs += 1
  }
  if (enablePin) {
    rows += 1
    divs += 1
  }
  if (isMine) {
    rows += 1
    divs += 1
  }
  return rows * MENU_ROW_H + divs * MENU_DIV_H + 8
}

/**
 * Compute absolute positions for the floating emoji pill and action card,
 * keeping both on screen and never overlapping each other.
 *
 * Preferred stack: emoji pill above bubble, action card below bubble.
 */
function computeLayout(rect, isMine, { isDeleted = false, enableStar = false, enablePin = false } = {}) {
  const vw  = window.innerWidth
  const vh  = window.innerHeight
  const SAFE_TOP    = 52
  const SAFE_BOTTOM = 120 // composer overlay + home indicator
  const MENU_H      = estimateMenuHeight(isDeleted, isMine, enableStar, enablePin)
  const PILL_W      = Math.min(360, vw - 32)
  const MENU_W      = Math.min(252, vw - 32)

  const rawPillLeft = isMine ? rect.right - PILL_W : rect.left
  const pillLeft    = Math.max(16, Math.min(rawPillLeft, vw - PILL_W - 16))

  const rawMenuLeft = isMine ? rect.right - MENU_W : rect.left
  const menuLeft    = Math.max(16, Math.min(rawMenuLeft, vw - MENU_W - 16))

  let pillTop = rect.top - PILL_H - LAYOUT_GAP
  let menuTop = rect.bottom + LAYOUT_GAP

  const pillAboveFits = pillTop >= SAFE_TOP
  const menuBelowFits = menuTop + MENU_H <= vh - SAFE_BOTTOM

  if (pillAboveFits && menuBelowFits) {
    // Default: pill above bubble, menu below — bubble separates them.
  } else if (pillAboveFits && !menuBelowFits) {
    // Not enough room below — stack menu above pill.
    menuTop = pillTop - MENU_H - LAYOUT_GAP
    if (menuTop < SAFE_TOP) {
      // Still tight — stack both below bubble.
      pillTop = rect.bottom + LAYOUT_GAP
      menuTop = pillTop + PILL_H + LAYOUT_GAP
    }
  } else if (!pillAboveFits && menuBelowFits) {
    // Not enough room above — pill below bubble, menu above bubble.
    pillTop = rect.bottom + LAYOUT_GAP
    menuTop = rect.top - MENU_H - LAYOUT_GAP
    if (menuTop < SAFE_TOP) {
      menuTop = pillTop + PILL_H + LAYOUT_GAP
    }
  } else {
    // Very tight — stack below bubble: bubble → pill → menu.
    pillTop = rect.bottom + LAYOUT_GAP
    menuTop = pillTop + PILL_H + LAYOUT_GAP
    if (menuTop + MENU_H > vh - SAFE_BOTTOM) {
      // Flip: menu → pill → bubble above.
      pillTop = rect.top - PILL_H - LAYOUT_GAP
      menuTop = pillTop - MENU_H - LAYOUT_GAP
    }
  }

  // Guard: independent clamping must not re-introduce overlap.
  const pillBottom = pillTop + PILL_H
  const menusOverlapPill = menuTop < pillBottom + LAYOUT_GAP && menuTop + MENU_H > pillTop - LAYOUT_GAP
  if (menusOverlapPill) {
    if (menuTop >= rect.bottom - 4) {
      menuTop = pillBottom + LAYOUT_GAP
    } else {
      menuTop = pillTop - MENU_H - LAYOUT_GAP
    }
  }

  pillTop = Math.max(SAFE_TOP, Math.min(pillTop, vh - PILL_H - SAFE_BOTTOM))
  menuTop = Math.max(SAFE_TOP, Math.min(menuTop, vh - MENU_H - SAFE_BOTTOM))

  // Re-check after clamp — push menu away from pill if clamp caused collision.
  if (menuTop < pillTop + PILL_H + LAYOUT_GAP && menuTop + MENU_H > pillTop - LAYOUT_GAP) {
    const stackBelow = rect.top + rect.height / 2 > vh / 2
    if (stackBelow) {
      menuTop = Math.min(pillTop + PILL_H + LAYOUT_GAP, vh - SAFE_BOTTOM - MENU_H)
      if (menuTop < pillTop + PILL_H + LAYOUT_GAP) {
        pillTop = Math.max(SAFE_TOP, menuTop - PILL_H - LAYOUT_GAP)
      }
    } else {
      menuTop = Math.max(SAFE_TOP, pillTop - MENU_H - LAYOUT_GAP)
      if (menuTop + MENU_H > pillTop - LAYOUT_GAP) {
        pillTop = menuTop + MENU_H + LAYOUT_GAP
      }
    }
  }

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
 *   enableStar?: boolean,
 *   isStarred?: boolean,
 *   onToggleStar?: (messageId: string, starred: boolean) => void,
 *   enablePin?: boolean,
 *   isPinned?: boolean,
 *   onTogglePin?: (messageId: string, pinned: boolean) => void,
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
  enableStar = false,
  isStarred = false,
  onToggleStar,
  enablePin = false,
  isPinned = false,
  onTogglePin,
}) {
  const [menuOpen, setMenuOpen]           = useState(false)
  const [fullPickerOpen, setFullPickerOpen] = useState(false)
  const [bubbleRect, setBubbleRect]       = useState(/** @type {DOMRect | null} */ (null))
  const [compactBubble, setCompactBubble] = useState(true)

  const longPressTimer = useRef(null)
  const bubbleRef      = useRef(null)
  const isDeleted      = Boolean(message.deleted_at)

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }, [])

  const openLongPressMenu = useCallback(() => {
    const rect = bubbleRef.current?.getBoundingClientRect()
    if (!rect) return
    window.getSelection()?.removeAllRanges()
    setBubbleRect(rect)
    setMenuOpen(true)
  }, [])

  // ── Long-press detection ────────────────────────────────────────────────────
  // Cancel if the pointer moves > 8px (user is scrolling, not holding).

  const handlePointerDown = useCallback((e) => {
    if (IS_IOS) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    let cancelled = false
    const startX = e.clientX
    const startY = e.clientY

    const onMove = (ev) => {
      if (Math.abs(ev.clientX - startX) > 8 || Math.abs(ev.clientY - startY) > 8) {
        cancelled = true
        clearLongPressTimer()
        document.removeEventListener('pointermove', onMove)
      }
    }

    document.addEventListener('pointermove', onMove, { passive: true })

    longPressTimer.current = setTimeout(() => {
      document.removeEventListener('pointermove', onMove)
      if (cancelled) return
      openLongPressMenu()
    }, 450)
  }, [clearLongPressTimer, openLongPressMenu])

  const cancelLongPress = useCallback(() => {
    clearLongPressTimer()
  }, [clearLongPressTimer])

  const closeMenu = useCallback(() => {
    setMenuOpen(false)
    setBubbleRect(null)
    setFullPickerOpen(false)
  }, [])

  // iOS Safari: passive touchstart (no preventDefault = scroll stays working).
  // Long-press timer drives menu open. Selection is cleared by the selectionchange
  // listener on the chat container — not here.
  useEffect(() => {
    if (!IS_IOS) return
    const el = bubbleRef.current
    if (!el) return

    let startX = 0, startY = 0, cancelled = false

    const onTouchStart = (e) => {
      if (e.touches.length !== 1) return
      cancelled = false
      startX = e.touches[0].clientX
      startY = e.touches[0].clientY
      window.getSelection()?.removeAllRanges()
      clearLongPressTimer()
      longPressTimer.current = setTimeout(() => {
        if (cancelled) return
        window.getSelection()?.removeAllRanges()
        openLongPressMenu()
      }, 380)
    }

    const onTouchMove = (e) => {
      if (e.touches.length !== 1) return
      // Clear selection on every micro-movement — iOS triggers selection at ~300ms
      // with even 1-2px of movement, before our long-press timer fires.
      window.getSelection()?.removeAllRanges()
      if (cancelled) return
      if (Math.abs(e.touches[0].clientX - startX) > 8 || Math.abs(e.touches[0].clientY - startY) > 8) {
        cancelled = true
        clearLongPressTimer()
      }
    }

    const onTouchEnd = () => {
      clearLongPressTimer()
      window.getSelection()?.removeAllRanges()
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: true })
    el.addEventListener('touchend', onTouchEnd, { passive: true })
    el.addEventListener('touchcancel', onTouchEnd, { passive: true })

    return () => {
      clearLongPressTimer()
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
      el.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [clearLongPressTimer, openLongPressMenu])

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

  // Pill ends on one visual line of text; fixed radius when wrapped or media attached.
  useLayoutEffect(() => {
    const el = bubbleRef.current
    if (!el) return

    const measure = () => {
      if (imageUrls.length > 0) {
        setCompactBubble(false)
        return
      }
      if (!message.body?.trim()) {
        setCompactBubble(true)
        return
      }
      if (message.body.includes('\n')) {
        setCompactBubble(false)
        return
      }
      const textEl = el.querySelector('.chat-bubble-body')
      if (!textEl) {
        setCompactBubble(true)
        return
      }
      const lineHeight = parseFloat(getComputedStyle(textEl).lineHeight) || 22
      const lines = Math.max(1, Math.round(textEl.scrollHeight / lineHeight))
      setCompactBubble(lines <= 1)
    }

    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [message.body, imageUrls.length])

  // Floating menu layout — computed fresh each render so it tracks the latest rect
  const layout = bubbleRect ? computeLayout(bubbleRect, isMine, { isDeleted, enableStar, enablePin }) : null

  return (
    <div
      data-chat-message-id={message.id}
      className="relative select-none"
      style={{
        WebkitTouchCallout: 'none',
        WebkitUserSelect: 'none',
        userSelect: 'none',
        ...(isStarred && !isDeleted ? {
          backgroundColor: 'rgba(251,191,36,0.045)',
          borderRadius: '16px',
          marginInline: '-6px',
          paddingInline: '6px',
        } : {}),
      }}
    >
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
                <div
                  className={`rounded-2xl px-3 py-1.5 text-[12px] leading-snug opacity-70 ${
                    isQuoteFromMe ? 'text-white' : 'bg-zinc-800/90 text-zinc-100'
                  }`}
                  style={isQuoteFromMe ? { backgroundColor: '#3b82f6' } : undefined}
                >
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
            onSelectStart={(e) => e.preventDefault()}
            className={`chat-bubble-surface relative select-none px-3 py-2 text-[16px] leading-snug transition-opacity ${
              compactBubble ? '' : 'rounded-2xl'
            } ${
              isDeleted
                ? 'border border-zinc-800 bg-transparent italic text-zinc-600'
                : isMine
                ? 'text-white'
                : 'bg-zinc-800/90 text-zinc-100'
            } ${menuOpen ? 'opacity-80' : 'opacity-100'}`}
            style={{
              WebkitUserSelect: 'none',
              userSelect: 'none',
              WebkitTouchCallout: 'none',
              touchAction: 'pan-y',
              borderRadius: compactBubble ? '9999px' : BUBBLE_EXPANDED_RADIUS_PX,
              backgroundColor: isMine && !isDeleted ? '#3b82f6' : undefined,
              boxShadow: isStarred && !isDeleted
                ? '0 0 0 1.5px rgba(251,191,36,0.55)'
                : undefined,
              transition: 'box-shadow 0.2s ease',
            }}
          >
            {isDeleted ? (
              <span>This message was deleted</span>
            ) : (
              <>

                {message.body && (
                  <div className="chat-bubble-body whitespace-pre-wrap break-words">{message.body}</div>
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

          {/* Starred indicator — small amber star under the trailing bubble corner */}
          {isStarred && !isDeleted && (
            <div className={`-mt-1 flex select-none pointer-events-none ${isMine ? 'justify-end pr-2.5' : 'justify-start pl-2.5'}`}>
              <span className="text-[10px] leading-none text-amber-400" aria-label="Starred">★</span>
            </div>
          )}

          {/* Reaction pill — combined, overlaps bubble bottom */}
          {reactions.length > 0 && (() => {
            const totalCount = reactions.reduce((sum, r) => sum + r.count, 0)
            return (
              <div className={`-mt-3 relative z-10 flex px-2 ${isMine ? 'justify-end' : 'justify-start'}`}>
                <div className="reaction-pill flex items-center gap-1 rounded-full px-2.5 py-1">
                  {reactions.map((r) => (
                    r.emoji === '❤️'
                      ? <LoungeFlameIcon key={r.emoji} liked className={REACTION_CHIP_CLASS} />
                      : <span key={r.emoji} className="text-[16px] leading-none">{r.emoji}</span>
                  ))}
                  {totalCount >= 2 && (
                    <span className="ml-0.5 text-[12px] font-semibold leading-none text-zinc-400">{totalCount}</span>
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
            className="chat-menu-glass fixed z-[109] flex items-center gap-1 overflow-x-auto rounded-full px-2.5 py-1.5 scrollbar-none"
            style={{
              top:   layout.pillTop,
              left:  layout.pillLeft,
              width: layout.pillW,
              height: PILL_H,
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
                className={`shrink-0 flex h-11 w-11 items-center justify-center rounded-full bg-zinc-700/60 touch-manipulation transition-transform active:scale-90 ${
                  reactionGroups[e]?.viewerReacted ? 'scale-110 ring-1 ring-cyan-500/50' : ''
                }`}
              >
                {e === '❤️'
                  ? <LoungeFlameIcon liked className={QUICK_CHIP_CLASS} />
                  : <span className="text-[20px] leading-none">{e}</span>
                }
              </button>
            ))}

            {/* Separator */}
            <div className="mx-1.5 h-8 shrink-0 w-px bg-zinc-600/70" />

            {/* Open full picker */}
            <button
              type="button"
              onClick={() => setFullPickerOpen(true)}
              className="shrink-0 flex h-11 w-11 items-center justify-center rounded-full bg-zinc-700/60 text-zinc-400 touch-manipulation transition-colors active:bg-zinc-600"
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

            {!isDeleted && enableStar && onToggleStar && (
              <>
                <Divider />
                <ActionRow
                  icon={<StarIcon filled={isStarred} />}
                  label={isStarred ? 'Unstar' : 'Star'}
                  onClick={() => {
                    onToggleStar(message.id, !isStarred)
                    closeMenu()
                  }}
                />
              </>
            )}

            {!isDeleted && enablePin && onTogglePin && (
              <>
                <Divider />
                <ActionRow
                  icon={<PinIcon filled={isPinned} />}
                  label={isPinned ? 'Unpin' : 'Pin'}
                  onClick={() => {
                    onTogglePin(message.id, !isPinned)
                    closeMenu()
                  }}
                />
              </>
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
function StarIcon({ filled = false }) {
  return (
    <svg {...S} fill={filled ? 'currentColor' : 'none'}>
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  )
}
function PinIcon({ filled = false }) {
  return (
    <svg {...S} fill={filled ? 'currentColor' : 'none'}>
      <path d="M12 17v5" />
      <path d="M5 7h14v5a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4V7z" />
      <path d="M9 3h6v4H9z" />
    </svg>
  )
}
