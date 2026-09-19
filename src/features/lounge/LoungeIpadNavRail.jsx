import { useEffect } from 'react'

/** Same width as `--edge-ipad-rail` in `index.css`. 11rem was 50px too wide. */
export const IPAD_NAV_RAIL_WIDTH = 'calc(11rem - 50px)'

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

/**
 * iPad portrait and landscape. Phone FAB buttons, large, starting under the +EV mark.
 * Compose sits at the bottom.
 */
export default function LoungeIpadNavRail({ items = [], shortcuts = null }) {
  useEffect(() => {
    const root = document.documentElement
    root.dataset.ipadNav = ''
    root.style.setProperty('--edge-ipad-rail', IPAD_NAV_RAIL_WIDTH)
    return () => {
      delete root.dataset.ipadNav
      root.style.removeProperty('--edge-ipad-rail')
    }
  }, [])

  const byId = new Map(items.map((item) => [item.id, item]))
  const navItems = NAV_ORDER.map((id) => byId.get(id)).filter(Boolean)
  const compose = byId.get('compose')

  return (
    <nav
      data-ipad-nav-rail
      aria-label="Lounge"
      className="fixed inset-y-0 left-0 z-[60] flex flex-col items-center border-r border-zinc-800 bg-zinc-950 px-3 pt-[calc(max(env(safe-area-inset-top,0px),var(--edge-sat,0px))+0.75rem)] pb-[max(1rem,max(env(safe-area-inset-bottom,0px),var(--edge-sab,0px)))]"
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

function RailButton({ item }) {
  return (
    <button
      type="button"
      aria-label={item.label}
      aria-pressed={item.active ? true : undefined}
      disabled={item.disabled}
      data-ipad-nav-item
      data-active={item.active ? '1' : '0'}
      onClick={() => item.onSelect?.()}
      className="relative grid h-[4.5rem] w-[4.5rem] place-items-center text-zinc-300 touch-manipulation [-webkit-tap-highlight-color:transparent] disabled:opacity-40 data-[active=1]:text-white"
    >
      <span
        className="block h-9 w-9"
        style={item.iconScale ? { transform: `scale(${item.iconScale})` } : undefined}
      >
        {item.icon}
      </span>
      {item.badgeCount > 0 ? (
        <span
          data-ipad-nav-badge
          className="absolute right-1 top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#06cefc] px-1 text-[11px] font-bold leading-none text-zinc-950 ring-2 ring-zinc-950"
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
