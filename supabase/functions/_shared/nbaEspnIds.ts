/**
 * Sleeper NBA players have no ESPN id, so names map through ESPN's 30 team rosters (one shared row a day).
 * Used for Rotowire news (`fantasy-player-news`) and headshots (`fantasy-lineup-cards`).
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { sharedCached } from './edgeSharedCache.ts'
import { espnFetch } from './loungeSportsScoreboard.ts'

const NBA_ESPN_TEAMS = [
  'atl', 'bos', 'bkn', 'cha', 'chi', 'cle', 'dal', 'den', 'det', 'gs', 'hou', 'ind', 'lac', 'lal', 'mem',
  'mia', 'mil', 'min', 'no', 'ny', 'okc', 'orl', 'phi', 'phx', 'por', 'sac', 'sa', 'tor', 'utah', 'wsh',
]
/** ESPN NBA abbreviations -> Sleeper's. */
const NBA_TEAM_ALIAS: Record<string, string> = { GS: 'GSW', SA: 'SAS', NO: 'NOP', NY: 'NYK', UTAH: 'UTA', WSH: 'WAS' }

const str = (v: unknown) => String(v ?? '').trim()

export const nbaTeamKey = (t: unknown) => {
  const k = str(t).toUpperCase().replace(/[^A-Z]/g, '')
  return NBA_TEAM_ALIAS[k] || k
}

export const nbaNameKey = (n: unknown) =>
  str(n)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, '')
    .replace(/[^a-z0-9]/g, '')

async function readRosters(): Promise<Array<[string, string]>> {
  const out: Array<[string, string]> = []
  let next = 0
  const rosters: Array<Array<Record<string, unknown>>> = new Array(NBA_ESPN_TEAMS.length)
  const worker = async () => {
    while (next < NBA_ESPN_TEAMS.length) {
      const i = next++
      const abbr = NBA_ESPN_TEAMS[i]
      const res = await espnFetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${abbr}/roster`, {
        headers: { 'User-Agent': 'EdgeTiltLounge/1.0', Accept: 'application/json' },
        signal: AbortSignal.timeout(6_000),
      }).catch(() => null)
      const body = res?.ok ? ((await res.json().catch(() => ({}))) as Record<string, unknown>) : {}
      const list = Array.isArray(body?.athletes) ? (body.athletes as Array<Record<string, unknown>>) : []
      rosters[i] = list.map((a) => ({ ...a, team: abbr }))
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker))
  for (const a of rosters.flat()) {
    if (!a) continue
    const id = str(a.id)
    const key = nbaNameKey(a.displayName || a.fullName)
    if (!id || !key) continue
    out.push([`${key}|${nbaTeamKey(a.team)}`, id], [key, id])
  }
  return out
}

/** `name|TEAM` (Sleeper team codes) and bare `name` -> ESPN athlete id. */
export async function nbaEspnIds(admin?: SupabaseClient | null): Promise<Map<string, string>> {
  const entries = await sharedCached(
    'fantasy:nba-espn-ids:v2',
    { ttlMs: 24 * 60 * 60 * 1000, staleMaxMs: 7 * 24 * 60 * 60 * 1000, leaseMs: 30_000, admin, shouldStore: (v) => v.length > 400 },
    readRosters,
  )
  return new Map(entries)
}

export function lookupNbaEspnId(ids: Map<string, string>, name: unknown, team: unknown): string {
  const key = nbaNameKey(name)
  if (!key) return ''
  return ids.get(`${key}|${nbaTeamKey(team)}`) || ids.get(key) || ''
}
