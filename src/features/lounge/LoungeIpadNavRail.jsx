import { useEffect } from 'react'

/** Same width as `--edge-ipad-rail` in `index.css`. */
export const IPAD_NAV_RAIL_WIDTH = '4.75rem'

const NAV_ORDER = ['home', 'search', 'notifications', 'chat', 'following', 'settings']

/**
 * iPad portrait and landscape. The phone FAB buttons, pinned on the left.
 * Compose sits at the bottom, like the X iPad rail.
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
      className="fixed inset-y-0 left-0 z-[60] flex w-[4.75rem] flex-col items-center border-r border-zinc-800 bg-zinc-950 pt-[max(0.75rem,max(env(safe-area-inset-top,0px),var(--edge-sat,0px)))] pb-[max(0.85rem,max(env(safe-area-inset-bottom,0px),var(--edge-sab,0px)))]"
    >
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-1">
        {navItems.map((item) => (
          <RailButton key={item.id} item={item} />
        ))}
      </div>
      {compose ? <ComposeButton item={compose} /> : null}
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
      className="relative grid h-12 w-12 place-items-center rounded-full text-zinc-400 touch-manipulation [-webkit-tap-highlight-color:transparent] disabled:opacity-40 data-[active=1]:text-white"
    >
      <span
        className="block h-7 w-7"
        style={item.iconScale ? { transform: `scale(${item.iconScale})` } : undefined}
      >
        {item.icon}
      </span>
      {item.badgeCount > 0 ? (
        <span
          data-ipad-nav-badge
          className="absolute right-0.5 top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#fd262d] px-1 text-[10px] font-bold leading-none text-white ring-2 ring-zinc-950"
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
      className="grid h-[3.25rem] w-[3.25rem] place-items-center rounded-full bg-[#06cefc] text-zinc-950 shadow-[0_8px_24px_rgba(6,206,252,0.28)] touch-manipulation [-webkit-tap-highlight-color:transparent] disabled:opacity-40"
    >
      <span className="block h-6 w-6">{item.icon}</span>
    </button>
  )
}
