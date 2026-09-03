import { useCallback, useEffect, useState } from 'react'
import {
  createCreatorFanPromoCode,
  deactivateCreatorFanPromoCode,
  listCreatorFanPromoCodes,
} from './creatorFanSubsApi.js'
import { CREATOR_FAN_PLATFORM_FEE_PERCENT } from './fanSubTiers.js'

/**
 * @param {{
 *   code?: string,
 *   discount_type?: string,
 *   percent_off?: number | null,
 *   amount_off_cents?: number | null,
 *   duration?: string,
 *   duration_in_months?: number | null,
 * }} row
 */
function formatDiscountLabel(row) {
  if (row.discount_type === 'percent') {
    return `${row.percent_off}% off`
  }
  const cents = Number(row.amount_off_cents) || 0
  return `$${(cents / 100).toFixed(2)} off`
}

/**
 * @param {{ duration?: string, duration_in_months?: number | null }} row
 */
function formatDurationLabel(row) {
  if (row.duration === 'forever') return 'every month'
  if (row.duration === 'repeating') {
    const n = Number(row.duration_in_months) || 0
    return n === 1 ? 'first month' : `first ${n} months`
  }
  return 'first month only'
}

/**
 * Creator self-serve promo codes for fan checkout.
 * Discount comes out of creator share; platform keeps CREATOR_FAN_PLATFORM_FEE_PERCENT of final price.
 *
 * @param {{
 *   supabaseClient: import('@supabase/supabase-js').SupabaseClient,
 *   connectComplete?: boolean,
 * }} props
 */
