/**
 * LiveKit chat calling: start / accept / join / decline / end / token refresh.
 * Membership source of truth: chat_rooms + chat_room_members.
 */
import { createClient } from 'npm:@supabase/supabase-js@2'
import { AccessToken, RoomServiceClient } from 'npm:livekit-server-sdk@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MAX_CALL_DURATION_MS = 60 * 60 * 1000
const MAX_GROUP_PARTICIPANTS = 12
const START_CALL_RATE_WINDOW_MS = 60_000
const START_CALL_RATE_MAX = 8

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function minProfile(p: { handle?: string | null; display_name?: string | null } | null) {
  return String(p?.handle || '').trim().length >= 2 && String(p?.display_name || '').trim().length >= 1
}

function requireLiveKitEnv() {
  const url = Deno.env.get('LIVEKIT_URL')?.trim() || ''
  const apiKey = Deno.env.get('LIVEKIT_API_KEY')?.trim() || ''
  const apiSecret = Deno.env.get('LIVEKIT_API_SECRET')?.trim() || ''
  if (!url || !apiKey || !apiSecret) {
    throw new Error('Missing LIVEKIT_URL, LIVEKIT_API_KEY, or LIVEKIT_API_SECRET Edge secrets.')
  }
  return { url, apiKey, apiSecret }
}

type Admin = ReturnType<typeof createClient>

async function mintToken(args: {
  apiKey: string
  apiSecret: string
  identity: string
  displayName: string
  roomName: string
  canPublish: boolean
  canPublishSources?: Array<'camera' | 'microphone' | 'screen_share' | 'screen_share_audio'>
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
    ...(args.canPublishSources ? { canPublishSources: args.canPublishSources } : {}),
  })
  return await at.toJwt()
}

async function deleteLiveKitRoom(url: string, apiKey: string, apiSecret: string, roomName: string) {
  try {
    const svc = new RoomServiceClient(url, apiKey, apiSecret)
    await svc.deleteRoom(roomName)
  } catch (err) {
    console.warn('chat-calls: deleteRoom failed', roomName, err)
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

async function enqueueCallInvitePush(
  admin: Admin,
  roomId: string,
  callId: string,
  actorId: string,
  recipientIds: string[],
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
    event_type: 'chat_call_invite',
    chat_room_id: roomId,
    chat_call_id: callId,
  }))
  const { error } = await admin.from('activity_events').insert(rows)
  if (error) console.warn('chat-calls: invite push insert failed', error.message)
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

  const durationMs = call.answered_at
    ? Math.max(0, new Date(endedAt).getTime() - new Date(call.answered_at).getTime())
    : 0
  const mins = Math.floor(durationMs / 60000)
  const secs = Math.floor((durationMs % 60000) / 1000)
  const durationLabel = call.answered_at
    ? mins > 0
      ? `${mins}:${String(secs).padStart(2, '0')}`
      : `0:${String(secs).padStart(2, '0')}`
    : null

  let body = 'Call ended'
  if (status === 'missed') body = 'Missed call'
  else if (status === 'declined') body = 'Call declined'
  else if (durationLabel) body = `Call · ${durationLabel}`

  await admin.from('chat_messages').insert({
    room_id: call.chat_room_id,
    sender_id: call.started_by,
    body,
    content_encoding: 'call_summary',
  })

  return { status, ended_reason: endedReason, body }
}

