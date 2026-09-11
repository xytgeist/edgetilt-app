import { deskMeta } from './syndicateOpsDesks.js'
import { SyndicateDeskEquationList } from './SyndicateDeskEquationList.jsx'

function passLike(side) {
  const s = String(side || '').toLowerCase()
  return !s || s === 'pass'
}

function voteClass(side) {
  if (passLike(side)) return 'bg-zinc-800 text-zinc-200 border-zinc-600'
  return 'bg-amber-500/15 text-amber-100 border-amber-500/40'
}

function signalLabel(raw) {
  const key = String(raw || '')
  const map = {
    model_edge: 'model edge',
    pval: 'PVAL',
    key_soft_gap: '3/7 key',
    pasted_money: 'pasted money',
    dog_hook: 'dog + hook',
    dog_pval: 'dog + PVAL',
    short_fav: 'short-fav',
    hurt: 'hurt',
    hook_tax: 'hook tax',
    chalk_trap: 'chalk-trap',
    cfb_power: 'CFB power',
    ugly_juice: 'ugly juice',
    key_cross: 'key total',
    wind: 'wind',
    non_conf: 'non-conf',
    total_up: 'total up',
    total_down: 'total down',
    rest: 'rest',
    weather: 'weather',
    tempo: 'tempo',
    total_agree: 'under + dog',
    street_fade: 'street fade',
    under_dog_stack: 'under + dog',
  }
  return map[key] || key.replace(/_/g, ' ')
}

function VoteChip({ side, lineDisplay, teamName }) {
  const label = passLike(side) ? 'PASS' : String(lineDisplay || teamName || side)
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[12px] font-semibold ${voteClass(side)}`}>
      {label}
    </span>
  )
}

function SignalRow({ signals }) {
  if (!Array.isArray(signals) || !signals.length) return null
  return (
    <div className="flex flex-wrap gap-1 mt-1.5">
      {signals.map((s) => (
        <span
          key={s}
          className="rounded-full border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 text-[10px] text-zinc-400"
        >
          {signalLabel(s)}
        </span>
      ))}
    </div>
  )
}

/**
 * One desk's game-by-game vote + why after a Preview.
 */
export function SyndicateDeskEvalBoard({ deskId, rows, sportLabel, emptyHint }) {
  const meta = deskMeta(deskId)
  const list = Array.isArray(rows) ? rows : []

  return (
    <section
      className="rounded-xl border border-zinc-800 bg-zinc-950/80 overflow-hidden"
      aria-label={`${deskId || 'Desk'} evals`}
      data-syndicate-desk-evals
    >
      <div className="px-3 py-2.5 border-b border-zinc-800 flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[10px] uppercase tracking-[0.16em] text-zinc-500 font-semibold">
            {sportLabel || 'Preview'} · desk eval
          </p>
          <h3 className="text-sm font-bold text-zinc-50">
            {meta ? `${meta.icon} ${deskId}` : deskId} {meta?.title ? `· ${meta.title}` : ''}
          </h3>
          {meta?.lane ? <p className="text-[11px] text-zinc-500 mt-0.5 max-w-xl">{meta.lane}</p> : null}
        </div>
        <p className="text-[11px] text-zinc-500 tabular-nums">{list.length} game{list.length === 1 ? '' : 's'}</p>
      </div>

      {list.length === 0 ? (
        <p className="px-3 py-4 text-sm text-zinc-500">
          {emptyHint || 'Run Preview on Picks for today, Slate, Primetime, or UFC to see this desk vote each game.'}
        </p>
      ) : (
        <ol className="divide-y divide-zinc-800/80">
          {list.map((g) => (
            <li key={`${g.eventId}-${g.market || 'm'}`} className="px-3 py-3 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2 justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-zinc-100">
                    {g.away}/{g.home}
                  </p>
                  <p className="text-[11px] text-zinc-500">
                    {g.when || ''}
                    {g.houseBadge ? ` · ${g.houseBadge}` : ''}
                  </p>
                </div>
                <VoteChip side={g.side} lineDisplay={g.lineDisplay} teamName={g.teamName} />
              </div>
              {deskId === 'Tank' ? (
                <p className="text-[10px] uppercase tracking-wide text-zinc-500 font-semibold">Totals</p>
              ) : null}
              <p className="text-[13px] text-zinc-300 leading-snug">{g.why || 'No write-up for this vote.'}</p>
              {g.countsForHouse === false && !passLike(g.side) && deskId !== 'Tank' ? (
                <p className="text-[11px] text-orange-300/90">Lean only … does not count in the house tally.</p>
              ) : null}
              <SignalRow signals={g.signals} />
              <SyndicateDeskEquationList equations={g.equations} />
              {g.extra ? (
                <div className="mt-2 rounded-lg border border-zinc-800 bg-zinc-900/60 px-2.5 py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[10px] uppercase tracking-wide text-zinc-500 font-semibold">
                      {g.extra.label || 'ATS'}
                    </p>
                    <VoteChip
                      side={g.extra.side}
                      lineDisplay={g.extra.lineDisplay}
                      teamName={g.extra.teamName}
                    />
                  </div>
                  <p className="text-[13px] text-zinc-300 leading-snug mt-1">
                    {g.extra.why || 'No ATS write-up.'}
                  </p>
                  <SignalRow signals={g.extra.signals} />
                  <SyndicateDeskEquationList equations={g.extra.equations} />
                </div>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
