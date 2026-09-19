import { useEffect } from 'react'

/** Same width as `--edge-ipad-rail` in `index.css`. */
export const IPAD_NAV_RAIL_WIDTH = '11rem'

const NAV_ORDER = ['home', 'search', 'notifications', 'chat', 'following', 'settings']

/**
 * iPad portrait and landscape. Phone FAB buttons, large, starting under the +EV mark.
 * Compose sits at the bottom.
 */
export default function LoungeIpadNavRail({ items = [] }) {
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
      className="fixed inset-y-0 left-0 z-[60] flex w-[11rem] flex-col items-center border-r border-zinc-800 bg-zinc-950 px-3 pt-[max(0.85rem,max(env(safe-area-inset-top,0px),var(--edge-sat,0px)))] pb-[max(1rem,max(env(safe-area-inset-bottom,0px),var(--edge-sab,0px)))]"
    >
      <div className="flex w-full justify-center pb-6 pt-1">
        <span className="inline-flex h-16 w-16 overflow-hidden rounded-2xl" aria-hidden>
          <img
            src="/apple-touch-icon.png"
            alt=""
            className="edge-logo--dark h-16 w-16"
            draggable={false}
          />
          <img
            src="/EdgeIconWbg/apple-icon-180x180.png"
            alt=""
            className="edge-logo--light h-16 w-16"
            draggable={false}
          />
        </span>
      </div>
      <div className="flex w-full flex-col items-center gap-9">
        {navItems.map((item) => (
          <RailButton key={item.id} item={item} />
        ))}
      </div>
      {compose ? (
        <div className="mt-auto pt-4">
          <ComposeButton item={compose} />
        </div>
      ) : null}
    </nav>
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
        className="block h-11 w-11"
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
      className="grid h-20 w-20 place-items-center rounded-full bg-[#06cefc] text-zinc-950 shadow-[0_10px_28px_rgba(6,206,252,0.28)] touch-manipulation [-webkit-tap-highlight-color:transparent] disabled:opacity-40"
    >
      <span className="block h-9 w-9">{item.icon}</span>
    </button>
  )
}
