/**
 * Yahoo Fantasy Connect … OAuth 2.0 + league / roster / matchup sync.
 * Tokens live in fantasy_provider_tokens (service-role only).
 * Players map onto nfl_players.sleeper_id by name + team (+ position).
 * NBA (`game_keys=nba`) syncs in a second pass: Sleeper NBA ids (shared player map), NBA stat ids for points and
 * categories, today's lineup (Yahoo NBA lineups are daily) with each player's week points and eligible positions.
 * An NBA failure never fails the NFL sync.
 */
import { addSchedulePair, reusableSchedule, saveLeagueSchedule, type ScheduleWeeks } from './fantasySchedule.ts'
import { pruneMissingLeagues } from './fantasyLeaguePrune.ts'
import { parseYahooPendingTrades } from './yahooPendingTrades.ts'
import type { PendingTrade } from './fantasyEspnSync.ts'
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { resolvePublicAppOrigin } from './publicAppOrigin.ts'
import { fetchNflState, type SyncResult } from './fantasySleeperSync.ts'
import { yahooNbaCategories, yahooNbaScoringFromSettings, yahooScoringFromSettings } from './fantasyScoringRules.ts'
import { loadNbaBoard, nbaTeam } from './fantasyNbaBoard.ts'
// The app's categories math (plain ESM): category-value weights the points engines score with.
import { categoryWeights } from '../../../src/features/fantasy/fantasyCategories.js'
import { type NbaPlayer, sleeperNbaPlayers } from './sleeperNbaPlayers.ts'

const YAHOO_AUTH = 'https://api.login.yahoo.com/oauth2'
const YAHOO_FANTASY = 'https://fantasysports.yahooapis.com/fantasy/v2'
/**
 * Yahoo's own fantasy web app reads the same v2 API from this host with the user's yahoo.com login cookies.
 * Used as a stopgap while our App ID waits on Fantasy API approval (OAuth works, league calls return 403).
 */
const YAHOO_FANTASY_WEB = 'https://pub-api-ro.fantasysports.yahoo.com/fantasy/v2'
const YAHOO_WEB_ORIGIN = 'https://football.fantasysports.yahoo.com'
const BROWSER_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'

/** OAuth bearer (official host) or the in-app Yahoo sign-in session (web host, cookie header). */
export type YahooAuth = { kind: 'oauth'; token: string } | { kind: 'session'; cookie: string }

export type YahooEnv = {
  clientId: string
  clientSecret: string
  redirectUri: string
}

export function yahooEnv(): YahooEnv | null {
  const clientId = Deno.env.get('YAHOO_FANTASY_CLIENT_ID')?.trim() || ''
  const clientSecret = Deno.env.get('YAHOO_FANTASY_CLIENT_SECRET')?.trim() || ''
  const redirectUri =
    Deno.env.get('YAHOO_FANTASY_REDIRECT_URI')?.trim() ||
    `${Deno.env.get('SUPABASE_URL')?.replace(/\/$/, '')}/functions/v1/fantasy-yahoo-oauth-callback`
  if (!clientId || !clientSecret || !redirectUri) return null
  return { clientId, clientSecret, redirectUri }
}

function basicAuth(env: YahooEnv): string {
  return `Basic ${btoa(`${env.clientId}:${env.clientSecret}`)}`
}

export function yahooAuthorizeUrl(env: YahooEnv, state: string): string {
  const u = new URL(`${YAHOO_AUTH}/request_auth`)
  u.searchParams.set('client_id', env.clientId)
  u.searchParams.set('redirect_uri', env.redirectUri)
  u.searchParams.set('response_type', 'code')
  // Fantasy Sports Read … required for fantasysports.yahooapis.com
  u.searchParams.set('scope', 'fspt-r')
  u.searchParams.set('language', 'en-us')
  u.searchParams.set('state', state)
  return u.toString()
}

type TokenBundle = {
  access_token: string
  refresh_token?: string
  expires_in?: number
  token_type?: string
}

async function exchangeCode(env: YahooEnv, code: string): Promise<TokenBundle> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: env.redirectUri,
  })
  const res = await fetch(`${YAHOO_AUTH}/get_token`, {
    method: 'POST',
    headers: {
      Authorization: basicAuth(env),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })
  const json = (await res.json().catch(() => ({}))) as TokenBundle & { error?: string; error_description?: string }
  if (!res.ok || !json.access_token) {
    throw new Error(json.error_description || json.error || `Yahoo token exchange ${res.status}`)
  }
  return json
}

async function refreshAccessToken(env: YahooEnv, refreshToken: string): Promise<TokenBundle> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    redirect_uri: env.redirectUri,
  })
  const res = await fetch(`${YAHOO_AUTH}/get_token`, {
    method: 'POST',
    headers: {
      Authorization: basicAuth(env),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })
  const json = (await res.json().catch(() => ({}))) as TokenBundle & { error?: string; error_description?: string }
  if (!res.ok || !json.access_token) {
    throw new Error(json.error_description || json.error || `Yahoo token refresh ${res.status}`)
  }
  return json
}

function yahooApiErrorMessage(status: number, bodyText: string): string {
  const text = String(bodyText || '').trim()
  let description = ''
  try {
    const json = JSON.parse(text) as {
      error?: { description?: string }
      description?: string
    }
    description = String(json?.error?.description || json?.description || '').trim()
  } catch {
    /* plain / xml */
  }
  if (!description) {
    const m = text.match(/"description"\s*:\s*"([^"]+)"/i)
    if (m?.[1]) description = m[1]
  }
  const lower = `${description} ${text}`.toLowerCase()
  if (
    status === 403 &&
    (lower.includes('not authorized') || lower.includes('not allowed') || lower.includes('not authorised'))
  ) {
    return (
      'Yahoo Fantasy API access is not approved for this EdgeTilt app yet. ' +
      'OAuth sign-in worked, but Yahoo is blocking league data until they approve App ID i4wW6xoc ' +
      '(apply at sports.yahoo.com/developer).'
    )
  }
  if (description) return `Yahoo Fantasy API ${status}: ${description.slice(0, 180)}`
  return `Yahoo Fantasy API ${status}. ${text.slice(0, 160)}`
}

