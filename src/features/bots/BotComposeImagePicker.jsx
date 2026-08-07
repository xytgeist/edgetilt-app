import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { BOT_COMPOSE_MAX_IMAGES, mergeBotComposeImageItems } from './botComposeImages.js'
import { lockStableLayoutViewportHeight } from '../../utils/stableLayoutViewport.js'

/**
 * Image picker for bot portal **Post as** compose (preview strip + add/remove).
 * File input is portaled to `document.body` so Chrome/Windows native picker cannot
 * collapse the Bot Portal `dvh` / visualViewport shell (same pattern as slot-guide form).
 */
export default function BotComposeImagePicker({ items, onChange, disabled, onLimitMessage }) {
  const inputId = useId()
  const inputRef = useRef(null)
  const pickingRef = useRef(false)

  useEffect(() => {
    const restoreAfterPicker = () => {
      if (!pickingRef.current) return
      pickingRef.current = false
      lockStableLayoutViewportHeight()
    }
    window.addEventListener('focus', restoreAfterPicker)
    window.visualViewport?.addEventListener('resize', lockStableLayoutViewportHeight)
    return () => {
      window.removeEventListener('focus', restoreAfterPicker)
      window.visualViewport?.removeEventListener('resize', lockStableLayoutViewportHeight)
    }
  }, [])

  const openPicker = () => {
    if (disabled || items.length >= BOT_COMPOSE_MAX_IMAGES) return
    pickingRef.current = true
    lockStableLayoutViewportHeight()
    const input = inputRef.current
    if (!input) {
      pickingRef.current = false
      return
    }
    input.value = ''
    input.click()
  }

  const handlePick = (e) => {
    const files = Array.from(e.target.files || [])
    pickingRef.current = false
    lockStableLayoutViewportHeight()
    if (!files.length) return
    const { next, limitDialog } = mergeBotComposeImageItems(items, files)
    onChange(next)
    if (limitDialog) onLimitMessage?.(limitDialog)
    try {
      if (inputRef.current) inputRef.current.value = ''
    } catch {
      // ignore
    }
  }

  const removeItem = (id) => {
    const target = items.find((it) => it.id === id)
    if (target?.preview?.startsWith?.('blob:')) {
      try {
        URL.revokeObjectURL(target.preview)
      } catch {
        // ignore
      }
    }
    onChange(items.filter((it) => it.id !== id))
  }

  const atCap = items.length >= BOT_COMPOSE_MAX_IMAGES

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <button
          type="button"
          disabled={disabled || atCap}
          onClick={openPicker}
          className={`inline-flex min-h-8 items-center rounded-xl px-3 text-[11px] font-bold ring-1 ${
            disabled || atCap
              ? 'cursor-not-allowed bg-zinc-900/40 text-zinc-600 ring-zinc-800'
              : 'cursor-pointer bg-zinc-950/60 text-zinc-300 ring-zinc-700 hover:text-white hover:ring-zinc-600'
          }`}
        >
          Add images
        </button>
        <span className="text-zinc-600 text-[10px] tabular-nums">
          {items.length}/{BOT_COMPOSE_MAX_IMAGES}
        </span>
      </div>
      {typeof document !== 'undefined'
        ? createPortal(
            <input
              ref={inputRef}
              id={inputId}
              type="file"
              accept="image/*"
              multiple
              tabIndex={-1}
              aria-hidden
              className="sr-only"
              onChange={handlePick}
            />,
            document.body,
          )
        : null}
      {items.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {items.map((item) => (
            <div
              key={item.id}
              className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-zinc-700/80 bg-zinc-950"
            >
              <img src={item.preview} alt="" className="h-full w-full object-cover" />
              <button
                type="button"
                disabled={disabled}
                onClick={() => removeItem(item.id)}
                className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-[10px] font-bold text-white hover:bg-black/90 disabled:opacity-50"
                aria-label="Remove image"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-zinc-600 text-[10px]">Optional photos for the feed post.</div>
      )}
    </div>
  )
}
