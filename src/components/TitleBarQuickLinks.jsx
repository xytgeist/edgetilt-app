import {
  Calculator,
  CalendarDays,
  Wallet,
  BookOpen,
  ClipboardList,
  Club,
  ScanLine,
} from 'lucide-react'
import BarnIcon from './BarnIcon.jsx'
import NavLockGlyph from './NavLockGlyph.jsx'
import {
  QUICK_LINK_BY_ID,
  QUICK_LINK_MAX,
  QUICK_LINK_MAX_IPAD,
} from '../features/shell/quickLinkDestinations.js'
import { useQuickLinkIds } from '../features/shell/quickLinksStore.js'
import { calculatorsTabFullyGated } from '../features/calculators/calculatorAccess.js'
import { guidesTabFullyGated } from '../features/guides/guideAccess.js'

const ICONS = {
  calculators: Calculator,
  offers: CalendarDays,
  bankroll: Wallet,
  logbook: ClipboardList,
  guides: BookOpen,
  'w2g-scanner': ScanLine,
  'poker-stable': BarnIcon,
  'poker-bankroll': Club,
}

/** Title-bar tint overrides; match Slots / Poker hub tile colors. */
const ICON_CLASS = {
  guides: 'text-[#fb923c]',
  bankroll: 'text-[#34d399]',
  calculators: 'text-[#22d3ee]',
  offers: 'text-[#a78bfa]',
  logbook: 'text-[#f472b6]',
  'w2g-scanner': 'text-[#fbbf24]',
  'poker-stable': 'text-[#b4533c]',
  'poker-bankroll': 'text-[#6ee7b7]',
}

/**
 * @param {{
 *   browseMode?: string,
 *   hasSlotsEdge?: boolean,
 *   isStaff?: boolean,
 *   gatesMap?: Map<string, boolean> | null,
 *   starterUnlockedCalculatorKeys?: Set<string> | null,
 *   onNavigate: (id: string) => void,
 *   layout?: 'bar' | 'rail',
 * }} props
 */
export default function TitleBarQuickLinks({
  browseMode = 'member',
  hasSlotsEdge = false,
  isStaff = false,
  gatesMap = null,
  starterUnlockedCalculatorKeys = null,
  onNavigate,
  layout = 'bar',
}) {
  const ids = useQuickLinkIds()
  const rail = layout === 'rail'
  /** Phone shows the earliest pins. Later iPad pins stay stored and slide in if one of these is removed. */
  const shown = ids.slice(0, rail ? QUICK_LINK_MAX_IPAD : QUICK_LINK_MAX)
  if (browseMode !== 'member' || shown.length === 0) return null

  const showLocks = !isStaff && !hasSlotsEdge

  const buttons = shown.map(id => {
    const dest = QUICK_LINK_BY_ID[id]
    if (!dest) return null
    const Icon = ICONS[id]
    if (!Icon) return null
    let locked = false
    if (showLocks) {
      if (dest.requiresSlotsEdge) locked = true
      else if (dest.guidesTabGate && guidesTabFullyGated(gatesMap)) locked = true
      else if (
        id === 'calculators' &&
        calculatorsTabFullyGated(gatesMap, starterUnlockedCalculatorKeys)
      ) {
        locked = true
      }
    }
    return (
      <button
        key={id}
        type="button"
        title={locked ? 'Subscribe to unlock' : dest.label}
        aria-label={dest.label}
        onClick={() => onNavigate(id)}
        data-ipad-nav-shortcut={rail ? '' : undefined}
        className={
          rail
            ? 'relative grid h-[4.5rem] w-[4.5rem] shrink-0 place-items-center touch-manipulation [-webkit-tap-highlight-color:transparent]'
            : 'lounge-title-nav-btn relative grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-zinc-700/50 bg-zinc-800/90 text-white shadow-sm touch-manipulation hover:bg-zinc-800 [-webkit-tap-highlight-color:transparent]'
        }
      >
        <Icon
          size={rail ? 28 : 18}
          strokeWidth={rail ? 1.2 : 1.75}
          aria-hidden
          className={ICON_CLASS[id] || 'text-cyan-300/95'}
        />
        {locked ? (
          <NavLockGlyph
            className={
              rail
                ? 'pointer-events-none absolute bottom-2 right-2 h-3.5 w-3.5 text-amber-400/95'
                : 'pointer-events-none absolute -bottom-0.5 -right-0.5 h-3 w-3 text-amber-400/95'
            }
          />
        ) : null}
      </button>
    )
  })

  if (rail) {
    return (
      <div className="flex w-full flex-col items-center gap-3 py-3" data-ipad-nav-shortcuts>
        {buttons}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1.5 shrink-0" data-quick-link-bar>
      {buttons}
    </div>
  )
}