async function yahooGet(auth: YahooAuth | string, path: string): Promise<unknown> {
  const a: YahooAuth = typeof auth === 'string' ? { kind: 'oauth', token: auth } : auth
  const base = a.kind === 'session' ? YAHOO_FANTASY_WEB : YAHOO_FANTASY
  const url = path.includes('?') ? `${base}${path}&format=json` : `${base}${path}?format=json`
  const headers: Record<string, string> =
    a.kind === 'session'
      ? {
          Cookie: a.cookie,
          Accept: 'application/json',
          Origin: YAHOO_WEB_ORIGIN,
          Referer: `${YAHOO_WEB_ORIGIN}/`,
          'User-Agent': BROWSER_UA,
        }
      : { Authorization: `Bearer ${a.token}`, Accept: 'application/json' }
  const res = await fetch(url, { headers })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    if (a.kind === 'session' && (res.status === 401 || res.status === 403 || res.status === 999)) {
      throw new Error('Yahoo sign-in expired. Sign in to Yahoo again in EdgeTilt.')
    }
    throw new Error(yahooApiErrorMessage(res.status, text))
  }
  return await res.json()
}

/** Walk Yahoo's nested JSON and collect objects that have `key`. */
function yahooTeamLogo(team: Record<string, unknown>): string | null {
  const walk = (node: unknown, depth: number): string | null => {
    if (depth > 5 || node == null) return null
    if (typeof node === 'string' && /^https?:\/\//i.test(node)) return node
    if (typeof node !== 'object') return null
    if (Array.isArray(node)) {
      for (const item of node) {
        const hit = walk(item, depth + 1)
        if (hit) return hit
      }
      return null
    }
    for (const value of Object.values(node as Record<string, unknown>)) {
      const hit = walk(value, depth + 1)
      if (hit) return hit
    }
    return null
  }
  return walk(team.team_logos, 0)
}

function collectByKey(root: unknown, key: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = []
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const item of node) walk(item)
      return
    }
    const obj = node as Record<string, unknown>
    if (obj[key] != null && (typeof obj[key] === 'string' || typeof obj[key] === 'number')) {
      out.push(obj)
    }
    for (const v of Object.values(obj)) walk(v)
  }
  walk(root)
  return out
}

/**
 * Yahoo wraps each team / player / league as `{ team: [[{team_key}, {name}, …], {team_standings}] }`: every field
 * sits in its own fragment. Merge the fragments so `name`, `display_position`, `selected_position`, standings,
 * and points read from one object (picking only the `*_key` fragment loses them all).
 */
export function yahooEntities(root: unknown, kind: 'team' | 'player' | 'league'): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = []
  const seen = new Set<string>()
  const flatten = (v: unknown, acc: Record<string, unknown>) => {
    if (Array.isArray(v)) {
      for (const x of v) flatten(x, acc)
    } else if (v && typeof v === 'object') {
      Object.assign(acc, v as Record<string, unknown>)
    }
  }
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const item of node) walk(item)
      return
    }
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (k === kind && Array.isArray(v)) {
        const merged: Record<string, unknown> = {}
        flatten(v, merged)
        const key = str(merged[`${kind}_key`])
        if (key && !seen.has(key)) {
          seen.add(key)
          out.push(merged)
        }
      }
      walk(v)
    }
  }
  walk(root)
  return out
}

/** Every `matchup` object (week, is_playoffs, teams inside) in a Yahoo payload, e.g. `/league/{key}/teams/matchups`. */
function yahooMatchupObjects(root: unknown): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = []
  const walk = (node: unknown, depth: number) => {
    if (!node || typeof node !== 'object' || depth > 14) return
    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1)
      return
    }
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (k === 'matchup' && v && typeof v === 'object' && !Array.isArray(v)) out.push(v as Record<string, unknown>)
      else walk(v, depth + 1)
    }
  }
  walk(root, 0)
  return out
}

type YahooNbaCategory = { stat_id: number; key: string }

/**
 * Yahoo categories matchup in the ESPN shape (`fantasy_matchups.categories`): each side's week totals keyed like
 * `settings.categories`, and WIN / LOSS / TIE per category from the matchup's `stat_winners` (side `a`'s view).
 * Display-only stats (FGM/FGA "123/267") are not categories and are skipped; blank values (week not started) too.
 */
export function yahooCategoryMatchup(
  mu: Record<string, unknown>,
  a: Record<string, unknown>,
  b: Record<string, unknown> | null,
  cats: YahooNbaCategory[],
) {
  const keyById = new Map(cats.map((c) => [Number(c.stat_id), c.key]))
  const totals = (team: Record<string, unknown> | null) => {
    const out: Record<string, number> = {}
    const stats = (team?.team_stats as { stats?: Array<{ stat?: Record<string, unknown> }> } | undefined)?.stats
    for (const row of Array.isArray(stats) ? stats : []) {
      const st = row?.stat || {}
      const key = keyById.get(Number(st.stat_id))
      const raw = String(st.value ?? '').trim()
      if (!key || !raw) continue
      const v = Number(raw)
      if (Number.isFinite(v)) out[key] = v
    }
    return out
  }
  const results: Record<string, string> = {}
  let wins = 0
  let losses = 0
  let ties = 0
  const aKey = str(a.team_key)
  for (const w of collectByKey(mu.stat_winners, 'stat_id')) {
    const key = keyById.get(Number(w.stat_id))
    if (!key) continue
    if (str(w.is_tied) === '1') {
      results[key] = 'TIE'
      ties += 1
    } else if (str(w.winner_team_key) === aKey) {
      results[key] = 'WIN'
      wins += 1
    } else if (str(w.winner_team_key)) {
      results[key] = 'LOSS'
      losses += 1
    }
  }
  return { left: totals(a), right: totals(b), results, wins, losses, ties }
}

/** Yahoo scoreboard matchup blocks (nested arrays + objects). */
function findScoreboardMatchups(root: unknown): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = []
  const seen = new Set<Record<string, unknown>>()
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) {
      if (
        node.length >= 2 &&
        node[0] === 'matchup' &&
        node[1] &&
        typeof node[1] === 'object' &&
        !Array.isArray(node[1])
      ) {
        const mu = node[1] as Record<string, unknown>
        if (!seen.has(mu)) {
          seen.add(mu)
          out.push(mu)
        }
      }
      for (const item of node) walk(item)
      return
    }
    const obj = node as Record<string, unknown>
    if (obj.teams != null && collectByKey(obj, 'team_key').length >= 2) {
      if (!seen.has(obj)) {
        seen.add(obj)
        out.push(obj)
      }
    }
    for (const v of Object.values(obj)) walk(v)
  }
  walk(root)
  return out
}

function str(v: unknown): string {
  return v == null ? '' : String(v).trim()
}

