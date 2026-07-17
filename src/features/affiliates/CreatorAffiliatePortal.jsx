import { useEffect, useState } from 'react'
import {
  formatCents,
  refreshAffiliateConnectStatus,
  startAffiliateConnectOnboarding,
  uploadAffiliateTaxDocument,
  upsertMyTaxProfile,
} from './affiliatePortalApi.js'

function moneyCard(label, cents) {
  return (
    <div className="rounded-2xl bg-zinc-950/80 border border-zinc-800 px-4 py-3">
      <div className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="text-white text-xl font-bold mt-1">{formatCents(cents)}</div>
    </div>
  )
}

export default function CreatorAffiliatePortal({
  supabaseClient,
  userId,
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
    tin_last4: '',
    foreign_tax_id: '',
  })
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [localError, setLocalError] = useState('')
  const [notice, setNotice] = useState('')
  const [copied, setCopied] = useState(false)

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
      tin_last4: tax.tin_last4 || '',
      foreign_tax_id: tax.foreign_tax_id || '',
    }))
  }, [tax])

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
    return <div className="text-zinc-400 text-sm py-8">Loading creator portal…</div>
  }

  if (!affiliate) {
    return (
      <div className="rounded-3xl bg-zinc-900 p-5 space-y-3">
        <div className="text-white text-xl font-black">Creator portal</div>
        <div className="text-zinc-400 text-sm leading-relaxed">
          This account is not linked as an active affiliate. Ask an admin to set your{' '}
          <span className="text-zinc-200">user_id</span> on an affiliate row and set status to active.
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
      let document_path = tax.document_path || null
      if (file && userId) {
        document_path = await uploadAffiliateTaxDocument(supabaseClient, file, userId)
      }
      await upsertMyTaxProfile(supabaseClient, {
        ...form,
        document_path,
      })
      setFile(null)
      setNotice('Tax profile saved.')
      await onReload?.()
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
    <div className="space-y-6">
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
          We store this for year-end 1099 prep. Edge does not e-file with the IRS from the app.
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
            Legal name
            <input
              className="mt-1 w-full rounded-xl bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm text-white"
              value={form.legal_name}
              onChange={(e) => setField('legal_name', e.target.value)}
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
          {form.form_type === 'w9' ? (
            <label className="block text-xs text-zinc-400">
              TIN last 4
              <input
                className="mt-1 w-full rounded-xl bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm text-white"
                value={form.tin_last4}
                onChange={(e) => setField('tin_last4', e.target.value.slice(0, 4))}
                inputMode="numeric"
                maxLength={4}
              />
            </label>
          ) : (
            <label className="block text-xs text-zinc-400">
              Foreign tax id
              <input
                className="mt-1 w-full rounded-xl bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm text-white"
                value={form.foreign_tax_id}
                onChange={(e) => setField('foreign_tax_id', e.target.value)}
              />
            </label>
          )}
          <label className="block text-xs text-zinc-400 sm:col-span-2">
            Upload signed form (optional PDF/image)
            <input
              type="file"
              accept="image/*,.pdf,application/pdf"
              className="mt-1 block w-full text-sm text-zinc-300"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </label>
        </div>
        <button
          type="button"
          disabled={busy || !form.legal_name.trim()}
          onClick={() => void saveTax()}
          className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-zinc-950 disabled:opacity-50"
        >
          Save tax profile
        </button>
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
