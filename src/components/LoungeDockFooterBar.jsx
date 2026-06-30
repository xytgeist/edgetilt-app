import { useId, useLayoutEffect, useRef } from 'react'
import {
  LOUNGE_FOLLOWING_DOCK_VIEWBOX,
  LOUNGE_FOLLOWING_PERSON_D,
  LOUNGE_FOLLOWING_PLUS_D,
  loungeFollowingArtStrokeWidth,
  loungeFollowingDockTransform,
} from '../assets/icons/loungeFollowingIcon.js'
import { dockChromeHeightFromTitleBarPx } from '../utils/loungeDockChrome.js'

const stroke = {
  stroke: 'currentColor',
  strokeWidth: 1.65,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  fill: 'none',
}

const cyanStroke = {
  stroke: '#22d3ee',
  strokeWidth: 1.85,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  fill: 'none',
}

/** Outline icons; cyan accents on roof, search lens glint, bell clapper, chat dots. */
function IconHome({ className }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className={className} aria-hidden>
      <path {...stroke} d="M4.5 10.25 12 4l7.5 6.25V19a.75.75 0 01-.75.75h-4.5a.75.75 0 01-.75-.75v-4.5h-4v4.5a.75.75 0 01-.75.75H5.25a.75.75 0 01-.75-.75v-8.75z" />
      <path {...cyanStroke} d="M4.5 10.25 12 4 19.5 10.25" />
    </svg>
  )
}

function IconSearch({ className }) {
  const lensInnerClipId = `dock-search-lens-${useId().replace(/:/g, '')}`
  // Cyan glint: short rounded stroke along inner lens curve (~10–11 o'clock). Radius inset so the
  // stroke’s outer edge sits slightly inside the lens ring (not flush on the grey inner edge).
  const cx = 10.25
  const cy = 10.25
  const lensRingR = 6.25
  const lensStroke = 1.65
  const glintStroke = 1.48
  const ringInner = lensRingR - lensStroke / 2
  const glintInset = 0.82
  const r = ringInner - glintStroke / 2 - glintInset
  /** CCW shift (more negative) nudges the glint toward the left side of the lens. */
  const angleShift = -0.65
  const t0 = -2.78 + angleShift
  const t1 = -1.72 + angleShift
  const x0 = cx + r * Math.cos(t0)
  const y0 = cy + r * Math.sin(t0)
  const x1 = cx + r * Math.cos(t1)
  const y1 = cy + r * Math.sin(t1)
  const glintArc = `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r.toFixed(2)} ${r.toFixed(2)} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`

  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className={className} aria-hidden>
      <defs>
        <clipPath id={lensInnerClipId}>
          <circle cx="10.25" cy="10.25" r="5.95" />
        </clipPath>
      </defs>
      <circle {...stroke} cx="10.25" cy="10.25" r="6.25" />
      <path {...stroke} d="M15.5 15.5 21 21" />
      <g clipPath={`url(#${lensInnerClipId})`}>
        <path
          d={glintArc}
          fill="none"
          stroke="#22d3ee"
          strokeWidth={glintStroke}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  )
}

function IconBell({ className }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        {...stroke}
        d="M10.5 6.75a3.75 3.75 0 017.5 0v.75c0 4.25 1.75 6.5 1.75 6.5H8.75S10.5 12.75 10.5 8.5v-.75z"
      />
      {/* Clapper as a small ball */}
      <circle cx="12" cy="19.25" r="1.35" className="fill-cyan-400" stroke="none" />
    </svg>
  )
}

function IconChat({ className }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        {...stroke}
        d="M6.75 5.25h10.5a2.25 2.25 0 012.25 2.25v6a2.25 2.25 0 01-2.25 2.25h-5.03l-3.72 2.48V15.75H6.75a2.25 2.25 0 01-2.25-2.25v-6a2.25 2.25 0 012.25-2.25z"
      />
      <circle cx="9" cy="10.5" r="1.05" className="fill-cyan-400" stroke="none" />
      <circle cx="12" cy="10.5" r="1.05" className="fill-cyan-400" stroke="none" />
      <circle cx="15" cy="10.5" r="1.05" className="fill-cyan-400" stroke="none" />
    </svg>
  )
}

const FOLLOWING_CYAN = '#22d3ee'

const followingDockTransform = loungeFollowingDockTransform()

const followingArtStrokeWidth = loungeFollowingArtStrokeWidth(stroke.strokeWidth)

/** From `src/assets/icons/lounge-following.svg` - off: grey person + cyan plus; on: all cyan fill. */
function IconFollowing({ className, active = false }) {
  const personFill = active ? FOLLOWING_CYAN : 'currentColor'
  const plusFill = FOLLOWING_CYAN
  const filledPath = (fill) => ({
    fill,
    stroke: fill,
    strokeWidth: followingArtStrokeWidth,
    strokeLinejoin: 'round',
    strokeLinecap: 'round',
    paintOrder: 'stroke fill',
  })

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={LOUNGE_FOLLOWING_DOCK_VIEWBOX}
      className={className}
      aria-hidden
      fill="none"
    >
      <g transform={followingDockTransform}>
        <path {...filledPath(personFill)} d={LOUNGE_FOLLOWING_PERSON_D} />
        <path {...filledPath(plusFill)} d={LOUNGE_FOLLOWING_PLUS_D} />
      </g>
    </svg>
  )
}

/** Until ResizeObserver reports full footer height, underestimate safe-area for slide math (corrected next frame). */
const FALLBACK_SAFE_BOTTOM_PX = 40

