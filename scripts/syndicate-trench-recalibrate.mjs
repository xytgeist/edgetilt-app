#!/usr/bin/env node
/**
 * Backtest the NFL trench blend against real results and suggest TRENCH_Z_TO_POINTS.
 *
 * Boards: data/syndicate/espn-nfl-{season}-trench-history.json (one board per "through week N").
 * Games:  nflverse games.csv (closing spread_line + result).
 *
 * Out-of-sample: week W games scored with the board through week W-1 (what we knew at kickoff).
 * In-sample:     every finished game scored with the latest board (peeks ahead; sanity check only).
 *
 * Mirrors computeNetTrenchSpreadImpactHome in supabase/functions/_shared/loungeBotTeamMetrics.ts.
 * Keep the weights and clamp in sync with that file.
 *
 *   node scripts/syndicate-trench-recalibrate.mjs [--season=2026] [--clamp=2.5]
 */
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const GAMES_URL = 'https://github.com/nflverse/nfldata/raw/master/data/games.csv'
const PASS_W = 0.55
const RUN_W = 0.45
const CURRENT_Z_TO_POINTS = 0.56
const MISMATCH_PTS = 0.8
const NFLVERSE_TO_ABBR = { LA: 'LAR' }

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? true]),
)
const season = Number(args.season || 2026)
const clamp = args.clamp === undefined ? 2.5 : Number(args.clamp)

function moment(values) {
  const mean = values.reduce((s, v) => s + v, 0) / values.length
  const sd = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1))
  return { mean, sd }
}

function boardMoments(teams) {
  const list = Object.values(teams)
  return Object.fromEntries(['pbwr', 'prwr', 'rbwr', 'rswr'].map((k) => [k, moment(list.map((t) => t[k]))]))
}

function blendedZ(home, away, m, cap) {
  const z = (v, k) => {
    const raw = (v - m[k].mean) / m[k].sd
    return cap > 0 ? Math.max(-cap, Math.min(cap, raw)) : raw
  }
  const homePass = z(home.pbwr, 'pbwr') - z(away.prwr, 'prwr')
  const awayPass = z(away.pbwr, 'pbwr') - z(home.prwr, 'prwr')
  const homeRun = z(home.rbwr, 'rbwr') - z(away.rswr, 'rswr')
  const awayRun = z(away.rbwr, 'rbwr') - z(home.rswr, 'rswr')
  return PASS_W * (homePass - awayPass) + RUN_W * (homeRun - awayRun)
}

function parseCsv(text) {
  const [head, ...lines] = text.trim().split('\n')
  const cols = head.split(',')
  return lines.map((l) => Object.fromEntries(l.split(',').map((v, i) => [cols[i], v])))
}

/** Least squares through the origin: y ≈ b·x. Returns slope, standard error, correlation. */
function fitThroughOrigin(xs, ys) {
  const n = xs.length
  const sxx = xs.reduce((s, x) => s + x * x, 0)
  const b = xs.reduce((s, x, i) => s + x * ys[i], 0) / sxx
  const resid = ys.map((y, i) => y - b * xs[i])
  const se = Math.sqrt(resid.reduce((s, r) => s + r * r, 0) / (n - 1) / sxx)
  const mx = xs.reduce((s, v) => s + v, 0) / n
  const my = ys.reduce((s, v) => s + v, 0) / n
  const cov = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0)
  const r = cov / Math.sqrt(xs.reduce((s, x) => s + (x - mx) ** 2, 0) * ys.reduce((s, y) => s + (y - my) ** 2, 0))
  return { b, se, r }
}

function report(label, rows) {
  if (rows.length < 8) {
    console.log(`\n${label}: only ${rows.length} games, skipping`)
    return
  }
  const zs = rows.map((r) => r.z)
  const margin = fitThroughOrigin(zs, rows.map((r) => r.result))
  const ats = fitThroughOrigin(zs, rows.map((r) => r.result - r.spread))
  const market = fitThroughOrigin(zs, rows.map((r) => r.spread))
  const flagged = rows.filter((r) => Math.abs(r.z * CURRENT_Z_TO_POINTS) >= MISMATCH_PTS)
  const decided = flagged.filter((r) => r.result !== r.spread)
  const covers = decided.filter((r) => Math.sign(r.result - r.spread) === Math.sign(r.z)).length
  const f = (x) => (x >= 0 ? '+' : '') + x.toFixed(2)
  console.log(`\n${label}: ${rows.length} games, median |z| ${median(zs.map(Math.abs)).toFixed(2)}`)
  console.log(`  Final margin vs z:    ${f(margin.b)} pts per z (±${margin.se.toFixed(2)}), r=${margin.r.toFixed(2)}`)
  console.log(`  Closing spread vs z:  ${f(market.b)} pts per z (±${market.se.toFixed(2)}), r=${market.r.toFixed(2)}  (how much the market already prices it)`)
  console.log(`  ATS margin vs z:      ${f(ats.b)} pts per z (±${ats.se.toFixed(2)}), r=${ats.r.toFixed(2)}  (edge left over after the spread)`)
  console.log(`  Trench flag at current scale (|pts| >= ${MISMATCH_PTS}): ${flagged.length} games, trench side covered ${covers}/${decided.length}`)
}

function median(xs) {
  const s = [...xs].sort((a, b) => a - b)
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
}

async function main() {
  const history = JSON.parse(readFileSync(join(ROOT, `data/syndicate/espn-nfl-${season}-trench-history.json`), 'utf8'))
  const boards = [...history.boards].sort((a, b) => a.through_week - b.through_week)
  const latest = boards[boards.length - 1]
  const res = await fetch(GAMES_URL)
  if (!res.ok) throw new Error(`games.csv HTTP ${res.status}`)
  const games = parseCsv(await res.text()).filter(
    (g) => Number(g.season) === season && g.game_type === 'REG' && g.result !== '' && g.spread_line !== '',
  )
  const abbr = (t) => NFLVERSE_TO_ABBR[t] || t
  const score = (g, board, cap) => {
    const m = boardMoments(board.teams)
    const home = board.teams[abbr(g.home_team)]
    const away = board.teams[abbr(g.away_team)]
    if (!home || !away) throw new Error(`missing team ${g.home_team}/${g.away_team} in week ${board.through_week}`)
    return { week: Number(g.week), z: blendedZ(home, away, m, cap), result: Number(g.result), spread: Number(g.spread_line) }
  }

  console.log(`Season ${season}: ${games.length} finished games with a closing spread. Boards through weeks ${boards.map((b) => b.through_week).join(', ')}.`)
  console.log(`Current TRENCH_Z_TO_POINTS = ${CURRENT_Z_TO_POINTS}. Team z clamp = ${clamp > 0 ? '±' + clamp : 'off'}.`)

  for (const cap of clamp > 0 ? [0, clamp] : [0]) {
    const tag = cap > 0 ? `clamped ±${cap}` : 'unclamped'
    const oos = games
      .map((g) => ({ g, board: boards.findLast((b) => b.through_week === Number(g.week) - 1) }))
      .filter((x) => x.board)
      .map((x) => score(x.g, x.board, cap))
    report(`Out-of-sample, ${tag} (board from the prior week)`, oos)
    report(`In-sample, ${tag} (latest board on every game)`, games.map((g) => score(g, latest, cap)))
  }
}

main().catch((err) => {
  console.error('[trench-recalibrate] FATAL', err)
  process.exit(1)
})
