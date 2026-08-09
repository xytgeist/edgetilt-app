import { Spade } from 'lucide-react'
import AttentionDot from '../../components/AttentionDot.jsx'
import BarnIcon from '../../components/BarnIcon.jsx'
import ScrollLinkedEdgeTitleBarShell from '../../components/ScrollLinkedEdgeTitleBarShell.jsx'

const POKER_TOOLS = [
  {
    id: 'poker-bankroll',
    label: 'Bankroll Manager',
    Icon: Spade,
    color: '#6ee7b7',
    description: 'Cash & tourneys · swaps and stakes',
  },
  {
    id: 'poker-stable',
    label: 'Stable Manager',
    Icon: BarnIcon,
    color: '#22d3ee',
    description: 'Track horses · live updates',
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
  showBankrollAttentionDot = false,
  showStableAttentionDot = false,
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
          const comingSoon = Boolean(tool.comingSoon)
          const showAttention =
            (tool.id === 'poker-bankroll' && showBankrollAttentionDot) ||
            (tool.id === 'poker-stable' && showStableAttentionDot)
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
                <span className="block truncate text-lg font-bold text-white">{tool.label}</span>
                <span className="mt-0.5 block text-sm leading-snug text-zinc-500">{tool.description}</span>
              </span>
              {!comingSoon ? (
                <span aria-hidden className="shrink-0 text-zinc-600 text-lg">
                  →
                </span>
              ) : null}
              {comingSoon ? (
                <span
                  className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center rounded-3xl bg-zinc-950/55 backdrop-blur-[1px]"
                  aria-hidden
                >
                  <span className="rounded-full border border-zinc-500/50 bg-zinc-900/90 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-zinc-200">
                    Coming soon
                  </span>
                </span>
              ) : null}
              {showAttention ? (
                <AttentionDot className="right-3 top-3 ring-zinc-900" />
              ) : null}
            </>
          )
          if (comingSoon) {
            return (
              <div
                key={tool.id}
                data-hub-tool-card
                data-hub-tool-coming-soon
                aria-disabled="true"
                className={`${cardClass} cursor-not-allowed opacity-90`}
              >
                {body}
              </div>
            )
          }
          return (
            <button
              key={tool.id}
              type="button"
              data-hub-tool-card
              title={showAttention ? `${tool.label} · pending offer needs attention` : undefined}
              onClick={() => handleOpen(tool)}
              className={`${cardClass} touch-manipulation active:scale-[0.99] transition-transform`}
            >
              {body}
            </button>
          )
        })}
      </div>
    </ScrollLinkedEdgeTitleBarShell>
  )
}