function num(v: unknown): number | null {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function playerFullName(player: Record<string, unknown>): string {
  const name = player.name
  if (name && typeof name === 'object') {
    const n = name as Record<string, unknown>
    return str(n.full) || `${str(n.first)} ${str(n.last)}`.trim()
  }
  return str(player.name)
}

/** Lineup slot Yahoo has the player in this week ("QB", "W/R/T", "BN", "IR" …). */
function selectedPosition(player: Record<string, unknown>): string {
  const sel = player.selected_position
  if (Array.isArray(sel)) {
    for (const item of sel) {
      if (item && typeof item === 'object' && 'position' in (item as object)) {
        return str((item as Record<string, unknown>).position).toUpperCase()
      }
    }
  } else if (sel && typeof sel === 'object') {
    return str((sel as Record<string, unknown>).position).toUpperCase()
  }
  return ''
}

function selectedSlot(player: Record<string, unknown>): 'starter' | 'bench' | 'ir' | 'taxi' {
  const pos = selectedPosition(player)
  if (pos === 'BN' || pos === 'BENCH') return 'bench'
  if (pos === 'IR' || pos === 'IL' || pos === 'IL+') return 'ir'
  if (pos === 'TAXI') return 'taxi'
  return 'starter'
}

function normalizeTeamAbbrev(raw: string): string {
  const t = raw.toUpperCase().replace(/[^A-Z0-9]/g, '')
  const map: Record<string, string> = {
    JAC: 'JAX',
    WSH: 'WAS',
    WAS: 'WAS',
    LAR: 'LAR',
    LA: 'LAR',
    STL: 'LAR',
    SD: 'LAC',
    OAK: 'LV',
    LV: 'LV',
  }
  return map[t] || t
}

async function resolveSleeperId(
  admin: SupabaseClient,
  fullName: string,
  team: string,
  position: string,
): Promise<string | null> {
  const raw = fullName.trim()
  if (!raw) return null
  const stripped = raw.replace(/\b(jr|sr|iii|ii|iv|v)\b\.?/gi, ' ').replace(/\s+/g, ' ').trim()
  const name = stripped || raw
  const teamAbbrev = normalizeTeamAbbrev(team)
  const pos = position.toUpperCase().replace(/[^A-Z]/g, '')

  let q = admin
    .from('nfl_players')
    .select('sleeper_id, full_name, team, position')
    .ilike('full_name', name)
    .limit(8)
  if (teamAbbrev) q = q.eq('team', teamAbbrev)
  const { data } = await q
  const rows = data || []
  if (rows.length === 1) return String(rows[0].sleeper_id)
  if (rows.length > 1 && pos) {
    const hit = rows.find((r) => String(r.position || '').toUpperCase() === pos)
    if (hit) return String(hit.sleeper_id)
  }
  if (rows.length > 1) return String(rows[0].sleeper_id)

  // Name-only fallback when team abbrev differs.
  const { data: byName } = await admin
    .from('nfl_players')
    .select('sleeper_id, team, position')
    .ilike('full_name', name)
    .limit(8)
  const named = byName || []
  if (named.length === 1) return String(named[0].sleeper_id)
  if (named.length > 1 && pos) {
    const hit = named.find((r) => String(r.position || '').toUpperCase() === pos)
    if (hit) return String(hit.sleeper_id)
  }
  return null
}

async function saveTokens(
  admin: SupabaseClient,
  connectionId: string,
  tokens: TokenBundle,
): Promise<void> {
  const expiresAt =
    tokens.expires_in != null
      ? new Date(Date.now() + Math.max(60, Number(tokens.expires_in) - 60) * 1000).toISOString()
      : null
  const { data: prev } = await admin
    .from('fantasy_provider_tokens')
    .select('refresh_token')
    .eq('connection_id', connectionId)
    .maybeSingle()
  await admin.from('fantasy_provider_tokens').upsert(
    {
      connection_id: connectionId,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || prev?.refresh_token || null,
      expires_at: expiresAt,
      token_type: tokens.token_type || 'bearer',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'connection_id' },
  )
}

/**
 * Open trade offers that involve the caller's team in one Yahoo league, in the ESPN `PendingTrade` shape so Offer
 * Review grades them the same way. Players map to synced roster rows by `yahoo_player_key` (latest week).
 */
/** My adds this week from Yahoo team metadata (`roster_adds`: { coverage_type: week, coverage_value: N, value }). */
function yahooTeamAdds(team: Record<string, unknown>): Record<string, unknown> {
  const raw = team.roster_adds
  if (!raw || typeof raw !== 'object') return {}
  const adds = raw as Record<string, unknown>
  const asOf = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  return {
    adds: {
      used: Number(adds.value) || 0,
      per: String(adds.coverage_type || 'week') === 'date' ? 'day' : 'week',
      period: Number(adds.coverage_value) || null,
      as_of: asOf,
    },
  }
}

export async function yahooPendingTrades(
  admin: SupabaseClient,
  league: { id: string; connection_id: string; external_league_id: string },
): Promise<PendingTrade[]> {
  const { data: teams } = await admin.from('fantasy_teams').select('id, external_team_id, is_mine').eq('league_id', league.id)
  const mine = (teams || []).find((t) => t.is_mine)
  if (!mine?.external_team_id) return []
  const auth = await accessTokenForConnection(admin, league.connection_id)
  const payload = await yahooGet(
    auth,
    `/league/${encodeURIComponent(league.external_league_id)}/transactions;types=pending_trade;team_key=${encodeURIComponent(String(mine.external_team_id))}`,
  )
  const open = parseYahooPendingTrades(payload).filter((t) =>
    t.players.some((p) => p.from_team_key === mine.external_team_id || p.to_team_key === mine.external_team_id),
  )
  if (!open.length) return []

  const teamByExt = new Map((teams || []).map((t) => [String(t.external_team_id), String(t.id)]))
  const keys = [...new Set(open.flatMap((t) => t.players.map((p) => p.player_key)))]
  const { data: rows } = await admin
    .from('fantasy_rosters')
    .select('team_id, week, sleeper_id, yahoo_player_key')
    .in('team_id', (teams || []).map((t) => t.id))
    .in('yahoo_player_key', keys)
  const latest = new Map<string, { week: number; sleeper_id: string | null }>()
  for (const r of rows || []) {
    const k = String(r.yahoo_player_key || '')
    const w = Number(r.week) || 0
    if (k && (!latest.has(k) || w > (latest.get(k)?.week || 0))) latest.set(k, { week: w, sleeper_id: r.sleeper_id ? String(r.sleeper_id) : null })
  }

  return open.map((t) => ({
    id: t.transaction_key,
    proposer_team_id: t.trader_team_key ? teamByExt.get(t.trader_team_key) || null : null,
    proposed_at: t.proposed_at,
    expires_at: null,
    // `accepted`: the other team said yes; it now waits on the league / commissioner.
    accepted_by: t.status === 'accepted' && t.tradee_team_key ? [teamByExt.get(t.tradee_team_key) || t.tradee_team_key] : [],
    items: t.players.map((p) => ({
      from_team_id: p.from_team_key ? teamByExt.get(p.from_team_key) || null : null,
      to_team_id: p.to_team_key ? teamByExt.get(p.to_team_key) || null : null,
      external_player_id: p.player_key,
      sleeper_id: latest.get(p.player_key)?.sleeper_id || null,
      player_name: p.name,
      position: p.position,
      nfl_team: p.nfl_team,
    })),
  }))
}

async function accessTokenForConnection(
  admin: SupabaseClient,
  connectionId: string,
): Promise<YahooAuth> {
  const { data: tok } = await admin
    .from('fantasy_provider_tokens')
    .select('access_token, refresh_token, expires_at, token_type')
    .eq('connection_id', connectionId)
    .maybeSingle()
  if (!tok?.access_token) throw new Error('No Yahoo tokens. Reconnect Yahoo.')
  if (tok.token_type === 'yahoo_session') return { kind: 'session', cookie: String(tok.access_token) }

  const env = yahooEnv()
  if (!env) throw new Error('Yahoo Fantasy OAuth is not configured (missing client id/secret).')

  const expiresMs = tok.expires_at ? new Date(tok.expires_at).getTime() : 0
  if (expiresMs && expiresMs > Date.now() + 30_000) return { kind: 'oauth', token: String(tok.access_token) }

  if (!tok.refresh_token) throw new Error('Yahoo access expired. Reconnect Yahoo.')
  const next = await refreshAccessToken(env, String(tok.refresh_token))
  await saveTokens(admin, connectionId, next)
  return { kind: 'oauth', token: next.access_token }
}

/** Keep only yahoo.com login cookies the web API needs; never log the value. */
export function normalizeYahooCookie(raw: string): string {
  const pairs = String(raw || '')
    .split(/;\s*/)
    .map((p) => p.trim())
    .filter((p) => /^[A-Za-z0-9_.-]+=/.test(p) && p.length < 4096)
  return pairs.join('; ').slice(0, 16_000)
}

/**
 * In-app Yahoo sign-in stopgap: verify the session with Yahoo's web host, store it as this user's Yahoo
 * connection (token_type `yahoo_session`, replacing an OAuth token that is still blocked), then sync.
 */
export async function linkYahooSession(
  admin: SupabaseClient,
  edgeUserId: string,
  rawCookie: string,
): Promise<SyncResult> {
  const cookie = normalizeYahooCookie(rawCookie)
  if (cookie.length < 40) return { ok: false, error: 'Yahoo sign-in did not finish. Try again.'}
  const auth: YahooAuth = { kind: 'session', cookie }
  let guid = ''
  let nickname = ''
  try {
    const profile = await yahooGet(auth, '/users;use_login=1')
    const users = collectByKey(profile, 'guid')
    guid = str(users[0]?.guid)
    for (const u of users) nickname = str(u.nickname) || str(u.email) || nickname
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not read your Yahoo account.'}
  }
  if (!guid) return { ok: false, error: 'Could not read your Yahoo account. Sign in again.'}

  const { data: conn, error: connErr } = await admin
    .from('fantasy_connections')
    .upsert(
      {
        user_id: edgeUserId,
        provider: 'yahoo',
        external_user_id: guid,
        external_username: nickname || guid.slice(0, 12),
        status: 'active',
        last_error: null,
      },
      { onConflict: 'user_id,provider' },
    )
    .select('id')
    .single()
  if (connErr || !conn?.id) return { ok: false, error: connErr?.message || 'Could not save Yahoo connection.'}

  await admin.from('fantasy_provider_tokens').upsert(
    {
      connection_id: String(conn.id),
      access_token: cookie,
      refresh_token: null,
      expires_at: null,
      token_type: 'yahoo_session',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'connection_id' },
  )
  const sync = await syncYahooConnection(admin, edgeUserId, String(conn.id))
  return { ...sync, connectionId: String(conn.id) }
}

/** OAuth return channel … encoded in the state key so the callback can choose without a SQL column. */
export type YahooOAuthReturnMode = 'native' | 'web'

/** `n.<nonce>` = ASWebAuth custom-scheme return; anything else = HTML handoff (web / old IPA). */
export function yahooOAuthReturnModeFromState(state: string): YahooOAuthReturnMode {
  return String(state || '').startsWith('n.') ? 'native' : 'web'
}

/** Yahoo waiver rules: `uses_faab`, `waiver_type` (R rolling / FR FAAB / others), `waiver_time` days. */
/**
 * Starting lineup slots from league settings (`roster_positions`: position + count + is_starting_position).
 * Saved as `settings.lineup_slots` so the app knows a K / DEF / FLEX slot exists even when it is empty
 * (the roster only lists players, so an empty slot cannot be inferred). Bench / IR are not starting slots.
 */
function yahooLineupSlots(root: unknown): string[] {
  const out: string[] = []
  const seen = new Set<unknown>()
  const visit = (node: unknown) => {
    if (!node || typeof node !== 'object' || seen.has(node)) return
    seen.add(node)
    if (Array.isArray(node)) {
      for (const item of node) visit(item)
      return
    }
    const obj = node as Record<string, unknown>
    const rp = obj.roster_position as Record<string, unknown> | undefined
    if (rp && typeof rp === 'object' && !Array.isArray(rp)) {
      const position = String(rp.position || '').trim().toUpperCase()
      const count = Math.max(0, Math.min(10, Number(rp.count) || 0))
      const starting = rp.is_starting_position == null ? !['BN', 'IR', 'IR+', 'IL', 'IL+', 'NA'].includes(position) : Number(rp.is_starting_position) === 1
      if (position && starting) for (let i = 0; i < count; i++) out.push(position)
      return
    }
    for (const value of Object.values(obj)) visit(value)
  }
  visit(root)
  return out
}

/** First scalar value under `key` anywhere in a Yahoo payload (league fields sit beside the settings block). */
function yahooLeagueField(root: unknown, key: string): unknown {
  const seen = new Set<unknown>()
  const visit = (node: unknown, depth: number): unknown => {
    if (!node || typeof node !== 'object' || seen.has(node) || depth > 8) return undefined
    seen.add(node)
    if (Array.isArray(node)) {
      for (const item of node) {
        const hit = visit(item, depth + 1)
        if (hit !== undefined) return hit
      }
      return undefined
    }
    const obj = node as Record<string, unknown>
    if (key in obj && (obj[key] == null || typeof obj[key] !== 'object')) return obj[key]
    for (const value of Object.values(obj)) {
      const hit = visit(value, depth + 1)
      if (hit !== undefined) return hit
    }
    return undefined
  }
  return visit(root, 0)
}

/** `/game/{game_key}/game_weeks`: every `game_week` ({ week, start, end }) in Yahoo's calendar for that season. */
function yahooGameWeeks(root: unknown): Map<number, { start: string; end: string }> {
  const out = new Map<number, { start: string; end: string }>()
  const seen = new Set<unknown>()
  const visit = (node: unknown) => {
    if (!node || typeof node !== 'object' || seen.has(node)) return
    seen.add(node)
    if (Array.isArray(node)) {
      for (const item of node) visit(item)
      return
    }
    const obj = node as Record<string, unknown>
    const week = Number(obj.week)
    const start = String(obj.start || '')
    const end = String(obj.end || '')
    if (week > 0 && /^\d{4}-\d{2}-\d{2}$/.test(start) && /^\d{4}-\d{2}-\d{2}$/.test(end)) out.set(week, { start, end })
    for (const value of Object.values(obj)) visit(value)
  }
  visit(root)
  return out
}

/** Playoff start week + team count, saved under Sleeper's key names so the app reads one shape. */
function yahooPlayoffs(root: unknown): { playoff_week_start?: number; playoff_teams?: number } {
  const out: { playoff_week_start?: number; playoff_teams?: number } = {}
  const seen = new Set<unknown>()
  const visit = (node: unknown) => {
    if (!node || typeof node !== 'object' || seen.has(node)) return
    seen.add(node)
    if (Array.isArray(node)) {
      for (const item of node) visit(item)
      return
    }
    const obj = node as Record<string, unknown>
    const start = Number(obj.playoff_start_week)
    const teams = Number(obj.num_playoff_teams)
    if (out.playoff_week_start == null && Number.isFinite(start) && start > 0) out.playoff_week_start = start
    if (out.playoff_teams == null && Number.isFinite(teams) && teams > 0) out.playoff_teams = teams
    for (const value of Object.values(obj)) visit(value)
  }
  visit(root)
  return out
}

function yahooWaiver(payload: unknown): Record<string, unknown> | null {
  const pick = (key: string) => {
    const hit = collectByKey(payload, key)[0]
    return hit ? str((hit as Record<string, unknown>)[key]) : ''
  }
  const faab = pick('uses_faab') === '1'
  const days = num(pick('waiver_time'))
  if (!pick('waiver_type') && !pick('uses_faab')) return null
  return {
    type: faab ? 'faab' : pick('waiver_type').toUpperCase().startsWith('C') ? 'continuous' : 'rolling',
    budget: faab ? 100 : null,
    days: [3],
    hour_et: 3,
    waiver_hours: days ? days * 24 : null,
  }
}

export async function createYahooOAuthStart(
  admin: SupabaseClient,
  edgeUserId: string,
  opts: { returnMode?: YahooOAuthReturnMode } = {},
): Promise<{ url: string; state: string }> {
  const env = yahooEnv()
  if (!env) {
    throw new Error(
      'Yahoo Fantasy is not configured yet. Add YAHOO_FANTASY_CLIENT_ID / YAHOO_FANTASY_CLIENT_SECRET Edge secrets.',
    )
  }
  const returnMode: YahooOAuthReturnMode = opts.returnMode === 'native' ? 'native' : 'web'
  const nonce = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '')
  // Prefix encodes return mode for the callback (no schema change).
  const state = returnMode === 'native' ? `n.${nonce}` : `w.${nonce}`
  const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString()
  await admin.from('fantasy_oauth_states').insert({
    state,
    user_id: edgeUserId,
    provider: 'yahoo',
    expires_at: expiresAt,
  })
  // Prune old states opportunistically.
  await admin.from('fantasy_oauth_states').delete().lt('expires_at', new Date().toISOString())
  return { url: yahooAuthorizeUrl(env, state), state }
}

