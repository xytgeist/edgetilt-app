import { createPortal } from 'react-dom'
import { useState } from 'react'

const OS = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: '1.8',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
}

function MuteIcon() {
  return (
    <svg {...OS}>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  )
}

function FlagOptionsIcon() {
  return (
    <svg {...OS}>
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <line x1="4" y1="22" x2="4" y2="15" />
    </svg>
  )
}

function OptionsRow({ label, icon, onClick, dim = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 px-4 py-3.5 text-[15px] font-semibold touch-manipulation transition-colors active:bg-white/10 ${
        dim ? 'text-zinc-500' : 'text-zinc-100'
      }`}
    >
      <span className="shrink-0 opacity-75">{icon}</span>
      {label}
    </button>
  )
}

function OptionsDivider() {
  return <div className="mx-4 h-px bg-white/10" />
}

/**
 * DM conversation header row - matches `ChatConversation.jsx` chrome (back, avatar, pill, options).
 *
 * @param {{
 *   onBack: () => void,
 *   displayName: string,
 *   avatarUrl?: string | null,
 *   otherUnreadCount?: number,
 *   onViewProfile?: () => void,
 *   menuZIndex?: number,
 * }} props
 */
export default function ChatDmHeaderChrome({
  onBack,
  displayName,
  avatarUrl = null,
  otherUnreadCount = 0,
  onViewProfile,
  menuZIndex = 119,
}) {
  const [optionsMenuOpen, setOptionsMenuOpen] = useState(false)
  const initial = (displayName || '?').replace(/^@/, '')[0]?.toUpperCase() || '?'
  const scrimZ = menuZIndex - 1

  return (
    <>
      <div className="flex items-start gap-2 px-3 pb-4 pt-2">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to conversations"
          className="chat-header-glass relative shrink-0 flex h-10 w-10 items-center justify-center rounded-full text-zinc-100 touch-manipulation active:opacity-70 transition-opacity"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          {otherUnreadCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-cyan-500 px-1 text-[10px] font-bold leading-none text-zinc-950">
              {otherUnreadCount > 99 ? '99+' : otherUnreadCount}
            </span>
          )}
        </button>

        <div className="flex min-w-0 flex-1 flex-col items-center">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={displayName}
              className="relative z-10 h-16 w-16 rounded-full object-cover shadow-lg ring-2 ring-white/20"
            />
          ) : (
            <div className="relative z-10 grid h-16 w-16 place-items-center rounded-full bg-zinc-700 text-[22px] font-bold text-zinc-300 shadow-lg ring-2 ring-white/15">
              {initial}
            </div>
          )}
          <button
            type="button"
            onClick={() => onViewProfile?.()}
            disabled={!onViewProfile}
            className="chat-header-glass -mt-1 flex items-center gap-1 rounded-full px-4 py-1.5 touch-manipulation transition-opacity active:opacity-75 disabled:opacity-100"
            aria-label={onViewProfile ? `View ${displayName}'s profile` : undefined}
          >
            <span className="text-[16px] font-bold text-zinc-50">{displayName}</span>
            {onViewProfile ? <span className="text-[15px] font-normal text-zinc-300">›</span> : null}
          </button>
        </div>

        <button
          type="button"
          onClick={() => setOptionsMenuOpen(true)}
          aria-label="Chat options"
          className="chat-header-glass shrink-0 flex h-10 w-10 items-center justify-center rounded-full text-zinc-100 touch-manipulation active:opacity-70 transition-opacity"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5" />
            <rect x="2" y="6" width="14" height="12" rx="2" />
          </svg>
        </button>
      </div>

      {optionsMenuOpen && typeof document !== 'undefined'
        ? createPortal(
            <>
              <div
                className="fixed inset-0"
                style={{ zIndex: scrimZ }}
                onClick={() => setOptionsMenuOpen(false)}
              />
              <div
                className="chat-menu-glass fixed w-[220px] overflow-hidden rounded-2xl"
                style={{
                  zIndex: menuZIndex,
                  top: 'calc(env(safe-area-inset-top, 0px) + 60px)',
                  right: '16px',
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <OptionsRow
                  label="Mute"
                  icon={<MuteIcon />}
                  onClick={() => setOptionsMenuOpen(false)}
                />
                <OptionsDivider />
                <OptionsRow
                  label="Report"
                  icon={<FlagOptionsIcon />}
                  dim
                  onClick={() => setOptionsMenuOpen(false)}
                />
              </div>
            </>,
            document.body,
          )
        : null}
    </>
  )
}
