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
import { OPS_CHART_COLORS, OPS_CHART_SEQUENCE, opsMonitorChartChrome, useOpsMonitorChartIsLight } from './opsMonitorTheme.js'

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

/** @param {ReturnType<typeof opsMonitorChartChrome>} chrome */
function baseScales(chrome) {
  return {
    x: {
      grid: { color: chrome.grid, drawBorder: false },
      ticks: { color: chrome.tick, font: { size: 10, weight: '600' } },
    },
    y: {
      beginAtZero: true,
      grid: { color: chrome.grid, drawBorder: false },
      ticks: { color: chrome.tick, font: { size: 10 }, precision: 0 },
    },
  }
}

/** @param {ReturnType<typeof opsMonitorChartChrome>} chrome */
function baseTooltip(chrome, borderColor = chrome.tooltipBorder) {
  return {
    backgroundColor: chrome.tooltipBg,
    titleColor: chrome.tooltipTitle,
    bodyColor: chrome.tooltipBody,
    borderColor,
    borderWidth: 1,
    titleFont: { weight: '700' },
  }
}

/** @param {ReturnType<typeof opsMonitorChartChrome>} chrome */
function plotAreaBgPlugin(chrome) {
  if (!chrome.plotBg) return []
  return [
    {
      id: 'opsMonitorChartPlotBg',
      beforeDraw(chart) {
        const { ctx, chartArea } = chart
        if (!chartArea) return
        ctx.save()
        ctx.fillStyle = chrome.plotBg
        ctx.fillRect(
          chartArea.left,
          chartArea.top,
          chartArea.right - chartArea.left,
          chartArea.bottom - chartArea.top,
        )
        ctx.restore()
      },
    },
  ]
}

/** @param {ReturnType<typeof opsMonitorChartChrome>} chrome */
function legendOptions(chrome, position = 'bottom') {
  return {
    position,
    labels: {
      color: chrome.legend,
      boxWidth: 10,
      boxHeight: 10,
      padding: position === 'bottom' ? 14 : 10,
      font: { size: 11, weight: '600' },
    },
  }
}

export function MonitorPulseChart({ labels, datasets, height = 220 }) {
  if (!labels?.length || !datasets?.length) return null
  const isLight = useOpsMonitorChartIsLight()
  const chrome = opsMonitorChartChrome(isLight)
  return (
    <div className="edge-monitor-chart-shell rounded-2xl bg-zinc-950 border border-zinc-800 p-3" style={{ height }}>
      <Line
        data={{ labels, datasets }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: legendOptions(chrome),
            tooltip: baseTooltip(chrome, 'rgba(6, 206, 252, 0.35)'),
          },
          scales: baseScales(chrome),
        }}
        plugins={plotAreaBgPlugin(chrome)}
      />
    </div>
  )
}

export function MonitorDoughnutChart({ labels, values, colors, height = 200 }) {
  if (!labels?.length || !values?.some((v) => v > 0)) return null
  const isLight = useOpsMonitorChartIsLight()
  const chrome = opsMonitorChartChrome(isLight)
  return (
    <div className="edge-monitor-chart-shell rounded-2xl bg-zinc-950 border border-zinc-800 p-3" style={{ height }}>
      <Doughnut
        data={{
          labels,
          datasets: [
            {
              data: values,
              backgroundColor: colors,
              borderColor: chrome.doughnutBorder,
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
            legend: legendOptions(chrome),
            tooltip: baseTooltip(chrome, 'rgba(157, 0, 255, 0.35)'),
          },
        }}
      />
    </div>
  )
}

export function MonitorBarChart({ labels, values, color = OPS_CHART_COLORS.cyan, height = 200 }) {
  if (!labels?.length) return null
  const isLight = useOpsMonitorChartIsLight()
  const chrome = opsMonitorChartChrome(isLight)
  return (
    <div className="edge-monitor-chart-shell rounded-2xl bg-zinc-950 border border-zinc-800 p-3" style={{ height }}>
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
            tooltip: baseTooltip(chrome, `${color}55`),
          },
          scales: baseScales(chrome),
        }}
        plugins={plotAreaBgPlugin(chrome)}
      />
    </div>
  )
}

/** Compact single-series sparkline for 30/90d windows. */
export function MonitorSparklineChart({
  labels,
  values,
  color = OPS_CHART_COLORS.cyan,
  label = 'Trend',
  height = 120,
}) {
  if (!labels?.length || !values?.length) return null
  const isLight = useOpsMonitorChartIsLight()
  const chrome = opsMonitorChartChrome(isLight)
  return (
    <div className="edge-monitor-chart-shell rounded-2xl bg-zinc-950 border border-zinc-800 p-3" style={{ height }}>
      <Line
        data={{
          labels,
          datasets: [
            {
              label,
              data: values,
              borderColor: color,
              backgroundColor: `${color}22`,
              fill: true,
              tension: 0.3,
              pointRadius: 0,
              pointHoverRadius: 3,
              borderWidth: 2,
            },
          ],
        }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { display: false },
            tooltip: baseTooltip(chrome, `${color}55`),
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: { color: chrome.tick, font: { size: 9, weight: '600' }, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 },
            },
            y: {
              beginAtZero: true,
              grid: { color: chrome.grid, drawBorder: false },
              ticks: { color: chrome.tick, font: { size: 9, weight: '600' }, precision: 0 },
            },
          },
        }}
        plugins={plotAreaBgPlugin(chrome)}
      />
    </div>
  )
}

export function MonitorCompareBars({ items, height = 180 }) {
  if (!items?.length) return null
  const isLight = useOpsMonitorChartIsLight()
  const chrome = opsMonitorChartChrome(isLight)
  const labels = items.map((i) => i.label)
  const values24 = items.map((i) => i.v24)
  const values7 = items.map((i) => i.v7)
  return (
    <div className="edge-monitor-chart-shell rounded-2xl bg-zinc-950 border border-zinc-800 p-3" style={{ height }}>
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
              labels: { color: chrome.legend, boxWidth: 10, font: { size: 11, weight: '600' } },
            },
            tooltip: baseTooltip(chrome),
          },
          scales: baseScales(chrome),
        }}
        plugins={plotAreaBgPlugin(chrome)}
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
