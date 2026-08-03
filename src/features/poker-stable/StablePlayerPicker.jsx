import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Z_APP_ALERT } from '../../constants/appZIndex.js'
import { profileAvatarInitials, profileAvatarToneClass } from '../profiles/profileGate.js'
import { fetchEdgeUserDirectoryPickerData } from '../play-logbook/playLogApi.js'
import { schedulePokerStableFieldScroll } from './pokerStableSheetScroll.js'
import { usePickerListTapSelect } from './pokerStablePickerTap.js'
import { edgeProfileDisplayName } from './pokerStableTerms.js'

const GAP_PX = 4
const MAX_LIST_HEIGHT_PX = 280

function normalizeHandle(value) {
  return String(value || '').trim().replace(/^@+/, '')
}

/** @param {object[]} rows @param {string} query */
function filterProfiles(rows, query) {
  const q = String(query || '')
    .trim()
    .toLowerCase()
    .replace(/^@+/, '')
  if (!q) return rows
  return rows.filter((profile) => {
    const name = String(profile?.display_name || '').toLowerCase()
    const handle = normalizeHandle(profile?.handle).toLowerCase()
    return name.includes(q) || handle.includes(q)
  })
}

/**
 * Backer Create Stake player field: guest row, Connections, then Everyone.
 */
