import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { profileAvatarToneClass, profileAvatarInitials } from '../profiles/profileGate'

/**
 * Autocomplete dropdown for @mention suggestions.
 * Renders into document.body via portal (escapes any overflow:hidden ancestor).
 * Opens below the anchor by default; flips above if it would overflow the viewport bottom.
 *
 * Props:
 *   suggestions  – array of profile rows { user_id, handle, display_name, avatar_url }
 *   activeIndex  – currently highlighted row index (controlled by parent)
 *   loading      – show a loading shimmer
 *   onSelect     – (profile) => void
 *   anchorRef    – ref to the element to position relative to (the relative wrapper div)
 *   zIndex       – CSS z-index value (number, default 9999)
 */
export default function LoungeMentionDropdown({
  suggestions = [],
  activeIndex = 0,
  loading = false,
  onSelect,
  anchorRef,
  zIndex = 9999,
}) {
  const ref = useRef(null)
  const [pos, setPos] = useState(null) // { top, left, width } fixed coords

  // Position the portal dropdown relative to the anchor after each render.
  // useLayoutEffect fires before paint — no visible flash.
  useLayoutEffect(() => {
    if (!anchorRef?.current || !ref.current) return
    const anchor = anchorRef.current.getBoundingClientRect()
    const dropH = ref.current.offsetHeight
    const gap = 4
    const spaceBelow = window.innerHeight - anchor.bottom - gap
    const openUp = spaceBelow < dropH && anchor.top > dropH + gap
    setPos({
      left: anchor.left,
      width: anchor.width,
      top: openUp ? anchor.top - dropH - gap : anchor.bottom + gap,
    })
  }, [suggestions.length, loading, anchorRef])

  // Scroll the active row into view
  useEffect(() => {
    const el = ref.current?.querySelector(`[data-mention-idx="${activeIndex}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  if (!loading && suggestions.length === 0) return null

  const content = (
    <div
      ref={ref}
      role="listbox"
      aria-label="Mention suggestions"
      style={{
        position: 'fixed',
        zIndex,
        left: pos?.left ?? -9999,
        top: pos?.top ?? -9999,
        width: pos?.width ?? 'auto',
        // Hidden until positioned to avoid a 1-frame flash at (0,0)
        visibility: pos ? 'visible' : 'hidden',
      }}
      className="overflow-hidden rounded-xl border border-zinc-700/80 bg-zinc-900/98 shadow-2xl backdrop-blur-sm"
    >
      {loading && suggestions.length === 0 ? (
        <div className="px-3 py-2.5 text-[13px] text-zinc-500">Searching…</div>
      ) : (
        suggestions.map((profile, i) => {
          const isActive = i === activeIndex
          const initials = profileAvatarInitials(profile.display_name || '', profile.handle || '')
          const toneClass = profileAvatarToneClass(profile.user_id || profile.handle || '')
          return (
            <button
              key={profile.user_id || profile.handle}
              data-mention-idx={i}
              type="button"
              role="option"
              aria-selected={isActive}
              onMouseDown={(e) => {
                e.preventDefault() // prevent textarea blur before onSelect fires
                onSelect?.(profile)
              }}
              className={`flex w-full items-center gap-2.5 px-3 py-2 text-left touch-manipulation [-webkit-tap-highlight-color:transparent] ${
                isActive ? 'bg-zinc-800' : 'hover:bg-zinc-800/60'
              }`}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-zinc-700 bg-zinc-800 text-[12px] font-bold text-zinc-200">
                {profile.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt=""
                    className="h-full w-full object-cover"
                    loading="eager"
                    decoding="async"
                  />
                ) : (
                  <span className={`flex h-full w-full items-center justify-center font-bold text-white ${toneClass}`}>
                    {initials}
                  </span>
                )}
              </span>
              <span className="min-w-0 flex-1">
                {profile.display_name ? (
                  <span className="block truncate text-[13px] font-semibold leading-tight text-zinc-100">
                    {profile.display_name}
                  </span>
                ) : null}
                <span className="block truncate text-[12px] leading-tight text-[#fd4506]">
                  @{profile.handle}
                </span>
              </span>
            </button>
          )
        })
      )}
    </div>
  )

  return createPortal(content, document.body)
}
