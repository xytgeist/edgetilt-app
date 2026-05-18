import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { profileAvatarToneClass, profileAvatarInitials } from '../profiles/profileGate'

/**
 * Autocomplete dropdown for @mention suggestions.
 * Opens downward by default; flips upward if it would overflow the viewport bottom.
 *
 * Props:
 *   suggestions  – array of profile rows { user_id, handle, display_name, avatar_url }
 *   activeIndex  – currently highlighted row index (controlled by parent)
 *   loading      – show a loading shimmer
 *   onSelect     – (profile) => void — called when a row is tapped/clicked
 *   portalClass  – extra z-index class (e.g. 'z-[132]')
 */
export default function LoungeMentionDropdown({
  suggestions = [],
  activeIndex = 0,
  loading = false,
  onSelect,
  portalClass = 'z-[132]',
}) {
  const ref = useRef(null)
  const [openUp, setOpenUp] = useState(false)

  // Flip upward if the dropdown would overflow the viewport bottom.
  // useLayoutEffect fires before paint so there's no visible flash.
  useLayoutEffect(() => {
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    setOpenUp(rect.bottom > window.innerHeight - 8)
  }, [suggestions.length, loading])

  // Scroll the active row into view inside the dropdown list
  useEffect(() => {
    const el = ref.current?.querySelector(`[data-mention-idx="${activeIndex}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  if (!loading && suggestions.length === 0) return null

  const positionClass = openUp ? 'bottom-full mb-1' : 'top-full mt-1'

  return (
    <div
      ref={ref}
      role="listbox"
      aria-label="Mention suggestions"
      className={`absolute left-0 right-0 overflow-hidden rounded-xl border border-zinc-700/80 bg-zinc-900/98 shadow-2xl backdrop-blur-sm ${positionClass} ${portalClass}`}
    >
      {loading && suggestions.length === 0 ? (
        <div className="px-3 py-2.5 text-[13px] text-zinc-500">Searching…</div>
      ) : (
        suggestions.map((profile, i) => {
          const isActive = i === activeIndex
          const initials = profileAvatarInitials(
            profile.display_name || '',
            profile.handle || ''
          )
          const toneClass = profileAvatarToneClass(profile.user_id || profile.handle || '')
          return (
            <button
              key={profile.user_id || profile.handle}
              data-mention-idx={i}
              type="button"
              role="option"
              aria-selected={isActive}
              onMouseDown={(e) => {
                // mousedown fires before blur; prevent textarea blur
                e.preventDefault()
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
                <span className="block truncate text-[12px] leading-tight text-orange-400">
                  @{profile.handle}
                </span>
              </span>
            </button>
          )
        })
      )}
    </div>
  )
}
