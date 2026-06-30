/**
 * Advanced chart time-axis tick labels by resolution (LWC tickMarkFormatter).
 * Crosshair labels stay fully detailed in loungeMarketChartViewMode.js.
 */

/** @typedef {import('./loungeMarketChartResolution.js').MarketChartResolutionId} MarketChartResolutionId */

/** @enum {number} Lightweight Charts TickMarkType */
const TICK = {
  Year: 0,
  Month: 1,
  DayOfMonth: 2,
  Time: 3,
  TimeWithSeconds: 4,
}

/** @param {number | import('lightweight-charts').UTCTimestamp | import('lightweight-charts').BusinessDay} time */
export function marketChartTimeToDate(time) {
  if (typeof time === 'number') return new Date(time * 1000)
  if (time && typeof time === 'object' && 'year' in time) {
    return new Date(time.year, time.month - 1, time.day)
  }
  return null
}

/** @param {Date} d */
function monthAbbrev(d) {
  return d.toLocaleDateString('en-US', { month: 'short' })
}

/** 1st → "Jun"; otherwise day-of-month number. */
/** @param {Date} d */
function dayOfMonthLabel(d) {
  if (d.getDate() === 1) return monthAbbrev(d)
  return String(d.getDate())
}

/** @param {Date} d */
function hourMinuteLabel(d) {
  const h = d.getHours()
  const m = d.getMinutes()
  if (m === 0) return String(h)
  return `${h}:${String(m).padStart(2, '0')}`
}

/** @param {Date} d @param {number} tickMarkType */
function formatDailyWeeklyTick(d, tickMarkType, resolutionId) {
  if (resolutionId === 'W') {
    if (tickMarkType === TICK.Year) return String(d.getFullYear())
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }
  if (tickMarkType === TICK.Year) return String(d.getFullYear())
  if (tickMarkType === TICK.Month) return monthAbbrev(d)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** 1H / 2H / 4H - dates only: month on the 1st, day number otherwise. */
/** @param {Date} d @param {number} tickMarkType */
function formatHourlyBarTick(d, tickMarkType) {
  if (tickMarkType === TICK.Time || tickMarkType === TICK.TimeWithSeconds) return ''
  if (tickMarkType === TICK.Year) return String(d.getFullYear())
  if (tickMarkType === TICK.Month) return monthAbbrev(d)
  return dayOfMonthLabel(d)
}

/** 15m - every 3 hours on the hour, plus day labels at day boundaries. */
/** @param {Date} d @param {number} tickMarkType */
function format15mTick(d, tickMarkType) {
  if (tickMarkType === TICK.Year) return String(d.getFullYear())
  if (tickMarkType === TICK.Month) return monthAbbrev(d)
  if (tickMarkType === TICK.DayOfMonth) return dayOfMonthLabel(d)
  if (tickMarkType === TICK.Time || tickMarkType === TICK.TimeWithSeconds) {
    if (d.getMinutes() !== 0) return ''
    if (d.getHours() % 3 !== 0) return ''
    return String(d.getHours())
  }
  return ''
}

/** 5m - :00 and :30, plus day labels at day boundaries. */
/** @param {Date} d @param {number} tickMarkType */
function format5mTick(d, tickMarkType) {
  if (tickMarkType === TICK.Year) return String(d.getFullYear())
  if (tickMarkType === TICK.Month) return monthAbbrev(d)
  if (tickMarkType === TICK.DayOfMonth) return dayOfMonthLabel(d)
  if (tickMarkType === TICK.Time || tickMarkType === TICK.TimeWithSeconds) {
    const m = d.getMinutes()
    if (m !== 0 && m !== 30) return ''
    return hourMinuteLabel(d)
  }
  return ''
}

/** 1m - 5-minute steps, plus day labels at day boundaries. */
/** @param {Date} d @param {number} tickMarkType */
function format1mTick(d, tickMarkType) {
  if (tickMarkType === TICK.Year) return String(d.getFullYear())
  if (tickMarkType === TICK.Month) return monthAbbrev(d)
  if (tickMarkType === TICK.DayOfMonth) return dayOfMonthLabel(d)
  if (tickMarkType === TICK.Time || tickMarkType === TICK.TimeWithSeconds) {
    if (d.getMinutes() % 5 !== 0) return ''
    return hourMinuteLabel(d)
  }
  return ''
}

/**
 * @param {number | import('lightweight-charts').UTCTimestamp | import('lightweight-charts').BusinessDay} time
 * @param {number} tickMarkType
 * @param {MarketChartResolutionId | string} resolutionId
 */
export function formatMarketChartAxisTickForResolution(time, tickMarkType, resolutionId) {
  const d = marketChartTimeToDate(time)
  if (!d || Number.isNaN(d.getTime())) return ''
  const id = String(resolutionId || '')

  switch (id) {
    case '1':
      return format1mTick(d, tickMarkType)
    case '5':
      return format5mTick(d, tickMarkType)
    case '15':
      return format15mTick(d, tickMarkType)
    case '60':
    case '120':
    case '240':
      return formatHourlyBarTick(d, tickMarkType)
    case 'D':
    case 'W':
      return formatDailyWeeklyTick(d, tickMarkType, id)
    default:
      return formatDailyWeeklyTick(d, tickMarkType, 'D')
  }
}

/** @param {MarketChartResolutionId | string} resolutionId */
export function marketChartResolutionShowsTimeAxis(resolutionId) {
  const id = String(resolutionId || '')
  return id === '1' || id === '5' || id === '15'
}
