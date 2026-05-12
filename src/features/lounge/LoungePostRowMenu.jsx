import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * ⋮ overflow on a feed/profile post card (Edit/Delete for own, Block/Report for others).
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
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  const close = useCallback(() => setOpen(false), [])

  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      const el = wrapRef.current
      if (el && e.target instanceof Node && el.contains(e.target)) return
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

  return (
    <div ref={wrapRef} className="relative shrink-0" data-lounge-post-menu>
      <button
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
      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-[30] mt-0.5 min-w-[10.5rem] rounded-xl border border-zinc-700 bg-zinc-900 py-0.5 shadow-xl"
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
      ) : null}
    </div>
  )
}
