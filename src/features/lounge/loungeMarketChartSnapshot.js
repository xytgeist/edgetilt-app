/** Capture Lounge market chart screenshots (Lightweight Charts `takeScreenshot`). */

import { formatMarketChangeLine, formatMarketPrice } from '../../utils/loungeMarketCaptionParse.js'
import { loungeMarketLogoImageBlob } from '../../utils/loungeMarketApi.js'
import {
  exportMarketChartAnnotationCanvas,
  marketChartAnnotationHasInk,
  mergeAnnotationLayerOntoCanvas,
} from './loungeMarketChartAnnotation.js'
import { computeMarketChartVisibleWindowQuoteFromChart } from './loungeMarketChartTypes.js'

const MARKET_CHART_EDGE_LOGO = {
  dark: '/edge-lounge-logo-transparent.png',
  light: '/edge-lounge-logo-light.png',
  aspect: 77 / 19,
}

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
 *   priceLabel?: string | null,
 *   changeLabel?: string | null,
 *   changeUp?: boolean,
 *   isLight?: boolean,
 *   supabase?: import('@supabase/supabase-js').SupabaseClient | null,
 *   symbol?: string | null,
 *   asset_class?: string | null,
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
 * @param {Blob} blob
 * @returns {Promise<HTMLImageElement | null>}
 */
function blobToSnapshotLogoImage(blob) {
  return new Promise((resolve) => {
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

/**
 * @param {string} url
 * @param {{ supabase?: import('@supabase/supabase-js').SupabaseClient | null, symbol?: string | null, asset_class?: string | null }} [opts]
 * @returns {Promise<HTMLImageElement | null>}
 */
async function loadSnapshotLogoImage(url, opts = {}) {
  const logoUrl = String(url || '').trim()
  if (typeof document === 'undefined') return null
  if (!logoUrl && !opts.symbol) return null

  if (logoUrl) {
    try {
      const res = await fetch(logoUrl, { mode: 'cors', credentials: 'omit', cache: 'force-cache' })
      if (res.ok) {
        const img = await blobToSnapshotLogoImage(await res.blob())
        if (img) return img
      }
    } catch {
      // Most logo CDNs block browser CORS - use Edge proxy for snapshots.
    }
  }

  if (opts.supabase) {
    const blob = await loungeMarketLogoImageBlob(opts.supabase, {
      url: logoUrl,
      symbol: opts.symbol,
      asset_class: opts.asset_class,
    })
    if (blob) {
      const img = await blobToSnapshotLogoImage(blob)
      if (img) return img
    }
  }

  return null
}

/**
 * @param {boolean} isLight
 * @returns {Promise<HTMLImageElement | null>}
 */
async function loadSnapshotEdgeLogo(isLight) {
  if (typeof document === 'undefined') return null
  const path = isLight ? MARKET_CHART_EDGE_LOGO.light : MARKET_CHART_EDGE_LOGO.dark
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const url = `${origin}${path}`

  try {
    const res = await fetch(url, { cache: 'force-cache' })
    if (res.ok) {
      const img = await blobToSnapshotLogoImage(await res.blob())
      if (img) return img
    }
  } catch {
    /* fall through to Image() */
  }

  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = path
  })
}

/**
 * @param {MarketChartSnapshotLegendRow[]} rows
 * @param {number} chartW
 * @returns {{
 *   margin: number,
 *   padX: number,
 *   padY: number,
 *   titleSize: number,
 *   titleGap: number,
 *   rowSize: number,
 *   rowGap: number,
 *   swatchW: number,
 *   swatchH: number,
 *   swatchGap: number,
 *   cardW: number,
 *   cardH: number,
 *   rows: Array<MarketChartSnapshotLegendRow & { label: string, labelW: number }>,
 * }}
 */
function planMarketChartSnapshotFloatingLegend(rows, chartW) {
  const margin = Math.max(12, Math.round(chartW * 0.008))
  const padX = Math.max(10, Math.round(chartW * 0.012))
  const padY = Math.max(8, Math.round(chartW * 0.01))
  const titleSize = Math.max(16, Math.round(chartW * 0.011))
  const titleGap = Math.max(6, Math.round(chartW * 0.004))
  const rowSize = Math.max(18, Math.round(chartW * 0.013))
  const rowGap = Math.max(8, Math.round(chartW * 0.005))
  const swatchW = Math.max(18, Math.round(chartW * 0.015))
  const swatchH = Math.max(3, Math.round(chartW * 0.0012))
  const swatchGap = Math.max(8, Math.round(chartW * 0.006))
  const maxCardW = Math.max(200, Math.round(chartW * 0.22))

  /** @type {Array<MarketChartSnapshotLegendRow & { label: string, labelW: number }>} */
  const validRows = []
  let maxRowW = 0

  if (typeof document !== 'undefined') {
    const measureCtx = document.createElement('canvas').getContext('2d')
    if (measureCtx) {
      measureCtx.font = `600 ${rowSize}px system-ui, -apple-system, "Segoe UI", sans-serif`
      for (const row of rows) {
        const label = String(row.label || '').trim()
        if (!label) continue
        const labelW = Math.min(measureCtx.measureText(label).width, maxCardW - padX * 2 - swatchW - swatchGap)
        maxRowW = Math.max(maxRowW, swatchW + swatchGap + labelW)
        validRows.push({ ...row, label, labelW })
      }
    }
  }

  if (!validRows.length) {
    for (const row of rows) {
      const label = String(row.label || '').trim()
      if (!label) continue
      validRows.push({ ...row, label, labelW: label.length * rowSize * 0.55 })
      maxRowW = Math.max(maxRowW, swatchW + swatchGap + label.length * rowSize * 0.55)
    }
  }

  const cardW = Math.min(maxCardW, Math.max(padX * 2 + maxRowW, Math.round(chartW * 0.12)))
  const cardH =
    validRows.length > 0
      ? padY * 2 + titleSize + titleGap + validRows.length * rowSize + (validRows.length - 1) * rowGap
      : 0

  return {
    margin,
    padX,
    padY,
    titleSize,
    titleGap,
    rowSize,
    rowGap,
    swatchW,
    swatchH,
    swatchGap,
    cardW,
    cardH,
    rows: validRows,
  }
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} w
 * @param {number} h
 * @param {number} r
 */
function pathRoundedRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.lineTo(x + w - radius, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius)
  ctx.lineTo(x + w, y + h - radius)
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h)
  ctx.lineTo(x + radius, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius)
  ctx.lineTo(x, y + radius)
  ctx.quadraticCurveTo(x, y, x + radius, y)
  ctx.closePath()
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} w
 * @param {number} h
 * @param {number} r
 */
