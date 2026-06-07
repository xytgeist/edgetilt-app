/**
 * Technical indicator math for Lounge market charts.
 * @typedef {{ time: number, value: number }} ChartPoint
 * @typedef {{ time: number, close: number, open: number, high: number, low: number, volume: number, value: number }} OhlcvPoint
 */

/**
 * @param {Array<{ t: number, c: number, o?: number, h?: number, l?: number, v?: number }>} rawBars
 * @param {ChartPoint[]} barPoints
 * @returns {OhlcvPoint[]}
 */
export function buildOhlcvPoints(rawBars, barPoints) {
  if (!barPoints.length) return []
  /** @type {Map<number, { o?: number, h?: number, l?: number, v?: number, c: number }>} */
  const byTime = new Map()
  for (const bar of rawBars || []) {
    if (!Number.isFinite(bar?.t) || !Number.isFinite(bar?.c)) continue
    const t = Math.floor(bar.t > 1e12 ? bar.t / 1000 : bar.t)
    byTime.set(t, bar)
  }

  /** @type {OhlcvPoint[]} */
  const out = []
  for (let i = 0; i < barPoints.length; i += 1) {
    const { time, value: close } = barPoints[i]
    const raw = byTime.get(time)
    const open = Number.isFinite(raw?.o) ? raw.o : close
    const high = Number.isFinite(raw?.h) ? raw.h : Math.max(open, close)
    const low = Number.isFinite(raw?.l) ? raw.l : Math.min(open, close)
    let volume = Number(raw?.v)
    if (!Number.isFinite(volume) || volume <= 0) {
      const prev = i > 0 ? barPoints[i - 1].value : close
      volume = Math.max(1, Math.abs(close - prev) * 10000)
    }
    out.push({ time, close, open, high, low, volume, value: close })
  }
  return out
}

/** @param {ChartPoint[]} barPoints @param {number} period */
export function computeSmaSeries(barPoints, period) {
  /** @type {ChartPoint[]} */
  const out = []
  if (!barPoints.length || period < 1) return out
  for (let i = period - 1; i < barPoints.length; i += 1) {
    let sum = 0
    for (let j = i - period + 1; j <= i; j += 1) sum += barPoints[j].value
    out.push({ time: barPoints[i].time, value: sum / period })
  }
  return out
}

/** @param {ChartPoint[]} barPoints @param {number} period */
export function computeEmaSeries(barPoints, period) {
  /** @type {ChartPoint[]} */
  const out = []
  if (!barPoints.length || period < 1) return out
  const k = 2 / (period + 1)
  let ema = null
  for (let i = 0; i < barPoints.length; i += 1) {
    const v = barPoints[i].value
    if (ema == null) {
      if (i < period - 1) continue
      let sum = 0
      for (let j = i - period + 1; j <= i; j += 1) sum += barPoints[j].value
      ema = sum / period
    } else {
      ema = v * k + ema * (1 - k)
    }
    out.push({ time: barPoints[i].time, value: ema })
  }
  return out
}

/** @param {ChartPoint[]} barPoints @param {number} period */
export function computeWmaSeries(barPoints, period) {
  /** @type {ChartPoint[]} */
  const out = []
  if (!barPoints.length || period < 1) return out
  const denom = (period * (period + 1)) / 2
  for (let i = period - 1; i < barPoints.length; i += 1) {
    let sum = 0
    for (let j = 0; j < period; j += 1) {
      sum += barPoints[i - period + 1 + j].value * (j + 1)
    }
    out.push({ time: barPoints[i].time, value: sum / denom })
  }
  return out
}

/** @param {ChartPoint[]} barPoints @param {number} period */
export function computeHmaSeries(barPoints, period) {
  const half = Math.max(1, Math.floor(period / 2))
  const sqrt = Math.max(1, Math.floor(Math.sqrt(period)))
  const wmaHalf = computeWmaSeries(barPoints, half)
  const wmaFull = computeWmaSeries(barPoints, period)
  const halfByTime = new Map(wmaHalf.map((p) => [p.time, p.value]))
  /** @type {ChartPoint[]} */
  const raw = []
  for (const full of wmaFull) {
    const h = halfByTime.get(full.time)
    if (h == null) continue
    raw.push({ time: full.time, value: 2 * h - full.value })
  }
  return computeWmaSeries(raw, sqrt)
}

