/**
 * Service-role cron: APNs Live Activity updates for watched games.
 * No-ops when `live_activity_push_tokens` is empty.
 */
import { createClient } from 'npm:@supabase/supabase-js@2'
import { adminOpsCorsHeaders, adminOpsJson, authorizeServiceRoleOrAdmin } from '../_shared/adminAuth.ts'
import { cachedLoungeSportsScoreboard } from '../_shared/loungeSportsScoreboard.ts'
import {
  fingerprintLiveSportsState,
  liveSportsContentStateFromGame,
  type LiveSportsContentState,
} from '../_shared/liveSportsActivityState.ts'
import {
  liveActivityShouldDropToken,
  liveActivityShouldRetryOtherEnvironment,
  otherApnsEnvironment,
  postLiveActivityApns,
  readApnsConfig,
  type ApnsEnvironment,
} from '../_shared/apnsPush.ts'

const BOARD_TTL_MS = 8_000

type TokenRow = {
  id: string
  user_id: string
  game_id: string
  token: string
  environment: string
  bundle_id: string
  last_fingerprint: string | null
  last_state: LiveSportsContentState | null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: adminOpsCorsHeaders })
  if (req.method !== 'POST') return adminOpsJson(405, { error: 'Method not allowed' })

  let admin
  try {
    admin = await authorizeServiceRoleOrAdmin(req)
  } catch (err) {
    if (err instanceof Response) return err
    return adminOpsJson(401, { error: 'Unauthorized' })
  }

  const { data: rows, error } = await admin
    .from('live_activity_push_tokens')
    .select('id, user_id, game_id, token, environment, bundle_id, last_fingerprint, last_state')
    .limit(400)

  if (error) return adminOpsJson(500, { error: error.message })
  const tokens = (rows || []) as TokenRow[]
  if (!tokens.length) {
    return adminOpsJson(200, { ok: true, skipped: true, reason: 'no_tokens' })
  }

  const config = readApnsConfig()
  if (!config) {
    return adminOpsJson(200, { ok: true, skipped: true, reason: 'apns_not_configured' })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const scoreAdmin = createClient(supabaseUrl || '', serviceKey || '')
  const board = await cachedLoungeSportsScoreboard(scoreAdmin, BOARD_TTL_MS)
  const byId = new Map((board.games || []).map((g) => [String(g.id), g]))

  let sent = 0
  let ended = 0
  let failed = 0
  let removed = 0
  let unchanged = 0

  for (const row of tokens) {
    const game = byId.get(String(row.game_id))
    const prev = row.last_state
    const status = String(game?.status || '').toLowerCase()
    const event = !game || status === 'post' || status === 'final' ? 'end' : 'update'
    const state = game
      ? liveSportsContentStateFromGame(game, prev)
      : prev || {
        gameId: row.game_id,
        sportKey: '',
        awayAbbrev: '',
        homeAbbrev: '',
        awayScore: 0,
        homeScore: 0,
        status: 'post',
        clock: '',
        period: '',
        detail: '',
        awayLogoUrl: '',
        homeLogoUrl: '',
        possession: '',
        awaySpread: '',
        homeSpread: '',
        awayMl: '',
        homeMl: '',
        totalLine: '',
      }
    const fingerprint = event === 'end' ? `end:${row.game_id}` : fingerprintLiveSportsState(state)
    if (event === 'update' && fingerprint === row.last_fingerprint) {
      unchanged += 1
      continue
    }

    const preferred: ApnsEnvironment = row.environment === 'sandbox' ? 'sandbox' : 'production'
    const order: ApnsEnvironment[] = [preferred, otherApnsEnvironment(preferred)]
    let delivered = false
    let lastReason = ''
    let lastStatus = 0
    for (const env of order) {
      const result = await postLiveActivityApns(
        config,
        row.token,
        env,
        row.bundle_id || 'com.edgetilt.app',
        event,
        state,
      )
      lastReason = result.reason
      lastStatus = result.status
      if (result.ok) {
        delivered = true
        if (env !== preferred) {
          await admin.from('live_activity_push_tokens').update({ environment: env }).eq('id', row.id)
        }
        break
      }
      if (!liveActivityShouldRetryOtherEnvironment(result.reason)) break
    }

    if (!delivered) {
      failed += 1
      if (liveActivityShouldDropToken(lastStatus, lastReason)) {
        const { error: delErr } = await admin.from('live_activity_push_tokens').delete().eq('id', row.id)
        if (!delErr) removed += 1
      }
      continue
    }

    if (event === 'end') {
      await admin.from('live_activity_push_tokens').delete().eq('id', row.id)
      ended += 1
    } else {
      await admin.from('live_activity_push_tokens').update({
        last_fingerprint: fingerprint,
        last_state: state,
      }).eq('id', row.id)
      sent += 1
    }
  }

  return adminOpsJson(200, {
    ok: true,
    sent,
    ended,
    failed,
    removed,
    unchanged,
    watchers: tokens.length,
  })
})