/**
 * Bottom dock for Lounge shell: matches fixed title bar chrome (zinc bar + blur + border).
 * `reveal` 1 = fully visible, 0 = slid off downward (paired with scroll-linked title hide).
 * Icon-only controls (no chrome around glyphs); active slot uses cyan icon color.
 *
 * @param {number} [matchTitleBarHeightPx=0] - When >0 (viewport dock), the icon band height comes from
 *   `dockChromeHeightFromTitleBarPx` (see `src/utils/loungeDockChrome.js`); safe-area padding stays inside the same full-bleed frosted bar.
 * @param {'viewport' | 'sheet'} [layout='viewport'] - `sheet` pins to a full-screen sheet bottom (e.g. profile).
 */
export default function LoungeDockFooterBar({
  reveal = 1,
  barHeightPx = 0,
  matchTitleBarHeightPx = 0,
  onHeightChange,
  onHome,
  onSearch,
  onFollowingFilterToggle,
  followingFilterOn = false,
  followingFilterDisabled = false,
  onNotifications,
  onChat,
  activePanel = null,
  layout = 'viewport',
}) {
  const measureRef = useRef(null)
  const isSheet = layout === 'sheet'
  const useMatchedChrome = !isSheet && matchTitleBarHeightPx > 0
  const dockChromePx = dockChromeHeightFromTitleBarPx(matchTitleBarHeightPx)
  const h =
    barHeightPx > 0
      ? barHeightPx
      : useMatchedChrome
        ? dockChromePx + FALLBACK_SAFE_BOTTOM_PX
        : 44
  const translateY = (1 - Math.min(1, Math.max(0, reveal))) * h

  useLayoutEffect(() => {
    const el = measureRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const apply = () => {
      const rect = Math.ceil(el.getBoundingClientRect().height)
      if (rect > 0) onHeightChange?.(rect)
    }
    apply()
    const ro = new ResizeObserver(apply)
    ro.observe(el)
    return () => ro.disconnect()
  }, [onHeightChange, layout, matchTitleBarHeightPx, dockChromePx])

  const dockBtn = (active, onClick, label, children, { pressed = false, disabled = false } = {}) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-current={pressed ? undefined : active ? 'page' : undefined}
      aria-pressed={pressed ? active : undefined}
      className={`flex min-w-0 flex-1 touch-manipulation items-center justify-center bg-transparent px-1 [-webkit-tap-highlight-color:transparent] transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-45 ${
        useMatchedChrome ? 'h-full min-h-0 py-0' : 'min-h-10 py-0.5'
      } ${active ? 'text-cyan-300' : 'text-zinc-400 hover:text-zinc-100'}`}
    >
      {children}
    </button>
  )

  const dockIconClass = 'h-8 w-8 shrink-0 translate-y-1 opacity-95'
  const followingLabel = followingFilterOn
    ? 'Following feed on - show all posts'
    : 'Following feed - show posts from people you follow'
  const dockIcons = (
    <>
      {dockBtn(false, onHome, 'Home', <IconHome className={dockIconClass} />)}
      {dockBtn(activePanel === 'search', onSearch, 'Search', <IconSearch className={dockIconClass} />)}
      {dockBtn(
        followingFilterOn,
        onFollowingFilterToggle,
        followingLabel,
        <IconFollowing className={dockIconClass} active={followingFilterOn} />,
        { pressed: true, disabled: followingFilterDisabled },
      )}
      {dockBtn(
        activePanel === 'notifications',
        onNotifications,
        'Notifications',
        <IconBell className={dockIconClass} />
      )}
      {dockBtn(activePanel === 'chat', onChat, 'Chat', <IconChat className={dockIconClass} />)}
    </>
  )

  const chromeBarClass =
    'border-t border-zinc-800/95 bg-zinc-950/95 shadow-[0_-1px_0_rgba(0,0,0,0.22)] backdrop-blur supports-[backdrop-filter]:bg-zinc-950/85'

  /** Sheet / legacy: single shell with bottom safe-area padding inside the bar. */
  const outerClassSingle = isSheet
    ? 'pointer-events-none absolute bottom-0 left-0 right-0 z-[40] w-full border-t border-zinc-800/95 bg-zinc-950/95 pb-[max(0.25rem,env(safe-area-inset-bottom))] shadow-[0_-1px_0_rgba(0,0,0,0.22)] backdrop-blur supports-[backdrop-filter]:bg-zinc-950/85 will-change-transform'
    : 'pointer-events-none fixed bottom-0 left-1/2 z-[56] w-full max-w-2xl border-t border-zinc-800/95 bg-zinc-950/95 pb-[max(0.25rem,env(safe-area-inset-bottom))] shadow-[0_-1px_0_rgba(0,0,0,0.22)] backdrop-blur supports-[backdrop-filter]:bg-zinc-950/85 will-change-transform'

  const transform =
    isSheet || useMatchedChrome
      ? `translate3d(0, ${translateY}px, 0)`
      : `translate3d(-50%, ${translateY}px, 0)`
  const outerStyle = {
    transform,
    pointerEvents: reveal > 0.12 ? 'auto' : 'none',
  }

  if (useMatchedChrome) {
    return (
      <div
        ref={measureRef}
        className={`pointer-events-none fixed inset-x-0 bottom-0 z-[56] will-change-transform ${chromeBarClass} pb-[max(0.25rem,env(safe-area-inset-bottom))]`}
        style={outerStyle}
      >
        <div className="mx-auto flex w-full max-w-2xl shrink-0 items-center justify-center gap-2 px-3 pb-0.5 pt-2" style={{ height: dockChromePx, boxSizing: 'border-box' }}>
          {dockIcons}
        </div>
      </div>
    )
  }

  return (
    <div ref={measureRef} className={outerClassSingle} style={outerStyle}>
      <div className="flex items-center justify-center gap-2 px-3 pb-0.5 pt-1.5">{dockIcons}</div>
    </div>
  )
}
