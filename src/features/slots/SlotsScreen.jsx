import { Calculator, CalendarDays, Wallet, BookOpen, Radar } from 'lucide-react'
import ScrollLinkedEdgeTitleBarShell from '../../components/ScrollLinkedEdgeTitleBarShell.jsx'
import NavLockGlyph from '../../components/NavLockGlyph.jsx'
import { calculatorsTabFullyGated } from '../calculators/calculatorAccess.js'
import { guidesTabFullyGated } from '../guides/guideAccess.js'

const SLOTS_TOOLS = [
  {
    id: 'calculators',
    label: 'Calcs',
    Icon: Calculator,
    color: '#22d3ee',
    description: 'EV calculators for slot games',
    subscriberGated: (gatesMap) => calculatorsTabFullyGated(gatesMap),
  },
  {
    id: 'offers',
    label: 'Calendar',
    Icon: CalendarDays,
    color: '#a78bfa',
    description: 'Offers, mailers, and trip planning',
    subscriberGated: () => false,
  },
  {
    id: 'bankroll',
    label: 'Bankroll',
    Icon: Wallet,
    color: '#34d399',
    description: 'Track sessions and bankroll growth',
    subscriberGated: () => true,
  },
  {
    id: 'guides',
    label: 'AP Guides',
    Icon: BookOpen,
    color: '#fb923c',
    description: 'Advantage-play guides and community Q&A',
    subscriberGated: (gatesMap) => guidesTabFullyGated(gatesMap),
  },
  {
    id: 'intel',
    label: 'Intel',
    Icon: Radar,
    color: '#60a5fa',
    description: 'Local casino conditions and field reports',
    subscriberGated: () => false,
  },
]

export default function SlotsScreen({
  titleBarNavSlot = null,
  browseMode = 'member',
  onOpenAuth,
  onOpenTool,
  onRequireSubscribe,
  hasSlotsEdge = false,
  isStaff = false,
  gatesMap = null,
}) {
  const showSubscriberLocks = browseMode === 'member' && !isStaff && !hasSlotsEdge

  const handleOpen = (tool) => {
    if (browseMode !== 'member') {
      onOpenAuth?.()
      return
    }
    const locked = showSubscriberLocks && tool.subscriberGated(gatesMap)
    if (locked) {
      onRequireSubscribe?.('slots-edge')
      return
    }
    onOpenTool?.(tool.id)
  }

  return (
    <ScrollLinkedEdgeTitleBarShell
      titleBarNavSlot={titleBarNavSlot}
      contentClassName="px-3 py-6 pb-[calc(6rem+env(safe-area-inset-bottom,0px))]"
    >
      <div className="mb-6">
        <div className="text-white text-2xl font-black tracking-tight">Slots</div>
        <div className="text-zinc-400 text-sm mt-0.5">Tools for advantage slot play</div>
      </div>

      <div className="space-y-3">
        {SLOTS_TOOLS.map((tool) => {
          const locked = showSubscriberLocks && tool.subscriberGated(gatesMap)
          const { Icon, color } = tool
          return (
            <button
              key={tool.id}
              type="button"
              title={locked ? 'Subscribe to unlock Slots Edge' : undefined}
              onClick={() => handleOpen(tool)}
              className="flex w-full items-center gap-4 rounded-3xl bg-zinc-900 px-4 py-4 text-left touch-manipulation active:scale-[0.99] transition-transform"
            >
              <span
                aria-hidden
                className="slots-icon-tile grid h-12 w-12 shrink-0 place-items-center rounded-2xl backdrop-blur-md"
                style={{ '--tc': color }}
              >
                <Icon size={22} strokeWidth={1.5} style={{ color }} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-lg font-bold text-white">{tool.label}</span>
                  {locked ? <NavLockGlyph className="h-4 w-4 shrink-0 text-amber-400/95" /> : null}
                </span>
                <span className="mt-0.5 block text-sm leading-snug text-zinc-500">{tool.description}</span>
              </span>
              <span aria-hidden className="shrink-0 text-zinc-600 text-lg">
                →
              </span>
            </button>
          )
        })}
      </div>
    </ScrollLinkedEdgeTitleBarShell>
  )
}
