import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Z_APP_ALERT } from '../../constants/appZIndex.js'
import { profileAvatarInitials, profileAvatarToneClass } from '../profiles/profileGate.js'
import { searchEdgeProfilesByHandle } from './pokerStableApi.js'

const DEBOUNCE_MS = 120
const GAP_PX = 4
const MAX_LIST_HEIGHT_PX = 208

function normalizeHandle(value) {
  return String(value || '').trim().replace(/^@+/, '')
}

/**
 * Inline @handle typeahead for Stable flows.
 * Dropdown anchors below the input (absolute) so it stays glued on mobile sheets.
 */
export default function EdgeHandleTypeahead({
  supabaseClient,
  excludeUserId = null,
  value,
  onChange,
  onSelectProfile,
  selectedProfile = null,
  placeholder = '@handle',
  disabled = false,
  inputClassName = '',
  autoFocus = false,
}) {
  const listId = useId()
  const containerRef = useRef(null)
  const inputRef = useRef(null)
  const listRef = useRef(null)
  const debounceRef = useRef(0)
  const fetchGenRef = useRef(0)

  const [suggestions, setSuggestions] = useState([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [openUpward, setOpenUpward] = useState(false)

  const normalizedValue = normalizeHandle(value)
  const selectedHandle = normalizeHandle(selectedProfile?.handle)
  const isLockedSelection = Boolean(selectedHandle && normalizedValue === selectedHandle)

  const closeList = useCallback(() => {
    fetchGenRef.current += 1
    window.clearTimeout(debounceRef.current)
    setOpen(false)
    setSuggestions([])
    setLoading(false)
    setActiveIndex(0)
    setOpenUpward(false)
  }, [])

  const showList = useMemo(
    () =>
      !isLockedSelection &&
      open &&
      (loading || suggestions.length > 0 || normalizedValue.length >= 1),
    [isLockedSelection, open, loading, suggestions.length, normalizedValue.length],
  )

  const pickProfile = useCallback(
    (profile) => {
      if (!profile) return
      const handle = normalizeHandle(profile.handle)
      onChange(handle)
      onSelectProfile?.(profile)
      closeList()
      inputRef.current?.blur()
    },
    [onChange, onSelectProfile, closeList],
  )

  useEffect(() => {
    if (!supabaseClient || disabled || isLockedSelection) {
      closeList()
      return undefined
    }
    if (normalizedValue.length < 1) {
      closeList()
      return undefined
    }

    setOpen(true)
    setLoading(true)
    window.clearTimeout(debounceRef.current)
    const gen = (fetchGenRef.current += 1)
    debounceRef.current = window.setTimeout(() => {
      void searchEdgeProfilesByHandle(supabaseClient, normalizedValue, { excludeUserId }).then(
        ({ profiles, error }) => {
          if (fetchGenRef.current !== gen) return
          if (error) {
            setSuggestions([])
            setLoading(false)
            return
          }
          setSuggestions(profiles)
          setActiveIndex(0)
          setLoading(false)
        },
      )
    }, DEBOUNCE_MS)

    return () => window.clearTimeout(debounceRef.current)
  }, [supabaseClient, normalizedValue, excludeUserId, disabled, isLockedSelection, closeList])

  useLayoutEffect(() => {
    if (!showList) return undefined

    const updatePlacement = () => {
      const anchor = containerRef.current
      const input = inputRef.current
      const list = listRef.current
      if (!anchor || !input) return

      const rect = input.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return

      const vv = window.visualViewport
      const vBottom = (vv ? vv.offsetTop + vv.height : window.innerHeight) - 8
      const vTop = (vv?.offsetTop ?? 0) + 8
      const listHeight = Math.min(list?.offsetHeight || MAX_LIST_HEIGHT_PX, MAX_LIST_HEIGHT_PX)
      const spaceBelow = vBottom - rect.bottom - GAP_PX
      const spaceAbove = rect.top - vTop - GAP_PX
      setOpenUpward(listHeight > 0 && spaceBelow < listHeight && spaceAbove > spaceBelow)
    }

    updatePlacement()
    const raf = requestAnimationFrame(updatePlacement)

    const vv = window.visualViewport
    vv?.addEventListener('resize', updatePlacement)
    vv?.addEventListener('scroll', updatePlacement)
    window.addEventListener('resize', updatePlacement)
    window.addEventListener('scroll', updatePlacement, true)

    const anchor = containerRef.current
    const ro = typeof ResizeObserver !== 'undefined' && anchor ? new ResizeObserver(updatePlacement) : null
    ro?.observe(anchor)

    const scrollParents = []
    let node = anchor?.parentElement
    while (node) {
      const style = window.getComputedStyle(node)
      if (/(auto|scroll)/.test(style.overflowY) || /(auto|scroll)/.test(style.overflow)) {
        scrollParents.push(node)
        node.addEventListener('scroll', updatePlacement, { passive: true })
      }
      node = node.parentElement
    }

    return () => {
      cancelAnimationFrame(raf)
      vv?.removeEventListener('resize', updatePlacement)
      vv?.removeEventListener('scroll', updatePlacement)
      window.removeEventListener('resize', updatePlacement)
      window.removeEventListener('scroll', updatePlacement, true)
      ro?.disconnect()
      for (const el of scrollParents) el.removeEventListener('scroll', updatePlacement)
    }
  }, [showList, suggestions.length, loading, activeIndex, normalizedValue])

  useLayoutEffect(() => {
    if (!showList) return undefined
    const sheet = containerRef.current?.closest('[data-poker-stable-sheet]')
    if (!sheet) return undefined
    const prevOverflow = sheet.style.overflow
    const prevOverflowY = sheet.style.overflowY
    sheet.style.overflow = 'visible'
    sheet.style.overflowY = 'visible'
    return () => {
      sheet.style.overflow = prevOverflow
      sheet.style.overflowY = prevOverflowY
    }
  }, [showList])

  useEffect(() => {
    if (!open) return undefined
    const onDocPointerDown = (e) => {
      const target = e.target
      if (!(target instanceof Node)) return
      if (containerRef.current?.contains(target)) return
      closeList()
    }
    document.addEventListener('pointerdown', onDocPointerDown)
    return () => document.removeEventListener('pointerdown', onDocPointerDown)
  }, [open, closeList])

  const stopBubble = (e) => {
    e.stopPropagation()
  }

  return (
    <div
      ref={containerRef}
      className={`relative ${showList ? 'z-[131]' : ''}`}
      onMouseDown={stopBubble}
      onPointerDown={stopBubble}
    >
      <input
        ref={inputRef}
        type="text"
        value={value ?? ''}
        onChange={(e) => {
          onChange(e.target.value)
        }}
        onFocus={() => {
          if (isLockedSelection) return
          if (normalizedValue.length >= 1) setOpen(true)
        }}
        onMouseDown={stopBubble}
        onPointerDown={stopBubble}
        placeholder={placeholder}
        autoCapitalize="none"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        name="edge-handle-search"
        data-1p-ignore
        data-lpignore="true"
        data-form-type="other"
        autoFocus={autoFocus}
        disabled={disabled}
        role="combobox"
        aria-expanded={Boolean(showList)}
        aria-controls={showList ? listId : undefined}
        aria-autocomplete="list"
        className={
          inputClassName ||
          'w-full min-h-12 rounded-2xl bg-zinc-800 px-4 text-white outline-none focus:ring-2 focus:ring-amber-500/40'
        }
        onKeyDown={(e) => {
          if (!showList) return
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setActiveIndex((i) => Math.min(i + 1, Math.max(suggestions.length - 1, 0)))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActiveIndex((i) => Math.max(i - 1, 0))
          } else if (e.key === 'Enter' && suggestions[activeIndex]) {
            e.preventDefault()
            pickProfile(suggestions[activeIndex])
          } else if (e.key === 'Escape') {
            e.preventDefault()
            closeList()
          }
        }}
      />

      {selectedProfile?.handle ? (
        <p className="mt-1.5 text-xs text-emerald-400">
          Selected @{normalizeHandle(selectedProfile.handle)}
          {selectedProfile.display_name ? ` · ${selectedProfile.display_name}` : ''}
        </p>
      ) : null}

      {showList ? (
        <ul
          id={listId}
          ref={listRef}
          role="listbox"
          data-edge-handle-typeahead-list
          className={`absolute left-0 right-0 overflow-y-auto overscroll-contain rounded-2xl border border-zinc-700 bg-zinc-900 py-1 shadow-2xl ${
            openUpward ? 'bottom-full mb-1' : 'top-full mt-1'
          }`}
          style={{ maxHeight: MAX_LIST_HEIGHT_PX, zIndex: Z_APP_ALERT + 1 }}
        >
          {loading && suggestions.length === 0 ? (
            <li className="px-4 py-3 text-sm text-zinc-500">Searching…</li>
          ) : null}
          {suggestions.map((profile, idx) => {
            const handle = normalizeHandle(profile.handle)
            const active = idx === activeIndex
            const initials = profileAvatarInitials(profile.display_name, profile.handle)
            const toneClass = profileAvatarToneClass(profile.user_id || profile.handle || '')
            return (
              <li key={profile.user_id} role="option" aria-selected={active}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault()
                    pickProfile(profile)
                  }}
                  className={`flex w-full items-center gap-3 px-3 py-2.5 text-left touch-manipulation ${
                    active ? 'bg-zinc-800' : 'active:bg-zinc-800/60'
                  }`}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-zinc-800 text-xs font-bold text-zinc-200">
                    {profile.avatar_url ? (
                      <img
                        src={profile.avatar_url}
                        alt=""
                        className="h-full w-full object-cover"
                        loading="eager"
                        decoding="async"
                      />
                    ) : (
                      <span
                        className={`flex h-full w-full items-center justify-center font-bold text-white ${toneClass}`}
                      >
                        {initials}
                      </span>
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-white">
                      {profile.display_name || `@${handle}`}
                    </span>
                    <span className="block truncate text-xs text-zinc-500">@{handle}</span>
                  </span>
                </button>
              </li>
            )
          })}
          {!loading && suggestions.length === 0 ? (
            <li className="px-4 py-3 text-sm text-zinc-500">No matching handles.</li>
          ) : null}
        </ul>
      ) : null}
    </div>
  )
}
