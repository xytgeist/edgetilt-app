import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { uploadLoungeFeedPostImage } from '../../utils/communityFeedPost.js'

const MAX_BODY   = 4000
const MAX_IMAGES = 4
const COMPOSER_MIN_H = 40
const COMPOSER_MAX_H = 160
/** Corner radius once the field wraps past one line. */
const COMPOSER_EXPANDED_RADIUS_PX = 20
/** scrollHeight above empty single-line measurement ⇒ multi-line. */
const COMPOSER_MULTI_LINE_SCROLL_SLACK = 6

/**
 * Chat message composer — floating glass bar matching the header style.
 *
 * @param {{
 *   supabaseClient: import('@supabase/supabase-js').SupabaseClient,
 *   viewerUserId: string,
 *   replyTarget: { id: string, body: string, reply_to_preview?: string | null, image_urls?: string[] } | null,
 *   onClearReply: () => void,
 *   onSend: (opts: { body: string, imageUrls: string[], replyToMessageId: string | null }) => Promise<void>,
 *   onTyping: (displayName: string) => void,
 *   viewerDisplayName?: string,
 *   disabled?: boolean,
 * }} props
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
}) {
  const [body, setBody]           = useState('')
  const [images, setImages]       = useState(/** @type {string[]} */ ([]))
  const [uploading, setUploading] = useState(false)
  const [uploadErr, setUploadErr] = useState('')
  const [sending, setSending]     = useState(false)
  const [plusOpen, setPlusOpen]   = useState(false)
  const [plusRect, setPlusRect]   = useState(/** @type {DOMRect|null} */ (null))

  const textareaRef  = useRef(null)
  const inputWrapRef = useRef(null)
  const singleLineScrollHRef = useRef(/** @type {number | null} */ (null))
  const fileInputRef = useRef(null)
  const gifInputRef  = useRef(null)
  const plusBtnRef   = useRef(null)

  const hasContent = body.trim().length > 0 || images.length > 0
  const canSend    = !disabled && !sending && !uploading && hasContent

  // Auto-resize textarea; capsule (9999px) on one line, fixed radius when wrapped
  useLayoutEffect(() => {
    const ta = textareaRef.current
    const wrap = inputWrapRef.current
    if (!ta) return

    if (singleLineScrollHRef.current == null) {
      const prev = ta.value
      ta.value = ''
      ta.style.height = 'auto'
      singleLineScrollHRef.current = ta.scrollHeight
      ta.value = prev
    }

    ta.style.height = 'auto'
    const scrollH = ta.scrollHeight
    const h = Math.max(COMPOSER_MIN_H, Math.min(scrollH, COMPOSER_MAX_H))
    ta.style.height = `${h}px`

    if (wrap) {
      const singleCap = (singleLineScrollHRef.current ?? COMPOSER_MIN_H) + COMPOSER_MULTI_LINE_SCROLL_SLACK
      const isMultiLine = body.includes('\n') || scrollH > singleCap
      wrap.style.borderRadius = isMultiLine
        ? `${COMPOSER_EXPANDED_RADIUS_PX}px`
        : '9999px'
    }
  }, [body])

  const handleBodyChange = (e) => {
    setBody(e.target.value.slice(0, MAX_BODY))
    onTyping(viewerDisplayName)
  }

  const handleImagePick = async (e) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    if (images.length + files.length > MAX_IMAGES) {
      setUploadErr(`Max ${MAX_IMAGES} images per message.`)
      return
    }
    setUploadErr('')
    setUploading(true)
    setPlusOpen(false)
    try {
      const uploaded = await Promise.all(
        files.map((f) => uploadLoungeFeedPostImage(supabaseClient, f, viewerUserId))
      )
      setImages((prev) => [...prev, ...uploaded.map((u) => u.publicUrl)].slice(0, MAX_IMAGES))
    } catch (err) {
      setUploadErr(err?.message || 'Image upload failed.')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleGifPick = async (e) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    if (images.length + files.length > MAX_IMAGES) {
      setUploadErr(`Max ${MAX_IMAGES} images per message.`)
      return
    }
    setUploadErr('')
    setUploading(true)
    setPlusOpen(false)
    try {
      const uploaded = await Promise.all(
        files.map((f) => uploadLoungeFeedPostImage(supabaseClient, f, viewerUserId))
      )
      setImages((prev) => [...prev, ...uploaded.map((u) => u.publicUrl)].slice(0, MAX_IMAGES))
    } catch (err) {
      setUploadErr(err?.message || 'GIF upload failed.')
    } finally {
      setUploading(false)
      if (gifInputRef.current) gifInputRef.current.value = ''
    }
  }

  const removeImage = (url) => setImages((prev) => prev.filter((u) => u !== url))

  const handleSend = useCallback(async () => {
    if (!canSend) return
    // Snapshot before clearing so the send payload is correct
    const snapshot = { body: body.trim(), imageUrls: images, replyToMessageId: replyTarget?.id ?? null }
    // Clear immediately — don't wait for the network round-trip
    setBody('')
    setImages([])
    onClearReply()
    // Keep the keyboard open by refocusing the now-empty textarea
    textareaRef.current?.focus()
    setSending(true)
    try {
      await onSend(snapshot)
    } finally {
      setSending(false)
    }
  }, [canSend, body, images, replyTarget, onSend, onClearReply])

  const handleKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      void handleSend()
    }
  }

  const openPlus = () => {
    const rect = plusBtnRef.current?.getBoundingClientRect()
    if (rect) setPlusRect(rect)
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

  return (
    <div
      className="shrink-0 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]"
      style={{ paddingTop: 6 }}
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

      {/* Image preview strip */}
      {images.length > 0 && (
        <div className="chat-header-glass mb-1 flex gap-2 overflow-x-auto rounded-2xl px-3 py-2">
          {images.map((url) => (
            <div key={url} className="relative shrink-0">
              <img src={url} alt="" className="h-16 w-16 rounded-xl object-cover" />
              <button
                type="button"
                onClick={() => removeImage(url)}
                aria-label="Remove image"
                className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-zinc-900 text-[11px] text-zinc-300 shadow touch-manipulation"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {uploadErr && (
        <div className="px-1 pb-1 text-[12px] text-rose-400">{uploadErr}</div>
      )}

      {/* Main input row — items-end keeps + pinned to bottom when textarea grows */}
      <div className="flex items-end gap-2">

        {/* + button */}
        <button
          ref={plusBtnRef}
          type="button"
          disabled={disabled || uploading}
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
        <input ref={gifInputRef}  type="file" accept="image/gif" multiple className="hidden" onChange={handleGifPick} />

        {/* Textarea + inline send button */}
        <div
          ref={inputWrapRef}
          className="chat-input-glass relative flex-1 overflow-hidden"
          style={{ borderRadius: '9999px' }}
        >
          <textarea
            ref={textareaRef}
            value={body}
            onChange={handleBodyChange}
            onKeyDown={handleKeyDown}
            placeholder="Message…"
            disabled={disabled}
            rows={1}
            className="w-full resize-none bg-transparent pl-4 text-[16px] leading-5 text-zinc-100 placeholder:text-zinc-500 outline-none disabled:opacity-50"
            style={{ minHeight: COMPOSER_MIN_H, maxHeight: COMPOSER_MAX_H, paddingTop: 10, paddingBottom: 10, paddingRight: hasContent ? 46 : 12 }}
          />

          {/* Send button — appears inside textarea when content exists */}
          <button
            type="button"
            disabled={!canSend}
            onClick={() => void handleSend()}
            aria-label="Send"
            className={`absolute bottom-[10px] right-[13px] grid h-7 w-7 place-items-center rounded-lg touch-manipulation transition-all z-10 ${
              hasContent
                ? 'text-cyan-700 opacity-100 active:opacity-60'
                : 'pointer-events-none opacity-0'
            }`}
          >
            {sending ? (
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Plus modal — portaled above button */}
      {plusOpen && createPortal(
        <>
          <div className="fixed inset-0 z-[114]" onClick={() => setPlusOpen(false)} />
          <div className="chat-menu-glass overflow-hidden rounded-2xl" style={plusMenuStyle}>
            {/* Add Media */}
            <button
              type="button"
              disabled={disabled || uploading || images.length >= MAX_IMAGES}
              onClick={() => fileInputRef.current?.click()}
              className="flex w-full items-center gap-3 px-4 py-3.5 text-[15px] font-semibold text-zinc-100 touch-manipulation transition-colors active:bg-white/10 disabled:opacity-40"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                <rect x="3" y="3" width="18" height="18" rx="3" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
              Add Media
            </button>

            <div className="mx-4 h-px bg-white/10" />

            {/* GIF */}
            <button
              type="button"
              disabled={disabled || uploading || images.length >= MAX_IMAGES}
              onClick={() => gifInputRef.current?.click()}
              className="flex w-full items-center gap-3 px-4 py-3.5 text-[15px] font-semibold text-zinc-100 touch-manipulation transition-colors active:bg-white/10 disabled:opacity-40"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                <rect x="2" y="6" width="20" height="12" rx="3" />
                <path d="M10 12h2v2h-2v-2zM10 10v2" strokeLinecap="round"/>
                <path d="M14 10v4M7 10v2h2" strokeLinecap="round"/>
              </svg>
              GIF
            </button>
          </div>
        </>,
        document.body
      )}
    </div>
  )
}
