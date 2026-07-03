/** Brand palette + section chrome for Edge Monitor. */

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

export const OPS_SECTION_THEMES = {
  users: { accent: OPS_CHART_COLORS.cyan, icon: '👥', gradient: 'from-cyan-500/20 via-cyan-400/5 to-transparent' },
  subs: { accent: OPS_CHART_COLORS.purple, icon: '💳', gradient: 'from-violet-500/25 via-purple-500/5 to-transparent' },
  lounge: { accent: OPS_CHART_COLORS.green, icon: '🔥', gradient: 'from-emerald-500/20 via-lv-green/5 to-transparent' },
  search: { accent: OPS_CHART_COLORS.yellow, icon: '🔎', gradient: 'from-yellow-400/15 via-amber-500/5 to-transparent' },
  chat: { accent: OPS_CHART_COLORS.orange, icon: '💬', gradient: 'from-orange-500/20 via-lv-orange/5 to-transparent' },
  tools: { accent: OPS_CHART_COLORS.pink, icon: '🎰', gradient: 'from-fuchsia-500/20 via-pink-500/5 to-transparent' },
  ops: { accent: OPS_CHART_COLORS.red, icon: '⚡', gradient: 'from-red-500/15 via-lv-red/5 to-transparent' },
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
      sub: `${subs.monthly_interval ?? 0} mo · ${subs.annual_interval ?? 0} yr`,
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
      label: 'Activity 24h',
      value: activity.events_24h,
      sub: `${chat.messages_24h ?? 0} chat msgs`,
      theme: OPS_SECTION_THEMES.chat,
    },
    {
      id: 'push',
      label: 'Push devices',
      value: push.subscriptions_total,
      sub: 'registered subs',
      theme: OPS_SECTION_THEMES.ops,
    },
  ]
}

/** @param {Array<{ label?: string, day?: string }> | null | undefined} trends */
export function opsMonitorTrendLabels(trends) {
  if (!Array.isArray(trends) || trends.length === 0) return []
  return trends.map((row, i) => {
    const label = String(row.label || '').slice(0, 3)
    if (label) return label
    if (row.day) {
      try {
        return new Date(`${row.day}T12:00:00Z`).toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 3)
      } catch {
        return `D${i + 1}`
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