function fillRoundedRect(ctx, x, y, w, h, r) {
  pathRoundedRect(ctx, x, y, w, h, r)
  ctx.fill()
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} midY
 * @param {number} w
 * @param {number} h
 * @param {string} color
 * @param {boolean} [dashed]
 */
function drawSnapshotFloatingLegendSwatch(ctx, x, midY, w, h, color, dashed = false) {
  if (dashed) {
    ctx.save()
    ctx.strokeStyle = color
    ctx.lineWidth = Math.max(2, h * 2)
    ctx.setLineDash([Math.max(3, w * 0.2), Math.max(2, w * 0.15)])
    ctx.beginPath()
    ctx.moveTo(x, midY)
    ctx.lineTo(x + w, midY)
    ctx.stroke()
    ctx.restore()
    return
  }
  const top = midY - h / 2
  const r = h / 2
  ctx.fillStyle = color
  fillRoundedRect(ctx, x, top, w, h, r)
}

/**
 * Floating on-chart legend - matches Advanced `MarketChartFloatingIndicatorLegend`.
 * @param {CanvasRenderingContext2D} ctx
 * @param {ReturnType<typeof planMarketChartSnapshotFloatingLegend>} plan
 * @param {number} chartX
 * @param {number} chartY
 * @param {boolean} isLight
 */
