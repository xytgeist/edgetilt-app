import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { profileAvatarToneClass, profileAvatarInitials } from '../profiles/profileGate'
import { getComposerCaretClientRect, isRichComposerElement } from './loungeRichComposerDom.js'

/**
 * Autocomplete dropdown for @mention suggestions.
 * Renders into document.body via portal (escapes any overflow:hidden ancestor).
 * Opens below the caret when `caretFieldRef` is set; otherwise below the anchor.
 * Flips above if it would overflow the viewport bottom.
 *
 * Props:
 *   suggestions  – array of profile rows { user_id, handle, display_name, avatar_url }
 *   activeIndex  – currently highlighted row index (controlled by parent)
 *   loading      – show a loading shimmer
 *   onSelect     – (profile) => void
 *   anchorRef    – ref to the element to position relative to (the relative wrapper div)
 *   caretFieldRef – optional contenteditable composer root; dropdown anchors to caret
 *   zIndex       – CSS z-index value (number, default 9999)
 */
export default function LoungeMentionDropdown({
  suggestions = [],
  activeIndex = 0,
  loading = false,
  onSelect,
  anchorRef,
  caretFieldRef,
  zIndex = 9999,
}) {
  const ref = useRef(null)
  const listRef = useRef(null)
  const [pos, setPos] = useState(null) // { top, left, width } fixed coords

  useLayoutEffect(() => {
    if (!anchorRef?.current || !ref.current) return

    const updatePos = () => {
      if (!anchorRef?.current || !ref.current) return
      const anchor = anchorRef.current.getBoundingClientRect()
      const field = caretFieldRef?.current
      const caret =
        field && isRichComposerElement(field) ? getComposerCaretClientRect(field) : null
      const dropH = ref.current.offsetHeight
      const gap = 4
      const anchorTop = caret ? caret.bottom : anchor.bottom
      const anchorLeft = caret ? caret.left : anchor.left
      const flipTop = caret ? caret.top : anchor.top
      const spaceBelow = window.innerHeight - anchorTop - gap
      const openUp = spaceBelow < dropH && flipTop > dropH + gap
      setPos({
        left: Math.max(anchor.left, Math.min(anchorLeft, anchor.right - 120)),
        width: anchor.width,
        top: openUp ? flipTop - dropH - gap : anchorTop + gap,
      })
    }

    updatePos()
    window.addEventListener('resize', updatePos)
    window.addEventListener('scroll', updatePos, true)
    return () => {
      window.removeEventListener('resize', updatePos)
      window.removeEventListener('scroll', updatePos, true)
    }
  }, [suggestions.length, loading, activeIndex, anchorRef, caretFieldRef])

  // Keep highlighted row inside the list without scrolling the Lounge feed.
  useEffect(() => {
    const list = listRef.current
    const el = list?.querySelector(`[data-mention-idx="${activeIndex}"]`)
    if (!list || !el) return
    const listRect = list.getBoundingClientRect()
    const rowRect = el.getBoundingClientRect()
    if (rowRect.top < listRect.top) {
      list.scrollTop -= listRect.top - rowRect.top
    } else if (rowRect.bottom > listRect.bottom) {
      list.scrollTop += rowRect.bottom - listRect.bottom
    }
  }, [activeIndex])

  // Trap wheel/touch so gestures never chain to the Lounge feed under the fixed portal.
  useEffect(() => {
    const list = listRef.current
    if (!list) return undefined

    const onWheel = (e) => {
      e.stopPropagation()
      const canScroll = list.scrollHeight > list.clientHeight + 1
      if (!canScroll) {
        e.preventDefault()
        return
      }
      const { scrollTop, scrollHeight, clientHeight } = list
      const delta = e.deltaY
      const atTop = scrollTop <= 0 && delta < 0
      const atBottom = scrollTop + clientHeight >= scrollHeight - 1 && delta > 0
      if (atTop || atBottom) e.preventDefault()
    }

    let touchStartY = 0
    const onTouchStart = (e) => {
      touchStartY = e.touches[0]?.clientY ?? 0
    }
    const onTouchMove = (e) => {
      e.stopPropagation()
      const canScroll = list.scrollHeight > list.clientHeight + 1
      if (!canScroll) {
        e.preventDefault()
        return
      }
      const y = e.touches[0]?.clientY ?? touchStartY
      const delta = touchStartY - y
      const { scrollTop, scrollHeight, clientHeight } = list
      const atTop = scrollTop <= 0 && delta < 0
      const atBottom = scrollTop + clientHeight >= scrollHeight - 1 && delta > 0
      if (atTop || atBottom) e.preventDefault()
    }

    list.addEventListener('wheel', onWheel, { passive: false })
    list.addEventListener('touchstart', onTouchStart, { passive: true })
    list.addEventListener('touchmove', onTouchMove, { passive: false })
    return () => {
      list.removeEventListener('wheel', onWheel)
      list.removeEventListener('touchstart', onTouchStart)
      list.removeEventListener('touchmove', onTouchMove)
    }
  }, [suggestions.length, loading])

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
      onTouchMove={(e) => {
        // Portal is outside the feed tree; still stop bubbling to window listeners.
        e.stopPropagation()
      }}
    >
      {loading && suggestions.length === 0 ? (
        <div className="px-3 py-2.5 text-[13px] text-zinc-500">Searching…</div>
      ) : (
        <div
          ref={listRef}
          className="max-h-[min(40vh,14rem)] overflow-y-auto overscroll-contain touch-pan-y [-webkit-overflow-scrolling:touch]"
          style={{ overscrollBehavior: 'contain' }}
        >
          {suggestions.map((profile, i) => {
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
                <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-zinc-800 text-[12px] font-bold text-zinc-200">
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
          })}
        </div>
      )}
    </div>
  )

  return createPortal(content, document.body)
}
