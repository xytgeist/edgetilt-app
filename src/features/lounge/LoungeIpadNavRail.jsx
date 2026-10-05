import { useEffect, useState } from 'react'
import { useDuoNavRailEnd } from '../shell/useIpadNavRail.js'

function withDuoCollapse(item, collapse) {
  if (!item) return item
  return {
    ...item,
    onSelect: () => {
      item.onSelect?.()
      collapse()
    },
  }
}

/** Same width as `--edge-ipad-rail` in `index.css`. 15% under the old 11rem − 50px column. */
export const IPAD_NAV_RAIL_WIDTH = 'calc((11rem - 50px) * 0.85)'

/**
 * Open Duo: Music gutter under the island / status dock.
 * Pill width/trailing pad are **px** (not rem) so Dynamic Type cannot drift them.
 * 50px capsules. Bottom-anchored under the wifi dock column, not tucked into the bezel.
 */
export const DUO_NAV_RAIL_WIDTH = '5.5rem'
/** Ryan: width was already fine. Do not grow this to chase the glass. */
export const DUO_NAV_PILL_WIDTH_PX = 50
/** Bezel → pill trailing edge. Larger = further left. 22 centers the 50px column under the wifi dock. */
export const DUO_NAV_PILL_TRAILING_PAD_PX = 22
/** Extra below `--edge-sat` so the menu pill clears the wifi dock. */
export const DUO_NAV_PILL_TOP_EXTRA_PX = 134

/** Glass plate is a sibling … never put overflow/clip on the same node as the frost. */
function DuoGlassPill({
  children,
  className = '',
  style,
  scroll = false,
  ...attrs
}) {
  return (
    <div
      data-duo-nav-pill
      data-duo-nav-pill-w={DUO_NAV_PILL_WIDTH_PX}
      className={`relative rounded-full ${className}`}
      style={style}
      {...attrs}
    >
      <span className="duo-nav-glass-plate" aria-hidden />
      <div
        className={
          scroll
            ? 'relative z-[1] flex max-h-[40vh] min-h-0 w-full flex-col items-center overflow-y-auto overflow-x-hidden rounded-full'
            : 'relative z-[1] flex w-full flex-col items-center'
        }
      >
        {children}
      </div>
    </div>
  )
}

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
/** Duo tabs. Following stays in More. Home stays visible; the rest hide behind the caret. */
const DUO_NAV_ORDER = ['home', 'search', 'notifications', 'chat', 'settings']
const DUO_NAV_EXTRA_IDS = ['search', 'notifications', 'chat', 'settings']

