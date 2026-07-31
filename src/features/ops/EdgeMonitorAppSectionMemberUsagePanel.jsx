import { CALCULATOR_CATALOG_ENTRIES } from '../calculators/calculatorAccess.js'
import { appProductSectionLabel } from '../../constants/appProductSections.js'
import { formatOpsMonitorCount, formatOpsMonitorRelativeTime } from './opsMonitorApi.js'
import {
  formatOpsRosterHandle,
  opsMonitorProfileHref,
} from './opsMonitorSubscriberRoster.js'
import { OPS_SECTION_THEMES } from './opsMonitorTheme.js'

/** @param {string | null | undefined} key */
function calculatorLabel(key) {
  const id = String(key || '').trim().toLowerCase()
  return CALCULATOR_CATALOG_ENTRIES.find((row) => row.key === id)?.title || id || 'Unknown'
}

/**
 * @param {{
 *   data: object | null | undefined,
 *   loading?: boolean,
 *   error?: string,
 *   searchInput?: string,
 *   onSearchInputChange?: (value: string) => void,
 *   onSearch?: () => void,
 *   onClearSearch?: () => void,
 * }} props
 */
export default function EdgeMonitorAppSectionMemberUsagePanel({
  data,
  loading = false,
  error = '',
  searchInput = '',
  onSearchInputChange,
  onSearch,
  onClearSearch,
}) {
  const theme = OPS_SECTION_THEMES.users
  const topMembers = data?.top_members || []
  const member = data?.member
  const topLimit = data?.top_limit ?? 25

  return (
    <section
      className="edge-monitor-panel rounded-2xl border border-zinc-800 bg-zinc-900 p-4 lg:p-5 mb-4 lg:col-span-full"
      data-edge-monitor-section-member-usage
      style={{ borderLeftWidth: 3, borderLeftColor: theme.accent }}
    >
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-lg" aria-hidden>
              {theme.icon}
            </span>
            <div className="text-white font-bold text-[15px]">Member activity</div>
          </div>
          <div className="text-zinc-500 text-xs mt-0.5 leading-relaxed">
            Top {topLimit} active members (7d) · search by handle for section / calculator / session breakdown
          </div>
        </div>
        {data?.generated_at ? (
          <div className="text-zinc-500 text-[10px] tabular-nums">
            Updated {new Date(data.generated_at).toLocaleString(undefined, { hour: 'numeric', minute: '2-digit' })}
          </div>
        ) : null}
      </div>

      <form
        className="mb-3 flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          onSearch?.()
        }}
      >
        <input
          type="search"
          value={searchInput}
          onChange={(e) => onSearchInputChange?.(e.target.value)}
          placeholder="Lookup @handle"
          className="min-w-[180px] flex-1 rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white placeholder:text-zinc-500"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
        <button
          type="submit"
          className="rounded-xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white touch-manipulation active:bg-cyan-500"
        >
          Search
        </button>
        {searchInput ? (
          <button
            type="button"
            onClick={() => onClearSearch?.()}
            className="rounded-xl border border-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-300 touch-manipulation"
          >
            Clear
          </button>
        ) : null}
      </form>

      {error ? (
        <div className="mb-3 rounded-xl border border-amber-500/30 bg-amber-950/25 px-3 py-2 text-amber-100 text-xs">
          {error} ... apply migrations <span className="font-mono">20260731222000</span>–<span className="font-mono">22100</span>.
        </div>
      ) : null}

      {member?.not_found ? (
        <div className="mb-3 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-3 text-zinc-400 text-xs">
          No member found for {formatOpsRosterHandle(member.handle)}.
        </div>
      ) : null}

      {member?.excluded ? (
        <div className="mb-3 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-3 text-zinc-400 text-xs">
          {formatOpsRosterHandle(member.handle)} is excluded from product analytics (admin, blocklist, or bot account).
        </div>
      ) : null}

      {member?.user_id ? (
        <MemberDetailCard member={member} />
      ) : null}

      {loading && !data ? (
        <div className="edge-monitor-shimmer h-20 rounded-xl bg-zinc-800/60" />
      ) : null}

      {data ? (
        <div className="overflow-x-auto rounded-xl border border-zinc-800">
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead className="bg-zinc-950 text-zinc-500 uppercase text-[10px]">
              <tr>
                <th className="px-3 py-2 font-semibold">Member</th>
                <th className="px-3 py-2 font-semibold text-right">Events 7d</th>
                <th className="px-3 py-2 font-semibold text-right">Tab 7d</th>
                <th className="px-3 py-2 font-semibold text-right">Sessions 7d</th>
                <th className="px-3 py-2 font-semibold">Top section</th>
                <th className="px-3 py-2 font-semibold text-right">Last active</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/80">
              {topMembers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-4 text-zinc-500">
                    No member activity in the last 7 days yet.
                  </td>
                </tr>
              ) : (
                topMembers.map((row) => {
                  const href = opsMonitorProfileHref(row)
                  return (
                    <tr key={row.user_id} className="bg-zinc-950/40">
                      <td className="px-3 py-2.5">
                        {href ? (
                          <a href={href} className="font-semibold text-cyan-300 hover:text-cyan-200">
                            {formatOpsRosterHandle(row.handle)}
                          </a>
                        ) : (
                          <span className="font-semibold text-zinc-100">{formatOpsRosterHandle(row.handle)}</span>
                        )}
                        {row.display_name ? (
                          <div className="text-zinc-500 text-[10px] truncate max-w-[160px]">{row.display_name}</div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-zinc-200">
                        {formatOpsMonitorCount(row.events_7d)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-zinc-300">
                        {formatOpsMonitorCount(row.tab_visits_7d)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-zinc-300">
                        {formatOpsMonitorCount(row.sessions_7d)}
                      </td>
                      <td className="px-3 py-2.5 text-zinc-300">
                        {row.top_section_label || appProductSectionLabel(row.top_section_id) || '—'}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-zinc-400">
                        {formatOpsMonitorRelativeTime(row.last_active_at)}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  )
}

/** @param {{ member: Record<string, unknown> }} props */
function MemberDetailCard({ member }) {
  const sections = member.sections || []
  const calculators = member.calculators || []
  const sessionBreakdown = member.session_breakdown || []
  const href = opsMonitorProfileHref(member)

  return (
    <div className="mb-3 rounded-xl border border-cyan-500/20 bg-cyan-950/10 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-white font-bold text-sm">
            {href ? (
              <a href={href} className="text-cyan-300 hover:text-cyan-200">
                {formatOpsRosterHandle(member.handle)}
              </a>
            ) : (
              formatOpsRosterHandle(member.handle)
            )}
          </div>
          {member.display_name ? (
            <div className="text-zinc-400 text-xs">{String(member.display_name)}</div>
          ) : null}
        </div>
        <div className="text-right text-[10px] text-zinc-500 tabular-nums">
          <div>7d events {formatOpsMonitorCount(member.events_7d)}</div>
          <div>Last {formatOpsMonitorRelativeTime(member.last_active_at)}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
        <Stat label="Tab 24h" value={member.tab_visits_24h} />
        <Stat label="Tab 7d" value={member.tab_visits_7d} />
        <Stat label="Sessions 24h" value={member.sessions_24h} />
        <Stat label="Sessions 7d" value={member.sessions_7d} />
      </div>

      {sections.length > 0 ? (
        <DetailTable
          title="Sections (7d)"
          rows={sections.map((row) => ({
            key: row.section_id,
            label: row.label || appProductSectionLabel(row.section_id),
            primary: row.visits_7d,
            secondary: row.sessions_7d,
          }))}
          primaryLabel="Tab"
          secondaryLabel="Sessions"
        />
      ) : null}

      {calculators.length > 0 ? (
        <DetailTable
          title="Calculators (7d)"
          rows={calculators.map((row) => ({
            key: row.sub_section_id,
            label: calculatorLabel(row.sub_section_id),
            primary: row.visits_7d,
          }))}
          primaryLabel="Opens"
        />
      ) : null}

      {sessionBreakdown.length > 0 ? (
        <DetailTable
          title="Sessions saved (7d)"
          rows={sessionBreakdown.map((row) => ({
            key: `${row.section_id}:${row.sub_section_id}`,
            label: row.sub_label ? `${row.label} · ${row.sub_label}` : row.label,
            primary: row.sessions_7d,
          }))}
          primaryLabel="Count"
        />
      ) : null}
    </div>
  )
}

/** @param {{ label: string, value: unknown }} props */
function Stat({ label, value }) {
  return (
    <div className="rounded-lg bg-zinc-950/70 border border-zinc-800 px-2 py-1.5">
      <div className="text-zinc-500 text-[10px] uppercase">{label}</div>
      <div className="text-white font-bold tabular-nums text-sm">{formatOpsMonitorCount(value)}</div>
    </div>
  )
}

/**
 * @param {{
 *   title: string,
 *   rows: Array<{ key: string, label: string, primary: number, secondary?: number }>,
 *   primaryLabel: string,
 *   secondaryLabel?: string,
 * }} props
 */
function DetailTable({ title, rows, primaryLabel, secondaryLabel = '' }) {
  return (
    <div className="mb-2 overflow-x-auto rounded-lg border border-zinc-800/80">
      <div className="border-b border-zinc-800 bg-zinc-950/80 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
        {title}
      </div>
      <table className="w-full text-xs">
        <thead className="text-zinc-500 text-[10px] uppercase">
          <tr>
            <th className="px-2 py-1 text-left font-semibold">Item</th>
            <th className="px-2 py-1 text-right font-semibold">{primaryLabel}</th>
            {secondaryLabel ? (
              <th className="px-2 py-1 text-right font-semibold">{secondaryLabel}</th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-t border-zinc-800/60">
              <td className="px-2 py-1.5 text-zinc-200">{row.label}</td>
              <td className="px-2 py-1.5 text-right tabular-nums text-zinc-100">
                {formatOpsMonitorCount(row.primary)}
              </td>
              {secondaryLabel ? (
                <td className="px-2 py-1.5 text-right tabular-nums text-zinc-400">
                  {formatOpsMonitorCount(row.secondary)}
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
