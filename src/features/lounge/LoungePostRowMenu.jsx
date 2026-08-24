import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Ban, Flag, Pencil, Pin, Share2, Trash2 } from 'lucide-react'

const MENU_ITEM_CLASS =
  'flex w-full items-center gap-3 px-3.5 py-2.5 text-left text-[15px] font-medium touch-manipulation hover:bg-zinc-800/90 active:bg-zinc-800 disabled:opacity-50 [-webkit-tap-highlight-color:transparent]'
const MENU_ICON_CLASS = 'h-[18px] w-[18px] shrink-0 text-zinc-400'

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
  /** Share / copy permalink (allowed when read-only). */
  onShare,
  /** Moderator/admin: pin or unpin this post on the home feed. */
  showPin,
  pinned,
  pinBusy,
  onPinToggle,
  /** Author: pin one own post to the top of their profile Posts tab. */
  showProfilePin,
  profilePinned,
  profilePinBusy,
  onProfilePinToggle,
  /** Optional scroll root (e.g. main feed) to keep the fixed menu aligned while scrolling. */
  positionScrollRootRef,
  /** Accessible name for the ⋯ control (e.g. "Comment options"). */
  menuAriaLabel = 'Post options',
  /** When set, prepends autoplay toggle (Stream video lightbox). */
  showAutoplayToggle = false,
  feedVideoAutoplayEnabled = false,
  onFeedVideoAutoplayChange,
  menuButtonClassName = 'flex h-6 w-6 touch-manipulation items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-800/90 hover:text-zinc-100 [-webkit-tap-highlight-color:transparent]',
  /** Optional class for the ⋯ glyph (e.g. larger dots in a title bar). */
  menuDotsClassName = 'h-[14px] w-[14px]',
  /** Controlled open (e.g. post detail Back closes the menu first). */
  open: openProp,
  onOpenChange,
}) {
  const [internalOpen, setInternalOpen] = useState(false)
  const controlled = openProp != null
  const open = controlled ? Boolean(openProp) : internalOpen
  const setOpen = useCallback(
    (updater) => {
      const prev = controlled ? Boolean(openProp) : internalOpen
      const next = typeof updater === 'function' ? updater(prev) : updater
      if (!controlled) setInternalOpen(next)
      onOpenChange?.(next)
    },
    [controlled, internalOpen, onOpenChange, openProp],
  )
  const wrapRef = useRef(null)
  const buttonRef = useRef(null)
  const panelRef = useRef(null)
  const [fixedStyle, setFixedStyle] = useState({ top: 0, right: 0 })

  const close = useCallback(() => setOpen(false), [setOpen])

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
      data-lounge-post-row-menu
      className="fixed z-[200] min-w-[12.5rem] overflow-hidden rounded-2xl border border-zinc-700/90 bg-zinc-900/98 py-1 shadow-[0_12px_40px_rgba(0,0,0,0.45)] backdrop-blur-xl"
      style={{ top: fixedStyle.top, right: fixedStyle.right }}
    >
      {showAutoplayToggle && typeof onFeedVideoAutoplayChange === 'function' ? (
        <button
          type="button"
          role="menuitem"
          className={`${MENU_ITEM_CLASS} text-zinc-100`}
          onClick={(e) => {
            e.stopPropagation()
            close()
            onFeedVideoAutoplayChange(!feedVideoAutoplayEnabled)
          }}
        >
          <span className="min-w-0 flex-1">Autoplay while scrolling</span>
          <span
            aria-hidden
            className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${
              feedVideoAutoplayEnabled ? 'bg-cyan-500' : 'bg-zinc-600'
            }`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                feedVideoAutoplayEnabled ? 'translate-x-[18px]' : 'translate-x-0.5'
              }`}
            />
          </span>
        </button>
      ) : null}
      {showAutoplayToggle && typeof onFeedVideoAutoplayChange === 'function' ? (
        <div className="my-1 border-t border-zinc-700/80" role="separator" />
      ) : null}
      {typeof onShare === 'function' ? (
        <button
          type="button"
          role="menuitem"
          className={`${MENU_ITEM_CLASS} text-zinc-100`}
          onClick={(e) => {
            e.stopPropagation()
            close()
            onShare()
          }}
        >
          <Share2 className={MENU_ICON_CLASS} strokeWidth={1.75} aria-hidden />
          Share
        </button>
      ) : null}
      {showPin ? (
        <button
          type="button"
          role="menuitem"
          className={`${MENU_ITEM_CLASS} text-fuchsia-200`}
          disabled={pinBusy}
          onClick={(e) => {
            e.stopPropagation()
            close()
            onPinToggle?.()
          }}
        >
          <Pin className={`${MENU_ICON_CLASS} text-fuchsia-300/90`} strokeWidth={1.75} aria-hidden />
          {pinned ? 'Unpin from Lounge' : 'Pin to Lounge'}
        </button>
      ) : null}
      {showProfilePin ? (
        <button
          type="button"
          role="menuitem"
          className={`${MENU_ITEM_CLASS} text-sky-200`}
          disabled={profilePinBusy}
          onClick={(e) => {
            e.stopPropagation()
            close()
            onProfilePinToggle?.()
          }}
        >
          <Pin className={`${MENU_ICON_CLASS} text-sky-300/90`} strokeWidth={1.75} aria-hidden />
          {profilePinned ? 'Unpin from profile' : 'Pin to profile'}
        </button>
      ) : null}
      {isOwn ? (
        <>
          {showEdit ? (
            <button
              type="button"
              role="menuitem"
              className={`${MENU_ITEM_CLASS} text-zinc-100`}
              onClick={(e) => {
                e.stopPropagation()
                close()
                onEdit?.()
              }}
            >
              <Pencil className={MENU_ICON_CLASS} strokeWidth={1.75} aria-hidden />
              Edit
            </button>
          ) : null}
          <button
            type="button"
            role="menuitem"
            className={`${MENU_ITEM_CLASS} text-rose-300`}
            disabled={deleteBusy}
            onClick={(e) => {
              e.stopPropagation()
              close()
              onDelete?.()
            }}
          >
            <Trash2 className={`${MENU_ICON_CLASS} text-rose-300/90`} strokeWidth={1.75} aria-hidden />
            Delete
          </button>
        </>
      ) : (
        <>
          {showStaffDelete ? (
            <button
              type="button"
              role="menuitem"
              className={`${MENU_ITEM_CLASS} text-rose-300`}
              disabled={staffDeleteBusy}
              onClick={(e) => {
                e.stopPropagation()
                close()
                onStaffDelete?.()
              }}
            >
              <Trash2 className={`${MENU_ICON_CLASS} text-rose-300/90`} strokeWidth={1.75} aria-hidden />
              Delete post
            </button>
          ) : null}
          {showStaffDelete ? <div className="my-1 border-t border-zinc-700/80" role="separator" /> : null}
          <button
            type="button"
            role="menuitem"
            className={`${MENU_ITEM_CLASS} text-zinc-100`}
            onClick={(e) => {
              e.stopPropagation()
              close()
              onBlock?.()
            }}
          >
            <Ban className={MENU_ICON_CLASS} strokeWidth={1.75} aria-hidden />
            Block
          </button>
          <button
            type="button"
            role="menuitem"
            className={`${MENU_ITEM_CLASS} text-zinc-100`}
            onClick={(e) => {
              e.stopPropagation()
              close()
              onReport?.()
            }}
          >
            <Flag className={MENU_ICON_CLASS} strokeWidth={1.75} aria-hidden />
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
        aria-label={menuAriaLabel}
        onClick={(e) => {
          e.stopPropagation()
          setOpen((o) => !o)
        }}
        className={menuButtonClassName}
      >
        <svg className={menuDotsClassName} viewBox="0 0 20 20" fill="currentColor" aria-hidden>
          <circle cx="4" cy="10" r="1.35" />
          <circle cx="10" cy="10" r="1.35" />
          <circle cx="16" cy="10" r="1.35" />
        </svg>
      </button>
      {typeof document !== 'undefined' && menuPanel ? createPortal(menuPanel, document.body) : null}
    </div>
  )
}
