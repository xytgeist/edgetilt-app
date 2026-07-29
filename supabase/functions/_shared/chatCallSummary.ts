/**
 * Insert a durable in-thread call_summary card when a chat call ends.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

export type ChatCallSummaryRow = {
  id: string
  chat_room_id: string
  media_mode?: string | null
  started_by?: string | null
  started_at?: string | null
  answered_at?: string | null
  ended_at?: string | null
  status?: string | null
}

export type CallSummaryParticipantMeta = {
  user_id: string
  display_name: string | null
  handle: string | null
  avatar_url: string | null
}

/** Stored on chat_messages.link_preview for call_summary cards (no `url` → not a link unfurl). */
export type CallSummaryLinkPreview = {
  kind: 'call_summary'
  call_id: string
  media_mode: 'audio' | 'video'
  status: 'ended' | 'missed' | 'declined'
  duration_seconds: number
  started_at: string | null
  answered_at: string | null
  ended_at: string
  started_by: string | null
  participants: CallSummaryParticipantMeta[]
}

function formatDurationLabel(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${String(r).padStart(2, '0')}`
}

function isUniqueViolation(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false
  if (err.code === '23505') return true
  return /duplicate key|unique constraint/i.test(String(err.message || ''))
}

export function callSummaryBodyFromPreview(preview: CallSummaryLinkPreview): string {
  const media = preview.media_mode === 'video' ? 'Video' : 'Voice'
  if (preview.status === 'missed') return `Missed ${media.toLowerCase()} call`
  if (preview.status === 'declined') return `${media} call declined`
  if (preview.duration_seconds > 0) {
    return `${media} call · ${formatDurationLabel(preview.duration_seconds)}`
  }
  return `${media} call ended`
}

async function buildCallSummaryPreview(
  admin: SupabaseClient,
  call: ChatCallSummaryRow,
  status: 'ended' | 'missed' | 'declined',
  endedAt: string,
): Promise<CallSummaryLinkPreview> {
  const answeredAt = call.answered_at ? String(call.answered_at) : null
  const startedAt = call.started_at ? String(call.started_at) : null
  let durationSec = 0
  if (answeredAt && status === 'ended') {
    const ms = Date.parse(endedAt) - Date.parse(answeredAt)
    if (Number.isFinite(ms) && ms > 0) durationSec = Math.max(1, Math.round(ms / 1000))
  }

  const { data: parts } = await admin
    .from('chat_call_participants')
    .select('user_id, joined_at')
    .eq('call_id', call.id)
    .order('joined_at', { ascending: true })

  const userIds = Array.from(
    new Set((parts || []).map((p) => String(p.user_id || '').trim()).filter(Boolean)),
  )

  let participants: CallSummaryParticipantMeta[] = []
  if (userIds.length) {
    const { data: profiles } = await admin
      .from('profiles')
      .select('user_id, display_name, handle, avatar_url')
      .in('user_id', userIds)
    const byId = new Map((profiles || []).map((p) => [String(p.user_id), p]))
    participants = userIds.map((uid) => {
      const p = byId.get(uid)
      return {
        user_id: uid,
        display_name: p?.display_name ? String(p.display_name) : null,
        handle: p?.handle ? String(p.handle) : null,
        avatar_url: p?.avatar_url ? String(p.avatar_url) : null,
      }
    })
  }

  const preview: CallSummaryLinkPreview = {
    kind: 'call_summary',
    call_id: call.id,
    media_mode: call.media_mode === 'video' ? 'video' : 'audio',
    status,
    duration_seconds: durationSec,
    started_at: startedAt,
    answered_at: answeredAt,
    ended_at: endedAt,
    started_by: call.started_by ? String(call.started_by) : null,
    participants,
  }

  // Voice calls: no live transcript product (history card only).
  return preview
}

/**
 * Idempotent insert of the historical call card for a finished call.
 */
export async function ensureCallSummaryMessage(
  admin: SupabaseClient,
  call: ChatCallSummaryRow,
  status: 'ended' | 'missed' | 'declined',
  endedAt: string,
): Promise<{ body: string }> {
  const roomId = String(call.chat_room_id || '').trim()
  if (!roomId) throw new Error('Missing chat_room_id for call summary.')

  const senderId = String(call.started_by || '').trim()
  if (!senderId) throw new Error('Missing call starter for call summary.')

  const preview = await buildCallSummaryPreview(admin, call, status, endedAt)
  const body = callSummaryBodyFromPreview(preview)

  const { data: existing } = await admin
    .from('chat_messages')
    .select('id')
    .eq('content_encoding', 'call_summary')
    .contains('link_preview', { kind: 'call_summary', call_id: call.id })
    .limit(1)
    .maybeSingle()

  if (existing?.id) {
    await admin
      .from('chat_messages')
      .update({ body, link_preview: preview })
      .eq('id', existing.id)
    return { body }
  }

  const { error: msgErr } = await admin.from('chat_messages').insert({
    room_id: roomId,
    sender_id: senderId,
    body,
    content_encoding: 'call_summary',
    link_preview: preview,
  })
  if (msgErr && !isUniqueViolation(msgErr)) throw new Error(msgErr.message)
  return { body }
}
