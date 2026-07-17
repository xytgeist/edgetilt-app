import { useMemo, useState } from 'react'
import {
  adminPayCommissionsViaConnect,
  commissionsToCsv,
  formatCents,
  markCommissionsPaid,
  upsertAffiliate,
} from './affiliatePortalApi.js'

const emptyForm = {
  id: '',
  code: '',
  promo_code: '',
  stripe_coupon_id: '',
  stripe_promotion_code_id: '',
  package_slug: 'creator',
  display_name: '',
  contact_email: '',
  linked_handle: '',
  status: 'invited',
  payout_notes: '',
}

function StatusPill({ status }) {
  const tone =
    status === 'paid'
      ? 'bg-emerald-500/15 text-emerald-300'
      : status === 'payable'
        ? 'bg-amber-500/15 text-amber-200'
        : status === 'void'
          ? 'bg-rose-500/15 text-rose-300'
          : status === 'active'
            ? 'bg-sky-500/15 text-sky-200'
            : 'bg-zinc-700/60 text-zinc-300'
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${tone}`}>
      {status}
    </span>
  )
}

export default function AffiliateAdminPortal({
  supabaseClient,
  snapshot,
  loading,
  error,
  onReload,
  onBack,
}) {
  const packages = snapshot?.packages || []
  const affiliates = snapshot?.affiliates || []
  const commissions = snapshot?.commissions || []
  const [form, setForm] = useState(emptyForm)
  const [statusFilter, setStatusFilter] = useState('payable')
  const [selected, setSelected] = useState(() => new Set())
  const [payoutRef, setPayoutRef] = useState('')
  const [busy, setBusy] = useState(false)
  const [localError, setLocalError] = useState('')
  const [notice, setNotice] = useState('')

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return commissions
    return commissions.filter((c) => c.status === statusFilter)
  }, [commissions, statusFilter])

  const setField = (key, value) => setForm((f) => ({ ...f, [key]: value }))

  const editAffiliate = (a) => {
    setForm({
      id: a.id || '',
      code: a.code || '',
      promo_code: a.promo_code || '',
      stripe_coupon_id: a.stripe_coupon_id || '',
      stripe_promotion_code_id: a.stripe_promotion_code_id || '',
      package_slug: a.package_slug || 'creator',
      display_name: a.display_name || '',
      contact_email: a.contact_email || '',
      linked_handle: a.linked_handle || '',
      status: a.status || 'invited',
      payout_notes: a.payout_notes || '',
    })
    setNotice('')
    setLocalError('')
  }

  const saveAffiliate = async () => {
    setBusy(true)
    setLocalError('')
    setNotice('')
    try {
      const payload = {
        ...(form.id ? { id: form.id } : {}),
        code: form.code.trim().toLowerCase(),
        promo_code: form.promo_code.trim() || null,
        stripe_coupon_id: form.stripe_coupon_id.trim() || null,
        stripe_promotion_code_id: form.stripe_promotion_code_id.trim() || null,
        package_slug: form.package_slug,
        display_name: form.display_name.trim() || form.code.trim(),
        contact_email: form.contact_email.trim() || null,
        linked_handle: form.linked_handle.trim().replace(/^@+/, '') || null,
        status: form.status,
        payout_notes: form.payout_notes.trim() || null,
      }
      await upsertAffiliate(supabaseClient, payload)
      setNotice(form.id ? 'Affiliate updated.' : 'Affiliate created.')
      setForm(emptyForm)
      await onReload?.()
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const toggleId = (id) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectFilteredPayable = () => {
    const next = new Set()
    for (const c of filtered) {
      if (c.status === 'payable') next.add(c.id)
    }
    setSelected(next)
  }

  const runMarkPaid = async () => {
    const ids = [...selected]
    if (!ids.length) return
    setBusy(true)
    setLocalError('')
    setNotice('')
    try {
      const n = await markCommissionsPaid(supabaseClient, ids, payoutRef.trim() || null)
      setNotice(`Marked ${n} commission(s) paid.`)
      setSelected(new Set())
      setPayoutRef('')
      await onReload?.()
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const runConnectPay = async () => {
    const ids = [...selected]
    if (!ids.length) return
    setBusy(true)
    setLocalError('')
    setNotice('')
    try {
      const res = await adminPayCommissionsViaConnect(supabaseClient, ids)
      const paid = (res?.results || []).reduce((sum, r) => sum + (Number(r.paid) || 0), 0)
      const errs = (res?.results || []).filter((r) => r.error).map((r) => r.error)
      setNotice(`Connect paid ${paid} row(s).${errs.length ? ` Issues: ${errs.join('; ')}` : ''}`)
      setSelected(new Set())
      await onReload?.()
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const downloadCsv = () => {
    const blob = new Blob([commissionsToCsv(filtered)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `affiliate-commissions-${statusFilter}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6" data-affiliates-portal>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-white text-2xl font-black tracking-tight">Affiliates</div>
          <div className="text-zinc-400 text-sm mt-0.5">
            Invite creators, paste Stripe promo ids, mark commissions paid.
            {snapshot?.hold_days != null ? ` Hold ${snapshot.hold_days} days.` : ''}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onReload?.()}
            className="rounded-xl bg-zinc-800 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-700"
            disabled={busy || loading}
          >
            Refresh
          </button>
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="rounded-xl bg-zinc-800 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-700"
            >
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

      <section className="rounded-3xl bg-zinc-900 p-5 space-y-4">
        <div className="text-white font-bold">{form.id ? 'Edit affiliate' : 'Create affiliate'}</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs text-zinc-400">
            Code (ref)
            <input
              className="mt-1 w-full rounded-xl bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm text-white"
              value={form.code}
              onChange={(e) => setField('code', e.target.value)}
              placeholder="scott"
            />
          </label>
          <label className="block text-xs text-zinc-400">
            Display name
            <input
              className="mt-1 w-full rounded-xl bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm text-white"
              value={form.display_name}
              onChange={(e) => setField('display_name', e.target.value)}
            />
          </label>
          <label className="block text-xs text-zinc-400">
            Promo code string
            <input
              className="mt-1 w-full rounded-xl bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm text-white"
              value={form.promo_code}
              onChange={(e) => setField('promo_code', e.target.value)}
              placeholder="SCOTT20"
            />
          </label>
          <label className="block text-xs text-zinc-400">
            Package
            <select
              className="mt-1 w-full rounded-xl bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm text-white"
              value={form.package_slug}
              onChange={(e) => setField('package_slug', e.target.value)}
            >
              {(packages.length ? packages : [{ slug: 'creator' }, { slug: 'mid' }, { slug: 'elite' }]).map(
                (p) => (
                  <option key={p.slug} value={p.slug}>
                    {p.display_name || p.slug}
                    {p.commission_pct_monthly != null ? ` (${p.commission_pct_monthly}%)` : ''}
                  </option>
                ),
              )}
            </select>
          </label>
          <label className="block text-xs text-zinc-400">
            Stripe promotion_code id
            <input
              className="mt-1 w-full rounded-xl bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm text-white"
              value={form.stripe_promotion_code_id}
              onChange={(e) => setField('stripe_promotion_code_id', e.target.value)}
              placeholder="promo_..."
            />
          </label>
          <label className="block text-xs text-zinc-400">
            Stripe coupon id
            <input
              className="mt-1 w-full rounded-xl bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm text-white"
              value={form.stripe_coupon_id}
              onChange={(e) => setField('stripe_coupon_id', e.target.value)}
              placeholder="coupon_..."
            />
          </label>
          <label className="block text-xs text-zinc-400">
            Linked handle
            <input
              className="mt-1 w-full rounded-xl bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm text-white"
              value={form.linked_handle}
              onChange={(e) => setField('linked_handle', e.target.value)}
              placeholder="edgelord"
            />
          </label>
          <label className="block text-xs text-zinc-400">
            Status
            <select
              className="mt-1 w-full rounded-xl bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm text-white"
              value={form.status}
              onChange={(e) => setField('status', e.target.value)}
            >
              <option value="invited">invited</option>
              <option value="active">active</option>
              <option value="disabled">disabled</option>
            </select>
          </label>
          <label className="block text-xs text-zinc-400 sm:col-span-2">
            Contact email
            <input
              className="mt-1 w-full rounded-xl bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm text-white"
              value={form.contact_email}
              onChange={(e) => setField('contact_email', e.target.value)}
            />
          </label>
          <label className="block text-xs text-zinc-400 sm:col-span-2">
            Payout notes
            <input
              className="mt-1 w-full rounded-xl bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm text-white"
              value={form.payout_notes}
              onChange={(e) => setField('payout_notes', e.target.value)}
              placeholder="Wise / PayPal handle"
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy || !form.code.trim()}
            onClick={() => void saveAffiliate()}
            className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-zinc-950 disabled:opacity-50"
          >
            {form.id ? 'Save changes' : 'Create'}
          </button>
          {form.id ? (
            <button
              type="button"
              onClick={() => setForm(emptyForm)}
              className="rounded-xl bg-zinc-800 px-4 py-2 text-sm text-zinc-200"
            >
              Clear form
            </button>
          ) : null}
        </div>
      </section>

      <section className="rounded-3xl bg-zinc-900 p-5">
        <div className="text-white font-bold mb-3">Creators</div>
        {loading && !affiliates.length ? (
          <div className="text-zinc-500 text-sm">Loading…</div>
        ) : !affiliates.length ? (
          <div className="text-zinc-500 text-sm">No affiliates yet.</div>
        ) : (
          <div className="space-y-2">
            {affiliates.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => editAffiliate(a)}
                className="w-full text-left rounded-2xl bg-zinc-950/70 border border-zinc-800 px-4 py-3 hover:border-zinc-600"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-white font-semibold">
                    {a.display_name}{' '}
                    <span className="text-zinc-500 font-normal">/?ref={a.code}</span>
                  </div>
                  <StatusPill status={a.status} />
                </div>
                <div className="mt-1 text-xs text-zinc-400 flex flex-wrap gap-x-3 gap-y-1">
                  <span>{a.package_slug}</span>
                  {a.linked_handle ? <span>@{a.linked_handle}</span> : <span>no linked handle</span>}
                  <span>tax: {a.tax_status}</span>
                  <span>pending {formatCents(a.pending_cents)}</span>
                  <span>payable {formatCents(a.payable_cents)}</span>
                  <span>paid {formatCents(a.paid_cents)}</span>
                  {a.connect_onboarding_complete ? <span className="text-emerald-300">Connect ready</span> : null}
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-3xl bg-zinc-900 p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-white font-bold">Commissions</div>
          <div className="flex flex-wrap gap-2">
            <select
              className="rounded-xl bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm text-white"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="payable">payable</option>
              <option value="pending">pending</option>
              <option value="paid">paid</option>
              <option value="void">void</option>
              <option value="all">all</option>
            </select>
            <button
              type="button"
              onClick={selectFilteredPayable}
              className="rounded-xl bg-zinc-800 px-3 py-2 text-sm text-zinc-200"
            >
              Select payable
            </button>
            <button
              type="button"
              onClick={downloadCsv}
              className="rounded-xl bg-zinc-800 px-3 py-2 text-sm text-zinc-200"
            >
              CSV
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 items-end">
          <label className="block text-xs text-zinc-400 grow min-w-[12rem]">
            Payout ref (manual)
            <input
              className="mt-1 w-full rounded-xl bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm text-white"
              value={payoutRef}
              onChange={(e) => setPayoutRef(e.target.value)}
              placeholder="Wise transfer #…"
            />
          </label>
          <button
            type="button"
            disabled={busy || selected.size === 0}
            onClick={() => void runMarkPaid()}
            className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-zinc-950 disabled:opacity-50"
          >
            Mark paid ({selected.size})
          </button>
          <button
            type="button"
            disabled={busy || selected.size === 0}
            onClick={() => void runConnectPay()}
            className="rounded-xl bg-sky-500 px-4 py-2 text-sm font-semibold text-zinc-950 disabled:opacity-50"
          >
            Pay via Connect
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-xs text-zinc-300">
            <thead className="text-zinc-500 uppercase tracking-wide">
              <tr>
                <th className="py-2 pr-2" />
                <th className="py-2 pr-3">Creator</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Net</th>
                <th className="py-2 pr-3">Commission</th>
                <th className="py-2 pr-3">Product</th>
                <th className="py-2">When</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} className="border-t border-zinc-800">
                  <td className="py-2 pr-2">
                    <input
                      type="checkbox"
                      checked={selected.has(c.id)}
                      disabled={c.status !== 'payable'}
                      onChange={() => toggleId(c.id)}
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <div className="text-white">{c.affiliate_name}</div>
                    <div className="text-zinc-500">{c.affiliate_code}</div>
                  </td>
                  <td className="py-2 pr-3">
                    <StatusPill status={c.status} />
                    {c.clawback_flag ? (
                      <div className="text-rose-300 mt-1">clawback</div>
                    ) : null}
                  </td>
                  <td className="py-2 pr-3">{formatCents(c.net_cents)}</td>
                  <td className="py-2 pr-3">
                    {formatCents(c.commission_cents)}{' '}
                    <span className="text-zinc-500">({c.commission_pct}%)</span>
                  </td>
                  <td className="py-2 pr-3">
                    {c.product_slug}
                    {c.price_interval ? ` / ${c.price_interval}` : ''}
                  </td>
                  <td className="py-2 text-zinc-500">
                    {c.created_at ? new Date(c.created_at).toLocaleString() : '...'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!filtered.length ? (
            <div className="text-zinc-500 text-sm py-4">No commissions for this filter.</div>
          ) : null}
        </div>
      </section>
    </div>
  )
}
