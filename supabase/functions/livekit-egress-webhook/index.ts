/**
 * LiveKit Egress webhook → chat_messages call_recording card + chat_calls.recording_status.
 * Configure in LiveKit Cloud: webhook URL → this function; uses LIVEKIT_API_KEY/SECRET.
 */
import { createClient } from 'npm:@supabase/supabase-js@2'
import { WebhookReceiver } from 'npm:livekit-server-sdk@2'
import {
  egressInfoLooksFailed,
  finalizeChatCallRecording,
} from '../_shared/chatCallRecordingFinalize.ts'

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return json(405, { error: 'Method not allowed' })
  }

  const apiKey = Deno.env.get('LIVEKIT_API_KEY')?.trim() || ''
  const apiSecret = Deno.env.get('LIVEKIT_API_SECRET')?.trim() || ''
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!apiKey || !apiSecret) {
    return json(500, { error: 'Missing LIVEKIT_API_KEY or LIVEKIT_API_SECRET' })
  }
  if (!supabaseUrl || !serviceKey) {
    return json(500, { error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' })
  }

  const bodyText = await req.text()
  const authHeader = req.headers.get('Authorization') || ''

  try {
    const receiver = new WebhookReceiver(apiKey, apiSecret)
    const event = await receiver.receive(bodyText, authHeader)
    const eventType = String(event?.event || '')
    const egressInfo = event?.egressInfo
    const egressId = String(egressInfo?.egressId || '').trim()
    if (!egressId) {
      return json(200, { ok: true, ignored: true, reason: 'no_egress_id' })
    }

    // Only finalize on ended (success or failure).
    if (eventType !== 'egress_ended') {
      return json(200, { ok: true, ignored: true, eventType })
    }

    const admin = createClient(supabaseUrl, serviceKey)
    const { data: call, error: callErr } = await admin
      .from('chat_calls')
      .select(
        'id, chat_room_id, started_by, recording_status, recording_started_by, recording_r2_key, recording_egress_id',
      )
      .eq('recording_egress_id', egressId)
      .maybeSingle()
    if (callErr) throw new Error(callErr.message)
    if (!call) {
      return json(200, { ok: true, ignored: true, reason: 'unknown_egress' })
    }

    const failed = egressInfoLooksFailed(egressInfo?.status, egressInfo?.error)
    const result = await finalizeChatCallRecording(admin, call, {
      failed,
      errorDetail: failed
        ? String(egressInfo?.error || egressInfo?.status || 'egress failed')
        : null,
    })

    return json(200, {
      ok: true,
      call_id: call.id,
      recording_status: result.recording_status,
      video_url: result.video_url || null,
      skipped: result.skipped || false,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('livekit-egress-webhook error', msg)
    // 200 on verify failures would hide misconfig; keep 400 so LiveKit retries briefly.
    return json(400, { error: msg || 'Webhook error' })
  }
})
