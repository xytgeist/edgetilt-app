import { useEffect, useRef, useState } from 'react'

const RECENT_KEY = 'chatEmojiRecent:v1'
const RECENT_MAX = 24

function loadRecent() {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]')
  } catch {
    return []
  }
}

/** Persist for chat quick-reaction strip (emoji-mart keeps its own Frequent separately). */
export function saveRecentEmoji(emoji) {
  const glyph = String(emoji || '')
  if (!glyph) return
  const list = loadRecent().filter((e) => e !== glyph)
  list.unshift(glyph)
  localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, RECENT_MAX)))
}

function pickerTheme() {
  if (typeof document === 'undefined') return 'dark'
  return document.documentElement.classList.contains('light') ? 'light' : 'dark'
}

/**
 * Full Unicode emoji sheet (emoji-mart + @emoji-mart/data).
 * Same API as the old curated picker: onSelect(native), onClose(), optional zIndex.
 *
 * @param {{ onSelect: (emoji: string) => void, onClose: () => void, zIndex?: number }} props
 */
export default function ChatEmojiPicker({ onSelect, onClose, zIndex = 115 }) {
  const hostRef = useRef(/** @type {HTMLDivElement | null} */ (null))
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect
  const [status, setStatus] = useState(/** @type {'loading' | 'ready' | 'error'} */ ('loading'))
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    let cancelled = false
    const host = hostRef.current
    if (!host) return undefined

    ;(async () => {
      try {
        const [{ default: data }, { Picker }] = await Promise.all([
          import('@emoji-mart/data'),
          import('emoji-mart'),
        ])
        if (cancelled || !hostRef.current) return

        const picker = new Picker({
          data,
          theme: pickerTheme(),
          set: 'native',
          previewPosition: 'none',
          skinTonePosition: 'search',
          navPosition: 'top',
          searchPosition: 'sticky',
          dynamicWidth: true,
          // Keep false … autofocus search can shrink visualViewport on Chrome/Windows.
          autoFocus: false,
          maxFrequentRows: 2,
          emojiButtonSize: 40,
          emojiSize: 26,
          onEmojiSelect: (emoji) => {
            const native = String(emoji?.native || '').trim()
            if (!native) return
            saveRecentEmoji(native)
            onSelectRef.current?.(native)
          },
        })

        hostRef.current.replaceChildren(picker)
        if (!cancelled) setStatus('ready')
      } catch (e) {
        if (cancelled) return
        setStatus('error')
        setErrorMsg(e instanceof Error ? e.message : 'Could not load emoji picker.')
      }
    })()

    return () => {
      cancelled = true
      if (host) host.replaceChildren()
    }
  }, [])

  return (
    <div
      className="fixed inset-0 flex flex-col justify-end bg-black/40"
      style={{ zIndex }}
      onClick={onClose}
      role="presentation"
    >
      <div
        className="chat-sheet-glass flex flex-col rounded-t-2xl shadow-2xl overflow-hidden"
        style={{
          height: 'min(70dvh, calc(100dvh - max(env(safe-area-inset-top, 0px), var(--edge-sat, 0px)) - 3rem))',
          paddingBottom: 'max(env(safe-area-inset-bottom, 0px), var(--edge-sab, 0px))',
        }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Emoji picker"
      >
        <div className="flex items-center justify-between gap-2 px-3 pt-2 pb-1">
          <div className="flex flex-1 justify-center">
            <div className="h-1 w-10 rounded-full bg-zinc-700" />
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-full bg-zinc-800 px-3 py-1 text-xs font-semibold text-zinc-200 touch-manipulation"
          >
            Done
          </button>
        </div>

        {status === 'loading' ? (
          <div className="flex flex-1 items-center justify-center text-sm text-zinc-500">Loading emojis…</div>
        ) : null}
        {status === 'error' ? (
          <div className="flex flex-1 items-center justify-center px-4 text-center text-sm text-rose-300">
            {errorMsg || 'Could not load emoji picker.'}
          </div>
        ) : null}

        <div
          ref={hostRef}
          data-emoji-mart-host
          className={`min-h-0 flex-1 overflow-hidden ${status === 'ready' ? '' : 'hidden'}`}
        />
      </div>
    </div>
  )
}
