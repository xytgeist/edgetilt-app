import { Club } from 'lucide-react'
import AttentionDot from '../../components/AttentionDot.jsx'
import BarnIcon from '../../components/BarnIcon.jsx'
import QuickLinkPageToggle from '../../components/QuickLinkPageToggle.jsx'
import ScrollLinkedEdgeTitleBarShell from '../../components/ScrollLinkedEdgeTitleBarShell.jsx'
import TitleBarScreenTitle from '../../components/TitleBarScreenTitle.jsx'
import { useIpadAuthStage } from '../auth/AuthModalShell.jsx'

const POKER_TOOLS = [
  {
    id: 'poker-bankroll',
    label: 'Bankroll Manager',
    Icon: Club,
    color: '#6ee7b7',
    description: 'Cash & tourneys · swaps and stakes',
    shortcutDestinationId: 'poker-bankroll',
  },
  {
    id: 'poker-stable',
    label: 'Stable Manager',
    Icon: BarnIcon,
    color: '#b4533c',
    description: 'Track horses · live updates',
    shortcutDestinationId: 'poker-stable',
  },
]

/**
 * Poker tools hub (parallel to Slots hub).
 * Landscape: tools stay on the left; the open tool fills the right pane.
 */
export default function PokerScreen({
  titleBarNavSlot = null,
  titleBarCenterSlot = null,
  browseMode = 'member',
  onOpenAuth,
  onOpenTool,
  showBankrollAttentionDot = false,
  showStableAttentionDot = false,
  /** Landscape: tools stay on the left. The open tool fills the right pane. */
  landscapeSplit = false,
  selectedToolId = null,
  toolPane = null,
  onPaneElement = null,
}) {
  const ipadShell = useIpadAuthStage()
  const handleOpen = (tool) => {
    if (browseMode !== 'member') {
      onOpenAuth?.()
      return
    }
    onOpenTool?.(tool.id)
  }

  const toolList = (
    <div className={landscapeSplit ? 'space-y-2.5' : 'space-y-3'} data-poker-hub>
      {POKER_TOOLS.map((tool) => {
        const { Icon, color } = tool
        const comingSoon = Boolean(tool.comingSoon)
        const selected = landscapeSplit && selectedToolId === tool.id
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
              {tool.description ? (
                <span className="mt-0.5 block text-sm leading-snug text-zinc-500">{tool.description}</span>
              ) : null}
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
            ) : !comingSoon ? (
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
        // Div + role=button so Shortcut switch can live in the card without nested <button>.
        return (
          <div
            key={tool.id}
            role="button"
            tabIndex={0}
            data-hub-tool-card
            data-selected={selected ? '1' : '0'}
            title={showAttention ? `${tool.label} · pending offer needs attention` : undefined}
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
        fullWidth
        fillViewport
        slotsToolsLogo
        publishScrollReveal={false}
        contentClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
      >
        {/* Reuse Slots landscape chrome attrs so phone-compact CSS applies. */}
        <div data-slots-landscape-split className="flex min-h-0 flex-1">
          <div
            data-slots-landscape-tools
            className="flex w-1/2 shrink-0 flex-col border-r border-zinc-800/80 min-h-0"
          >
            <div
              data-slots-landscape-tools-chrome
              className="flex shrink-0 items-center justify-between gap-2 border-b border-zinc-800/95 bg-zinc-950 px-3 py-2"
            >
              <h1
                data-slots-landscape-title
                className="font-black leading-none tracking-tight text-white text-[1.25rem] sm:text-[1.5rem]"
              >
                Poker
              </h1>
              <div className="flex min-w-0 shrink-0 items-center justify-end gap-1.5">
                {titleBarCenterSlot}
                {titleBarNavSlot}
              </div>
            </div>
            <div
              data-slots-landscape-tools-scroll
              className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-3 pt-3 pb-[calc(1.5rem+max(env(safe-area-inset-bottom,0px),var(--edge-sab,0px)))]"
            >
              {toolList}
            </div>
          </div>
          <div
            ref={onPaneElement}
            data-slots-landscape-pane
            className="relative flex min-h-0 min-w-0 flex-1 flex-col"
          >
            {toolPane ||
              (selectedToolId ? null : (
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
      titleBarBrand={ipadShell ? <TitleBarScreenTitle>Poker</TitleBarScreenTitle> : null}
      contentClassName={
        ipadShell
          ? 'px-3 pt-3 pb-[calc(6rem+max(env(safe-area-inset-bottom,0px),var(--edge-sab,0px)))]'
          : 'px-3 py-6 pb-[calc(6rem+max(env(safe-area-inset-bottom,0px),var(--edge-sab,0px)))]'
      }
    >
      {ipadShell ? null : (
        <div className="mb-6">
          <div className="text-white text-2xl font-black tracking-tight">Poker</div>
          <div className="text-zinc-400 text-sm mt-0.5">Tools for cash games and tournaments</div>
        </div>
      )}
      {toolList}
    </ScrollLinkedEdgeTitleBarShell>
  )
}
