import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal, flushSync } from 'react-dom'
import { uploadLoungeFeedPostImage } from '../../utils/communityFeedPost.js'
import { prepareLoungeFeedImageForUpload } from '../../utils/compressImageForUpload.js'
import {
  focusLoungeComposerCaption,
  scheduleLoungeComposerTextareaFocus,
} from '../lounge/loungeDockComposeFocus.js'
import KlipyGifPicker from '../lounge/KlipyGifPicker.jsx'
import LoungeVideoCropModal from '../lounge/LoungeVideoCropModal.jsx'
import {
  requestCfStreamDirectUpload,
  uploadVideoToCfStreamDirectUrlWithProgress,
  deleteCfStreamOrphanAsset,
  cfStreamPosterUrl,
  probeVideoFileDisplaySize,
  probeVideoFileDurationSeconds,
  captureVideoFilePosterObjectUrl,
  LOUNGE_VIDEO_MAX_SECONDS,
} from '../../utils/loungeVideoUpload.js'

const MAX_BODY            = 4000
const MAX_IMAGES          = 12
const SWIPE_DISMISS_PX    = 40   // drag distance to trigger dismiss
const SWIPE_THROW_SCALE   = 4    // how far the tile flies on dismiss
/** Matches Tailwind `h-10` on the + button (40px border-box). */
const COMPOSER_ROW_H = 40
const COMPOSER_MAX_H = 160
/** Corner radius once the field wraps past one line. */
const COMPOSER_EXPANDED_RADIUS_PX = 20

/**
 * Chat message composer — floating glass bar matching the header style.
 *
 * @param {{
 *   supabaseClient: import('@supabase/supabase-js').SupabaseClient,
 *   viewerUserId: string,
 *   replyTarget: { id: string, body: string, reply_to_preview?: string | null, image_urls?: string[] } | null,
 *   onClearReply: () => void,
 *   onSend: (opts: { body: string, imageUrls: string[], streamVideoUid: string | null, streamPosterUrl: string | null, streamVideoWidth: number | null, streamVideoHeight: number | null, replyToMessageId: string | null }) => Promise<void>,
 *   onTyping: (displayName: string) => void,
 *   viewerDisplayName?: string,
 *   disabled?: boolean,
 *   footerHost?: boolean,
 * }} props
 * @param props.footerHost Parent footer host already applies padding + keyboard overlap.
 */
