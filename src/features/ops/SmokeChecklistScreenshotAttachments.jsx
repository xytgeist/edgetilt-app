import { useRef, useState } from 'react'
import { X } from 'lucide-react'
import {
  imageFilesFromClipboardEvent,
  imageFilesFromNavigatorClipboardRead,
} from '../../utils/clipboardImagePaste.js'
import { uploadSmokeChecklistScreenshot, smokeChecklistScreenshotPreviewUrl } from './smokeChecklistScreenshotUpload.js'

const MAX_SCREENSHOTS_PER_ITEM = 4

/**
 * @param {object} props
 * @param {import('@supabase/supabase-js').SupabaseClient} props.supabaseClient
 * @param {string} props.userId
 * @param {string[]} props.screenshots
 * @param {(urls: string[]) => void} props.onChange
 * @param {(msg: string) => void} [props.onError]
 * @param {(uploading: boolean) => void} [props.onUploadingChange]
 */
export default function SmokeChecklistScreenshotAttachments({
  supabaseClient,
  userId,
  screenshots = [],
  onChange,
  onError,
  onUploadingChange,
}) {
  const fileInputRef = useRef(/** @type {HTMLInputElement | null} */ (null))
  const [uploading, setUploading] = useState(false)

  async function appendFiles(files) {
    if (!supabaseClient || !userId) return
    const incoming = (files || []).filter((f) => f && f.type?.startsWith('image/'))
    if (!incoming.length) return

    const remaining = MAX_SCREENSHOTS_PER_ITEM - screenshots.length
    if (remaining <= 0) {
      onError?.(`Max ${MAX_SCREENSHOTS_PER_ITEM} screenshots per step.`)
      return
    }

    setUploading(true)
    onUploadingChange?.(true)
    try {
      const next = [...screenshots]
      for (const file of incoming.slice(0, remaining)) {
        const url = await uploadSmokeChecklistScreenshot(supabaseClient, userId, file)
        next.push(url)
      }
      onChange(next)
    } catch (e) {
      onError?.(e?.message || 'Screenshot upload failed.')
    } finally {
      setUploading(false)
      onUploadingChange?.(false)
    }
  }

  async function handlePaste(e) {
    const imageFiles = imageFilesFromClipboardEvent(e)
    if (imageFiles.length) {
      e.preventDefault()
      await appendFiles(imageFiles)
      return
    }

    if (navigator.clipboard?.read) {
      const asyncFiles = await imageFilesFromNavigatorClipboardRead()
      if (asyncFiles.length) {
        e.preventDefault()
        await appendFiles(asyncFiles)
      }
    }
  }

  function removeAt(index) {
    onChange(screenshots.filter((_, i) => i !== index))
  }

  return (
    <div className="mt-3" data-stable-smoke-screenshots>
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">
          Screenshots
        </span>
        <span className="text-[10px] text-zinc-600">
          Paste Ctrl+V · {screenshots.length}/{MAX_SCREENSHOTS_PER_ITEM}
        </span>
      </div>

      {screenshots.length ? (
        <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {screenshots.map((url, index) => (
            <div
              key={`${url}-${index}`}
              className="relative overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900"
            >
              <a href={url} target="_blank" rel="noopener noreferrer" className="block">
                <img
                  src={smokeChecklistScreenshotPreviewUrl(url)}
                  alt={`Screenshot ${index + 1}`}
                  className="aspect-video w-full object-contain bg-zinc-950"
                  loading="lazy"
                />
              </a>
              <button
                type="button"
                aria-label="Remove screenshot"
                onClick={() => removeAt(index)}
                className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-lg bg-black/70 text-zinc-200 touch-manipulation"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <div
        tabIndex={0}
        onPaste={(e) => void handlePaste(e)}
        className="rounded-xl border border-dashed border-zinc-700/80 bg-zinc-900/40 px-3 py-2.5 focus:border-amber-500/40 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
      >
        <p className="text-xs leading-relaxed text-zinc-500">
          Click here and paste a screenshot (Win+Shift+S → Ctrl+V), or use Add screenshot.
          {uploading ? ' Uploading…' : null}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={uploading || screenshots.length >= MAX_SCREENSHOTS_PER_ITEM}
            onClick={() => fileInputRef.current?.click()}
            className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-zinc-200 touch-manipulation disabled:opacity-50"
          >
            Add screenshot
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files || [])
              e.target.value = ''
              void appendFiles(files)
            }}
          />
        </div>
      </div>
    </div>
  )
}