/**
 * Build the post-OAuth redirect.
 * - `native` (ASWebAuthenticationSession): `edgetilt://yahoo-oauth?…` so the auth sheet
 *   intercepts the scheme and dismisses back into Fantasy.
 * - `web` / old IPA Safari: static HTML that opens the app scheme (or Continue in browser).
 */
function yahooHandoffRedirect(
  extra: Record<string, string>,
  returnMode: YahooOAuthReturnMode = 'web',
): string {
  const params = new URLSearchParams()
  params.set('tab', 'fantasy')
  for (const [k, v] of Object.entries(extra)) params.set(k, v)
  const qs = params.toString()
  if (returnMode === 'native') {
    return `edgetilt://yahoo-oauth?${qs}`
  }
  const origin = resolvePublicAppOrigin()
  const u = new URL('/fantasy-yahoo-return.html', origin)
  u.search = qs
  return u.toString()
}

export function yahooSuccessRedirect(
  extra: Record<string, string> = {},
  returnMode: YahooOAuthReturnMode = 'web',
): string {
  return yahooHandoffRedirect({ yahoo: 'linked', ...extra }, returnMode)
}

export function yahooErrorRedirect(
  message: string,
  returnMode: YahooOAuthReturnMode = 'web',
): string {
  return yahooHandoffRedirect(
    {
      yahoo: 'error',
      yahoo_error: message.slice(0, 180),
    },
    returnMode,
  )
}

