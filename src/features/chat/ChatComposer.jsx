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
  probeVideoFileDurationSeconds,
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
 * Chat message composer - floating glass bar matching the header style.
 *
 * @param {{
 *   supabaseClient: import('@supabase/supabase-js').SupabaseClient,
 *   viewerUserId: string,
 *   replyTarget: { id: string, body: string, reply_to_preview?: string | null, image_urls?: string[] } | null,
 *   onClearReply: () => void,
 *   onSend: (opts: { body: string, imageUrls: string[], replyToMessageId: string | null }) => Promise<void>,
 *   onVideoConfirmed?: ((spec: File | { type: 'composerTrimJob' }) => void) | null,
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
  onVideoConfirmed = null,
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
  /** Map<slotId, Promise<string>> - resolves to remoteUrl when upload finishes. */
  const uploadPromisesRef = useRef(/** @type {Map<string,Promise<string>>} */ (new Map()))
  const [uploadErr, setUploadErr] = useState('')
  const [sending, setSending]     = useState(false)
  const [plusOpen, setPlusOpen]   = useState(false)
  const [gifPickerOpen, setGifPickerOpen] = useState(false)
  const [plusRect, setPlusRect]   = useState(/** @type {DOMRect|null} */ (null))
  const [expanded, setExpanded]     = useState(false)
  /** footerHost: no textarea in DOM until tap - matches lounge reply collapsed pill (iOS keyboard). */
  const [composerActive, setComposerActive] = useState(!footerHost)

  // Video state - only the trim-modal gating lives here now.
  // Processing (trim/encode/upload) is owned by ChatConversation via onVideoConfirmed.
  const [cropModalFile, setCropModalFile] = useState(/** @type {{ file: File, knownDurationSec?: number }|null} */ (null))

  const textareaRef    = useRef(null)
  const inputWrapRef   = useRef(null)
  const fileInputRef   = useRef(null)
  const videoInputRef  = useRef(null)
  const plusBtnRef     = useRef(null)

  const hasContent = body.trim().length > 0 || imageSlots.length > 0
  const canSend = !disabled && !sending && hasContent

  useEffect(() => {
    if (!footerHost) setComposerActive(true)
  }, [footerHost])

  useEffect(() => {
    if (!replyTarget && imageSlots.length === 0) return
    if (footerHost) {
      flushSync(() => setComposerActive(true))
    } else {
      setComposerActive(true)
    }
  }, [replyTarget, imageSlots.length, footerHost])

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
      if (body.trim() || imageSlots.length > 0 || replyTarget || plusOpen) return
      const ae = document.activeElement
      if (textareaRef.current && ae === textareaRef.current) return
      setComposerActive(false)
    }, 220)
  }, [body, footerHost, imageSlots.length, plusOpen, replyTarget])

  // Auto-grow: measure the contenteditable's natural (unclipped) scroll height.
  // When expanded the element has py-2.5 (20px vertical padding), so 1 line = 40px -
  // we use a threshold above that to detect genuine multi-line content.
  // When collapsed the element has h-full (40px) with line-height:40px, so 2 lines = 80px.
  useLayoutEffect(() => {
    if (footerHost && !composerActive) return
    const el = textareaRef.current
    const wrap = inputWrapRef.current
    if (!el) return

    // Measure unclipped height: temporarily lift height constraint so scrollHeight
    // reflects content, not the forced h-full size.
    const savedH = el.style.height
    el.style.height = 'auto'
    const scrollH = el.scrollHeight
    el.style.height = savedH

    // expanded py-2.5 adds 20px padding → 1 line = ~40px, 2 lines = ~60px.
    // Use 50px as threshold so any genuine second line of text triggers expand.
    const isMultiLine = body.includes('\n') || scrollH > 50
    setExpanded(isMultiLine)
    if (wrap) {
      if (isMultiLine) {
        wrap.style.height = ''
        wrap.style.minHeight = `${COMPOSER_ROW_H}px`
        wrap.style.borderRadius = `${COMPOSER_EXPANDED_RADIUS_PX}px`
      } else {
        wrap.style.height = `${COMPOSER_ROW_H}px`
        wrap.style.minHeight = ''
        wrap.style.borderRadius = '9999px'
      }
    }
  }, [body, composerActive, footerHost])

  const handleBodyInput = (e) => {
    // Strip HTML - only keep plain text from the contenteditable div.
    const raw = e.currentTarget.innerText ?? ''
    const trimmed = raw.slice(0, MAX_BODY)
    // If browser inserted HTML (e.g. from autocomplete), normalize back to text.
    if (e.currentTarget.innerHTML !== trimmed && e.currentTarget.innerText !== trimmed) {
      const sel = window.getSelection()
      const offset = sel?.focusOffset ?? trimmed.length
      e.currentTarget.innerText = trimmed
      // Restore caret
      try {
        const range = document.createRange()
        const textNode = e.currentTarget.firstChild
        if (textNode) {
          range.setStart(textNode, Math.min(offset, textNode.length))
          range.collapse(true)
          sel?.removeAllRanges()
          sel?.addRange(range)
        }
      } catch { /* ignore caret restore errors */ }
    }
    setBody(trimmed)
    onTyping(viewerDisplayName)
  }

  // Shared core: takes an array of File objects, caps to remaining slots,
  // creates blob preview slots, and starts background uploads.
  const enqueueImageFiles = useCallback((rawFiles) => {
    let files = Array.from(rawFiles).filter((f) => f.type.startsWith('image/'))
    if (!files.length) return
    const remaining = MAX_IMAGES - imageSlots.length
    if (remaining <= 0) {
      setUploadErr(`Max ${MAX_IMAGES} images per message.`)
      return
    }
    const truncated = files.length > remaining
    if (truncated) files = files.slice(0, remaining)
    if (truncated) setUploadErr(`Only the first ${remaining} image${remaining !== 1 ? 's' : ''} were added (max ${MAX_IMAGES}).`)
    else setUploadErr('')
    if (footerHost) flushSync(() => setComposerActive(true))

    const newSlots = files.map((file) => ({
      id: crypto.randomUUID(),
      localUrl: URL.createObjectURL(file),
      remoteUrl: null,
    }))
    setImageSlots((prev) => [...prev, ...newSlots])

    // Create a deferred promise for EVERY slot immediately - before the concurrency
    // queue starts uploading - so handleSend can capture ALL pending promises even
    // if some uploads haven't started yet when the user taps Send.
    const resolvers = files.map((_, i) => {
      let resolve, reject
      const promise = new Promise((res, rej) => { resolve = res; reject = rej })
      uploadPromisesRef.current.set(newSlots[i].id, promise)
      return { resolve, reject }
    })

    // Upload with bounded concurrency (max 4 at a time) and up to 5 retries each.
    const UPLOAD_CONCURRENCY = 4
    const MAX_ATTEMPTS = 5
    let activeUploads = 0
    let queueIdx = 0

    const runNext = () => {
      while (activeUploads < UPLOAD_CONCURRENCY && queueIdx < files.length) {
        const i = queueIdx++
        const file = files[i]
        const slot = newSlots[i]
        const { resolve, reject } = resolvers[i]
        activeUploads++

        const doUpload = async () => {
          const { file: ready, error: prepErr } = await prepareLoungeFeedImageForUpload(file)
          if (prepErr || !ready) {
            console.error('[ChatComposer] image prep failed', file.name, prepErr?.message ?? prepErr)
            throw prepErr || new Error('Prep failed')
          }
          let lastErr
          for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
            if (attempt > 0) await new Promise((r) => setTimeout(r, 1000 * attempt))
            try {
              const { data: url, error: upErr } = await uploadLoungeFeedPostImage({
                supabaseClient,
                user: { id: viewerUserId },
                file: ready,
              })
              if (url) return url
              lastErr = upErr
              console.error(`[ChatComposer] upload attempt ${attempt + 1}/${MAX_ATTEMPTS} failed`, ready.name, upErr?.message ?? upErr)
            } catch (e) {
              lastErr = e
              console.error(`[ChatComposer] upload attempt ${attempt + 1}/${MAX_ATTEMPTS} threw`, ready.name, e?.message ?? e)
            }
          }
          throw lastErr || new Error('Upload failed after max retries')
        }

        doUpload().then((remoteUrl) => {
          resolve(remoteUrl)
          setImageSlots((prev) => prev.map((s) => s.id === slot.id ? { ...s, remoteUrl } : s))
        }).catch((e) => {
          reject(e)
          setImageSlots((prev) => prev.filter((s) => s.id !== slot.id))
          URL.revokeObjectURL(slot.localUrl)
          uploadPromisesRef.current.delete(slot.id)
          setUploadErr('One or more images failed to upload.')
        }).finally(() => {
          activeUploads--
          runNext()
        })
      }
    }

    runNext()
  }, [imageSlots.length, footerHost, supabaseClient, viewerUserId])

  const handleImagePick = (e) => {
    const files = Array.from(e.target.files || [])
    if (fileInputRef.current) fileInputRef.current.value = ''
    setPlusOpen(false)
    enqueueImageFiles(files)
  }

  const handlePaste = useCallback(async (e) => {
    // Path 1: standard paste event - works on iOS and desktop Chrome
    const items = Array.from(e.clipboardData?.items || [])
    const imageFiles = items
      .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter(Boolean)
    if (imageFiles.length) {
      e.preventDefault()
      enqueueImageFiles(imageFiles)
      return
    }

    // Prevent rich HTML from being pasted into contenteditable - allow only plain text.
    // The browser will handle inserting the plain text string at the caret position;
    // we don't need to do it manually since we're preventing the default and
    // re-inserting via execCommand which falls back naturally.
    const hasHtml = items.some((i) => i.kind === 'string' && i.type === 'text/html')
    if (hasHtml) {
      e.preventDefault()
      const text = e.clipboardData?.getData('text/plain') ?? ''
      if (text) document.execCommand('insertText', false, text.slice(0, MAX_BODY))
      return
    }

    // Path 2: Clipboard API fallback - needed for Android Chrome where native-app
    // images aren't exposed through clipboardData.items.
    // Chrome will prompt for "clipboard-read" permission on first use.
    if (!navigator.clipboard?.read) return
    try {
      const clipItems = await navigator.clipboard.read()
      const files = []
      for (const item of clipItems) {
        for (const type of item.types) {
          if (type.startsWith('image/')) {
            const blob = await item.getType(type)
            const ext = type.split('/')[1]?.replace('jpeg', 'jpg') || 'png'
            files.push(new File([blob], `paste.${ext}`, { type }))
          }
        }
      }
      if (files.length) enqueueImageFiles(files)
    } catch {
      // Permission denied or API not available - silently ignore
    }
  }, [enqueueImageFiles])

  // ── Long-press "Paste" menu (Android: clipboard images are grayed out for <input>/<textarea>,
  //    but navigator.clipboard.read() via a button tap bypasses the OS restriction entirely)
  const [pasteMenuPos, setPasteMenuPos] = useState(/** @type {{x:number,y:number}|null} */ (null))
  const longPressTimerRef  = useRef(null)
  const longPressOriginRef = useRef(/** @type {{x:number,y:number}|null} */ (null))
  const lastPointerTypeRef = useRef('mouse')

  const cancelLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }, [])

  const handleComposerPointerDown = useCallback((e) => {
    lastPointerTypeRef.current = e.pointerType
    if (e.pointerType === 'mouse') return
    const { clientX, clientY } = e
    longPressOriginRef.current = { x: clientX, y: clientY }
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTimerRef.current = null
      setPasteMenuPos({ x: clientX, y: clientY })
    }, 500)
  }, [])

  const handleComposerPointerMove = useCallback((e) => {
    if (!longPressOriginRef.current) return
    const dx = e.clientX - longPressOriginRef.current.x
    const dy = e.clientY - longPressOriginRef.current.y
    if (dx * dx + dy * dy > 64) cancelLongPress()
  }, [cancelLongPress])

  // Dismiss paste menu on any tap outside it.
  // Uses bubbling phase (not capture) so the menu container's stopPropagation
  // keeps taps ON the button from reaching window and closing the menu before
  // the click event fires.
  useEffect(() => {
    if (!pasteMenuPos) return
    const dismiss = () => setPasteMenuPos(null)
    window.addEventListener('pointerdown', dismiss)
    return () => window.removeEventListener('pointerdown', dismiss)
  }, [pasteMenuPos])

  const handlePasteButton = useCallback(async () => {
    setPasteMenuPos(null)
    if (!navigator.clipboard?.read) return
    try {
      const clipItems = await navigator.clipboard.read()
      const imageFiles = []
      let plainText = ''
      for (const item of clipItems) {
        for (const type of item.types) {
          if (type.startsWith('image/')) {
            const blob = await item.getType(type)
            const ext = type.split('/')[1]?.replace('jpeg', 'jpg') || 'png'
            imageFiles.push(new File([blob], `paste.${ext}`, { type }))
          } else if (type === 'text/plain' && !plainText) {
            plainText = await item.getType(type).then((b) => b.text()).catch(() => '')
          }
        }
      }
      if (imageFiles.length) {
        enqueueImageFiles(imageFiles)
      } else if (plainText) {
        textareaRef.current?.focus()
        document.execCommand('insertText', false, plainText.slice(0, MAX_BODY))
      }
    } catch {
      // Permission denied or clipboard API unavailable - silently ignore
    }
  }, [enqueueImageFiles])

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
    // GIFs are remote URLs - add as a slot with remoteUrl already set (no upload needed)
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

  // Modal confirms: hand the spec (File or composerTrimJob) off to the parent.
  // All trim/encode/upload work happens in ChatConversation's queue, not here.
  const handleCropConfirm = useCallback((result) => {
    setCropModalFile(null)
    const isTrimJob = result?.type === 'composerTrimJob'
    if (!isTrimJob && !(result instanceof File)) return
    onVideoConfirmed?.(result)
  }, [onVideoConfirmed])

  const handleVideoPick = useCallback(async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (videoInputRef.current) videoInputRef.current.value = ''
    setPlusOpen(false)
    setUploadErr('')

    // Only open the trimmer if the clip exceeds the limit.
    let duration = NaN
    try {
      duration = await probeVideoFileDurationSeconds(file)
    } catch {
      // Probe failed - let the crop modal handle it.
    }

    if (Number.isFinite(duration) && duration <= LOUNGE_VIDEO_MAX_SECONDS) {
      // Short video: skip trim modal entirely.
      onVideoConfirmed?.(file)
    } else {
      setCropModalFile({ file, knownDurationSec: Number.isFinite(duration) ? duration : undefined })
    }
  }, [onVideoConfirmed])

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
      replyToMessageId: replyTarget?.id ?? null,
    }

    // Only refocus if already focused (keyboard already up)
    const wasTextareaFocused = document.activeElement === textareaRef.current

    // Clear composer immediately.
    setBody('')
    if (textareaRef.current) textareaRef.current.innerText = ''
    setImageSlots([])
    uploadPromisesRef.current.clear()
    onClearReply()
    if (wasTextareaFocused) {
      try {
        textareaRef.current?.focus({ preventScroll: true })
      } catch {
        textareaRef.current?.focus()
      }
    }
    setSending(true)
    try {
      await onSend(snapshot)
    } catch (err) {
      const msg = err?.message || ''
      setUploadErr(msg.includes('image_urls_len') ? `Max ${MAX_IMAGES} images per message.` : 'Failed to send. Please try again.')
    } finally {
      setSending(false)
    }
  }, [canSend, body, imageSlots, replyTarget, onSend, onClearReply])

  const handleKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      void handleSend()
      return
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      // On desktop: plain Enter inserts a real \n into the contenteditable.
      // We intercept to insert a text node so we never get <div> wrappers.
      e.preventDefault()
      const sel = window.getSelection()
      if (!sel?.rangeCount) return
      const range = sel.getRangeAt(0)
      range.deleteContents()
      const textNode = document.createTextNode('\n')
      range.insertNode(textNode)
      range.setStartAfter(textNode)
      range.collapse(true)
      sel.removeAllRanges()
      sel.addRange(range)
      // Fire input event so handleBodyInput syncs state
      e.currentTarget.dispatchEvent(new Event('input', { bubbles: true }))
    }
  }

  const openPlus = () => {
    const rect = plusBtnRef.current?.getBoundingClientRect()
    if (rect) setPlusRect(rect)
    // Activate the composer so the hidden file inputs are mounted in the DOM,
    // but do NOT focus the textarea - we don't want the keyboard to appear.
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
          disabled={disabled || imageSlots.length >= MAX_IMAGES}
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
          disabled={disabled || imageSlots.length > 0}
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
            onMouseDown={(e) => e.preventDefault()}
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

      {/* Image preview strip - slots appear immediately with local blob URLs */}
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
          onMouseDown={(e) => e.preventDefault()}
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
          {/* contentEditable div - lets Android clipboard show images (textarea blocks them) */}
          <div
            ref={textareaRef}
            contentEditable={!disabled}
            suppressContentEditableWarning
            role="textbox"
            aria-multiline="true"
            aria-label="Message"
            aria-placeholder="Message…"
            data-placeholder="Message…"
            onInput={handleBodyInput}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onPointerDown={handleComposerPointerDown}
            onPointerMove={handleComposerPointerMove}
            onPointerUp={cancelLongPress}
            onPointerCancel={cancelLongPress}
            onContextMenu={(e) => { if (lastPointerTypeRef.current !== 'mouse') e.preventDefault() }}
            onBlur={maybeCollapseComposer}
            onFocus={
              footerHost
                ? (e) => {
                    requestAnimationFrame(() => {
                      try { e.currentTarget.focus({ preventScroll: true }) } catch { /* ignore */ }
                    })
                  }
                : undefined
            }
            className={`chat-composer-ce box-border w-full bg-transparent pl-4 text-[16px] text-zinc-100 outline-none ${
              disabled ? 'opacity-50 pointer-events-none' : ''
            } ${expanded ? 'leading-5 py-2.5' : 'h-full py-0'}`}
            style={{
              maxHeight: COMPOSER_MAX_H,
              overflowY: expanded ? 'auto' : 'hidden',
              paddingRight: hasContent ? 46 : 12,
              WebkitUserSelect: 'text',
              userSelect: 'text',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          />

          {/* Send button - appears inside textarea when content exists */}
          <button
            type="button"
            disabled={!canSend}
            onMouseDown={(e) => e.preventDefault()}
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

      {/* Plus modal - portaled above button */}
      {plusOpen && createPortal(PlusMenu(), document.body)}

      <KlipyGifPicker
        open={gifPickerOpen}
        onClose={() => setGifPickerOpen(false)}
        onPick={handleKlipyGifPick}
        supabaseClient={supabaseClient}
      />

      {cropModalFile && (
        <LoungeVideoCropModal
          file={cropModalFile.file}
          knownDurationSec={cropModalFile.knownDurationSec}
          intent="composer"
          onCancel={handleCropCancel}
          onConfirm={handleCropConfirm}
        />
      )}

      {/* Long-press paste menu - touch only, Android clipboard image bypass */}
      {pasteMenuPos && createPortal(
        <div
          className="fixed z-[200] flex items-center rounded-full overflow-hidden shadow-xl"
          style={{
            left: pasteMenuPos.x,
            top: pasteMenuPos.y - 52,
            transform: 'translateX(-50%)',
            animation: 'chat-paste-menu-in 120ms ease-out both',
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={handlePasteButton}
            className="px-5 py-2 text-sm font-medium text-white bg-zinc-700 active:bg-zinc-600 select-none touch-manipulation"
          >
            Paste
          </button>
        </div>,
        document.body,
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
