import { createClient } from 'npm:@supabase/supabase-js@2'
import { attachLinkPreviewToEntity } from '../_shared/linkUnfurl.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

function subscriberOrStaff(p: { has_active_subscription?: boolean | null; role?: string | null } | null) {
  if (!p) return false
  if (p.has_active_subscription === true) return true
  const r = String(p.role || '').toLowerCase()
  return r === 'moderator' || r === 'admin'
}

function dmKey(a: string, b: string) {
  return a < b ? `${a}::${b}` : `${b}::${a}`
}

type ChatPushAdmin = ReturnType<typeof createClient>

/** Must complete before send_message returns — fire-and-forget is dropped when the isolate exits. */
async function enqueueChatDmPush(
  admin: ChatPushAdmin,
  roomId: string,
  dmKeyValue: string,
  senderId: string,
) {
  const parts = String(dmKeyValue).split('::')
  const peerId = parts[0] === senderId ? parts[1] : parts[0]
  if (!peerId) return

  const { data: blockRow } = await admin
    .from('blocks')
    .select('id')
    .eq('blocker_id', peerId)
    .eq('blocked_id', senderId)
    .maybeSingle()
  if (blockRow?.id) return

  const { data: peerMem } = await admin
    .from('chat_room_members')
    .select('muted_until, last_read_at')
    .eq('room_id', roomId)
    .eq('user_id', peerId)
    .maybeSingle()
  const muteUntil = peerMem?.muted_until ? new Date(peerMem.muted_until) : null
  if (muteUntil && muteUntil > new Date()) return

  const lastReadAt = peerMem?.last_read_at ? new Date(peerMem.last_read_at) : null
  if (lastReadAt && Date.now() - lastReadAt.getTime() < 30_000) return

  await admin.from('activity_events').insert({
    recipient_user_id: peerId,
    actor_user_id: senderId,
    event_type: 'chat_dm',
    chat_room_id: roomId,
  })
}

