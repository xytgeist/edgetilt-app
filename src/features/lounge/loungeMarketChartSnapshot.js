/** Capture Lounge market chart screenshots (Lightweight Charts `takeScreenshot`). */

import { formatMarketChangeLine, formatMarketPrice } from '../../utils/loungeMarketCaptionParse.js'
import {
  exportMarketChartAnnotationCanvas,
  marketChartAnnotationHasInk,
  mergeAnnotationLayerOntoCanvas,
} from './loungeMarketChartAnnotation.js'
import { formatMarketChartVisibleTimeRangeLabel } from './loungeMarketChartPriceRange.js'
import { computeMarketChartVisibleWindowQuoteFromChart } from './loungeMarketChartTypes.js'

/**
 * @typedef {{
 *   label: string,
 *   color: string,
 *   dashed?: boolean,
 * }} MarketChartSnapshotLegendRow
 */

/**
 * @typedef {{
 *   ticker?: string | null,
 *   name?: string | null,
 *   logoUrl?: string | null,
 *   legendRows?: MarketChartSnapshotLegendRow[],
 *   dateRangeLabel?: string | null,
 *   priceLabel?: string | null,
 *   changeLabel?: string | null,
 *   changeUp?: boolean,
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
 * @param {string} url
 * @returns {Promise<HTMLImageElement | null>}
 */
async function loadSnapshotLogoImage(url) {
  if (!url || typeof Image === 'undefined') return null

  try {
    const res = await fetch(url, { mode: 'cors', credentials: 'omit', cache: 'force-cache' })
    if (res.ok) {
      const blob = await res.blob()
      return await new Promise((resolve) => {
        const img = new Image()
        const objectUrl = URL.createObjectURL(blob)
        img.onload = () => {
          URL.revokeObjectURL(objectUrl)
          resolve(img)
        }
        img.onerror = () => {
          URL.revokeObjectURL(objectUrl)
          resolve(null)
        }
        img.src = objectUrl
      })
    }
  } catch {
    // Logo hosts without CORS are skipped so canvas export stays clean.
  }

  return null
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} w
 * @param {number} h
 * @param {string} color
 * @param {boolean} [dashed]
 */
function drawSnapshotLegendSwatch(ctx, x, y, w, h, color, dashed = false) {
  if (dashed) {
    ctx.save()
    ctx.strokeStyle = color
    ctx.lineWidth = Math.max(2, h)
    ctx.setLineDash([Math.max(3, w * 0.18), Math.max(2, w * 0.12)])
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + w, y)
    ctx.stroke()
    ctx.restore()
    return
  }
  ctx.fillStyle = color
  ctx.fillRect(x, y - h / 2, w, h)
}

/**
 * @param {MarketChartSnapshotLegendRow[]} rows
 * @param {number} chartW
 * @returns {{
 *   bandH: number,
 *   padX: number,
 *   padY: number,
 *   fontSize: number,
 *   swatchW: number,
 *   swatchH: number,
 *   itemGap: number,
 *   lineGap: number,
 *   lineH: number,
 *   lines: Array<Array<MarketChartSnapshotLegendRow & { label: string }>>,
 * }}
 */
