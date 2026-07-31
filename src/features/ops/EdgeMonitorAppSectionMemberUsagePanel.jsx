import { Fragment, useState } from 'react'
import { ChevronDown } from 'lucide-react'
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

/** @param {Record<string, unknown> | null | undefined} row */
function memberHasBreakdown(row) {
  if (!row) return false
  return (
    (row.sections?.length || 0) > 0
    || (row.calculators?.length || 0) > 0
    || (row.session_breakdown?.length || 0) > 0
    || (row.lounge_activity?.length || 0) > 0
  )
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
  const topLoungeMembers = data?.top_lounge_members || []
  const member = data?.member
  const topLimit = data?.top_limit ?? 25
  const [expandedKey, setExpandedKey] = useState(null)

  const toggleExpanded = (listKey, userId) => {
    const next = `${listKey}:${userId}`
    setExpandedKey((current) => (current === next ? null : next))
  }

  const memberInLists =
    topMembers.some((row) => row.user_id === member?.user_id)
    || topLoungeMembers.some((row) => row.user_id === member?.user_id)

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
            Top {topLimit} by app usage and Lounge contributors (7d) · expand a row for full section, Lounge, calculator, and session breakdown
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
          placeholder="Lookup @handle (any member)"
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
          {error} ... apply migrations <span className="font-mono">20260731222000</span>–<span className="font-mono">22500</span>.
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

      {member?.user_id && !memberInLists ? (
        <MemberBreakdownCard member={member} className="mb-3" />
      ) : null}

      {loading && !data ? (
        <div className="edge-monitor-shimmer h-20 rounded-xl bg-zinc-800/60" />
      ) : null}

      {data ? (
        <>
          <MemberRankingTable
            title="Top app activity (7d)"
            emptyMessage="No app section activity in the last 7 days yet."
            listKey="app"
            rows={topMembers}
            expandedKey={expandedKey}
            onToggleExpanded={toggleExpanded}
            columns={[
              { key: 'events', label: 'Events 7d', value: (row) => row.events_7d },
              { key: 'tab', label: 'Tab 7d', value: (row) => row.tab_visits_7d, tone: 'muted' },
              { key: 'sessions', label: 'Sessions 7d', value: (row) => row.sessions_7d, tone: 'muted' },
              {
                key: 'top',
                label: 'Top section',
                align: 'left',
                value: (row) => row.top_section_label || appProductSectionLabel(row.top_section_id) || '—',
                tone: 'muted',
                tabular: false,
              },
              {
                key: 'last',
                label: 'Last active',
                value: (row) => formatOpsMonitorRelativeTime(row.last_active_at),
                tone: 'faint',
              },
            ]}
          />
          <MemberRankingTable
            title="Top Lounge contributors (7d)"
            emptyMessage="No Lounge posts or interactions in the last 7 days yet."
            listKey="lounge"
            rows={topLoungeMembers}
            expandedKey={expandedKey}
            onToggleExpanded={toggleExpanded}
            className="mt-4"
            columns={[
              { key: 'events', label: 'Lounge 7d', value: (row) => row.lounge_events_7d },
              { key: 'posts', label: 'Posts 7d', value: (row) => row.posts_7d, tone: 'muted' },
              { key: 'comments', label: 'Comments 7d', value: (row) => row.comments_7d, tone: 'muted' },
              {
                key: 'interactions',
                label: 'Interactions 7d',
                value: (row) => row.interactions_7d,
                tone: 'muted',
              },
              {
                key: 'last',
                label: 'Last active',
                value: (row) => formatOpsMonitorRelativeTime(row.last_lounge_at || row.last_active_at),
                tone: 'faint',
              },
            ]}
          />
        </>
      ) : null}
    </section>
  )
}

/**
 * @param {{
 *   title: string,
 *   emptyMessage: string,
 *   listKey: string,
 *   rows: Array<Record<string, unknown>>,
 *   expandedKey: string | null,
 *   onToggleExpanded: (listKey: string, userId: string) => void,
 *   columns: Array<{
 *     key: string,
 *     label: string,
 *     value: (row: Record<string, unknown>) => unknown,
 *     align?: 'left' | 'right',
 *     tone?: 'default' | 'muted' | 'faint',
 *     tabular?: boolean,
 *   }>,
 *   className?: string,
 * }} props
 */
