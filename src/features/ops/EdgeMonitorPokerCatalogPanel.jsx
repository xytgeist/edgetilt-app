import {
  opsJobHealthClass,
  opsJobHealthLabel,
  opsMonitorRunbookById,
  pokerCatalogMonitorSummary,
  pokerCatalogStatTiles,
} from './opsMonitorPokerCatalog.js'

const PANEL = 'rounded-2xl border border-zinc-800 bg-zinc-900'

/**
 * Last poker catalog sync upsert / MTTDB counts (GitHub Actions heartbeat).
 * @param {{ systemHealth: object | null, loading?: boolean }} props
 */
export default function EdgeMonitorPokerCatalogPanel({ systemHealth, loading = false }) {
  const summary = pokerCatalogMonitorSummary(systemHealth)
  const tiles = pokerCatalogStatTiles(summary)
  const runbook = opsMonitorRunbookById('poker-catalog-sync')

  return (
    <section
      className={`edge-monitor-panel ${PANEL} p-4 lg:p-5 mb-4`}
      data-edge-monitor-poker-catalog
    >
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div>
          <div className="text-white font-bold text-[15px] lg:text-base">Poker catalog sync</div>
          <div className="text-zinc-500 text-xs mt-0.5">
            Last sync from this Windows PC (Task Scheduler, 2:00 AM) · GitHub Actions is manual only
          </div>
        </div>
        {runbook?.href ? (
          <a
            href={runbook.href}
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-9 inline-flex items-center rounded-xl bg-zinc-800 px-3 text-zinc-200 text-xs font-semibold touch-manipulation hover:bg-zinc-700"
          >
            Actions ↗
          </a>
        ) : null}
      </div>

      {loading && !systemHealth ? (
        <div className="edge-monitor-shimmer h-20 rounded-xl bg-zinc-800/60" />
      ) : !summary ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-950/25 px-3 py-2 text-amber-100 text-xs">
          Catalog heartbeat not in snapshot yet. Apply migration{' '}
          <span className="font-mono">20260812120000</span> and refresh System health.
        </div>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px]">
            <span
              className={`inline-flex rounded-md px-2 py-0.5 text-[10px] font-bold ring-1 ${opsJobHealthClass(summary.health)}`}
            >
              {opsJobHealthLabel(summary.health)}
            </span>
            <span className="rounded-lg bg-zinc-950 px-2.5 py-1 text-zinc-300 ring-1 ring-zinc-700 tabular-nums">
              {summary.lastStart
                ? `Last run ${new Date(summary.lastStart).toLocaleString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}`
                : 'No run recorded'}
            </span>
            {summary.lastStatus ? (
              <span className="rounded-lg bg-zinc-950 px-2.5 py-1 text-zinc-400 ring-1 ring-zinc-700">
                Status: {summary.lastStatus}
              </span>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {tiles.map((tile) => (
              <div
                key={tile.id}
                className={`rounded-xl border border-zinc-800 bg-zinc-950/50 px-3 py-2.5 ${
                  tile.emphasize ? 'ring-1 ring-emerald-500/25' : ''
                }`}
              >
                <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                  {tile.label}
                </div>
                <div
                  className={`mt-1 text-xl font-black tabular-nums ${
                    tile.emphasize ? 'text-emerald-300' : 'text-white'
                  }`}
                >
                  {tile.value == null ? '-' : tile.value.toLocaleString()}
                </div>
              </div>
            ))}
          </div>

          {summary.mttdbBlocked ? (
            <p className="mt-3 rounded-xl border border-amber-500/30 bg-amber-950/25 px-3 py-2 text-[11px] leading-relaxed text-amber-100">
              MTTDB lobby was blocked by Cloudflare this run. Existing online/live rows were kept.
            </p>
          ) : null}

          {summary.hint ? (
            <p className="mt-3 text-[11px] leading-relaxed text-zinc-500">{summary.hint}</p>
          ) : null}
        </>
      )}
    </section>
  )
}