/** @param {OhlcvPoint[]} ohlcv @param {number} period */
export function computeVwmaSeries(ohlcv, period) {
  /** @type {ChartPoint[]} */
  const out = []
  if (!ohlcv.length || period < 1) return out
  for (let i = period - 1; i < ohlcv.length; i += 1) {
    let pv = 0
    let vol = 0
    for (let j = i - period + 1; j <= i; j += 1) {
      pv += ohlcv[j].close * ohlcv[j].volume
      vol += ohlcv[j].volume
    }
    if (vol <= 0) continue
    out.push({ time: ohlcv[i].time, value: pv / vol })
  }
  return out
}

/**
 * @param {ChartPoint[]} barPoints
 * @param {number} period
 * @param {number} stdDev
 */
export function computeBollingerSeries(barPoints, period, stdDev) {
  const middle = computeSmaSeries(barPoints, period)
  /** @type {ChartPoint[]} */
  const upper = []
  /** @type {ChartPoint[]} */
  const lower = []
  if (!middle.length) return { middle, upper, lower }

  for (let i = period - 1; i < barPoints.length; i += 1) {
    const mid = middle[i - (period - 1)]
    if (!mid) continue
    let sumSq = 0
    for (let j = i - period + 1; j <= i; j += 1) {
      const d = barPoints[j].value - mid.value
      sumSq += d * d
    }
    const sd = Math.sqrt(sumSq / period)
    upper.push({ time: barPoints[i].time, value: mid.value + stdDev * sd })
    lower.push({ time: barPoints[i].time, value: mid.value - stdDev * sd })
  }
  return { middle, upper, lower }
}

/** @param {OhlcvPoint[]} ohlcv @param {number} period */
export function computeAtrSeries(ohlcv, period) {
  /** @type {ChartPoint[]} */
  const out = []
  if (ohlcv.length <= period) return out
  /** @type {number[]} */
  const tr = []
  for (let i = 0; i < ohlcv.length; i += 1) {
    if (i === 0) {
      tr.push(ohlcv[i].high - ohlcv[i].low)
      continue
    }
    const prevClose = ohlcv[i - 1].close
    tr.push(
      Math.max(
        ohlcv[i].high - ohlcv[i].low,
        Math.abs(ohlcv[i].high - prevClose),
        Math.abs(ohlcv[i].low - prevClose),
      ),
    )
  }
  let atr = tr.slice(1, period + 1).reduce((a, b) => a + b, 0) / period
  out.push({ time: ohlcv[period].time, value: atr })
  for (let i = period + 1; i < ohlcv.length; i += 1) {
    atr = (atr * (period - 1) + tr[i]) / period
    out.push({ time: ohlcv[i].time, value: atr })
  }
  return out
}

/** @param {OhlcvPoint[]} ohlcv @param {number} period @param {number} mult */
export function computeKeltnerSeries(ohlcv, period, mult = 2) {
  const closes = ohlcv.map((p) => ({ time: p.time, value: p.close }))
  const middle = computeEmaSeries(closes, period)
  const atr = computeAtrSeries(ohlcv, period)
  const atrByTime = new Map(atr.map((p) => [p.time, p.value]))
  /** @type {ChartPoint[]} */
  const upper = []
  /** @type {ChartPoint[]} */
  const lower = []
  for (const mid of middle) {
    const a = atrByTime.get(mid.time)
    if (a == null) continue
    upper.push({ time: mid.time, value: mid.value + mult * a })
    lower.push({ time: mid.time, value: mid.value - mult * a })
  }
  return { middle, upper, lower }
}

/** @param {OhlcvPoint[]} ohlcv @param {number} period */
export function computeDonchianSeries(ohlcv, period) {
  /** @type {ChartPoint[]} */
  const upper = []
  /** @type {ChartPoint[]} */
  const lower = []
  /** @type {ChartPoint[]} */
  const middle = []
  if (ohlcv.length < period) return { upper, lower, middle }
  for (let i = period - 1; i < ohlcv.length; i += 1) {
    let hi = -Infinity
    let lo = Infinity
    for (let j = i - period + 1; j <= i; j += 1) {
      hi = Math.max(hi, ohlcv[j].high)
      lo = Math.min(lo, ohlcv[j].low)
    }
    const mid = (hi + lo) / 2
    upper.push({ time: ohlcv[i].time, value: hi })
    lower.push({ time: ohlcv[i].time, value: lo })
    middle.push({ time: ohlcv[i].time, value: mid })
  }
  return { upper, lower, middle }
}

