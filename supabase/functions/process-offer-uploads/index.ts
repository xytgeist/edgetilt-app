import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
}

const OFFER_TYPES = new Set(['free_play', 'hotel', 'dining', 'gift', 'multiplier', 'tournament', 'drawing', 'other'])

type ParsedOffer = {
  confidence?: number
  warnings?: string[]
  casino_name?: string
  offer_type?: string
  title?: string
  start_at?: string
  end_at?: string | null
  value_amount?: number | null
  value_text?: string | null
  notes?: string | null
}

const OPENAI_MODEL = Deno.env.get('OPENAI_VISION_MODEL') ?? 'gpt-4o-mini'
const AUTO_CREATE_CONFIDENCE = Number(Deno.env.get('AI_AUTO_CREATE_CONFIDENCE') ?? '0.78')
const MAX_BATCH_SIZE = Number(Deno.env.get('AI_PROCESS_BATCH_SIZE') ?? '20')

function textOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length ? trimmed : null
}

function numberOrNull(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return null
  const parsed = Number(value.replace(/[^0-9.-]/g, ''))
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeOfferType(value: unknown): string {
  const raw = textOrNull(value)?.toLowerCase().replace(/\s+/g, '_')
  return raw && OFFER_TYPES.has(raw) ? raw : 'other'
}

function maybeIso(value: unknown): string | null {
  const str = textOrNull(value)
  if (!str) return null
  const dt = new Date(str)
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString()
}

function extractJsonObject(rawText: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(rawText)
    if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>
  } catch (_) {
    // fall through to fenced extraction
  }
  const match = rawText.match(/\{[\s\S]*\}/)
  if (!match) return null
  try {
    const parsed = JSON.parse(match[0])
    if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>
  } catch (_) {
    return null
  }
  return null
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize)
    binary += String.fromCharCode(...chunk)
  }
  return btoa(binary)
}

function outputTextFromResponsesApi(payload: any): string {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) return payload.output_text
  const output = Array.isArray(payload?.output) ? payload.output : []
  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : []
    for (const part of content) {
      if (typeof part?.text === 'string' && part.text.trim()) return part.text
    }
  }
  return ''
}

async function parseOfferFromImage(openaiApiKey: string, mimeType: string, bytes: Uint8Array): Promise<ParsedOffer> {
  const base64 = bytesToBase64(bytes)
  const prompt = `
Extract one casino offer event from this image.
Return strict JSON (no markdown, no prose) with this shape:
{
  "confidence": 0.0-1.0,
  "warnings": ["optional warning strings"],
  "casino_name": "string or null",
  "offer_type": "free_play|hotel|dining|gift|multiplier|tournament|drawing|other",
  "title": "string or null",
  "start_at": "ISO8601 datetime or null",
  "end_at": "ISO8601 datetime or null",
  "value_amount": number or null,
  "value_text": "string or null",
  "notes": "string or null"
}

Rules:
- Use local date text from the flyer and infer year if needed.
- If a field is uncertain, keep it null and add a warning.
- confidence should reflect how complete and reliable the extraction is.
`.trim()

  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openaiApiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      input: [
        {
          role: 'user',
          content: [
            { type: 'input_text', text: prompt },
            {
              type: 'input_image',
              image_url: `data:${mimeType};base64,${base64}`
            }
          ]
        }
      ]
    })
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`OpenAI error (${res.status}): ${errText.slice(0, 300)}`)
  }

  const payload = await res.json()
  const outputText = outputTextFromResponsesApi(payload)
  if (!outputText) {
    throw new Error('OpenAI returned no text output.')
  }

  const parsed = extractJsonObject(outputText)
  if (!parsed) throw new Error('Could not parse JSON from OpenAI output.')

  return {
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0,
    warnings: Array.isArray(parsed.warnings) ? parsed.warnings.map((w) => String(w)) : [],
    casino_name: textOrNull(parsed.casino_name) ?? undefined,
    offer_type: normalizeOfferType(parsed.offer_type),
    title: textOrNull(parsed.title) ?? undefined,
    start_at: maybeIso(parsed.start_at) ?? undefined,
    end_at: maybeIso(parsed.end_at),
    value_amount: numberOrNull(parsed.value_amount),
    value_text: textOrNull(parsed.value_text),
    notes: textOrNull(parsed.notes)
  }
}

