import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
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
import LoungeComposerCharRing from './LoungeComposerCharRing.jsx'
import {
  LOUNGE_IOS,
  LOUNGE_IOS_KEYBOARD_SMOOTH_MS,
  loungeComposerFooterPaddingBottom,
  useLoungeIosSafeBottomPx,
  useLoungeKeyboardOverlapPx,
} from './useLoungeKeyboardOverlapPx.js'

/** Gap between the active part row and the top of the docked toolbar strip. */
const THREAD_COMPOSE_SCROLL_GAP_PX = 10
/** After media pick the keyboard dismisses; re-open pins need to ride the iOS keyboard slide. */
const THREAD_KB_REOPEN_PIN_MS = LOUNGE_IOS
  ? [135, 220, 320, 450, 600, 750]
  : [80, 160, 280]

const AVATAR_RAIL_W = 'w-12 sm:w-[3.3rem]'

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
  onSaveDraft,
  canSaveDraft = false,
  submitting = false,
  error = '',
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
  onFocusPartIndexConsumed,
}) {
  const scrollRef = useRef(null)
  const toolbarRef = useRef(null)
  const partRowRefs = useRef({})
  const activePartIndexRef = useRef(activePartIndex)
  const didUserActivatePartRef = useRef(false)
  const kbOverlapPrevRef = useRef(0)
  const pendingMediaKeyboardReflowRef = useRef(false)
  const lastMediaTailKeyRef = useRef('')
  const keyboardDockActiveRef = useRef(false)
  activePartIndexRef.current = activePartIndex
  const [toolbarHeightPx, setToolbarHeightPx] = useState(52)
  /** Caption focus — drives tail-follow while typing; keyboard lift uses visualViewport whenever open. */
  const [keyboardDockActive, setKeyboardDockActive] = useState(false)
  const iosSafeBottomPx = useLoungeIosSafeBottomPx(LOUNGE_IOS)
  const { overlapPx: kbOverlapPx, targetPx: kbOverlapTargetPx } = useLoungeKeyboardOverlapPx(open, {
    smooth: LOUNGE_IOS,
    smoothMs: LOUNGE_IOS_KEYBOARD_SMOOTH_MS,
  })
  /** Footer snaps to live keyboard height — smoothed overlap lags and leaves the bar behind keys on reopen. */
  const kbFooterLiftPx = Math.max(kbOverlapPx, kbOverlapTargetPx)
  const keyboardUp = kbFooterLiftPx > iosSafeBottomPx + 0.5
  keyboardDockActiveRef.current = keyboardDockActive
  const activePartMediaTailKey = useMemo(() => {
    const m = partsMedia[activePartIndex]
    if (!m) return 'none'
    const urls = threadComposePartCarouselUrls(m)
    return `${activePartIndex}:${urls.length}:${urls.join('\0')}:${m.videoSlot ? 'v' : ''}`
  }, [activePartIndex, partsMedia])
  const footerPadBottom =
    keyboardUp
      ? `${Math.round(kbFooterLiftPx)}px`
      : loungeComposerFooterPaddingBottom(0, iosSafeBottomPx)

  /** Nudge scroll until the part row tail clears the options bar, or no more overlap remains. */
  const pinThreadPartTail = useCallback((partIdx, { maxPasses = 8 } = {}) => {
    const scrollEl = scrollRef.current
    const row = partRowRefs.current[partIdx]
    const toolbar = toolbarRef.current
    if (!scrollEl || !row || !toolbar) return

    let passes = 0
    const run = () => {
      const rowRect = row.getBoundingClientRect()
      const toolbarTop = toolbar.getBoundingClientRect().top
      const visibleBottom = toolbarTop - THREAD_COMPOSE_SCROLL_GAP_PX
      if (rowRect.bottom <= visibleBottom) return
      scrollEl.scrollTop += rowRect.bottom - visibleBottom
      passes += 1
      if (passes < maxPasses) requestAnimationFrame(run)
    }
    run()
  }, [])

  const schedulePinThreadPartTail = useCallback(
    (partIdx, { extended = false, maxPasses = 8 } = {}) => {
      const run = () => pinThreadPartTail(partIdx, { maxPasses })
      run()
      requestAnimationFrame(run)
      window.setTimeout(run, LOUNGE_IOS_KEYBOARD_SMOOTH_MS)
      if (extended) {
        for (const ms of THREAD_KB_REOPEN_PIN_MS) {
          window.setTimeout(run, ms)
        }
      }
    },
    [pinThreadPartTail],
  )

  /**
   * After media embed the keyboard dismisses; on reopen iOS keeps a stale scroll offset until
   * the list is scrolled. Mimic “scroll to top, then pin tail” so layout matches without a manual gesture.
   */
  const reflowThreadScrollForKeyboardReopen = useCallback(
    (partIdx) => {
      const scrollEl = scrollRef.current
      if (scrollEl) {
        scrollEl.scrollTop = 0
        void scrollEl.offsetHeight
      }
      const runPin = () => pinThreadPartTail(partIdx, { maxPasses: 12 })
      requestAnimationFrame(() => {
        requestAnimationFrame(runPin)
      })
      schedulePinThreadPartTail(partIdx, { extended: true, maxPasses: 12 })
    },
    [pinThreadPartTail, schedulePinThreadPartTail],
  )

  const syncFocusLeftSheet = useCallback(() => {
    window.setTimeout(() => {
      const active = document.activeElement
      if (
        active &&
        (scrollRef.current?.contains(active) || toolbarRef.current?.contains(active))
      ) {
        return
      }
      keyboardDockActiveRef.current = false
      setKeyboardDockActive(false)
    }, 80)
  }, [])

  useEffect(() => {
    if (!open) {
      didUserActivatePartRef.current = false
      setKeyboardDockActive(false)
      pendingMediaKeyboardReflowRef.current = false
      lastMediaTailKeyRef.current = ''
      return
    }
    const scrollEl = scrollRef.current
    if (scrollEl) scrollEl.scrollTop = 0
  }, [open])

  useEffect(() => {
    if (!open || activePartIndex < 0) return undefined
    if (
      lastMediaTailKeyRef.current &&
      lastMediaTailKeyRef.current !== activePartMediaTailKey
    ) {
      pendingMediaKeyboardReflowRef.current = true
    }
    lastMediaTailKeyRef.current = activePartMediaTailKey
    return undefined
  }, [activePartIndex, activePartMediaTailKey, open])

  useEffect(() => {
    if (!open || focusPartIndex == null || focusPartIndex < 0) return undefined
    const id = window.setTimeout(() => {
      didUserActivatePartRef.current = true
      setKeyboardDockActive(true)
      try {
        getPartRef?.(focusPartIndex)?.focus?.({ preventScroll: true })
      } catch {
        try {
          getPartRef?.(focusPartIndex)?.focus?.()
        } catch {
          // ignore
        }
      }
      onFocusPartIndexConsumed?.()
      schedulePinThreadPartTail(focusPartIndex, { extended: true })
    }, 40)
    return () => window.clearTimeout(id)
  }, [focusPartIndex, getPartRef, onFocusPartIndexConsumed, open, schedulePinThreadPartTail])

  useEffect(() => {
    if (!open) {
      kbOverlapPrevRef.current = 0
      return undefined
    }
    if (activePartIndex < 0) return undefined
    const prev = kbOverlapPrevRef.current
    kbOverlapPrevRef.current = kbFooterLiftPx
    if (kbFooterLiftPx > prev + 2) {
      if (pendingMediaKeyboardReflowRef.current) {
        pendingMediaKeyboardReflowRef.current = false
        reflowThreadScrollForKeyboardReopen(activePartIndex)
      } else {
        schedulePinThreadPartTail(activePartIndex, { extended: true })
      }
    } else if (kbFooterLiftPx > iosSafeBottomPx + 0.5) {
      schedulePinThreadPartTail(activePartIndex)
    }
    return undefined
  }, [
    activePartIndex,
    iosSafeBottomPx,
    kbFooterLiftPx,
    kbOverlapTargetPx,
    open,
    reflowThreadScrollForKeyboardReopen,
    schedulePinThreadPartTail,
    toolbarHeightPx,
  ])

  useLayoutEffect(() => {
    if (!open || activePartIndex < 0 || !keyboardUp) return undefined
    pinThreadPartTail(activePartIndex, { maxPasses: 6 })
    return undefined
  }, [
    activePartIndex,
    activePartMediaTailKey,
    kbOverlapPx,
    keyboardUp,
    open,
    pinThreadPartTail,
    toolbarHeightPx,
  ])

  useEffect(() => {
    const el = toolbarRef.current
    if (!el || !open) return undefined
    const sync = () => setToolbarHeightPx(el.offsetHeight || 52)
    sync()
    const ro = new ResizeObserver(sync)
    ro.observe(el)
    return () => ro.disconnect()
  }, [open, captions.length, kbOverlapPx])

  /** Keep the active part tail above the options bar while the caption grows or media is added. */
  useEffect(() => {
    if (!open || activePartIndex < 0 || (!keyboardDockActive && !keyboardUp)) return undefined
    const row = partRowRefs.current[activePartIndex]
    if (!row) return undefined

    const followTail = () => pinThreadPartTail(activePartIndexRef.current, { maxPasses: 6 })
    followTail()

    const ro = new ResizeObserver(() => {
      requestAnimationFrame(followTail)
    })
    ro.observe(row)
    return () => ro.disconnect()
  }, [activePartIndex, keyboardDockActive, keyboardUp, open, pinThreadPartTail])

  useEffect(() => {
    if (!open || activePartIndex < 0) return undefined
    schedulePinThreadPartTail(activePartIndex, { extended: keyboardUp })
    const delays = LOUNGE_IOS ? [100, 350, 700, 1000] : [80, 240, 400]
    const ids = delays.map((ms) =>
      window.setTimeout(
        () => pinThreadPartTail(activePartIndex, { maxPasses: 8 }),
        ms,
      ),
    )
    return () => ids.forEach((id) => window.clearTimeout(id))
  }, [activePartIndex, activePartMediaTailKey, keyboardUp, open, pinThreadPartTail, schedulePinThreadPartTail])

  useEffect(() => {
    if (!open) return undefined
    const scrollEl = scrollRef.current
    if (!scrollEl) return undefined
    let prevH = scrollEl.clientHeight
    const ro = new ResizeObserver(() => {
      const h = scrollEl.clientHeight
      if (h !== prevH && (keyboardDockActive || keyboardUp)) {
        pinThreadPartTail(activePartIndexRef.current, { maxPasses: 8 })
      }
      prevH = h
    })
    ro.observe(scrollEl)
    return () => ro.disconnect()
  }, [keyboardDockActive, keyboardUp, open, pinThreadPartTail])

  useEffect(() => {
    if (!open) return undefined
    const vv = typeof window !== 'undefined' ? window.visualViewport : null
    if (!vv) return undefined
    const onVvChange = () => {
      if (!keyboardDockActiveRef.current && kbOverlapTargetPx <= iosSafeBottomPx + 0.5) return
      pinThreadPartTail(activePartIndexRef.current, { maxPasses: 8 })
    }
    vv.addEventListener('resize', onVvChange)
    vv.addEventListener('scroll', onVvChange)
    return () => {
      vv.removeEventListener('resize', onVvChange)
      vv.removeEventListener('scroll', onVvChange)
    }
  }, [iosSafeBottomPx, kbOverlapTargetPx, open, pinThreadPartTail])

  const shouldTailFollowPart = useCallback(
    (partIdx) =>
      partIdx === activePartIndexRef.current && (keyboardDockActive || keyboardUp),
    [keyboardDockActive, keyboardUp],
  )

  const notifyPartChange = useCallback(
    (partIdx, next) => {
      onChangePart?.(partIdx, next)
      if (shouldTailFollowPart(partIdx)) pinThreadPartTail(partIdx, { maxPasses: 4 })
    },
    [onChangePart, pinThreadPartTail, shouldTailFollowPart],
  )

  const tailFollowOnComposerInput = useCallback(
    (partIdx, mentionPayload) => {
      mentionComposer?.onCursorMove?.(mentionPayload)
      if (shouldTailFollowPart(partIdx)) pinThreadPartTail(partIdx, { maxPasses: 4 })
    },
    [mentionComposer, pinThreadPartTail, shouldTailFollowPart],
  )

  const runPartFocusTailPin = useCallback(
    (partIdx) => {
      if (pendingMediaKeyboardReflowRef.current) {
        pendingMediaKeyboardReflowRef.current = false
        reflowThreadScrollForKeyboardReopen(partIdx)
        return
      }
      schedulePinThreadPartTail(partIdx, { extended: true })
    },
    [reflowThreadScrollForKeyboardReopen, schedulePinThreadPartTail],
  )

  const handlePartFocus = useCallback(
    (partIdx) => {
      didUserActivatePartRef.current = true
      keyboardDockActiveRef.current = true
      setKeyboardDockActive(true)
      onFocusPart?.(partIdx)
      runPartFocusTailPin(partIdx)
    },
    [onFocusPart, runPartFocusTailPin],
  )

  const focusPart = useCallback(
    (partIdx) => {
      didUserActivatePartRef.current = true
      keyboardDockActiveRef.current = true
      setKeyboardDockActive(true)
      onFocusPart?.(partIdx)
      window.requestAnimationFrame(() => {
        try {
          getPartRef?.(partIdx)?.focus?.({ preventScroll: true })
        } catch {
          try {
            getPartRef?.(partIdx)?.focus?.()
          } catch {
            // ignore
          }
        }
        runPartFocusTailPin(partIdx)
      })
    },
    [getPartRef, onFocusPart, runPartFocusTailPin],
  )

  if (!open) return null

  const canPost =
    captions.some((t, i) => threadComposePartHasContent(t, partsMedia[i])) &&
    !submitting &&
    captions.every((t) => String(t || '').length <= LOUNGE_CAPTION_MAX)

  const activeLen = String(captions[activePartIndex] || '').length

  return (
    <div
      className="fixed inset-0 z-[98] flex h-dvh max-h-dvh flex-col overflow-hidden bg-zinc-950"
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
        {onSaveDraft ? (
          <button
            type="button"
            disabled={submitting || !canSaveDraft}
            onClick={() => void onSaveDraft()}
            className="lounge-composer-post-text min-h-10 shrink-0 touch-manipulation rounded-full px-3 py-2 text-[15px] font-semibold disabled:cursor-not-allowed disabled:opacity-45"
          >
            Save
          </button>
        ) : null}
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
          paddingBottom: `calc(${toolbarHeightPx}px + 0.75rem)`,
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
                        onChange={(next) => notifyPartChange(partIdx, next)}
                        onFocus={() => handlePartFocus(partIdx)}
                        maxLength={LOUNGE_CAPTION_MAX}
                        placeholder={
                          String(partText || '').trim() ? '' : 'Are ya winning, son?'
                        }
                        ariaLabel="Thread post 1"
                        disabled={submitting}
                        className={mutedFieldClass}
                        onKeyDown={(e) =>
                          mentionComposer?.onMentionKeyDown?.(
                            e,
                            (next) => notifyPartChange(0, next),
                            getPartRef?.(0),
                          )
                        }
                        onKeyUp={mentionComposer?.onCursorMove}
                        onMouseUp={mentionComposer?.onCursorMove}
                        onInput={(payload) => tailFollowOnComposerInput(0, payload)}
                        onBlur={() => {
                          syncFocusLeftSheet()
                          window.setTimeout(() => mentionComposer?.clearMention?.(), 150)
                        }}
                      />
                      <LoungeMentionDropdown
                        suggestions={mentionComposer?.suggestions ?? []}
                        activeIndex={mentionComposer?.activeIndex ?? 0}
                        loading={mentionComposer?.loading ?? false}
                        onSelect={(p) =>
                          mentionComposer?.onMentionSelect?.(
                            p,
                            (next) => notifyPartChange(0, next),
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
                      onChange={(next) => notifyPartChange(partIdx, next)}
                      onFocus={() => handlePartFocus(partIdx)}
                      onBlur={syncFocusLeftSheet}
                      onInput={() => {
                        if (shouldTailFollowPart(partIdx)) pinThreadPartTail(partIdx, { maxPasses: 4 })
                      }}
                      maxLength={LOUNGE_CAPTION_MAX}
                      placeholder={
                        String(partText || '').trim() ? '' : 'Say more…'
                      }
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
                        onSlideMediaLayout={() => {
                          schedulePinThreadPartTail(partIdx, { extended: keyboardUp })
                        }}
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
        className="relative z-[1] shrink-0 px-2 pt-1"
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
        <div
          ref={toolbarRef}
          className="lounge-thread-compose-toolbar-glass flex items-center gap-0.5 rounded-2xl px-2 py-1.5"
        >
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
          <div className="min-w-0 flex-1" aria-hidden />
          <div className="flex shrink-0 items-center gap-2">
            <LoungeComposerCharRing len={activeLen} max={LOUNGE_CAPTION_MAX} />
            <div className="shrink-0 p-2">
              <button
                type="button"
                disabled={!canPost}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => void onSubmit()}
                className="lounge-composer-post-btn min-h-7 shrink-0 touch-manipulation rounded-md px-2 py-0.5 text-[13px] font-bold leading-tight disabled:cursor-not-allowed disabled:opacity-40"
              >
                {submitting ? 'Posting…' : 'Post'}
              </button>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
