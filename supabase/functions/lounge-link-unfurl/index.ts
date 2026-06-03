import { createClient } from 'npm:@supabase/supabase-js@2'
import { attachLinkPreviewToEntity, extractFirstUrlFromText, unfurlUrl } from '../_shared/linkUnfurl.ts'

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

  if (action === 'unfurl') {
    const url = String(body?.url || '').trim()
    if (!url && body?.text) {
      const fromText = extractFirstUrlFromText(String(body.text))
      if (!fromText) return json(400, { error: 'No URL found in text.' })
      const preview = await unfurlUrl(admin, fromText)
      return json(200, { ok: true, preview })
    }
    if (!url) return json(400, { error: 'url is required.' })
    const preview = await unfurlUrl(admin, url)
    return json(200, { ok: true, preview })
  }

  if (action === 'attach') {
    const entityType = String(body?.entity_type || '').trim() as
      | 'chat_message'
      | 'feed_post'
      | 'feed_comment'
    const entityId = String(body?.entity_id || '').trim()
    const text = String(body?.text || body?.url || '').trim()
    if (!entityType || !entityId) {
      return json(400, { error: 'entity_type and entity_id are required.' })
    }
    if (!['chat_message', 'feed_post', 'feed_comment'].includes(entityType)) {
      return json(400, { error: 'Invalid entity_type.' })
    }
    const preview = await attachLinkPreviewToEntity(admin, entityType, entityId, text, user.id)
    return json(200, { ok: true, preview })
  }

  return json(400, { error: 'Unknown action.' })
})
