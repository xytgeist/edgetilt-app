/**
 * Game hub Fantasy tab league picker: a scrolling chip row of only the leagues with one of this game's players
 * (yours or your opponent's starters), each with that count. State lives in `useGameLeagueChips`.
 */

/** `action(multi)` renders the trailing button; with several chips it should shrink to make room. */
export default function GameHubLeagueChips({ chips, activeId, onPick, action = null }) {
  const multi = (chips?.length || 0) > 1
  const trailing = typeof action === 'function' ? action(multi) : action
  if (!chips?.length) return trailing
  return (
    <div data-fantasy-scoring-bar className="flex items-center gap-2 px-1">
      {chips.length === 1 ? (
        <span className="min-w-0 flex-1 truncate text-[11px] font-semibold uppercase tracking-wide text-zinc-300">
          {chips[0].name}
        </span>
      ) : (
        <div
          role="radiogroup"
          aria-label="Fantasy league"
          data-game-hub-league-chips
          className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [mask-image:linear-gradient(90deg,#000_88%,transparent)]"
        >
          {chips.map((chip) => {
            const on = chip.id === activeId
            const count = chip.total
            return (
              <button
                key={chip.id}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={`${chip.name}${count ? `, ${chip.mine} yours, ${chip.vs} against you` : ''}`}
                data-on={on || undefined}
                onClick={() => onPick(chip.id)}
                className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wide touch-manipulation transition-colors ${
                  on ? 'border-zinc-100 bg-zinc-100 text-zinc-900' : 'border-zinc-700 text-zinc-400 active:text-zinc-200'
                }`}
              >
                {chip.name}
                {count ? <span className="font-semibold tracking-normal opacity-70">{count}</span> : null}
              </button>
            )
          })}
        </div>
      )}
      {trailing}
    </div>
  )
}