function drawMarketChartSnapshotFloatingLegend(ctx, plan, chartX, chartY, isLight) {
  if (!plan?.rows?.length || !plan.cardH) return

  const x = chartX + plan.margin
  const y = chartY + plan.margin
  const { cardW, cardH, padX, padY, titleSize, titleGap, rowSize, rowGap, swatchW, swatchH, swatchGap } = plan
  const fontFamily = 'system-ui, -apple-system, "Segoe UI", sans-serif'
  const borderColor = isLight ? 'rgba(228, 228, 231, 0.85)' : 'rgba(63, 63, 70, 0.85)'
  const bg = isLight ? 'rgba(250, 250, 250, 0.92)' : 'rgba(9, 9, 11, 0.88)'
  const titleColor = isLight ? '#71717a' : '#a1a1aa'
  const rowColor = isLight ? '#27272a' : '#e4e4e7'
  const radius = Math.max(6, Math.round(cardW * 0.018))

  ctx.save()
  ctx.fillStyle = bg
  fillRoundedRect(ctx, x, y, cardW, cardH, radius)
  pathRoundedRect(ctx, x, y, cardW, cardH, radius)
  ctx.strokeStyle = borderColor
  ctx.lineWidth = Math.max(1, Math.round(cardW * 0.0015))
  ctx.stroke()

  let cursorY = y + padY
  ctx.fillStyle = titleColor
  ctx.font = `600 ${titleSize}px ${fontFamily}`
  ctx.textBaseline = 'top'
  ctx.textAlign = 'left'
  ctx.fillText('LEGEND', x + padX, cursorY)
  cursorY += titleSize + titleGap

  ctx.font = `600 ${rowSize}px ${fontFamily}`
  for (const row of plan.rows) {
    const rowMidY = cursorY + rowSize / 2
    drawSnapshotFloatingLegendSwatch(ctx, x + padX, rowMidY, swatchW, swatchH, row.color, row.dashed)
    ctx.fillStyle = rowColor
    ctx.textBaseline = 'middle'
    ctx.fillText(truncateCanvasText(ctx, row.label, row.labelW), x + padX + swatchW + swatchGap, rowMidY)
    cursorY += rowSize + rowGap
  }
  ctx.restore()
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
  const priceLabel = String(branding.priceLabel || '').trim()
  const changeLabel = String(branding.changeLabel || '').trim()
  const changeUp = branding.changeUp !== false
  const hasHeader = !!(tickerRaw || name || logoUrl || priceLabel || changeLabel)
  const hasLegend = legendRows.length > 0
  if (!hasHeader && !hasLegend) return chartCanvas

  const ticker = tickerRaw.startsWith('$') ? tickerRaw : tickerRaw ? `$${tickerRaw}` : ''
  const chartW = chartCanvas.width
  const chartH = chartCanvas.height
  const isLight = branding.isLight === true
  const bg = isLight ? '#fafafa' : '#09090b'
  const titleColor = isLight ? '#18181b' : '#fafafa'
  const tickerColor = isLight ? '#71717a' : '#a1a1aa'
  const changeColor = changeUp ? (isLight ? '#16a34a' : '#22c55e') : isLight ? '#dc2626' : '#ef4444'
  const divider = isLight ? '#e4e4e7' : '#27272a'
  const fontFamily = 'system-ui, -apple-system, "Segoe UI", sans-serif'

  const padX = Math.max(20, Math.round(chartW * 0.018))
  const padY = Math.max(14, Math.round(chartW * 0.012))
  const logoGap = Math.max(12, Math.round(chartW * 0.01))
  const textGap = Math.max(6, Math.round(chartW * 0.005))
  const titleSize = Math.max(32, Math.round(chartW * 0.038))
  const tickerSize = Math.max(24, Math.round(chartW * 0.028))
  const priceSize = Math.max(28, Math.round(chartW * 0.032))
  const changeSize = Math.max(18, Math.round(chartW * 0.014))
  const logoSize = Math.max(56, Math.round(chartW * 0.045))

  const logo = logoUrl
    ? await loadSnapshotLogoImage(logoUrl, {
        supabase: branding.supabase,
        symbol: branding.symbol,
        asset_class: branding.asset_class,
      })
    : null
  const edgeLogo = await loadSnapshotEdgeLogo(isLight)
  const showLogo = Boolean(logo)
  const showEdgeLogo = Boolean(edgeLogo)

  const measureCtx =
    typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null
  let centerNameW = 0
  let centerTickerW = 0
  let rightBlockW = 0
  if (measureCtx) {
    if (name) {
      measureCtx.font = `700 ${titleSize}px ${fontFamily}`
      centerNameW = measureCtx.measureText(name).width
    }
    if (ticker) {
      measureCtx.font = `600 ${tickerSize}px ${fontFamily}`
      centerTickerW = measureCtx.measureText(ticker).width
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

  const centerTextW = Math.max(centerNameW, centerTickerW)
  const centerBlockInnerW = (showLogo ? logoSize + logoGap : 0) + centerTextW
  const rightBlockTotalW = rightBlockW > 0 ? padX + rightBlockW : 0
  const leftTextBlockH = (name ? titleSize + textGap : 0) + (ticker ? tickerSize : 0)
  const rightTextBlockH =
    (priceLabel ? priceSize : 0) + (priceLabel && changeLabel ? textGap : 0) + (changeLabel ? changeSize : 0)
  const edgeLogoH = Math.max(24, Math.round(Math.min(chartW * 0.028, titleSize * 0.72)))
  const edgeLogoW = Math.round(edgeLogoH * MARKET_CHART_EDGE_LOGO.aspect)
  const headerContentH = Math.max(
    showLogo ? logoSize : 0,
    leftTextBlockH,
    rightTextBlockH,
    showEdgeLogo ? edgeLogoH : 0,
  )
  const headerH = hasHeader ? padY * 2 + headerContentH : 0
  const floatingLegendPlan = hasLegend ? planMarketChartSnapshotFloatingLegend(legendRows, chartW) : null

  const out = document.createElement('canvas')
  out.width = chartW
  out.height = chartH + headerH
  const ctx = out.getContext('2d')
  if (!ctx) return chartCanvas

  ctx.fillStyle = bg
  ctx.fillRect(0, 0, chartW, headerH + chartH)

  if (hasHeader) {
    const contentTop = padY
    const logoY = contentTop + Math.round((headerContentH - logoSize) / 2)
    const leftReserve = padX + (showEdgeLogo ? edgeLogoW + logoGap : 0)
    const rightReserve = rightBlockTotalW > 0 ? rightBlockTotalW + padX : padX
    const centerMaxW = Math.max(80, chartW - leftReserve - rightReserve - padX)
    const centerBlockW = Math.min(centerBlockInnerW, centerMaxW)
    const centerX = (chartW - centerBlockW) / 2
    const centerTextMaxW = Math.max(48, centerBlockW - (showLogo ? logoSize + logoGap : 0))
    const textX = centerX + (showLogo ? logoSize + logoGap : 0)

    if (showEdgeLogo && edgeLogo) {
      const edgeY = contentTop + Math.round((headerContentH - edgeLogoH) / 2)
      ctx.drawImage(edgeLogo, padX, edgeY, edgeLogoW, edgeLogoH)
    }

    if (showLogo && logo) {
      drawSnapshotLogo(ctx, logo, centerX, logoY, logoSize, isLight)
    }

    let textY = contentTop + Math.round((headerContentH - leftTextBlockH) / 2)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    if (name) {
      ctx.fillStyle = titleColor
      ctx.font = `700 ${titleSize}px ${fontFamily}`
      ctx.fillText(truncateCanvasText(ctx, name, centerTextMaxW), textX, textY)
      textY += titleSize + textGap
    }
    if (ticker) {
      ctx.fillStyle = tickerColor
      ctx.font = `600 ${tickerSize}px ${fontFamily}`
      ctx.fillText(truncateCanvasText(ctx, ticker, centerTextMaxW), textX, textY)
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

  const chartY = headerH
  ctx.drawImage(chartCanvas, 0, chartY)

  if (floatingLegendPlan?.rows?.length) {
    drawMarketChartSnapshotFloatingLegend(ctx, floatingLegendPlan, 0, chartY, isLight)
  }

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
 * Branding for Advanced chart snapshots - embed identity, visible range, and live quote.
 * @param {{
 *   embed?: object | null,
 *   isLight?: boolean,
 *   legendRows?: MarketChartSnapshotLegendRow[],
 *   chart?: import('lightweight-charts').IChartApi | null,
 *   rawBars?: Array<{ t: number, c: number }>,
 *   chartType?: string,
 *   supabase?: import('@supabase/supabase-js').SupabaseClient | null,
 * }} opts
 */
export function marketChartSnapshotBrandingFromCapture(opts = {}) {
  const {
    embed = null,
    isLight = false,
    legendRows = [],
    chart = null,
    rawBars = [],
    chartType = 'candle',
    supabase = null,
  } = opts
  const base = marketChartSnapshotBrandingFromEmbed(embed, isLight, legendRows)
  const quote = computeMarketChartVisibleWindowQuoteFromChart(chart, rawBars, chartType)
  const changePct = Number(quote?.change_pct)
  const change = Number(quote?.change)
  const changeUp = Number.isFinite(changePct) ? changePct >= 0 : Number.isFinite(change) ? change >= 0 : true

  return {
    ...base,
    priceLabel: formatMarketPrice(quote?.price),
    changeLabel: formatMarketChangeLine(quote?.change, changePct),
    changeUp,
    supabase,
    symbol: embed?.symbol ?? null,
    asset_class: embed?.asset_class ?? null,
  }
}
