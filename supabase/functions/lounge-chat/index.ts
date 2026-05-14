import { createClient } from 'npm:@supabase/supabase-js@2'

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
    const rows = unique.map((uid) => ({ room_id: room.id, user_id: uid }))
    const { error: mErr } = await admin.from('chat_room_members').insert(rows)
    if (mErr) {
      await admin.from('chat_rooms').delete().eq('id', room.id)
      return json(400, { error: mErr.message })
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
          .slice(0, 4)
      : []
    if (!roomId) {
      return json(400, { error: 'room_id is required.' })
    }
    if (!text && imageUrls.length === 0) {
      return json(400, { error: 'Message cannot be empty.' })
    }

    const { data: mem, error: memErr } = await admin
      .from('chat_room_members')
      .select('room_id')
      .eq('room_id', roomId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (memErr || !mem) {
      return json(403, { error: 'You are not a member of this room.' })
    }

    const { data: room, error: rErr } = await admin
      .from('chat_rooms')
      .select('subscriber_only')
      .eq('id', roomId)
      .maybeSingle()
    if (rErr || !room) {
      return json(404, { error: 'Room not found.' })
    }
    if (room.subscriber_only && !subscriberOrStaff(actorProfile)) {
      return json(403, { error: 'Subscriber required to post in this room.' })
    }

    const { error: sErr } = await admin.from('chat_messages').insert({
      room_id: roomId,
      sender_id: user.id,
      body: text,
      image_urls: imageUrls,
    })
    if (sErr) {
      return json(400, { error: sErr.message })
    }
    return json(200, { ok: true })
  }

  return json(400, { error: 'Unknown action.' })
})
