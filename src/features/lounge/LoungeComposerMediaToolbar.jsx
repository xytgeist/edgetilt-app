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
        d="M8.5 7.35v5.3l4.25-2.65-4.25-2.65z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="0.35"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function LoungeComposerMediaChartIcon({ className = 'h-8 w-8', filled = true }) {
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
        d="M6 13.5 8.25 10.5 10.5 12 13.25 7.5"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
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
 * @param {'md' | 'lg'} [size] Larger hit targets for keyboard-docked toolbars (e.g. quote).
 */
export default function LoungeComposerMediaToolbar({
  variant = 'feed',
  size = 'md',
  imageInputId,
  videoInputId,
  disabled = false,
  onImagePointerDown,
  onVideoPointerDown,
  onOpenGifPicker,
  onOpenMarketPicker,
  showGif = true,
  showMarket = true,
  gifDisabled = false,
  marketDisabled = false,
  className = '',
}) {
  const isThread = variant === 'thread'
  const isLg = size === 'lg'
  const iconClass = isThread
    ? isLg
      ? 'h-8 w-8'
      : 'h-[26px] w-[26px]'
    : isLg
      ? 'h-8 w-8'
      : 'h-7 w-7'
  const filled = !isThread
  const padClass = isThread ? (isLg ? 'p-2.5' : 'p-2') : isLg ? 'p-1.5' : 'p-0.5'
  const labelClass = isThread
    ? `flex shrink-0 cursor-pointer touch-manipulation items-center justify-center rounded-full ${padClass} text-cyan-600 hover:text-cyan-500 active:text-cyan-400 disabled:opacity-45 [-webkit-tap-highlight-color:transparent]${disabled ? ' pointer-events-none opacity-45' : ''}`
    : `flex shrink-0 cursor-pointer touch-manipulation items-center justify-center rounded-md ${padClass} text-sky-400 hover:text-sky-300 active:text-sky-200 disabled:opacity-45 [-webkit-tap-highlight-color:transparent]${disabled ? ' pointer-events-none opacity-45' : ''}`
  const gifBtnClass = isThread
    ? `flex shrink-0 touch-manipulation items-center justify-center rounded-full ${padClass} text-cyan-600 hover:text-cyan-500 active:text-cyan-400 disabled:opacity-45 [-webkit-tap-highlight-color:transparent]`
    : `flex shrink-0 touch-manipulation items-center justify-center rounded-md ${padClass} text-sky-400 hover:text-sky-300 active:text-sky-200 disabled:opacity-45 [-webkit-tap-highlight-color:transparent]`

  const preventFocusSteal = (e) => e.preventDefault()
  /** GIF opens a sheet … allow the composer to blur so the software keyboard dismisses. */
  const dismissSoftwareKeyboard = () => {
    try {
      const active = document.activeElement
      if (active instanceof HTMLElement && typeof active.blur === 'function') active.blur()
    } catch {
      // ignore
    }
  }

  return (
    <div
      className={`inline-flex shrink-0 items-center ${isLg ? 'gap-1' : 'gap-0.5'}${className ? ` ${className}` : ''}`}
    >
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
          onPointerDown={() => {
            dismissSoftwareKeyboard()
            onOpenGifPicker?.()
          }}
          onClick={onOpenGifPicker}
          className={gifBtnClass}
          title="Add GIF"
          aria-label="Add GIF"
        >
          <LoungeComposerMediaGifIcon className={iconClass} filled={filled} />
        </button>
      ) : null}
      {showMarket && onOpenMarketPicker ? (
        <button
          type="button"
          disabled={marketDisabled || disabled}
          onMouseDown={preventFocusSteal}
          onClick={onOpenMarketPicker}
          className={gifBtnClass}
          title="Add market chart"
          aria-label="Add market chart"
        >
          <LoungeComposerMediaChartIcon className={iconClass} filled={filled} />
        </button>
      ) : null}
    </div>
  )
}
