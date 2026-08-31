import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Eye, Edit3, Minimize2, Sparkles, Globe, Users, Lock, Check, X, Settings2, Send, AlertCircle } from 'lucide-react'
import LoungeComposerCharRing from './LoungeComposerCharRing.jsx'
import LoungeComposerMediaToolbar from './LoungeComposerMediaToolbar.jsx'
import LoungePostCategoryPillPicker from './LoungePostCategoryPillPicker.jsx'
import LoungeComposerMarketChartStrip from './LoungeComposerMarketChartStrip.jsx'
import { LoungeImageCarousel } from './LoungePostFeedMedia.jsx'
import LoungeMarkdownToolbar from './LoungeMarkdownToolbar.jsx'
import LoungeCashtagDropdown from './LoungeCashtagDropdown.jsx'
import LoungeMentionDropdown from './LoungeMentionDropdown.jsx'
import { renderLoungeMarkdown } from './loungeMarkdown.jsx'
import LoungeEdgeProBadge from './LoungeEdgeProBadge.jsx'
import LoungeStaffRoleBadge from './LoungeStaffRoleBadge.jsx'
import { loungeFeedAuthorHasStaffBadge } from './loungeFeedAvatar.js'
import {
  LOUNGE_COMPOSER_AUDIENCE_ALL,
  LOUNGE_COMPOSER_AUDIENCE_SUBS,
} from '../../utils/loungeFanOnlyPost.js'
import LoungeFlameIcon from './LoungeFlameIcon.jsx'
import { LOUNGE_COMMENT_BUBBLE_D, LOUNGE_COMMENT_GLYPH_Y_SCALE_CLASS } from './loungeCommentGlyph.js'
import { LOUNGE_REPOST_ARROWS_D } from './loungeRepostGlyph.js'
import {
  useLoungeKeyboardOverlapPx,
  useLoungeIosSafeBottomPx,
  loungeComposerFooterPaddingBottom,
  LOUNGE_IOS,
  LOUNGE_IOS_KEYBOARD_SMOOTH_MS,
} from './useLoungeKeyboardOverlapPx.js'

/**
 * Full-Screen Pro Composer with rich Markdown formatting & live 1:1 card preview.
 * Hybrid Mode (Option 2 + 3):
 * - If user already interacted with the top-bar Audience/Settings button, "Post" is instant.
 * - If user never opened the settings button, clicking "Post" presents the pre-post confirmation sheet.
 *
 * @param {{
 *   open: boolean,
 *   onClose: () => void,
 *   postText: string,
 *   onTextChange: (text: string) => void,
 *   onSubmit: () => void,
 *   postBusy?: boolean,
 *   isEdgePro?: boolean,
 *   isStaff?: boolean,
 *   onUpgradeClick?: () => void,
 *   composerUserProfile?: object,
 *   composerImageItems?: Array<{ id: string, preview: string, file: File }>,
 *   onRemoveImageIndex?: (index: number) => void,
 *   composerVideoSlot?: { file?: File, preview?: string, posterUrl?: string },
 *   onRemoveVideo?: () => void,
 *   composerMediaUrl?: string,
 *   onRemoveGif?: () => void,
 *   composerMarketSymbols?: string[],
 *   onMarketSymbolsChange?: (symbols: string[]) => void,
 *   composerCategoryPills?: string[],
 *   onCategoryPillsChange?: (pills: string[]) => void,
 *   composerReplyGateEdgePro?: boolean,
 *   onReplyGateChange?: (gate: boolean) => void,
 *   composerAudience?: string,
 *   onAudienceChange?: (audience: string) => void,
 *   composerFanMonetizationLive?: boolean,
 *   captionMax?: number,
 *   cashtagComposer?: any,
 *   mentionComposer?: any,
 *   onOpenGifPicker?: () => void,
 *   onOpenMarketPicker?: () => void,
 *   imageInputId?: string,
 *   videoInputId?: string,
 *   onImagePointerDown?: () => void,
 *   onVideoPointerDown?: () => void,
 * }} props
 */
