import { useEffect } from 'react'
import { useDuoNavRailEnd } from '../shell/useIpadNavRail.js'

/** Same width as `--edge-ipad-rail` in `index.css`. 15% under the old 11rem − 50px column. */
export const IPAD_NAV_RAIL_WIDTH = 'calc((11rem - 50px) * 0.85)'

/**
 * Open Duo: Music gutter under the island / status dock.
 * Pill width/trailing pad are **px** (not rem) so Dynamic Type cannot drift them.
 * Measured against a Duo sim crop: status circle ~50px, prior rem pill sat narrow + right-shifted.
 */
export const DUO_NAV_RAIL_WIDTH = '5.5rem'
/** Match the Duo status-dock circle (clock sits above it). */
export const DUO_NAV_PILL_WIDTH_PX = 50
/** Distance from the bezel to the pill’s trailing edge … lines up with the status circle. */
export const DUO_NAV_PILL_TRAILING_PAD_PX = 34

/**
 * Visible letter inside the 180px +EV tiles.
 * Cropped so the E is the same height as the h-8 EDGE word in the lounge header.
 */
const EV_TILE = 180
const EV_MARKS = [
  { src: '/apple-touch-icon.png', className: 'edge-logo--dark', x: 12, y: 43, w: 158, h: 96 },
  {
    src: '/EdgeIconWbg/apple-icon-180x180.png',
    className: 'edge-logo--light',
    x: 9,
    y: 42,
    w: 163,
    h: 104,
  },
]

const NAV_ORDER = ['home', 'search', 'notifications', 'chat', 'following', 'settings']
/** Music-style Duo tabs. Following + Settings stay in More / hamburger. */
const DUO_NAV_ORDER = ['home', 'search', 'notifications', 'chat']

/**
 * iPad portrait and landscape, plus phone landscape.
 * Phone portrait keeps the FAB dock.
 * Open Duo: trailing Music strip (no E, tabs at the bottom, Back under the island).
 */
