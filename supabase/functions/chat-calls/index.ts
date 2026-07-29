/**
 * LiveKit chat calling: start / accept / join / decline / leave / end / token refresh.
 * Membership source of truth: chat_rooms + chat_room_members.
 */
import { createClient } from 'npm:@supabase/supabase-js@2'
import {
  AccessToken,
  EgressClient,
  EncodedFileOutput,
  EncodedFileType,
  RoomServiceClient,
  S3Upload,
  TrackSource,
} from 'npm:livekit-server-sdk@2'
import {
  egressInfoLooksComplete,
  egressInfoLooksFailed,
  finalizeChatCallRecording,
  normalizeEgressStatus,
} from '../_shared/chatCallRecordingFinalize.ts'
import { ensureCallSummaryMessage } from '../_shared/chatCallSummary.ts'
import {
  loungeCfR2IsAllowedPublicUrl,
  loungeCfR2PublicUrl,
  readLoungeCfR2Config,
} from '../_shared/loungeCfR2.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MAX_CALL_DURATION_MS = 60 * 60 * 1000
const MAX_GROUP_PARTICIPANTS = 12
const START_CALL_RATE_WINDOW_MS = 60_000
const START_CALL_RATE_MAX = 8
/** Manual RoomComposite recording hard cap (product lock). */
const MAX_RECORDING_SECONDS = 600

const CALL_SELECT_BASE =
  'id, chat_room_id, kind, media_mode, status, started_by, started_at, answered_at, livekit_room_name, recording_status, recording_started_by, recording_started_at, recording_egress_id, recording_r2_key, recording_featured_identity'