function MemberRankingTable({
  title,
  emptyMessage,
  listKey,
  rows,
  expandedKey,
  onToggleExpanded,
  columns,
  className = '',
}) {
  return (
    <div className={className}>
      <div className="mb-2 text-white text-sm font-semibold">{title}</div>
      <div className="overflow-x-auto rounded-xl border border-zinc-800">
        <table className="w-full min-w-[720px] text-left text-xs">
          <thead className="bg-zinc-950 text-zinc-500 uppercase text-[10px]">
            <tr>
              <th className="w-8 px-2 py-2 font-semibold" aria-hidden />
              <th className="px-3 py-2 font-semibold">Member</th>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-3 py-2 font-semibold ${col.align === 'left' ? 'text-left' : 'text-right'}`}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/80">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 2} className="px-3 py-4 text-zinc-500">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const href = opsMonitorProfileHref(row)
                const rowKey = `${listKey}:${row.user_id}`
                const expanded = expandedKey === rowKey
                const hasBreakdown = memberHasBreakdown(row)

                return (
                  <Fragment key={rowKey}>
                    <tr
                      className={`bg-zinc-950/40 ${hasBreakdown ? 'cursor-pointer hover:bg-zinc-900/70' : ''} ${expanded ? 'bg-zinc-900/80' : ''}`}
                      onClick={() => {
                        if (hasBreakdown) onToggleExpanded(listKey, String(row.user_id))
                      }}
                      aria-expanded={hasBreakdown ? expanded : undefined}
                    >
                      <td className="px-2 py-2.5 text-center">
                        {hasBreakdown ? (
                          <ChevronDown
                            className={`mx-auto h-4 w-4 text-zinc-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
                            aria-hidden
                          />
                        ) : (
                          <span className="inline-block w-4" aria-hidden />
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        {href ? (
                          <a
                            href={href}
                            onClick={(e) => e.stopPropagation()}
                            className="font-semibold text-cyan-300 hover:text-cyan-200"
                          >
                            {formatOpsRosterHandle(row.handle)}
                          </a>
                        ) : (
                          <span className="font-semibold text-zinc-100">{formatOpsRosterHandle(row.handle)}</span>
                        )}
                        {row.display_name ? (
                          <div className="text-zinc-500 text-[10px] truncate max-w-[160px]">{row.display_name}</div>
                        ) : null}
                      </td>
                      {columns.map((col) => {
                        const toneClass =
                          col.tone === 'faint'
                            ? 'text-zinc-400'
                            : col.tone === 'muted'
                              ? 'text-zinc-300'
                              : 'text-zinc-200'
                        const tabular = col.tabular !== false

                        return (
                          <td
                            key={col.key}
                            className={`px-3 py-2.5 ${col.align === 'left' ? 'text-left' : 'text-right'} ${tabular ? 'tabular-nums' : ''} ${toneClass}`}
                          >
                            {col.tabular === false
                              ? String(col.value(row) ?? '—')
                              : formatOpsMonitorCount(col.value(row))}
                          </td>
                        )
                      })}
                    </tr>
                    {expanded ? (
                      <tr className="bg-zinc-950/60">
                        <td colSpan={columns.length + 2} className="px-3 py-3">
                          <MemberBreakdownBody member={row} compact />
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** @param {{ member: Record<string, unknown>, className?: string, compact?: boolean }} props */
function MemberBreakdownCard({ member, className = '', compact = false }) {
  const href = opsMonitorProfileHref(member)

  return (
    <div className={`rounded-xl border border-cyan-500/20 bg-cyan-950/10 p-3 ${className}`.trim()}>
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
          <div>
            7d{' '}
            {member.lounge_events_7d != null
              ? `Lounge ${formatOpsMonitorCount(member.lounge_events_7d)}`
              : `events ${formatOpsMonitorCount(member.events_7d)}`}
          </div>
          <div>
            Last {formatOpsMonitorRelativeTime(member.last_lounge_at || member.last_active_at)}
          </div>
        </div>
      </div>
      <MemberBreakdownBody member={member} compact={compact} />
    </div>
  )
}

/** @param {{ member: Record<string, unknown>, compact?: boolean }} props */
function MemberBreakdownBody({ member, compact = false }) {
  const sections = member.sections || []
  const calculators = member.calculators || []
  const sessionBreakdown = member.session_breakdown || []
  const loungeActivity = member.lounge_activity || []
  const hasProductSections =
    sections.length > 0 || calculators.length > 0 || sessionBreakdown.length > 0

  return (
    <>
      <div className={`grid grid-cols-2 sm:grid-cols-4 gap-2 ${compact ? 'mb-2' : 'mb-3'}`}>
        <Stat label="Tab 24h" value={member.tab_visits_24h} />
        <Stat label="Tab 7d" value={member.tab_visits_7d} />
        <Stat label="Sessions 24h" value={member.sessions_24h} />
        <Stat label="Sessions 7d" value={member.sessions_7d} />
      </div>

      {loungeActivity.length > 0 ? (
        <LoungeActivityTable rows={loungeActivity} />
      ) : null}

      {sections.length > 0 ? (
        <WindowedDetailTable
          title="App sections"
          rows={sections.map((row) => ({
            key: row.section_id,
            label: row.label || appProductSectionLabel(row.section_id),
            visits24h: row.visits_24h,
            visits7d: row.visits_7d,
            sessions24h: row.sessions_24h,
            sessions7d: row.sessions_7d,
          }))}
        />
      ) : null}

      {!hasProductSections && loungeActivity.length === 0 ? (
        <EmptyBreakdownNote text="No app section visits, logged sessions, or Lounge activity in the last 7 days." />
      ) : null}

      {calculators.length > 0 ? (
        <OpensDetailTable
          title="Calculator opens"
          rows={calculators.map((row) => ({
            key: row.sub_section_id,
            label: calculatorLabel(row.sub_section_id),
            opens24h: row.visits_24h,
            opens7d: row.visits_7d,
          }))}
        />
      ) : null}

      {sessionBreakdown.length > 0 ? (
        <CountDetailTable
          title="Sessions saved"
          rows={sessionBreakdown.map((row) => ({
            key: `${row.section_id}:${row.sub_section_id}`,
            label: row.sub_label ? `${row.label} · ${row.sub_label}` : row.label,
            count24h: row.sessions_24h,
            count7d: row.sessions_7d,
          }))}
        />
      ) : null}
    </>
  )
}

/** @param {{ text: string }} props */
function EmptyBreakdownNote({ text }) {
  return <div className="mb-2 text-[11px] text-zinc-500">{text}</div>
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

/** @param {{ rows: Array<Record<string, unknown>> }} props */
function LoungeActivityTable({ rows }) {
  const groupLabels = {
    created: 'Created',
    interactions_given: 'Interactions given',
    received: 'Received on their posts',
  }
  const groups = ['created', 'interactions_given', 'received']

  return (
    <div className="mb-2 overflow-x-auto rounded-lg border border-zinc-800/80">
      <div className="border-b border-zinc-800 bg-zinc-950/80 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
        Lounge
      </div>
      {groups.map((group) => {
        const groupRows = rows.filter((row) => row.group === group)
        if (groupRows.length === 0) return null

        return (
          <div key={group} className="border-t border-zinc-800/60 first:border-t-0">
            <div className="bg-zinc-950/50 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-600">
              {groupLabels[group] || group}
            </div>
            <table className="w-full text-xs">
              <thead className="text-zinc-500 text-[10px] uppercase">
                <tr>
                  <th className="px-2 py-1 text-left font-semibold">Metric</th>
                  <th className="px-2 py-1 text-right font-semibold">24h</th>
                  <th className="px-2 py-1 text-right font-semibold">7d</th>
                </tr>
              </thead>
              <tbody>
                {groupRows.map((row) => (
                  <tr key={String(row.metric_id)} className="border-t border-zinc-800/40">
                    <td className="px-2 py-1.5 text-zinc-200">{String(row.label || row.metric_id)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-zinc-300">
                      {formatOpsMonitorCount(row.count_24h)}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-zinc-100">
                      {formatOpsMonitorCount(row.count_7d)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      })}
    </div>
  )
}

/**
 * @param {{
 *   title: string,
 *   rows: Array<{
 *     key: string,
 *     label: string,
 *     visits24h?: number,
 *     visits7d?: number,
 *     sessions24h?: number,
 *     sessions7d?: number,
 *   }>,
 * }} props
 */
function WindowedDetailTable({ title, rows }) {
  return (
    <div className="mb-2 overflow-x-auto rounded-lg border border-zinc-800/80">
      <div className="border-b border-zinc-800 bg-zinc-950/80 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
        {title}
      </div>
      <table className="w-full min-w-[480px] text-xs">
        <thead className="text-zinc-500 text-[10px] uppercase">
          <tr>
            <th className="px-2 py-1 text-left font-semibold">Section</th>
            <th className="px-2 py-1 text-right font-semibold">Tab 24h</th>
            <th className="px-2 py-1 text-right font-semibold">Tab 7d</th>
            <th className="px-2 py-1 text-right font-semibold">Sessions 24h</th>
            <th className="px-2 py-1 text-right font-semibold">Sessions 7d</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-t border-zinc-800/60">
              <td className="px-2 py-1.5 text-zinc-200">{row.label}</td>
              <td className="px-2 py-1.5 text-right tabular-nums text-zinc-300">
                {formatOpsMonitorCount(row.visits24h)}
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums text-zinc-100">
                {formatOpsMonitorCount(row.visits7d)}
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums text-zinc-300">
                {formatOpsMonitorCount(row.sessions24h)}
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums text-zinc-100">
                {formatOpsMonitorCount(row.sessions7d)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * @param {{
 *   title: string,
 *   rows: Array<{ key: string, label: string, opens24h?: number, opens7d?: number }>,
 * }} props
 */
function OpensDetailTable({ title, rows }) {
  return (
    <div className="mb-2 overflow-x-auto rounded-lg border border-zinc-800/80">
      <div className="border-b border-zinc-800 bg-zinc-950/80 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
        {title}
      </div>
      <table className="w-full text-xs">
        <thead className="text-zinc-500 text-[10px] uppercase">
          <tr>
            <th className="px-2 py-1 text-left font-semibold">Calculator</th>
            <th className="px-2 py-1 text-right font-semibold">Opens 24h</th>
            <th className="px-2 py-1 text-right font-semibold">Opens 7d</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-t border-zinc-800/60">
              <td className="px-2 py-1.5 text-zinc-200">{row.label}</td>
              <td className="px-2 py-1.5 text-right tabular-nums text-zinc-300">
                {formatOpsMonitorCount(row.opens24h)}
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums text-zinc-100">
                {formatOpsMonitorCount(row.opens7d)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * @param {{
 *   title: string,
 *   rows: Array<{ key: string, label: string, count24h?: number, count7d?: number }>,
 * }} props
 */
function CountDetailTable({ title, rows }) {
  return (
    <div className="mb-2 overflow-x-auto rounded-lg border border-zinc-800/80">
      <div className="border-b border-zinc-800 bg-zinc-950/80 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
        {title}
      </div>
      <table className="w-full text-xs">
        <thead className="text-zinc-500 text-[10px] uppercase">
          <tr>
            <th className="px-2 py-1 text-left font-semibold">Item</th>
            <th className="px-2 py-1 text-right font-semibold">Count 24h</th>
            <th className="px-2 py-1 text-right font-semibold">Count 7d</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-t border-zinc-800/60">
              <td className="px-2 py-1.5 text-zinc-200">{row.label}</td>
              <td className="px-2 py-1.5 text-right tabular-nums text-zinc-300">
                {formatOpsMonitorCount(row.count24h)}
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums text-zinc-100">
                {formatOpsMonitorCount(row.count7d)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