function planMarketChartSnapshotLegendBand(rows, chartW) {
  const padX = Math.max(20, Math.round(chartW * 0.018))
  const padY = Math.max(12, Math.round(chartW * 0.01))
  const fontSize = Math.max(18, Math.round(chartW * 0.016))
  const swatchW = Math.max(20, Math.round(chartW * 0.015))
  const swatchH = Math.max(3, Math.round(chartW * 0.0028))
  const itemGap = Math.max(18, Math.round(chartW * 0.014))
  const lineGap = Math.max(10, Math.round(chartW * 0.007))

  if (typeof document === 'undefined') {
    return {
      bandH: Math.max(40, Math.round(chartW * 0.034)),
      padX,
      padY,
      fontSize,
      swatchW,
      swatchH,
      itemGap,
      lineGap,
      lineH: fontSize + padY,
      lines: [],
    }
  }

  const measureCtx = document.createElement('canvas').getContext('2d')
  if (!measureCtx) {
    return {
      bandH: Math.max(40, Math.round(chartW * 0.034)),
      padX,
      padY,
      fontSize,
      swatchW,
      swatchH,
      itemGap,
      lineGap,
      lineH: fontSize + padY,
      lines: [],
    }
  }

  measureCtx.font = `600 ${fontSize}px system-ui, -apple-system, "Segoe UI", sans-serif`

  /** @type {Array<Array<MarketChartSnapshotLegendRow & { label: string }>>} */
  const lines = [[]]
  let lineW = 0
  const maxLineW = chartW - padX * 2

  for (const row of rows) {
    const label = String(row.label || '').trim()
    if (!label) continue
    const labelW = measureCtx.measureText(label).width
    const itemW = swatchW + Math.max(8, Math.round(fontSize * 0.45)) + labelW
    if (lineW > 0 && lineW + itemGap + itemW > maxLineW) {
      lines.push([])
      lineW = 0
    }
    if (lineW > 0) lineW += itemGap
    lineW += itemW
    lines[lines.length - 1].push({ ...row, label })
  }

  const activeLines = lines.filter((line) => line.length)
  const lineH = fontSize + padY
  const bandH =
    activeLines.length > 0
      ? padY * 2 + activeLines.length * lineH + Math.max(0, activeLines.length - 1) * lineGap
      : 0

  return {
    bandH,
    padX,
    padY,
    fontSize,
    swatchW,
    swatchH,
    itemGap,
    lineGap,
    lineH,
    lines: activeLines,
  }
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {ReturnType<typeof planMarketChartSnapshotLegendBand>} plan
 * @param {number} chartW
 * @param {number} y0
 * @param {boolean} isLight
 */
function drawMarketChartSnapshotLegendBand(ctx, plan, chartW, y0, isLight) {
  const { bandH, lines, padX, padY, fontSize, swatchW, swatchH, itemGap, lineGap, lineH } = plan
  if (!bandH || !lines.length) return 0

  const textColor = isLight ? '#3f3f46' : '#e4e4e7'
  const bg = isLight ? '#f4f4f5' : '#18181b'
  const divider = isLight ? '#e4e4e7' : '#27272a'

  ctx.fillStyle = bg
  ctx.fillRect(0, y0, chartW, bandH)
  ctx.fillStyle = divider
  ctx.fillRect(0, y0 + bandH - 1, chartW, 1)

  ctx.font = `600 ${fontSize}px system-ui, -apple-system, "Segoe UI", sans-serif`

  let y = y0 + padY
  for (const line of lines) {
    let x = padX
    const midY = y + fontSize / 2
    for (const item of line) {
      drawSnapshotLegendSwatch(ctx, x, midY, swatchW, swatchH, item.color, item.dashed)
      x += swatchW + Math.max(8, Math.round(fontSize * 0.45))
      ctx.fillStyle = textColor
      ctx.textBaseline = 'middle'
      ctx.fillText(item.label, x, midY)
      x += ctx.measureText(item.label).width + itemGap
    }
    y += lineH + lineGap
  }

  return bandH
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {HTMLImageElement} logo
 * @param {number} x
 * @param {number} y
 * @param {number} size
 * @param {boolean} isLight
 */
function drawSnapshotLogo(ctx, logo, x, y, size, isLight) {
  const r = size / 2
  const cx = x + r
  const cy = y + r
  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.clip()
  ctx.drawImage(logo, x, y, size, size)
  ctx.restore()
  ctx.strokeStyle = isLight ? '#e4e4e7' : '#3f3f46'
  ctx.lineWidth = Math.max(1, Math.round(size * 0.04))
  ctx.beginPath()
  ctx.arc(cx, cy, r - ctx.lineWidth / 2, 0, Math.PI * 2)
  ctx.stroke()
}

/**
 * Draw logo, ticker, name, and indicator legend above the chart canvas.
 * @param {HTMLCanvasElement} chartCanvas
 * @param {MarketChartSnapshotBranding} [branding]
 * @returns {Promise<HTMLCanvasElement>}
 */
export async function composeMarketChartSnapshotCanvas(chartCanvas, branding = {}) {
  const tickerRaw = String(branding.ticker || '').trim()
  const name = String(branding.name || '').trim()
  const logoUrl = String(branding.logoUrl || '').trim()
  const legendRows = Array.isArray(branding.legendRows) ? branding.legendRows : []
  const dateRangeLabel = String(branding.dateRangeLabel || '').trim()
  const priceLabel = String(branding.priceLabel || '').trim()
  const changeLabel = String(branding.changeLabel || '').trim()
  const changeUp = branding.changeUp !== false
  const hasHeader = !!(tickerRaw || name || logoUrl || dateRangeLabel || priceLabel || changeLabel)
  const hasLegend = legendRows.length > 0
  if (!hasHeader && !hasLegend) return chartCanvas

  const ticker = tickerRaw.startsWith('$') ? tickerRaw : tickerRaw ? `$${tickerRaw}` : ''
  const chartW = chartCanvas.width
  const chartH = chartCanvas.height
  const isLight = branding.isLight === true
  const bg = isLight ? '#fafafa' : '#09090b'
  const titleColor = isLight ? '#18181b' : '#fafafa'
  const tickerColor = isLight ? '#71717a' : '#a1a1aa'
  const rangeColor = isLight ? '#52525b' : '#a1a1aa'
  const changeColor = changeUp ? (isLight ? '#16a34a' : '#22c55e') : isLight ? '#dc2626' : '#ef4444'
  const divider = isLight ? '#e4e4e7' : '#27272a'
  const fontFamily = 'system-ui, -apple-system, "Segoe UI", sans-serif'

  const padX = Math.max(20, Math.round(chartW * 0.018))
  const padY = Math.max(14, Math.round(chartW * 0.012))
  const logoGap = Math.max(12, Math.round(chartW * 0.01))
  const textGap = Math.max(6, Math.round(chartW * 0.005))
  const titleSize = Math.max(32, Math.round(chartW * 0.038))
  const tickerSize = Math.max(24, Math.round(chartW * 0.028))
  const rangeSize = Math.max(20, Math.round(chartW * 0.017))
  const priceSize = Math.max(28, Math.round(chartW * 0.032))
  const changeSize = Math.max(18, Math.round(chartW * 0.014))
  const logoSize = Math.max(56, Math.round(chartW * 0.045))

  const logo = logoUrl ? await loadSnapshotLogoImage(logoUrl) : null
  const showLogo = Boolean(logo)

  const measureCtx =
    typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null
  let leftTextW = 0
  let rightBlockW = 0
  if (measureCtx) {
    if (name) {
      measureCtx.font = `700 ${titleSize}px ${fontFamily}`
      leftTextW = Math.max(leftTextW, measureCtx.measureText(name).width)
    }
    if (ticker) {
      measureCtx.font = `600 ${tickerSize}px ${fontFamily}`
      leftTextW = Math.max(leftTextW, measureCtx.measureText(ticker).width)
    }
    if (priceLabel) {
      measureCtx.font = `700 ${priceSize}px ${fontFamily}`
      rightBlockW = Math.max(rightBlockW, measureCtx.measureText(priceLabel).width)
    }
    if (changeLabel) {
      measureCtx.font = `600 ${changeSize}px ${fontFamily}`
      rightBlockW = Math.max(rightBlockW, measureCtx.measureText(changeLabel).width)
    }
  }

  const leftBlockW = padX + (showLogo ? logoSize + logoGap : 0) + leftTextW
  const rightBlockTotalW = rightBlockW > 0 ? padX + rightBlockW : 0
  const sideGutter = Math.max(leftBlockW, rightBlockTotalW, Math.round(chartW * 0.17))
  const leftTextMaxW = Math.max(48, sideGutter - padX - (showLogo ? logoSize + logoGap : 0) - padX)
  const centerMaxW = Math.max(80, chartW - sideGutter * 2)

  const leftTextBlockH = (name ? titleSize + textGap : 0) + (ticker ? tickerSize : 0)
  const rightTextBlockH =
    (priceLabel ? priceSize : 0) + (priceLabel && changeLabel ? textGap : 0) + (changeLabel ? changeSize : 0)
  const headerContentH = Math.max(showLogo ? logoSize : 0, leftTextBlockH, rightTextBlockH)
  const headerH = hasHeader ? padY * 2 + headerContentH : 0
  const legendPlan = hasLegend ? planMarketChartSnapshotLegendBand(legendRows, chartW) : null
  const legendH = legendPlan?.bandH || 0

  const out = document.createElement('canvas')
  out.width = chartW
  out.height = chartH + headerH + legendH
  const ctx = out.getContext('2d')
  if (!ctx) return chartCanvas

  ctx.fillStyle = bg
  ctx.fillRect(0, 0, chartW, headerH + legendH + chartH)

  if (hasHeader) {
    const contentTop = padY
    const logoY = contentTop + Math.round((headerContentH - logoSize) / 2)
    const textX = padX + (showLogo ? logoSize + logoGap : 0)

    if (showLogo && logo) {
      drawSnapshotLogo(ctx, logo, padX, logoY, logoSize, isLight)
    }

    let textY = contentTop + Math.round((headerContentH - leftTextBlockH) / 2)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    if (name) {
      ctx.fillStyle = titleColor
      ctx.font = `700 ${titleSize}px ${fontFamily}`
      ctx.fillText(truncateCanvasText(ctx, name, leftTextMaxW), textX, textY)
      textY += titleSize + textGap
    }
    if (ticker) {
      ctx.fillStyle = tickerColor
      ctx.font = `600 ${tickerSize}px ${fontFamily}`
      ctx.fillText(truncateCanvasText(ctx, ticker, leftTextMaxW), textX, textY)
    }

    if (dateRangeLabel) {
      ctx.fillStyle = rangeColor
      ctx.font = `600 ${rangeSize}px ${fontFamily}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(
        truncateCanvasText(ctx, dateRangeLabel, centerMaxW),
        chartW / 2,
        contentTop + headerContentH / 2,
      )
    }

    if (priceLabel || changeLabel) {
      const rightX = chartW - padX
      let quoteY = contentTop + Math.round((headerContentH - rightTextBlockH) / 2)
      ctx.textAlign = 'right'
      ctx.textBaseline = 'top'
      if (priceLabel) {
        ctx.fillStyle = titleColor
        ctx.font = `700 ${priceSize}px ${fontFamily}`
        ctx.fillText(priceLabel, rightX, quoteY)
        quoteY += priceSize + (changeLabel ? textGap : 0)
      }
      if (changeLabel) {
        ctx.fillStyle = changeColor
        ctx.font = `600 ${changeSize}px ${fontFamily}`
        ctx.fillText(changeLabel, rightX, quoteY)
      }
    }

    ctx.fillStyle = divider
    ctx.fillRect(0, headerH - 1, chartW, 1)
  }

  if (hasLegend && legendPlan) {
    drawMarketChartSnapshotLegendBand(ctx, legendPlan, chartW, headerH, isLight)
  }

  const chartY = headerH + legendH
  if (legendH > 0) {
    ctx.fillStyle = divider
    ctx.fillRect(0, chartY - 1, chartW, 1)
  }
  ctx.drawImage(chartCanvas, 0, chartY)

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
  const canvas = await composeMarketChartSnapshotCanvas(raw, branding)
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

/**
 * @param {object | null | undefined} embed
 * @param {boolean} [isLight]
 * @param {MarketChartSnapshotLegendRow[]} [legendRows]
 */
export function marketChartSnapshotBrandingFromEmbed(embed, isLight = false, legendRows = []) {
  if (!embed || typeof embed !== 'object') {
    return { ticker: '', name: '', logoUrl: '', legendRows, isLight }
  }
  const ticker = String(embed.display_symbol || embed.symbol || '').trim()
  const name = String(embed.name || embed.display_symbol || embed.symbol || '').trim()
  const logoUrl = String(embed.logo_url || embed.logo || '').trim()
  return { ticker, name, logoUrl, legendRows, isLight }
}

/**
 * Branding for Advanced chart snapshots — embed identity, visible range, and live quote.
 * @param {{
 *   embed?: object | null,
 *   isLight?: boolean,
 *   legendRows?: MarketChartSnapshotLegendRow[],
 *   chart?: import('lightweight-charts').IChartApi | null,
 *   rawBars?: Array<{ t: number, c: number }>,
 *   resolutionId?: string,
 *   chartType?: string,
 * }} opts
 */
export function marketChartSnapshotBrandingFromCapture(opts = {}) {
  const {
    embed = null,
    isLight = false,
    legendRows = [],
    chart = null,
    rawBars = [],
    resolutionId = 'D',
    chartType = 'candle',
  } = opts
  const base = marketChartSnapshotBrandingFromEmbed(embed, isLight, legendRows)
  const quote = computeMarketChartVisibleWindowQuoteFromChart(chart, rawBars, chartType)
  const changePct = Number(quote?.change_pct)
  const change = Number(quote?.change)
  const changeUp = Number.isFinite(changePct) ? changePct >= 0 : Number.isFinite(change) ? change >= 0 : true

  return {
    ...base,
    dateRangeLabel: formatMarketChartVisibleTimeRangeLabel(chart, rawBars, resolutionId),
    priceLabel: formatMarketPrice(quote?.price),
    changeLabel: formatMarketChangeLine(quote?.change, changePct),
    changeUp,
  }
}
