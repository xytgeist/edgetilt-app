import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Z_APP_ALERT } from '../../constants/appZIndex.js'
import { profileAvatarInitials } from '../profiles/profileGate.js'
import { searchEdgeProfilesByHandle } from './pokerStableApi.js'

const DEBOUNCE_MS = 120
const GAP_PX = 4
const VIEWPORT_PAD_PX = 8
const MAX_LIST_HEIGHT_PX = 208

function normalizeHandle(value) {
  return String(value || '').trim().replace(/^@+/, '')
}

/** @param {HTMLElement} inputEl @param {HTMLElement | null | undefined} listEl */
function measureDropdownPos(inputEl, listEl) {
  const rect = inputEl.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return null

  const vv = window.visualViewport
  const vTop = (vv?.offsetTop ?? 0) + VIEWPORT_PAD_PX
  const vBottom = (vv ? vv.offsetTop + vv.height : window.innerHeight) - VIEWPORT_PAD_PX
  const vWidth = vv?.width ?? window.innerWidth
  const vLeft = (vv?.offsetLeft ?? 0) + VIEWPORT_PAD_PX

  const listHeight = Math.min(listEl?.offsetHeight || MAX_LIST_HEIGHT_PX, MAX_LIST_HEIGHT_PX)
  const spaceBelow = Math.max(0, vBottom - rect.bottom - GAP_PX)
  const spaceAbove = Math.max(0, rect.top - vTop - GAP_PX)
  const openUp = listHeight > 0 && spaceBelow < 120 && spaceAbove > spaceBelow

  const maxHeight = Math.max(80, Math.min(MAX_LIST_HEIGHT_PX, openUp ? spaceAbove : spaceBelow))
  let top = openUp ? rect.top - GAP_PX - maxHeight : rect.bottom + GAP_PX
  top = Math.max(vTop, Math.min(top, vBottom - maxHeight))

  const width = Math.min(rect.width, vWidth - VIEWPORT_PAD_PX * 2)
  let left = rect.left
  left = Math.max(vLeft, Math.min(left, vLeft + vWidth - VIEWPORT_PAD_PX - width))

  return {
    position: 'fixed',
    top,
    left,
    width,
    maxHeight,
    zIndex: Z_APP_ALERT + 1,
  }
}

/**
 * Inline @handle typeahead for Stable flows.
 * Dropdown portals to body so it is not clipped by sheet overflow.
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
  const listPortalRef = useRef(null)
  const debounceRef = useRef(0)
  const fetchGenRef = useRef(0)

  const [suggestions, setSuggestions] = useState([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [menuStyle, setMenuStyle] = useState(/** @type {React.CSSProperties | null} */ (null))

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
    setMenuStyle(null)
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
    if (!showList) {
      setMenuStyle(null)
      return undefined
    }

    const update = () => {
      const input = inputRef.current
      if (!input) return
      const pos = measureDropdownPos(input, listPortalRef.current)
      if (pos) setMenuStyle(pos)
    }

    update()
    const raf = requestAnimationFrame(update)

    const vv = window.visualViewport
    vv?.addEventListener('resize', update)
    vv?.addEventListener('scroll', update)
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)

    const input = inputRef.current
    const ro = typeof ResizeObserver !== 'undefined' && input ? new ResizeObserver(update) : null
    ro?.observe(input)

    return () => {
      cancelAnimationFrame(raf)
      vv?.removeEventListener('resize', update)
      vv?.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
      ro?.disconnect()
    }
  }, [showList, suggestions.length, loading, activeIndex, normalizedValue])

  useEffect(() => {
    if (!open) return undefined
    const onDocPointerDown = (e) => {
      const target = e.target
      if (!(target instanceof Node)) return
      if (containerRef.current?.contains(target)) return
      if (listPortalRef.current?.contains(target)) return
      closeList()
    }
    document.addEventListener('pointerdown', onDocPointerDown)
    return () => document.removeEventListener('pointerdown', onDocPointerDown)
  }, [open, closeList])

  const stopBubble = (e) => {
    e.stopPropagation()
  }

  const listNode =
    showList && menuStyle ? (
      <ul
        id={listId}
        ref={listPortalRef}
        role="listbox"
        data-edge-handle-typeahead-list
        style={menuStyle}
        className="overflow-y-auto overscroll-contain rounded-2xl border border-zinc-700 bg-zinc-900 py-1 shadow-2xl"
      >
        {loading && suggestions.length === 0 ? (
          <li className="px-4 py-3 text-sm text-zinc-500">Searching…</li>
        ) : null}
        {suggestions.map((profile, idx) => {
          const handle = normalizeHandle(profile.handle)
          const active = idx === activeIndex
          return (
            <li key={profile.user_id} role="option" aria-selected={active}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault()
                  pickProfile(profile)
                }}
                className={`flex w-full items-center gap-3 px-3 py-2.5 text-left touch-manipulation ${
                  active ? 'bg-amber-600/20' : 'active:bg-zinc-800'
                }`}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-700 text-xs font-bold text-zinc-200">
                  {profileAvatarInitials(profile.display_name, profile.handle)}
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
    ) : null

  return (
    <div ref={containerRef} className="relative" onMouseDown={stopBubble} onPointerDown={stopBubble}>
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

      {typeof document !== 'undefined' && listNode ? createPortal(listNode, document.body) : null}
    </div>
  )
}
