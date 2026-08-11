/**
 * w2g-vision-extract
 *
 * Auth'd users with Slots Edge Starter+ (or staff) send a W-2G image;
 * OpenAI vision returns the six TurboTax-combine fields as JSON.
 *
 * Secrets: OPENAI_API_KEY (same as process-offer-uploads)
 * Optional: OPENAI_VISION_MODEL (default gpt-4o-mini)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const OPENAI_MODEL = Deno.env.get('OPENAI_VISION_MODEL') ?? 'gpt-4o-mini'
const MAX_BYTES = 4_500_000
const SLOT_PLAN_SLUGS = new Set(['slots-edge-starter', 'slots-edge', 'slots-edge-lifetime'])

type W2GFields = {
  payerName: string
  payerAddress: string
  payerEin: string
  box1Winnings: string
  box4FederalWithheld: string
  dateWon: string
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

function textOrEmpty(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value.replace(/\s+/g, ' ').trim()
}

function normalizeMoney(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
  }
  const raw = textOrEmpty(value)
  if (!raw) return ''
  const m = raw.replace(/,/g, '').match(/(-?\d+(?:\.\d{1,2})?)/)
  if (!m) return raw
  const n = Number(m[1])
  if (!Number.isFinite(n)) return raw
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

function normalizeEin(value: unknown): string {
  const raw = textOrEmpty(value).replace(/\s+/g, '')
  const m = raw.match(/(\d{2})-?(\d{7})/)
  if (!m) return textOrEmpty(value)
  return `${m[1]}-${m[2]}`
}

function normalizeDate(value: unknown): string {
  const raw = textOrEmpty(value)
  if (!raw) return ''
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (iso) return `${iso[2]}/${iso[3]}/${iso[1]}`
  const m = raw.match(/(\d{1,2})\s*[\/\-|.|¦]\s*(\d{1,2})\s*[\/\-|.|¦]\s*(\d{2,4})/)
  if (!m) return raw
  const mm = m[1].padStart(2, '0')
  const dd = m[2].padStart(2, '0')
  let yy = m[3]
  if (yy.length === 2) yy = `20${yy}`
  return `${mm}/${dd}/${yy}`
}

function extractJsonObject(rawText: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(rawText)
    if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>
  } catch {
    /* fall through */
  }
  const match = rawText.match(/\{[\s\S]*\}/)
  if (!match) return null
  try {
    const parsed = JSON.parse(match[0])
    if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>
  } catch {
    return null
  }
  return null
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

function normalizeFields(raw: Record<string, unknown>): W2GFields {
  const nested =
    raw.fields && typeof raw.fields === 'object' ? (raw.fields as Record<string, unknown>) : raw
  return {
    payerName: textOrEmpty(nested.payerName ?? nested.payer_name),
    payerAddress: textOrEmpty(nested.payerAddress ?? nested.payer_address),
    payerEin: normalizeEin(nested.payerEin ?? nested.payer_ein ?? nested.payerTin),
    box1Winnings: normalizeMoney(nested.box1Winnings ?? nested.box1_winnings ?? nested.box1),
    box4FederalWithheld: normalizeMoney(
      nested.box4FederalWithheld ?? nested.box4_federal_withheld ?? nested.box4,
    ),
    dateWon: normalizeDate(nested.dateWon ?? nested.date_won ?? nested.date),
  }
}

async function userHasSlotsEdgeAccess(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<boolean> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, has_active_subscription')
    .eq('user_id', userId)
    .maybeSingle()

  const role = String(profile?.role || '').toLowerCase()
  if (role === 'admin' || role === 'moderator') return true
  if (profile?.has_active_subscription === true) return true

  const { data: entitlements, error } = await supabase.rpc('get_my_entitlements')
  if (!error && entitlements && typeof entitlements === 'object') {
    for (const slug of SLOT_PLAN_SLUGS) {
      if ((entitlements as Record<string, { active?: boolean }>)[slug]?.active) return true
    }
  }

  // Fallback direct table read (RLS: own rows).
  const { data: subs } = await supabase
    .from('user_subscriptions')
    .select('product_slug, status')
    .eq('user_id', userId)
    .in('product_slug', [...SLOT_PLAN_SLUGS])
    .in('status', ['active', 'trialing'])
    .limit(5)

  return Array.isArray(subs) && subs.length > 0
}