export default function LoungeFullScreenComposerModal({
  open,
  onClose,
  postText,
  onTextChange,
  onSubmit,
  postBusy = false,
  isEdgePro = false,
  isStaff = false,
  onUpgradeClick,
  composerUserProfile,
  composerImageItems = [],
  onRemoveImageIndex,
  composerVideoSlot,
  onRemoveVideo,
  composerMediaUrl = '',
  onRemoveGif,
  composerMarketSymbols = [],
  onMarketSymbolsChange,
  composerCategoryPills = [],
  onCategoryPillsChange,
  composerReplyGateEdgePro = false,
  onReplyGateChange,
  composerAudience = 'public',
  onAudienceChange,
  composerFanMonetizationLive = false,
  captionMax = 500,
  cashtagComposer,
  mentionComposer,
  onOpenGifPicker,
  onOpenMarketPicker,
  imageInputId,
  videoInputId,
  onImagePointerDown,
  onVideoPointerDown,
}) {
  const [activeTab, setActiveTab] = useState('write') // 'write' | 'preview'
  const [settingsModalOpen, setSettingsModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState('settings') // 'settings' | 'pre_post'
  const [hasConfiguredAudience, setHasConfiguredAudience] = useState(false)
  const [tribeMaxAlertOpen, setTribeMaxAlertOpen] = useState(false)
  const [localText, setLocalText] = useState(() => postText || '')
  const syncTimerRef = useRef(null)
  const localTextRef = useRef(localText)
  localTextRef.current = localText
  const textareaRef = useRef(null)
  const anchorRef = useRef(null)
  const scrollContainerRef = useRef(null)
  const toolbarContainerRef = useRef(null)

  // Only sync down from props when opening the modal (isolates modal typing from feed re-renders)
  useEffect(() => {
    if (open) {
      setLocalText(postText || '')
      localTextRef.current = postText || ''
    }
  }, [open])

  useEffect(() => {
    return () => {
      if (syncTimerRef.current) {
        clearTimeout(syncTimerRef.current)
        syncTimerRef.current = null
      }
    }
  }, [])

  const flushTextToParent = useCallback(() => {
    if (syncTimerRef.current) {
      clearTimeout(syncTimerRef.current)
      syncTimerRef.current = null
    }
    onTextChange?.(localTextRef.current)
  }, [onTextChange])

  const handleTextChange = useCallback(
    (val) => {
      setLocalText(val)
      localTextRef.current = val
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current)
      syncTimerRef.current = setTimeout(() => {
        onTextChange?.(val)
      }, 400)
    },
    [onTextChange],
  )

  // Mobile / iOS / Android keyboard lift
  const iosSafeBottomPx = useLoungeIosSafeBottomPx(LOUNGE_IOS)
  const { overlapPx: kbOverlapPx, targetPx: kbOverlapTargetPx } = useLoungeKeyboardOverlapPx(open, {
    smooth: LOUNGE_IOS,
    smoothMs: LOUNGE_IOS_KEYBOARD_SMOOTH_MS,
  })
  const kbFooterLiftPx = Math.max(kbOverlapPx, kbOverlapTargetPx)
  const keyboardUp = kbFooterLiftPx > iosSafeBottomPx + 0.5
  const footerPadBottom = keyboardUp
    ? `${Math.round(kbFooterLiftPx + 2)}px`
    : loungeComposerFooterPaddingBottom(0, Math.max(8, iosSafeBottomPx))

  const scrollToToolbar = useCallback(() => {
    if (!scrollContainerRef.current || !toolbarContainerRef.current) return
    const container = scrollContainerRef.current
    const toolbar = toolbarContainerRef.current
    const toolbarTop = toolbar.offsetTop - 4 // sits directly under fixed header
    container.scrollTo({
      top: Math.max(0, toolbarTop),
      behavior: 'smooth',
    })
  }, [])

  useEffect(() => {
    if (!open) return
    setActiveTab('write')
    setSettingsModalOpen(false)
    setModalMode('settings')
    setHasConfiguredAudience(false)
    setTribeMaxAlertOpen(false)

    // Focus composer textarea immediately when opening
    const focusEl = () => {
      if (textareaRef.current) {
        const el = textareaRef.current
        el.focus()
        const end = el.value?.length ?? 0
        if (typeof el.setSelectionRange === 'function') {
          el.setSelectionRange(end, end)
        }
      }
    }
    focusEl()
    requestAnimationFrame(focusEl)
    const t = setTimeout(focusEl, 30)
    return () => clearTimeout(t)
  }, [open])

  useEffect(() => {
    if (open && activeTab === 'write') {
      const focusEl = () => {
        if (textareaRef.current) {
          const el = textareaRef.current
          el.focus()
          const end = el.value?.length ?? 0
          if (typeof el.setSelectionRange === 'function') {
            el.setSelectionRange(end, end)
          }
        }
      }
      focusEl()
      requestAnimationFrame(focusEl)
      const t = setTimeout(focusEl, 30)
      return () => clearTimeout(t)
    }
  }, [open, activeTab])

  useEffect(() => {
    if (keyboardUp && activeTab === 'write') {
      const t = setTimeout(() => {
        scrollToToolbar()
      }, 120)
      return () => clearTimeout(t)
    }
  }, [keyboardUp, activeTab, scrollToToolbar])

  if (!open || typeof document === 'undefined') return null

  const len = (localText || '').length
  const isOverLimit = len > captionMax
  const hasContent =
    Boolean(localText?.trim()) ||
    composerImageItems.length > 0 ||
    Boolean(composerVideoSlot?.preview) ||
    Boolean(composerMediaUrl)

  const displayName = composerUserProfile?.display_name || composerUserProfile?.handle || 'Me'
  const handle = composerUserProfile?.handle || ''
  const avatarUrl = composerUserProfile?.avatar_url || ''
  const role = composerUserProfile?.role
  const isStaffBadge = loungeFeedAuthorHasStaffBadge(role)

  const gifUrl = String(composerMediaUrl || '').trim()
  const imageUrls = composerImageItems.map((x) => x.preview)
  const carouselUrls = gifUrl ? [...imageUrls, gifUrl] : imageUrls
  const nImg = composerImageItems.length

  const isSubscribersAudience = composerAudience === LOUNGE_COMPOSER_AUDIENCE_SUBS
  const isCustomGated = isSubscribersAudience || composerReplyGateEdgePro

  const blurActiveInput = () => {
    if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
    }
  }

  const handleOpenSettingsFromHeader = () => {
    blurActiveInput()
    setModalMode('settings')
    setHasConfiguredAudience(true)
    setSettingsModalOpen(true)
  }

  const handlePostButtonClick = () => {
    blurActiveInput()
    if (postBusy || isOverLimit || !hasContent) return
    flushTextToParent()
    if (!hasConfiguredAudience) {
      setModalMode('pre_post')
      setSettingsModalOpen(true)
    } else {
      onSubmit()
      onClose()
    }
  }

  const handleConfirmPublish = () => {
    blurActiveInput()
    setSettingsModalOpen(false)
    flushTextToParent()
    onSubmit()
    onClose()
  }

  const handleAudienceSelect = (audience) => {
    blurActiveInput()
    setHasConfiguredAudience(true)
    onAudienceChange?.(audience)
  }

  const handleReplyGateSelect = (gate) => {
    blurActiveInput()
    setHasConfiguredAudience(true)
    onReplyGateChange?.(gate)
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pro-composer-title"
      data-lounge-fullscreen-composer=""
      className="fixed inset-0 z-[220] flex h-[100dvh] max-h-[100dvh] flex-col overflow-hidden bg-zinc-950 text-zinc-100 animate-in fade-in duration-150"
    >
      {/* ── Top Bar ── */}
      <header className="flex shrink-0 items-center justify-between border-b border-zinc-800/90 bg-zinc-900/95 px-3.5 py-3 backdrop-blur-md sm:px-6 sm:py-3.5">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => {
              blurActiveInput()
              flushTextToParent()
              onClose()
            }}
            className="flex h-10 w-10 items-center justify-center rounded-xl text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100 touch-manipulation active:scale-95"
            title="Minimize to inline composer"
            aria-label="Minimize composer"
          >
            <Minimize2 className="h-5 w-5" />
          </button>

          <h2 id="pro-composer-title" className="hidden sm:inline-flex items-center gap-2 text-[15px] font-bold text-zinc-200">
            <span>Pro Composer</span>
            <span className="inline-flex items-center rounded-full bg-gradient-to-r from-amber-500/20 to-orange-500/20 px-2 py-0.5 text-[11px] font-black uppercase tracking-wider text-amber-400 ring-1 ring-amber-500/40">
              MARKDOWN
            </span>
          </h2>
        </div>

        {/* ── Write vs Preview Toggle ── */}
        <div className="flex items-center rounded-2xl bg-zinc-950 p-1 ring-1 ring-zinc-800">
          <button
            type="button"
            onClick={() => setActiveTab('write')}
            className={`flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs sm:text-sm font-bold transition-all touch-manipulation ${
              activeTab === 'write'
                ? 'bg-zinc-800 text-white shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Edit3 className="h-4 w-4" />
            <span>Write</span>
          </button>

          <button
            type="button"
            onClick={() => {
              blurActiveInput()
              setActiveTab('preview')
            }}
            className={`flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs sm:text-sm font-bold transition-all touch-manipulation ${
              activeTab === 'preview'
                ? 'bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/40 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Eye className="h-4 w-4" />
            <span>Preview</span>
          </button>
        </div>

        {/* ── Audience Settings Icon, Char Ring & Post Action ── */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Audience & Reply Settings Trigger */}
          <button
            type="button"
            onClick={handleOpenSettingsFromHeader}
            className={`relative flex h-9 sm:h-10 items-center gap-1.5 rounded-xl border px-2.5 sm:px-3 text-xs sm:text-sm font-bold transition-all touch-manipulation active:scale-95 ${
              isCustomGated
                ? 'border-amber-500/50 bg-amber-500/10 text-amber-300 ring-1 ring-amber-500/30'
                : 'border-zinc-800 bg-zinc-900/80 text-zinc-300 hover:border-zinc-700 hover:bg-zinc-800'
            }`}
            title="Post audience and reply settings"
            aria-label="Post audience and reply settings"
          >
            <Settings2 className="h-4 w-4" />
            <span className="hidden md:inline">
              {isSubscribersAudience ? 'Subs only' : composerReplyGateEdgePro ? 'Pro replies' : 'Public'}
            </span>
            {isCustomGated ? (
              <span className="absolute -right-1 -top-1 flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500"></span>
              </span>
            ) : null}
          </button>

          <LoungeComposerCharRing len={len} max={captionMax} aria-live="polite" />

          <button
            type="button"
            disabled={postBusy || isOverLimit || !hasContent}
            onClick={handlePostButtonClick}
            className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-cyan-600 px-4 sm:px-5 py-2 text-xs sm:text-sm font-bold text-zinc-950 shadow-md transition-all hover:brightness-110 active:scale-95 disabled:opacity-40 touch-manipulation"
          >
            <span>{postBusy ? 'Posting…' : 'Post'}</span>
          </button>
        </div>
      </header>

      {/* ── Main Content Area ── */}
      <div ref={scrollContainerRef} className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3.5 py-3 sm:px-6 sm:py-4">
        {activeTab === 'write' ? (
          <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col space-y-3.5">
            {/* ── Row 1: Tribe Pills (Horizontal swipe, clean look) ── */}
            <div className="w-full">
              <LoungePostCategoryPillPicker
                value={composerCategoryPills}
                onChange={onCategoryPillsChange}
                disabled={postBusy}
                size="lg"
                hint=""
                hideExpandCaret
                onMaxPillsReached={() => setTribeMaxAlertOpen(true)}
                className="!mt-0 !mb-0"
              />
            </div>

            {/* ── Markdown Formatting Toolbar ── */}
            <div ref={toolbarContainerRef} className="w-full">
              <LoungeMarkdownToolbar
                textareaRef={textareaRef}
                onTextChange={handleTextChange}
                isEdgePro={isEdgePro || isStaff}
                onUpgradeClick={onUpgradeClick}
              />
            </div>

            {/* ── Native Textarea with Mention/Cashtag Support ── */}
            <div
              ref={anchorRef}
              onClick={() => textareaRef.current?.focus()}
              className="relative flex flex-1 min-h-0 flex-col cursor-text"
            >
              <textarea
                ref={textareaRef}
                id="pro-composer-textarea"
                autoFocus
                rows={8}
                value={localText}
                onChange={(e) => {
                  const val = e.target.value
                  handleTextChange(val)
                  cashtagComposer?.onCursorMove(e)
                  mentionComposer?.onCursorMove(e)
                }}
                disabled={postBusy}
                maxLength={captionMax}
                spellCheck
                aria-label="Full screen post caption"
                placeholder="Are ya winning, son? Format with **bold**, *italic*, `code`, quotes, and lists..."
                className="flex-1 w-full min-h-[16rem] resize-none rounded-2xl border border-zinc-800/90 bg-zinc-900/50 p-4 sm:p-5 text-[17px] sm:text-[18px] leading-relaxed text-zinc-100 caret-cyan-400 placeholder-zinc-500 outline-none focus:outline-none focus:ring-0 focus:border-zinc-800/90 touch-manipulation whitespace-pre-wrap break-words overflow-y-auto"
                onFocus={() => {
                  if (keyboardUp) scrollToToolbar()
                  else setTimeout(scrollToToolbar, 250)
                }}
                onKeyDown={(e) => {
                  if (cashtagComposer?.onCashtagKeyDown(e, handleTextChange, textareaRef.current)) return
                  mentionComposer?.onMentionKeyDown(e, handleTextChange, textareaRef.current)
                }}
                onClick={(e) => {
                  cashtagComposer?.onCursorMove(e)
                  mentionComposer?.onCursorMove(e)
                }}
                onKeyUp={(e) => {
                  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                    cashtagComposer?.onCursorMove(e)
                    mentionComposer?.onCursorMove(e)
                  }
                }}
              />

              {cashtagComposer?.isOpen ? (
                <LoungeCashtagDropdown
                  open
                  query={cashtagComposer.cashtag?.query ?? ''}
                  suggestions={cashtagComposer.suggestions}
                  activeIndex={cashtagComposer.activeIndex}
                  loading={cashtagComposer.loading}
                  onSelect={(row) => cashtagComposer.onCashtagSelect(row, handleTextChange, textareaRef.current)}
                  anchorRef={anchorRef}
                  caretFieldRef={textareaRef}
                />
              ) : null}

              {mentionComposer?.isOpen ? (
                <LoungeMentionDropdown
                  suggestions={mentionComposer.suggestions}
                  activeIndex={mentionComposer.activeIndex}
                  loading={mentionComposer.loading}
                  onSelect={(p) => mentionComposer.onMentionSelect(p, handleTextChange, textareaRef.current)}
                  anchorRef={anchorRef}
                  caretFieldRef={textareaRef}
                />
              ) : null}
            </div>

            {/* ── Attached Market Charts Strip ── */}
            {composerMarketSymbols.length > 0 ? (
              <LoungeComposerMarketChartStrip
                symbols={composerMarketSymbols}
                onChange={onMarketSymbolsChange}
                className="mt-2"
              />
            ) : null}

            {/* ── Attached Images / GIFs Carousel ── */}
            {carouselUrls.length > 0 ? (
              <LoungeImageCarousel
                urls={carouselUrls}
                variant="composer"
                firstMarginTopClass="mt-2"
                regionAriaLabel={gifUrl ? 'Post images and GIF' : 'Post images'}
                removeLabelForIndex={(i) => (i < nImg ? 'Remove image' : 'Remove GIF')}
                onRemoveIndex={(i) => {
                  if (i < nImg) {
                    onRemoveImageIndex?.(i)
                  } else {
                    onRemoveGif?.()
                  }
                }}
              />
            ) : null}

            {/* ── Attached Video ── */}
            {composerVideoSlot?.preview ? (
              <div className="relative mt-2 inline-flex max-w-[min(78vw,20rem)] shrink-0 self-start overflow-hidden rounded-xl border border-zinc-700/80 bg-black leading-none">
                <video
                  src={composerVideoSlot.preview}
                  poster={composerVideoSlot.posterUrl || undefined}
                  className="block h-auto max-h-56 w-auto max-w-[min(78vw,20rem)] object-contain"
                  controls
                  playsInline
                  preload="metadata"
                  aria-label="Video preview"
                />
                <button
                  type="button"
                  onClick={onRemoveVideo}
                  className="absolute right-1.5 top-1.5 grid h-8 w-8 place-items-center rounded-full border border-zinc-500/35 bg-black/40 text-base leading-none text-zinc-100 backdrop-blur-[2px] touch-manipulation hover:bg-black/60"
                  aria-label="Remove video"
                >
                  ×
                </button>
              </div>
            ) : null}
          </div>
        ) : (
          /* ── 1:1 Live Preview Card ── */
          <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-start pt-2">
            <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-300">
              <Sparkles className="h-4 w-4 text-amber-400" />
              <span>Live Post Preview</span>
            </div>

            <article
              data-lounge-preview-card=""
              className="w-full rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5 shadow-xl"
            >
              {/* Author Header */}
              <div className="flex items-center gap-3.5">
                <div className="h-11 w-11 shrink-0 overflow-hidden rounded-full bg-zinc-800">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center font-bold text-zinc-300">
                      {displayName.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-[16px] font-bold text-zinc-100">{displayName}</span>
                    {isStaffBadge ? <LoungeStaffRoleBadge role={role} size="feed" /> : null}
                    <LoungeEdgeProBadge isEdgePro={isEdgePro || isStaff} size="feed" />
                  </div>
                  {handle ? <div className="text-[13px] text-zinc-500">@{handle}</div> : null}
                </div>

                {composerReplyGateEdgePro ? (
                  <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-bold text-amber-400">
                    Pro replies only
                  </span>
                ) : null}
              </div>

              {/* Rendered Markdown Body */}
              <div className="mt-3.5 text-[16px] sm:text-[17px] leading-relaxed text-zinc-200">
                {localText?.trim() ? (
                  renderLoungeMarkdown(localText)
                ) : (
                  <span className="italic text-zinc-600">No caption written yet...</span>
                )}
              </div>

              {/* Rendered Media in Preview */}
              {carouselUrls.length > 0 ? (
                <LoungeImageCarousel
                  urls={carouselUrls}
                  variant="feed"
                  firstMarginTopClass="mt-3.5"
                  regionAriaLabel="Post images preview"
                />
              ) : null}

              {composerVideoSlot?.preview ? (
                <div className="mt-3.5 overflow-hidden rounded-xl border border-zinc-800 bg-black">
                  <video
                    src={composerVideoSlot.preview}
                    poster={composerVideoSlot.posterUrl || undefined}
                    className="max-h-80 w-full object-contain"
                    controls
                    playsInline
                  />
                </div>
              ) : null}

              {/* Real Post Interaction Rail Icons */}
              <div className="mt-4 flex w-full items-center justify-between border-t border-zinc-800/80 pt-3 text-zinc-500">
                {/* Comment Icon */}
                <div className="flex items-center gap-1 text-[13px] font-medium text-zinc-500">
                  <svg
                    className={`h-[19px] w-[19px] shrink-0 ${LOUNGE_COMMENT_GLYPH_Y_SCALE_CLASS}`}
                    viewBox="0 0 20 20"
                    fill="none"
                    aria-hidden
                  >
                    <path
                      d={LOUNGE_COMMENT_BUBBLE_D}
                      stroke="currentColor"
                      strokeWidth="1.35"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <span>0</span>
                </div>

                {/* Repost Icon */}
                <div className="flex items-center gap-1 text-[13px] font-medium text-zinc-500">
                  <svg className="h-[19px] w-[19px] shrink-0" viewBox="0 0 20 20" fill="none" aria-hidden>
                    <path
                      d={LOUNGE_REPOST_ARROWS_D}
                      stroke="currentColor"
                      strokeWidth="1.35"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <span>0</span>
                </div>

                {/* Flame / Like Icon */}
                <div className="flex items-center gap-1 text-[13px] font-medium text-zinc-500">
                  <LoungeFlameIcon filled={false} className="h-[19px] w-[19px] shrink-0" />
                  <span>0</span>
                </div>

                {/* Bookmark Icon */}
                <div className="flex items-center text-[13px] font-medium text-zinc-500">
                  <svg className="h-[19px] w-[19px] shrink-0" viewBox="0 0 20 20" fill="none" aria-hidden>
                    <path
                      d="M6 3.5h8a1.5 1.5 0 0 1 1.5 1.5v12l-5.5-3.5L4.5 17V5A1.5 1.5 0 0 1 6 3.5z"
                      stroke="currentColor"
                      strokeWidth="1.35"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
              </div>
            </article>

            <p className="mt-3.5 text-center text-xs text-zinc-500">
              This card is a 1:1 preview of how your post with rich Markdown will render in the Lounge feed.
            </p>
          </div>
        )}
      </div>

      {/* ── Bottom Bar: Clean Media Toolbar & Pro Status ── */}
      {activeTab === 'write' ? (
        <footer
          className="shrink-0 border-t border-zinc-800/90 bg-zinc-900/95 px-4 pt-1.5 backdrop-blur-md sm:px-6 sm:pt-2"
          style={{ paddingBottom: footerPadBottom }}
        >
          <div className="mx-auto flex max-w-3xl items-center justify-between min-h-[2.5rem]">
            <LoungeComposerMediaToolbar
              variant="feed"
              size="lg"
              className="!gap-3 sm:!gap-4"
              imageInputId={imageInputId}
              videoInputId={videoInputId}
              onImagePointerDown={onImagePointerDown}
              onVideoPointerDown={onVideoPointerDown}
              onOpenGifPicker={onOpenGifPicker}
              onOpenMarketPicker={onOpenMarketPicker}
            />

            <div className="text-xs sm:text-sm font-semibold text-zinc-400">
              {isEdgePro || isStaff ? '✨ Markdown Enabled' : 'Edge Pro Markdown'}
            </div>
          </div>
        </footer>
      ) : null}

      {/* ── Audience & Reply Settings / Pre-Post Modal ── */}
      {settingsModalOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="settings-modal-title"
          className="fixed inset-0 z-[240] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in duration-150"
          style={{ paddingBottom: keyboardUp ? `${Math.round(kbFooterLiftPx)}px` : undefined }}
          onClick={() => setSettingsModalOpen(false)}
        >
          <div
            data-lounge-publish-modal=""
            className="w-full max-w-md max-h-[min(62dvh,calc(100dvh-2rem))] flex flex-col overflow-hidden rounded-t-3xl sm:rounded-3xl border border-zinc-800 bg-zinc-900 p-3.5 sm:p-4 shadow-2xl animate-in slide-in-from-bottom duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex shrink-0 items-center justify-between border-b border-zinc-800/80 pb-2.5">
              <div>
                <h3 id="settings-modal-title" className="text-sm sm:text-base font-bold text-zinc-100">
                  {modalMode === 'pre_post' ? 'Ready to Post?' : 'Audience & Replies'}
                </h3>
                <p className="text-[11px] text-zinc-400">
                  {modalMode === 'pre_post'
                    ? 'Confirm audience & reply permissions'
                    : 'Configure post visibility and reply gating'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSettingsModalOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-800 hover:text-white"
                aria-label="Close dialog"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-2.5 space-y-2.5 overflow-y-auto min-h-0 flex-1 pr-0.5 overscroll-contain">
              {/* Audience Section */}
              <div>
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1.5">
                  Display to
                </h4>
                <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
                  <button
                    type="button"
                    onClick={() => handleAudienceSelect(LOUNGE_COMPOSER_AUDIENCE_ALL)}
                    className={`flex items-center gap-2 rounded-xl border p-2 sm:p-2.5 text-left transition-all ${
                      composerAudience === LOUNGE_COMPOSER_AUDIENCE_ALL
                        ? 'border-sky-500/60 bg-sky-500/10 text-white shadow-sm ring-1 ring-sky-500/30'
                        : 'border-zinc-800 bg-zinc-950/50 text-zinc-300 hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-500/20 text-sky-400">
                      <Globe className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[12px] sm:text-[13px] font-bold">Everyone</span>
                        {composerAudience === LOUNGE_COMPOSER_AUDIENCE_ALL ? (
                          <Check className="h-3.5 w-3.5 text-sky-400 shrink-0 ml-1" />
                        ) : null}
                      </div>
                      <div className="text-[10px] text-zinc-400 truncate">Public to all</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleAudienceSelect(LOUNGE_COMPOSER_AUDIENCE_SUBS)}
                    className={`flex items-center gap-2 rounded-xl border p-2 sm:p-2.5 text-left transition-all ${
                      composerAudience === LOUNGE_COMPOSER_AUDIENCE_SUBS
                        ? 'border-amber-500/60 bg-amber-500/10 text-white shadow-sm ring-1 ring-amber-500/30'
                        : 'border-zinc-800 bg-zinc-950/50 text-zinc-300 hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-amber-400">
                      <Users className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[12px] sm:text-[13px] font-bold">Subscribers</span>
                        {composerAudience === LOUNGE_COMPOSER_AUDIENCE_SUBS ? (
                          <Check className="h-3.5 w-3.5 text-amber-400 shrink-0 ml-1" />
                        ) : null}
                      </div>
                      <div className="text-[10px] text-zinc-400 truncate">Subs full, teaser all</div>
                    </div>
                  </button>
                </div>
              </div>

              {/* Reply Gating Section */}
              <div>
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1.5">
                  Who can reply
                </h4>
                <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
                  <button
                    type="button"
                    onClick={() => handleReplyGateSelect(false)}
                    className={`flex items-center gap-2 rounded-xl border p-2 sm:p-2.5 text-left transition-all ${
                      !composerReplyGateEdgePro
                        ? 'border-sky-500/60 bg-sky-500/10 text-white shadow-sm ring-1 ring-sky-500/30'
                        : 'border-zinc-800 bg-zinc-950/50 text-zinc-300 hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-500/20 text-sky-400">
                      <Globe className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[12px] sm:text-[13px] font-bold">Anyone</span>
                        {!composerReplyGateEdgePro ? (
                          <Check className="h-3.5 w-3.5 text-sky-400 shrink-0 ml-1" />
                        ) : null}
                      </div>
                      <div className="text-[10px] text-zinc-400 truncate">All members</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleReplyGateSelect(true)}
                    className={`flex items-center gap-2 rounded-xl border p-2 sm:p-2.5 text-left transition-all ${
                      composerReplyGateEdgePro
                        ? 'border-amber-500/60 bg-amber-500/10 text-white shadow-sm ring-1 ring-amber-500/30'
                        : 'border-zinc-800 bg-zinc-950/50 text-zinc-300 hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-amber-400">
                      <Lock className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[12px] sm:text-[13px] font-bold">Edge Pro</span>
                        {composerReplyGateEdgePro ? (
                          <Check className="h-3.5 w-3.5 text-amber-400 shrink-0 ml-1" />
                        ) : null}
                      </div>
                      <div className="text-[10px] text-zinc-400 truncate">Pro & staff only</div>
                    </div>
                  </button>
                </div>
              </div>
            </div>

            {/* Action Buttons depending on Modal Mode */}
            <div className="shrink-0 pt-2.5 sm:pt-3 border-t border-zinc-800/80 mt-2">
              {modalMode === 'pre_post' ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSettingsModalOpen(false)}
                    className="flex-1 rounded-xl border border-zinc-700/80 bg-zinc-800/80 py-2.5 text-center text-xs sm:text-sm font-bold text-zinc-200 transition-colors hover:bg-zinc-700 touch-manipulation active:scale-[0.98]"
                  >
                    Back to Edit
                  </button>

                  <button
                    type="button"
                    disabled={postBusy}
                    onClick={handleConfirmPublish}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-cyan-600 py-2.5 text-center text-xs sm:text-sm font-bold text-zinc-950 shadow-md transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-40 touch-manipulation"
                  >
                    <Send className="h-3.5 w-3.5" />
                    <span>{postBusy ? 'Posting…' : 'Publish Now'}</span>
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setHasConfiguredAudience(true)
                      setSettingsModalOpen(false)
                    }}
                    className="w-full sm:w-auto rounded-xl bg-zinc-800 px-8 py-2.5 sm:py-3 text-center text-sm font-bold text-white shadow-sm transition-colors hover:bg-zinc-700 active:bg-zinc-600 touch-manipulation active:scale-[0.98]"
                  >
                    Done
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Tribe Max Limit Alert Modal ── */}
      {tribeMaxAlertOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[250] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-150"
          style={{ paddingBottom: keyboardUp ? `${Math.round(kbFooterLiftPx)}px` : undefined }}
          onClick={() => setTribeMaxAlertOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-3xl border border-zinc-800 bg-zinc-900 p-5 text-center shadow-2xl animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/20 text-amber-400">
              <AlertCircle className="h-6 w-6" />
            </div>
            <h3 className="mt-3 text-base font-bold text-zinc-100">Three tribes max</h3>
            <p className="mt-1.5 text-xs text-zinc-400">
              Three tribes max. Deselect a tribe to select this one.
            </p>
            <button
              type="button"
              onClick={() => setTribeMaxAlertOpen(false)}
              className="mt-4 w-full rounded-2xl bg-zinc-800 py-2.5 text-sm font-bold text-white transition-colors hover:bg-zinc-700 touch-manipulation active:scale-[0.98]"
            >
              Got it
            </button>
          </div>
        </div>
      ) : null}
    </div>,
    document.body
  )
}
