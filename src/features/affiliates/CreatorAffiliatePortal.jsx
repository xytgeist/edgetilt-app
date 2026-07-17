import { useEffect, useState } from 'react'
import {
  emailAffiliateTaxDocument,
  formatCents,
  refreshAffiliateConnectStatus,
  startAffiliateConnectOnboarding,
  uploadAffiliateTaxDocument,
  upsertMyTaxProfile,
} from './affiliatePortalApi.js'
import { buildAffiliateTaxAttestationPdf, tinLast4FromFull } from './affiliateTaxPdf.js'

function moneyCard(label, cents) {
  return (
    <div className="rounded-2xl bg-zinc-950/80 border border-zinc-800 px-4 py-3">
      <div className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="text-white text-xl font-bold mt-1">{formatCents(cents)}</div>
    </div>
  )
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim())
}

export default function CreatorAffiliatePortal({
  supabaseClient,
  userId,
  accountEmail = '',
  portal,
  loading,
  error,
  onReload,
  onBack,
}) {
  const affiliate = portal?.affiliate
  const totals = portal?.totals
  const tax = portal?.tax || { status: 'incomplete' }
  const commissions = portal?.commissions || []

  const [form, setForm] = useState({
    form_type: 'w9',
    legal_name: '',
    business_name: '',
    tax_classification: '',
    address_line1: '',
    address_line2: '',
    city: '',
    region: '',
    postal_code: '',
    country: 'US',
    tin_full: '',
    foreign_tax_id: '',
    ftin_not_legally_required: false,
    signature_name: '',
    tax_email: '',
  })
  const [certified, setCertified] = useState(false)
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [localError, setLocalError] = useState('')
  const [notice, setNotice] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const pref =
      (tax?.tax_email && String(tax.tax_email).trim()) ||
      (accountEmail && String(accountEmail).trim()) ||
      ''
    if (!pref) return
    setForm((f) => (f.tax_email.trim() ? f : { ...f, tax_email: pref }))
  }, [accountEmail, tax?.tax_email])

  useEffect(() => {
    if (!tax || tax.status === 'incomplete') return
    setForm((f) => ({
      ...f,
      form_type: tax.form_type || 'w9',
      legal_name: tax.legal_name || '',
      business_name: tax.business_name || '',
      tax_classification: tax.tax_classification || '',
      address_line1: tax.address_line1 || '',
      address_line2: tax.address_line2 || '',
      city: tax.city || '',
      region: tax.region || '',
      postal_code: tax.postal_code || '',
      country: tax.country || 'US',
      tin_full: '',
      foreign_tax_id: tax.foreign_tax_id || '',
      ftin_not_legally_required: Boolean(tax.ftin_not_legally_required),
      signature_name: tax.signature_name || tax.legal_name || '',
      tax_email: tax.tax_email || accountEmail || f.tax_email || '',
    }))
    setCertified(false)
  }, [tax, accountEmail])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search || '')
    const connect = (params.get('connect') || '').trim()
    if (connect !== 'return' && connect !== 'refresh') return
    void (async () => {
      try {
        await refreshAffiliateConnectStatus(supabaseClient)
        await onReload?.()
        setNotice(connect === 'return' ? 'Connect onboarding returned. Status refreshed.' : 'Connect status refreshed.')
      } catch (e) {
        setLocalError(e instanceof Error ? e.message : String(e))
      }
      try {
        const u = new URL(window.location.href)
        u.searchParams.delete('connect')
        const qs = u.searchParams.toString()
        window.history.replaceState({}, '', `${u.pathname}${qs ? `?${qs}` : ''}${u.hash || ''}`)
      } catch {
        // ignore
      }
    })()
  }, [supabaseClient, onReload])

  if (loading && !portal) {
    return (
      <div className="text-zinc-400 text-sm py-8" data-affiliates-portal>
        Loading creator portal…
      </div>
    )
  }

  if (!affiliate) {
    return (
      <div className="rounded-3xl bg-zinc-900 p-5 space-y-3" data-affiliates-portal>
        <div className="text-white text-xl font-black">Creator portal</div>
        <div className="text-zinc-400 text-sm leading-relaxed">
          This account is not linked as an active affiliate. Ask an admin to set your{' '}
          <span className="text-zinc-200">handle</span> on an affiliate row and set status to active.
        </div>
        {error ? <div className="text-rose-300 text-sm">{error}</div> : null}
        {onBack ? (
          <button type="button" onClick={onBack} className="rounded-xl bg-zinc-800 px-3 py-2 text-sm text-zinc-200">
            Back
          </button>
        ) : null}
      </div>
    )
  }

  const shareUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/?ref=${affiliate.code}`
      : `https://edgetilt.com/?ref=${affiliate.code}`

  const setField = (key, value) => setForm((f) => ({ ...f, [key]: value }))

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setLocalError('Could not copy link.')
    }
  }

  const saveTax = async () => {
    setBusy(true)
    setLocalError('')
    setNotice('')
    try {
      const legalName = form.legal_name.trim()
      const signatureName = form.signature_name.trim() || legalName
      const taxEmail = form.tax_email.trim().toLowerCase()
      if (!legalName) throw new Error('Legal name is required.')
      if (!signatureName) throw new Error('Typed signature name is required.')
      if (!certified) throw new Error('Check the certification box to continue.')
      if (!isValidEmail(taxEmail)) throw new Error('A valid email is required for your form copy.')

      const ftinNotRequired = Boolean(form.ftin_not_legally_required)
      const tinFull = form.tin_full.trim()
      const tinLast4 = tinLast4FromFull(tinFull)
      if (!ftinNotRequired && tinFull.length < 4) {
        throw new Error('Enter your full TIN (SSN / EIN / Foreign-TIN), or check FTIN Not Legally Required.')
      }
      if (!ftinNotRequired && tinLast4.length < 4) {
        throw new Error('Could not derive TIN last 4 from the full TIN.')
      }
      if (!userId) throw new Error('Sign in required to save tax profile.')

      const attestedAtIso = new Date().toISOString()
      let document_path = tax.document_path || null
      if (file) {
        document_path = await uploadAffiliateTaxDocument(supabaseClient, file, userId)
      } else {
        const pdfBlob = await buildAffiliateTaxAttestationPdf({
          formType: form.form_type,
          legalName,
          businessName: form.business_name,
          taxClassification: form.tax_classification,
          addressLine1: form.address_line1,
          city: form.city,
          region: form.region,
          postalCode: form.postal_code,
          country: form.country,
          tinFull: ftinNotRequired ? '' : tinFull,
          tinLast4: ftinNotRequired ? '' : tinLast4,
          ftinNotLegallyRequired: ftinNotRequired,
          signatureName,
          attestedAtIso,
        })
        const formLabel = form.form_type === 'w8' ? 'w8' : 'w9'
        document_path = await uploadAffiliateTaxDocument(
          supabaseClient,
          pdfBlob,
          userId,
          `affiliate-${formLabel}-attestation.pdf`,
        )
      }

      await upsertMyTaxProfile(supabaseClient, {
        form_type: form.form_type,
        legal_name: legalName,
        business_name: form.business_name,
        tax_classification: form.tax_classification,
        address_line1: form.address_line1,
        address_line2: form.address_line2,
        city: form.city,
        region: form.region,
        postal_code: form.postal_code,
        country: form.country,
        tin_last4: ftinNotRequired ? '' : tinLast4,
        foreign_tax_id: '',
        ftin_not_legally_required: ftinNotRequired,
        signature_name: signatureName,
        tax_email: taxEmail,
        certified: true,
        document_path,
      })
      setFile(null)
      setForm((f) => ({ ...f, tin_full: '', signature_name: signatureName, tax_email: taxEmail }))
      setCertified(false)

      let emailNote = ''
      try {
        await emailAffiliateTaxDocument(supabaseClient, {
          tax_email: taxEmail,
          document_path,
        })
        emailNote = ` A copy was emailed to ${taxEmail}.`
      } catch (emailErr) {
        emailNote = ` Saved, but email failed: ${
          emailErr instanceof Error ? emailErr.message : String(emailErr)
        }`
      }

      setNotice(
        (file
          ? 'Tax profile saved with your uploaded document.'
          : 'Tax profile saved. Generated attestation PDF stored for year-end prep.') + emailNote,
      )
      await onReload?.()
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const resendTaxEmail = async () => {
    setBusy(true)
    setLocalError('')
    setNotice('')
    try {
      const taxEmail = form.tax_email.trim().toLowerCase()
      if (!isValidEmail(taxEmail)) throw new Error('A valid email is required.')
      if (!tax.document_path) throw new Error('No tax document on file yet.')
      await emailAffiliateTaxDocument(supabaseClient, {
        tax_email: taxEmail,
        document_path: tax.document_path,
      })
      setNotice(`Tax form copy emailed to ${taxEmail}.`)
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const startConnect = async () => {
    setBusy(true)
    setLocalError('')
    try {
      const res = await startAffiliateConnectOnboarding(supabaseClient)
      if (res?.url) {
        window.location.assign(res.url)
        return
      }
      setLocalError('Connect onboarding URL missing.')
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6" data-affiliates-portal>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-white text-2xl font-black tracking-tight">Creator portal</div>
          <div className="text-zinc-400 text-sm mt-0.5">
            {affiliate.display_name} · {affiliate.package_name} ({affiliate.commission_pct_monthly}% monthly)
          </div>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onReload?.()}
            className="rounded-xl bg-zinc-800 px-3 py-2 text-sm text-zinc-200"
            disabled={busy}
          >
            Refresh
          </button>
          {onBack ? (
            <button type="button" onClick={onBack} className="rounded-xl bg-zinc-800 px-3 py-2 text-sm text-zinc-200">
              Back
            </button>
          ) : null}
        </div>
      </div>

      {(error || localError) && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {localError || error}
        </div>
      )}
      {notice ? (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          {notice}
        </div>
      ) : null}

      <section className="rounded-3xl bg-zinc-900 p-5 space-y-3">
        <div className="text-white font-bold">Your link</div>
        <div className="rounded-2xl bg-zinc-950 border border-zinc-800 px-4 py-3 text-sm text-zinc-200 break-all">
          {shareUrl}
        </div>
        <div className="text-sm text-zinc-400">
          Promo code: <span className="text-white font-semibold">{affiliate.promo_code || '...'}</span>
        </div>
        <button
          type="button"
          onClick={() => void copyLink()}
          className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-zinc-950"
        >
          {copied ? 'Copied' : 'Copy link'}
        </button>
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {moneyCard('Pending', totals?.pending_cents)}
        {moneyCard('Payable', totals?.payable_cents)}
        {moneyCard('Paid', totals?.paid_cents)}
        {moneyCard('YTD paid', totals?.ytd_paid_cents)}
      </section>

      <section className="rounded-3xl bg-zinc-900 p-5 space-y-3">
        <div className="text-white font-bold">Payouts (Stripe Connect)</div>
        <div className="text-sm text-zinc-400">
          {affiliate.connect_onboarding_complete
            ? 'Connect is ready. Admins can transfer payable commissions to you.'
            : 'Optional autopay: finish Stripe Connect Express onboarding. Manual payouts still work.'}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void startConnect()}
            className="rounded-xl bg-sky-500 px-4 py-2 text-sm font-semibold text-zinc-950 disabled:opacity-50"
          >
            {affiliate.stripe_connect_account_id ? 'Continue Connect setup' : 'Set up Connect'}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void refreshAffiliateConnectStatus(supabaseClient)
                .then(() => onReload?.())
                .catch((e) => setLocalError(e instanceof Error ? e.message : String(e)))
            }
            className="rounded-xl bg-zinc-800 px-4 py-2 text-sm text-zinc-200"
          >
            Refresh Connect status
          </button>
        </div>
      </section>

      <section className="rounded-3xl bg-zinc-900 p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-white font-bold">Tax profile (W-9 / W-8)</div>
          <div className="text-xs text-zinc-500 uppercase tracking-wide">status: {tax.status || 'incomplete'}</div>
        </div>
        <div className="text-sm text-zinc-400">
          Fill this out and we generate a substitute W-9/W-8 PDF with your typed signature. Full TIN goes on
          the PDF only; we store last 4 in the database. Edge does not e-file with the IRS from the app.
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs text-zinc-400">
            Form
            <select
              className="mt-1 w-full rounded-xl bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm text-white"
              value={form.form_type}
              onChange={(e) => setField('form_type', e.target.value)}
            >
              <option value="w9">W-9 (US)</option>
              <option value="w8">W-8 (non-US)</option>
            </select>
          </label>
          <label className="block text-xs text-zinc-400">
            Legal name (person or entity name on your tax return)
            <input
              className="mt-1 w-full rounded-xl bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm text-white"
              value={form.legal_name}
              onChange={(e) => {
                const v = e.target.value
                setForm((f) => ({
                  ...f,
                  legal_name: v,
                  signature_name: f.signature_name.trim() ? f.signature_name : v,
                }))
              }}
            />
          </label>
          <label className="block text-xs text-zinc-400">
            Business name
            <input
              className="mt-1 w-full rounded-xl bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm text-white"
              value={form.business_name}
              onChange={(e) => setField('business_name', e.target.value)}
            />
          </label>
          <label className="block text-xs text-zinc-400">
            Classification
            <input
              className="mt-1 w-full rounded-xl bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm text-white"
              value={form.tax_classification}
              onChange={(e) => setField('tax_classification', e.target.value)}
              placeholder="Individual / LLC / …"
            />
          </label>
          <label className="block text-xs text-zinc-400 sm:col-span-2">
            Address
            <input
              className="mt-1 w-full rounded-xl bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm text-white"
              value={form.address_line1}
              onChange={(e) => setField('address_line1', e.target.value)}
            />
          </label>
          <label className="block text-xs text-zinc-400">
            City
            <input
              className="mt-1 w-full rounded-xl bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm text-white"
              value={form.city}
              onChange={(e) => setField('city', e.target.value)}
            />
          </label>
          <label className="block text-xs text-zinc-400">
            State / region
            <input
              className="mt-1 w-full rounded-xl bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm text-white"
              value={form.region}
              onChange={(e) => setField('region', e.target.value)}
            />
          </label>
          <label className="block text-xs text-zinc-400">
            Postal code
            <input
              className="mt-1 w-full rounded-xl bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm text-white"
              value={form.postal_code}
              onChange={(e) => setField('postal_code', e.target.value)}
            />
          </label>
          <label className="block text-xs text-zinc-400">
            Country
            <input
              className="mt-1 w-full rounded-xl bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm text-white"
              value={form.country}
              onChange={(e) => setField('country', e.target.value)}
            />
          </label>
          <div className="sm:col-span-2 space-y-1">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <span className="text-xs text-zinc-400">Full TIN (SSN / EIN / Foreign-TIN)</span>
              <label className="inline-flex items-center gap-2 text-xs text-zinc-300">
                <input
                  type="checkbox"
                  checked={form.ftin_not_legally_required}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      ftin_not_legally_required: e.target.checked,
                      tin_full: e.target.checked ? '' : f.tin_full,
                    }))
                  }
                />
                <span>FTIN Not Legally Required</span>
              </label>
            </div>
            <input
              className="w-full rounded-xl bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm text-white"
              value={form.tin_full}
              onChange={(e) => {
                const tin_full = e.target.value
                setForm((f) => ({
                  ...f,
                  tin_full,
                  ftin_not_legally_required: false,
                }))
              }}
              disabled={form.ftin_not_legally_required}
              autoComplete="off"
              placeholder={form.ftin_not_legally_required ? 'Not required' : 'Written to generated PDF only'}
            />
            <div className="text-[11px] text-zinc-500">
              Full number is written to your generated PDF only. We store last 4 in the database.
            </div>
          </div>
          <label className="block text-xs text-zinc-400 sm:col-span-2">
            Email for form copy
            <input
              type="email"
              className="mt-1 w-full rounded-xl bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm text-white"
              value={form.tax_email}
              onChange={(e) => setField('tax_email', e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              required
            />
            <div className="mt-1 text-[11px] text-zinc-500">
              Prefills from your account email. Change it if you want the PDF copy somewhere else.
            </div>
          </label>
          <label className="block text-xs text-zinc-400 sm:col-span-2">
            Typed signature (legal name)
            <input
              className="mt-1 w-full rounded-xl bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm text-white"
              value={form.signature_name}
              onChange={(e) => setField('signature_name', e.target.value)}
              placeholder="Type your full legal name"
            />
          </label>
          <label className="flex items-start gap-2 text-xs text-zinc-300 sm:col-span-2">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={certified}
              onChange={(e) => setCertified(e.target.checked)}
            />
            <span>
              I certify under penalties of perjury that the information on this form is true, correct, and
              complete, and that my typed name is my electronic signature.
            </span>
          </label>
          <label className="block text-xs text-zinc-400 sm:col-span-2">
            Upload your own signed form instead (optional PDF/image)
            <input
              type="file"
              accept="image/*,.pdf,application/pdf"
              className="mt-1 block w-full text-sm text-zinc-300"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
            <div className="mt-1 text-[11px] text-zinc-500">
              If you upload a file, we use that instead of generating a PDF.
            </div>
          </label>
        </div>
        {tax.document_path ? (
          <div className="text-xs text-zinc-500">Saved tax document on file (private storage).</div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy || !form.legal_name.trim() || !certified || !isValidEmail(form.tax_email)}
            onClick={() => void saveTax()}
            className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-zinc-950 disabled:opacity-50"
          >
            {file ? 'Save & email copy' : 'Generate PDF, save & email'}
          </button>
          {tax.document_path ? (
            <button
              type="button"
              disabled={busy || !isValidEmail(form.tax_email)}
              onClick={() => void resendTaxEmail()}
              className="rounded-xl bg-zinc-800 px-4 py-2 text-sm text-zinc-200 disabled:opacity-50"
            >
              Resend email copy
            </button>
          ) : null}
        </div>
      </section>

      <section className="rounded-3xl bg-zinc-900 p-5">
        <div className="text-white font-bold mb-3">Recent commissions</div>
        {!commissions.length ? (
          <div className="text-zinc-500 text-sm">No commissions yet.</div>
        ) : (
          <div className="space-y-2">
            {commissions.map((c) => (
              <div
                key={c.id}
                className="rounded-2xl bg-zinc-950/70 border border-zinc-800 px-4 py-3 flex flex-wrap justify-between gap-2"
              >
                <div>
                  <div className="text-white text-sm font-semibold">
                    {formatCents(c.commission_cents)}{' '}
                    <span className="text-zinc-500 font-normal">({c.commission_pct}%)</span>
                  </div>
                  <div className="text-xs text-zinc-500">
                    {c.product_slug}
                    {c.price_interval ? ` / ${c.price_interval}` : ''} · net {formatCents(c.net_cents)}
                  </div>
                </div>
                <div className="text-xs text-zinc-400 uppercase tracking-wide">{c.status}</div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
