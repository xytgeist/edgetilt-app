import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import LoungeRichComposerField from './LoungeRichComposerField.jsx'
import LoungeComposerMediaToolbar from './LoungeComposerMediaToolbar.jsx'
import LoungeMentionDropdown from './LoungeMentionDropdown.jsx'
import LoungePostCategoryPillPicker from './LoungePostCategoryPillPicker.jsx'
import { LoungeImageCarousel } from './LoungePostFeedMedia.jsx'
import { LOUNGE_CAPTION_MAX, LOUNGE_POST_THREAD_MAX_PARTS } from '../../utils/loungeCommentLimits.js'
import { LOUNGE_FEED_AVATAR_CLASS } from './loungeFeedAvatar.js'
import {
  threadComposePartCarouselUrls,
  threadComposePartHasContent,
} from '../../utils/loungeThreadComposeMedia.js'
import {
  LOUNGE_IOS,
  LOUNGE_IOS_KEYBOARD_SMOOTH_MS,
  loungeComposerFooterPaddingBottom,
  useLoungeIosSafeBottomPx,
  useLoungeKeyboardOverlapPx,
} from './useLoungeKeyboardOverlapPx.js'

/** Gap between the active part row and the top of the docked toolbar strip. */
const THREAD_COMPOSE_SCROLL_GAP_PX = 10

const AVATAR_RAIL_W = 'w-12 sm:w-[3.3rem]'

function ThreadComposeCharRing({ len, max, counterClass }) {
  const n = Math.max(0, Number(len) || 0)
  const r = 8
  const c = 2 * Math.PI * r
  const pct = Math.min(1, n / max)
  const offset = c * (1 - pct)
  const strokeClass =
    n >= max
      ? 'stroke-red-500'
      : n >= max - 5
        ? 'stroke-orange-400'
        : n >= max - 15
          ? 'stroke-yellow-400'
          : 'stroke-cyan-500/70'

  return (
    <div
      className={`relative flex h-7 w-7 shrink-0 items-center justify-center ${counterClass(n)}`}
      aria-label={`${n} of ${max} characters`}
      title={`${n}/${max}`}
    >
      <svg width="28" height="28" viewBox="0 0 28 28" className="-rotate-90" aria-hidden>
        <circle
          cx="14"
          cy="14"
          r={r}
          fill="none"
          className="stroke-zinc-600/80"
          strokeWidth="2"
        />
        <circle
          cx="14"
          cy="14"
          r={r}
          fill="none"
          className={strokeClass}
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.15s ease' }}
        />
      </svg>
      {n >= max - 15 ? (
        <span className="absolute text-[9px] font-bold tabular-nums leading-none">{max - n}</span>
      ) : null}
    </div>
  )
}

function ThreadComposeAvatar({
  composerUserProfile,
  composerAuthResolved,
  composerUserId,
  composerAuthUser,
  avatarToneClass,
  avatarText,
  profileSeedFromUser,
  profileAvatarInitials,
  composerStableInitialsFromUid,
}) {
  return (
    <div className={`${LOUNGE_FEED_AVATAR_CLASS} shrink-0 border-zinc-600`}>
      {composerUserProfile?.avatar_url ? (
        <img
          src={composerUserProfile.avatar_url}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
          decoding="async"
        />
      ) : !composerAuthResolved ? (
        <span className="block h-full w-full rounded-full bg-zinc-700/55 animate-pulse" aria-hidden />
      ) : (
        <span
          className={`flex h-full w-full items-center justify-center text-[14px] font-bold text-white ${avatarToneClass(
            composerUserProfile?.user_id || composerUserId || 'me',
          )}`}
        >
          {(() => {
            if (composerUserProfile?.display_name?.trim() || composerUserProfile?.handle?.trim()) {
              return avatarText({ author_profile: composerUserProfile })
            }
            if (composerAuthUser) {
              const seed = profileSeedFromUser(composerAuthUser)
              return profileAvatarInitials(seed.displayName, seed.baseHandle)
            }
            if (composerUserId) return composerStableInitialsFromUid(composerUserId)
            return avatarText({ author_profile: { display_name: 'Me', handle: '' } })
          })()}
        </span>
      )}
    </div>
  )
}

