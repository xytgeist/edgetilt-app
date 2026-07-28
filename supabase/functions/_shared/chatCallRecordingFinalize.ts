/**
 * Finalize a chat call RoomComposite recording into a call_recording message.
 * Used by livekit-egress-webhook and chat-calls (poll fallback when webhook is late).
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { loungeCfR2PublicUrl, readLoungeCfR2Config } from './loungeCfR2.ts'

export type ChatCallRecordingRow = {
  id: string
  chat_room_id: string
  started_by?: string | null
  recording_status?: string | null
  recording_started_by?: string | null
  recording_r2_key?: string | null
  recording_egress_id?: string | null
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
    // Some CDNs dislike HEAD; try a tiny ranged GET.
    const get = await fetch(url, { method: 'GET', headers: { Range: 'bytes=0-0' } })
    return get.ok || get.status === 206
  } catch {
    return false
  }
}

/**
 * Insert call_recording message + set recording_status ready|failed.
 * Idempotent if already ready/failed.
 */
export async function finalizeChatCallRecording(
  admin: SupabaseClient,
  call: ChatCallRecordingRow,
  opts: { failed?: boolean; errorDetail?: string | null; requireObject?: boolean } = {},
): Promise<{ recording_status: string; video_url?: string | null; skipped?: boolean }> {
  const current = String(call.recording_status || '')
  if (current === 'ready' || current === 'failed') {
    return { recording_status: current, skipped: true }
  }

  if (opts.failed) {
    await admin
      .from('chat_calls')
      .update({ recording_status: 'failed' })
      .eq('id', call.id)
      .in('recording_status', ['recording', 'stopping'])
    if (opts.errorDetail) {
      console.error('chat call recording failed', call.id, opts.errorDetail)
    }
    return { recording_status: 'failed' }
  }

  const r2 = readLoungeCfR2Config()
  const r2Key = String(call.recording_r2_key || '').trim()
  if (!r2 || !r2Key) {
    await admin.from('chat_calls').update({ recording_status: 'failed' }).eq('id', call.id)
    return { recording_status: 'failed' }
  }

  const videoUrl = loungeCfR2PublicUrl(r2, r2Key)
  if (opts.requireObject) {
    const exists = await recordingObjectExists(videoUrl)
    if (!exists) {
      return { recording_status: current || 'stopping', skipped: true }
    }
  }

  const senderId = String(call.recording_started_by || call.started_by || '').trim()
  if (!senderId) {
    await admin.from('chat_calls').update({ recording_status: 'failed' }).eq('id', call.id)
    return { recording_status: 'failed' }
  }

  // Avoid duplicate cards if webhook + poll race.
  const { data: existing } = await admin
    .from('chat_messages')
    .select('id')
    .eq('room_id', call.chat_room_id)
    .eq('content_encoding', 'call_recording')
    .eq('video_url', videoUrl)
    .limit(1)
    .maybeSingle()

  if (!existing?.id) {
    const { error: msgErr } = await admin.from('chat_messages').insert({
      room_id: call.chat_room_id,
      sender_id: senderId,
      body: '[call recording]',
      content_encoding: 'call_recording',
      video_url: videoUrl,
    })
    if (msgErr) throw new Error(msgErr.message)
  }

  await admin
    .from('chat_calls')
    .update({ recording_status: 'ready' })
    .eq('id', call.id)
    .in('recording_status', ['recording', 'stopping', 'ready', 'failed'])

  return { recording_status: 'ready', video_url: videoUrl }
}