export default function LoungeIpadNavRail({
  items = [],
  shortcuts = null,
  onBack = null,
  onOpenShellMenu = null,
  shellMenuOpen = false,
  shellMenuAttention = false,
}) {
  const navEnd = useDuoNavRailEnd()
  const railWidth = navEnd ? DUO_NAV_RAIL_WIDTH : IPAD_NAV_RAIL_WIDTH

  useEffect(() => {
    const root = document.documentElement
    root.dataset.ipadNav = ''
    root.style.setProperty('--edge-ipad-rail', railWidth)
    if (navEnd) root.dataset.ipadNavEnd = ''
    else delete root.dataset.ipadNavEnd
    return () => {
      delete root.dataset.ipadNav
      delete root.dataset.ipadNavEnd
      root.style.removeProperty('--edge-ipad-rail')
    }
  }, [navEnd, railWidth])

  const byId = new Map(items.map((item) => [item.id, item]))
  const navItems = (navEnd ? DUO_NAV_ORDER : NAV_ORDER).map((id) => byId.get(id)).filter(Boolean)
  const compose = navEnd ? null : byId.get('compose')

  if (navEnd) {
    const pillStyle = {
      width: DUO_NAV_PILL_WIDTH_PX,
      minWidth: DUO_NAV_PILL_WIDTH_PX,
      maxWidth: DUO_NAV_PILL_WIDTH_PX,
      boxSizing: 'border-box',
    }
    return (
      <nav
        data-ipad-nav-rail
        data-duo-nav-rail
        aria-label="Lounge"
        className="fixed inset-y-0 right-0 z-[60] flex flex-col items-end bg-transparent pt-[calc(max(env(safe-area-inset-top,0px),var(--edge-sat,0px))+2.1rem)] pb-[max(0.85rem,max(env(safe-area-inset-bottom,0px),var(--edge-sab,0px)))]"
        style={{ width: DUO_NAV_RAIL_WIDTH, paddingRight: DUO_NAV_PILL_TRAILING_PAD_PX }}
      >
        <div className="flex shrink-0 flex-col items-center" data-duo-nav-context>
          {onBack ? (
            <div
              data-duo-nav-pill
              data-duo-nav-pill-w={DUO_NAV_PILL_WIDTH_PX}
              className="flex flex-col items-center overflow-hidden rounded-full bg-zinc-800/70 py-1 shadow-[0_8px_28px_rgba(0,0,0,0.35)] backdrop-blur-xl supports-[backdrop-filter]:bg-zinc-800/55"
              style={pillStyle}
            >
              <button
                type="button"
                data-duo-nav-back
                aria-label="Back"
                onClick={() => onBack()}
                className="grid h-[44px] w-full place-items-center text-zinc-100 touch-manipulation [-webkit-tap-highlight-color:transparent]"
              >
                <span className="text-[17px] leading-none" aria-hidden>
                  ←
                </span>
              </button>
            </div>
          ) : (
            <span className="h-[44px] w-[50px]" aria-hidden />
          )}
        </div>
        <div className="min-h-0 flex-1" aria-hidden />
        <div
          data-duo-nav-pill
          data-duo-nav-tabs
          data-duo-nav-pill-w={DUO_NAV_PILL_WIDTH_PX}
          className="flex shrink-0 flex-col items-center gap-0 overflow-hidden rounded-full bg-zinc-800/70 py-1 shadow-[0_8px_28px_rgba(0,0,0,0.35)] backdrop-blur-xl supports-[backdrop-filter]:bg-zinc-800/55"
          style={pillStyle}
        >
          {navItems.map((item) => (
            <RailButton key={item.id} item={item} compact />
          ))}
          {onOpenShellMenu ? (
            <button
              type="button"
              data-title-bar-menu-btn
              data-duo-nav-more
              aria-label={
                shellMenuOpen
                  ? 'Close navigation menu'
                  : shellMenuAttention
                    ? 'Open navigation menu · pending poker offer'
                    : 'Open navigation menu'
              }
              aria-expanded={shellMenuOpen}
              aria-haspopup="menu"
              onClick={() => onOpenShellMenu()}
              className="relative grid h-[44px] w-full place-items-center text-zinc-200 touch-manipulation [-webkit-tap-highlight-color:transparent]"
            >
              <span aria-hidden className="block leading-none text-base -translate-y-px">
                {shellMenuOpen ? '×' : '☰'}
              </span>
              {shellMenuAttention && !shellMenuOpen ? (
                <span
                  className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-[#06cefc] ring-2 ring-zinc-900"
                  aria-hidden
                />
              ) : null}
            </button>
          ) : null}
        </div>
      </nav>
    )
  }

  return (
    <nav
      data-ipad-nav-rail
      aria-label="Lounge"
      className="fixed inset-y-0 left-0 z-[60] flex flex-col items-center border-r border-zinc-800 bg-zinc-950 px-2 pt-[calc(max(env(safe-area-inset-top,0px),var(--edge-sat,0px))+0.75rem)] pb-[max(1rem,max(env(safe-area-inset-bottom,0px),var(--edge-sab,0px)))]"
      style={{ width: IPAD_NAV_RAIL_WIDTH }}
    >
      <div className="flex w-full shrink-0 justify-center pb-6">
        <IpadEvMark />
      </div>
      <div className="flex w-full shrink-0 flex-col items-center gap-9" data-ipad-nav-stack>
        {navItems.map((item) => (
          <RailButton key={item.id} item={item} />
        ))}
      </div>
      <div data-ipad-nav-shortcut-rule aria-hidden />
      <div className="flex min-h-0 w-full flex-1 flex-col items-center overflow-y-auto">
        {shortcuts}
      </div>
      {compose ? (
        <div className="shrink-0 pt-4">
          <ComposeButton item={compose} />
        </div>
      ) : null}
    </nav>
  )
}

function IpadEvMark() {
  return (
    <span className="relative block h-8 w-0" data-ipad-ev-mark aria-hidden>
      {EV_MARKS.map((mark) => (
        <span
          key={mark.src}
          className="absolute inset-y-0 left-1/2 block -translate-x-1/2 overflow-hidden"
          style={{ width: `${(mark.w / mark.h) * 2}rem` }}
        >
          <img
            src={mark.src}
            alt=""
            draggable={false}
            className={`${mark.className} absolute max-w-none`}
            style={{
              height: `${(EV_TILE / mark.h) * 100}%`,
              width: `${(EV_TILE / mark.w) * 100}%`,
              top: `${(-mark.y / mark.h) * 100}%`,
              left: `${(-mark.x / mark.w) * 100}%`,
            }}
          />
        </span>
      ))}
    </span>
  )
}

function RailButton({ item, compact = false }) {
  return (
    <button
      type="button"
      aria-label={item.label}
      aria-pressed={item.active ? true : undefined}
      disabled={item.disabled}
      data-ipad-nav-item
      data-active={item.active ? '1' : '0'}
      onClick={() => item.onSelect?.()}
      className={
        compact
          ? 'relative grid h-[44px] w-full place-items-center text-zinc-200 touch-manipulation [-webkit-tap-highlight-color:transparent] disabled:opacity-40 data-[active=1]:text-white'
          : 'relative grid h-[4.5rem] w-[4.5rem] place-items-center text-zinc-300 touch-manipulation [-webkit-tap-highlight-color:transparent] disabled:opacity-40 data-[active=1]:text-white'
      }
    >
      <span
        className={compact ? 'block h-[18px] w-[18px]' : 'block h-9 w-9'}
        style={item.iconScale ? { transform: `scale(${item.iconScale})` } : undefined}
      >
        {item.icon}
      </span>
      {item.badgeCount > 0 ? (
        <span
          data-ipad-nav-badge
          className={
            compact
              ? 'absolute right-0.5 top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-[#06cefc] px-0.5 text-[8px] font-bold leading-none text-zinc-950 ring-2 ring-zinc-900'
              : 'absolute right-1 top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#06cefc] px-1 text-[11px] font-bold leading-none text-zinc-950 ring-2 ring-zinc-950'
          }
          aria-hidden
        >
          {item.badgeCount > 99 ? '99+' : item.badgeCount}
        </span>
      ) : null}
    </button>
  )
}

function ComposeButton({ item }) {
  return (
    <button
      type="button"
      aria-label={item.label}
      disabled={item.disabled}
      data-ipad-nav-compose
      data-active={item.active ? '1' : '0'}
      onClick={() => item.onSelect?.()}
      className="grid h-20 w-20 place-items-center rounded-full bg-[#06cefc] text-zinc-950 touch-manipulation [-webkit-tap-highlight-color:transparent] disabled:opacity-40"
    >
      <span className="block h-9 w-9">{item.icon}</span>
    </button>
  )
}
