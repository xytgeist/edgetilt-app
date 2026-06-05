/** Shared image / video / GIF toolbar controls for lounge composers. */

export function LoungeComposerMediaImageIcon({ className = 'h-8 w-8', filled = true }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden>
      <rect
        x="3.75"
        y="3.75"
        width="12.5"
        height="12.5"
        rx="2"
        fill={filled ? 'currentColor' : 'none'}
        fillOpacity={filled ? 0.14 : undefined}
        stroke="currentColor"
        strokeWidth="1.35"
      />
      <path
        d="M6.25 13.25 8.25 10.25l1.75 2 2.25-3 3.5 4"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="8" cy="8" r="1" fill="currentColor" />
    </svg>
  )
}

export function LoungeComposerMediaVideoIcon({ className = 'h-8 w-8', filled = true }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden>
      <rect
        x="3.75"
        y="5.25"
        width="12.5"
        height="9.5"
        rx="2"
        fill={filled ? 'currentColor' : 'none'}
        fillOpacity={filled ? 0.14 : undefined}
        stroke="currentColor"
        strokeWidth="1.35"
      />
      <path
        d="M8.35 8.1v3.8l3.65-1.9-3.65-1.9z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="0.35"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function LoungeComposerMediaGifIcon({ className = 'h-8 w-8', filled = true }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden>
      <rect
        x="3.75"
        y="3.75"
        width="12.5"
        height="12.5"
        rx="2"
        fill={filled ? 'currentColor' : 'none'}
        fillOpacity={filled ? 0.14 : undefined}
        stroke="currentColor"
        strokeWidth="1.35"
      />
      <text
        x="10"
        y="12.85"
        textAnchor="middle"
        fill="currentColor"
        style={{ fontSize: '5.35px', fontWeight: 800, fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}
      >
        GIF
      </text>
    </svg>
  )
}

/**
 * @param {'feed' | 'thread' | 'compact'} variant
 */
export default function LoungeComposerMediaToolbar({
  variant = 'feed',
  imageInputId,
  videoInputId,
  disabled = false,
  onImagePointerDown,
  onVideoPointerDown,
  onOpenGifPicker,
  showGif = true,
  gifDisabled = false,
  className = '',
}) {
  const isThread = variant === 'thread'
  const isCompact = variant === 'compact'
  const iconClass = isThread ? 'h-[26px] w-[26px]' : isCompact ? 'h-7 w-7' : 'h-8 w-8'
  const filled = !isThread
  const labelClass = isThread
    ? `flex shrink-0 cursor-pointer touch-manipulation items-center justify-center rounded-full p-2 text-cyan-600 hover:text-cyan-500 active:text-cyan-400 disabled:opacity-45 [-webkit-tap-highlight-color:transparent]${disabled ? ' pointer-events-none opacity-45' : ''}`
    : isCompact
      ? `flex shrink-0 cursor-pointer touch-manipulation items-center justify-center rounded-md p-1 text-sky-400 hover:text-sky-300 active:text-sky-200 disabled:opacity-45 [-webkit-tap-highlight-color:transparent]${disabled ? ' pointer-events-none opacity-45' : ''}`
      : `flex shrink-0 cursor-pointer touch-manipulation items-center justify-center rounded-md p-1.5 text-sky-400 hover:text-sky-300 active:text-sky-200 disabled:opacity-45 [-webkit-tap-highlight-color:transparent]${disabled ? ' pointer-events-none opacity-45' : ''}`
  const gifBtnClass = isThread
    ? 'flex shrink-0 touch-manipulation items-center justify-center rounded-full p-2 text-cyan-600 hover:text-cyan-500 active:text-cyan-400 disabled:opacity-45 [-webkit-tap-highlight-color:transparent]'
    : isCompact
      ? 'flex shrink-0 touch-manipulation items-center justify-center rounded-md p-1 text-sky-400 hover:text-sky-300 active:text-sky-200 disabled:opacity-45 [-webkit-tap-highlight-color:transparent]'
      : 'flex shrink-0 touch-manipulation items-center justify-center rounded-md p-1.5 text-sky-400 hover:text-sky-300 active:text-sky-200 disabled:opacity-45 [-webkit-tap-highlight-color:transparent]'

  const preventFocusSteal = (e) => e.preventDefault()

  return (
    <>
      <label
        htmlFor={imageInputId}
        onPointerDown={onImagePointerDown}
        onMouseDown={preventFocusSteal}
        className={labelClass}
        title="Add image"
        aria-label="Add image"
      >
        <LoungeComposerMediaImageIcon className={iconClass} filled={filled} />
      </label>
      <label
        htmlFor={videoInputId}
        onPointerDown={onVideoPointerDown}
        onMouseDown={preventFocusSteal}
        className={labelClass}
        title="Add video"
        aria-label="Add video"
      >
        <LoungeComposerMediaVideoIcon className={iconClass} filled={filled} />
      </label>
      {showGif ? (
        <button
          type="button"
          disabled={gifDisabled || disabled}
          onMouseDown={preventFocusSteal}
          onClick={onOpenGifPicker}
          className={gifBtnClass}
          title="Add GIF"
          aria-label="Add GIF"
        >
          <LoungeComposerMediaGifIcon className={iconClass} filled={filled} />
        </button>
      ) : null}
    </>
  )
}
