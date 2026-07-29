import { Spade, Users } from 'lucide-react'
import ScrollLinkedEdgeTitleBarShell from '../../components/ScrollLinkedEdgeTitleBarShell.jsx'

const POKER_TOOLS = [
  {
    id: 'poker-bankroll',
    label: 'Poker Bankroll',
    Icon: Spade,
    color: '#6ee7b7',
    description: 'Cash & tourneys · live & online',
  },
  {
    id: 'poker-stable',
    label: 'Stable',
    Icon: Users,
    color: '#22d3ee',
    description: 'Track horses · per-deal On Stake sync',
  },
]

/**
 * Poker tools hub (parallel to Slots hub).
 */
export default function PokerScreen({
  titleBarNavSlot = null,
  browseMode = 'member',
  onOpenAuth,
  onOpenTool,
}) {
  const handleOpen = (tool) => {
    if (browseMode !== 'member') {
      onOpenAuth?.()
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
        <div className="text-white text-2xl font-black tracking-tight">Poker</div>
        <div className="text-zinc-400 text-sm mt-0.5">Tools for cash games and tournaments</div>
      </div>

      <div className="space-y-3">
        {POKER_TOOLS.map((tool) => {
          const { Icon, color } = tool
          return (
            <button
              key={tool.id}
              type="button"
              data-hub-tool-card
              onClick={() => handleOpen(tool)}
              className="flex w-full items-center gap-4 rounded-3xl bg-zinc-900 px-4 py-4 text-left touch-manipulation active:scale-[0.99] transition-transform"
            >
              <span
                aria-hidden
                className="slots-icon-tile grid h-12 w-12 shrink-0 place-items-center rounded-2xl backdrop-blur-md"
                style={{ '--tc': color }}
              >
                <Icon size={22} strokeWidth={1.5} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-lg font-bold text-white">{tool.label}</span>
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
