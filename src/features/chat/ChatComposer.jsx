import { useCallback, useEffect, useRef, useState } from 'react'
import { uploadLoungeFeedPostImage } from '../../utils/communityFeedPost.js'

const MAX_BODY = 4000
const MAX_IMAGES = 4

/**
 * Chat message composer.
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
  const [body, setBody] = useState('')
  const [images, setImages] = useState(/** @type {string[]} */ ([]))
  const [uploading, setUploading] = useState(false)
  const [uploadErr, setUploadErr] = useState('')
  const [sending, setSending] = useState(false)
  const textareaRef = useRef(null)
  const fileInputRef = useRef(null)

  const canSend = !disabled && !sending && !uploading && (body.trim().length > 0 || images.length > 0)

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`
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

  const removeImage = (url) => setImages((prev) => prev.filter((u) => u !== url))

  const handleSend = useCallback(async () => {
    if (!canSend) return
    setSending(true)
    try {
      await onSend({
        body: body.trim(),
        imageUrls: images,
        replyToMessageId: replyTarget?.id ?? null,
      })
      setBody('')
      setImages([])
      onClearReply()
      textareaRef.current?.focus()
    } finally {
      setSending(false)
    }
  }, [canSend, body, images, replyTarget, onSend, onClearReply])

  const handleKeyDown = (e) => {
    // Desktop: Ctrl/Cmd+Enter sends
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      void handleSend()
    }
  }

  return (
    <div className="shrink-0 border-t border-zinc-800 bg-zinc-950">
      {/* Reply strip */}
      {replyTarget && (
        <div className="flex items-start gap-2 border-b border-zinc-800 px-3 py-2">
          <span aria-hidden className="mt-0.5 shrink-0 text-sm text-cyan-400">↩</span>
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
        <div className="flex gap-2 overflow-x-auto px-3 py-2">
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
        <div className="px-3 pb-1 text-[12px] text-rose-400">{uploadErr}</div>
      )}

      {/* Input row */}
      <div className="flex items-end gap-2 px-3 py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))]">
        {/* Image attach */}
        <button
          type="button"
          disabled={disabled || uploading || images.length >= MAX_IMAGES}
          onClick={() => fileInputRef.current?.click()}
          aria-label="Attach image"
          className="mb-1 shrink-0 rounded-xl p-2 text-zinc-400 touch-manipulation hover:bg-zinc-800 disabled:opacity-40"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
            <rect x="3" y="3" width="18" height="18" rx="3" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleImagePick}
        />

        <textarea
          ref={textareaRef}
          value={body}
          onChange={handleBodyChange}
          onKeyDown={handleKeyDown}
          placeholder="Message…"
          disabled={disabled}
          rows={1}
          className="min-h-[44px] flex-1 resize-none rounded-2xl border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-[16px] leading-snug text-zinc-100 placeholder:text-zinc-600 outline-none focus:border-cyan-600/50 disabled:opacity-50"
          style={{ maxHeight: 160 }}
        />

        <button
          type="button"
          disabled={!canSend}
          onClick={() => void handleSend()}
          aria-label="Send"
          className="mb-1 shrink-0 grid h-9 w-9 place-items-center rounded-xl bg-cyan-700 text-white touch-manipulation hover:bg-cyan-600 disabled:opacity-40 disabled:bg-zinc-800 transition-colors"
        >
          {sending ? (
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          )}
        </button>
      </div>
    </div>
  )
}
