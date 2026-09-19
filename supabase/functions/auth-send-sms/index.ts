import { Webhook } from 'npm:standardwebhooks@1.0.0'

/**
 * Supabase Auth Send SMS hook. Supabase makes the code. We only deliver it.
 * US and Canada use the approved 2FA number. Other countries use the name
 * EdgeTilt on the OTP messaging profile. Do not call Telnyx Verify here.
 */

const FROM_DEFAULT = '+14803934143'
const ALPHA_SENDER = 'EdgeTilt'

function json(status: number, message: string) {
  return new Response(JSON.stringify({ error: { http_code: status, message } }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function toE164(raw: unknown) {
  const s = String(raw || '').trim()
  const digits = s.replace(/\D/g, '')
  if (s.startsWith('+') && digits.length >= 8 && digits.length <= 15) return `+${digits}`
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  return ''
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, 'Method not allowed')

  const payload = await req.text()
  const hookSecret = String(Deno.env.get('SEND_SMS_HOOK_SECRET') || '').replace(/^v1,whsec_/, '')
  const telnyxKey = String(Deno.env.get('TELNYX_API_KEY') || '').trim()
  const from = toE164(Deno.env.get('TELNYX_2FA_FROM') || FROM_DEFAULT)
  const profileId = String(Deno.env.get('TELNYX_MESSAGING_PROFILE_ID') || '').trim()
  if (!hookSecret || !telnyxKey || !from) {
    return json(500, 'Phone texts are not configured.')
  }

  let userPhone = ''
  let otp = ''
  try {
    const wh = new Webhook(hookSecret)
    const verified = wh.verify(payload, Object.fromEntries(req.headers)) as {
      user?: { phone?: string }
      sms?: { otp?: string }
    }
    userPhone = toE164(verified?.user?.phone)
    otp = String(verified?.sms?.otp || '').replace(/\D/g, '')
  } catch {
    return json(401, 'Invalid SMS hook signature.')
  }

  if (!userPhone || !/^\d{4,10}$/.test(otp)) {
    return json(400, 'Missing phone or code.')
  }
  const nanp = userPhone.startsWith('+1') && userPhone.length === 12
  if (!nanp && !profileId) {
    return json(500, 'Phone texts are not configured.')
  }

  const body: Record<string, string> = {
    from: nanp ? from : ALPHA_SENDER,
    to: userPhone,
    text: `Your EdgeTilt code is ${otp}.`,
  }
  if (profileId) body.messaging_profile_id = profileId

  const telnyxRes = await fetch('https://api.telnyx.com/v2/messages', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${telnyxKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const telnyxJson = await telnyxRes.json().catch(() => ({}))
  if (!telnyxRes.ok) {
    const errors = (telnyxJson as { errors?: Array<{ detail?: string; title?: string }> }).errors
    console.error('telnyx sms failed', telnyxRes.status, errors?.[0]?.title || '')
    return json(502, 'Could not send the text.')
  }

  return new Response(JSON.stringify({}), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
