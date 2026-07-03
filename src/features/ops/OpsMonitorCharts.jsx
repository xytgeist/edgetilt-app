import {
  Chart as ChartJS,
  ArcElement,
  BarElement,
  CategoryScale,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js'
import { Bar, Doughnut, Line } from 'react-chartjs-2'
import { OPS_CHART_COLORS, OPS_CHART_SEQUENCE } from './opsMonitorTheme.js'

ChartJS.register(
  ArcElement,
  BarElement,
  CategoryScale,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
)

const GRID = 'rgba(113, 113, 122, 0.25)'
const TICK = '#a1a1aa'
const LEGEND = '#d4d4d8'

function baseScales() {
  return {
    x: {
      grid: { color: GRID, drawBorder: false },
      ticks: { color: TICK, font: { size: 10, weight: '600' } },
    },
    y: {
      beginAtZero: true,
      grid: { color: GRID, drawBorder: false },
      ticks: { color: TICK, font: { size: 10 }, precision: 0 },
    },
  }
}

export function MonitorPulseChart({ labels, datasets, height = 220 }) {
  if (!labels?.length || !datasets?.length) return null
  return (
    <div className="edge-monitor-chart-shell rounded-2xl bg-zinc-950/50 border border-zinc-800/80 p-3" style={{ height }}>
      <Line
        data={{ labels, datasets }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: {
              position: 'bottom',
              labels: { color: LEGEND, boxWidth: 10, boxHeight: 10, padding: 14, font: { size: 11 } },
            },
            tooltip: {
              backgroundColor: 'rgba(9, 9, 11, 0.92)',
              borderColor: 'rgba(6, 206, 252, 0.35)',
              borderWidth: 1,
              titleFont: { weight: '700' },
            },
          },
          scales: baseScales(),
        }}
      />
    </div>
  )
}

export function MonitorDoughnutChart({ labels, values, colors, height = 200 }) {
  if (!labels?.length || !values?.some((v) => v > 0)) return null
  return (
    <div className="edge-monitor-chart-shell rounded-2xl bg-zinc-950/50 border border-zinc-800/80 p-3" style={{ height }}>
      <Doughnut
        data={{
          labels,
          datasets: [
            {
              data: values,
              backgroundColor: colors,
              borderColor: '#09090b',
              borderWidth: 2,
              hoverOffset: 6,
            },
          ],
        }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          cutout: '62%',
          plugins: {
            legend: {
              position: 'bottom',
              labels: { color: LEGEND, boxWidth: 10, padding: 10, font: { size: 11 } },
            },
            tooltip: {
              backgroundColor: 'rgba(9, 9, 11, 0.92)',
              borderColor: 'rgba(157, 0, 255, 0.35)',
              borderWidth: 1,
            },
          },
        }}
      />
    </div>
  )
}

export function MonitorBarChart({ labels, values, color = OPS_CHART_COLORS.cyan, height = 200 }) {
  if (!labels?.length) return null
  return (
    <div className="edge-monitor-chart-shell rounded-2xl bg-zinc-950/50 border border-zinc-800/80 p-3" style={{ height }}>
      <Bar
        data={{
          labels,
          datasets: [
            {
              data: values,
              backgroundColor: `${color}cc`,
              hoverBackgroundColor: color,
              borderRadius: 8,
              borderSkipped: false,
            },
          ],
        }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: 'rgba(9, 9, 11, 0.92)',
              borderColor: `${color}55`,
              borderWidth: 1,
            },
          },
          scales: baseScales(),
        }}
      />
    </div>
  )
}

export function MonitorCompareBars({ items, height = 180 }) {
  if (!items?.length) return null
  const labels = items.map((i) => i.label)
  const values24 = items.map((i) => i.v24)
  const values7 = items.map((i) => i.v7)
  return (
    <div className="edge-monitor-chart-shell rounded-2xl bg-zinc-950/50 border border-zinc-800/80 p-3" style={{ height }}>
      <Bar
        data={{
          labels,
          datasets: [
            {
              label: '24h',
              data: values24,
              backgroundColor: `${OPS_CHART_COLORS.cyan}bb`,
              borderRadius: 6,
            },
            {
              label: '7d',
              data: values7,
              backgroundColor: `${OPS_CHART_COLORS.purple}99`,
              borderRadius: 6,
            },
          ],
        }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'top',
              align: 'end',
              labels: { color: LEGEND, boxWidth: 10, font: { size: 11 } },
            },
            tooltip: { backgroundColor: 'rgba(9, 9, 11, 0.92)' },
          },
          scales: baseScales(),
        }}
      />
    </div>
  )
}

/** Build multi-line pulse datasets from trend rows. */
export function buildPulseDatasets(trends) {
  if (!Array.isArray(trends) || trends.length === 0) return []
  return [
    {
      label: 'Signups',
      data: trends.map((r) => Number(r.signups) || 0),
      borderColor: OPS_CHART_COLORS.cyan,
      backgroundColor: `${OPS_CHART_COLORS.cyan}22`,
      fill: true,
      tension: 0.35,
      pointRadius: 3,
      pointHoverRadius: 5,
    },
    {
      label: 'Posts',
      data: trends.map((r) => Number(r.posts) || 0),
      borderColor: OPS_CHART_COLORS.green,
      backgroundColor: `${OPS_CHART_COLORS.green}18`,
      fill: true,
      tension: 0.35,
      pointRadius: 3,
    },
    {
      label: 'Activity',
      data: trends.map((r) => Number(r.activity) || 0),
      borderColor: OPS_CHART_COLORS.purple,
      backgroundColor: `${OPS_CHART_COLORS.purple}18`,
      fill: true,
      tension: 0.35,
      pointRadius: 3,
    },
    {
      label: 'Chat',
      data: trends.map((r) => Number(r.chat_messages) || 0),
      borderColor: OPS_CHART_COLORS.orange,
      backgroundColor: 'transparent',
      fill: false,
      tension: 0.35,
      pointRadius: 2,
      borderDash: [4, 3],
    },
  ]
}

export function breakdownToDoughnut(rows, labelKey, colorOffset = 0) {
  if (!Array.isArray(rows) || rows.length === 0) return { labels: [], values: [], colors: [] }
  const labels = rows.map((r) => String(r[labelKey] || '?'))
  const values = rows.map((r) => Number(r.count) || 0)
  const colors = labels.map((_, i) => OPS_CHART_SEQUENCE[(i + colorOffset) % OPS_CHART_SEQUENCE.length])
  return { labels, values, colors }
}
