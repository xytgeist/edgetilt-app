/**
 * Categories leagues (ESPN / Yahoo NBA H2H categories). Two jobs:
 *
 * 1. Category value: z-score weights that turn a stat line into one number, so every points engine (Roster,
 *    Waivers, Sniper, Trades, League outlook, digest) runs unchanged on categories leagues. Counting stat k scores
 *    x_k / SD_k across the player pool (negative when lower is better, e.g. turnovers). A percentage scores its
 *    impact, makes minus pool-average% x attempts, over that impact's SD, which is linear in makes and attempts.
 *    The sync saves these as the league's `scoring` (plain per-stat weights `scoreLine` already applies).
 *
 * 2. Matchup: each category's projected final for both sides (host totals so far plus starters' remaining
 *    per-game lines), a normal win chance per category, and the chance of winning more categories than losing.
 */

/** Percentage categories → [makes, attempts] stat keys. */
export const PCT_PARTS = { fg_pct: ['fgm', 'fga'], ft_pct: ['ftm', 'fta'], tp_pct: ['tpm', 'tpa'] }

/** Pool size for the SDs (roughly every rostered player in a 10-12 team league). */
const POOL_TOP = 150

function sd(values) {
  if (values.length < 2) return 0
  const mean = values.reduce((a, v) => a + v, 0) / values.length
  return Math.sqrt(values.reduce((a, v) => a + (v - mean) ** 2, 0) / (values.length - 1))
}

const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0)

/**
 * Category-value weights from per-game lines (Sleeper keys). `categories` = [{ key, higher_better }].
 * Returns { weights, pct } where `pct` holds each percentage category's pool average (for the matchup math).
 */
export function categoryWeights(categories, lines) {
  const pool = (lines || [])
    .filter((l) => l && n(l.pts) > 0)
    .sort((a, b) => n(b.pts) - n(a.pts))
    .slice(0, POOL_TOP)
  const weights = {}
  const pct = {}
  const add = (key, w) => {
    if (Number.isFinite(w) && w !== 0) weights[key] = Math.round(((weights[key] || 0) + w) * 10000) / 10000
  }
  for (const cat of categories || []) {
    const sign = cat.higher_better === false ? -1 : 1
    const parts = PCT_PARTS[cat.key]
    if (parts) {
      const [m, a] = parts
      const made = pool.reduce((s, l) => s + n(l[m]), 0)
      const att = pool.reduce((s, l) => s + n(l[a]), 0)
      if (!(att > 0)) continue
      const avg = made / att
      pct[cat.key] = avg
      const spread = sd(pool.map((l) => n(l[m]) - avg * n(l[a])))
      if (!(spread > 0)) continue
      add(m, sign / spread)
      add(a, (-sign * avg) / spread)
      continue
    }
    const spread = sd(pool.map((l) => n(l[cat.key])))
    if (spread > 0) add(cat.key, sign / spread)
  }
  return { weights, pct }
}

function normCdf(x) {
  const sign = x < 0 ? -1 : 1
  const a = Math.abs(x) / Math.SQRT2
  const t = 1 / (1 + 0.3275911 * a)
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a))
  return 0.5 * (1 + sign * y)
}

/** Per-game count variance as a multiple of its mean (NBA box scores are a bit more spread than Poisson). */
const OVERDISPERSION = 1.4

/**
 * One side's projected finals. `current` = host totals so far (stat key → value; percentages as rates),
 * `remaining` = [{ line, games }] for starters' games still to play, `played` = [{ line, games }] for games
 * already in the host totals (to estimate attempts behind a percentage the host only reports as a rate).
 */
export function sideProjection(categories, current, remaining, played) {
  const out = {}
  const sumOf = (list, key) => (list || []).reduce((s, r) => s + n(r.line?.[key]) * n(r.games), 0)
  for (const cat of categories || []) {
    const parts = PCT_PARTS[cat.key]
    if (parts) {
      const [m, a] = parts
      const attPlayed = sumOf(played, a)
      const rate = current?.[cat.key] != null ? n(current[cat.key]) : attPlayed > 0 ? sumOf(played, m) / attPlayed : 0
      const madeNow = rate * attPlayed
      const madeRest = sumOf(remaining, m)
      const attRest = sumOf(remaining, a)
      const att = attPlayed + attRest
      const p = att > 0 ? (madeNow + madeRest) / att : rate
      // Only the attempts still to come add uncertainty to the final rate.
      const variance = att > 0 ? (p * (1 - p) * attRest * OVERDISPERSION) / (att * att) : 0
      out[cat.key] = { mean: p, variance, now: rate, pct: true }
      continue
    }
    const now = n(current?.[cat.key])
    const rest = sumOf(remaining, cat.key)
    out[cat.key] = { mean: now + rest, variance: Math.max(0, rest) * OVERDISPERSION, now, pct: false }
  }
  return out
}

/** Win chance per category and for the matchup (more categories won than lost; a tie counts half). */
export function categoryOutlook(categories, left, right) {
  const cats = (categories || []).map((cat) => {
    const L = left[cat.key]
    const R = right[cat.key]
    if (!L || !R) return { ...cat, p: 0.5 }
    const diff = (L.mean - R.mean) * (cat.higher_better === false ? -1 : 1)
    const spread = Math.sqrt(L.variance + R.variance)
    const p = spread > 1e-9 ? normCdf(diff / spread) : diff > 0 ? 1 : diff < 0 ? 0 : 0.5
    return { ...cat, left: L, right: R, p }
  })
  // Poisson-binomial: distribution of categories won.
  let dist = [1]
  for (const c of cats) {
    const next = new Array(dist.length + 1).fill(0)
    for (let k = 0; k < dist.length; k += 1) {
      next[k] += dist[k] * (1 - c.p)
      next[k + 1] += dist[k] * c.p
    }
    dist = next
  }
  const total = cats.length
  let win = 0
  for (let k = 0; k < dist.length; k += 1) {
    if (2 * k > total) win += dist[k]
    else if (2 * k === total) win += dist[k] / 2
  }
  const expected = cats.reduce((s, c) => s + c.p, 0)
  return { cats, win, expected, total }
}