export default function CreatorFanPromoCodesPanel({ supabaseClient, connectComplete = false }) {
  const [codes, setCodes] = useState(/** @type {Array<Record<string, unknown>>} */ ([]))
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [statusMessage, setStatusMessage] = useState('')

  const [code, setCode] = useState('')
  const [discountType, setDiscountType] = useState(/** @type {'percent' | 'amount'} */ ('percent'))
  const [percentOff, setPercentOff] = useState('20')
  const [amountDollars, setAmountDollars] = useState('10')
  const [duration, setDuration] = useState(/** @type {'once' | 'forever' | 'repeating'} */ ('once'))
  const [durationMonths, setDurationMonths] = useState('3')
  const [maxRedemptions, setMaxRedemptions] = useState('')
  const [expiresAt, setExpiresAt] = useState('')

  const reload = useCallback(async () => {
    if (!supabaseClient) {
      setLoading(false)
      return
    }
    setError('')
    try {
      const rows = await listCreatorFanPromoCodes(supabaseClient)
      setCodes(rows)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load promo codes.')
    } finally {
      setLoading(false)
    }
  }, [supabaseClient])

  useEffect(() => {
    void reload()
  }, [reload])

  const onCreate = async () => {
    if (!supabaseClient || busy || !connectComplete) return
    setBusy(true)
    setError('')
    setStatusMessage('')
    try {
      /** @type {Record<string, unknown>} */
      const body = {
        code,
        discount_type: discountType,
        duration,
      }
      if (discountType === 'percent') {
        body.percent_off = Number(percentOff)
      } else {
        const dollars = Number(amountDollars)
        body.amount_off_cents = Math.round(dollars * 100)
      }
      if (duration === 'repeating') {
        body.duration_in_months = Number(durationMonths)
      }
      if (maxRedemptions.trim()) {
        body.max_redemptions = Number(maxRedemptions)
      }
      if (expiresAt.trim()) {
        body.expires_at = new Date(expiresAt).toISOString()
      }
      await createCreatorFanPromoCode(supabaseClient, body)
      setCode('')
      setMaxRedemptions('')
      setExpiresAt('')
      setStatusMessage('Promo code created. Fans can enter it at checkout.')
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create promo code.')
    } finally {
      setBusy(false)
    }
  }

  const onDeactivate = async (id) => {
    if (!supabaseClient || busy || !id) return
    setBusy(true)
    setError('')
    setStatusMessage('')
    try {
      await deactivateCreatorFanPromoCode(supabaseClient, String(id))
      setStatusMessage('Promo code deactivated.')
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not deactivate promo code.')
    } finally {
      setBusy(false)
    }
  }

  const activeCodes = codes.filter((c) => c.active !== false)
  const inactiveCodes = codes.filter((c) => c.active === false)

  return (
    <div className="rounded-xl border border-zinc-800/90 bg-zinc-900/40 p-3" data-creator-fan-promo-panel>
      <span className="block text-[14px] font-semibold text-zinc-200">Promo codes</span>
      <p className="mt-1 text-[12px] leading-snug text-zinc-500">
        {`Optional codes for fans at checkout. You eat the discount ... EdgeTilt still takes ${CREATOR_FAN_PLATFORM_FEE_PERCENT}% of what they actually pay.`}
      </p>

      {!connectComplete ? (
        <p className="mt-3 text-[12px] text-amber-200/90">Finish Stripe Connect before creating codes.</p>
      ) : null}

      {loading ? (
        <p className="mt-3 text-[13px] text-zinc-500">Loading…</p>
      ) : (
        <div className="mt-3 space-y-3">
          {activeCodes.length ? (
            <ul className="space-y-2">
              {activeCodes.map((row) => (
                <li
                  key={String(row.id)}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-700/80 bg-zinc-950/40 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="font-mono text-[13px] font-semibold text-zinc-100">{String(row.code)}</p>
                    <p className="text-[12px] text-zinc-500">
                      {formatDiscountLabel(row)} · {formatDurationLabel(row)}
                      {row.max_redemptions != null ? ` · max ${row.max_redemptions}` : ''}
                      {row.expires_at
                        ? ` · expires ${new Date(String(row.expires_at)).toLocaleDateString()}`
                        : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void onDeactivate(row.id)}
                    className="min-h-9 rounded-lg border border-zinc-700/90 px-3 text-[12px] font-semibold text-zinc-300 hover:bg-zinc-800/80 disabled:opacity-50"
                  >
                    Deactivate
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[12px] text-zinc-500">No active promo codes yet.</p>
          )}

          {inactiveCodes.length ? (
            <details className="text-[12px] text-zinc-500">
              <summary className="cursor-pointer select-none font-semibold text-zinc-400">
                Inactive ({inactiveCodes.length})
              </summary>
              <ul className="mt-2 space-y-1">
                {inactiveCodes.map((row) => (
                  <li key={String(row.id)} className="font-mono text-zinc-600">
                    {String(row.code)} · {formatDiscountLabel(row)}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}

          <div className="space-y-2 border-t border-zinc-800/80 pt-3">
            <label className="block">
              <span className="text-[12px] font-semibold text-zinc-400">New code</span>
              <input
                type="text"
                value={code}
                disabled={busy || !connectComplete}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="LAUNCH20"
                maxLength={32}
                className="mt-1 w-full rounded-lg border border-zinc-700/90 bg-zinc-950/60 px-3 py-2 font-mono text-[13px] text-zinc-100 outline-none focus:border-orange-500/70 disabled:opacity-50"
              />
            </label>

            <div className="flex flex-wrap gap-2">
              <label className="min-w-[8rem] flex-1">
                <span className="text-[12px] font-semibold text-zinc-400">Type</span>
                <select
                  value={discountType}
                  disabled={busy || !connectComplete}
                  onChange={(e) => setDiscountType(/** @type {'percent' | 'amount'} */ (e.target.value))}
                  className="mt-1 w-full rounded-lg border border-zinc-700/90 bg-zinc-950/60 px-3 py-2 text-[13px] text-zinc-100 outline-none disabled:opacity-50"
                >
                  <option value="percent">Percent off</option>
                  <option value="amount">Fixed $ off</option>
                </select>
              </label>
              {discountType === 'percent' ? (
                <label className="min-w-[6rem] flex-1">
                  <span className="text-[12px] font-semibold text-zinc-400">Percent</span>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    step={1}
                    value={percentOff}
                    disabled={busy || !connectComplete}
                    onChange={(e) => setPercentOff(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-700/90 bg-zinc-950/60 px-3 py-2 text-[13px] text-zinc-100 outline-none disabled:opacity-50"
                  />
                </label>
              ) : (
                <label className="min-w-[6rem] flex-1">
                  <span className="text-[12px] font-semibold text-zinc-400">Dollars off</span>
                  <input
                    type="number"
                    min={0.5}
                    step={0.5}
                    value={amountDollars}
                    disabled={busy || !connectComplete}
                    onChange={(e) => setAmountDollars(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-700/90 bg-zinc-950/60 px-3 py-2 text-[13px] text-zinc-100 outline-none disabled:opacity-50"
                  />
                </label>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <label className="min-w-[8rem] flex-1">
                <span className="text-[12px] font-semibold text-zinc-400">Applies</span>
                <select
                  value={duration}
                  disabled={busy || !connectComplete}
                  onChange={(e) =>
                    setDuration(/** @type {'once' | 'forever' | 'repeating'} */ (e.target.value))
                  }
                  className="mt-1 w-full rounded-lg border border-zinc-700/90 bg-zinc-950/60 px-3 py-2 text-[13px] text-zinc-100 outline-none disabled:opacity-50"
                >
                  <option value="once">First month only</option>
                  <option value="forever">Every month</option>
                  <option value="repeating">First N months</option>
                </select>
              </label>
              {duration === 'repeating' ? (
                <label className="min-w-[6rem] flex-1">
                  <span className="text-[12px] font-semibold text-zinc-400">Months</span>
                  <input
                    type="number"
                    min={1}
                    max={36}
                    value={durationMonths}
                    disabled={busy || !connectComplete}
                    onChange={(e) => setDurationMonths(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-700/90 bg-zinc-950/60 px-3 py-2 text-[13px] text-zinc-100 outline-none disabled:opacity-50"
                  />
                </label>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2">
              <label className="min-w-[6rem] flex-1">
                <span className="text-[12px] font-semibold text-zinc-400">Max uses (optional)</span>
                <input
                  type="number"
                  min={1}
                  value={maxRedemptions}
                  disabled={busy || !connectComplete}
                  onChange={(e) => setMaxRedemptions(e.target.value)}
                  placeholder="Unlimited"
                  className="mt-1 w-full rounded-lg border border-zinc-700/90 bg-zinc-950/60 px-3 py-2 text-[13px] text-zinc-100 outline-none disabled:opacity-50"
                />
              </label>
              <label className="min-w-[8rem] flex-1">
                <span className="text-[12px] font-semibold text-zinc-400">Expires (optional)</span>
                <input
                  type="date"
                  value={expiresAt}
                  disabled={busy || !connectComplete}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-700/90 bg-zinc-950/60 px-3 py-2 text-[13px] text-zinc-100 outline-none disabled:opacity-50"
                />
              </label>
            </div>

            <button
              type="button"
              disabled={busy || !connectComplete || !code.trim()}
              onClick={() => void onCreate()}
              className="min-h-10 rounded-lg border border-zinc-600/90 bg-zinc-800/80 px-4 text-[13px] font-semibold text-zinc-100 hover:bg-zinc-700/80 disabled:opacity-50"
            >
              {busy ? '…' : 'Create promo code'}
            </button>
          </div>
        </div>
      )}

      {statusMessage ? (
        <p className="mt-2 text-[12px] leading-snug text-cyan-200/90">{statusMessage}</p>
      ) : null}
      {error ? <p className="mt-2 text-[12px] leading-snug text-red-300/95">{error}</p> : null}
    </div>
  )
}