/**
 * iPad portrait and landscape, plus phone landscape.
 * Phone portrait keeps the FAB dock.
 * Open Duo: trailing Music strip (no E). Menu under wifi (caret at bottom); shortcuts mid; compose at bottom.
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
  const [duoExtrasOpen, setDuoExtrasOpen] = useState(false)

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
  const compose = byId.get('compose')
  const homeItem = byId.get('home')
  const extraItems = DUO_NAV_EXTRA_IDS.map((id) => byId.get(id)).filter(Boolean)
  const collapseDuoExtras = () => setDuoExtrasOpen(false)

  useEffect(() => {
    if (!navEnd || !duoExtrasOpen) return undefined
    const onPointerDown = (event) => {
      const target = event.target
      if (!(target instanceof Element)) {
        collapseDuoExtras()
        return
      }
      // Stay open for caret toggle / items inside the tabs pill; dismiss everywhere else.
      if (target.closest('[data-duo-nav-tabs]')) return
      collapseDuoExtras()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [navEnd, duoExtrasOpen])

  if (navEnd) {
    const pillStyle = {
      width: DUO_NAV_PILL_WIDTH_PX,
      minWidth: DUO_NAV_PILL_WIDTH_PX,
      maxWidth: DUO_NAV_PILL_WIDTH_PX,
      boxSizing: 'border-box',
    }
    const composeStyle = {
      ...pillStyle,
      height: DUO_NAV_PILL_WIDTH_PX,
      minHeight: DUO_NAV_PILL_WIDTH_PX,
      maxHeight: DUO_NAV_PILL_WIDTH_PX,
    }
    return (
      <nav
        data-ipad-nav-rail
        data-duo-nav-rail
        aria-label="Lounge"
        className="fixed inset-y-0 right-0 z-[60] flex flex-col items-end bg-transparent pb-[max(0.85rem,max(env(safe-area-inset-bottom,0px),var(--edge-sab,0px)))]"
        style={{
          width: DUO_NAV_RAIL_WIDTH,
          paddingRight: DUO_NAV_PILL_TRAILING_PAD_PX,
          paddingTop: `calc(max(env(safe-area-inset-top,0px),var(--edge-sat,0px)) + ${DUO_NAV_PILL_TOP_EXTRA_PX}px)`,
        }}
      >
        {/* Menu under wifi (caret bottom, expands down); shortcuts mid; compose at bottom. */}
        <div
          data-duo-nav-column
          className="flex h-full min-h-0 flex-col items-center"
          style={{ width: DUO_NAV_PILL_WIDTH_PX }}
        >
          {onBack ? (
            <DuoGlassPill className="mb-2 shrink-0 py-1" style={pillStyle}>
              <button
                type="button"
                data-duo-nav-back
                aria-label="Back"
                onClick={() => onBack()}
                className="grid h-[50px] w-full place-items-center text-zinc-100 touch-manipulation [-webkit-tap-highlight-color:transparent]"
              >
                <span className="text-[20px] leading-none" aria-hidden>
                  ←
                </span>
              </button>
            </DuoGlassPill>
          ) : null}
          <DuoGlassPill data-duo-nav-tabs="" className="shrink-0 py-1" style={pillStyle}>
            {homeItem ? (
              <RailButton item={withDuoCollapse(homeItem, collapseDuoExtras)} compact />
            ) : null}
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
                onClick={() => {
                  collapseDuoExtras()
                  onOpenShellMenu()
                }}
                className="relative grid h-[50px] w-full place-items-center text-zinc-200 touch-manipulation [-webkit-tap-highlight-color:transparent]"
              >
                <span aria-hidden className="block leading-none text-xl -translate-y-px">
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
            {duoExtrasOpen
              ? extraItems.map((item) => (
                  <RailButton
                    key={item.id}
                    item={withDuoCollapse(item, collapseDuoExtras)}
                    compact
                  />
                ))
              : null}
            {extraItems.length > 0 ? (
              <button
                type="button"
                data-duo-nav-expand
                aria-label={duoExtrasOpen ? 'Hide extra navigation' : 'Show extra navigation'}
                aria-expanded={duoExtrasOpen}
                onClick={() => setDuoExtrasOpen((open) => !open)}
                className="grid h-[44px] w-full place-items-center text-zinc-300 touch-manipulation [-webkit-tap-highlight-color:transparent]"
              >
                <DuoCaretIcon open={duoExtrasOpen} />
              </button>
            ) : null}
          </DuoGlassPill>
          <div className="min-h-0 flex-1" aria-hidden />
          <div className="flex shrink-0 flex-col items-center gap-2" data-duo-nav-bottom>
            {shortcuts ? (
              <DuoGlassPill data-duo-nav-shortcuts-pill="" scroll style={pillStyle}>
                {shortcuts}
              </DuoGlassPill>
            ) : null}
            {compose ? (
              <DuoGlassPill data-duo-nav-compose="" style={composeStyle}>
                <RailButton item={compose} compact />
              </DuoGlassPill>
            ) : null}
          </div>
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

/** Chevron caret. Collapsed points down (expand down); open points up. */
function DuoCaretIcon({ open = false }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      aria-hidden
      className="block h-5 w-5"
    >
      <path
        d={open ? 'M6.5 14.5 12 9l5.5 5.5' : 'M6.5 9.5 12 15l5.5-5.5'}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
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
          ? 'relative grid h-[50px] w-full place-items-center text-zinc-200 touch-manipulation [-webkit-tap-highlight-color:transparent] disabled:opacity-40 data-[active=1]:text-white'
          : 'relative grid h-[4.5rem] w-[4.5rem] place-items-center text-zinc-300 touch-manipulation [-webkit-tap-highlight-color:transparent] disabled:opacity-40 data-[active=1]:text-white'
      }
    >
      <span
        className={compact ? 'block h-[24px] w-[24px]' : 'block h-9 w-9'}
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
