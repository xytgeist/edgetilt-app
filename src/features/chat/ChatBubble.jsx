import { createPortal } from 'react-dom'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import ChatLinkPreviewCard from '../../components/ChatLinkPreviewCard.jsx'
import ChatMediaViewer from './ChatMediaViewer.jsx'
import { attachLinkPreview } from '../../utils/loungeLinkPreviewApi.js'
import {
  bodyTextWithLinkPreview,
  extractFirstUrlFromText,
  LinkifiedText,
  textIsOnlyUrls,
} from '../../utils/linkifyText.jsx'
import ChatEmojiPicker, { saveRecentEmoji } from './ChatEmojiPicker'
import ChatReceiptLabel from './ChatReceiptLabel.jsx'
import LoungeFlameIcon from '../lounge/LoungeFlameIcon'
import {
  CHAT_MESSAGE_COLUMN_WIDTH_CLASS,
  chatVideoTileStyle,
} from './chatVideoTileLayout.js'
import {
  CHAT_YOUTUBE_EMBED_WIDTH_CLASS,
  isYouTubeLinkPreview,
} from '../../utils/youtubeEmbed.js'

const QUICK_REACTIONS = ['👍','❤️','😂','🔥','😮','😢','🎉','😍','👏','💯','🙏','🤣']

const IS_IOS = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent)

