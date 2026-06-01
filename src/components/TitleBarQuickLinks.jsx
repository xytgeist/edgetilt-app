import { Calculator, CalendarDays, Wallet, BookOpen, ClipboardList, MessageCircle } from 'lucide-react'
import NavLockGlyph from './NavLockGlyph.jsx'
import { QUICK_LINK_BY_ID } from '../features/shell/quickLinkDestinations.js'
import { useQuickLinkIds } from '../features/shell/quickLinksStore.js'
import { calculatorsTabFullyGated } from '../features/calculators/calculatorAccess.js'
import { guidesTabFullyGated } from '../features/guides/guideAccess.js'

const ICONS = {
  calculators: Calculator,
  offers: CalendarDays,
  bankroll: Wallet,
  logbook: ClipboardList,
  guides: BookOpen,
  chat: MessageCircle,
}

/**
 * @param {{
 *   browseMode?: string,
 *   hasSlotsEdge?: boolean,
 *   isStaff?: boolean,
 *   gatesMap?: Map<string, boolean> | null,
 *   onNavigate: (id: string) => void,
 * }} props
 */
export default function TitleBarQuickLinks({
  browseMode = 'member',
  hasSlotsEdge = false,
  isStaff = false,
  gatesMap = null,
  onNavigate,
}) {
  const ids = useQuickLinkIds()
  if (browseMode !== 'member' || ids.length === 0) return null

  const showLocks = !isStaff && !hasSlotsEdge

  return (
    <div className="flex items-center gap-1.5 shrink-0" data-quick-link-bar>
      {ids.map(id => {
        const dest = QUICK_LINK_BY_ID[id]
        if (!dest) return null
        const Icon = ICONS[id]
        let locked = false
        if (showLocks) {
          if (dest.requiresSlotsEdge) locked = true
          else if (dest.guidesTabGate && guidesTabFullyGated(gatesMap)) locked = true
          else if (id === 'calculators' && calculatorsTabFullyGated(gatesMap)) locked = true
        }
        return (
          <button
            key={id}
            type="button"
            title={locked ? 'Subscribe to unlock' : dest.label}
            aria-label={dest.label}
            onClick={() => onNavigate(id)}
            className="lounge-title-nav-btn relative grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-zinc-700/50 bg-zinc-800/90 text-white shadow-sm touch-manipulation hover:bg-zinc-800 [-webkit-tap-highlight-color:transparent]"
          >
            <Icon size={18} strokeWidth={1.75} aria-hidden className="text-cyan-300/95" />
            {locked ? (
              <NavLockGlyph className="pointer-events-none absolute -bottom-0.5 -right-0.5 h-3 w-3 text-amber-400/95" />
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
