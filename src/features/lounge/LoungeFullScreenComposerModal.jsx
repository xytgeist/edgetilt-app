import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Eye, Edit3, Minimize2, Sparkles, Globe, Users, Lock } from 'lucide-react'
import LoungeComposerCharRing from './LoungeComposerCharRing.jsx'
import LoungeComposerMediaToolbar from './LoungeComposerMediaToolbar.jsx'
import LoungePostCategoryPillPicker from './LoungePostCategoryPillPicker.jsx'
import LoungeComposerMarketChartStrip from './LoungeComposerMarketChartStrip.jsx'
import { LoungeImageCarousel } from './LoungePostFeedMedia.jsx'
import LoungeMarkdownToolbar from './LoungeMarkdownToolbar.jsx'
import LoungeRichComposerField from './LoungeRichComposerField.jsx'
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
  const textareaRef = useRef(null)
  const anchorRef = useRef(null)

  // Mobile / iOS / Android keyboard lift
  const iosSafeBottomPx = useLoungeIosSafeBottomPx(LOUNGE_IOS)
  const { overlapPx: kbOverlapPx, targetPx: kbOverlapTargetPx } = useLoungeKeyboardOverlapPx(open, {
    smooth: LOUNGE_IOS,
    smoothMs: LOUNGE_IOS_KEYBOARD_SMOOTH_MS,
  })
  const kbFooterLiftPx = Math.max(kbOverlapPx, kbOverlapTargetPx)
  const keyboardUp = kbFooterLiftPx > iosSafeBottomPx + 0.5
  const footerPadBottom = keyboardUp
    ? `${Math.round(kbFooterLiftPx + 8)}px`
    : loungeComposerFooterPaddingBottom(0, Math.max(20, iosSafeBottomPx + 12))

  useEffect(() => {
    if (!open) return
    setActiveTab('write')
    requestAnimationFrame(() => {
      textareaRef.current?.focus()
    })
  }, [open])

  if (!open || typeof document === 'undefined') return null

  const len = (postText || '').length
  const isOverLimit = len > captionMax
  const hasContent =
    Boolean(postText?.trim()) ||
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
            onClick={onClose}
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
            onClick={() => setActiveTab('preview')}
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

        {/* ── Post Action & Char Ring ── */}
        <div className="flex items-center gap-3">
          <LoungeComposerCharRing len={len} max={captionMax} aria-live="polite" />

          <button
            type="button"
            disabled={postBusy || isOverLimit || !hasContent}
            onClick={() => {
              onSubmit()
              onClose()
            }}
            className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-cyan-600 px-5 py-2 text-xs sm:text-sm font-bold text-zinc-950 shadow-md transition-all hover:brightness-110 active:scale-95 disabled:opacity-40 touch-manipulation"
          >
            <span>{postBusy ? 'Posting…' : 'Post'}</span>
          </button>
        </div>
      </header>

      {/* ── Main Content Area ── */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3.5 py-3 sm:px-6 sm:py-4">
        {activeTab === 'write' ? (
          <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col space-y-4">
            {/* ── Row 1: Pill Tab Selectors for "Display to" and "Who can reply" ── */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800/80 pb-3">
              {/* Display to selector */}
              <div className="flex items-center gap-2">
                <span className="text-[12px] sm:text-[13px] font-bold uppercase tracking-wider text-zinc-400 shrink-0">
                  Display to:
                </span>
                <div className="inline-flex items-center rounded-xl bg-zinc-900/90 p-1 border border-zinc-800">
                  <button
                    type="button"
                    disabled={postBusy}
                    onClick={() => onAudienceChange?.(LOUNGE_COMPOSER_AUDIENCE_ALL)}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12px] sm:text-[13px] font-bold transition-all touch-manipulation ${
                      composerAudience === LOUNGE_COMPOSER_AUDIENCE_ALL
                        ? 'bg-sky-500/20 text-sky-400 ring-1 ring-sky-500/50 shadow-sm'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <Globe className="h-3.5 w-3.5" />
                    <span>Everyone</span>
                  </button>

                  <button
                    type="button"
                    disabled={postBusy}
                    onClick={() => onAudienceChange?.(LOUNGE_COMPOSER_AUDIENCE_SUBS)}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12px] sm:text-[13px] font-bold transition-all touch-manipulation ${
                      composerAudience === LOUNGE_COMPOSER_AUDIENCE_SUBS
                        ? 'bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/50 shadow-sm'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <Users className="h-3.5 w-3.5" />
                    <span>Subscribers</span>
                  </button>
                </div>
              </div>

              {/* Who can reply selector */}
              <div className="flex items-center gap-2">
                <span className="text-[12px] sm:text-[13px] font-bold uppercase tracking-wider text-zinc-400 shrink-0">
                  Who can reply:
                </span>
                <div className="inline-flex items-center rounded-xl bg-zinc-900/90 p-1 border border-zinc-800">
                  <button
                    type="button"
                    disabled={postBusy}
                    onClick={() => onReplyGateChange?.(false)}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12px] sm:text-[13px] font-bold transition-all touch-manipulation ${
                      !composerReplyGateEdgePro
                        ? 'bg-sky-500/20 text-sky-400 ring-1 ring-sky-500/50 shadow-sm'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <Globe className="h-3.5 w-3.5" />
                    <span>Everyone</span>
                  </button>

                  <button
                    type="button"
                    disabled={postBusy}
                    onClick={() => onReplyGateChange?.(true)}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12px] sm:text-[13px] font-bold transition-all touch-manipulation ${
                      composerReplyGateEdgePro
                        ? 'bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/50 shadow-sm'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <Lock className="h-3.5 w-3.5" />
                    <span>Edge Pro only</span>
                  </button>
                </div>
              </div>
            </div>

            {/* ── Row 2: Category / Tribe Pills (Larger Size) ── */}
            <div className="w-full">
              <LoungePostCategoryPillPicker
                value={composerCategoryPills}
                onChange={onCategoryPillsChange}
                disabled={postBusy}
                size="lg"
                hint="Optional - select tribes to help interested members discover your post:"
                className="!mt-0 !mb-0"
              />
            </div>

            {/* ── Markdown Formatting Toolbar ── */}
            <LoungeMarkdownToolbar
              textareaRef={textareaRef}
              onTextChange={onTextChange}
              isEdgePro={isEdgePro || isStaff}
              onUpgradeClick={onUpgradeClick}
            />

            {/* ── Textarea with Mention/Cashtag Support ── */}
            <div ref={anchorRef} className="relative flex min-h-[16rem] sm:min-h-[22rem] flex-1 flex-col">
              <LoungeRichComposerField
                ref={textareaRef}
                variant="fullscreen"
                value={postText}
                onChange={onTextChange}
                maxLength={captionMax}
                placeholder="What's on your mind? Format with **bold**, *italic*, `code`, quotes, and lists..."
                ariaLabel="Full screen post caption"
                className="flex-1 h-full min-h-[16rem] sm:min-h-[22rem] w-full resize-none rounded-2xl border border-zinc-800/90 bg-zinc-900/50 p-4 sm:p-5 text-[17px] sm:text-[18px] leading-relaxed text-zinc-100 placeholder-zinc-500 outline-none transition-colors focus:border-cyan-500/50"
                onKeyDown={(e) => {
                  if (cashtagComposer?.onCashtagKeyDown(e, onTextChange, textareaRef.current)) return
                  mentionComposer?.onMentionKeyDown(e, onTextChange, textareaRef.current)
                }}
                onMouseUp={(e) => {
                  cashtagComposer?.onCursorMove(e)
                  mentionComposer?.onCursorMove(e)
                }}
                onInput={(e) => {
                  cashtagComposer?.onCursorMove(e)
                  mentionComposer?.onCursorMove(e)
                }}
              />

              {cashtagComposer?.isOpen ? (
                <LoungeCashtagDropdown
                  open
                  query={cashtagComposer.cashtag?.query ?? ''}
                  suggestions={cashtagComposer.suggestions}
                  activeIndex={cashtagComposer.activeIndex}
                  loading={cashtagComposer.loading}
                  onSelect={(row) => cashtagComposer.onCashtagSelect(row, onTextChange, textareaRef.current)}
                  anchorRef={anchorRef}
                  caretFieldRef={textareaRef}
                />
              ) : null}

              {mentionComposer?.isOpen ? (
                <LoungeMentionDropdown
                  suggestions={mentionComposer.suggestions}
                  activeIndex={mentionComposer.activeIndex}
                  loading={mentionComposer.loading}
                  onSelect={(p) => mentionComposer.onMentionSelect(p, onTextChange, textareaRef.current)}
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
                {postText?.trim() ? (
                  renderLoungeMarkdown(postText)
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

      {/* ── Bottom Bar (Taller, Keyboard-Docked, Spaced & Larger Media Icons) ── */}
      {activeTab === 'write' ? (
        <footer
          className="shrink-0 border-t border-zinc-800/90 bg-zinc-900/95 px-4 pt-3.5 backdrop-blur-md sm:px-6 sm:pt-4"
          style={{ paddingBottom: footerPadBottom }}
        >
          <div className="mx-auto flex max-w-3xl items-center justify-between min-h-[3.25rem]">
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
              {isEdgePro || isStaff ? '✨ Markdown Enabled' : 'Upgrade to Edge Pro to unlock Markdown'}
            </div>
          </div>
        </footer>
      ) : null}
    </div>,
    document.body
  )
}