/**
 * Exchange OAuth code, upsert yahoo connection + tokens, sync leagues.
 */
export async function completeYahooOAuth(
  admin: SupabaseClient,
  state: string,
  code: string,
): Promise<{ ok: boolean; userId?: string; error?: string; connectionId?: string }> {
  const env = yahooEnv()
  if (!env) return { ok: false, error: 'Yahoo OAuth not configured.' }

  const { data: st } = await admin
    .from('fantasy_oauth_states')
    .select('user_id, expires_at, provider')
    .eq('state', state)
    .eq('provider', 'yahoo')
    .maybeSingle()
  await admin.from('fantasy_oauth_states').delete().eq('state', state)
  if (!st?.user_id) return { ok: false, error: 'Invalid or expired OAuth state.' }
  if (st.expires_at && new Date(st.expires_at).getTime() < Date.now()) {
    return { ok: false, error: 'OAuth state expired. Try Connect Yahoo again.', userId: String(st.user_id) }
  }

  const tokens = await exchangeCode(env, code)
  const profile = await yahooGet(tokens.access_token, '/users;use_login=1')
  const users = collectByKey(profile, 'guid')
  const guid = str(users[0]?.guid)
  if (!guid) return { ok: false, error: 'Could not read Yahoo user guid.', userId: String(st.user_id) }

  let nickname = ''
  for (const u of users) {
    nickname = str(u.nickname) || str(u.email) || nickname
  }

  const { data: conn, error: connErr } = await admin
    .from('fantasy_connections')
    .upsert(
      {
        user_id: String(st.user_id),
        provider: 'yahoo',
        external_user_id: guid,
        external_username: nickname || guid.slice(0, 12),
        status: 'active',
        last_error: null,
      },
      { onConflict: 'user_id,provider' },
    )
    .select('id')
    .single()
  if (connErr || !conn?.id) {
    return { ok: false, error: connErr?.message || 'Could not save Yahoo connection.', userId: String(st.user_id) }
  }

  await saveTokens(admin, String(conn.id), tokens)
  const sync = await syncYahooConnection(admin, String(st.user_id), String(conn.id))
  return {
    ok: sync.ok,
    userId: String(st.user_id),
    connectionId: String(conn.id),
    error: sync.error,
  }
}