export default function ChatComposer({
  supabaseClient,
  viewerUserId,
  replyTarget,
  onClearReply,
  onSend,
  onTyping,
  viewerDisplayName = '',
  disabled = false,
  footerHost = false,
}) {
  const [body, setBody]           = useState('')
  /**
   * Each slot: { id: string, localUrl: string, remoteUrl: string|null }
   * localUrl is a blob: URL for immediate preview; remoteUrl is the R2 URL once uploaded.
   */
  const [imageSlots, setImageSlots] = useState(/** @type {Array<{id:string,localUrl:string,remoteUrl:string|null}>} */ ([]))
  /** Map<slotId, Promise<string>> — resolves to remoteUrl when upload finishes. */
  const uploadPromisesRef = useRef(/** @type {Map<string,Promise<string>>} */ (new Map()))
  const [uploadErr, setUploadErr] = useState('')
  const [sending, setSending]     = useState(false)
  const [plusOpen, setPlusOpen]   = useState(false)
  const [gifPickerOpen, setGifPickerOpen] = useState(false)
  const [plusRect, setPlusRect]   = useState(/** @type {DOMRect|null} */ (null))
  const [expanded, setExpanded]     = useState(false)
  /** footerHost: no textarea in DOM until tap — matches lounge reply collapsed pill (iOS keyboard). */
  const [composerActive, setComposerActive] = useState(!footerHost)

  // Video state
  const [cropModalFile, setCropModalFile]   = useState(/** @type {File|null} */ (null))
  const [videoUploadProgress, setVideoUploadProgress] = useState(/** @type {number|null} */ (null))
  const [videoMeta, setVideoMeta] = useState(/** @type {{ uid: string, posterUrl: string, localPoster: string|null, width: number|null, height: number|null }|null} */ (null))
  const videoAbortRef = useRef(/** @type {AbortController|null} */ (null))

  const textareaRef    = useRef(null)
  const inputWrapRef   = useRef(null)
  const fileInputRef   = useRef(null)
  const videoInputRef  = useRef(null)
  const plusBtnRef     = useRef(null)

  const hasContent = body.trim().length > 0 || imageSlots.length > 0 || videoMeta !== null
  const canSend    = !disabled && !sending && !videoUploadProgress && hasContent

  useEffect(() => {
    if (!footerHost) setComposerActive(true)
  }, [footerHost])

  useEffect(() => {
    if (!replyTarget && imageSlots.length === 0 && !videoMeta) return
    if (footerHost) {
      flushSync(() => setComposerActive(true))
    } else {
      setComposerActive(true)
    }
  }, [replyTarget, imageSlots.length, videoMeta, footerHost])

  const activateAndFocusComposer = useCallback(() => {
    if (disabled) return
    const getTextarea = () => textareaRef.current
    if (footerHost) {
      flushSync(() => setComposerActive(true))
    } else {
      setComposerActive(true)
    }
    focusLoungeComposerCaption(getTextarea)
    scheduleLoungeComposerTextareaFocus({ getTextarea })
  }, [disabled, footerHost])

  const maybeCollapseComposer = useCallback(() => {
    if (!footerHost) return
    window.setTimeout(() => {
      if (body.trim() || imageSlots.length > 0 || videoMeta || replyTarget || plusOpen) return
      const ae = document.activeElement
      if (textareaRef.current && ae === textareaRef.current) return
      setComposerActive(false)
    }, 220)
  }, [body, footerHost, imageSlots.length, videoMeta, plusOpen, replyTarget])

  // Single line: lock wrapper to h-10 (same as +). Grow only when text wraps.
  useLayoutEffect(() => {
    if (footerHost && !composerActive) return
    const ta = textareaRef.current
    const wrap = inputWrapRef.current
    if (!ta) return

    const prevHeight = ta.style.height
    ta.style.height = 'auto'
    const scrollH = ta.scrollHeight
    ta.style.height = prevHeight

    const lineHeight = parseFloat(getComputedStyle(ta).lineHeight) || 20
    const padY =
      parseFloat(getComputedStyle(ta).paddingTop)
      + parseFloat(getComputedStyle(ta).paddingBottom)
    const lineCount = Math.max(1, Math.round((scrollH - padY) / lineHeight))
    const isMultiLine = body.includes('\n') || lineCount > 1

    setExpanded(isMultiLine)

    if (isMultiLine) {
      const h = Math.max(COMPOSER_ROW_H, Math.min(scrollH, COMPOSER_MAX_H))
      ta.style.height = `${h}px`
      ta.style.lineHeight = ''
      if (wrap) {
        wrap.style.height = ''
        wrap.style.minHeight = `${COMPOSER_ROW_H}px`
        wrap.style.borderRadius = `${COMPOSER_EXPANDED_RADIUS_PX}px`
      }
    } else {
      ta.style.height = '100%'
      ta.style.lineHeight = `${COMPOSER_ROW_H}px`
      if (wrap) {
        wrap.style.height = `${COMPOSER_ROW_H}px`
        wrap.style.minHeight = ''
        wrap.style.borderRadius = '9999px'
      }
    }
  }, [body, composerActive, footerHost])

  const handleBodyChange = (e) => {
    setBody(e.target.value.slice(0, MAX_BODY))
    onTyping(viewerDisplayName)
  }

  const handleImagePick = (e) => {
    let files = Array.from(e.target.files || [])
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (!files.length) return
    const remaining = MAX_IMAGES - imageSlots.length
    if (remaining <= 0) return
    const truncated = files.length > remaining
    if (truncated) files = files.slice(0, remaining)
    setUploadErr(truncated ? `Only the first ${remaining} image${remaining !== 1 ? 's' : ''} were added (max ${MAX_IMAGES}).` : '')
    setPlusOpen(false)
    if (footerHost) flushSync(() => setComposerActive(true))

    // Create slots with local blob URLs immediately for instant preview
    const newSlots = files.map((file) => ({
      id: crypto.randomUUID(),
      localUrl: URL.createObjectURL(file),
      remoteUrl: null,
    }))
    setImageSlots((prev) => [...prev, ...newSlots])

    // Upload each file in parallel in the background (with up to 3 retries for network hiccups)
    files.forEach((file, i) => {
      const slot = newSlots[i]
      const promise = (async () => {
        const { file: ready, error: prepErr } = await prepareLoungeFeedImageForUpload(file)
        if (prepErr || !ready) {
          console.error('[ChatComposer] image prep failed', file.name, file.type, file.size, prepErr?.message || String(prepErr))
          throw prepErr || new Error('Prep failed')
        }
        const MAX_ATTEMPTS = 3
        let lastErr
        for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
          if (attempt > 0) await new Promise((r) => setTimeout(r, 800 * attempt))
          const { data: url, error: upErr } = await uploadLoungeFeedPostImage({
            supabaseClient,
            user: { id: viewerUserId },
            file: ready,
          })
          if (url) return url
          lastErr = upErr
          console.error(`[ChatComposer] image upload attempt ${attempt + 1} failed`, ready.name, upErr?.message || String(upErr))
        }
        throw lastErr || new Error('Upload failed')
      })()

      uploadPromisesRef.current.set(slot.id, promise)

      promise.then((remoteUrl) => {
        setImageSlots((prev) => prev.map((s) => s.id === slot.id ? { ...s, remoteUrl } : s))
      }).catch(() => {
        setImageSlots((prev) => prev.filter((s) => s.id !== slot.id))
        URL.revokeObjectURL(slot.localUrl)
        uploadPromisesRef.current.delete(slot.id)
        setUploadErr('One or more images failed to upload.')
      })
    })
  }

  const handleKlipyGifPick = ({ gifUrl }) => {
    const url = String(gifUrl || '').trim()
    if (!url) return
    if (imageSlots.length >= MAX_IMAGES) {
      setUploadErr(`Max ${MAX_IMAGES} images per message.`)
      return
    }
    setUploadErr('')
    setPlusOpen(false)
    setGifPickerOpen(false)
    // GIFs are remote URLs — add as a slot with remoteUrl already set (no upload needed)
    const id = crypto.randomUUID()
    setImageSlots((prev) => [...prev, { id, localUrl: url, remoteUrl: url }].slice(0, MAX_IMAGES))
    if (footerHost) setComposerActive(true)
  }

  const removeSlot = (slotId) => {
    setImageSlots((prev) => {
      const slot = prev.find((s) => s.id === slotId)
      if (slot) URL.revokeObjectURL(slot.localUrl)
      uploadPromisesRef.current.delete(slotId)
      return prev.filter((s) => s.id !== slotId)
    })
  }

  const handleCropCancel = () => setCropModalFile(null)

  const handleCropConfirm = useCallback(async (result) => {
    // LoungeVideoCropModal with intent='detail' returns a File directly.
    const trimmedFile = result instanceof File ? result : null
    setCropModalFile(null)
    if (!trimmedFile) return

    setUploadErr('')
    setVideoUploadProgress(0)

    const abortCtrl = new AbortController()
    videoAbortRef.current = abortCtrl

    try {
      // Probe dimensions + capture local poster in parallel.
      const [dims, localPoster] = await Promise.all([
        probeVideoFileDisplaySize(trimmedFile),
        captureVideoFilePosterObjectUrl(trimmedFile, { signal: abortCtrl.signal }).catch(() => null),
      ])

      if (abortCtrl.signal.aborted) return

      // Mint a CF Stream direct-upload URL.
      const { uploadURL, uid } = await requestCfStreamDirectUpload(supabaseClient)

      if (abortCtrl.signal.aborted) {
        void deleteCfStreamOrphanAsset(supabaseClient, uid)
        return
      }

      // Upload with progress.
      await uploadVideoToCfStreamDirectUrlWithProgress(uploadURL, trimmedFile, {
        signal: abortCtrl.signal,
        onProgress: (r) => setVideoUploadProgress(Math.round(r * 100)),
      })

      setVideoMeta({
        uid,
        posterUrl: cfStreamPosterUrl(uid),
        localPoster,
        width: dims?.width ?? null,
        height: dims?.height ?? null,
      })
    } catch (e) {
      if (e?.name === 'AbortError') return
      setUploadErr(e?.message || 'Video upload failed.')
    } finally {
      setVideoUploadProgress(null)
      videoAbortRef.current = null
    }
  }, [supabaseClient])

  const removeVideo = useCallback(() => {
    if (videoMeta?.localPoster) URL.revokeObjectURL(videoMeta.localPoster)
    videoAbortRef.current?.abort()
    videoAbortRef.current = null
    setVideoMeta(null)
    setVideoUploadProgress(null)
  }, [videoMeta])

  const handleVideoPick = useCallback(async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (videoInputRef.current) videoInputRef.current.value = ''
    setPlusOpen(false)
    setUploadErr('')

    // Only open the trimmer if the clip exceeds the limit — skip it for short videos.
    let duration = NaN
    try {
      duration = await probeVideoFileDurationSeconds(file)
    } catch {
      // Probe failed — let the crop modal handle it so the user can still trim if needed.
    }

    if (Number.isFinite(duration) && duration <= LOUNGE_VIDEO_MAX_SECONDS) {
      void handleCropConfirm(file)
    } else {
      setCropModalFile(file)
    }
  }, [handleCropConfirm])

  const handleSend = useCallback(async () => {
    if (!canSend) return

    // Snapshot slots before clearing
    const slotsSnapshot = [...imageSlots]
    const readyUrls    = slotsSnapshot.filter((s) => s.remoteUrl).map((s) => s.remoteUrl)
    const previewUrls  = slotsSnapshot.map((s) => s.localUrl)
    const pendingSlots = slotsSnapshot.filter((s) => !s.remoteUrl)
    const pendingUploads = pendingSlots
      .map((s) => uploadPromisesRef.current.get(s.id))
      .filter(Boolean)

    const snapshot = {
      body: body.trim(),
      imageUrls: readyUrls,
      previewUrls,
      pendingUploads,
      streamVideoUid:    videoMeta?.uid    ?? null,
      streamPosterUrl:   videoMeta?.posterUrl ?? null,
      streamVideoWidth:  videoMeta?.width  ?? null,
      streamVideoHeight: videoMeta?.height ?? null,
      replyToMessageId: replyTarget?.id ?? null,
    }

    // Capture blob URLs to revoke AFTER send completes (optimistic message needs them until replaced)
    const blobUrlsToRevoke = slotsSnapshot.map((s) => s.localUrl)

    // Clear composer immediately
    setBody('')
    setImageSlots([])
    uploadPromisesRef.current.clear()
    if (videoMeta?.localPoster) URL.revokeObjectURL(videoMeta.localPoster)
    setVideoMeta(null)
    onClearReply()
    try {
      textareaRef.current?.focus({ preventScroll: true })
    } catch {
      textareaRef.current?.focus()
    }
    setSending(true)
    try {
      await onSend(snapshot)
    } catch (err) {
      const msg = err?.message || ''
      setUploadErr(msg.includes('image_urls_len') ? `Max ${MAX_IMAGES} images per message.` : 'Failed to send. Please try again.')
    } finally {
      setSending(false)
      // Safe to revoke now — optimistic message has been replaced with real R2 URLs
      blobUrlsToRevoke.forEach((u) => URL.revokeObjectURL(u))
    }
  }, [canSend, body, imageSlots, videoMeta, replyTarget, onSend, onClearReply])

  const handleKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      void handleSend()
    }
  }

  const openPlus = () => {
    const rect = plusBtnRef.current?.getBoundingClientRect()
    if (rect) setPlusRect(rect)
    // Activate the composer so the hidden file inputs are mounted in the DOM,
    // but do NOT focus the textarea — we don't want the keyboard to appear.
    if (footerHost) flushSync(() => setComposerActive(true))
    setPlusOpen(true)
  }

  // Plus-modal position: above the button
  const plusMenuStyle = plusRect ? {
    position: 'fixed',
    bottom: window.innerHeight - plusRect.top + 8,
    left: Math.max(12, plusRect.left - 8),
    width: 180,
    zIndex: 115,
  } : {}

  // Shared render for the + menu portal (used from both collapsed and active states).
  const PlusMenu = () => (
    <>
      <div className="fixed inset-0 z-[114]" onClick={() => setPlusOpen(false)} />
      <div className="chat-menu-glass overflow-hidden rounded-2xl" style={plusMenuStyle}>
        <button
          type="button"
          disabled={disabled || imageSlots.length >= MAX_IMAGES || videoMeta !== null || videoUploadProgress !== null}
          onClick={() => { setPlusOpen(false); fileInputRef.current?.click() }}
          className="flex w-full items-center gap-3 px-4 py-3.5 text-[15px] font-semibold text-zinc-100 touch-manipulation transition-colors active:bg-white/10 disabled:opacity-40"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="shrink-0">
            <rect x="3" y="3" width="18" height="18" rx="3" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
          Add Media
        </button>

        <div className="mx-4 h-px bg-white/10" />

        <button
          type="button"
          disabled={disabled || videoMeta !== null || videoUploadProgress !== null || imageSlots.length > 0}
          onClick={() => { setPlusOpen(false); videoInputRef.current?.click() }}
          className="flex w-full items-center gap-3 px-4 py-3.5 text-[15px] font-semibold text-zinc-100 touch-manipulation transition-colors active:bg-white/10 disabled:opacity-40"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="shrink-0">
            <polygon points="23 7 16 12 23 17 23 7" />
            <rect x="1" y="5" width="15" height="14" rx="2" />
          </svg>
          Video
        </button>

        <div className="mx-4 h-px bg-white/10" />

        <button
          type="button"
          disabled={disabled || imageSlots.length >= MAX_IMAGES}
          onClick={() => { setPlusOpen(false); setGifPickerOpen(true) }}
          className="flex w-full items-center gap-3 px-4 py-3.5 text-[15px] font-semibold text-zinc-100 touch-manipulation transition-colors active:bg-white/10 disabled:opacity-40"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0">
            <rect x="3" y="3" width="18" height="18" rx="3" fill="currentColor" fillOpacity="0.14" stroke="currentColor" strokeWidth="1.75" />
            <text x="12" y="15.2" textAnchor="middle" fill="currentColor" style={{ fontSize: '6.5px', fontWeight: 800, fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}>GIF</text>
          </svg>
          GIF
        </button>
      </div>
    </>
  )

  if (footerHost && !composerActive) {
    return (
      <div className="shrink-0">
        <div className="flex items-center gap-2">
          <button
            ref={plusBtnRef}
            type="button"
            disabled={disabled}
            onPointerDown={(e) => e.preventDefault()}
            onClick={openPlus}
            aria-label="Attach media or GIF"
            className="chat-header-glass shrink-0 flex h-10 w-10 items-center justify-center rounded-full text-zinc-100 touch-manipulation active:opacity-70 transition-opacity disabled:opacity-40"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={activateAndFocusComposer}
            className="chat-header-glass flex h-10 min-w-0 flex-1 touch-manipulation items-center rounded-full px-4 text-left text-[16px] text-zinc-500 active:opacity-80"
          >
            Message…
          </button>
        </div>
        {plusOpen && createPortal(PlusMenu(), document.body)}
      </div>
    )
  }

  return (
    <div
      className={
        footerHost
          ? 'shrink-0'
          : 'shrink-0 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]'
      }
      style={footerHost ? undefined : { paddingTop: 6 }}
    >
      {/* Reply strip */}
      {replyTarget && (
        <div className="chat-header-glass mb-1 flex items-start gap-2 rounded-2xl px-3 py-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden className="mt-0.5 shrink-0 text-cyan-400">
              <path d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z"/>
            </svg>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold text-cyan-400">Replying</div>
            <div className="line-clamp-1 text-[12px] text-zinc-400">
              {replyTarget.body || replyTarget.reply_to_preview || '[image]'}
            </div>
          </div>
          <button
            type="button"
            onClick={onClearReply}
            aria-label="Clear reply"
            className="shrink-0 rounded-full p-1 text-zinc-500 touch-manipulation hover:text-zinc-300"
          >
            ×
          </button>
        </div>
      )}

      {/* Image preview strip — slots appear immediately with local blob URLs */}
      {imageSlots.length > 0 && (
        <div className="chat-header-glass mb-1 flex items-center gap-2 overflow-x-auto rounded-2xl px-3 py-2">
          {imageSlots.map((slot) => (
            <SwipeAwayTile key={slot.id} onDismiss={() => removeSlot(slot.id)}>
              <div className="relative h-16 w-16">
                <img src={slot.localUrl} alt="" className="h-16 w-16 rounded-xl object-cover" />
                {!slot.remoteUrl && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/40">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  </div>
                )}
              </div>
            </SwipeAwayTile>
          ))}
        </div>
      )}

      {/* Video preview strip */}
      {(videoMeta || videoUploadProgress !== null) && (
        <div className="chat-header-glass mb-1 flex items-center gap-3 rounded-2xl px-3 py-2">
          <SwipeAwayTile onDismiss={removeVideo}>
            {videoMeta?.localPoster ? (
              <img src={videoMeta.localPoster} alt="" className="h-16 w-16 rounded-xl object-cover" />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-zinc-800">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="text-zinc-500">
                  <polygon points="23 7 16 12 23 17 23 7" />
                  <rect x="1" y="5" width="15" height="14" rx="2" />
                </svg>
              </div>
            )}
          </SwipeAwayTile>
          <div className="min-w-0 flex-1">
            {videoUploadProgress !== null ? (
              <>
                <div className="mb-1.5 text-[12px] text-zinc-400">Uploading… {videoUploadProgress}%</div>
                <div className="h-1.5 overflow-hidden rounded-full bg-zinc-700">
                  <div className="h-full rounded-full bg-cyan-500 transition-all" style={{ width: `${videoUploadProgress}%` }} />
                </div>
              </>
            ) : (
              <div className="text-[12px] text-zinc-400">Video ready</div>
            )}
          </div>
        </div>
      )}

      {uploadErr && (
        <div className="px-1 pb-1 text-[12px] text-rose-400">{uploadErr}</div>
      )}

      {/* Main input row */}
      <div className={`flex gap-2 ${expanded ? 'items-end' : 'items-center'}`}>

        {/* + button */}
        <button
          ref={plusBtnRef}
          type="button"
          disabled={disabled}
          onPointerDown={(e) => e.preventDefault()}
          onClick={openPlus}
          aria-label="Attach media or GIF"
          className="chat-header-glass shrink-0 flex h-10 w-10 items-center justify-center rounded-full text-zinc-100 touch-manipulation active:opacity-70 transition-opacity disabled:opacity-40"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5"  y1="12" x2="19" y2="12" />
          </svg>
        </button>

        {/* Hidden file inputs */}
        <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleImagePick} />
        <input ref={videoInputRef} type="file" accept="video/*" className="hidden" onChange={handleVideoPick} />

        {/* Textarea + inline send button */}
        <div
          ref={inputWrapRef}
          className={`chat-header-glass relative flex flex-1 items-center overflow-hidden ${expanded ? '' : 'h-10'}`}
          style={{ borderRadius: expanded ? COMPOSER_EXPANDED_RADIUS_PX : '9999px' }}
        >
          <textarea
            ref={textareaRef}
            value={body}
            onChange={handleBodyChange}
            onKeyDown={handleKeyDown}
            onBlur={maybeCollapseComposer}
            onFocus={
              footerHost
                ? (e) => {
                    requestAnimationFrame(() => {
                      try {
                        e.currentTarget.focus({ preventScroll: true })
                      } catch {
                        // ignore
                      }
                    })
                  }
                : undefined
            }
            placeholder="Message…"
            disabled={disabled}
            rows={1}
            className={`box-border w-full resize-none bg-transparent py-0 pl-4 text-[16px] text-zinc-100 placeholder:text-zinc-500 outline-none disabled:opacity-50 ${
              expanded ? 'leading-5' : 'h-full overflow-hidden'
            }`}
            style={{
              maxHeight: COMPOSER_MAX_H,
              paddingRight: hasContent ? 46 : 12,
            }}
          />

          {/* Send button — appears inside textarea when content exists */}
          <button
            type="button"
            disabled={!canSend}
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => void handleSend()}
            aria-label="Send"
            className={`absolute right-[5px] z-10 grid h-7 w-7 place-items-center rounded-full touch-manipulation transition-all ${
              expanded ? 'bottom-1.5' : 'top-1/2 -translate-y-1/2'
            } ${
              hasContent
                ? 'text-white opacity-100 active:opacity-50'
                : 'pointer-events-none opacity-0'
            }`}
            style={hasContent ? { backgroundColor: '#3b82f6' } : undefined}
          >
            {sending ? (
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <line x1="12" y1="19" x2="12" y2="5" />
                <polyline points="5 12 12 5 19 12" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Plus modal — portaled above button */}
      {plusOpen && createPortal(PlusMenu(), document.body)}

      <KlipyGifPicker
        open={gifPickerOpen}
        onClose={() => setGifPickerOpen(false)}
        onPick={handleKlipyGifPick}
        supabaseClient={supabaseClient}
      />

      {cropModalFile && (
        <LoungeVideoCropModal
          file={cropModalFile}
          intent="detail"
          onCancel={handleCropCancel}
          onConfirm={handleCropConfirm}
        />
      )}
    </div>
  )
}

