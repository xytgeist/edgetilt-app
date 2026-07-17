/**
 * Email a copy of the affiliate tax attestation PDF (from private Storage) via Resend.
 */
import { billingCorsHeaders, jsonResponse } from '../_shared/billingCors.ts'
import { createBillingAdmin, getUserFromJwt } from '../_shared/billingDb.ts'

function requireResendApiKey(): string {
  const key = Deno.env.get('RESEND_API_KEY')?.trim()
  if (!key) throw new Error('RESEND_API_KEY is not configured.')
  return key
}

function fromAddress(): string {
  return (
    Deno.env.get('AFFILIATE_TAX_EMAIL_FROM')?.trim() ||
    Deno.env.get('RESEND_FROM')?.trim() ||
    'EdgeTilt <noreply@auth.edgetilt.com>'
  )
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: billingCorsHeaders })
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  try {
    const admin = createBillingAdmin()
    const auth = await getUserFromJwt(admin, req)
    if ('error' in auth) return jsonResponse({ error: auth.error }, auth.status)

    let body: { tax_email?: string; document_path?: string } = {}
    try {
      body = await req.json()
    } catch {
      return jsonResponse({ error: 'Invalid JSON body.' }, 400)
    }

    const taxEmail = String(body.tax_email || '')
      .trim()
      .toLowerCase()
    if (!isValidEmail(taxEmail)) {
      return jsonResponse({ error: 'A valid tax email is required.' }, 400)
    }

    const { data: affiliate, error: affErr } = await admin
      .from('affiliates')
      .select('id, display_name, status')
      .eq('user_id', auth.user.id)
      .eq('status', 'active')
      .maybeSingle()
    if (affErr) throw new Error(affErr.message)
    if (!affiliate) {
      return jsonResponse({ error: 'You are not linked as an active affiliate.' }, 403)
    }

    const { data: tax, error: taxErr } = await admin
      .from('affiliate_tax_profiles')
      .select('document_path, form_type, legal_name, tax_email, status')
      .eq('affiliate_id', affiliate.id)
      .maybeSingle()
    if (taxErr) throw new Error(taxErr.message)
    if (!tax?.document_path) {
      return jsonResponse({ error: 'No tax document on file to email.' }, 400)
    }

    const documentPath = String(body.document_path || tax.document_path).trim()
    if (!documentPath || documentPath !== tax.document_path) {
      return jsonResponse({ error: 'Tax document path mismatch.' }, 400)
    }
    if (!documentPath.startsWith(`${auth.user.id}/`)) {
      return jsonResponse({ error: 'Invalid tax document path.' }, 403)
    }

    const { data: fileBlob, error: dlErr } = await admin.storage
      .from('affiliate-tax-docs')
      .download(documentPath)
    if (dlErr || !fileBlob) {
      throw new Error(dlErr?.message || 'Could not download tax document.')
    }

    const bytes = new Uint8Array(await fileBlob.arrayBuffer())
    const formLabel = tax.form_type === 'w8' ? 'W-8' : 'W-9'
    const filename =
      documentPath.split('/').pop() || `affiliate-${formLabel.toLowerCase()}-attestation.pdf`

    const resendKey = requireResendApiKey()
    const html = `
      <p>Hi${tax.legal_name ? ` ${tax.legal_name}` : ''},</p>
      <p>Attached is a copy of your EdgeTilt affiliate ${formLabel} tax attestation.</p>
      <p>Keep this for your records. EdgeTilt does not e-file this form with the IRS from the app.</p>
      <p>— EdgeTilt Affiliates</p>
    `

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromAddress(),
        to: [taxEmail],
        subject: `Your EdgeTilt affiliate ${formLabel} tax form copy`,
        html,
        attachments: [
          {
            filename,
            content: bytesToBase64(bytes),
          },
        ],
      }),
    })

    const raw = await res.text()
    let parsed: { id?: string; message?: string; name?: string } = {}
    try {
      parsed = raw ? JSON.parse(raw) : {}
    } catch {
      // ignore
    }
    if (!res.ok) {
      const detail = parsed.message || parsed.name || raw || `Resend HTTP ${res.status}`
      throw new Error(`Email send failed: ${detail}`)
    }

    if (tax.tax_email !== taxEmail) {
      await admin
        .from('affiliate_tax_profiles')
        .update({ tax_email: taxEmail, updated_at: new Date().toISOString() })
        .eq('affiliate_id', affiliate.id)
    }

    return jsonResponse({ ok: true, email_id: parsed.id || null, to: taxEmail })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error('affiliate-tax-email:', message)
    return jsonResponse({ error: message }, 500)
  }
})
