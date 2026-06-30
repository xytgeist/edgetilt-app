import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  PROFILE_LOCATION_MAX_LEN,
  ensureGlobalCityLocationIndex,
  filterLocationSuggestions,
  normalizeProfileLocation,
} from './profileLocation.js'

const inputClass =
  'mt-1 w-full min-h-11 rounded-xl border border-zinc-700 bg-zinc-900/80 px-3 text-[16px] text-zinc-100 outline-none focus:border-cyan-600/60 touch-manipulation placeholder:text-zinc-600'

const LIST_Z_INDEX = 200

/**
 * Searchable city picker: worldwide city database + quick picks; any text can be saved as custom.
 */
export default function ProfileLocationPicker({ value, onChange, disabled = false, className = '' }) {
  const listId = useId()
  const wrapRef = useRef(null)
  const inputRef = useRef(null)
  const listPanelRef = useRef(null)
  const touchStartYRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(-1)
  const [cityIndex, setCityIndex] = useState(null)
  const [indexErr, setIndexErr] = useState('')
  const [listPos, setListPos] = useState(null)

  useEffect(() => {
    let cancelled = false
    void ensureGlobalCityLocationIndex()
      .then((index) => {
        if (!cancelled) setCityIndex(index)
      })
      .catch(() => {
        if (!cancelled) setIndexErr('City search unavailable - you can still type any location.')
      })
    return () => {
      cancelled = true
    }
  }, [])

  const normalized = normalizeProfileLocation(value)
  const { quick, matches, useTyped } = useMemo(
    () => filterLocationSuggestions(normalized, cityIndex),
    [normalized, cityIndex],
  )

  const options = useMemo(() => {
    const rows = []
    if (useTyped) rows.push({ kind: 'typed', label: useTyped })
    for (const label of quick) rows.push({ kind: 'quick', label })
    for (const label of matches) rows.push({ kind: 'match', label })
    return rows
  }, [quick, matches, useTyped])

  const showList = open && !disabled && options.length > 0

  const pick = useCallback(
    (label) => {
      onChange(normalizeProfileLocation(label))
      setOpen(false)
      setHighlight(-1)
    },
    [onChange],
  )

  const updateListPos = useCallback(() => {
    const input = inputRef.current
    if (!input) return
    const r = input.getBoundingClientRect()
    const margin = 8
    const maxHeight = Math.min(224, Math.max(120, window.innerHeight - r.bottom - margin))
    setListPos({
      top: r.bottom + 4,
      left: r.left,
      width: r.width,
      maxHeight,
    })
  }, [])

  useLayoutEffect(() => {
    if (!showList) {
      setListPos(null)
      return
    }
    updateListPos()
    window.addEventListener('resize', updateListPos)
    window.addEventListener('scroll', updateListPos, true)
    return () => {
      window.removeEventListener('resize', updateListPos)
      window.removeEventListener('scroll', updateListPos, true)
    }
  }, [showList, updateListPos, options.length])

  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      const t = e.target
      if (!(t instanceof Node)) return
      if (wrapRef.current?.contains(t)) return
      if (listPanelRef.current?.contains(t)) return
      setOpen(false)
      setHighlight(-1)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown, { passive: true })
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
    }
  }, [open])

  const onOptionActivate = useCallback(
    (label) => {
      pick(label)
    },
    [pick],
  )

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      setOpen(false)
      setHighlight(-1)
      return
    }
    if (!showList) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight((h) => Math.min(h + 1, options.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight((h) => Math.max(h - 1, 0))
    } else if (e.key === 'Enter' && highlight >= 0 && options[highlight]) {
      e.preventDefault()
      pick(options[highlight].label)
    }
  }

  const listPanel =
    showList && listPos
      ? createPortal(
          <ul
            ref={listPanelRef}
            id={listId}
            role="listbox"
            className="overflow-y-auto overscroll-contain rounded-xl border border-zinc-600/90 bg-zinc-900/98 py-1 shadow-xl backdrop-blur-sm"
            style={{
              position: 'fixed',
              zIndex: LIST_Z_INDEX,
              top: listPos.top,
              left: listPos.left,
              width: listPos.width,
              maxHeight: listPos.maxHeight,
            }}
          >
            {options.map((row, index) => (
              <li key={`${row.kind}-${row.label}`} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={highlight === index}
                  className={`block w-full px-3 py-2.5 text-left text-[15px] touch-manipulation [-webkit-tap-highlight-color:transparent] ${
                    row.kind === 'typed'
                      ? 'font-semibold text-cyan-200'
                      : row.kind === 'quick'
                        ? 'font-medium text-zinc-100'
                        : 'text-zinc-200'
                  } ${highlight === index ? 'bg-zinc-800/95' : 'hover:bg-zinc-800/90'}`}
                  onMouseEnter={() => setHighlight(index)}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    onOptionActivate(row.label)
                  }}
                  onTouchStart={(e) => {
                    touchStartYRef.current = e.touches[0]?.clientY ?? null
                  }}
                  onTouchEnd={(e) => {
                    const startY = touchStartYRef.current
                    const endY = e.changedTouches[0]?.clientY
                    if (startY == null || endY == null) return
                    if (Math.abs(endY - startY) < 8) {
                      e.preventDefault()
                      onOptionActivate(row.label)
                    }
                  }}
                >
                  {row.kind === 'typed' ? `Use “${row.label}”` : row.label}
                  {row.kind === 'quick' ? (
                    <span className="ml-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                      Popular
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>,
          document.body,
        )
      : null

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      <input
        ref={inputRef}
        type="text"
        value={value}
        disabled={disabled}
        maxLength={PROFILE_LOCATION_MAX_LEN}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        role="combobox"
        aria-expanded={showList}
        aria-controls={showList ? listId : undefined}
        aria-autocomplete="list"
        placeholder="Search cities worldwide or type any location"
        className={inputClass}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          onChange(e.target.value.slice(0, PROFILE_LOCATION_MAX_LEN))
          setOpen(true)
          setHighlight(-1)
        }}
        onKeyDown={onKeyDown}
      />
      <span className="mt-1 block text-[12px] text-zinc-500 tabular-nums">
        {normalized.length}/{PROFILE_LOCATION_MAX_LEN}
        <span className="text-zinc-600">
          {cityIndex ? ' · worldwide city search' : ' · Loading cities…'}
          {' · or type a custom location'}
        </span>
      </span>
      {indexErr ? <p className="mt-1 text-[12px] text-amber-300/90">{indexErr}</p> : null}
      {listPanel}
    </div>
  )
}
