/** Brand palette + section chrome for Edge Monitor. */

import { useSyncExternalStore } from 'react'

export const OPS_CHART_COLORS = {
  cyan: '#06cefc',
  purple: '#9d00ff',
  green: '#04f265',
  red: '#fd262d',
  orange: '#fd4506',
  yellow: '#ffea00',
  pink: '#ff4fd8',
  slate: '#71717a',
}

export const OPS_CHART_SEQUENCE = [
  OPS_CHART_COLORS.cyan,
  OPS_CHART_COLORS.purple,
  OPS_CHART_COLORS.green,
  OPS_CHART_COLORS.orange,
  OPS_CHART_COLORS.yellow,
  OPS_CHART_COLORS.red,
  OPS_CHART_COLORS.pink,
]

export function opsMonitorChartIsLight() {
  return typeof document !== 'undefined' && document.documentElement.classList.contains('light')
}

function subscribeOpsMonitorChartTheme(onStoreChange) {
  if (typeof document === 'undefined') return () => {}
  const observer = new MutationObserver(onStoreChange)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  return () => observer.disconnect()
}

/** Re-renders chart components when html.light toggles. */
export function useOpsMonitorChartIsLight() {
  return useSyncExternalStore(
    subscribeOpsMonitorChartTheme,
    opsMonitorChartIsLight,
    () => false,
  )
}

/** Chart.js axis, legend, grid, and tooltip colors for Edge Monitor. */
export function opsMonitorChartChrome(isLight = opsMonitorChartIsLight()) {
  return {
    grid: isLight ? 'rgba(113, 113, 122, 0.28)' : 'rgba(113, 113, 122, 0.25)',
    tick: isLight ? '#3f3f46' : '#a1a1aa',
    legend: isLight ? '#18181b' : '#d4d4d8',
    doughnutBorder: isLight ? '#ffffff' : '#09090b',
    tooltipBg: isLight ? 'rgba(255, 255, 255, 0.98)' : 'rgba(9, 9, 11, 0.92)',
    tooltipTitle: isLight ? '#18181b' : '#fafafa',
    tooltipBody: isLight ? '#3f3f46' : '#d4d4d8',
    tooltipBorder: isLight ? 'rgba(113, 113, 122, 0.35)' : 'rgba(113, 113, 122, 0.35)',
    plotBg: isLight ? '#f4f4f5' : null,
  }
}

export const OPS_SECTION_THEMES = {
  users: { accent: OPS_CHART_COLORS.cyan, icon: '👥' },
  subs: { accent: OPS_CHART_COLORS.purple, icon: '💳' },
  lounge: { accent: OPS_CHART_COLORS.green, icon: '🔥' },
  search: { accent: OPS_CHART_COLORS.yellow, icon: '🔎' },
  chat: { accent: OPS_CHART_COLORS.orange, icon: '💬' },
  tools: { accent: OPS_CHART_COLORS.pink, icon: '🎰' },
  ops: { accent: OPS_CHART_COLORS.red, icon: '⚡' },
}

/** Hero subline for active platform subs: monthly / annual / lifetime buckets. */
export function opsMonitorActiveSubsCadenceSub(subs = {}) {
  const monthly = Number(subs.monthly_interval) || 0
  const annual = Number(subs.annual_interval) || 0
  const lifetime = Number(subs.lifetime) || 0
  return `${monthly} monthly · ${annual} annual · ${lifetime} lifetime`
}

/** @param {object | null | undefined} snapshot */
export function opsMonitorHeroKpis(snapshot) {
  if (!snapshot) return []
  const users = snapshot.users || {}
  const subs = snapshot.subscriptions || {}
  const lounge = snapshot.lounge || {}
  const chat = snapshot.chat || {}
  const activity = snapshot.activity || {}
  const push = snapshot.push || {}

  const activeSubs = (subs.active_by_product || []).reduce(
    (sum, row) => sum + (Number(row.count) || 0),
    0,
  )

  return [
    {
      id: 'users',
      label: 'Profiles',
      value: users.total_profiles,
      sub: `+${users.new_24h ?? 0} today`,
      theme: OPS_SECTION_THEMES.users,
    },
    {
      id: 'subs',
      label: 'Active subs',
      value: activeSubs,
      sub: opsMonitorActiveSubsCadenceSub(subs),
      theme: OPS_SECTION_THEMES.subs,
    },
    {
      id: 'lounge',
      label: 'Posts 24h',
      value: lounge.posts_24h,
      sub: `${lounge.comments_24h ?? 0} comments`,
      theme: OPS_SECTION_THEMES.lounge,
    },
    {
      id: 'pulse',
      label: 'Alerts 24h',
      value: activity.events_24h,
      sub: `${chat.messages_24h ?? 0} chat msgs · expand below`,
      theme: OPS_SECTION_THEMES.chat,
    },
    {
      id: 'push',
      label: 'Push devices',
      value: push.subscriptions_total,
      sub: 'registered devices',
      theme: OPS_SECTION_THEMES.ops,
    },
  ]
}

/** @param {Array<{ label?: string, day?: string, week_start?: string }> | null | undefined} trends @param {{ every?: number }} [opts] */
export function opsMonitorTrendLabels(trends, opts = {}) {
  if (!Array.isArray(trends) || trends.length === 0) return []
  const every = Math.max(1, opts.every || 1)
  return trends.map((row, i) => {
    if (every > 1 && i % every !== 0 && i !== trends.length - 1) return ''
    const label = String(row.label || '').slice(0, 6)
    if (label) return label
    if (row.day) {
      try {
        return new Date(`${row.day}T12:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      } catch {
        return `D${i + 1}`
      }
    }
    if (row.week_start) {
      try {
        return new Date(`${row.week_start}T12:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      } catch {
        return `W${i + 1}`
      }
    }
    return `D${i + 1}`
  })
}

/** @param {Array<object> | null | undefined} trends @param {string} key */
export function opsMonitorTrendSeries(trends, key) {
  if (!Array.isArray(trends)) return []
  return trends.map((row) => Number(row[key]) || 0)
}

/** @param {Array<{ count?: number }> | null | undefined} rows */
export function opsMonitorSumCounts(rows) {
  if (!Array.isArray(rows)) return 0
  return rows.reduce((sum, row) => sum + (Number(row.count) || 0), 0)
}
