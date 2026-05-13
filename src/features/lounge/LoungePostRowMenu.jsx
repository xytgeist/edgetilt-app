import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * ⋮ overflow on a feed/profile post card (Edit/Delete for own, Block/Report for others).
 * Menu is portaled with `position: fixed` so feed rows (`content-visibility`, stacking) cannot cover it.
 */
export default function LoungePostRowMenu({
  isOwn,
  showEdit,
  deleteBusy,
  onEdit,
  onDelete,
  /** Moderator/admin: delete another user's post. */
  showStaffDelete,
  staffDeleteBusy,
  onStaffDelete,
  onBlock,
  onReport,
  /** Optional scroll root (e.g. main feed) to keep the fixed menu aligned while scrolling. */
  positionScrollRootRef,
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)
  const buttonRef = useRef(null)
  const panelRef = useRef(null)
  const [fixedStyle, setFixedStyle] = useState({ top: 0, right: 0 })

  const close = useCallback(() => setOpen(false), [])

  const updateFixedPosition = useCallback(() => {
    const btn = buttonRef.current
    if (!btn) return
    const r = btn.getBoundingClientRect()
    const vw = typeof document !== 'undefined' ? document.documentElement.clientWidth : 0
    setFixedStyle({ top: r.bottom + 4, right: Math.max(0, vw - r.right) })
  }, [])

  useLayoutEffect(() => {
    if (!open) return
    updateFixedPosition()
    const root = positionScrollRootRef?.current
    window.addEventListener('resize', updateFixedPosition)
    window.addEventListener('scroll', updateFixedPosition, { passive: true })
    root?.addEventListener('scroll', updateFixedPosition, { passive: true })
    return () => {
      window.removeEventListener('resize', updateFixedPosition)
      window.removeEventListener('scroll', updateFixedPosition)
      root?.removeEventListener('scroll', updateFixedPosition)
    }
  }, [open, positionScrollRootRef, updateFixedPosition])

  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      const t = e.target
      if (!(t instanceof Node)) return
      if (wrapRef.current?.contains(t)) return
      if (panelRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown, { passive: true })
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setOpen(false)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  const menuPanel = open ? (
    <div
      ref={panelRef}
      role="menu"
      className="fixed z-[200] min-w-[10.5rem] rounded-xl border border-zinc-700 bg-zinc-900 py-0.5 shadow-xl"
      style={{ top: fixedStyle.top, right: fixedStyle.right }}
    >
          {isOwn ? (
            <>
              {showEdit ? (
                <button
                  type="button"
                  role="menuitem"
                  className="block w-full px-3 py-1.5 text-left text-[15px] font-medium text-zinc-100 hover:bg-zinc-800 touch-manipulation"
                  onClick={(e) => {
                    e.stopPropagation()
                    close()
                    onEdit?.()
                  }}
                >
                  Edit
                </button>
              ) : null}
              <button
                type="button"
                role="menuitem"
                className="block w-full px-3 py-1.5 text-left text-[15px] font-medium text-rose-300 hover:bg-zinc-800 touch-manipulation disabled:opacity-50"
                disabled={deleteBusy}
                onClick={(e) => {
                  e.stopPropagation()
                  close()
                  onDelete?.()
                }}
              >
                Delete
              </button>
            </>
          ) : (
            <>
              {showStaffDelete ? (
                <button
                  type="button"
                  role="menuitem"
                  className="block w-full px-3 py-1.5 text-left text-[15px] font-medium text-rose-300 hover:bg-zinc-800 touch-manipulation disabled:opacity-50"
                  disabled={staffDeleteBusy}
                  onClick={(e) => {
                    e.stopPropagation()
                    close()
                    onStaffDelete?.()
                  }}
                >
                  Delete post
                </button>
              ) : null}
              <button
                type="button"
                role="menuitem"
                className="block w-full px-3 py-1.5 text-left text-[15px] font-medium text-zinc-100 hover:bg-zinc-800 touch-manipulation"
                onClick={(e) => {
                  e.stopPropagation()
                  close()
                  onBlock?.()
                }}
              >
                Block
              </button>
              <button
                type="button"
                role="menuitem"
                className="block w-full px-3 py-1.5 text-left text-[15px] font-medium text-zinc-100 hover:bg-zinc-800 touch-manipulation"
                onClick={(e) => {
                  e.stopPropagation()
                  close()
                  onReport?.()
                }}
              >
                Report
              </button>
            </>
          )}
        </div>
  ) : null

  return (
    <div ref={wrapRef} className="relative shrink-0" data-lounge-post-menu>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Post options"
        onClick={(e) => {
          e.stopPropagation()
          setOpen((o) => !o)
        }}
        className="flex h-6 w-6 touch-manipulation items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-800/90 hover:text-zinc-100 [-webkit-tap-highlight-color:transparent]"
      >
        <svg className="h-[14px] w-[14px]" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
          <circle cx="4" cy="10" r="1.35" />
          <circle cx="10" cy="10" r="1.35" />
          <circle cx="16" cy="10" r="1.35" />
        </svg>
      </button>
      {typeof document !== 'undefined' && menuPanel ? createPortal(menuPanel, document.body) : null}
    </div>
  )
}