// ── SwipeAwayTile ────────────────────────────────────────────────────────────
// Wraps a composer thumbnail; drag any direction > SWIPE_DISMISS_PX to dismiss.
// Vertical drag doesn't block the parent horizontal scroll because we only
// preventDefault on moves that are more vertical than horizontal.

function SwipeAwayTile({ children, onDismiss }) {
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [out, setOut]       = useState(false)
  const startRef  = useRef(null)
  const dragging  = useRef(false)

  const dist = (x, y) => Math.sqrt(x * x + y * y)

  const onTouchStart = (e) => {
    startRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
    dragging.current = false
    setOut(false)
    setOffset({ x: 0, y: 0 })
  }

  const onTouchMove = (e) => {
    if (!startRef.current) return
    const dx = e.touches[0].clientX - startRef.current.x
    const dy = e.touches[0].clientY - startRef.current.y
    // Only take over the gesture when vertical movement exceeds horizontal.
    if (!dragging.current) {
      if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 6) {
        dragging.current = true
      } else {
        return
      }
    }
    e.preventDefault()
    setOffset({ x: dx * 0.65, y: dy * 0.65 })
  }

  const onTouchEnd = () => {
    if (!startRef.current) return
    const { x, y } = offset
    if (dist(x, y) >= SWIPE_DISMISS_PX * 0.65) {
      setOut(true)
      setOffset({ x: x * SWIPE_THROW_SCALE, y: y * SWIPE_THROW_SCALE })
      setTimeout(onDismiss, 200)
    } else {
      setOffset({ x: 0, y: 0 })
    }
    startRef.current = null
    dragging.current = false
  }

  const opacity = out
    ? 0
    : Math.max(0, 1 - dist(offset.x, offset.y) / (SWIPE_DISMISS_PX * 2))

  return (
    <div
      className="relative shrink-0 touch-manipulation"
      style={{
        transform: `translate(${offset.x}px, ${offset.y}px)`,
        opacity,
        transition: out || dragging.current
          ? 'transform 0.2s ease-in, opacity 0.2s ease-in'
          : 'transform 0.25s ease-out, opacity 0.25s ease-out',
        willChange: 'transform, opacity',
      }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
    >
      {children}
    </div>
  )
}