/** @param {OhlcvPoint[]} ohlcv @param {number} period @param {number} mult */
export function computeAtrBandsSeries(ohlcv, period, mult = 2) {
  const closes = ohlcv.map((p) => ({ time: p.time, value: p.close }))
  const middle = computeSmaSeries(closes, period)
  const atr = computeAtrSeries(ohlcv, Math.min(14, period))
  const atrByTime = new Map(atr.map((p) => [p.time, p.value]))
  /** @type {ChartPoint[]} */
  const upper = []
  /** @type {ChartPoint[]} */
  const lower = []
  for (const mid of middle) {
    const a = atrByTime.get(mid.time)
    if (a == null) continue
    upper.push({ time: mid.time, value: mid.value + mult * a })
    lower.push({ time: mid.time, value: mid.value - mult * a })
  }
  return { middle, upper, lower }
}

/** @param {ChartPoint[]} barPoints @param {number} period */
export function computeRsiSeries(barPoints, period) {
  /** @type {ChartPoint[]} */
  const out = []
  if (barPoints.length <= period) return out

  let avgGain = 0
  let avgLoss = 0
  for (let i = 1; i <= period; i += 1) {
    const change = barPoints[i].value - barPoints[i - 1].value
    if (change >= 0) avgGain += change
    else avgLoss -= change
  }
  avgGain /= period
  avgLoss /= period

  const rsiAt = (gain, loss) => {
    if (loss === 0) return gain === 0 ? 50 : 100
    const rs = gain / loss
    return 100 - 100 / (1 + rs)
  }

  out.push({ time: barPoints[period].time, value: rsiAt(avgGain, avgLoss) })

  for (let i = period + 1; i < barPoints.length; i += 1) {
    const change = barPoints[i].value - barPoints[i - 1].value
    const gain = change > 0 ? change : 0
    const loss = change < 0 ? -change : 0
    avgGain = (avgGain * (period - 1) + gain) / period
    avgLoss = (avgLoss * (period - 1) + loss) / period
    out.push({ time: barPoints[i].time, value: rsiAt(avgGain, avgLoss) })
  }
  return out
}

/** @param {OhlcvPoint[]} ohlcv @param {number} period @param {number} smoothK @param {number} smoothD */
export function computeStochasticSeries(ohlcv, period = 14, smoothK = 3, smoothD = 3) {
  /** @type {ChartPoint[]} */
  const rawK = []
  for (let i = period - 1; i < ohlcv.length; i += 1) {
    let hi = -Infinity
    let lo = Infinity
    for (let j = i - period + 1; j <= i; j += 1) {
      hi = Math.max(hi, ohlcv[j].high)
      lo = Math.min(lo, ohlcv[j].low)
    }
    const span = hi - lo
    const k = span <= 0 ? 50 : ((ohlcv[i].close - lo) / span) * 100
    rawK.push({ time: ohlcv[i].time, value: k })
  }
  const kLine = computeSmaSeries(rawK, smoothK)
  const dLine = computeSmaSeries(kLine, smoothD)
  return { kLine, dLine }
}

/** @param {ChartPoint[]} barPoints */
export function computeMacdSeries(barPoints) {
  const fast = computeEmaSeries(barPoints, 12)
  const slow = computeEmaSeries(barPoints, 26)
  /** @type {ChartPoint[]} */
  const macdLine = []
  const slowByTime = new Map(slow.map((p) => [p.time, p.value]))
  for (const f of fast) {
    const s = slowByTime.get(f.time)
    if (s == null) continue
    macdLine.push({ time: f.time, value: f.value - s })
  }
  const signalLine = computeEmaSeries(macdLine, 9)
  const signalByTime = new Map(signalLine.map((p) => [p.time, p.value]))
  /** @type {ChartPoint[]} */
  const histogram = []
  for (const m of macdLine) {
    const sig = signalByTime.get(m.time)
    if (sig == null) continue
    histogram.push({ time: m.time, value: m.value - sig })
  }
  return { macdLine, signalLine, histogram }
}