/** Reaction pill chip 20px, nudged down to optically align with 16px emoji glyphs. */
const REACTION_CHIP_CLASS = 'block h-5 w-5 shrink-0 translate-y-px'
const QUICK_CHIP_CLASS = 'h-[23px] w-[23px] shrink-0'

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
    // Default: pill above bubble, menu below - bubble separates them.
  } else if (pillAboveFits && !menuBelowFits) {
    // Not enough room below - stack menu above pill.
    menuTop = pillTop - MENU_H - LAYOUT_GAP
    if (menuTop < SAFE_TOP) {
      // Still tight - stack both below bubble.
      pillTop = rect.bottom + LAYOUT_GAP
      menuTop = pillTop + PILL_H + LAYOUT_GAP
    }
  } else if (!pillAboveFits && menuBelowFits) {
    // Not enough room above - pill below bubble, menu above bubble.
    pillTop = rect.bottom + LAYOUT_GAP
    menuTop = rect.top - MENU_H - LAYOUT_GAP
    if (menuTop < SAFE_TOP) {
      menuTop = pillTop + PILL_H + LAYOUT_GAP
    }
  } else {
    // Very tight - stack below bubble: bubble → pill → menu.
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

  // Re-check after clamp - push menu away from pill if clamp caused collision.
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
 *     stream_video_uid?: string | null,
 *     stream_poster_url?: string | null,
 *     stream_video_width?: number | null,
 *     stream_video_height?: number | null,
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
 *   reactionPillInteractive?: boolean,
 *   onOpenReactionsDetail?: () => void,
 *   hideSenderInfo?: boolean,
 *   isGroupEnd?: boolean,
 *   isFinalizingMedia?: boolean,
 *   enableStar?: boolean,
 *   isStarred?: boolean,
 *   onToggleStar?: (messageId: string, starred: boolean) => void,
 *   enablePin?: boolean,
 *   isPinned?: boolean,
 *   onTogglePin?: (messageId: string, pinned: boolean) => void,
 *   receipt?: import('./chatReceiptStatus.js').ChatMessageReceipt | null,
 *   highlighted?: boolean,
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
  reactionPillInteractive = false,
  onOpenReactionsDetail = null,
  hideSenderInfo = false,
  isGroupStart = true,
  isGroupEnd = true,
  isFinalizingMedia = false,
  enableStar = false,
  isStarred = false,
  onToggleStar,
  enablePin = false,
  isPinned = false,
  onTogglePin,
  supabaseClient = null,
  onLinkPreviewReady = null,
  receipt = null,
  highlighted = false,
}) {
  const [menuOpen, setMenuOpen]             = useState(false)
  const [fullPickerOpen, setFullPickerOpen] = useState(false)
  const [bubbleRect, setBubbleRect]         = useState(/** @type {DOMRect | null} */ (null))
  // Start expanded immediately for media/link-preview/multi-line so the bubble
  // never resizes on mount - only single-line plain-text starts as a pill.
  // Also start expanded when _finalizingMedia so in-flight uploads never collapse the bubble.
  const [compactBubble, setCompactBubble] = useState(() => {
    if (message.image_urls?.length || message.stream_video_uid || message.video_url || message._finalizingMedia) return false
    if (message.body?.includes('\n')) return false
    return true
  })
  const [mediaViewerIndex, setMediaViewerIndex] = useState(/** @type {number | null} */ (null))

  const longPressTimer = useRef(null)
  const bubbleRef      = useRef(null)
  const isDeleted      = Boolean(message.deleted_at)
  const linkPreview    = message.link_preview || null
  const imageUrlsEarly = Array.isArray(message.image_urls) ? message.image_urls.filter(Boolean) : []
  const displayBody    = bodyTextWithLinkPreview(message.body, linkPreview)
  const showBodyText   = Boolean(displayBody)
  /** URL-only message with a card - skip the empty text bubble (iMessage shows just the card). */
  const isLinkPreviewOnly =
    !isDeleted &&
    linkPreview &&
    imageUrlsEarly.length === 0 &&
    !message.stream_video_uid &&
    !message.video_url &&
    textIsOnlyUrls(message.body || '')
  const showTextBubble = !isLinkPreviewOnly || isDeleted
  /** Caption + link card share one bubble (iMessage-style). */
  const linkPreviewInBubble = Boolean(linkPreview && showTextBubble && !isDeleted)
  const youtubeLinkPreview = Boolean(linkPreview && isYouTubeLinkPreview(linkPreview))
  const widenColumnForYoutube =
    youtubeLinkPreview && (linkPreviewInBubble || isLinkPreviewOnly)

  const bubbleHighlightStyle =
    highlighted && !isDeleted
      ? { boxShadow: '0 0 0 2px rgba(34,211,238,0.65), 0 0 14px rgba(34,211,238,0.45)' }
      : undefined

  useEffect(() => {
    if (!supabaseClient || !message?.id || String(message.id).startsWith('opt-')) return
    if (isDeleted || linkPreview || !message.body || !extractFirstUrlFromText(message.body)) return
    let cancelled = false
    void attachLinkPreview(supabaseClient, {
      entityType: 'chat_message',
      entityId: message.id,
      text: message.body,
    }).then((preview) => {
      if (!cancelled && preview && onLinkPreviewReady) {
        onLinkPreviewReady(message.id, preview)
      }
    })
    return () => { cancelled = true }
  }, [
    supabaseClient,
    message.id,
    message.body,
    linkPreview,
    isDeleted,
    onLinkPreviewReady,
  ])

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
  // listener on the chat container - not here.
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
      // Clear selection on every micro-movement - iOS triggers selection at ~300ms
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

  const renderReactionGlyph = (emoji, { chip = false } = {}) => {
    if (emoji === '❤️') {
      return (
        <LoungeFlameIcon
          liked
          className={chip ? REACTION_CHIP_CLASS : 'block h-[18px] w-[18px] shrink-0 translate-y-px'}
        />
      )
    }
    return (
      <span className={chip ? 'text-[16px] leading-none' : 'text-[18px] leading-none'}>{emoji}</span>
    )
  }

  const openReactionsDetail = useCallback(() => {
    onOpenReactionsDetail?.()
  }, [onOpenReactionsDetail])

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
  const videoUid = message.stream_video_uid || null
  const videoUrl = message.video_url || null

  // Build unified media list for the grid and viewer.
  const allMedia = [
    ...imageUrls.map((url) => ({ type: 'image', url })),
    ...(videoUid || videoUrl
      ? [{
          type: 'video',
          videoUid: videoUid || null,
          videoUrl: videoUrl || null,
          url: message.stream_poster_url || '',
          posterUrl: message.stream_poster_url || '',
          displayWidth: message.stream_video_width ?? null,
          displayHeight: message.stream_video_height ?? null,
        }]
      : []),
  ]
  const hasMedia = allMedia.length > 0
  const isSingleVideoOnly =
    hasMedia &&
    !isDeleted &&
    allMedia.length === 1 &&
    allMedia[0].type === 'video' &&
    !showBodyText &&
    !linkPreviewInBubble

  // Pill ends on one visual line of text; fixed radius when wrapped or media attached.
  useLayoutEffect(() => {
    const el = bubbleRef.current
    if (!el) return
    if (isLinkPreviewOnly) {
      setCompactBubble(false)
      return undefined
    }

    const measure = () => {
      if (hasMedia || linkPreviewInBubble || isFinalizingMedia) {
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
  }, [message.body, hasMedia, isLinkPreviewOnly, linkPreviewInBubble, isFinalizingMedia])

  // Floating menu layout - computed fresh each render so it tracks the latest rect
  const layout = bubbleRect ? computeLayout(bubbleRect, isMine, { isDeleted, enableStar, enablePin }) : null

  const openViewer = useCallback((idx) => setMediaViewerIndex(idx), [])
  const closeViewer = useCallback(() => setMediaViewerIndex(null), [])

  return (
    <div
      data-chat-message-id={message.id}
      className="relative select-none"
      style={{
        WebkitTouchCallout: 'none',
        WebkitUserSelect: 'none',
        userSelect: 'none',
      }}
    >
      <div className={`flex items-end gap-2 ${isMine ? 'flex-row-reverse' : 'flex-row'}`}>
        {/* Avatar - only for others' messages; hidden in DMs; spacer on continuations */}
        {!isMine && !hideSenderInfo && (
          <div className="shrink-0 self-end mb-1">
            {isGroupEnd ? (
              senderAvatarUrl ? (
                <img
                  src={senderAvatarUrl}
                  alt={senderLabel}
                  className="h-7 w-7 rounded-full object-cover"
                />
              ) : (
                <div className="grid h-7 w-7 place-items-center rounded-full bg-zinc-700 text-[11px] font-bold text-zinc-300">
                  {(senderLabel?.replace(/^@/, '') || '?')[0].toUpperCase()}
                </div>
              )
            ) : (
              <div className="h-7 w-7" aria-hidden />
            )}
          </div>
        )}

        <div
          className={`flex flex-col gap-1 ${isMine ? 'items-end' : 'items-start'} ${
            isSingleVideoOnly || widenColumnForYoutube ? CHAT_MESSAGE_COLUMN_WIDTH_CLASS : 'max-w-[78%]'
          }`}
        >
          {/* Sender name - others only; first in run only; hidden in DMs */}
          {!isMine && !hideSenderInfo && isGroupStart && (
            <div className="px-1 text-[11px] font-semibold text-zinc-400">{senderLabel}</div>
          )}

          {/* Twitter-style reply pill - compact quoted bubble above the reply */}
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

          {/* Text/media bubble - omitted when the message is only a URL and we show a link card */}
          {showTextBubble ? (
          <div
            ref={isLinkPreviewOnly ? undefined : bubbleRef}
            onPointerDown={handlePointerDown}
            onPointerUp={cancelLongPress}
            onPointerCancel={cancelLongPress}
            onPointerLeave={cancelLongPress}
            onContextMenu={(e) => e.preventDefault()}
            className={`chat-bubble-surface relative select-none text-[16px] leading-snug transition-opacity ${
              hasMedia && !isDeleted ? 'p-[3px]' : 'px-3 py-2'
            } ${isSingleVideoOnly || (linkPreviewInBubble && youtubeLinkPreview) ? 'w-full' : ''} ${
              compactBubble ? '' : 'rounded-2xl'
            } ${
              isDeleted
                ? 'bg-transparent italic text-zinc-600'
                : isMine
                ? 'text-white'
                : 'bg-zinc-800/90 text-zinc-100'
            } ${menuOpen ? 'opacity-80' : 'opacity-100'}`}
            style={{
              WebkitUserSelect: 'none',
              userSelect: 'none',
              WebkitTouchCallout: 'none',
              touchAction: 'pan-y',
              borderRadius: (() => {
                const r = compactBubble ? 9999 : BUBBLE_EXPANDED_RADIUS_PX
                const rBR = isMine && isGroupEnd && !isDeleted ? 0 : r
                const rBL = !isMine && isGroupEnd && !isDeleted ? 0 : r
                return `${r}px ${r}px ${rBR}px ${rBL}px`
              })(),
              backgroundColor: isMine && !isDeleted ? '#3b82f6' : undefined,
              ...bubbleHighlightStyle,
              filter: isStarred && !isDeleted
                ? 'drop-shadow(0 0 10px rgba(251,191,36,0.45))'
                : undefined,
              transition: 'filter 0.2s ease, box-shadow 0.2s ease',
            }}
          >

            {isDeleted ? (
              <span className="px-3 py-2 block">This message was deleted</span>
            ) : (
              <>
                {showBodyText && (
                  <div className={`chat-bubble-body whitespace-pre-wrap break-words ${hasMedia ? 'px-[13px] pt-2 pb-1' : ''}`}>
                    <LinkifiedText
                      text={displayBody}
                      linkClassName={
                        isMine && !isDeleted
                          ? 'underline decoration-white/60 underline-offset-2 hover:decoration-white'
                          : 'text-cyan-400 underline underline-offset-2 hover:text-cyan-300'
                      }
                    />
                  </div>
                )}
                {hasMedia && !isDeleted && (
                  <div className={`relative ${isSingleVideoOnly ? 'w-full' : ''}`}>
                    <ChatMediaGrid media={allMedia} onOpen={isFinalizingMedia ? null : openViewer} />
                    {isFinalizingMedia && (
                      <div className="absolute inset-0 flex items-center justify-center rounded-[13px] bg-black/30">
                        <span className="h-6 w-6 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      </div>
                    )}
                  </div>
                )}
                {linkPreviewInBubble ? (
                  <div className={`${hasMedia ? 'px-3 pb-2' : ''} ${youtubeLinkPreview ? `flex ${isMine ? 'justify-end' : 'justify-start'}` : ''}`}>
                    <ChatLinkPreviewCard preview={linkPreview} isMine={isMine} embedded />
                  </div>
                ) : null}
              </>
            )}

            {!isMine && isGroupEnd && !isDeleted && (
              <svg
                className="absolute pointer-events-none"
                style={{ bottom: 0, left: 0, overflow: 'visible', width: 12, height: 12 }}
                aria-hidden
              >
                <path className="chat-bubble-tail-incoming" d="M0 12 L0 0 Q0 12 -12 12 Z" fill="rgba(39,39,42,0.9)" />
              </svg>
            )}
            {isMine && isGroupEnd && !isDeleted && (
              <svg
                className="absolute pointer-events-none"
                style={{ bottom: 0, right: 0, overflow: 'visible', width: 12, height: 12 }}
                aria-hidden
              >
                <path d="M12 12 L12 0 Q12 12 24 12 Z" fill="#3b82f6" />
              </svg>
            )}
          </div>
          ) : null}

          {linkPreview && !isDeleted && !linkPreviewInBubble ? (
            <div
              ref={isLinkPreviewOnly ? bubbleRef : undefined}
              className={`${isLinkPreviewOnly ? 'chat-bubble-surface' : ''} ${youtubeLinkPreview ? CHAT_YOUTUBE_EMBED_WIDTH_CLASS : ''}`.trim()}
              onPointerDown={isLinkPreviewOnly ? handlePointerDown : undefined}
              onPointerUp={isLinkPreviewOnly ? cancelLongPress : undefined}
              onPointerCancel={isLinkPreviewOnly ? cancelLongPress : undefined}
              onPointerLeave={isLinkPreviewOnly ? cancelLongPress : undefined}
              onContextMenu={isLinkPreviewOnly ? (e) => e.preventDefault() : undefined}
              style={isLinkPreviewOnly ? { WebkitTouchCallout: 'none', userSelect: 'none', ...bubbleHighlightStyle } : undefined}
            >
              <ChatLinkPreviewCard preview={linkPreview} isMine={isMine} />
            </div>
          ) : null}

          {/* Starred indicator - small amber star under the trailing bubble corner */}
          {isStarred && !isDeleted && (
            <div className={`-mt-1 flex select-none pointer-events-none ${isMine ? 'justify-end pr-2' : 'justify-start pl-2'}`}>
              <span className="text-[15px] leading-none text-amber-400" style={{ filter: 'drop-shadow(0 0 4px rgba(251,191,36,0.7))' }} aria-label="Starred">★</span>
            </div>
          )}

          {/* Reaction pill - combined, overlaps bubble bottom */}
          {reactions.length > 0 && (() => {
            const totalCount = reactions.reduce((sum, r) => sum + r.count, 0)
            const sorted = [...reactions].sort((a, b) => b.count - a.count || a.emoji.localeCompare(b.emoji))
            return (
              <div className={`-mt-3 relative z-10 flex px-2 ${isMine ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`reaction-pill flex flex-wrap items-center gap-0 rounded-2xl py-1 px-2 max-w-[min(75vw,320px)] ${
                    reactionPillInteractive ? 'cursor-pointer' : ''
                  }`}
                  onClick={reactionPillInteractive ? openReactionsDetail : undefined}
                  onKeyDown={reactionPillInteractive ? (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      openReactionsDetail()
                    }
                  } : undefined}
                  role={reactionPillInteractive ? 'button' : undefined}
                  tabIndex={reactionPillInteractive ? 0 : undefined}
                  aria-label={reactionPillInteractive ? `See all ${totalCount} reactions` : undefined}
                >
                  {sorted.map((r) => (
                    <span key={r.emoji} className="inline-flex items-center gap-0.5 px-0.5 py-0.5">
                      {renderReactionGlyph(r.emoji, { chip: true })}
                      {r.count > 1 ? (
                        <span className="text-[11px] font-semibold leading-none text-zinc-400">{r.count}</span>
                      ) : null}
                    </span>
                  ))}
                  {!reactionPillInteractive && totalCount >= 2 ? (
                    <span className="ml-0.5 text-[12px] font-semibold leading-none text-zinc-400">{totalCount}</span>
                  ) : null}
                  {reactionPillInteractive && totalCount >= 2 ? (
                    <span className="pointer-events-none ml-0.5 pr-1 text-[12px] font-semibold leading-none text-zinc-400">
                      {totalCount}
                    </span>
                  ) : null}
                </div>
              </div>
            )
          })()}

          {isMine && receipt && !isDeleted ? (
            <div className={`mt-0.5 flex select-none pointer-events-none ${isMine ? 'justify-end pr-1' : 'justify-start pl-1'}`}>
              <ChatReceiptLabel receipt={receipt} />
            </div>
          ) : null}
        </div>
      </div>

      {/* Timestamp - hidden to the right, revealed when the user swipes the message list left */}
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
          {/* Scrim - catches taps to dismiss */}
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

      {/* Media viewer */}
      {mediaViewerIndex !== null && allMedia.length > 0 && (
        <ChatMediaViewer
          items={allMedia}
          initialIndex={mediaViewerIndex}
          onClose={closeViewer}
        />
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

// ── WhatsApp-style media grid ──────────────────────────────────────────────

const GRID_MAX_VISIBLE = 4

/**
 * Displays an image while seamlessly transitioning from a blob preview URL to
 * a permanent URL (R2, CF thumbnails, etc.).  The blob stays visible until the
 * remote image has fully loaded in a hidden Image(), then the src swaps - zero
 * blank flash.  The blob URL is revoked only after a successful swap.
 *
 * On load error the swap does NOT happen; instead we retry with exponential
 * backoff (2 s → 4 s → 8 s → 16 s → 30 s).  This keeps the blob visible while
 * Cloudflare finishes generating the poster thumbnail, and prevents the "broken
 * image → layout collapse" issue for slow-processing videos.
 */
function ChatMediaImage({ src, className }) {
  const [displaySrc, setDisplaySrc] = useState(src)
  const displaySrcRef = useRef(src)

  useEffect(() => {
    // Blob→blob or empty: swap immediately (no preload needed)
    if (!src || src.startsWith('blob:')) {
      if (src === displaySrcRef.current) return
      displaySrcRef.current = src
      setDisplaySrc(src)
      return
    }

    // Remote URL - always preload off-screen; retry on failure.
    // We deliberately skip the `src === displaySrcRef.current` early-exit for remote
    // URLs so that the initial CF poster URL also gets the retry treatment (the video
    // may still be encoding when the bubble is first mounted from a fresh server load).
    let cancelled = false
    let retryTimer = null
    let attempt = 0
    const MAX_RETRIES = 5

    const tryLoad = () => {
      if (cancelled) return
      const img = new window.Image()
      img.onload = () => {
        if (cancelled) return
        const old = displaySrcRef.current
        displaySrcRef.current = src
        setDisplaySrc(src)
        if (old?.startsWith('blob:')) {
          try { URL.revokeObjectURL(old) } catch { /* ignore */ }
        }
      }
      img.onerror = () => {
        if (cancelled) return
        if (attempt < MAX_RETRIES) {
          attempt++
          // Exponential backoff: 2s, 4s, 8s, 16s, 30s
          const delay = Math.min(2000 * Math.pow(2, attempt - 1), 30_000)
          retryTimer = setTimeout(tryLoad, delay)
        }
        // On max retries keep current displaySrc - never show a broken image.
      }
      img.src = src
    }

    tryLoad()

    return () => {
      cancelled = true
      clearTimeout(retryTimer)
    }
  }, [src])

  return <img src={displaySrc} alt="" className={className} />
}

/**
 * Enter true OS fullscreen for an R2 MP4 `<video>` - bypasses the iOS PWA white
 * status bar entirely. Must run inside the tap gesture with metadata preloaded;
 * returns false (→ fall back to the in-app lightbox) when not possible.
 */
function openNativeVideoFullscreen(video) {
  if (!video || video.readyState < 1) return false
  try {
    video.muted = false
    const p = video.play?.()
    if (p && typeof p.catch === 'function') p.catch(() => {})
  } catch { /* ignore */ }
  try {
    if (typeof video.webkitEnterFullscreen === 'function') {
      video.webkitEnterFullscreen()
      return true
    }
    if (typeof video.requestFullscreen === 'function') {
      video.requestFullscreen().catch(() => {})
      return true
    }
  } catch { /* ignore */ }
  return false
}

/**
 * @param {{ media: Array<{ type: string, url?: string, videoUid?: string, videoUrl?: string, posterUrl?: string }>, onOpen: (index: number) => void }} props
 */
function ChatMediaGrid({ media, onOpen }) {
  const visible = media.slice(0, GRID_MAX_VISIBLE)
  const overflow = media.length - GRID_MAX_VISIBLE
  const videoRefs = useRef({})

  // Layout classes based on count
  const count = visible.length

  const singleVideo = count === 1 && visible[0]?.type === 'video'

  return (
    <div
      className={`overflow-hidden rounded-[13px] ${singleVideo ? 'w-full' : ''} ${count === 1 ? '' : 'grid gap-0.5'} ${count === 2 ? 'grid-cols-2' : count >= 3 ? 'grid-cols-2' : ''}`}
    >
      {visible.map((item, i) => {
        const isLastVisible = i === GRID_MAX_VISIBLE - 1
        const showOverlay = isLastVisible && overflow > 0

        // 3-item layout: first image spans full width
        const spanFull = count === 3 && i === 0

        // R2 MP4s can open in true OS fullscreen (no white status bar); legacy
        // CF Stream (videoUid) and fullscreen failures fall back to the lightbox.
        const isR2Video = item.type === 'video' && item.videoUrl

        const handleTileTap = () => {
          if (isR2Video && openNativeVideoFullscreen(videoRefs.current[i])) return
          onOpen?.(i)
        }

        return (
          // Use index as key so React keeps the component alive when URL changes blob→R2
            <button
            key={i}
            type="button"
            onClick={handleTileTap}
            className={`relative block overflow-hidden bg-zinc-900 touch-manipulation active:opacity-80 ${spanFull ? 'col-span-2' : ''} ${singleVideo ? 'w-full' : ''}`}
            style={
              singleVideo
                ? chatVideoTileStyle({ width: item.displayWidth, height: item.displayHeight })
                : { aspectRatio: spanFull ? '2/1' : '1/1', minWidth: 160 }
            }
            aria-label={item.type === 'video' ? 'Play video' : `View image ${i + 1}`}
          >
            {item.type === 'video' ? (
              <>
                {isR2Video && (
                  <video
                    ref={(el) => { videoRefs.current[i] = el }}
                    src={item.videoUrl}
                    preload="metadata"
                    playsInline
                    muted
                    className="absolute inset-0 h-full w-full object-cover"
                    aria-hidden
                  />
                )}
                {item.posterUrl ? (
                  <ChatMediaImage src={item.posterUrl} className="relative h-full w-full object-cover" />
                ) : (
                  <div className="relative h-full w-full bg-zinc-800" />
                )}
                {/* Play button overlay */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="grid h-12 w-12 place-items-center rounded-full bg-black/50">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="white" aria-hidden>
                      <polygon points="5 3 19 12 5 21 5 3" />
                    </svg>
                  </div>
                </div>
              </>
            ) : (
              <ChatMediaImage src={item.url} className="h-full w-full object-cover" />
            )}

            {/* +N overflow badge on the last visible tile */}
            {showOverlay && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                <span className="text-[22px] font-bold text-white">+{overflow}</span>
              </div>
            )}
          </button>
        )
      })}
    </div>
  )
}
