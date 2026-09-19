import { Calculator, CalendarDays, Wallet, BookOpen, ClipboardList, MessageCircle, ScanLine } from 'lucide-react'
import QuickLinkPageToggle from '../../components/QuickLinkPageToggle.jsx'
import ScrollLinkedEdgeTitleBarShell from '../../components/ScrollLinkedEdgeTitleBarShell.jsx'
import NavLockGlyph from '../../components/NavLockGlyph.jsx'
import { calculatorsTabFullyGated } from '../calculators/calculatorAccess.js'
import { guidesTabFullyGated } from '../guides/guideAccess.js'

const SLOTS_TOOLS = [
  {
    id: 'guides',
    label: 'AP Guides',
    Icon: BookOpen,
    color: '#fb923c',
    description: 'Guide cards and community Q&A',
    subscriberGated: (gatesMap) => guidesTabFullyGated(gatesMap),
    shortcutDestinationId: 'guides',
  },
  {
    id: 'bankroll',
    label: 'Bankroll Manager',
    Icon: Wallet,
    color: '#34d399',
    description: 'Track sessions and bankroll growth',
    subscriberGated: () => false,
    shortcutDestinationId: 'bankroll',
  },
  {
    id: 'calculators',
    label: 'Calcs',
    Icon: Calculator,
    color: '#22d3ee',
    description: 'EV calculators for slot games',
    subscriberGated: (gatesMap, starterUnlockedCalculatorKeys) =>
      calculatorsTabFullyGated(gatesMap, starterUnlockedCalculatorKeys),
    shortcutDestinationId: 'calculators',
  },
  {
    id: 'offers',
    label: 'Calendar',
    Icon: CalendarDays,
    color: '#a78bfa',
    description: 'Offers, mailers, and trip planning',
    subscriberGated: () => false,
    shortcutDestinationId: 'offers',
  },
  {
    id: 'logbook',
    label: 'Logbook',
    Icon: ClipboardList,
    color: '#f472b6',
    description: 'Log AP plays and analyze your data',
    subscriberGated: () => false,
    shortcutDestinationId: 'logbook',
  },
  {
    id: 'w2g-scanner',
    label: 'W-2G Scanner',
    Icon: ScanLine,
    color: '#fbbf24',
    description: 'Snap a W-2G… auto-crop and center',
    subscriberGated: () => false,
    shortcutDestinationId: 'w2g-scanner',
  },
  {
    id: 'slots-pro-lounge',
    label: 'Slots Pro Lounge',
    Icon: MessageCircle,
    color: '#06b6d4',
    description: 'Pro private subscriber group chat',
    subscriberGated: () => true,
  },
  // Local Intel (`intel` tab) remains routable from AppShell for future use - not listed in hub (Ryan, 2026-05-29).
]

