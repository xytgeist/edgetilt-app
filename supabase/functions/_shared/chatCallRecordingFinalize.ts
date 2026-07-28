/**
 * Finalize a chat call RoomComposite recording into a call_recording message.
 * Used by livekit-egress-webhook and chat-calls (poll fallback when webhook is late).
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { loungeCfR2PublicUrl, readLoungeCfR2Config } from './loungeCfR2.ts'

export type ChatCallRecordingRow = {
  id: string
  chat_room_id: string
  kind?: string | null
  media_mode?: string | null
  started_by?: string | null
  ended_at?: string | null
  recording_status?: string | null
  recording_started_by?: string | null
  recording_started_at?: string | null
  recording_r2_key?: string | null
  recording_egress_id?: string | null
}

export type CallRecordingParticipantMeta = {
  user_id: string
  display_name: string | null
  handle: string | null
  avatar_url: string | null
}

/** Stored on chat_messages.link_preview for call_recording cards (no `url` → not a link unfurl). */
export type CallRecordingLinkPreview = {
  kind: 'call_recording'
  call_id: string
  media_mode: 'audio' | 'video'
  duration_seconds: number
  started_at: string | null
  ended_at: string
  started_by: string | null
  participants: CallRecordingParticipantMeta[]
}

/**
 * LiveKit may return EgressStatus as a string name or a numeric protobuf enum:
 * 0 STARTING, 1 ACTIVE, 2 ENDING, 3 COMPLETE, 4 FAILED, 5 ABORTED, 6 LIMIT_REACHED
 */
export function normalizeEgressStatus(status: unknown): string {
  if (typeof status === 'number' && Number.isFinite(status)) {
    const map: Record<number, string> = {
      0: 'EGRESS_STARTING',
      1: 'EGRESS_ACTIVE',
      2: 'EGRESS_ENDING',
      3: 'EGRESS_COMPLETE',
      4: 'EGRESS_FAILED',
      5: 'EGRESS_ABORTED',
      6: 'EGRESS_LIMIT_REACHED',
    }
    return map[status] || String(status)
  }
  return String(status || '')
}

export function egressInfoLooksFailed(status: unknown, error?: unknown): boolean {
  const s = normalizeEgressStatus(status)
  return (
    s.includes('FAILED') ||
    s.includes('ABORTED') ||
    s.includes('LIMIT_REACHED') ||
    Boolean(error)
  )
}

export function egressInfoLooksComplete(status: unknown): boolean {
  const s = normalizeEgressStatus(status)
  return s.includes('COMPLETE') && !s.includes('INCOMPLETE')
}