function publishSourcesForCall(kind: string, mediaMode: string) {
  if (kind === 'group_audio' || mediaMode === 'audio') {
    return ['microphone'] as Array<'microphone'>
  }
  return ['microphone', 'camera'] as Array<'microphone' | 'camera'>
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

    let body: Record<string, unknown> = {}
    try {
      body = (await req.json()) as Record<string, unknown>
    } catch {
      return json(400, { error: 'Invalid JSON body.' })
    }

    const action = String(body.action || '').trim()
    if (!action) return json(400, { error: 'Missing action.' })

    const lk = requireLiveKitEnv()

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
      if (room.kind === 'group' && mediaMode === 'video') {
        return json(400, { error: 'Group calls are audio-only in v1.' })
      }

      if (room.kind === 'dm') {
        const parts = String(room.dm_key || '').split('::')
        const peerId = parts[0] === user.id ? parts[1] : parts[0]
        if (!peerId) return json(400, { error: 'Invalid DM room.' })
        await assertDmNotBlocked(admin, user.id, peerId)
      }

      const kind = room.kind === 'dm' ? 'dm_av' : 'group_audio'
      const callId = crypto.randomUUID()
      const livekitRoomName = `edge-call:${callId}`

      const { data: inserted, error: insertErr } = await admin
        .from('chat_calls')
        .insert({
          id: callId,
          chat_room_id: roomId,
          kind,
          media_mode: kind === 'group_audio' ? 'audio' : mediaMode,
          status: 'ringing',
          started_by: user.id,
          livekit_room_name: livekitRoomName,
        })
        .select(
          'id, chat_room_id, kind, media_mode, status, started_by, started_at, livekit_room_name',
        )
        .single()

      if (insertErr) {
        if (insertErr.code === '23505') {
          return json(409, { error: 'A call is already in progress in this chat.' })
        }
        throw new Error(insertErr.message)
      }

      await admin.from('chat_call_participants').upsert(
        {
          call_id: callId,
          user_id: user.id,
          role: 'caller',
          joined_at: new Date().toISOString(),
          left_at: null,
        },
        { onConflict: 'call_id,user_id' },
      )

      const recipients = await listMemberIds(admin, roomId, user.id)
      await enqueueCallInvitePush(admin, roomId, callId, user.id, recipients)

      const sources = publishSourcesForCall(kind, inserted.media_mode)
      const token = await mintToken({
        apiKey: lk.apiKey,
        apiSecret: lk.apiSecret,
        identity: user.id,
        displayName,
        roomName: livekitRoomName,
        canPublish: true,
        canPublishSources: sources,
      })

      return json(200, {
        ok: true,
        call: inserted,
        livekit_url: lk.url,
        token,
      })
    }

    if (action === 'accept_call' || action === 'join_call') {
      const callId = String(body.call_id || '').trim()
      if (!callId) return json(400, { error: 'Missing call_id.' })

      const { data: call, error: callErr } = await admin
        .from('chat_calls')
        .select(
          'id, chat_room_id, kind, media_mode, status, started_by, started_at, answered_at, livekit_room_name',
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
          'id, chat_room_id, kind, media_mode, status, started_by, started_at, answered_at, livekit_room_name',
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
          'id, chat_room_id, kind, media_mode, status, started_by, started_at, answered_at, livekit_room_name',
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

      const result = await endCallRow(admin, call, 'declined', 'declined')
      await deleteLiveKitRoom(lk.url, lk.apiKey, lk.apiSecret, call.livekit_room_name)
      return json(200, { ok: true, ...result })
    }

    if (action === 'end_call') {
      const callId = String(body.call_id || '').trim()
      if (!callId) return json(400, { error: 'Missing call_id.' })

      const { data: call, error: callErr } = await admin
        .from('chat_calls')
        .select(
          'id, chat_room_id, kind, media_mode, status, started_by, started_at, answered_at, livekit_room_name',
        )
        .eq('id', callId)
        .maybeSingle()
      if (callErr) throw new Error(callErr.message)
      if (!call) return json(404, { error: 'Call not found.' })
      await assertMember(admin, call.chat_room_id, user.id)

      const result = await endCallRow(admin, call, 'hangup')
      await deleteLiveKitRoom(lk.url, lk.apiKey, lk.apiSecret, call.livekit_room_name)
      return json(200, { ok: true, ...result })
    }

    if (action === 'token') {
      const callId = String(body.call_id || '').trim()
      if (!callId) return json(400, { error: 'Missing call_id.' })

      const { data: call, error: callErr } = await admin
        .from('chat_calls')
        .select(
          'id, chat_room_id, kind, media_mode, status, started_by, started_at, answered_at, livekit_room_name',
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
        await deleteLiveKitRoom(lk.url, lk.apiKey, lk.apiSecret, call.livekit_room_name)
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

    if (action === 'get_call') {
      const callId = String(body.call_id || '').trim()
      if (!callId) return json(400, { error: 'Missing call_id.' })
      const { data: call, error: callErr } = await admin
        .from('chat_calls')
        .select(
          'id, chat_room_id, kind, media_mode, status, started_by, started_at, answered_at, ended_at, ended_reason, livekit_room_name',
        )
        .eq('id', callId)
        .maybeSingle()
      if (callErr) throw new Error(callErr.message)
      if (!call) return json(404, { error: 'Call not found.' })
      await assertMember(admin, call.chat_room_id, user.id)
      return json(200, { ok: true, call })
    }

    return json(400, { error: `Unknown action: ${action}` })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const status = (err as Error & { status?: number })?.status
    console.error('chat-calls error', msg)
    return json(typeof status === 'number' ? status : 400, { error: msg || 'Call error' })
  }
})