/** @param {OhlcvPoint[]} ohlcv @param {number} period */
export function computeCciSeries(ohlcv, period) {
  /** @type {ChartPoint[]} */
  const out = []
  if (ohlcv.length < period) return out
  for (let i = period - 1; i < ohlcv.length; i += 1) {
    /** @type {number[]} */
    const tp = []
    for (let j = i - period + 1; j <= i; j += 1) {
      tp.push((ohlcv[j].high + ohlcv[j].low + ohlcv[j].close) / 3)
    }
    const sma = tp.reduce((a, b) => a + b, 0) / period
    const md = tp.reduce((a, b) => a + Math.abs(b - sma), 0) / period
    const cur = tp[tp.length - 1]
    const cci = md === 0 ? 0 : (cur - sma) / (0.015 * md)
    out.push({ time: ohlcv[i].time, value: cci })
  }
  return out
}

/** @param {ChartPoint[]} barPoints @param {number} period */
export function computeRocSeries(barPoints, period) {
  /** @type {ChartPoint[]} */
  const out = []
  for (let i = period; i < barPoints.length; i += 1) {
    const prev = barPoints[i - period].value
    if (!prev) continue
    out.push({
      time: barPoints[i].time,
      value: ((barPoints[i].value - prev) / prev) * 100,
    })
  }
  return out
}

/** @param {OhlcvPoint[]} ohlcv */
export function computeObvSeries(ohlcv) {
  /** @type {ChartPoint[]} */
  const out = []
  if (!ohlcv.length) return out
  let obv = 0
  out.push({ time: ohlcv[0].time, value: obv })
  for (let i = 1; i < ohlcv.length; i += 1) {
    const change = ohlcv[i].close - ohlcv[i - 1].close
    if (change > 0) obv += ohlcv[i].volume
    else if (change < 0) obv -= ohlcv[i].volume
    out.push({ time: ohlcv[i].time, value: obv })
  }
  return out
}

/** @param {OhlcvPoint[]} ohlcv */
export function computeAccumulationDistributionSeries(ohlcv) {
  /** @type {ChartPoint[]} */
  const out = []
  if (!ohlcv.length) return out
  let ad = 0
  for (const bar of ohlcv) {
    const span = bar.high - bar.low
    const mfm = span <= 0 ? 0 : (bar.close - bar.low - (bar.high - bar.close)) / span
    ad += mfm * bar.volume
    out.push({ time: bar.time, value: ad })
  }
  return out
}

/** @param {OhlcvPoint[]} ohlcv @param {number} period */
export function computeAdxSeries(ohlcv, period = 14) {
  /** @type {ChartPoint[]} */
  const out = []
  if (ohlcv.length <= period * 2) return out

  /** @type {number[]} */
  const plusDm = []
  /** @type {number[]} */
  const minusDm = []
  /** @type {number[]} */
  const tr = []
  for (let i = 1; i < ohlcv.length; i += 1) {
    const up = ohlcv[i].high - ohlcv[i - 1].high
    const down = ohlcv[i - 1].low - ohlcv[i].low
    plusDm.push(up > down && up > 0 ? up : 0)
    minusDm.push(down > up && down > 0 ? down : 0)
    tr.push(
      Math.max(
        ohlcv[i].high - ohlcv[i].low,
        Math.abs(ohlcv[i].high - ohlcv[i - 1].close),
        Math.abs(ohlcv[i].low - ohlcv[i - 1].close),
      ),
    )
  }

  let trSum = tr.slice(0, period).reduce((a, b) => a + b, 0)
  let plusSum = plusDm.slice(0, period).reduce((a, b) => a + b, 0)
  let minusSum = minusDm.slice(0, period).reduce((a, b) => a + b, 0)

  /** @type {number[]} */
  const dx = []
  for (let i = period; i < tr.length; i += 1) {
    trSum = trSum - trSum / period + tr[i]
    plusSum = plusSum - plusSum / period + plusDm[i]
    minusSum = minusSum - minusSum / period + minusDm[i]
    const pdi = trSum === 0 ? 0 : (100 * plusSum) / trSum
    const mdi = trSum === 0 ? 0 : (100 * minusSum) / trSum
    const denom = pdi + mdi
    dx.push(denom === 0 ? 0 : (100 * Math.abs(pdi - mdi)) / denom)
  }

  if (dx.length < period) return out
  let adx = dx.slice(0, period).reduce((a, b) => a + b, 0) / period
  out.push({ time: ohlcv[period * 2].time, value: adx })
  for (let i = period; i < dx.length; i += 1) {
    adx = (adx * (period - 1) + dx[i]) / period
    out.push({ time: ohlcv[i + period + 1].time, value: adx })
  }
  return out
}

