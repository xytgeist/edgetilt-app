#!/usr/bin/env node
/**
 * Daily check: every college football team name The Odds API uses must map to a catalog team
 * (logo + ESPN id) through the same matcher the Lounge scoreboard runs.
 *
 *   node --experimental-strip-types scripts/cfb-odds-name-audit.mjs
 *
 * New misses print a suggested alias for supabase/functions/_shared/cfbOddsNameEspn.json and,
 * in GitHub Actions, set `unmatched` / `report` outputs (the workflow opens an issue).
 * Costs 1 Odds API credit (/participants).
 */
import fs from 'node:fs'
import { CFB_TEAM_CATALOG } from '../src/features/lounge/cfbTeamCatalog.generated.js'
import { cfbOddsNameMatched, foldCfbName } from '../supabase/functions/_shared/cfbOddsNameMatch.ts'
import { loadSupabaseEnv } from './lib/supabaseEnv.mjs'

/** Not on ESPN (D2 / D3 / NAIA): no logo or ESPN id exists, so a text label is correct. */
const KNOWN_UNMAPPABLE = new Set([
  'kentucky state university thorobreds',
  'minnesota state mavericks',
  'occidental tigers',
  'wisconsin whitewater warhawks',
  'ut rio grande valley vaqueros',
])

function suggestTeam(name) {
  const tokens = foldCfbName(name).split(' ').filter((t) => t.length > 2)
  let best = null
  let bestScore = 0
  for (const t of CFB_TEAM_CATALOG) {
    const mascot = foldCfbName(t.mascot || '')
    const school = foldCfbName(t.school || '').split(' ')
    const mascotHit = mascot && foldCfbName(name).endsWith(` ${mascot}`) ? 2 : 0
    const schoolHits = school.filter((w) => w.length > 2 && tokens.includes(w)).length
    const score = mascotHit + schoolHits
    if (score > bestScore) {
      best = t
      bestScore = score
    }
  }
  return bestScore >= 3 ? best : null
}

async function main() {
  loadSupabaseEnv(null)
  const key = String(process.env.THE_ODDS_API_KEY || process.env.ODDS_API_KEY || '').trim()
  if (!key) throw new Error('Missing THE_ODDS_API_KEY')
  const res = await fetch(
    `https://api.the-odds-api.com/v4/sports/americanfootball_ncaaf/participants?apiKey=${encodeURIComponent(key)}`,
  )
  if (!res.ok) throw new Error(`Odds API HTTP ${res.status}`)
  const participants = await res.json()
  if (!Array.isArray(participants)) throw new Error('Odds API payload is not an array')

  const misses = []
  for (const p of participants) {
    const name = String(p?.full_name || '').trim()
    if (!name || cfbOddsNameMatched(name) || KNOWN_UNMAPPABLE.has(foldCfbName(name))) continue
    misses.push(name)
  }

  const lines = misses.map((name) => {
    const team = suggestTeam(name)
    const alias = team
      ? `"${foldCfbName(name)}": { "abbrev": "${team.abbrev}", "espn": "${team.espn}" }  (${team.school} ${team.mascot})`
      : 'no catalog suggestion (check ESPN; if the school is not on ESPN, add it to KNOWN_UNMAPPABLE)'
    return `- ${name} → ${alias}`
  })
  console.log(`${participants.length} Odds API CFB names, ${misses.length} unmatched`)
  if (lines.length) console.log(lines.join('\n'))

  const out = process.env.GITHUB_OUTPUT
  if (out) {
    fs.appendFileSync(out, `unmatched=${misses.length}\n`)
    fs.appendFileSync(out, `report<<CFB_AUDIT_EOF\n${lines.join('\n')}\nCFB_AUDIT_EOF\n`)
  }
}

main().catch((e) => {
  console.error(e?.message || e)
  process.exit(1)
})
