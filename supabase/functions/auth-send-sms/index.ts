import { Webhook } from 'npm:standardwebhooks@1.0.0'

/**
 * Supabase Auth Send SMS hook. Supabase makes the code. We only deliver it.
 * US and Canada use the approved 2FA number. Other countries use the name
 * EdgeTilt on the OTP messaging profile. Do not call Telnyx Verify here.
 */

const FROM_DEFAULT = '+14803934143'
const ALPHA_SENDER = 'EdgeTilt'

/**
 * Auth only reads the error body on HTTP 200. Any other status shows the user
 * "Unexpected status code returned from hook: N", so the real code rides in http_code.
 */
function json(status: number, message: string) {
  return new Response(JSON.stringify({ error: { http_code: status, message } }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** Telnyx 40300 = the number texted STOP to our sender. */
function telnyxFailureMessage(code: string) {
  if (code === '40300') {
    return 'This number opted out of EdgeTilt texts. Text START to +1 480-393-4143, then try again.'
  }
  return "We couldn't text that number. Make sure it can receive texts (landlines and some internet numbers can't)."
}

function toE164(raw: unknown) {
  const s = String(raw || '').trim()
  const digits = s.replace(/\D/g, '')
  if (digits.length < 8 || digits.length > 15) return ''
  if (s.startsWith('+')) return `+${digits}`
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  // GoTrue sends sms.phone as digits only, no plus.
  return `+${digits}`
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
      user?: { phone?: string; new_phone?: string }
      sms?: { otp?: string; phone?: string }
    }
    // Phone change keeps the old number on user.phone. The number to text is sms.phone.
    userPhone =
      toE164(verified?.sms?.phone) ||
      toE164(verified?.user?.new_phone) ||
      toE164(verified?.user?.phone)
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
    const errors = (telnyxJson as { errors?: Array<{ code?: string; detail?: string; title?: string }> }).errors
    const code = String(errors?.[0]?.code || '')
    console.error('telnyx sms failed', telnyxRes.status, code, errors?.[0]?.title || '', errors?.[0]?.detail || '')
    return json(422, telnyxFailureMessage(code))
  }

  return new Response(JSON.stringify({}), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