/** @param {OhlcvPoint[]} ohlcv */
export function computeIchimokuSeries(ohlcv) {
  const highLowMid = (period) => {
    /** @type {ChartPoint[]} */
    const rows = []
    for (let i = period - 1; i < ohlcv.length; i += 1) {
      let hi = -Infinity
      let lo = Infinity
      for (let j = i - period + 1; j <= i; j += 1) {
        hi = Math.max(hi, ohlcv[j].high)
        lo = Math.min(lo, ohlcv[j].low)
      }
      rows.push({ time: ohlcv[i].time, value: (hi + lo) / 2 })
    }
    return rows
  }

  const tenkan = highLowMid(9)
  const kijun = highLowMid(26)
  const kijunByTime = new Map(kijun.map((p) => [p.time, p.value]))
  /** @type {ChartPoint[]} */
  const senkouA = []
  for (const t of tenkan) {
    const k = kijunByTime.get(t.time)
    if (k == null) continue
    senkouA.push({ time: t.time, value: (t.value + k) / 2 })
  }
  const senkouB = highLowMid(52)
  return { tenkan, kijun, senkouA, senkouB }
}

/**
 * @param {OhlcvPoint[]} ohlcv
 * @returns {Array<{ time: number, value: number, position: 'aboveBar' | 'belowBar' }>}
 */
export function computePsarPoints(ohlcv) {
  /** @type {Array<{ time: number, value: number, position: 'aboveBar' | 'belowBar' }>} */
  const out = []
  if (ohlcv.length < 2) return out

  let af = 0.02
  const afStep = 0.02
  const afMax = 0.2
  let isUp = ohlcv[1].close >= ohlcv[0].close
  let ep = isUp ? ohlcv[0].high : ohlcv[0].low
  let sar = isUp ? ohlcv[0].low : ohlcv[0].high

  for (let i = 1; i < ohlcv.length; i += 1) {
    sar = sar + af * (ep - sar)
    if (isUp) {
      sar = Math.min(sar, ohlcv[i - 1].low, i >= 2 ? ohlcv[i - 2].low : ohlcv[i - 1].low)
      if (ohlcv[i].low < sar) {
        isUp = false
        sar = ep
        ep = ohlcv[i].low
        af = 0.02
      } else if (ohlcv[i].high > ep) {
        ep = ohlcv[i].high
        af = Math.min(af + afStep, afMax)
      }
    } else {
      sar = Math.max(sar, ohlcv[i - 1].high, i >= 2 ? ohlcv[i - 2].high : ohlcv[i - 1].high)
      if (ohlcv[i].high > sar) {
        isUp = true
        sar = ep
        ep = ohlcv[i].high
        af = 0.02
      } else if (ohlcv[i].low < ep) {
        ep = ohlcv[i].low
        af = Math.min(af + afStep, afMax)
      }
    }
    out.push({
      time: ohlcv[i].time,
      value: sar,
      position: isUp ? 'belowBar' : 'aboveBar',
    })
  }
  return out
}

/** @param {OhlcvPoint[]} ohlcv @param {number} period @param {number} mult */
export function computeSupertrendSeries(ohlcv, period = 10, mult = 3) {
  const atr = computeAtrSeries(ohlcv, period)
  const atrByTime = new Map(atr.map((p) => [p.time, p.value]))
  /** @type {ChartPoint[]} */
  const out = []
  let prevTrend = 1
  let prevSt = ohlcv[0]?.close ?? 0
  for (const bar of ohlcv) {
    const a = atrByTime.get(bar.time)
    if (a == null) continue
    const hl2 = (bar.high + bar.low) / 2
    const upper = hl2 + mult * a
    const lower = hl2 - mult * a
    let st = prevSt
    if (prevTrend === 1) {
      st = Math.max(lower, prevSt)
      if (bar.close < st) {
        prevTrend = -1
        st = upper
      }
    } else {
      st = Math.min(upper, prevSt)
      if (bar.close > st) {
        prevTrend = 1
        st = lower
      }
    }
    prevSt = st
    out.push({ time: bar.time, value: st })
  }
  return out
}

