import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Z_APP_ALERT } from '../../constants/appZIndex.js'
import { profileAvatarInitials } from '../profiles/profileGate.js'
import { searchEdgeProfilesByHandle } from './pokerStableApi.js'

const DEBOUNCE_MS = 120

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

  const closeList = useCallback(() => {
    fetchGenRef.current += 1
    window.clearTimeout(debounceRef.current)
    setOpen(false)
    setSuggestions([])
    setLoading(false)
    setActiveIndex(0)
    setMenuStyle(null)
  }, [])

  const updateMenuPosition = useCallback(() => {
    const el = inputRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return
    const maxHeight = 208
    const spaceBelow = window.innerHeight - rect.bottom - 8
    const spaceAbove = rect.top - 8
    const openUp = spaceBelow < 160 && spaceAbove > spaceBelow
    const height = Math.min(maxHeight, openUp ? spaceAbove - 4 : spaceBelow - 4)

    setMenuStyle({
      position: 'fixed',
      left: rect.left,
      width: rect.width,
      maxHeight: Math.max(height, 120),
      zIndex: Z_APP_ALERT + 1,
      ...(openUp
        ? { bottom: window.innerHeight - rect.top + 4 }
        : { top: rect.bottom + 4 }),
    })
  }, [])

  const pickProfile = useCallback(
    (profile) => {
      if (!profile) return
      const handle = String(profile.handle || '').replace(/^@+/, '')
      onChange(handle)
      onSelectProfile?.(profile)
      closeList()
      inputRef.current?.blur()
    },
    [onChange, onSelectProfile, closeList],
  )

  useEffect(() => {
    if (!supabaseClient || disabled) {
      closeList()
      return undefined
    }
    const q = String(value || '').trim()
    if (q.length < 1) {
      closeList()
      return undefined
    }

    setOpen(true)
    setLoading(true)
    window.clearTimeout(debounceRef.current)
    const gen = (fetchGenRef.current += 1)
    debounceRef.current = window.setTimeout(() => {
      void searchEdgeProfilesByHandle(supabaseClient, q, { excludeUserId }).then(({ profiles, error }) => {
        if (fetchGenRef.current !== gen) return
        if (error) {
          setSuggestions([])
          setLoading(false)
          return
        }
        setSuggestions(profiles)
        setActiveIndex(0)
        setLoading(false)
      })
    }, DEBOUNCE_MS)

    return () => window.clearTimeout(debounceRef.current)
  }, [supabaseClient, value, excludeUserId, disabled, closeList])

  const showList = open && (loading || suggestions.length > 0 || String(value || '').trim().length >= 1)

  useEffect(() => {
    if (!showList) {
      setMenuStyle(null)
      return undefined
    }
    updateMenuPosition()
    const onReflow = () => updateMenuPosition()
    window.addEventListener('scroll', onReflow, true)
    window.addEventListener('resize', onReflow)
    return () => {
      window.removeEventListener('scroll', onReflow, true)
      window.removeEventListener('resize', onReflow)
    }
  }, [showList, updateMenuPosition, suggestions.length, loading])

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
        className="pointer-events-none overflow-y-auto rounded-2xl border border-zinc-700 bg-zinc-900 py-1 shadow-2xl"
      >
        {loading && suggestions.length === 0 ? (
          <li className="pointer-events-none px-4 py-3 text-sm text-zinc-500">Searching…</li>
        ) : null}
        {suggestions.map((profile, idx) => {
          const handle = String(profile.handle || '').replace(/^@+/, '')
          const active = idx === activeIndex
          return (
            <li key={profile.user_id} role="option" aria-selected={active} className="pointer-events-auto">
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pickProfile(profile)}
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
          <li className="pointer-events-none px-4 py-3 text-sm text-zinc-500">No matching handles.</li>
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
          if (String(value || '').trim().length >= 1) setOpen(true)
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
          Selected @{String(selectedProfile.handle).replace(/^@+/, '')}
          {selectedProfile.display_name ? ` · ${selectedProfile.display_name}` : ''}
        </p>
      ) : null}

      {typeof document !== 'undefined' && listNode ? createPortal(listNode, document.body) : null}
    </div>
  )
}
