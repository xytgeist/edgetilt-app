import {
  aggregateRealizedRtpPct,
  avg,
  formatPlayLogRealRtp,
  numericSamples,
  sum,
} from './playLogMetrics.js'

/** @typedef {import('./playLogMetrics.js').PlayLogEntry} PlayLogEntry */

/** @typedef {{ key: string, label: string, value: string, hint?: string }} AnalysisStat */

/**
 * @param {PlayLogEntry[]} entries
 * @param {string[]} metricSlugs
 * @param {{ allPlays?: boolean }} [opts]
 */
export function analyzePlayLogEntries(entries, metricSlugs, opts = {}) {
  const { allPlays = false } = opts
  const n = entries.length
  /** @type {AnalysisStat[]} */
  const stats = [{ key: 'count', label: 'Logged plays', value: String(n) }]
  if (n === 0) return stats

  if (allPlays) {
    const gameCount = new Set(entries.map(e => e.template_id).filter(Boolean)).size
    stats.push({ key: 'games_played', label: 'Games played', value: String(gameCount) })
  }

  const realizedRtp = aggregateRealizedRtpPct(entries)
  if (realizedRtp != null) {
    stats.push({
      key: 'realized_rtp',
      label: 'Realized RTP %',
      value: formatPlayLogRealRtp(realizedRtp) ?? '-',
      hint: allPlays
        ? 'Wager-weighted across all logged plays (total out ÷ total in).'
        : 'Wager-weighted across all logged plays for this game (total out ÷ total in).',
    })
  }

  const slugSet = new Set(metricSlugs)

  const moneyIn = numericSamples(entries, 'money_in')
  const moneyOut = numericSamples(entries, 'money_out')
  if (moneyIn.length) {
    stats.push({ key: 'avg_money_in', label: 'Avg money in', value: fmtMoney(avg(moneyIn)) })
  }
  if (moneyOut.length) {
    stats.push({ key: 'avg_money_out', label: 'Avg money out', value: fmtMoney(avg(moneyOut)) })
  }
  if (moneyIn.length && moneyOut.length) {
    const nets = entries
      .map(e => {
        const inn = Number(e.values?.money_in)
        const out = Number(e.values?.money_out)
        if (!Number.isFinite(inn) || !Number.isFinite(out)) return null
        return out - inn
      })
      .filter(v => v != null)
    if (nets.length) {
      stats.push({ key: 'avg_net', label: 'Avg net (out − in)', value: fmtMoney(avg(nets)) })
    }
  }

  if (slugSet.has('bonus_count') && slugSet.has('spin_count')) {
    const ratios = entries
      .map(e => {
        const bonuses = Number(e.values?.bonus_count)
        const spins = Number(e.values?.spin_count)
        if (!Number.isFinite(bonuses) || !Number.isFinite(spins) || spins <= 0) return null
        return (bonuses / spins) * 100
      })
      .filter(v => v != null)
    if (ratios.length) {
      stats.push({
        key: 'bonuses_per_100',
        label: 'Avg bonuses per 100 spins',
        value: avg(ratios).toFixed(2),
      })
    }
  }

  if (slugSet.has('counter_at_hit')) {
    const hits = numericSamples(entries, 'counter_at_hit')
    if (hits.length) {
      stats.push({ key: 'avg_hit_counter', label: 'Avg counter hit at', value: avg(hits).toFixed(1) })
      const min = Math.min(...hits)
      const max = Math.max(...hits)
      stats.push({ key: 'hit_range', label: 'Hit counter range', value: `${min} – ${max}` })
    }
  }

  if (slugSet.has('counter') && slugSet.has('spin_count')) {
    const incPerSpin = entries
      .map(e => {
        const counter = Number(e.values?.counter)
        const spins = Number(e.values?.spin_count)
        if (!Number.isFinite(counter) || !Number.isFinite(spins) || spins <= 0) return null
        return counter / spins
      })
      .filter(v => v != null)
    if (incPerSpin.length) {
      stats.push({
        key: 'counter_per_spin',
        label: 'Avg counter ÷ spins (per entry)',
        value: avg(incPerSpin).toFixed(3),
        hint: 'Use sequential entries for true increment/spin across a session.',
      })
    }
  }

  if (slugSet.has('target_bonus_paid')) {
    const paid = numericSamples(entries, 'target_bonus_paid')
    if (paid.length) {
      stats.push({ key: 'avg_target_paid', label: 'Avg target bonus paid', value: fmtMoney(avg(paid)) })
      stats.push({ key: 'total_target_paid', label: 'Total target bonus paid', value: fmtMoney(sum(paid)) })
    }
  }

  for (const tier of ['mega', 'grand', 'major', 'minor', 'mini']) {
    if (!slugSet.has(tier)) continue
    const samples = numericSamples(entries, tier)
    if (samples.length) {
      stats.push({
        key: `avg_${tier}`,
        label: `Avg ${tier.charAt(0).toUpperCase()}${tier.slice(1)} meter`,
        value: avg(samples).toFixed(1),
      })
    }
  }

  if (slugSet.has('bet_size')) {
    const bets = numericSamples(entries, 'bet_size')
    if (bets.length) stats.push({ key: 'avg_bet', label: 'Avg bet size', value: fmtMoney(avg(bets)) })
  }

  return stats
}

/** @param {number | null} n */
function fmtMoney(n) {
  if (n == null || !Number.isFinite(n)) return '-'
  const abs = Math.abs(n)
  const str = abs >= 1000 ? `$${Math.round(abs).toLocaleString()}` : `$${abs.toFixed(abs >= 100 ? 0 : 2)}`
  return n < 0 ? `-${str}` : str
}
