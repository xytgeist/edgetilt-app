/** Capture Lounge market chart screenshots (Lightweight Charts `takeScreenshot`). */

import {
  exportMarketChartAnnotationCanvas,
  marketChartAnnotationHasInk,
  mergeAnnotationLayerOntoCanvas,
} from './loungeMarketChartAnnotation.js'

/**
 * @typedef {{
 *   ticker?: string | null,
 *   name?: string | null,
 *   isLight?: boolean,
 * }} MarketChartSnapshotBranding
 */

/**
 * @param {import('lightweight-charts').IChartApi | null | undefined} chart
 * @returns {HTMLCanvasElement}
 */
export function captureMarketChartScreenshotCanvas(chart) {
  if (!chart || typeof chart.takeScreenshot !== 'function') {
    throw new Error('Chart is not ready')
  }
  return chart.takeScreenshot()
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {number} maxWidth
 */
function truncateCanvasText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text
  let out = text
  while (out.length > 1 && ctx.measureText(`${out}…`).width > maxWidth) {
    out = out.slice(0, -1)
  }
  return `${out}…`
}

/**
 * Draw ticker + name above the chart canvas (Advanced header branding).
 * @param {HTMLCanvasElement} chartCanvas
 * @param {MarketChartSnapshotBranding} [branding]
 */
export function composeMarketChartSnapshotCanvas(chartCanvas, branding = {}) {
  const tickerRaw = String(branding.ticker || '').trim()
  const name = String(branding.name || '').trim()
  if (!tickerRaw && !name) return chartCanvas

  const ticker = tickerRaw.startsWith('$') ? tickerRaw : tickerRaw ? `$${tickerRaw}` : ''
  const chartW = chartCanvas.width
  const chartH = chartCanvas.height
  const headerH = Math.max(48, Math.round(chartW * 0.048))
  const padX = Math.max(14, Math.round(chartW * 0.014))

  const out = document.createElement('canvas')
  out.width = chartW
  out.height = chartH + headerH
  const ctx = out.getContext('2d')
  if (!ctx) return chartCanvas

  const isLight = branding.isLight === true
  const bg = isLight ? '#fafafa' : '#09090b'
  const titleColor = isLight ? '#18181b' : '#fafafa'
  const tickerColor = isLight ? '#71717a' : '#a1a1aa'
  const divider = isLight ? '#e4e4e7' : '#27272a'

  ctx.fillStyle = bg
  ctx.fillRect(0, 0, chartW, headerH + chartH)

  const titleSize = Math.max(14, Math.round(chartW * 0.015))
  const tickerSize = Math.max(12, Math.round(chartW * 0.012))
  const maxTextW = chartW - padX * 2

  const nameLineH = name ? titleSize + 3 : 0
  const tickerLineH = ticker ? tickerSize + 2 : 0
  const gap = name && ticker ? 2 : 0
  const blockH = nameLineH + gap + tickerLineH
  let y = Math.max(padX * 0.6, Math.round((headerH - blockH) / 2))

  ctx.textBaseline = 'top'
  if (name) {
    ctx.fillStyle = titleColor
    ctx.font = `700 ${titleSize}px system-ui, -apple-system, "Segoe UI", sans-serif`
    ctx.fillText(truncateCanvasText(ctx, name, maxTextW), padX, y)
    y += nameLineH + gap
  }
  if (ticker) {
    ctx.fillStyle = tickerColor
    ctx.font = `600 ${tickerSize}px system-ui, -apple-system, "Segoe UI", sans-serif`
    ctx.fillText(ticker, padX, y)
  }

  ctx.fillStyle = divider
  ctx.fillRect(0, headerH - 1, chartW, 1)
  ctx.drawImage(chartCanvas, 0, headerH)

  return out
}

/**
 * @param {HTMLCanvasElement} canvas
 * @returns {Promise<Blob>}
 */
export function marketChartScreenshotCanvasToPngBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('Could not encode image'))
      },
      'image/png',
    )
  })
}

/**
 * @typedef {import('./loungeMarketChartAnnotation.js').MarketChartAnnotationItem[]} MarketChartAnnotationItems
 */

/**
 * @param {import('lightweight-charts').IChartApi | null | undefined} chart
 * @param {string} [filename]
 * @param {MarketChartSnapshotBranding} [branding]
 * @param {MarketChartAnnotationItems} [annotationItems]
 * @returns {Promise<File>}
 */
export async function captureMarketChartPngFile(
  chart,
  filename = 'chart-snapshot.png',
  branding,
  annotationItems,
) {
  const raw = captureMarketChartScreenshotCanvas(chart)
  if (marketChartAnnotationHasInk(annotationItems)) {
    const layer = exportMarketChartAnnotationCanvas(annotationItems, raw.width, raw.height)
    mergeAnnotationLayerOntoCanvas(raw, layer)
  }
  const canvas = composeMarketChartSnapshotCanvas(raw, branding)
  const blob = await marketChartScreenshotCanvasToPngBlob(canvas)
  const safeName = String(filename || 'chart-snapshot.png').trim() || 'chart-snapshot.png'
  return new File([blob], safeName.endsWith('.png') ? safeName : `${safeName}.png`, { type: 'image/png' })
}

/**
 * Trigger a browser download for a captured chart PNG.
 * @param {File} file
 */
export function downloadMarketChartPngFile(file) {
  if (typeof document === 'undefined') throw new Error('Download not available')
  const url = URL.createObjectURL(file)
  try {
    const a = document.createElement('a')
    a.href = url
    a.download = file.name
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }
}

/**
 * Mobile-friendly label for the snapshot save menu item.
 * @returns {string}
 */
export function marketChartSnapshotSaveMenuLabel() {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  if (/iPhone|iPad|iPod/i.test(ua) || /Android/i.test(ua)) return 'Save to Photos'
  return 'Save image'
}

/**
 * Save chart PNG via native share sheet (mobile → Save to Photos) or file download.
 * @param {import('lightweight-charts').IChartApi | null | undefined} chart
 * @param {MarketChartSnapshotBranding} [branding]
 * @param {MarketChartAnnotationItems} [annotationItems]
 * @param {string} [filename]
 * @returns {Promise<'share' | 'download'>}
 */
export async function saveMarketChartScreenshot(chart, branding, annotationItems, filename) {
  const file = await captureMarketChartPngFile(
    chart,
    filename || 'chart-snapshot.png',
    branding,
    annotationItems,
  )
  const nav = typeof navigator !== 'undefined' ? navigator : null

  if (nav?.share) {
    const shareData = { files: [file] }
    const canShareFiles =
      typeof nav.canShare !== 'function' ? true : nav.canShare(shareData)
    if (canShareFiles) {
      await nav.share(shareData)
      return 'share'
    }
  }

  downloadMarketChartPngFile(file)
  return 'download'
}

/** @param {string | null | undefined} symbol */
export function marketChartSnapshotFilename(symbol) {
  const base = String(symbol || 'chart')
    .trim()
    .replace(/[^\w.-]+/g, '')
    .slice(0, 32)
  const day = new Date().toISOString().slice(0, 10)
  return `${base || 'chart'}-${day}.png`
}

/** @param {object | null | undefined} embed @param {boolean} [isLight] */
export function marketChartSnapshotBrandingFromEmbed(embed, isLight = false) {
  if (!embed || typeof embed !== 'object') {
    return { ticker: '', name: '', isLight }
  }
  const ticker = String(embed.display_symbol || embed.symbol || '').trim()
  const name = String(embed.name || embed.display_symbol || embed.symbol || '').trim()
  return { ticker, name, isLight }
}