/** Rolling volume-at-price POC (simplified volume profile). */
export function computeVolumeProfilePocSeries(ohlcv, window = 50, buckets = 24) {
  /** @type {ChartPoint[]} */
  const out = []
  if (ohlcv.length < window) return out
  for (let i = window - 1; i < ohlcv.length; i += 1) {
    let minP = Infinity
    let maxP = -Infinity
    for (let j = i - window + 1; j <= i; j += 1) {
      minP = Math.min(minP, ohlcv[j].low)
      maxP = Math.max(maxP, ohlcv[j].high)
    }
    const span = maxP - minP
    if (!Number.isFinite(span) || span <= 0) {
      out.push({ time: ohlcv[i].time, value: ohlcv[i].close })
      continue
    }
    /** @type {number[]} */
    const vols = Array.from({ length: buckets }, () => 0)
    for (let j = i - window + 1; j <= i; j += 1) {
      const tp = (ohlcv[j].high + ohlcv[j].low + ohlcv[j].close) / 3
      const idx = Math.min(buckets - 1, Math.max(0, Math.floor(((tp - minP) / span) * buckets)))
      vols[idx] += ohlcv[j].volume
    }
    let best = 0
    let bestIdx = 0
    for (let b = 0; b < buckets; b += 1) {
      if (vols[b] > best) {
        best = vols[b]
        bestIdx = b
      }
    }
    const poc = minP + ((bestIdx + 0.5) / buckets) * span
    out.push({ time: ohlcv[i].time, value: poc })
  }
  return out
}

/**
 * @param {ChartPoint[]} barPoints
 * @param {Array<{ t: number, c: number, o?: number, h?: number, l?: number, v?: number }>} rawBars
 * @param {Set<string>|string[]} activeIds
 */
export function collectOverlayIndicatorLines(barPoints, rawBars, activeIds) {
  const ids = new Set(activeIds)
  const ohlcv = buildOhlcvPoints(rawBars, barPoints)
  /** @type {ChartPoint[][]} */
  const lines = []
  if (!barPoints.length) return lines

  const pushBand = (band) => {
    lines.push(band.middle, band.upper, band.lower)
  }

  if (ids.has('sma20')) lines.push(computeSmaSeries(barPoints, 20))
  if (ids.has('sma50')) lines.push(computeSmaSeries(barPoints, 50))
  if (ids.has('sma200')) lines.push(computeSmaSeries(barPoints, 200))
  if (ids.has('ema9')) lines.push(computeEmaSeries(barPoints, 9))
  if (ids.has('ema21')) lines.push(computeEmaSeries(barPoints, 21))
  if (ids.has('wma20')) lines.push(computeWmaSeries(barPoints, 20))
  if (ids.has('hma20')) lines.push(computeHmaSeries(barPoints, 20))
  if (ids.has('vwma20')) lines.push(computeVwmaSeries(ohlcv, 20))
  if (ids.has('bb20')) pushBand(computeBollingerSeries(barPoints, 20, 2))
  if (ids.has('keltner20')) pushBand(computeKeltnerSeries(ohlcv, 20, 2))
  if (ids.has('donchian20')) pushBand(computeDonchianSeries(ohlcv, 20))
  if (ids.has('atrBands20')) pushBand(computeAtrBandsSeries(ohlcv, 20, 2))
  if (ids.has('volProfile50')) lines.push(computeVolumeProfilePocSeries(ohlcv, 50))
  if (ids.has('ichimoku')) {
    const ichi = computeIchimokuSeries(ohlcv)
    lines.push(ichi.tenkan, ichi.kijun, ichi.senkouA, ichi.senkouB)
  }
  if (ids.has('psar')) lines.push(computePsarPoints(ohlcv).map((p) => ({ time: p.time, value: p.value })))
  if (ids.has('supertrend10')) lines.push(computeSupertrendSeries(ohlcv, 10, 3))

  return lines
}