/**
 * Full-screen thread composer — X-style per-part rows, keyboard-docked toolbar.
 *
 * @param {object} props
 */
export default function LoungeThreadComposeSheet({
  open,
  onRequestClose,
  captions = [''],
  partsMedia = [],
  activePartIndex = 0,
  onFocusPart,
  onChangePart,
  onAddPart,
  onRemovePart,
  registerPartRef,
  getPartRef,
  focusPartIndex = null,
  categoryPills,
  onCategoryPillsChange,
  onSubmit,
  submitting = false,
  error = '',
  charCounterClass,
  composerUserProfile,
  composerUserId,
  composerAuthResolved,
  composerAuthUser,
  avatarToneClass,
  avatarText,
  profileSeedFromUser,
  profileAvatarInitials,
  composerStableInitialsFromUid,
  mentionComposer,
  mentionAnchorRef,
  part0FieldRef,
  pinOnPost,
  onPinOnPostChange,
  showPinToggle = false,
  imageInputId,
  videoInputId,
  imageInputRef,
  videoInputRef,
  mediaInputHandlers,
  onImagePointerDown,
  onVideoPointerDown,
  onOpenGifPicker,
  onImageInputChange,
  onVideoInputChange,
  onRemovePartImageIndex,
  onRemovePartGif,
  onRemovePartVideo,
}) {
  const scrollRef = useRef(null)
  const toolbarRef = useRef(null)
  const partRowRefs = useRef({})
  const scrollMetricsRef = useRef({ toolbarHeightPx: 52, kbOverlapPx: 0 })
  const [toolbarHeightPx, setToolbarHeightPx] = useState(52)
  const iosSafeBottomPx = useLoungeIosSafeBottomPx(LOUNGE_IOS)
  const { overlapPx: kbOverlapPx } = useLoungeKeyboardOverlapPx(open, { smooth: LOUNGE_IOS })
  const footerPadBottom = loungeComposerFooterPaddingBottom(kbOverlapPx, iosSafeBottomPx)

  scrollMetricsRef.current = { toolbarHeightPx, kbOverlapPx }

  /** Keep part row above the fixed toolbar + keyboard overlap (chat-style tail pin). */
  const scrollPartAboveToolbar = useCallback((partIdx, { pinTail = false } = {}) => {
    const scrollEl = scrollRef.current
    const row = partRowRefs.current[partIdx]
    if (!scrollEl || !row) return

    const { toolbarHeightPx: toolbarH, kbOverlapPx: kbPx } = scrollMetricsRef.current
    const scrollRect = scrollEl.getBoundingClientRect()
    const rowRect = row.getBoundingClientRect()
    const bottomInset = toolbarH + Math.round(kbPx) + THREAD_COMPOSE_SCROLL_GAP_PX
    const visibleBottom = scrollRect.bottom - bottomInset
    const minTop = scrollRect.top + THREAD_COMPOSE_SCROLL_GAP_PX

    let nextScrollTop = scrollEl.scrollTop
    if (pinTail || partIdx >= captions.length - 1) {
      nextScrollTop += rowRect.bottom - visibleBottom
    } else {
      if (rowRect.bottom > visibleBottom) {
        nextScrollTop += rowRect.bottom - visibleBottom
      }
      if (rowRect.top < minTop) {
        nextScrollTop += rowRect.top - minTop
      }
    }

    if (Math.abs(nextScrollTop - scrollEl.scrollTop) < 1) return
    scrollEl.scrollTop = nextScrollTop
  }, [captions.length])

  const chaseScrollPartAboveToolbar = useCallback(
    (partIdx, opts = {}) => {
      const run = () => scrollPartAboveToolbar(partIdx, opts)
      run()
      requestAnimationFrame(run)
      requestAnimationFrame(() => requestAnimationFrame(run))
      if (LOUNGE_IOS) {
        window.setTimeout(run, LOUNGE_IOS_KEYBOARD_SMOOTH_MS)
      }
    },
    [scrollPartAboveToolbar],
  )

  useEffect(() => {
    if (!open || focusPartIndex == null || focusPartIndex < 0) return undefined
    const id = window.setTimeout(() => {
      chaseScrollPartAboveToolbar(focusPartIndex, { pinTail: true })
      try {
        getPartRef?.(focusPartIndex)?.focus?.()
      } catch {
        // ignore
      }
    }, 40)
    return () => window.clearTimeout(id)
  }, [chaseScrollPartAboveToolbar, focusPartIndex, getPartRef, open, captions.length])

  useEffect(() => {
    const el = toolbarRef.current
    if (!el || !open) return undefined
    const sync = () => setToolbarHeightPx(el.offsetHeight || 52)
    sync()
    const ro = new ResizeObserver(sync)
    ro.observe(el)
    return () => ro.disconnect()
  }, [open, captions.length, showPinToggle])

  useLayoutEffect(() => {
    if (!open || activePartIndex < 0) return
    chaseScrollPartAboveToolbar(activePartIndex, { pinTail: true })
  }, [activePartIndex, captions.length, chaseScrollPartAboveToolbar, kbOverlapPx, open, toolbarHeightPx])

  useEffect(() => {
    if (!open || activePartIndex < 0 || typeof ResizeObserver === 'undefined') return undefined
    const row = partRowRefs.current[activePartIndex]
    if (!row) return undefined
    const ro = new ResizeObserver(() => {
      chaseScrollPartAboveToolbar(activePartIndex, { pinTail: true })
    })
    ro.observe(row)
    return () => ro.disconnect()
  }, [activePartIndex, chaseScrollPartAboveToolbar, open, captions.length])

  const focusPart = useCallback(
    (partIdx) => {
      onFocusPart?.(partIdx)
      window.requestAnimationFrame(() => {
        chaseScrollPartAboveToolbar(partIdx, { pinTail: true })
        try {
          getPartRef?.(partIdx)?.focus?.()
        } catch {
          // ignore
        }
      })
    },
    [chaseScrollPartAboveToolbar, getPartRef, onFocusPart],
  )

  if (!open) return null

  const canPost =
    captions.some((t, i) => threadComposePartHasContent(t, partsMedia[i])) &&
    !submitting &&
    captions.every((t) => String(t || '').length <= LOUNGE_CAPTION_MAX)

  const activeLen = String(captions[activePartIndex] || '').length
  const postAllLabel = captions.length > 1 ? 'Post all' : 'Post'

  return (
    <div
      className="fixed inset-0 z-[96] flex flex-col bg-zinc-950"
      role="dialog"
      aria-modal="true"
      aria-labelledby="lounge-thread-compose-title"
    >
      <header className="lounge-thread-compose-header-glass relative z-[1] flex shrink-0 items-center gap-2 px-3 pb-2.5 pt-[max(0.625rem,env(safe-area-inset-top))]">
        <button
          type="button"
          disabled={submitting}
          onClick={onRequestClose}
          className="min-h-10 shrink-0 touch-manipulation rounded-full px-3 py-2 text-[15px] font-normal text-zinc-300 hover:bg-zinc-800 hover:text-white disabled:opacity-45"
        >
          Cancel
        </button>
        <h2 id="lounge-thread-compose-title" className="sr-only">
          Thread composer
        </h2>
        <div className="min-w-0 flex-1" aria-hidden />
        <button
          type="button"
          disabled={!canPost}
          onClick={() => void onSubmit()}
          className="min-h-9 shrink-0 touch-manipulation rounded-full bg-cyan-600 px-4 py-1.5 text-[15px] font-bold text-white hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitting ? 'Posting…' : postAllLabel}
        </button>
      </header>

      {error ? (
        <div className="shrink-0 border-b border-rose-500/25 bg-rose-950/20 px-4 py-2">
          <p className="text-[14px] leading-snug text-rose-200">{error}</p>
        </div>
      ) : null}

      <div className="shrink-0 px-4 pb-2 pt-0.5">
        <LoungePostCategoryPillPicker
          value={categoryPills}
          onChange={onCategoryPillsChange}
          disabled={submitting}
          hint=""
          collapsibleSingleRow
        />
      </div>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4"
        style={{
          paddingBottom: `calc(${toolbarHeightPx}px + ${Math.round(kbOverlapPx)}px + 0.75rem)`,
        }}
      >
        <div className="space-y-0 pb-2">
          {captions.map((partText, partIdx) => {
            const partMedia = partsMedia[partIdx]
            const carouselUrls = threadComposePartCarouselUrls(partMedia)
            const imageCount = partMedia?.imageItems?.length ?? 0
            const partGif = String(partMedia?.gifUrl || '').trim()
            const videoSlot = partMedia?.videoSlot ?? null
            const videoPrepHud = partMedia?.videoPrepHud ?? null
            const isActive = partIdx === activePartIndex
            const isPast = partIdx < activePartIndex
            const isLast = partIdx === captions.length - 1
            const mutedFieldClass = isActive ? '' : 'text-zinc-500'

            return (
              <div
                key={`thread-compose-part-${partIdx}`}
                ref={(el) => {
                  if (el) partRowRefs.current[partIdx] = el
                  else delete partRowRefs.current[partIdx]
                }}
                className={`relative flex gap-3 items-start ${isPast ? 'opacity-80' : ''}`}
                onClick={() => {
                  if (!isActive) focusPart(partIdx)
                }}
              >
                <div
                  className={`flex ${AVATAR_RAIL_W} shrink-0 flex-col items-center self-stretch`}
                >
                  <ThreadComposeAvatar
                    composerUserProfile={composerUserProfile}
                    composerAuthResolved={composerAuthResolved}
                    composerUserId={composerUserId}
                    composerAuthUser={composerAuthUser}
                    avatarToneClass={avatarToneClass}
                    avatarText={avatarText}
                    profileSeedFromUser={profileSeedFromUser}
                    profileAvatarInitials={profileAvatarInitials}
                    composerStableInitialsFromUid={composerStableInitialsFromUid}
                  />
                  {!isLast ? (
                    <div className="mb-2 mt-2 flex min-h-0 w-full flex-1 flex-col items-center">
                      {partIdx >= 1 ? (
                        <span
                          className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-zinc-800 text-[10px] font-bold tabular-nums text-zinc-400 ring-1 ring-zinc-700/90"
                          aria-hidden
                        >
                          {partIdx + 1}
                        </span>
                      ) : null}
                      <div
                        className="w-[2px] flex-1 min-h-[10px] rounded-b-full bg-zinc-700/90"
                        aria-hidden
                      />
                    </div>
                  ) : partIdx >= 1 ? (
                    <div className="mt-2 flex flex-col items-center">
                      <span
                        className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-zinc-800 text-[10px] font-bold tabular-nums text-zinc-400 ring-1 ring-zinc-700/90"
                        aria-hidden
                      >
                        {partIdx + 1}
                      </span>
                    </div>
                  ) : null}
                </div>

                <div
                  className={`relative min-w-0 flex-1 pb-4 pt-1 ${partIdx > 0 && isActive && captions.length > 1 ? 'pr-8' : ''}`}
                >
                  {partIdx > 0 && isActive && captions.length > 1 ? (
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={(e) => {
                        e.stopPropagation()
                        onRemovePart(partIdx)
                      }}
                      className="absolute right-0 top-0 z-[1] flex h-7 w-7 touch-manipulation items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-45"
                      aria-label={`Remove post ${partIdx + 1}`}
                      title="Remove this post"
                    >
                      ×
                    </button>
                  ) : null}

                  {partIdx === 0 ? (
                    <div ref={mentionAnchorRef}>
                      <LoungeRichComposerField
                        ref={(el) => registerPartRef?.(0, el)}
                        variant="feed"
                        autoGrow
                        value={partText}
                        onChange={(next) => onChangePart(partIdx, next)}
                        onFocus={() => focusPart(partIdx)}
                        maxLength={LOUNGE_CAPTION_MAX}
                        placeholder={isActive ? 'Start your thread…' : ''}
                        ariaLabel="Thread post 1"
                        disabled={submitting}
                        className={mutedFieldClass}
                        onKeyDown={(e) =>
                          mentionComposer?.onMentionKeyDown?.(
                            e,
                            (next) => onChangePart(0, next),
                            getPartRef?.(0),
                          )
                        }
                        onKeyUp={mentionComposer?.onCursorMove}
                        onMouseUp={mentionComposer?.onCursorMove}
                        onInput={mentionComposer?.onCursorMove}
                        onBlur={() => window.setTimeout(() => mentionComposer?.clearMention?.(), 150)}
                      />
                      <LoungeMentionDropdown
                        suggestions={mentionComposer?.suggestions ?? []}
                        activeIndex={mentionComposer?.activeIndex ?? 0}
                        loading={mentionComposer?.loading ?? false}
                        onSelect={(p) =>
                          mentionComposer?.onMentionSelect?.(
                            p,
                            (next) => onChangePart(0, next),
                            getPartRef?.(0),
                          )
                        }
                        anchorRef={mentionAnchorRef}
                        caretFieldRef={part0FieldRef}
                      />
                    </div>
                  ) : (
                    <LoungeRichComposerField
                      ref={(el) => registerPartRef?.(partIdx, el)}
                      variant="feed"
                      autoGrow
                      value={partText}
                      onChange={(next) => onChangePart(partIdx, next)}
                      onFocus={() => focusPart(partIdx)}
                      maxLength={LOUNGE_CAPTION_MAX}
                      placeholder={isActive ? 'Say more…' : ''}
                      ariaLabel={`Thread post ${partIdx + 1}`}
                      disabled={submitting}
                      className={mutedFieldClass}
                    />
                  )}

                  {carouselUrls.length > 0 ? (
                    <div className={isPast ? 'opacity-90' : undefined}>
                      <LoungeImageCarousel
                        urls={carouselUrls}
                        variant="composer"
                        firstMarginTopClass="mt-2"
                        regionAriaLabel={partGif ? 'Post images and GIF' : 'Post images'}
                        removeLabelForIndex={(i) => (i < imageCount ? 'Remove image' : 'Remove GIF')}
                        onRemoveIndex={(i) => {
                          if (i < imageCount) onRemovePartImageIndex?.(partIdx, i)
                          else onRemovePartGif?.(partIdx)
                        }}
                      />
                    </div>
                  ) : null}
                  {videoSlot ? (
                    <div
                      className={`relative mt-2 inline-flex max-w-[min(78vw,18rem)] shrink-0 self-start overflow-hidden rounded-xl border border-zinc-700/80 bg-black leading-none ${isPast ? 'opacity-90' : ''}`}
                    >
                      {!videoSlot.file && videoSlot.preview ? (
                        <img
                          src={videoSlot.preview}
                          alt=""
                          className="block h-auto max-h-52 w-auto max-w-[min(78vw,18rem)] object-contain"
                        />
                      ) : videoSlot.preview ? (
                        <video
                          src={videoSlot.preview}
                          poster={videoSlot.posterUrl || undefined}
                          className="block h-auto max-h-52 w-auto max-w-[min(78vw,18rem)] object-contain"
                          controls
                          playsInline
                          preload="metadata"
                          aria-label={`Video preview for post ${partIdx + 1}`}
                        />
                      ) : null}
                      {isActive ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            onRemovePartVideo?.(partIdx)
                          }}
                          disabled={submitting}
                          className="absolute right-1.5 top-1.5 grid h-8 w-8 place-items-center rounded-full border border-zinc-500/35 bg-black/25 text-base leading-none text-zinc-100 shadow-sm backdrop-blur-[2px] touch-manipulation hover:bg-black/45 active:bg-black/55 disabled:opacity-45"
                          aria-label="Remove video"
                          title="Remove video"
                        >
                          ×
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                  {videoPrepHud &&
                  isActive &&
                  (videoSlot?.prepStatus === 'preparing' || videoSlot?.prepStatus === 'queued') ? (
                    <div className="mt-2 rounded-lg border border-cyan-500/20 bg-cyan-950/20 px-2.5 py-2">
                      <div className="text-[11px] font-semibold text-cyan-200/90">
                        {videoPrepHud.status || 'Processing video…'}
                      </div>
                      {videoPrepHud.detail ? (
                        <div className="mt-0.5 text-[10px] leading-snug text-zinc-400">{videoPrepHud.detail}</div>
                      ) : null}
                      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
                        <div
                          className="h-full rounded-full bg-cyan-500 transition-[width] duration-300 ease-out"
                          style={{ width: `${Math.round((videoPrepHud.progress || 0) * 100)}%` }}
                        />
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <footer
        ref={toolbarRef}
        className="fixed inset-x-0 bottom-0 z-[97] px-2 pt-1"
        style={{ paddingBottom: footerPadBottom }}
      >
        <input
          id={imageInputId}
          ref={imageInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          {...mediaInputHandlers}
          onChange={onImageInputChange}
        />
        <input
          id={videoInputId}
          ref={videoInputRef}
          type="file"
          accept="video/*"
          className="hidden"
          {...mediaInputHandlers}
          onChange={onVideoInputChange}
        />
        <div className="lounge-thread-compose-toolbar-glass flex items-center gap-0.5 rounded-2xl px-2 py-1.5">
          <LoungeComposerMediaToolbar
            variant="thread"
            imageInputId={imageInputId}
            videoInputId={videoInputId}
            disabled={submitting}
            gifDisabled={submitting}
            onImagePointerDown={onImagePointerDown}
            onVideoPointerDown={onVideoPointerDown}
            onOpenGifPicker={onOpenGifPicker}
          />
          {captions.length < LOUNGE_POST_THREAD_MAX_PARTS ? (
            <button
              type="button"
              disabled={submitting}
              onMouseDown={(e) => e.preventDefault()}
              onClick={onAddPart}
              className="flex shrink-0 touch-manipulation items-center justify-center rounded-full p-2 text-cyan-600 hover:text-cyan-500 active:text-cyan-400 disabled:opacity-45"
              title="Add post to thread"
              aria-label="Add post to thread"
            >
              <svg className="h-[26px] w-[26px]" viewBox="0 0 20 20" fill="none" aria-hidden>
                <circle cx="10" cy="10" r="7.25" stroke="currentColor" strokeWidth="1.35" />
                <path
                  d="M10 6.75v6.5M6.75 10h6.5"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          ) : null}
          {showPinToggle ? (
            <label className="inline-flex shrink-0 cursor-pointer touch-manipulation select-none items-center gap-1 rounded-full px-2 py-1.5 text-[11px] font-semibold text-zinc-400 hover:bg-white/5 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-cyan-500/40">
              <input
                type="checkbox"
                checked={pinOnPost}
                onChange={(e) => onPinOnPostChange?.(e.target.checked)}
                disabled={submitting}
                className="h-3.5 w-3.5 shrink-0 rounded border-zinc-600 bg-zinc-900 text-cyan-600 focus:ring-0"
                aria-label="Pin this thread to the top of the lounge"
              />
              <span className="whitespace-nowrap">Pin</span>
            </label>
          ) : null}
          <div className="min-w-0 flex-1" aria-hidden />
          <ThreadComposeCharRing
            len={activeLen}
            max={LOUNGE_CAPTION_MAX}
            counterClass={charCounterClass}
          />
        </div>
      </footer>
    </div>
  )
}