function readEgressTemplateBaseUrl(): string {
  const explicit = String(Deno.env.get('CHAT_CALL_EGRESS_TEMPLATE_BASE_URL') || '')
    .trim()
    .replace(/\/+$/, '')
  if (explicit) return explicit
  // Prefer whatever public host the Lounge R2 secrets use (keeps prod/test from drifting).
  // Publish with: node scripts/publish-call-egress-template-local.mjs --target=test|production
  const r2Base = String(Deno.env.get('LOUNGE_CF_R2_PUBLIC_BASE_URL') || '')
    .trim()
    .replace(/\/+$/, '')
  if (r2Base) return `${r2Base}/call-egress/call-egress.html`
  // Legacy hardcodes if R2 public base is somehow unset.
  const supabaseUrl = String(Deno.env.get('SUPABASE_URL') || '')
  if (supabaseUrl.includes('kcosfvmreeiosdjdzycb')) {
    return 'https://media-test.lvslotpro.com/call-egress/call-egress.html'
  }
  if (supabaseUrl.includes('jtjgtucumuoswnbauxry')) {
    // Until edgetilt.com can move into the R2 Cloudflare account (~60d registrar lock),
    // prod media host is media.lvslotpro.com on the same bucket as media-test.
    return 'https://media.lvslotpro.com/call-egress/call-egress.html'
  }
  return ''
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function minProfile(p: { handle?: string | null; display_name?: string | null } | null) {
  return String(p?.handle || '').trim().length >= 2 && String(p?.display_name || '').trim().length >= 1
}

/** Normalize dashboard / secret URL into browser (wss) + API (https) hosts. */
function normalizeLiveKitUrls(raw: string) {
  const trimmed = String(raw || '').trim().replace(/\/+$/, '')
  const host = trimmed
    .replace(/^wss?:\/\//i, '')
    .replace(/^https?:\/\//i, '')
    .trim()
  if (!host) throw new Error('LIVEKIT_URL is empty or invalid.')
  return {
    /** Browser LiveKitRoom serverUrl */
    url: `wss://${host}`,
    /** RoomServiceClient host */
    httpUrl: `https://${host}`,
  }
}

function requireLiveKitEnv() {
  const rawUrl = Deno.env.get('LIVEKIT_URL')?.trim() || ''
  const apiKey = Deno.env.get('LIVEKIT_API_KEY')?.trim() || ''
  const apiSecret = Deno.env.get('LIVEKIT_API_SECRET')?.trim() || ''
  if (!rawUrl || !apiKey || !apiSecret) {
    throw new Error('Missing LIVEKIT_URL, LIVEKIT_API_KEY, or LIVEKIT_API_SECRET Edge secrets.')
  }
  const { url, httpUrl } = normalizeLiveKitUrls(rawUrl)
  return { url, httpUrl, apiKey, apiSecret }
}

type Admin = ReturnType<typeof createClient>

async function mintToken(args: {
  apiKey: string
  apiSecret: string
  identity: string
  displayName: string
  roomName: string
  canPublish: boolean
  /** LiveKit TrackSource enums (not string labels). */
  canPublishSources?: TrackSource[]
}) {
  const at = new AccessToken(args.apiKey, args.apiSecret, {
    identity: args.identity,
    name: args.displayName,
    ttl: '2h',
    metadata: JSON.stringify({ displayName: args.displayName }),
  })
  at.addGrant({
    roomJoin: true,
    room: args.roomName,
    canPublish: args.canPublish,
    canSubscribe: true,
    canPublishData: true,
    ...(args.canPublishSources?.length ? { canPublishSources: args.canPublishSources } : {}),
  })
  return await at.toJwt()
}

async function deleteLiveKitRoom(httpUrl: string, apiKey: string, apiSecret: string, roomName: string) {
  try {
    const svc = new RoomServiceClient(httpUrl, apiKey, apiSecret)
    await svc.deleteRoom(roomName)
  } catch (err) {
    console.warn('chat-calls: deleteRoom failed', roomName, err)
  }
}

async function removeLiveKitParticipant(
  httpUrl: string,
  apiKey: string,
  apiSecret: string,
  roomName: string,
  identity: string,
) {
  try {
    const svc = new RoomServiceClient(httpUrl, apiKey, apiSecret)
    await svc.removeParticipant(roomName, identity)
  } catch (err) {
    console.warn('chat-calls: removeParticipant failed', roomName, identity, err)
  }
}

async function assertMember(admin: Admin, roomId: string, userId: string) {
  const { data, error } = await admin
    .from('chat_room_members')
    .select('user_id, moderation_muted_until')
    .eq('room_id', roomId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data?.user_id) {
    const e = new Error('Not a member of this chat.')
    ;(e as Error & { status: number }).status = 403
    throw e
  }
  return data
}

async function assertDmNotBlocked(admin: Admin, a: string, b: string) {
  const { data: blockRows } = await admin
    .from('blocks')
    .select('blocker_id')
    .or(`and(blocker_id.eq.${a},blocked_id.eq.${b}),and(blocker_id.eq.${b},blocked_id.eq.${a})`)
  if (blockRows && blockRows.length > 0) {
    const iBlockThem = blockRows.some((r: { blocker_id: string }) => r.blocker_id === a)
    const e = new Error(iBlockThem ? 'You have blocked this member.' : 'This member is unavailable.')
    ;(e as Error & { status: number }).status = 403
    throw e
  }
}

async function loadRoom(admin: Admin, roomId: string) {
  const { data, error } = await admin
    .from('chat_rooms')
    .select('id, kind, dm_key, title')
    .eq('id', roomId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data?.id) {
    const e = new Error('Chat room not found.')
    ;(e as Error & { status: number }).status = 404
    throw e
  }
  return data as { id: string; kind: string; dm_key: string | null; title: string | null }
}

async function enqueueCallActivityPush(
  admin: Admin,
  roomId: string,
  callId: string,
  actorId: string,
  recipientIds: string[],
  eventType: 'chat_call_invite' | 'chat_call_missed',
) {
  if (recipientIds.length === 0) return
  const { data: members } = await admin
    .from('chat_room_members')
    .select('user_id, muted_until, archived_at')
    .eq('room_id', roomId)
    .in('user_id', recipientIds)

  const now = Date.now()
  const deliverTo = (members || [])
    .filter((m) => {
      if (m.archived_at) return false
      const muteUntil = m.muted_until ? new Date(m.muted_until).getTime() : 0
      if (muteUntil > now) return false
      return true
    })
    .map((m) => m.user_id)

  if (deliverTo.length === 0) return

  const rows = deliverTo.map((uid) => ({
    recipient_user_id: uid,
    actor_user_id: actorId,
    event_type: eventType,
    chat_room_id: roomId,
    chat_call_id: callId,
  }))
  const { error } = await admin.from('activity_events').insert(rows)
  if (error) console.warn(`chat-calls: ${eventType} push insert failed`, error.message)
}

async function enqueueCallInvitePush(
  admin: Admin,
  roomId: string,
  callId: string,
  actorId: string,
  recipientIds: string[],
) {
  return enqueueCallActivityPush(admin, roomId, callId, actorId, recipientIds, 'chat_call_invite')
}

async function enqueueCallMissedPush(
  admin: Admin,
  roomId: string,
  callId: string,
  actorId: string,
  recipientIds: string[],
) {
  return enqueueCallActivityPush(admin, roomId, callId, actorId, recipientIds, 'chat_call_missed')
}

async function listMemberIds(admin: Admin, roomId: string, excludeUserId: string) {
  const { data } = await admin.from('chat_room_members').select('user_id').eq('room_id', roomId)
  return (data || []).map((r) => r.user_id).filter((id) => id && id !== excludeUserId)
}

async function rateLimitStart(admin: Admin, userId: string) {
  const since = new Date(Date.now() - START_CALL_RATE_WINDOW_MS).toISOString()
  const { count, error } = await admin
    .from('chat_calls')
    .select('id', { count: 'exact', head: true })
    .eq('started_by', userId)
    .gte('started_at', since)
  if (error) throw new Error(error.message)
  if ((count ?? 0) >= START_CALL_RATE_MAX) {
    const e = new Error('Too many calls started recently. Try again in a minute.')
    ;(e as Error & { status: number }).status = 429
    throw e
  }
}

function callTimedOut(startedAt: string | null | undefined) {
  if (!startedAt) return false
  return Date.now() - new Date(startedAt).getTime() > MAX_CALL_DURATION_MS
}

async function endCallRow(
  admin: Admin,
  call: {
    id: string
    chat_room_id: string
    livekit_room_name: string
    started_by: string
    started_at: string
    answered_at: string | null
    status: string
    kind: string
    media_mode?: string | null
  },
  endedReason: string,
  statusOverride?: 'ended' | 'missed' | 'declined',
) {
  if (['ended', 'missed', 'declined'].includes(call.status)) {
    return { status: call.status, ended_reason: endedReason }
  }

  let status: 'ended' | 'missed' | 'declined' = statusOverride || 'ended'
  if (!statusOverride && call.status === 'ringing' && !call.answered_at) {
    status = endedReason === 'declined' ? 'declined' : 'missed'
  }

  const endedAt = new Date().toISOString()

  await admin
    .from('chat_calls')
    .update({ status, ended_at: endedAt, ended_reason: endedReason })
    .eq('id', call.id)
    .in('status', ['ringing', 'active'])

  await admin
    .from('chat_call_participants')
    .update({ left_at: endedAt })
    .eq('call_id', call.id)
    .is('left_at', null)

  let body = 'Call ended'
  try {
    const summary = await ensureCallSummaryMessage(admin, call, status, endedAt)
    body = summary.body
  } catch (err) {
    console.warn('chat-calls: call summary card failed', err)
    // Fallback chip so the thread still records the end if meta insert fails.
    if (status === 'missed') body = 'Missed call'
    else if (status === 'declined') body = 'Call declined'
    else if (call.answered_at) {
      const durationMs = Math.max(0, new Date(endedAt).getTime() - new Date(call.answered_at).getTime())
      const mins = Math.floor(durationMs / 60000)
      const secs = Math.floor((durationMs % 60000) / 1000)
      body = `Call · ${mins}:${String(secs).padStart(2, '0')}`
    }
    await admin.from('chat_messages').insert({
      room_id: call.chat_room_id,
      sender_id: call.started_by,
      body,
      content_encoding: 'call_summary',
    })
  }

  // Replace ringing OS notification with "Missed call" (same push tag via chat_call_id).
  if (status === 'missed') {
    try {
      const recipients = await listMemberIds(admin, call.chat_room_id, call.started_by)
      await enqueueCallMissedPush(admin, call.chat_room_id, call.id, call.started_by, recipients)
    } catch (err) {
      console.warn('chat-calls: missed push failed', err)
    }
  }

  return { status, ended_reason: endedReason, body }
}

function publishSourcesForCall(_kind: string, mediaMode: string): TrackSource[] {
  if (mediaMode === 'audio') {
    return [TrackSource.MICROPHONE]
  }
  return [TrackSource.MICROPHONE, TrackSource.CAMERA]
}

function egressClientFor(lk: { httpUrl: string; apiKey: string; apiSecret: string }) {
  return new EgressClient(lk.httpUrl, lk.apiKey, lk.apiSecret)
}

function egressErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message || String(err)
  return String(err || 'stopEgress failed')
}

function isBenignStopEgressError(msg: string): boolean {
  return /not found|already|EGRESS_COMPLETE|EGRESS_ENDING|EGRESS_ABORTED|does not exist/i.test(msg)
}

/**
 * Ask LiveKit to stop composite egress and mark chat_calls.recording_status = stopping.
 * @param opts.throwOnError when true (explicit Stop), surface real stopEgress failures to the client.
 */
async function stopActiveRecordingEgress(
  admin: Admin,
  lk: { httpUrl: string; apiKey: string; apiSecret: string },
  call: {
    id: string
    recording_status?: string | null
    recording_egress_id?: string | null
  },
  opts: { throwOnError?: boolean } = {},
) {
  if (call.recording_status !== 'recording' && call.recording_status !== 'stopping') return null
  const egressId = String(call.recording_egress_id || '').trim()
  let stopInfo: unknown = null
  if (egressId) {
    try {
      stopInfo = await egressClientFor(lk).stopEgress(egressId)
    } catch (err) {
      const msg = egressErrorMessage(err)
      if (!isBenignStopEgressError(msg)) {
        console.error('chat-calls: stopEgress failed', call.id, egressId, msg)
        if (opts.throwOnError) {
          const e = new Error(`Could not stop recording: ${msg}`)
          ;(e as Error & { status?: number }).status = 502
          throw e
        }
      } else {
        console.warn('chat-calls: stopEgress benign', call.id, egressId, msg)
      }
    }
  } else if (opts.throwOnError && call.recording_status === 'recording') {
    const e = new Error('Recording has no LiveKit egress id yet. Wait a second and try Stop again.')
    ;(e as Error & { status?: number }).status = 409
    throw e
  }
  await admin
    .from('chat_calls')
    .update({ recording_status: 'stopping' })
    .eq('id', call.id)
    .in('recording_status', ['recording', 'stopping'])
  return stopInfo
}

/** If LiveKit already finished the egress, insert the chat card (webhook backup). */
async function reconcileRecordingFromLiveKit(
  admin: Admin,
  lk: { httpUrl: string; apiKey: string; apiSecret: string },
  call: {
    id: string
    chat_room_id: string
    started_by?: string | null
    recording_status?: string | null
    recording_started_by?: string | null
    recording_r2_key?: string | null
    recording_egress_id?: string | null
  },
) {
  const status = String(call.recording_status || '')
  if (status !== 'recording' && status !== 'stopping') return null
  const egressId = String(call.recording_egress_id || '').trim()
  if (!egressId) return null

  try {
    const listed = await egressClientFor(lk).listEgress({ egressId })
    const info = Array.isArray(listed) ? listed[0] : listed
    if (info) {
      const rawStatus = (info as { status?: unknown }).status
      const egStatus = normalizeEgressStatus(rawStatus)
      if (egressInfoLooksFailed(rawStatus, (info as { error?: string }).error)) {
        // File may still have landed on R2 before LiveKit marked failed... prefer card if object exists.
        const recovered = await finalizeChatCallRecording(admin, call, { requireObject: true })
        if (recovered.recording_status === 'ready') return recovered
        return await finalizeChatCallRecording(admin, call, {
          failed: true,
          errorDetail: String((info as { error?: string }).error || egStatus),
        })
      }
      if (egressInfoLooksComplete(rawStatus)) {
        return await finalizeChatCallRecording(admin, call)
      }
    }
  } catch (err) {
    console.warn('chat-calls: listEgress reconcile failed', call.id, egressId, egressErrorMessage(err))
  }

  // Webhook/listEgress status can lag or arrive as a numeric enum we used to miss.
  // If the MP4 is already public on R2, post the card.
  return await finalizeChatCallRecording(admin, call, { requireObject: true })
}

function recordingPublicFields(call: Record<string, unknown>) {
  return {
    recording_status: call.recording_status || 'idle',
    recording_started_by: call.recording_started_by || null,
    recording_started_at: call.recording_started_at || null,
    recording_featured_identity: call.recording_featured_identity || null,
    recording_max_seconds: MAX_RECORDING_SECONDS,
  }
}

async function finalizeOutgoingCall(args: {
  admin: Admin
  lk: { url: string; httpUrl: string; apiKey: string; apiSecret: string }
  call: {
    id: string
    chat_room_id: string
    kind: string
    media_mode: string
    livekit_room_name: string
  }
  userId: string
  displayName: string
  roomId: string
}) {
  const { admin, lk, call, userId, displayName, roomId } = args
  await admin.from('chat_call_participants').upsert(
    {
      call_id: call.id,
      user_id: userId,
      role: 'caller',
      joined_at: new Date().toISOString(),
      left_at: null,
    },
    { onConflict: 'call_id,user_id' },
  )

  let token: string
  try {
    const sources = publishSourcesForCall(call.kind, call.media_mode)
    token = await mintToken({
      apiKey: lk.apiKey,
      apiSecret: lk.apiSecret,
      identity: userId,
      displayName,
      roomName: call.livekit_room_name,
      canPublish: true,
      canPublishSources: sources,
    })
  } catch (mintErr) {
    await admin
      .from('chat_calls')
      .update({
        status: 'ended',
        ended_at: new Date().toISOString(),
        ended_reason: 'token_mint_failed',
      })
      .eq('id', call.id)
    throw mintErr
  }

  const recipients = await listMemberIds(admin, roomId, userId)
  await enqueueCallInvitePush(admin, roomId, call.id, userId, recipients)
  return { ok: true, call, livekit_url: lk.url, token }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return json(405, { error: 'Method not allowed' })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) {
    return json(500, { error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' })
  }

  const authHeader = req.headers.get('Authorization') || ''
  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    return json(401, { error: 'Missing Authorization bearer token.' })
  }
  const jwt = authHeader.replace(/^Bearer\s+/i, '').trim()
  const admin = createClient(supabaseUrl, serviceKey)

  try {
    let body: Record<string, unknown> = {}
    try {
      body = (await req.json()) as Record<string, unknown>
    } catch {
      return json(400, { error: 'Invalid JSON body.' })
    }

    const action = String(body.action || '').trim()
    if (!action) return json(400, { error: 'Missing action.' })

    const lk = requireLiveKitEnv()

    // Service-role only: pull LiveKit egress status/error for a failed recording smoke.
    if (action === 'debug_egress') {
      let serviceOk = jwt === serviceKey
      if (!serviceOk && jwt.startsWith('eyJ')) {
        try {
          const payload = JSON.parse(atob(jwt.split('.')[1]?.replace(/-/g, '+').replace(/_/g, '/') || ''))
          serviceOk = payload?.role === 'service_role'
        } catch {
          serviceOk = false
        }
      }
      if (!serviceOk) return json(401, { error: 'Service role required.' })
      const egressId = String(body.egress_id || '').trim()
      if (!egressId) return json(400, { error: 'Missing egress_id.' })
      const listed = await egressClientFor(lk).listEgress({ egressId })
      const info = Array.isArray(listed) ? listed[0] : listed
      const safe = (v: unknown) =>
        JSON.parse(
          JSON.stringify(v, (_k, val) => (typeof val === 'bigint' ? val.toString() : val)),
        )
      return json(200, {
        ok: true,
        egress_id: egressId,
        info: info
          ? safe({
              egressId: (info as { egressId?: string }).egressId,
              status: (info as { status?: unknown }).status,
              error: (info as { error?: string }).error || null,
              details: (info as { details?: string }).details || null,
              roomName: (info as { roomName?: string }).roomName || null,
              startedAt: (info as { startedAt?: unknown }).startedAt ?? null,
              endedAt: (info as { endedAt?: unknown }).endedAt ?? null,
              file: (info as { file?: unknown }).file ?? (info as { fileResults?: unknown }).fileResults ?? null,
              request: (info as { request?: unknown }).request ?? null,
            })
          : null,
      })
    }

    const {
      data: { user },
      error: userErr,
    } = await admin.auth.getUser(jwt)
    if (userErr || !user?.id) {
      return json(401, { error: 'Invalid or expired session.' })
    }

    const { data: actorProfile } = await admin
      .from('profiles')
      .select('handle, display_name')
      .eq('user_id', user.id)
      .maybeSingle()
    if (!minProfile(actorProfile)) {
      return json(403, { error: 'Complete your profile (handle + display name) before using chat.' })
    }

    const displayName =
      String(actorProfile?.display_name || '').trim() ||
      String(actorProfile?.handle || '').trim() ||
      'Member'

    if (action === 'start_call') {
      const roomId = String(body.room_id || '').trim()
      const mediaModeRaw = String(body.media_mode || 'audio').trim()
      const mediaMode = mediaModeRaw === 'video' ? 'video' : 'audio'
      if (!roomId) return json(400, { error: 'Missing room_id.' })

      await assertMember(admin, roomId, user.id)
      await rateLimitStart(admin, user.id)
      const room = await loadRoom(admin, roomId)

      if (room.kind === 'channel' || room.kind === 'creator_fan') {
        return json(400, { error: 'Calling is not available in this room type yet.' })
      }
      if (room.kind !== 'dm' && room.kind !== 'group') {
        return json(400, { error: 'Unsupported chat room kind for calls.' })
      }
      if (room.kind === 'dm') {
        const parts = String(room.dm_key || '').split('::')
        const peerId = parts[0] === user.id ? parts[1] : parts[0]
        if (!peerId) return json(400, { error: 'Invalid DM room.' })
        await assertDmNotBlocked(admin, user.id, peerId)
      }

      const kind = room.kind === 'dm' ? 'dm_av' : 'group_audio'
      const insertCallRow = async () => {
        const newId = crypto.randomUUID()
        return await admin
          .from('chat_calls')
          .insert({
            id: newId,
            chat_room_id: roomId,
            kind,
            media_mode: mediaMode,
            status: 'ringing',
            started_by: user.id,
            livekit_room_name: `edge-call:${newId}`,
          })
          .select(
            'id, chat_room_id, kind, media_mode, status, started_by, started_at, livekit_room_name, recording_status, recording_started_by, recording_started_at, recording_egress_id, recording_r2_key',
          )
          .single()
      }

      let { data: inserted, error: insertErr } = await insertCallRow()

      if (insertErr?.code === '23505') {
        // Reclaim own stuck ringing call (failed connect / abandoned start).
        const { data: existing } = await admin
          .from('chat_calls')
          .select(
            CALL_SELECT_BASE,
          )
          .eq('chat_room_id', roomId)
          .in('status', ['ringing', 'active'])
          .maybeSingle()
        if (existing && existing.started_by === user.id && existing.status === 'ringing') {
          await stopActiveRecordingEgress(admin, lk, existing)
          await endCallRow(admin, existing, 'reclaim')
          await deleteLiveKitRoom(lk.httpUrl, lk.apiKey, lk.apiSecret, existing.livekit_room_name)
          ;({ data: inserted, error: insertErr } = await insertCallRow())
        }
      }

      if (insertErr) {
        if (insertErr.code === '23505') {
          return json(409, { error: 'A call is already in progress in this chat.' })
        }
        throw new Error(insertErr.message)
      }
      if (!inserted) throw new Error('Could not create call.')

      const started = await finalizeOutgoingCall({
        admin,
        lk,
        call: inserted,
        userId: user.id,
        displayName,
        roomId,
      })
      return json(200, started)
    }

    if (action === 'accept_call' || action === 'join_call') {
      const callId = String(body.call_id || '').trim()
      if (!callId) return json(400, { error: 'Missing call_id.' })

      const { data: call, error: callErr } = await admin
        .from('chat_calls')
        .select(
          CALL_SELECT_BASE,
        )
        .eq('id', callId)
        .maybeSingle()
      if (callErr) throw new Error(callErr.message)
      if (!call) return json(404, { error: 'Call not found.' })

      await assertMember(admin, call.chat_room_id, user.id)

      if (callTimedOut(call.started_at)) {
        const lkEnv = requireLiveKitEnv()
        await endCallRow(admin, call, 'max_duration')
        await deleteLiveKitRoom(lkEnv.url, lkEnv.apiKey, lkEnv.apiSecret, call.livekit_room_name)
        return json(410, { error: 'This call has expired.' })
      }

      if (!['ringing', 'active'].includes(call.status)) {
        return json(409, { error: 'This call is no longer available.' })
      }

      const room = await loadRoom(admin, call.chat_room_id)
      if (room.kind === 'dm') {
        const parts = String(room.dm_key || '').split('::')
        const peerId = parts[0] === user.id ? parts[1] : parts[0]
        if (peerId) await assertDmNotBlocked(admin, user.id, peerId)
      }

      const { count: liveCount } = await admin
        .from('chat_call_participants')
        .select('user_id', { count: 'exact', head: true })
        .eq('call_id', callId)
        .is('left_at', null)

      const { data: alreadyIn } = await admin
        .from('chat_call_participants')
        .select('user_id')
        .eq('call_id', callId)
        .eq('user_id', user.id)
        .is('left_at', null)
        .maybeSingle()

      if (!alreadyIn?.user_id && (liveCount ?? 0) >= MAX_GROUP_PARTICIPANTS) {
        return json(403, { error: `This call is full (max ${MAX_GROUP_PARTICIPANTS}).` })
      }

      const nowIso = new Date().toISOString()
      if (call.status === 'ringing') {
        await admin
          .from('chat_calls')
          .update({ status: 'active', answered_at: nowIso })
          .eq('id', callId)
          .eq('status', 'ringing')
      }

      const role =
        call.started_by === user.id ? 'caller' : call.kind === 'dm_av' ? 'callee' : 'member'
      await admin.from('chat_call_participants').upsert(
        {
          call_id: callId,
          user_id: user.id,
          role,
          joined_at: nowIso,
          left_at: null,
        },
        { onConflict: 'call_id,user_id' },
      )

      const sources = publishSourcesForCall(call.kind, call.media_mode)
      const token = await mintToken({
        apiKey: lk.apiKey,
        apiSecret: lk.apiSecret,
        identity: user.id,
        displayName,
        roomName: call.livekit_room_name,
        canPublish: true,
        canPublishSources: sources,
      })

      const { data: fresh } = await admin
        .from('chat_calls')
        .select(
          CALL_SELECT_BASE,
        )
        .eq('id', callId)
        .single()

      return json(200, {
        ok: true,
        call: fresh || call,
        livekit_url: lk.url,
        token,
      })
    }

    if (action === 'decline_call') {
      const callId = String(body.call_id || '').trim()
      if (!callId) return json(400, { error: 'Missing call_id.' })

      const { data: call, error: callErr } = await admin
        .from('chat_calls')
        .select(
          CALL_SELECT_BASE,
        )
        .eq('id', callId)
        .maybeSingle()
      if (callErr) throw new Error(callErr.message)
      if (!call) return json(404, { error: 'Call not found.' })
      if (call.kind !== 'dm_av') {
        return json(400, { error: 'Decline is only for DM calls. Leave the call instead.' })
      }
      await assertMember(admin, call.chat_room_id, user.id)
      if (call.started_by === user.id) {
        return json(400, { error: 'Caller cannot decline; end the call instead.' })
      }

      await stopActiveRecordingEgress(admin, lk, call)
      const result = await endCallRow(admin, call, 'declined', 'declined')
      await deleteLiveKitRoom(lk.httpUrl, lk.apiKey, lk.apiSecret, call.livekit_room_name)
      return json(200, { ok: true, ...result })
    }

    if (action === 'leave_call') {
      const callId = String(body.call_id || '').trim()
      if (!callId) return json(400, { error: 'Missing call_id.' })

      const { data: call, error: callErr } = await admin
        .from('chat_calls')
        .select(
          CALL_SELECT_BASE,
        )
        .eq('id', callId)
        .maybeSingle()
      if (callErr) throw new Error(callErr.message)
      if (!call) return json(404, { error: 'Call not found.' })
      await assertMember(admin, call.chat_room_id, user.id)

      if (['ended', 'missed', 'declined'].includes(call.status)) {
        return json(200, { ok: true, left: true, call_ended: true, status: call.status })
      }

      const leftAt = new Date().toISOString()
      await admin
        .from('chat_call_participants')
        .update({ left_at: leftAt })
        .eq('call_id', callId)
        .eq('user_id', user.id)
        .is('left_at', null)

      await removeLiveKitParticipant(
        lk.httpUrl,
        lk.apiKey,
        lk.apiSecret,
        call.livekit_room_name,
        user.id,
      )

      const { count: remaining } = await admin
        .from('chat_call_participants')
        .select('user_id', { count: 'exact', head: true })
        .eq('call_id', callId)
        .is('left_at', null)

      // DM hangup ends for both. Group: end when ≤1 would remain (no solo leftover call).
      const shouldEndCall = call.kind === 'dm_av' || (remaining ?? 0) <= 1
      if (!shouldEndCall) {
        return json(200, { ok: true, left: true, call_ended: false, status: call.status })
      }

      await stopActiveRecordingEgress(admin, lk, call)
      const result = await endCallRow(admin, call, 'hangup')
      await deleteLiveKitRoom(lk.httpUrl, lk.apiKey, lk.apiSecret, call.livekit_room_name)
      return json(200, { ok: true, left: true, call_ended: true, ...result })
    }

    if (action === 'end_call') {
      const callId = String(body.call_id || '').trim()
      if (!callId) return json(400, { error: 'Missing call_id.' })

      const { data: call, error: callErr } = await admin
        .from('chat_calls')
        .select(
          CALL_SELECT_BASE,
        )
        .eq('id', callId)
        .maybeSingle()
      if (callErr) throw new Error(callErr.message)
      if (!call) return json(404, { error: 'Call not found.' })
      await assertMember(admin, call.chat_room_id, user.id)

      // Force-end for everyone (DM hangup path; host tools). Prefer leave_call for group leave.
      await stopActiveRecordingEgress(admin, lk, call)
      const result = await endCallRow(admin, call, 'hangup')
      await deleteLiveKitRoom(lk.httpUrl, lk.apiKey, lk.apiSecret, call.livekit_room_name)
      return json(200, { ok: true, call_ended: true, ...result })
    }

    if (action === 'token') {
      const callId = String(body.call_id || '').trim()
      if (!callId) return json(400, { error: 'Missing call_id.' })

      const { data: call, error: callErr } = await admin
        .from('chat_calls')
        .select(
          CALL_SELECT_BASE,
        )
        .eq('id', callId)
        .maybeSingle()
      if (callErr) throw new Error(callErr.message)
      if (!call) return json(404, { error: 'Call not found.' })
      await assertMember(admin, call.chat_room_id, user.id)

      if (!['ringing', 'active'].includes(call.status)) {
        return json(409, { error: 'This call is no longer available.' })
      }
      if (callTimedOut(call.started_at)) {
        await endCallRow(admin, call, 'max_duration')
        await deleteLiveKitRoom(lk.httpUrl, lk.apiKey, lk.apiSecret, call.livekit_room_name)
        return json(410, { error: 'This call has expired.' })
      }

      const { data: part } = await admin
        .from('chat_call_participants')
        .select('user_id')
        .eq('call_id', callId)
        .eq('user_id', user.id)
        .is('left_at', null)
        .maybeSingle()
      if (!part?.user_id) {
        return json(403, { error: 'Join the call before refreshing the token.' })
      }

      const sources = publishSourcesForCall(call.kind, call.media_mode)
      const token = await mintToken({
        apiKey: lk.apiKey,
        apiSecret: lk.apiSecret,
        identity: user.id,
        displayName,
        roomName: call.livekit_room_name,
        canPublish: true,
        canPublishSources: sources,
      })

      return json(200, { ok: true, call, livekit_url: lk.url, token })
    }

    if (action === 'start_recording') {
      const callId = String(body.call_id || '').trim()
      if (!callId) return json(400, { error: 'Missing call_id.' })

      const r2 = readLoungeCfR2Config()
      if (!r2) {
        return json(500, { error: 'R2 is not configured for call recordings.' })
      }
      const templateBaseUrl = readEgressTemplateBaseUrl()

      const { data: call, error: callErr } = await admin
        .from('chat_calls')
        .select(CALL_SELECT_BASE)
        .eq('id', callId)
        .maybeSingle()
      if (callErr) throw new Error(callErr.message)
      if (!call) return json(404, { error: 'Call not found.' })
      await assertMember(admin, call.chat_room_id, user.id)

      if (!['ringing', 'active'].includes(call.status)) {
        return json(409, { error: 'This call is no longer available.' })
      }
      if (call.media_mode !== 'video') {
        return json(400, { error: 'Recording is only available on video calls.' })
      }
      if (call.recording_status === 'recording' || call.recording_status === 'stopping') {
        return json(409, { error: 'A recording is already in progress.', ...recordingPublicFields(call) })
      }

      const { data: liveParts, error: liveErr } = await admin
        .from('chat_call_participants')
        .select('user_id')
        .eq('call_id', callId)
        .is('left_at', null)
      if (liveErr) throw new Error(liveErr.message)
      const liveIds = new Set((liveParts || []).map((p) => String(p.user_id || '').trim()).filter(Boolean))
      if (!liveIds.has(user.id)) {
        return json(403, { error: 'Join the call before starting a recording.' })
      }

      const requestedFeatured = String(body.featured_identity || '').trim()
      const featuredIdentity = requestedFeatured || user.id
      if (!liveIds.has(featuredIdentity)) {
        return json(400, {
          error: 'Featured participant must be on the call. Pin someone in the call, then Record.',
        })
      }

      const startedAt = new Date().toISOString()
      const r2Key = `call-recordings/${callId}/${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}.mp4`
      // Custom R2 template: pin (or recorder) as main via layout=focus:<identity>.
      // Set CHAT_CALL_EGRESS_USE_CUSTOM=0 for LiveKit built-in speaker.
      const customDisabled =
        String(Deno.env.get('CHAT_CALL_EGRESS_USE_CUSTOM') || '').trim() === '0'
      const useCustomTemplate = Boolean(templateBaseUrl) && !customDisabled
      const egressLayout = useCustomTemplate ? `focus:${featuredIdentity}` : 'speaker'

      const { data: claimed, error: claimErr } = await admin
        .from('chat_calls')
        .update({
          recording_status: 'recording',
          recording_started_by: user.id,
          recording_started_at: startedAt,
          recording_r2_key: r2Key,
          recording_egress_id: null,
          recording_featured_identity: featuredIdentity,
        })
        .eq('id', callId)
        .in('recording_status', ['idle', 'ready', 'failed'])
        .in('status', ['ringing', 'active'])
        .select(CALL_SELECT_BASE)
        .maybeSingle()
      if (claimErr) throw new Error(claimErr.message)
      if (!claimed) {
        const { data: again } = await admin.from('chat_calls').select(CALL_SELECT_BASE).eq('id', callId).maybeSingle()
        return json(409, {
          error: 'A recording is already in progress.',
          ...recordingPublicFields(again || call),
        })
      }

      try {
        const fileOutput = new EncodedFileOutput({
          fileType: EncodedFileType.MP4,
          filepath: r2Key,
          disableManifest: true,
          output: {
            case: 's3',
            value: new S3Upload({
              accessKey: r2.accessKeyId,
              secret: r2.secretAccessKey,
              bucket: r2.bucket,
              region: 'auto',
              endpoint: `https://${r2.accountId}.r2.cloudflarestorage.com`,
              forcePathStyle: true,
              metadata: {
                'Cache-Control': 'public, max-age=31536000, immutable',
              },
            }),
          },
        })
        // Phone calls are portrait. Use explicit 720×1280 (not only a preset) so custom
        // templates get a real portrait Chrome viewport instead of landscape 1280×720.
        const info = await egressClientFor(lk).startRoomCompositeEgress(
          call.livekit_room_name,
          { file: fileOutput },
          {
            layout: egressLayout,
            audioOnly: false,
            encodingOptions: {
              width: 720,
              height: 1280,
              framerate: 30,
              videoBitrate: 3000,
            },
            ...(useCustomTemplate ? { customBaseUrl: templateBaseUrl } : {}),
          },
        )
        const egressId = String(info?.egressId || '').trim()
        if (!egressId) throw new Error('LiveKit did not return an egress id.')

        const { data: withEgress, error: egErr } = await admin
          .from('chat_calls')
          .update({ recording_egress_id: egressId })
          .eq('id', callId)
          .eq('recording_status', 'recording')
          .select(CALL_SELECT_BASE)
          .single()
        if (egErr) throw new Error(egErr.message)

        return json(200, {
          ok: true,
          call: withEgress,
          ...recordingPublicFields(withEgress),
          featured_identity: featuredIdentity,
          public_url_preview: loungeCfR2PublicUrl(r2, r2Key),
        })
      } catch (err) {
        await admin
          .from('chat_calls')
          .update({
            recording_status: 'failed',
            recording_egress_id: null,
            recording_r2_key: null,
            recording_featured_identity: null,
            recording_started_by: null,
            recording_started_at: null,
          })
          .eq('id', callId)
        throw err
      }
    }

    if (action === 'stop_recording') {
      const callId = String(body.call_id || '').trim()
      if (!callId) return json(400, { error: 'Missing call_id.' })

      const { data: call, error: callErr } = await admin
        .from('chat_calls')
        .select(CALL_SELECT_BASE)
        .eq('id', callId)
        .maybeSingle()
      if (callErr) throw new Error(callErr.message)
      if (!call) return json(404, { error: 'Call not found.' })
      await assertMember(admin, call.chat_room_id, user.id)

      if (call.recording_status !== 'recording' && call.recording_status !== 'stopping') {
        return json(200, { ok: true, already_stopped: true, ...recordingPublicFields(call) })
      }

      // Stop: recording starter, or call initiator (host kill switch). Cap path via get_call.
      const isRecStarter = String(call.recording_started_by || '') === user.id
      const isCallHost = String(call.started_by || '') === user.id
      let pastCap = false
      if (call.recording_started_at) {
        const elapsedSec = (Date.now() - new Date(call.recording_started_at).getTime()) / 1000
        pastCap = elapsedSec >= MAX_RECORDING_SECONDS
      }
      if (!isRecStarter && !isCallHost && !pastCap) {
        return json(403, {
          error: 'Only the person recording or the call host can stop this recording.',
          ...recordingPublicFields(call),
        })
      }

      await stopActiveRecordingEgress(admin, lk, call, { throwOnError: true })

      // Webhook may take a bit; poll LiveKit + R2 until the MP4 is public (or failed).
      let working = { ...call, recording_status: 'stopping' as string }
      for (let i = 0; i < 8; i++) {
        await new Promise((r) => setTimeout(r, i === 0 ? 1000 : 2000))
        const reconciled = await reconcileRecordingFromLiveKit(admin, lk, working)
        const { data: refreshed } = await admin
          .from('chat_calls')
          .select(CALL_SELECT_BASE)
          .eq('id', callId)
          .maybeSingle()
        if (refreshed) working = refreshed
        if (
          reconciled?.recording_status === 'ready' ||
          reconciled?.recording_status === 'failed' ||
          working.recording_status === 'ready' ||
          working.recording_status === 'failed'
        ) {
          break
        }
      }

      const { data: updated } = await admin
        .from('chat_calls')
        .select(CALL_SELECT_BASE)
        .eq('id', callId)
        .maybeSingle()
      return json(200, {
        ok: true,
        call: updated || working,
        ...recordingPublicFields(updated || working),
      })
    }

    if (action === 'get_call') {
      const callId = String(body.call_id || '').trim()
      if (!callId) return json(400, { error: 'Missing call_id.' })
      const { data: call, error: callErr } = await admin
        .from('chat_calls')
        .select(
          `${CALL_SELECT_BASE}, ended_at, ended_reason`,
        )
        .eq('id', callId)
        .maybeSingle()
      if (callErr) throw new Error(callErr.message)
      if (!call) return json(404, { error: 'Call not found.' })
      await assertMember(admin, call.chat_room_id, user.id)

      // Server-side recording cap: if still "recording" past max, stop egress (call continues).
      if (
        call.recording_status === 'recording' &&
        call.recording_started_at &&
        Date.now() - new Date(call.recording_started_at).getTime() >= MAX_RECORDING_SECONDS * 1000
      ) {
        await stopActiveRecordingEgress(admin, lk, call)
        const { data: refreshed } = await admin
          .from('chat_calls')
          .select(`${CALL_SELECT_BASE}, ended_at, ended_reason`)
          .eq('id', callId)
          .maybeSingle()
        return json(200, { ok: true, call: refreshed || call, ...recordingPublicFields(refreshed || call) })
      }

      // Webhook backup: if Stop already ran, try to finalize from LiveKit listEgress.
      if (call.recording_status === 'stopping') {
        await reconcileRecordingFromLiveKit(admin, lk, call)
        const { data: refreshed } = await admin
          .from('chat_calls')
          .select(`${CALL_SELECT_BASE}, ended_at, ended_reason`)
          .eq('id', callId)
          .maybeSingle()
        return json(200, { ok: true, call: refreshed || call, ...recordingPublicFields(refreshed || call) })
      }

      return json(200, { ok: true, call, ...recordingPublicFields(call) })
    }

    if (action === 'attach_recording_poster') {
      const messageId = String(body.message_id || '').trim()
      const posterUrl = String(body.poster_url || '').trim()
      const widthRaw = body.width
      const heightRaw = body.height
      if (!messageId) return json(400, { error: 'Missing message_id.' })
      if (!posterUrl) return json(400, { error: 'Missing poster_url.' })

      const r2 = readLoungeCfR2Config()
      if (!r2 || !loungeCfR2IsAllowedPublicUrl(r2, posterUrl)) {
        return json(400, { error: 'Poster URL must be on the Lounge R2 public host.' })
      }

      const { data: msg, error: msgErr } = await admin
        .from('chat_messages')
        .select('id, room_id, content_encoding, stream_poster_url, stream_video_width, stream_video_height')
        .eq('id', messageId)
        .maybeSingle()
      if (msgErr) throw new Error(msgErr.message)
      if (!msg) return json(404, { error: 'Message not found.' })
      if (String(msg.content_encoding || '') !== 'call_recording') {
        return json(400, { error: 'Not a call recording message.' })
      }
      await assertMember(admin, msg.room_id, user.id)

      const existingPoster = String(msg.stream_poster_url || '').trim()
      if (existingPoster) {
        return json(200, {
          ok: true,
          stream_poster_url: existingPoster,
          stream_video_width: msg.stream_video_width ?? null,
          stream_video_height: msg.stream_video_height ?? null,
          already: true,
        })
      }

      const width =
        typeof widthRaw === 'number' && Number.isFinite(widthRaw) && widthRaw > 0
          ? Math.round(widthRaw)
          : null
      const height =
        typeof heightRaw === 'number' && Number.isFinite(heightRaw) && heightRaw > 0
          ? Math.round(heightRaw)
          : null

      const patch: Record<string, unknown> = { stream_poster_url: posterUrl }
      if (width && height) {
        patch.stream_video_width = width
        patch.stream_video_height = height
      }

      const { data: updated, error: upErr } = await admin
        .from('chat_messages')
        .update(patch)
        .eq('id', messageId)
        .eq('content_encoding', 'call_recording')
        .or('stream_poster_url.is.null,stream_poster_url.eq.')
        .select('id, stream_poster_url, stream_video_width, stream_video_height')
        .maybeSingle()
      if (upErr) throw new Error(upErr.message)

      // Race: another client won — re-read.
      if (!updated) {
        const { data: again } = await admin
          .from('chat_messages')
          .select('id, stream_poster_url, stream_video_width, stream_video_height')
          .eq('id', messageId)
          .maybeSingle()
        return json(200, {
          ok: true,
          stream_poster_url: String(again?.stream_poster_url || posterUrl),
          stream_video_width: again?.stream_video_width ?? width,
          stream_video_height: again?.stream_video_height ?? height,
          already: true,
        })
      }

      return json(200, {
        ok: true,
        stream_poster_url: updated.stream_poster_url,
        stream_video_width: updated.stream_video_width ?? null,
        stream_video_height: updated.stream_video_height ?? null,
      })
    }

    return json(400, { error: `Unknown action: ${action}` })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const status = (err as Error & { status?: number })?.status
    console.error('chat-calls error', msg)
    return json(typeof status === 'number' ? status : 400, { error: msg || 'Call error' })
  }
})
