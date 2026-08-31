import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Eye, Edit3, Minimize2, Sparkles, X } from 'lucide-react'
import LoungeComposerCharRing from './LoungeComposerCharRing.jsx'
import LoungeComposerMediaToolbar from './LoungeComposerMediaToolbar.jsx'
import LoungePostCategoryPillPicker from './LoungePostCategoryPillPicker.jsx'
import LoungeComposerReplyGatePill from './LoungeComposerReplyGatePill.jsx'
import LoungeComposerAudiencePill from './LoungeComposerAudiencePill.jsx'
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
      className="fixed inset-0 z-[220] flex flex-col bg-zinc-950 text-zinc-100 animate-in fade-in duration-150"
    >
      {/* ── Top Bar ── */}
      <header className="flex shrink-0 items-center justify-between border-b border-zinc-800 bg-zinc-900/90 px-3 py-2.5 backdrop-blur-md sm:px-5">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100 touch-manipulation"
            title="Minimize to inline composer"
            aria-label="Minimize composer"
          >
            <Minimize2 className="h-5 w-5" />
          </button>

          <h2 id="pro-composer-title" className="hidden sm:inline-flex items-center gap-1.5 text-sm font-bold text-zinc-200">
            <span>Pro Composer</span>
            <span className="inline-flex items-center rounded-full bg-gradient-to-r from-amber-500/20 to-orange-500/20 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-amber-400 ring-1 ring-amber-500/40">
              MARKDOWN
            </span>
          </h2>
        </div>

        {/* ── Write vs Preview Toggle ── */}
        <div className="flex items-center rounded-xl bg-zinc-950 p-1 ring-1 ring-zinc-800">
          <button
            type="button"
            onClick={() => setActiveTab('write')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-semibold transition-all touch-manipulation ${
              activeTab === 'write'
                ? 'bg-zinc-800 text-white shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Edit3 className="h-3.5 w-3.5" />
            <span>Write</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('preview')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-semibold transition-all touch-manipulation ${
              activeTab === 'preview'
                ? 'bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/40 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Eye className="h-3.5 w-3.5" />
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
            className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-cyan-600 px-4 py-1.5 text-xs font-bold text-zinc-950 shadow-md transition-all hover:brightness-110 active:scale-95 disabled:opacity-40 touch-manipulation"
          >
            <span>{postBusy ? 'Posting…' : 'Post'}</span>
          </button>
        </div>
      </header>

      {/* ── Main Content Area ── */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-3 sm:px-6">
        {activeTab === 'write' ? (
          <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col space-y-3">
            {/* ── Metadata Selectors (Category, Audience, Gating) ── */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800/80 pb-2.5">
              <div className="flex flex-wrap items-center gap-2">
                {composerFanMonetizationLive ? (
                  <LoungeComposerAudiencePill
                    value={composerAudience}
                    onChange={onAudienceChange}
                    disabled={postBusy}
                  />
                ) : null}

                <LoungePostCategoryPillPicker
                  value={composerCategoryPills}
                  onChange={onCategoryPillsChange}
                  disabled={postBusy}
                  className="!mb-0"
                />
              </div>

              <LoungeComposerReplyGatePill
                value={composerReplyGateEdgePro}
                onChange={onReplyGateChange}
                disabled={postBusy}
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
            <div ref={anchorRef} className="relative flex-1 flex flex-col min-h-[12rem]">
              <LoungeRichComposerField
                ref={textareaRef}
                variant="feed"
                value={postText}
                onChange={onTextChange}
                maxLength={captionMax}
                placeholder="What's happening? Format with **bold**, *italic*, `code`, quotes, and lists..."
                ariaLabel="Full screen post caption"
                className="flex-1 w-full resize-none rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-3 text-base leading-relaxed text-zinc-100 placeholder-zinc-500 outline-none focus:border-cyan-500/50"
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
            <div className="mb-2 inline-flex items-center gap-1.5 text-xs text-zinc-400">
              <Sparkles className="h-3.5 w-3.5 text-amber-400" />
              <span>Live Post Preview</span>
            </div>

            <article
              data-lounge-preview-card=""
              className="w-full rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4 shadow-xl"
            >
              {/* Author Header */}
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-zinc-800">
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
                    <span className="truncate text-[15px] font-bold text-zinc-100">{displayName}</span>
                    {isStaffBadge ? <LoungeStaffRoleBadge role={role} size="feed" /> : null}
                    <LoungeEdgeProBadge isEdgePro={isEdgePro || isStaff} size="feed" />
                  </div>
                  {handle ? <div className="text-[13px] text-zinc-500">@{handle}</div> : null}
                </div>

                {composerReplyGateEdgePro ? (
                  <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-400">
                    Pro replies only
                  </span>
                ) : null}
              </div>

              {/* Rendered Markdown Body */}
              <div className="mt-3 text-[15px] leading-relaxed text-zinc-200">
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
                  firstMarginTopClass="mt-3"
                  regionAriaLabel="Post images preview"
                />
              ) : null}

              {composerVideoSlot?.preview ? (
                <div className="mt-3 overflow-hidden rounded-xl border border-zinc-800 bg-black">
                  <video
                    src={composerVideoSlot.preview}
                    poster={composerVideoSlot.posterUrl || undefined}
                    className="max-h-72 w-full object-contain"
                    controls
                    playsInline
                  />
                </div>
              ) : null}

              {/* Simulated Interaction Bar */}
              <div className="mt-4 flex items-center justify-between border-t border-zinc-800/80 pt-3 text-xs text-zinc-500">
                <span>💬 0 comments</span>
                <span>🔁 0 reposts</span>
                <span>❤️ 0 likes</span>
              </div>
            </article>

            <p className="mt-3 text-center text-xs text-zinc-500">
              This card is a 1:1 preview of how your post with rich Markdown will render in the Lounge feed.
            </p>
          </div>
        )}
      </div>

      {/* ── Bottom Bar (Media Controls in Write mode) ── */}
      {activeTab === 'write' ? (
        <footer className="shrink-0 border-t border-zinc-800 bg-zinc-900/90 px-3 py-2 sm:px-5">
          <div className="mx-auto flex max-w-3xl items-center justify-between">
            <LoungeComposerMediaToolbar
              variant="feed"
              imageInputId={imageInputId}
              videoInputId={videoInputId}
              onImagePointerDown={onImagePointerDown}
              onVideoPointerDown={onVideoPointerDown}
              onOpenGifPicker={onOpenGifPicker}
              onOpenMarketPicker={onOpenMarketPicker}
            />

            <div className="text-xs text-zinc-500">
              {isEdgePro || isStaff ? '✨ Markdown Enabled' : 'Upgrade to Edge Pro to unlock Markdown'}
            </div>
          </div>
        </footer>
      ) : null}
    </div>,
    document.body
  )
}
