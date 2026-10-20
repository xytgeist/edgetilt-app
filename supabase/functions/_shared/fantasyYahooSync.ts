/**
 * Yahoo Fantasy Connect … OAuth 2.0 + league / roster / matchup sync.
 * Tokens live in fantasy_provider_tokens (service-role only).
 * Players map onto nfl_players.sleeper_id by name + team (+ position).
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { resolvePublicAppOrigin } from './publicAppOrigin.ts'
import { fetchNflState, type SyncResult } from './fantasySleeperSync.ts'
import { yahooScoringFromSettings } from './fantasyScoringRules.ts'

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

function selectedSlot(player: Record<string, unknown>): 'starter' | 'bench' | 'ir' | 'taxi' {
  const sel = player.selected_position
  let pos = ''
  if (Array.isArray(sel)) {
    for (const item of sel) {
      if (item && typeof item === 'object' && 'position' in (item as object)) {
        pos = str((item as Record<string, unknown>).position).toUpperCase()
        break
      }
    }
  } else if (sel && typeof sel === 'object') {
    pos = str((sel as Record<string, unknown>).position).toUpperCase()
  }
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

    // User's NFL teams (includes league_key + team_key for is_mine).
    const teamsPayload = await yahooGet(
      access,
      '/users;use_login=1/games;game_keys=nfl/teams',
    )
    const myTeams = collectByKey(teamsPayload, 'team_key')
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
        '/users;use_login=1/games;game_keys=nfl/leagues',
      )
      for (const lg of collectByKey(leaguesPayload, 'league_key')) {
        const lk = str(lg.league_key)
        if (lk) leagueKeys.push(lk)
      }
    }

    const uniqueLeagueKeys = [...new Set(leagueKeys)]
    let primaryLeagueId: string | null = null

    for (const leagueKey of uniqueLeagueKeys) {
      const metaPayload = await yahooGet(access, `/league/${encodeURIComponent(leagueKey)}`)
      const leagues = collectByKey(metaPayload, 'league_key')
      const lg = leagues.find((x) => str(x.league_key) === leagueKey) || leagues[0]
      if (!lg) continue

      const leagueWeek = num(lg.current_week) || num(lg.edit_key_week) || week
      week = leagueWeek || week
      const leagueSeason = num(lg.season) || season
      const leagueName = str(lg.name) || 'Yahoo League'
      let scoring: Record<string, number> = {}
      let waiver: Record<string, unknown> | null = null
      try {
        const settingsPayload = await yahooGet(access, `/league/${encodeURIComponent(leagueKey)}/settings`)
        scoring = yahooScoringFromSettings(settingsPayload)
        waiver = yahooWaiver(settingsPayload)
      } catch {
        scoring = {}
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
            sport: 'nfl',
            scoring,
            settings: {
              current_week: week,
              num_teams: num(lg.num_teams),
              scoring_type: str(lg.scoring_type),
              ...(waiver ? { waiver } : {}),
            },
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
      const standTeams = collectByKey(standingsPayload, 'team_key')
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
        await admin.from('fantasy_matchups').delete().eq('league_id', leagueId).eq('week', week)
        const seenPairs = new Set<string>()
        for (const mu of findScoreboardMatchups(sb)) {
          const teamsIn = collectByKey(mu, 'team_key')
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
          const { error: muErr } = await admin.from('fantasy_matchups').upsert(
            {
              league_id: leagueId,
              user_id: edgeUserId,
              week,
              mine_team_id: aId,
              opp_team_id: bId,
              mine_score: pointsFor(teamsIn[0]),
              opp_score: bId ? pointsFor(teamsIn[1]) : null,
              external_matchup_id: `${leagueKey}:w${week}:${pairKey}`,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'league_id,week,mine_team_id' },
          )
          if (muErr) throw new Error(muErr.message)
        }
      }

      const keysToFetch = [...teamIdByKey.keys()]

      for (const teamKey of keysToFetch) {
        const teamId = teamIdByKey.get(teamKey)
        if (!teamId) continue
        const rosterPayload = await yahooGet(
          access,
          `/team/${encodeURIComponent(teamKey)}/roster;week=${week}`,
        )
        const players = collectByKey(rosterPayload, 'player_key')
        await admin.from('fantasy_rosters').delete().eq('team_id', teamId).eq('week', week)
        const rows = []
        for (const p of players) {
          const yahooKey = str(p.player_key)
          const playerName = playerFullName(p)
          const position = str(p.display_position) || str(p.primary_position)
          const nflTeam = normalizeTeamAbbrev(str(p.editorial_team_abbr) || str(p.editorial_team_key))
          const slot = selectedSlot(p)
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
            slot_label: str(
              Array.isArray(p.selected_position)
                ? (p.selected_position[0] as Record<string, unknown>)?.position
                : (p.selected_position as Record<string, unknown>)?.position,
            ) || slot,
          })
        }
        if (rows.length) {
          const { error: rErr } = await admin.from('fantasy_rosters').insert(rows)
          if (rErr) throw new Error(rErr.message)
        }
      }

      if (!primaryLeagueId && mineTeamId) primaryLeagueId = leagueId
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
      leagues: uniqueLeagueKeys.length,
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