async function enqueueChatGroupInvitePush(
  admin: ChatPushAdmin,
  roomId: string,
  actorId: string,
  recipientIds: string[],
) {
  if (recipientIds.length === 0) return
  const eventRows = recipientIds.map((uid) => ({
    recipient_user_id: uid,
    actor_user_id: actorId,
    event_type: 'chat_group_invite',
    chat_room_id: roomId,
  }))
  await admin.from('activity_events').insert(eventRows)
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
  const {
    data: { user },
    error: userErr,
  } = await admin.auth.getUser(jwt)
  if (userErr || !user?.id) {
    return json(401, { error: 'Invalid or expired session.' })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json(400, { error: 'Invalid JSON body.' })
  }

  const action = String(body?.action || '').trim()
  const { data: actorProfile, error: actorErr } = await admin
    .from('profiles')
    .select('user_id, handle, display_name, has_active_subscription, role')
    .eq('user_id', user.id)
    .maybeSingle()
  if (actorErr) {
    return json(500, { error: actorErr.message })
  }
  if (!minProfile(actorProfile)) {
    return json(403, { error: 'Complete your profile (handle + display name) before using chat.' })
  }

  if (action === 'open_dm') {
    const peerId = String(body?.peer_user_id || '').trim()
    if (!peerId || peerId === user.id) {
      return json(400, { error: 'Invalid peer user.' })
    }
    const { data: peerProfile, error: peerErr } = await admin
      .from('profiles')
      .select('user_id, handle, display_name')
      .eq('user_id', peerId)
      .maybeSingle()
    if (peerErr || !peerProfile) {
      return json(404, { error: 'That member was not found.' })
    }
    if (!minProfile(peerProfile)) {
      return json(403, { error: 'That member has not completed their profile yet.' })
    }

    // Check blocks in both directions before opening / returning a DM.
    const { data: blockRows } = await admin
      .from('blocks')
      .select('blocker_id')
      .or(`and(blocker_id.eq.${user.id},blocked_id.eq.${peerId}),and(blocker_id.eq.${peerId},blocked_id.eq.${user.id})`)
    if (blockRows && blockRows.length > 0) {
      const iBlockThem = blockRows.some((r: { blocker_id: string }) => r.blocker_id === user.id)
      return json(403, { error: iBlockThem ? 'You have blocked this member.' : 'This member is unavailable.' })
    }

    const key = dmKey(user.id, peerId)
    const { data: existing, error: findErr } = await admin
      .from('chat_rooms')
      .select('id')
      .eq('kind', 'dm')
      .eq('dm_key', key)
      .maybeSingle()
    if (findErr) {
      return json(500, { error: findErr.message })
    }
    if (existing?.id) {
      return json(200, { ok: true, room_id: existing.id })
    }

    const { data: created, error: insErr } = await admin
      .from('chat_rooms')
      .insert({
        kind: 'dm',
        dm_key: key,
        max_members: 2,
        subscriber_only: false,
        created_by: user.id,
      })
      .select('id')
      .maybeSingle()

    if (insErr || !created?.id) {
      const { data: raced } = await admin.from('chat_rooms').select('id').eq('kind', 'dm').eq('dm_key', key).maybeSingle()
      if (raced?.id) {
        return json(200, { ok: true, room_id: raced.id })
      }
      return json(400, { error: insErr?.message || 'Could not create DM.' })
    }

    const { error: memErr } = await admin.from('chat_room_members').insert([
      { room_id: created.id, user_id: user.id },
      { room_id: created.id, user_id: peerId },
    ])
    if (memErr) {
      return json(400, { error: memErr.message })
    }
    return json(200, { ok: true, room_id: created.id })
  }

  if (action === 'join_channel') {
    if (!subscriberOrStaff(actorProfile)) {
      return json(403, { error: 'Subscribe to join topic rooms.' })
    }
    const slug = String(body?.slug || '').trim().toLowerCase()
    if (!slug) {
      return json(400, { error: 'slug is required.' })
    }
    const { data: room, error: roomErr } = await admin
      .from('chat_rooms')
      .select('id, max_members, subscriber_only, kind')
      .eq('slug', slug)
      .eq('kind', 'channel')
      .maybeSingle()
    if (roomErr || !room?.id) {
      return json(404, { error: 'Channel not found.' })
    }
    const { count, error: cErr } = await admin
      .from('chat_room_members')
      .select('*', { count: 'exact', head: true })
      .eq('room_id', room.id)
    if (cErr) {
      return json(500, { error: cErr.message })
    }
    if ((count ?? 0) >= room.max_members) {
      return json(403, { error: 'This channel is full.' })
    }
    const { error: jErr } = await admin.from('chat_room_members').insert({ room_id: room.id, user_id: user.id })
    if (jErr) {
      if (/duplicate|unique/i.test(jErr.message)) {
        return json(200, { ok: true, room_id: room.id })
      }
      return json(400, { error: jErr.message })
    }
    return json(200, { ok: true, room_id: room.id })
  }

  if (action === 'create_group') {
    const title = String(body?.title || '').trim().slice(0, 80)
    if (!title) {
      return json(400, { error: 'title is required for a group.' })
    }
    const rawIds = Array.isArray(body?.member_user_ids) ? body.member_user_ids.map((x) => String(x).trim()).filter(Boolean) : []
    const others = rawIds.filter((id) => id !== user.id)
    const unique = [...new Set([user.id, ...others])]
    if (unique.length < 2 || unique.length > 10) {
      return json(400, { error: 'Groups must have between 2 and 10 members including you.' })
    }
    for (const uid of unique) {
      const { data: pr } = await admin.from('profiles').select('handle, display_name').eq('user_id', uid).maybeSingle()
      if (!minProfile(pr)) {
        return json(403, { error: `Member ${uid} does not have a completed profile.` })
      }
    }

    const { data: room, error: gErr } = await admin
      .from('chat_rooms')
      .insert({
        kind: 'group',
        title,
        max_members: 10,
        subscriber_only: false,
        created_by: user.id,
      })
      .select('id')
      .maybeSingle()
    if (gErr || !room?.id) {
      return json(400, { error: gErr?.message || 'Could not create group.' })
    }
    const rows = unique.map((uid) => ({
      room_id: room.id,
      user_id: uid,
      role: uid === user.id ? 'admin' : 'member',
    }))
    const { error: mErr } = await admin.from('chat_room_members').insert(rows)
    if (mErr) {
      await admin.from('chat_rooms').delete().eq('id', room.id)
      return json(400, { error: mErr.message })
    }

    // Notify each member except the creator that they were added.
    const invitedIds = unique.filter((uid) => uid !== user.id)
    if (invitedIds.length > 0) {
      try {
        await enqueueChatGroupInvitePush(admin, room.id, user.id, invitedIds)
      } catch {
        /* push errors must not surface to the creator */
      }
    }

    return json(200, { ok: true, room_id: room.id })
  }

  if (action === 'send_message') {
    const roomId = String(body?.room_id || '').trim()
    const text = String(body?.body ?? '').trim().slice(0, 8000)
    const imageUrls = Array.isArray(body?.image_urls)
      ? body.image_urls
          .map((u) => String(u).trim())
          .filter(Boolean)
          .slice(0, 12)
      : []
    const streamVideoUid   = body?.stream_video_uid   ? String(body.stream_video_uid).trim()   : null
    const streamPosterUrl  = body?.stream_poster_url  ? String(body.stream_poster_url).trim()  : null
    const streamVideoWidth  = Number.isFinite(Number(body?.stream_video_width))  ? Math.round(Number(body.stream_video_width))  : null
    const streamVideoHeight = Number.isFinite(Number(body?.stream_video_height)) ? Math.round(Number(body.stream_video_height)) : null
    const replyToId = body?.reply_to_message_id ? String(body.reply_to_message_id).trim() : null
    const hasPendingImages = Boolean(body?.has_pending_images)
    const idempotencyKey = typeof body?.idempotency_key === 'string'
      ? body.idempotency_key.trim().slice(0, 64) || null
      : null
    if (!roomId) {
      return json(400, { error: 'room_id is required.' })
    }
    if (!text && imageUrls.length === 0 && !streamVideoUid && !hasPendingImages) {
      return json(400, { error: 'Message cannot be empty.' })
    }

    // Idempotency: if this key was already committed, return the existing message.
    if (idempotencyKey) {
      const { data: existingMsg } = await admin
        .from('chat_messages')
        .select('id')
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle()
      if (existingMsg?.id) {
        return json(200, { ok: true, message_id: existingMsg.id })
      }
    }

    const { data: mem, error: memErr } = await admin
      .from('chat_room_members')
      .select('room_id, moderation_muted_until')
      .eq('room_id', roomId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (memErr || !mem) {
      return json(403, { error: 'You are not a member of this room.' })
    }
    if (mem.moderation_muted_until && new Date(mem.moderation_muted_until) > new Date()) {
      return json(403, { error: 'You are temporarily muted in this group.' })
    }

    // Rate limit: max 5 messages per 5 seconds per user, across all rooms.
    // Uses the existing chat_messages index on (room_id, created_at desc).
    // Simple and DB-native — no Redis required.
    const rateWindow = new Date(Date.now() - 5000).toISOString()
    const { count: recentCount } = await admin
      .from('chat_messages')
      .select('id', { count: 'exact', head: true })
      .eq('sender_id', user.id)
      .gte('created_at', rateWindow)
    if ((recentCount ?? 0) >= 5) {
      return json(429, { error: 'Slow down — max 5 messages per 5 seconds.' })
    }

    const { data: room, error: rErr } = await admin
      .from('chat_rooms')
      .select('subscriber_only, kind, dm_key')
      .eq('id', roomId)
      .maybeSingle()
    if (rErr || !room) {
      return json(404, { error: 'Room not found.' })
    }
    if (room.subscriber_only && !subscriberOrStaff(actorProfile)) {
      return json(403, { error: 'Subscriber required to post in this room.' })
    }

    // Resolve reply preview + sender if replying to a message in the same room.
    let replyToPreview: string | null = null
    let replyToSenderId: string | null = null
    if (replyToId) {
      const { data: orig } = await admin
        .from('chat_messages')
        .select('room_id, body, image_urls, stream_video_uid, deleted_at, sender_id')
        .eq('id', replyToId)
        .maybeSingle()
      if (orig && orig.room_id === roomId && !orig.deleted_at) {
        replyToSenderId = orig.sender_id || null
        const origBody = String(orig.body || '').trim()
        if (origBody.length > 0) {
          replyToPreview = origBody.slice(0, 80) + (origBody.length > 80 ? '…' : '')
        } else if (Array.isArray(orig.image_urls) && orig.image_urls.length > 0) {
          replyToPreview = '[image]'
        } else if (orig.stream_video_uid) {
          replyToPreview = '[video]'
        }
      }
    }

    const { data: inserted, error: sErr } = await admin.from('chat_messages').insert({
      room_id: roomId,
      sender_id: user.id,
      body: text,
      image_urls: imageUrls,
      stream_video_uid:    streamVideoUid    || null,
      stream_poster_url:   streamPosterUrl   || null,
      stream_video_width:  streamVideoWidth  ?? null,
      stream_video_height: streamVideoHeight ?? null,
      reply_to_message_id: replyToId || null,
      reply_to_preview: replyToPreview,
      reply_to_sender_id: replyToSenderId,
      idempotency_key: idempotencyKey,
    }).select('id').maybeSingle()
    if (sErr) {
      return json(400, { error: sErr.message })
    }

    let linkPreview: Record<string, unknown> | null = null
    if (inserted?.id && text) {
      try {
        linkPreview = (await attachLinkPreviewToEntity(
          admin,
          'chat_message',
          inserted.id,
          text,
          user.id,
        )) as Record<string, unknown> | null
      } catch {
        linkPreview = null
      }
    }

    // Stamp sender's last_read_at so their own send never shows as unread
    // and future incoming messages correctly flip has_unread back to true.
    if (inserted?.id) {
      void admin
        .from('chat_room_members')
        .update({ last_read_at: new Date().toISOString(), last_read_message_id: inserted.id })
        .eq('room_id', roomId)
        .eq('user_id', user.id)
    }

    // DM push: insert activity_events — trg_activity_events_enqueue_push → lounge-send-activity-push.
    if (room.kind === 'dm' && room.dm_key && inserted?.id) {
      try {
        await enqueueChatDmPush(admin, roomId, room.dm_key, user.id)
      } catch {
        // Push errors must never surface to the sender.
      }
    }

    return json(200, {
      ok: true,
      message_id: inserted?.id,
      link_preview: linkPreview,
    })
  }

  // ── delete_message ────────────────────────────────────────────────────────
  if (action === 'delete_message') {
    const messageId = String(body?.message_id || '').trim()
    if (!messageId) return json(400, { error: 'message_id is required.' })

    const { data: msg, error: mErr } = await admin
      .from('chat_messages')
      .select('id, room_id, sender_id, deleted_at')
      .eq('id', messageId)
      .maybeSingle()
    if (mErr || !msg) return json(404, { error: 'Message not found.' })
    if (msg.deleted_at) return json(200, { ok: true }) // already deleted

    const canDelete = msg.sender_id === user.id || subscriberOrStaff(actorProfile)
    if (!canDelete) return json(403, { error: 'Cannot delete this message.' })

    const { error: dErr } = await admin
      .from('chat_messages')
      .update({ deleted_at: new Date().toISOString(), body: '' })
      .eq('id', messageId)
    if (dErr) return json(400, { error: dErr.message })
    return json(200, { ok: true })
  }

  // ── add_reaction ──────────────────────────────────────────────────────────
  if (action === 'add_reaction') {
    const messageId = String(body?.message_id || '').trim()
    const emoji     = String(body?.emoji || '').trim().slice(0, 8)
    if (!messageId || !emoji) return json(400, { error: 'message_id and emoji are required.' })

    const { data: msg } = await admin
      .from('chat_messages')
      .select('room_id, deleted_at')
      .eq('id', messageId)
      .maybeSingle()
    if (!msg || msg.deleted_at) return json(404, { error: 'Message not found or deleted.' })

    // Confirm membership
    const { data: mem } = await admin
      .from('chat_room_members')
      .select('room_id')
      .eq('room_id', msg.room_id)
      .eq('user_id', user.id)
      .maybeSingle()
    if (!mem) return json(403, { error: 'Not a member of this room.' })

    // Pre-flight: enforce 3-reaction limit (trigger is the authoritative guard)
    const { count: existingCount } = await admin
      .from('chat_message_reactions')
      .select('*', { count: 'exact', head: true })
      .eq('message_id', messageId)
      .eq('user_id', user.id)
    if ((existingCount ?? 0) >= 3) {
      return json(400, { error: 'reaction_limit_exceeded' })
    }

    const { error: rErr } = await admin
      .from('chat_message_reactions')
      .upsert({ message_id: messageId, user_id: user.id, emoji }, { onConflict: 'message_id,user_id,emoji', ignoreDuplicates: true })
    if (rErr) {
      if (rErr.message?.includes('reaction_limit_exceeded')) return json(400, { error: 'reaction_limit_exceeded' })
      return json(400, { error: rErr.message })
    }
    return json(200, { ok: true })
  }

  // ── remove_reaction ───────────────────────────────────────────────────────
  if (action === 'remove_reaction') {
    const messageId = String(body?.message_id || '').trim()
    const emoji     = String(body?.emoji || '').trim().slice(0, 8)
    if (!messageId || !emoji) return json(400, { error: 'message_id and emoji are required.' })

    const { error: rErr } = await admin
      .from('chat_message_reactions')
      .delete()
      .eq('message_id', messageId)
      .eq('user_id', user.id)
      .eq('emoji', emoji)
    if (rErr) return json(400, { error: rErr.message })
    return json(200, { ok: true })
  }

  // ── update_last_read ──────────────────────────────────────────────────────
  if (action === 'update_last_read') {
    const roomId    = String(body?.room_id || '').trim()
    const messageId = String(body?.message_id || '').trim()
    if (!roomId || !messageId) return json(400, { error: 'room_id and message_id are required.' })

    const { error: uErr } = await admin
      .from('chat_room_members')
      .update({ last_read_message_id: messageId, last_read_at: new Date().toISOString() })
      .eq('room_id', roomId)
      .eq('user_id', user.id)
    if (uErr) return json(400, { error: uErr.message })
    return json(200, { ok: true })
  }

  // ── mute_room ─────────────────────────────────────────────────────────────
  if (action === 'mute_room') {
    const roomId = String(body?.room_id || '').trim()
    // mute_hours: default 8 hours; 0 = indefinite (null expiry is not stored, use far future)
    const hours = Number(body?.mute_hours ?? 8)
    if (!roomId) return json(400, { error: 'room_id is required.' })

    const until = hours > 0
      ? new Date(Date.now() + hours * 60 * 60 * 1000).toISOString()
      : new Date('2099-01-01T00:00:00Z').toISOString()

    const { error: uErr } = await admin
      .from('chat_room_members')
      .update({ muted_until: until })
      .eq('room_id', roomId)
      .eq('user_id', user.id)
    if (uErr) return json(400, { error: uErr.message })
    return json(200, { ok: true, muted_until: until })
  }

  // ── unmute_room ───────────────────────────────────────────────────────────
  if (action === 'unmute_room') {
    const roomId = String(body?.room_id || '').trim()
    if (!roomId) return json(400, { error: 'room_id is required.' })

    const { error: uErr } = await admin
      .from('chat_room_members')
      .update({ muted_until: null })
      .eq('room_id', roomId)
      .eq('user_id', user.id)
    if (uErr) return json(400, { error: uErr.message })
    return json(200, { ok: true })
  }

  // ── block_user ────────────────────────────────────────────────────────────
  if (action === 'block_user') {
    const targetId = String(body?.target_user_id || '').trim()
    if (!targetId || targetId === user.id) return json(400, { error: 'Invalid target_user_id.' })
    const { error: bErr } = await admin
      .from('blocks')
      .upsert({ blocker_id: user.id, blocked_id: targetId }, { onConflict: 'blocker_id,blocked_id', ignoreDuplicates: true })
    if (bErr) return json(400, { error: bErr.message })
    return json(200, { ok: true })
  }

  // ── unblock_user ──────────────────────────────────────────────────────────
  if (action === 'unblock_user') {
    const targetId = String(body?.target_user_id || '').trim()
    if (!targetId) return json(400, { error: 'Invalid target_user_id.' })
    const { error: bErr } = await admin
      .from('blocks')
      .delete()
      .eq('blocker_id', user.id)
      .eq('blocked_id', targetId)
    if (bErr) return json(400, { error: bErr.message })
    return json(200, { ok: true })
  }

  // ── mark_unread ───────────────────────────────────────────────────────────
  if (action === 'mark_unread') {
    const roomId = String(body?.room_id || '').trim()
    if (!roomId) return json(400, { error: 'room_id is required.' })
    const { error: uErr } = await admin
      .from('chat_room_members')
      .update({ last_read_at: null, last_read_message_id: null })
      .eq('room_id', roomId)
      .eq('user_id', user.id)
    if (uErr) return json(400, { error: uErr.message })
    return json(200, { ok: true })
  }

  // ── pin_room / unpin_room ─────────────────────────────────────────────────
  if (action === 'pin_room' || action === 'unpin_room') {
    const roomId = String(body?.room_id || '').trim()
    if (!roomId) return json(400, { error: 'room_id is required.' })
    const { error: uErr } = await admin
      .from('chat_room_members')
      .update({ pinned: action === 'pin_room' })
      .eq('room_id', roomId)
      .eq('user_id', user.id)
    if (uErr) return json(400, { error: uErr.message })
    return json(200, { ok: true })
  }

  // ── leave_room / delete_conversation (alias) ─────────────────────────────
  if (action === 'leave_room' || action === 'delete_conversation') {
    const roomId = String(body?.room_id || '').trim()
    if (!roomId) return json(400, { error: 'room_id is required.' })
    const { error: dErr } = await admin
      .from('chat_room_members')
      .delete()
      .eq('room_id', roomId)
      .eq('user_id', user.id)
    if (dErr) return json(400, { error: dErr.message })
    return json(200, { ok: true })
  }

  async function isGroupAdmin(roomId: string, uid: string) {
    const { data: room } = await admin
      .from('chat_rooms')
      .select('id, kind, created_by')
      .eq('id', roomId)
      .maybeSingle()
    if (!room || room.kind !== 'group') return false
    if (room.created_by === uid) return true
    const { data: mem } = await admin
      .from('chat_room_members')
      .select('role')
      .eq('room_id', roomId)
      .eq('user_id', uid)
      .maybeSingle()
    return mem?.role === 'admin'
  }

  async function requireGroupMember(roomId: string) {
    const { data: mem } = await admin
      .from('chat_room_members')
      .select('room_id')
      .eq('room_id', roomId)
      .eq('user_id', user.id)
      .maybeSingle()
    return Boolean(mem?.room_id)
  }

  if (action === 'update_group') {
    const roomId = String(body?.room_id || '').trim()
    if (!roomId) return json(400, { error: 'room_id is required.' })
    if (!(await isGroupAdmin(roomId, user.id))) {
      return json(403, { error: 'Only the group owner can change group settings.' })
    }
    const patch: Record<string, unknown> = {}
    if (body?.title != null) patch.title = String(body.title).trim().slice(0, 80)
    if (body?.description != null) patch.description = String(body.description).trim().slice(0, 500)
    if (body?.avatar_url != null) {
      const url = String(body.avatar_url).trim()
      patch.avatar_url = url.length > 0 ? url.slice(0, 2048) : null
    }
    if (Object.keys(patch).length === 0) return json(400, { error: 'Nothing to update.' })
    const { error: uErr } = await admin.from('chat_rooms').update(patch).eq('id', roomId)
    if (uErr) return json(400, { error: uErr.message })
    return json(200, { ok: true })
  }

  if (action === 'add_group_members') {
    const roomId = String(body?.room_id || '').trim()
    const rawIds = Array.isArray(body?.member_user_ids)
      ? body.member_user_ids.map((x) => String(x).trim()).filter(Boolean)
      : []
    if (!roomId) return json(400, { error: 'room_id is required.' })
    if (!(await requireGroupMember(roomId))) {
      return json(403, { error: 'Not a member of this group.' })
    }
    const { count } = await admin
      .from('chat_room_members')
      .select('*', { count: 'exact', head: true })
      .eq('room_id', roomId)
    const roomCap = 10
    const slots = roomCap - (count ?? 0)
    if (slots <= 0) return json(403, { error: 'Group is full (10 members max).' })
    const toAdd = [...new Set(rawIds.filter((id) => id !== user.id))].slice(0, slots)
    if (toAdd.length === 0) return json(400, { error: 'No new members to add.' })
    for (const uid of toAdd) {
      const { data: pr } = await admin.from('profiles').select('handle, display_name').eq('user_id', uid).maybeSingle()
      if (!minProfile(pr)) return json(403, { error: `Member ${uid} does not have a completed profile.` })
    }
    const rows = toAdd.map((uid) => ({ room_id: roomId, user_id: uid, role: 'member' }))
    const { error: insErr } = await admin.from('chat_room_members').insert(rows)
    if (insErr) return json(400, { error: insErr.message })

    try {
      await enqueueChatGroupInvitePush(admin, roomId, user.id, toAdd)
    } catch {
      /* push errors must not surface */
    }

    return json(200, { ok: true, added: toAdd.length })
  }

  if (action === 'remove_group_member') {
    const roomId = String(body?.room_id || '').trim()
    const targetId = String(body?.target_user_id || '').trim()
    if (!roomId || !targetId) return json(400, { error: 'room_id and target_user_id are required.' })
    if (!(await isGroupAdmin(roomId, user.id))) {
      return json(403, { error: 'Only the group owner can remove members.' })
    }
    if (targetId === user.id) return json(400, { error: 'Use leave_room to leave the group.' })
    const { error: dErr } = await admin
      .from('chat_room_members')
      .delete()
      .eq('room_id', roomId)
      .eq('user_id', targetId)
    if (dErr) return json(400, { error: dErr.message })
    return json(200, { ok: true })
  }

  if (action === 'mute_group_member') {
    const roomId = String(body?.room_id || '').trim()
    const targetId = String(body?.target_user_id || '').trim()
    const minutes = Number(body?.mute_minutes ?? 0)
    if (!roomId || !targetId) return json(400, { error: 'room_id and target_user_id are required.' })
    if (!(await isGroupAdmin(roomId, user.id))) {
      return json(403, { error: 'Only the group owner can mute members.' })
    }
    const until = minutes > 0
      ? new Date(Date.now() + minutes * 60 * 1000).toISOString()
      : new Date('2099-01-01T00:00:00Z').toISOString()
    const { error: uErr } = await admin
      .from('chat_room_members')
      .update({ moderation_muted_until: until })
      .eq('room_id', roomId)
      .eq('user_id', targetId)
    if (uErr) return json(400, { error: uErr.message })
    return json(200, { ok: true, moderation_muted_until: until })
  }

  if (action === 'unmute_group_member') {
    const roomId = String(body?.room_id || '').trim()
    const targetId = String(body?.target_user_id || '').trim()
    if (!roomId || !targetId) return json(400, { error: 'room_id and target_user_id are required.' })
    if (!(await isGroupAdmin(roomId, user.id))) {
      return json(403, { error: 'Only the group owner can unmute members.' })
    }
    const { error: uErr } = await admin
      .from('chat_room_members')
      .update({ moderation_muted_until: null })
      .eq('room_id', roomId)
      .eq('user_id', targetId)
    if (uErr) return json(400, { error: uErr.message })
    return json(200, { ok: true })
  }

  if (action === 'mute_room_until') {
    const roomId = String(body?.room_id || '').trim()
    const untilRaw = String(body?.muted_until || '').trim()
    if (!roomId || !untilRaw) return json(400, { error: 'room_id and muted_until are required.' })
    const until = new Date(untilRaw)
    if (Number.isNaN(until.getTime())) return json(400, { error: 'Invalid muted_until.' })
    const { error: uErr } = await admin
      .from('chat_room_members')
      .update({ muted_until: until.toISOString() })
      .eq('room_id', roomId)
      .eq('user_id', user.id)
    if (uErr) return json(400, { error: uErr.message })
    return json(200, { ok: true, muted_until: until.toISOString() })
  }

  if (action === 'star_message' || action === 'unstar_message') {
    const messageId = String(body?.message_id || '').trim()
    if (!messageId) return json(400, { error: 'message_id is required.' })
    const { data: msg } = await admin
      .from('chat_messages')
      .select('room_id, deleted_at')
      .eq('id', messageId)
      .maybeSingle()
    if (!msg || msg.deleted_at) return json(404, { error: 'Message not found.' })
    if (!(await requireGroupMember(msg.room_id))) {
      return json(403, { error: 'Not a member of this room.' })
    }
    if (action === 'star_message') {
      const { error: sErr } = await admin
        .from('chat_message_stars')
        .upsert({ message_id: messageId, user_id: user.id }, { onConflict: 'message_id,user_id', ignoreDuplicates: true })
      if (sErr) return json(400, { error: sErr.message })
    } else {
      const { error: dErr } = await admin
        .from('chat_message_stars')
        .delete()
        .eq('message_id', messageId)
        .eq('user_id', user.id)
      if (dErr) return json(400, { error: dErr.message })
    }
    return json(200, { ok: true })
  }

  if (action === 'pin_message' || action === 'unpin_message') {
    const roomId = String(body?.room_id || '').trim()
    const messageId = String(body?.message_id || '').trim()
    if (!roomId || !messageId) return json(400, { error: 'room_id and message_id are required.' })

    const { data: pinRoom } = await admin
      .from('chat_rooms')
      .select('id, kind')
      .eq('id', roomId)
      .maybeSingle()
    if (!pinRoom) return json(404, { error: 'Room not found.' })

    if (pinRoom.kind === 'dm') {
      if (!(await requireGroupMember(roomId))) {
        return json(403, { error: 'Not a member of this conversation.' })
      }
    } else if (pinRoom.kind === 'group') {
      if (!(await isGroupAdmin(roomId, user.id))) {
        return json(403, { error: 'Only the group owner can pin messages.' })
      }
    } else {
      return json(403, { error: 'Cannot pin messages in this room.' })
    }

    const { data: pinMsg } = await admin
      .from('chat_messages')
      .select('room_id, deleted_at')
      .eq('id', messageId)
      .maybeSingle()
    if (!pinMsg || pinMsg.deleted_at || pinMsg.room_id !== roomId) {
      return json(404, { error: 'Message not found.' })
    }

    if (action === 'pin_message') {
      const { error: pErr } = await admin
        .from('chat_pinned_messages')
        .upsert({ room_id: roomId, message_id: messageId, pinned_by: user.id }, { onConflict: 'room_id,message_id' })
      if (pErr) return json(400, { error: pErr.message })
    } else {
      const { error: dErr } = await admin
        .from('chat_pinned_messages')
        .delete()
        .eq('room_id', roomId)
        .eq('message_id', messageId)
      if (dErr) return json(400, { error: dErr.message })
    }
    return json(200, { ok: true })
  }

  if (action === 'update_image_urls') {
    const messageId = String(body?.message_id || '').trim()
    const imageUrls = Array.isArray(body?.image_urls)
      ? body.image_urls.map((u: unknown) => String(u).trim()).filter(Boolean).slice(0, 12)
      : []
    if (!messageId) return json(400, { error: 'message_id is required.' })
    // Only the original sender can patch their own message's image_urls.
    const { data: msg } = await admin
      .from('chat_messages')
      .select('sender_id, deleted_at')
      .eq('id', messageId)
      .maybeSingle()
    if (!msg || msg.deleted_at) return json(404, { error: 'Message not found.' })
    if (msg.sender_id !== user.id) return json(403, { error: 'Not your message.' })
    const { error: uErr } = await admin
      .from('chat_messages')
      .update({ image_urls: imageUrls })
      .eq('id', messageId)
    if (uErr) return json(400, { error: uErr.message })
    return json(200, { ok: true })
  }

  return json(400, { error: 'Unknown action.' })
})