function toDraftPayload(offer: ParsedOffer): Record<string, unknown> {
  return {
    casino_name: offer.casino_name ?? '',
    offer_type: offer.offer_type ?? 'other',
    title: offer.title ?? '',
    start_at: offer.start_at ?? '',
    end_at: offer.end_at ?? '',
    value_amount: offer.value_amount ?? null,
    value_text: offer.value_text ?? '',
    notes: offer.notes ?? ''
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')
    if (!supabaseUrl || !serviceRoleKey || !openaiApiKey) {
      throw new Error('Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or OPENAI_API_KEY.')
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const admin = createClient(supabaseUrl, serviceRoleKey)
    const token = authHeader.replace(/^Bearer\s+/i, '').trim()
    const { data: userData, error: userError } = await admin.auth.getUser(token)
    if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: 'Invalid user token.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    const userId = userData.user.id

    const body = await req.json().catch(() => ({}))
    const batchId = typeof body?.batchId === 'string' ? body.batchId : null

    let query = admin
      .from('offer_uploads')
      .select('id, user_id, batch_id, bucket_id, storage_path, file_name, mime_type, status')
      .eq('user_id', userId)
      .eq('status', 'queued')
      .order('created_at', { ascending: true })
      .limit(MAX_BATCH_SIZE)

    if (batchId) query = query.eq('batch_id', batchId)

    const { data: uploads, error: uploadsError } = await query
    if (uploadsError) throw uploadsError
    if (!uploads?.length) {
      return new Response(JSON.stringify({ processed: 0, created: 0, queued_for_review: 0, failed: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (batchId) {
      await admin.from('offer_import_batches').update({ status: 'processing', error_message: null }).eq('id', batchId).eq('user_id', userId)
    }

    let created = 0
    let queuedForReview = 0
    let failed = 0

    for (const upload of uploads) {
      await admin.from('offer_uploads').update({ status: 'parsing', parse_error: null }).eq('id', upload.id).eq('user_id', userId)

      try {
        const bucketId = upload.bucket_id || 'offer-mailers'
        const { data: fileBlob, error: fileError } = await admin.storage.from(bucketId).download(upload.storage_path)
        if (fileError || !fileBlob) throw fileError || new Error('Image download failed.')

        const parsed = await parseOfferFromImage(openaiApiKey, upload.mime_type || 'image/jpeg', new Uint8Array(await fileBlob.arrayBuffer()))
        const confidence = Number.isFinite(parsed.confidence) ? Math.max(0, Math.min(1, Number(parsed.confidence))) : 0
        const warnings = Array.isArray(parsed.warnings) ? parsed.warnings.filter(Boolean) : []
        const hasRequiredFields = !!(parsed.casino_name && parsed.title && parsed.start_at)
        const shouldAutoCreate = confidence >= AUTO_CREATE_CONFIDENCE && hasRequiredFields

        if (shouldAutoCreate) {
          const eventRow = {
            user_id: userId,
            casino_name: parsed.casino_name,
            offer_type: parsed.offer_type ?? 'other',
            title: parsed.title,
            start_at: parsed.start_at,
            end_at: parsed.end_at,
            value_amount: parsed.value_amount ?? null,
            value_text: parsed.value_text ?? null,
            notes: parsed.notes ?? null,
            source_type: 'image_ai',
            source_image_path: upload.storage_path,
            ai_confidence: Number((confidence * 100).toFixed(2))
          }
          const { error: eventError } = await admin.from('offer_events').insert(eventRow)
          if (eventError) throw eventError
          await admin
            .from('offer_uploads')
            .update({ status: 'parsed', parse_error: null, review_required: false })
            .eq('id', upload.id)
            .eq('user_id', userId)
          created += 1
          continue
        }

        const reviewRow = {
          user_id: userId,
          upload_id: upload.id,
          batch_id: upload.batch_id ?? null,
          draft: toDraftPayload(parsed),
          warnings: warnings.length
            ? warnings
            : [`Auto-create skipped: confidence ${confidence.toFixed(2)} below threshold ${AUTO_CREATE_CONFIDENCE.toFixed(2)}.`]
        }
        const { error: reviewError } = await admin.from('offer_ai_review_items').insert(reviewRow)
        if (reviewError) throw reviewError

        await admin
          .from('offer_uploads')
          .update({ status: 'parsed', parse_error: null, review_required: true })
          .eq('id', upload.id)
          .eq('user_id', userId)
        queuedForReview += 1
      } catch (err) {
        failed += 1
        const message = err instanceof Error ? err.message : String(err)
        await admin
          .from('offer_uploads')
          .update({ status: 'failed', parse_error: message.slice(0, 500) })
          .eq('id', upload.id)
          .eq('user_id', userId)
      }
    }

    if (batchId) {
      const { data: batchUploads } = await admin
        .from('offer_uploads')
        .select('status')
        .eq('user_id', userId)
        .eq('batch_id', batchId)

      const statuses = (batchUploads ?? []).map((row) => row.status)
      let batchStatus = 'completed'
      let errorMessage: string | null = null
      if (statuses.some((s) => s === 'queued' || s === 'parsing')) {
        batchStatus = 'processing'
      } else if (statuses.some((s) => s === 'failed')) {
        batchStatus = 'completed_with_errors'
        errorMessage = 'One or more uploads failed parsing. Check offer_uploads.parse_error.'
      }
      await admin
        .from('offer_import_batches')
        .update({ status: batchStatus, error_message: errorMessage })
        .eq('id', batchId)
        .eq('user_id', userId)
    }

    return new Response(
      JSON.stringify({
        processed: uploads.length,
        created,
        queued_for_review: queuedForReview,
        failed
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected error'
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