export default function StablePlayerPicker({
  supabaseClient,
  userId,
  value,
  onChange,
  selectedProfile = null,
  isGuest = false,
  guestLabel = '',
  onSelectProfile,
  onSelectGuestMode,
  onClearSelection,
  placeholder = 'Select player',
  guestRowTitle = 'Guest player (not on Edge)',
  guestRowSubtitle = 'Enter name and optional contact info',
  lockedGuestFallback = 'Guest player (not on Edge)',
  inputName = 'stable-player-picker',
  disabled = false,
  inputClassName = '',
  autoFocus = false,
}) {
  const listId = useId()
  const containerRef = useRef(null)
  const inputRef = useRef(null)
  const listRef = useRef(null)
  const suppressOpenOnFocusRef = useRef(Boolean(autoFocus))

  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [candidates, setCandidates] = useState([])
  const [connectionIds, setConnectionIds] = useState(() => new Set())
  const [loadedOnce, setLoadedOnce] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [openUpward, setOpenUpward] = useState(false)
  const { bindRowSelect, listPointerProps } = usePickerListTapSelect(listRef)

  const normalizedValue = normalizeHandle(value)
  const selectedHandle = normalizeHandle(selectedProfile?.handle)
  const isLockedEdge =
    !isGuest && Boolean(selectedHandle && normalizedValue === selectedHandle)
  const isLockedGuest = isGuest
  const isLockedSelection = isLockedEdge || isLockedGuest

  const lockedDisplayValue = isLockedEdge
    ? edgeProfileDisplayName(selectedProfile)
    : isLockedGuest
      ? lockedGuestFallback
      : ''
  const inputValue = isLockedSelection ? lockedDisplayValue : (value ?? '')

  const searchQuery = isLockedSelection ? '' : String(value ?? '')

  const filteredConnections = useMemo(() => {
    const rows = candidates.filter((p) => connectionIds.has(String(p.user_id || '')))
    return filterProfiles(rows, searchQuery)
  }, [candidates, connectionIds, searchQuery])

  const filteredEveryoneElse = useMemo(() => {
    const rows = candidates.filter((p) => !connectionIds.has(String(p.user_id || '')))
    return filterProfiles(rows, searchQuery)
  }, [candidates, connectionIds, searchQuery])

  const selectableRows = useMemo(
    () => [{ kind: 'guest' }, ...filteredConnections, ...filteredEveryoneElse],
    [filteredConnections, filteredEveryoneElse],
  )

  const closeList = useCallback(() => {
    setOpen(false)
    setActiveIndex(0)
    setOpenUpward(false)
  }, [])

  const showList = open && !disabled

  const loadDirectory = useCallback(async () => {
    if (!supabaseClient || !userId || loadedOnce) return
    setLoading(true)
    setLoadError('')
    try {
      const data = await fetchEdgeUserDirectoryPickerData(supabaseClient, userId)
      if (data.error && !(data.candidates || []).length) {
        setLoadError(data.error)
        setCandidates([])
        setConnectionIds(new Set())
      } else {
        if (data.error) setLoadError(data.error)
        else setLoadError('')
        setCandidates(data.candidates || [])
        setConnectionIds(
          data.connectionIds instanceof Set
            ? data.connectionIds
            : new Set((data.candidates || []).map((p) => String(p.user_id || '')).filter(Boolean)),
        )
      }
      setLoadedOnce(true)
    } catch (e) {
      setLoadError(e?.message || 'Could not load players.')
      setCandidates([])
      setConnectionIds(new Set())
      setLoadedOnce(true)
    } finally {
      setLoading(false)
    }
  }, [supabaseClient, userId, loadedOnce])

  const scrollFieldIntoView = useCallback(() => {
    schedulePokerStableFieldScroll(inputRef.current, listRef.current)
  }, [])

  const pickGuest = useCallback(() => {
    const draftLabel = String(value ?? '').trim()
    onSelectGuestMode?.(draftLabel)
    closeList()
    suppressOpenOnFocusRef.current = true
    requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }))
  }, [onSelectGuestMode, closeList, value])

  const pickProfile = useCallback(
    (profile) => {
      if (!profile?.user_id || profile.user_id === userId) return
      const handle = normalizeHandle(profile.handle)
      onChange(handle)
      onSelectProfile?.(profile)
      closeList()
      suppressOpenOnFocusRef.current = true
      requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }))
    },
    [onChange, onSelectProfile, closeList, userId],
  )

  const activateRow = useCallback(
    (row) => {
      if (!row) return
      if (row.kind === 'guest') pickGuest()
      else pickProfile(row)
    },
    [pickGuest, pickProfile],
  )

  useEffect(() => {
    if (!showList) return undefined
    void loadDirectory()
    return undefined
  }, [showList, loadDirectory])

  useLayoutEffect(() => {
    if (!showList) return undefined

    const updatePlacement = () => {
      const input = inputRef.current
      const list = listRef.current
      if (!input) return
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
    window.addEventListener('resize', updatePlacement)
    return () => {
      cancelAnimationFrame(raf)
      vv?.removeEventListener('resize', updatePlacement)
      window.removeEventListener('resize', updatePlacement)
    }
  }, [showList, selectableRows.length, loading, activeIndex])

  useLayoutEffect(() => {
    if (!showList || openUpward) return undefined
    const sheet = containerRef.current?.closest('[data-poker-stable-sheet]')
    if (!sheet) return undefined
    const prevPaddingBottom = sheet.style.paddingBottom
    sheet.style.paddingBottom = `${MAX_LIST_HEIGHT_PX + GAP_PX}px`
    return () => {
      sheet.style.paddingBottom = prevPaddingBottom
    }
  }, [showList, openUpward])

  useEffect(() => {
    if (!open) return undefined
    const onDocPointerDown = (e) => {
      const target = e.target
      if (!(target instanceof Node)) return
      if (containerRef.current?.contains(target)) return
      closeList()
    }
    // Capture phase: sheet stopPropagation must not block outside-close within the modal.
    document.addEventListener('pointerdown', onDocPointerDown, true)
    return () => document.removeEventListener('pointerdown', onDocPointerDown, true)
  }, [open, closeList])

  useEffect(() => {
    setActiveIndex(0)
  }, [searchQuery, showList])

  function renderProfileRow(profile, rowIndex) {
    const handle = normalizeHandle(profile.handle)
    const active = activeIndex === rowIndex
    const initials = profileAvatarInitials(profile.display_name, profile.handle)
    const toneClass = profileAvatarToneClass(profile.user_id || profile.handle || '')
    return (
      <li key={profile.user_id} role="option" aria-selected={active}>
        <button
          type="button"
          {...bindRowSelect(() => pickProfile(profile))}
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
  }

  return (
    <div
      ref={containerRef}
      className={`relative ${showList ? 'z-[131]' : ''}`}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <input
        ref={inputRef}
        type="text"
        value={inputValue}
        readOnly={isLockedSelection}
        onChange={(e) => {
          if (isLockedSelection) return
          onChange(e.target.value)
          setOpen(true)
        }}
        onFocus={() => {
          if (disabled) return
          if (suppressOpenOnFocusRef.current) {
            suppressOpenOnFocusRef.current = false
            return
          }
          setOpen(true)
          scrollFieldIntoView()
        }}
        onClick={() => {
          if (disabled) return
          if (isLockedSelection) {
            onClearSelection?.()
            onChange('')
            setOpen(true)
            scrollFieldIntoView()
            return
          }
          setOpen(true)
        }}
        placeholder={placeholder}
        autoCapitalize="none"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        name={inputName}
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
          if (!showList) {
            if (e.key === 'ArrowDown' || e.key === 'Enter') {
              e.preventDefault()
              setOpen(true)
            }
            return
          }
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setActiveIndex((i) => Math.min(i + 1, Math.max(selectableRows.length - 1, 0)))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActiveIndex((i) => Math.max(i - 1, 0))
          } else if (e.key === 'Enter') {
            e.preventDefault()
            activateRow(selectableRows[activeIndex])
          } else if (e.key === 'Escape') {
            e.preventDefault()
            closeList()
          }
        }}
      />

      {showList ? (
        <ul
          id={listId}
          ref={listRef}
          role="listbox"
          data-edge-handle-typeahead-list
          data-stable-player-picker-list
          {...listPointerProps}
          className={`absolute left-0 right-0 overflow-y-auto overscroll-contain rounded-2xl border border-zinc-700 bg-zinc-900 py-1 shadow-2xl ${
            openUpward ? 'bottom-full mb-1' : 'top-full mt-1'
          }`}
          style={{ maxHeight: MAX_LIST_HEIGHT_PX, zIndex: Z_APP_ALERT + 1 }}
        >
          <li role="option" aria-selected={activeIndex === 0}>
            <button
              type="button"
              {...bindRowSelect(pickGuest)}
              className={`flex w-full items-center gap-3 px-3 py-2.5 text-left touch-manipulation ${
                activeIndex === 0 ? 'bg-zinc-800' : 'active:bg-zinc-800/60'
              }`}
              data-stable-player-picker-guest
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-lg font-bold text-zinc-400">
                ?
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-white">
                  {guestRowTitle}
                </span>
                <span className="block truncate text-xs text-zinc-500">{guestRowSubtitle}</span>
              </span>
            </button>
          </li>

          {loading ? (
            <li className="px-4 py-3 text-sm text-zinc-500">Loading players…</li>
          ) : null}

          {!loading && loadError && candidates.length === 0 ? (
            <li className="px-4 py-3 text-sm text-rose-300">{loadError}</li>
          ) : null}

          {!loading && filteredConnections.length > 0 ? (
            <>
              <li
                className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wide text-zinc-500"
                aria-hidden
              >
                Connections
              </li>
              {filteredConnections.map((profile, i) => renderProfileRow(profile, 1 + i))}
            </>
          ) : null}

          {!loading && filteredEveryoneElse.length > 0 ? (
            <>
              <li
                className={`px-3 pb-1 text-[10px] font-bold uppercase tracking-wide text-zinc-500 ${
                  filteredConnections.length > 0 ? 'mt-1 border-t border-zinc-800/80 pt-2' : 'pt-2'
                }`}
                aria-hidden
              >
                Everyone
              </li>
              {filteredEveryoneElse.map((profile, i) =>
                renderProfileRow(profile, 1 + filteredConnections.length + i),
              )}
            </>
          ) : null}

          {!loading &&
          !loadError &&
          filteredConnections.length === 0 &&
          filteredEveryoneElse.length === 0 &&
          searchQuery.trim() ? (
            <li className="px-4 py-3 text-sm text-zinc-500">No matching Edge users.</li>
          ) : null}
        </ul>
      ) : null}
    </div>
  )
}