/** Public R2 object exists → safe to post the chat card even if webhook/listEgress status is odd. */
export async function recordingObjectExists(videoUrl: string): Promise<boolean> {
  const url = String(videoUrl || '').trim()
  if (!url) return false
  try {
    const head = await fetch(url, { method: 'HEAD' })
    if (head.ok) return true
    const get = await fetch(url, { method: 'GET', headers: { Range: 'bytes=0-0' } })
    return get.ok || get.status === 206
  } catch {
    return false
  }
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

async function buildCallRecordingPreview(
  admin: SupabaseClient,
  call: ChatCallRecordingRow,
): Promise<CallRecordingLinkPreview> {
  const startedAt = call.recording_started_at ? String(call.recording_started_at) : null
  const endedAt = call.ended_at ? String(call.ended_at) : new Date().toISOString()
  let durationSec = 0
  if (startedAt) {
    const endMs = Date.parse(endedAt)
    const startMs = Date.parse(startedAt)
    const ms = endMs - startMs
    if (Number.isFinite(ms) && ms > 0) durationSec = Math.min(600, Math.max(1, Math.round(ms / 1000)))
  }

  const { data: parts } = await admin
    .from('chat_call_participants')
    .select('user_id, joined_at')
    .eq('call_id', call.id)
    .order('joined_at', { ascending: true })

  const userIds = Array.from(
    new Set((parts || []).map((p) => String(p.user_id || '').trim()).filter(Boolean)),
  )

  /** @type {CallRecordingParticipantMeta[]} */
  let participants: CallRecordingParticipantMeta[] = []
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

  return {
    kind: 'call_recording',
    call_id: call.id,
    media_mode: call.media_mode === 'audio' ? 'audio' : 'video',
    duration_seconds: durationSec,
    started_at: startedAt,
    ended_at: endedAt,
    started_by: call.recording_started_by ? String(call.recording_started_by) : null,
    participants,
  }
}

async function ensureCallRecordingMessage(
  admin: SupabaseClient,
  call: ChatCallRecordingRow,
  videoUrl: string,
): Promise<void> {
  const roomId = String(call.chat_room_id || '').trim()
  if (!roomId) throw new Error('Missing chat_room_id for call recording.')

  const senderId = String(call.recording_started_by || call.started_by || '').trim()
  if (!senderId) throw new Error('Missing recording starter.')

  const preview = await buildCallRecordingPreview(admin, call)
  const body = `[call recording] · ${formatDurationLabel(preview.duration_seconds)}`

  // Global by video_url (unique index) — never post the same file into another room.
  const { data: existingAny } = await admin
    .from('chat_messages')
    .select('id, room_id')
    .eq('content_encoding', 'call_recording')
    .eq('video_url', videoUrl)
    .limit(1)
    .maybeSingle()

  if (existingAny?.id) {
    if (String(existingAny.room_id) !== roomId) {
      console.error(
        'chat call recording room mismatch; leaving existing card',
        call.id,
        existingAny.room_id,
        roomId,
      )
      return
    }
    await admin
      .from('chat_messages')
      .update({ body, link_preview: preview })
      .eq('id', existingAny.id)
    return
  }

  const { error: msgErr } = await admin.from('chat_messages').insert({
    room_id: roomId,
    sender_id: senderId,
    body,
    content_encoding: 'call_recording',
    video_url: videoUrl,
    link_preview: preview,
  })
  if (msgErr && !isUniqueViolation(msgErr)) throw new Error(msgErr.message)
}

/**
 * Insert call_recording message + set recording_status ready|failed.
 * Idempotent under webhook + poll concurrency.
 */
export async function finalizeChatCallRecording(
  admin: SupabaseClient,
  call: ChatCallRecordingRow,
  opts: { failed?: boolean; errorDetail?: string | null; requireObject?: boolean } = {},
): Promise<{ recording_status: string; video_url?: string | null; skipped?: boolean }> {
  // Always re-read the call row so room_id / r2 key cannot drift from a stale payload.
  const { data: fresh, error: freshErr } = await admin
    .from('chat_calls')
    .select(
      'id, chat_room_id, kind, media_mode, started_by, ended_at, recording_status, recording_started_by, recording_started_at, recording_r2_key, recording_egress_id',
    )
    .eq('id', call.id)
    .maybeSingle()
  if (freshErr) throw new Error(freshErr.message)
  if (!fresh) return { recording_status: 'failed', skipped: true }

  const current = String(fresh.recording_status || '')

  if (opts.failed) {
    await admin
      .from('chat_calls')
      .update({ recording_status: 'failed' })
      .eq('id', fresh.id)
      .in('recording_status', ['recording', 'stopping'])
    if (opts.errorDetail) {
      console.error('chat call recording failed', fresh.id, opts.errorDetail)
    }
    return { recording_status: 'failed' }
  }

  const r2 = readLoungeCfR2Config()
  const r2Key = String(fresh.recording_r2_key || '').trim()
  if (!r2 || !r2Key) {
    await admin.from('chat_calls').update({ recording_status: 'failed' }).eq('id', fresh.id)
    return { recording_status: 'failed' }
  }

  const videoUrl = loungeCfR2PublicUrl(r2, r2Key)
  if (opts.requireObject) {
    const exists = await recordingObjectExists(videoUrl)
    if (!exists) {
      return { recording_status: current || 'stopping', skipped: true }
    }
  }

  // Even if another worker already flipped to ready, still ensure the chat card exists
  // in THIS call's room (and never invent a card for a different room).
  if (current === 'ready') {
    await ensureCallRecordingMessage(admin, fresh, videoUrl)
    return { recording_status: 'ready', video_url: videoUrl, skipped: true }
  }
  if (current === 'failed') {
    return { recording_status: 'failed', skipped: true }
  }

  await ensureCallRecordingMessage(admin, fresh, videoUrl)

  await admin
    .from('chat_calls')
    .update({ recording_status: 'ready' })
    .eq('id', fresh.id)
    .in('recording_status', ['recording', 'stopping', 'ready', 'failed'])

  return { recording_status: 'ready', video_url: videoUrl }
}
