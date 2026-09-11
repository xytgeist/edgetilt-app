import { equationStatusMeta } from './syndicateDeskMath.js'

export function SyndicateDeskEquationList({ equations, emptyHint }) {
  const rows = Array.isArray(equations) ? equations : []
  if (!rows.length) {
    return emptyHint
      ? <p className="text-[12px] text-zinc-500">{emptyHint}</p>
      : null
  }

  return (
    <ol className="mt-2 space-y-1.5" data-syndicate-desk-equations>
      {rows.map((eq) => {
        const meta = equationStatusMeta(eq.status)
        return (
          <li
            key={eq.id}
            className="rounded-lg border border-zinc-800/80 bg-zinc-950/70 px-2.5 py-2"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[12px] font-semibold text-zinc-100">{eq.label}</p>
                <p className="text-[11px] text-zinc-500 mt-0.5">{eq.formula}</p>
              </div>
              <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ring-1 shrink-0 ${meta.className}`}>
                {meta.label}
              </span>
            </div>
            <p className="mt-1.5 text-[13px] text-zinc-200 tabular-nums">{eq.value}</p>
            <p className="mt-0.5 text-[12px] text-zinc-400 leading-snug">{eq.impact}</p>
          </li>
        )
      })}
    </ol>
  )
}