/** Today's US Eastern date (Yahoo NBA daily lineups are keyed by it). */
function etToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

function nbaNameKey(name: string): string {
  return String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, '')
    .replace(/[^a-z]/g, '')
}

function nbaPlayerIndex(players: NbaPlayer[]): Map<string, NbaPlayer[]> {
  const index = new Map<string, NbaPlayer[]>()
  for (const p of players) {
    const key = nbaNameKey(p.name)
    if (key) index.set(key, [...(index.get(key) || []), p])
  }
  return index
}

/** Sleeper NBA id by name, team breaking ties (Sleeper NBA ids collide with NFL ones, so never nfl_players). */
function resolveNbaSleeperId(index: Map<string, NbaPlayer[]>, name: string, team: string): string | null {
  const rows = index.get(nbaNameKey(name)) || []
  if (rows.length <= 1) return rows[0]?.sleeper_id || null
  return (rows.find((r) => r.team === team) || rows[0]).sleeper_id
}

export async function syncYahooConnection(
  admin: SupabaseClient,
  edgeUserId: string,
  connectionId: string,
): Promise<SyncResult> {
  try {
    const access = await accessTokenForConnection(admin, connectionId)
    const nflState = await fetchNflState().catch(() => ({ season: String(new Date().getFullYear()), week: 1, season_type: 'regular' }))
    const season = Number(nflState.season) || new Date().getFullYear()
    let week = Math.max(1, Number(nflState.week) || 1)

    let primaryLeagueId: string | null = null
    let leagueCount = 0
    let nbaIndex: Map<string, NbaPlayer[]> | null = null
    for (const sport of ['nfl', 'nba'] as const) {
      try {
        if (sport === 'nba') nbaIndex = nbaPlayerIndex(await sleeperNbaPlayers(admin).catch(() => []))
        // User's teams (includes league_key + team_key for is_mine).
        const teamsPayload = await yahooGet(
          access,
          `/users;use_login=1/games;game_keys=${sport}/teams`,
        )
        const myTeams = yahooEntities(teamsPayload, 'team')
        const myByLeague = new Map<string, Record<string, unknown>>()
        for (const t of myTeams) {
          const teamKey = str(t.team_key)
          // team_key = {game}.l.{league}.t.{team}
          const m = teamKey.match(/^(.+\.l\.\d+)\.t\.\d+$/)
          const leagueKey = m?.[1] || str(t.league_key)
          if (!leagueKey || !teamKey) continue
          myByLeague.set(leagueKey, t)
        }

        const leagueKeys = [...myByLeague.keys()]
        if (!leagueKeys.length) {
          // Fallback: leagues collection (no team ownership filter).
          const leaguesPayload = await yahooGet(
            access,
            `/users;use_login=1/games;game_keys=${sport}/leagues`,
          )
          for (const lg of collectByKey(leaguesPayload, 'league_key')) {
            const lk = str(lg.league_key)
            if (lk) leagueKeys.push(lk)
          }
        }

        const uniqueLeagueKeys = [...new Set(leagueKeys)]
        leagueCount += uniqueLeagueKeys.length
        // Leagues of this sport the account no longer lists (left / deleted; their own reads return 400).
        await pruneMissingLeagues(admin, connectionId, sport, uniqueLeagueKeys)

        const gameWeeksByGame = new Map<string, Map<number, { start: string; end: string }>>()
        for (const leagueKey of uniqueLeagueKeys) {
          const metaPayload = await yahooGet(access, `/league/${encodeURIComponent(leagueKey)}`)
          const leagues = yahooEntities(metaPayload, 'league')
          const lg = leagues.find((x) => str(x.league_key) === leagueKey) || leagues[0]
          if (!lg) continue

          // Before the first scoring week (`start_week` > `current_week`), sync that first matchup so the league
          // shows its real opponents and rosters ahead of time.
          const leagueWeek = Math.max(num(lg.current_week) || num(lg.edit_key_week) || week, num(lg.start_week) || 0)
          week = leagueWeek || week
          const leagueSeason = num(lg.season) || season
          const leagueName = str(lg.name) || 'Yahoo League'
          let scoring: Record<string, number> = {}
          let waiver: Record<string, unknown> | null = null
          let lineupSlots: string[] = []
          let playoffs: { playoff_week_start?: number; playoff_teams?: number } = {}
          let nbaExtra: Record<string, unknown> = {}
          try {
            const settingsPayload = await yahooGet(access, `/league/${encodeURIComponent(leagueKey)}/settings`)
            scoring = sport === 'nba' ? yahooNbaScoringFromSettings(settingsPayload) : yahooScoringFromSettings(settingsPayload)
            if (sport === 'nba') {
              // Points leagues score `scoring`; categories leagues (`head` / `roto`) win stat by stat and score
              // "category value" (z-score weights from this week's per-game projections) in the points engines.
              const categories = str(lg.scoring_type) === 'headpoint' ? [] : yahooNbaCategories(settingsPayload)
              // High Score: each starter's best game of the week counts; lineups are weekly (roster_type 'week').
              const highScore = ['true', '1'].includes(String(yahooLeagueField(settingsPayload, 'is_highscore') ?? '').toLowerCase())
              const rosterType = String(yahooLeagueField(settingsPayload, 'roster_type') ?? '').toLowerCase()
              const maxAdds = Number(yahooLeagueField(settingsPayload, 'max_weekly_adds'))
              nbaExtra = {
                categories,
                daily_lineups: rosterType ? rosterType === 'date' : str(lg.weekly_deadline) === 'intraday' || !str(lg.weekly_deadline),
                ...(highScore ? { high_score: true } : {}),
                ...(Number.isFinite(maxAdds) && maxAdds > 0 ? { max_weekly_adds: maxAdds } : {}),
              }
              if (categories.length) {
                const board = await loadNbaBoard().catch(() => null)
                const cw = categoryWeights(categories, Object.values(board?.projLine || {}))
                scoring = cw.weights
                nbaExtra = { ...nbaExtra, category_value: true, category_pct: cw.pct }
              }
            }
            waiver = yahooWaiver(settingsPayload)
            lineupSlots = yahooLineupSlots(settingsPayload)
            playoffs = yahooPlayoffs(settingsPayload)
            // H2H NBA: the playoff weeks' dates (playoff start week through the league's last week).
            const lastWeek = num(lg.end_week)
            if (sport === 'nba' && playoffs.playoff_week_start && lastWeek >= playoffs.playoff_week_start && /^head/.test(str(lg.scoring_type))) {
              const gameKey = leagueKey.split('.l.')[0]
              let calendar = gameWeeksByGame.get(gameKey)
              if (!calendar) {
                calendar = yahooGameWeeks(await yahooGet(access, `/game/${encodeURIComponent(gameKey)}/game_weeks`).catch(() => null))
                gameWeeksByGame.set(gameKey, calendar)
              }
              const playoffDates: Array<{ week: number; start: string; end: string }> = []
              for (let w = playoffs.playoff_week_start; w <= lastWeek; w++) {
                const d = calendar.get(w)
                if (d) playoffDates.push({ week: w, ...d })
              }
              if (playoffDates.length) nbaExtra = { ...nbaExtra, playoff_dates: playoffDates }
            }
          } catch {
            scoring = {}
          }

          // Keep last sync's schedule while it is fresh (Yahoo's full-schedule read is ~4 MB).
          const { data: priorRow } = await admin
            .from('fantasy_leagues')
            .select('settings')
            .eq('connection_id', connectionId)
            .eq('external_league_id', leagueKey)
            .maybeSingle()
          const priorSchedule = reusableSchedule((priorRow?.settings as Record<string, unknown> | null)?.schedule, week)
          const leagueSettings: Record<string, unknown> = {
            current_week: week,
            num_teams: num(lg.num_teams),
            scoring_type: str(lg.scoring_type),
            ...nbaExtra,
            ...(waiver ? { waiver } : {}),
            ...(lineupSlots.length ? { lineup_slots: lineupSlots } : {}),
            ...playoffs,
            ...(priorSchedule ? { schedule: priorSchedule } : {}),
          }
          const { data: leagueRow, error: lgErr } = await admin
            .from('fantasy_leagues')
            .upsert(
              {
                connection_id: connectionId,
                user_id: edgeUserId,
                provider: 'yahoo',
                external_league_id: leagueKey,
                name: leagueName,
                season: leagueSeason,
                sport,
                scoring,
                settings: leagueSettings,
                updated_at: new Date().toISOString(),
              },
              { onConflict: 'connection_id,external_league_id' },
            )
            .select('id, is_primary')
            .single()
          if (lgErr || !leagueRow?.id) throw new Error(lgErr?.message || 'League upsert failed')
          const leagueId = String(leagueRow.id)
          if (leagueRow.is_primary) primaryLeagueId = leagueId

          const standingsPayload = await yahooGet(
            access,
            `/league/${encodeURIComponent(leagueKey)}/standings`,
          )
          const standTeams = yahooEntities(standingsPayload, 'team')
          const myTeam = myByLeague.get(leagueKey)
          const myTeamKey = str(myTeam?.team_key)

          const teamIdByKey = new Map<string, string>()
          let mineTeamId: string | null = null

          for (const t of standTeams) {
            const teamKey = str(t.team_key)
            if (!teamKey) continue
            const managers = collectByKey(t, 'manager_id')
            const ownerName =
              str(managers[0]?.nickname) ||
              str(managers[0]?.guid) ||
              str(t.managers) ||
              'Manager'
            const teamName = str(t.name) || ownerName
            const isMine = Boolean(myTeamKey && teamKey === myTeamKey)
            const standings = (t.team_standings && typeof t.team_standings === 'object'
              ? (t.team_standings as Record<string, unknown>)
              : {}) as Record<string, unknown>
            const outcome = (standings.outcome_totals && typeof standings.outcome_totals === 'object'
              ? (standings.outcome_totals as Record<string, unknown>)
              : {}) as Record<string, unknown>

            const { data: teamRow, error: tErr } = await admin
              .from('fantasy_teams')
              .upsert(
                {
                  league_id: leagueId,
                  user_id: edgeUserId,
                  external_team_id: teamKey,
                  owner_name: ownerName,
                  team_name: teamName,
                  avatar_url: yahooTeamLogo(t),
                  is_mine: isMine,
                  wins: num(outcome.wins) || 0,
                  losses: num(outcome.losses) || 0,
                  ties: num(outcome.ties) || 0,
                  points_for: num(standings.points_for),
                  points_against: num(standings.points_against),
                  metadata: {
                    yahoo_team_key: teamKey,
                    waiver: {
                      rank: num(t.waiver_priority) || null,
                      faab_left: t.faab_balance != null && str(t.faab_balance) !== '' ? num(t.faab_balance) : null,
                    },
                    ...(isMine ? yahooTeamAdds(t) : {}),
                  },
                  updated_at: new Date().toISOString(),
                },
                { onConflict: 'league_id,external_team_id' },
              )
              .select('id')
              .single()
            if (tErr || !teamRow?.id) throw new Error(tErr?.message || 'Team upsert failed')
            teamIdByKey.set(teamKey, String(teamRow.id))
            if (isMine) mineTeamId = String(teamRow.id)
          }

          // Scoreboard → one row per game. Home side is mine_team_id.
          let sb: unknown = null
          try {
            sb = await yahooGet(
              access,
              `/league/${encodeURIComponent(leagueKey)}/scoreboard;week=${week}`,
            )
          } catch {
            sb = null
          }
          if (sb) {
            // The synced matchup week's first day lets the app tell an upcoming week from a live one.
            const weekStart = str(collectByKey(sb, 'week_start')[0]?.week_start)
            if (weekStart && sport === 'nba') {
              await admin
                .from('fantasy_leagues')
                .update({ settings: { ...leagueSettings, matchup_week_start: weekStart } })
                .eq('id', leagueId)
            }
            await admin.from('fantasy_matchups').delete().eq('league_id', leagueId).eq('week', week)
            const seenPairs = new Set<string>()
            for (const mu of findScoreboardMatchups(sb)) {
              const teamsIn = yahooEntities(mu, 'team')
              if (teamsIn.length < 2) continue
              const aKey = str(teamsIn[0].team_key)
              const bKey = str(teamsIn[1].team_key)
              const aId = aKey ? teamIdByKey.get(aKey) || null : null
              const bId = bKey ? teamIdByKey.get(bKey) || null : null
              if (!aId) continue
              const pairKey = [aId, bId].filter(Boolean).sort().join(':')
              if (seenPairs.has(pairKey)) continue
              seenPairs.add(pairKey)
              const pointsFor = (tt: Record<string, unknown>) => {
                const ptsObj = tt.team_points
                return num(
                  ptsObj && typeof ptsObj === 'object'
                    ? (ptsObj as Record<string, unknown>).total
                    : tt.points,
                )
              }
              // Categories leagues: category wins are the score (same as ESPN), with per-category totals + results.
              const cats = sport === 'nba' && Array.isArray(leagueSettings.categories) ? (leagueSettings.categories as YahooNbaCategory[]) : []
              const catMu = cats.length ? yahooCategoryMatchup(mu, teamsIn[0], bId ? teamsIn[1] : null, cats) : null
              const { error: muErr } = await admin.from('fantasy_matchups').upsert(
                {
                  league_id: leagueId,
                  user_id: edgeUserId,
                  week,
                  mine_team_id: aId,
                  opp_team_id: bId,
                  mine_score: catMu ? catMu.wins : pointsFor(teamsIn[0]),
                  opp_score: bId ? (catMu ? catMu.losses : pointsFor(teamsIn[1])) : null,
                  categories: catMu,
                  external_matchup_id: `${leagueKey}:w${week}:${pairKey}`,
                  updated_at: new Date().toISOString(),
                },
                { onConflict: 'league_id,week,mine_team_id' },
              )
              if (muErr) throw new Error(muErr.message)
            }
          }

          // Rest of the regular season for League outlook (every team's matchups in one read).
          if (!priorSchedule) {
            try {
              const all = await yahooGet(access, `/league/${encodeURIComponent(leagueKey)}/teams/matchups`)
              const weeks: ScheduleWeeks = {}
              for (const mu of yahooMatchupObjects(all)) {
                const w = Number(mu.week)
                if (str(mu.is_playoffs) === '1' || str(mu.is_consolation) === '1') continue
                const teamsIn = yahooEntities(mu, 'team')
                if (!Number.isFinite(w) || teamsIn.length !== 2) continue
                addSchedulePair(weeks, w, teamIdByKey.get(str(teamsIn[0].team_key)) || null, teamIdByKey.get(str(teamsIn[1].team_key)) || null, week + 1)
              }
              await saveLeagueSchedule(admin, leagueId, weeks)
            } catch {
              /* outlook falls back to random pairings */
            }
          }

          const keysToFetch = [...teamIdByKey.keys()]

          for (const teamKey of keysToFetch) {
            const teamId = teamIdByKey.get(teamKey)
            if (!teamId) continue
            // NBA lineups are daily: today's slots, plus each player's points so far this week.
            const rosterPayload = await yahooGet(
              access,
              sport === 'nba'
                ? `/team/${encodeURIComponent(teamKey)}/roster;date=${etToday()}/players/stats;type=week;week=${week}`
                : `/team/${encodeURIComponent(teamKey)}/roster;week=${week}`,
            )
            const players = yahooEntities(rosterPayload, 'player')
            const rows = []
            for (const p of players) {
              const yahooKey = str(p.player_key)
              const playerName = playerFullName(p)
              const slot = selectedSlot(p)
              if (sport === 'nba') {
                const team = nbaTeam(str(p.editorial_team_abbr))
                const position = str(p.primary_position) || str(p.display_position).split(',')[0] || ''
                const pts = p.player_points && typeof p.player_points === 'object' ? num((p.player_points as Record<string, unknown>).total) : null
                const elig = Array.isArray(p.eligible_positions)
                  ? (p.eligible_positions as Array<Record<string, unknown>>).map((e) => str(e?.position).toUpperCase()).filter(Boolean)
                  : []
                rows.push({
                  team_id: teamId,
                  user_id: edgeUserId,
                  week,
                  sleeper_id: nbaIndex ? resolveNbaSleeperId(nbaIndex, playerName, team) : null,
                  yahoo_player_key: yahooKey || null,
                  player_name: playerName || yahooKey || 'Player',
                  position: position || null,
                  nfl_team: team || null,
                  slot,
                  slot_label: selectedPosition(p) || slot,
                  week_points: pts,
                  eligible_positions: elig.length ? elig : null,
                })
                continue
              }
              const position = str(p.display_position) || str(p.primary_position)
              const nflTeam = normalizeTeamAbbrev(str(p.editorial_team_abbr) || str(p.editorial_team_key))
              const sleeperId = await resolveSleeperId(admin, playerName, nflTeam, position)
              rows.push({
                team_id: teamId,
                user_id: edgeUserId,
                week,
                sleeper_id: sleeperId,
                yahoo_player_key: yahooKey || null,
                player_name: playerName || yahooKey || 'Player',
                position: position || null,
                nfl_team: nflTeam || null,
                slot,
                slot_label: selectedPosition(p) || slot,
              })
            }
            // Clear and write back to back: the Sleeper id lookups above take seconds, and a waiver / trade read in
            // that gap saw the team empty and listed its whole roster as free agents.
            await admin.from('fantasy_rosters').delete().eq('team_id', teamId).eq('week', week)
            if (rows.length) {
              const { error: rErr } = await admin.from('fantasy_rosters').insert(rows)
              if (rErr) throw new Error(rErr.message)
            }
          }

          if (!primaryLeagueId && mineTeamId) primaryLeagueId = leagueId
        }
      } catch (err) {
        if (sport === 'nfl') throw err
        console.error('yahoo nba sync', connectionId, err instanceof Error ? err.message : err)
      }
    }

    const { data: existingPrimary } = await admin
      .from('fantasy_leagues')
      .select('id')
      .eq('user_id', edgeUserId)
      .eq('is_primary', true)
      .maybeSingle()
    // Do not steal primary from another provider on quiet sync; first-ever league becomes primary.
    if (primaryLeagueId && !existingPrimary) {
      await admin.from('fantasy_leagues').update({ is_primary: true }).eq('id', primaryLeagueId)
    }

    await admin
      .from('fantasy_connections')
      .update({
        last_sync_at: new Date().toISOString(),
        last_error: null,
        status: 'active',
        primary_league_id: primaryLeagueId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', connectionId)

    return {
      ok: true,
      connectionId,
      season,
      week,
      leagues: leagueCount,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await admin
      .from('fantasy_connections')
      .update({ status: 'error', last_error: message.slice(0, 500) })
      .eq('id', connectionId)
    return { ok: false, connectionId, error: message }
  }
}