export default function SlotsScreen({
  titleBarNavSlot = null,
  titleBarCenterSlot = null,
  browseMode = 'member',
  onOpenAuth,
  onOpenTool,
  onRequireSubscribe,
  hasSlotsEdge = false,
  isStaff = false,
  gatesMap = null,
  starterUnlockedCalculatorKeys = null,
  /** iPad landscape: tools stay on the left. The open tool fills the right pane. */
  landscapeSplit = false,
  selectedToolId = null,
  toolPane = null,
  onPaneElement = null,
}) {
  const showSubscriberLocks = browseMode === 'member' && !isStaff && !hasSlotsEdge

  const handleOpen = (tool) => {
    if (browseMode !== 'member') {
      onOpenAuth?.()
      return
    }
    const locked =
      showSubscriberLocks && tool.subscriberGated(gatesMap, starterUnlockedCalculatorKeys)
    if (locked) {
      onRequireSubscribe?.('slots-edge')
      return
    }
    onOpenTool?.(tool.id)
  }

  const toolList = (
    <div className={landscapeSplit ? 'space-y-2.5' : 'space-y-3'} data-slots-hub>
      {SLOTS_TOOLS.map((tool) => {
        const locked =
          showSubscriberLocks && tool.subscriberGated(gatesMap, starterUnlockedCalculatorKeys)
        const selected = landscapeSplit && selectedToolId === tool.id
        const { Icon, color } = tool
        const cardClass =
          'relative flex w-full items-center gap-4 rounded-3xl bg-zinc-900 px-4 py-4 text-left'
        const body = (
          <>
            <span
              aria-hidden
              className="slots-icon-tile grid h-12 w-12 shrink-0 place-items-center rounded-2xl backdrop-blur-md"
              style={{ '--tc': color }}
            >
              <Icon size={22} strokeWidth={1.5} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex min-w-0 items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-lg font-bold text-white">{tool.label}</span>
                {locked ? <NavLockGlyph className="h-4 w-4 shrink-0 text-amber-400/95" /> : null}
              </span>
              <span className="mt-0.5 block text-sm leading-snug text-zinc-500">{tool.description}</span>
            </span>
            {tool.shortcutDestinationId ? (
              <div
                className="z-[2] shrink-0"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <QuickLinkPageToggle
                  destinationId={tool.shortcutDestinationId}
                  variant="pin"
                  pinActiveColor={color}
                />
              </div>
            ) : (
              <span aria-hidden className="shrink-0 text-zinc-600 text-lg">
                →
              </span>
            )}
          </>
        )
        return (
          <div
            key={tool.id}
            role="button"
            tabIndex={0}
            data-hub-tool-card
            data-selected={selected ? '1' : '0'}
            title={locked ? 'Subscribe to unlock Slots Edge' : undefined}
            onClick={() => handleOpen(tool)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                handleOpen(tool)
              }
            }}
            className={`${cardClass} cursor-pointer touch-manipulation active:scale-[0.99] transition-transform`}
            style={selected ? { boxShadow: `inset 3px 0 0 ${color}` } : undefined}
          >
            {body}
          </div>
        )
      })}
    </div>
  )

  if (landscapeSplit) {
    return (
      <ScrollLinkedEdgeTitleBarShell
        titleBarNavSlot={titleBarNavSlot}
        titleBarCenterSlot={titleBarCenterSlot}
        fullWidth
        fillViewport
        slotsToolsLogo
        contentClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
      >
        <div data-slots-landscape-split className="flex min-h-0 flex-1">
          <div
            data-slots-landscape-tools
            className="flex w-[min(28rem,42%)] shrink-0 flex-col border-r border-zinc-800/80 min-h-0"
          >
            <div className="shrink-0 px-3 pb-3 pt-4">
              <div className="text-white text-2xl font-black tracking-tight">Slots</div>
              <div className="text-zinc-400 text-sm mt-0.5">Tools for advantage slot play</div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-3 pb-[calc(1.5rem+max(env(safe-area-inset-bottom,0px),var(--edge-sab,0px)))]">
              {toolList}
            </div>
          </div>
          <div
            ref={onPaneElement}
            data-slots-landscape-pane
            className="relative flex min-h-0 min-w-0 flex-1 flex-col"
          >
            {toolPane || (selectedToolId ? null : (
              <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-zinc-500">
                Tap a tool to open it here.
              </div>
            ))}
          </div>
        </div>
      </ScrollLinkedEdgeTitleBarShell>
    )
  }

  return (
    <ScrollLinkedEdgeTitleBarShell
      titleBarNavSlot={titleBarNavSlot}
      titleBarCenterSlot={titleBarCenterSlot}
      contentClassName="px-3 py-6 pb-[calc(6rem+max(env(safe-area-inset-bottom,0px),var(--edge-sab,0px)))]"
    >
      <div className="mb-6">
        <div className="text-white text-2xl font-black tracking-tight">Slots</div>
        <div className="text-zinc-400 text-sm mt-0.5">Tools for advantage slot play</div>
      </div>
      {toolList}
    </ScrollLinkedEdgeTitleBarShell>
  )
}