async function extractWithOpenAi(
  openaiApiKey: string,
  mimeType: string,
  base64: string,
): Promise<{ fields: W2GFields; confidence: number | null }> {
  const prompt = `
You are extracting fields from a US IRS Form W-2G (Certain Gambling Winnings) photo.
Return strict JSON only (no markdown) with this shape:
{
  "confidence": 0.0-1.0,
  "payerName": "PAYER'S name including D/B/A if present",
  "payerAddress": "street, city, state, ZIP (single line)",
  "payerEin": "NN-NNNNNNN (PAYER'S TIN / EIN)",
  "box1Winnings": "Box 1 Reportable winnings as currency like $7,500.00",
  "box4FederalWithheld": "Box 4 Federal income tax withheld as currency like $0.00",
  "dateWon": "Box 2 Date won as MM/DD/YYYY (expand 2-digit year to 20xx)"
}

Rules:
- Read only what is printed on the form. Do not invent values.
- Prefer PAYER fields (left/top), never the WINNER name/address/TIN.
- EIN is PAYER'S TIN (format 26-2258774), not the winner SSN.
- Box 4 may appear as ".00" with no dollar sign … still return "$0.00".
- Date may use pipes/spaces like "07 | 09 | 26" … return "07/09/2026".
- If a field is unreadable, return "" for that field and lower confidence.
`.trim()

  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openaiApiKey}`,
      'Content-Type': 'application/json',
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
              image_url: `data:${mimeType};base64,${base64}`,
            },
          ],
        },
      ],
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`OpenAI error (${res.status}): ${errText.slice(0, 300)}`)
  }

  const payload = await res.json()
  const outputText = outputTextFromResponsesApi(payload)
  if (!outputText) throw new Error('OpenAI returned no text output.')
  const parsed = extractJsonObject(outputText)
  if (!parsed) throw new Error('Could not parse JSON from OpenAI output.')
  const fields = normalizeFields(parsed)
  const confidence =
    typeof parsed.confidence === 'number' && Number.isFinite(parsed.confidence)
      ? parsed.confidence
      : null
  return { fields, confidence }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json(405, { error: 'POST required.' })

  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) {
    return json(401, { error: 'Sign in required.', code: 'auth_required' })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const openaiApiKey = Deno.env.get('OPENAI_API_KEY') ?? ''
  if (!supabaseUrl || !supabaseAnonKey) {
    return json(500, { error: 'Supabase env not configured.' })
  }
  if (!openaiApiKey) {
    return json(500, { error: 'OPENAI_API_KEY not set.', code: 'missing_openai' })
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData?.user?.id) {
    return json(401, { error: 'Sign in required.', code: 'auth_required' })
  }

  const allowed = await userHasSlotsEdgeAccess(supabase, userData.user.id)
  if (!allowed) {
    return json(403, {
      error: 'Slots Edge (Starter or higher) required for AI W-2G extract.',
      code: 'subscribe_required',
    })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json(400, { error: 'Invalid JSON body.' })
  }

  const imageBase64 = textOrEmpty(body.imageBase64 || body.image_base64).replace(/^data:[^;]+;base64,/, '')
  if (!imageBase64) return json(400, { error: 'imageBase64 required.' })

  // Rough size guard (base64 ~ 4/3 of bytes).
  if (imageBase64.length > Math.floor(MAX_BYTES * 1.4)) {
    return json(413, { error: 'Image too large. Re-scan at a lower resolution.' })
  }

  const mimeTypeRaw = textOrEmpty(body.mimeType || body.mime_type || 'image/jpeg').toLowerCase()
  const mimeType =
    mimeTypeRaw === 'image/png' || mimeTypeRaw === 'image/webp' || mimeTypeRaw === 'image/jpeg'
      ? mimeTypeRaw
      : 'image/jpeg'

  try {
    const { fields, confidence } = await extractWithOpenAi(openaiApiKey, mimeType, imageBase64)
    return json(200, {
      fields,
      confidence,
      engine: 'openai-vision',
      model: OPENAI_MODEL,
    })
  } catch (err) {
    return json(502, {
      error: err instanceof Error ? err.message : 'Vision extract failed.',
      code: 'vision_failed',
    })
  }
})
