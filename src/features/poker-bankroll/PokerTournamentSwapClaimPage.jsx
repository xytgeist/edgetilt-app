import { useEffect, useMemo, useState } from 'react'
import { fmtPoker$ } from './pokerBankrollMath.js'
import { formatSwapIouLine } from './pokerTournamentSwapMath.js'

/**
 * Public guest claim page: /poker-swap-claim?token=…
 *
 * @param {{
 *   supabaseClient: import('@supabase/supabase-js').SupabaseClient | null,
 *   token: string,
 *   onDone?: () => void,
 * }} props
 */
export default function PokerTournamentSwapClaimPage({ supabaseClient, token, onDone }) {
  const [loading, setLoading] = useState(true)
  const [preview, setPreview] = useState(null)
  const [error, setError] = useState('')
  const [buyIn, setBuyIn] = useState('')
  const [prize, setPrize] = useState('')
  const [markPaid, setMarkPaid] = useState(false)
  const [saving, setSaving] = useState(false)
  const [doneMsg, setDoneMsg] = useState('')

  useEffect(() => {
    if (!supabaseClient || !token) {
      setLoading(false)
      setError('Missing claim link.')
      return undefined
    }
    let cancelled = false
    setLoading(true)
    setError('')
    void supabaseClient
      .rpc('poker_tournament_swap_claim_preview', { p_token: token })
      .then(({ data, error: err }) => {
        if (cancelled) return
        if (err) {
          setError(err.message || 'Invalid or expired claim link.')
          setPreview(null)
        } else {
          setPreview(data)
          if (data?.counterparty_buy_in != null) setBuyIn(String(data.counterparty_buy_in))
          if (data?.counterparty_prize != null) setPrize(String(data.counterparty_prize))
        }
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [supabaseClient, token])

  const settlementHint = useMemo(() => {
    if (!preview || preview.status !== 'settled') return null
    return formatSwapIouLine(
      preview.settlement_amount,
      'counterparty',
      preview.creator_label,
      fmtPoker$,
    )
  }, [preview])

  async function submit() {
    if (!supabaseClient || !token) return
    const b = parseFloat(buyIn)
    const p = parseFloat(prize)
    if (!Number.isFinite(b) || b < 0 || !Number.isFinite(p) || p < 0) {
      setError('Enter your buy-in and prize (cash).')
      return
    }
    setSaving(true)
    setError('')
    try {
      const { data, error: err } = await supabaseClient.rpc(
        'poker_tournament_swap_claim_submit',
        {
          p_token: token,
          p_buy_in: b,
          p_prize: p,
          p_mark_paid: markPaid,
        },
      )
      if (err) throw err
      setDoneMsg(
        data?.status === 'settled'
          ? `Saved. Settlement: ${formatSwapIouLine(data.settlement_amount, 'counterparty', preview?.creator_label || 'them', fmtPoker$)}`
          : 'Saved your result. Settlement unlocks when they finish too.',
      )
      setPreview((prev) =>
        prev
          ? {
              ...prev,
              status: data?.status || prev.status,
              settlement_amount: data?.settlement_amount ?? prev.settlement_amount,
              counterparty_result_ready: true,
              counterparty_marked_paid: data?.counterparty_marked_paid ?? markPaid,
            }
          : prev,
      )
      onDone?.()
    } catch (e) {
      setError(e?.message || 'Could not save.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      data-poker-swap-claim
      data-edge-scroll-shell
      className="flex h-dvh max-h-dvh flex-col overflow-hidden bg-zinc-950 text-zinc-50"
    >
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]">
        <div className="mx-auto w-full max-w-md px-4 py-10 pb-[max(2.5rem,env(safe-area-inset-bottom))]">
        <div className="mb-6 text-center">
          <div className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-400/90">
            EdgeTilt
          </div>
          <h1 className="mt-2 text-2xl font-black tracking-tight">Tournament swap</h1>
          <p className="mt-1 text-sm text-zinc-400">Enter your result to settle the deal.</p>
        </div>

        {loading ? (
          <p className="text-center text-zinc-400">Loading…</p>
        ) : error && !preview ? (
          <p className="rounded-2xl border border-rose-500/40 bg-rose-950/40 p-4 text-center text-sm text-rose-200">
            {error}
          </p>
        ) : preview ? (
          <div className="rounded-3xl border border-zinc-800 bg-zinc-900/80 p-5">
            <div className="text-sm text-zinc-400">
              {preview.creator_label} swapped with {preview.guest_label || 'you'}
            </div>
            <div className="mt-1 text-lg font-bold text-white">
              {preview.pct_creator_gives}% ↔ {preview.pct_counterparty_gives}%
            </div>
            {preview.event_label ? (
              <div className="mt-1 text-sm text-zinc-400">{preview.event_label}</div>
            ) : null}

            {preview.creator_result_ready ? (
              <div className="mt-3 text-sm text-zinc-300">
                Their result: buy-in {fmtPoker$(preview.creator_buy_in)} · prize{' '}
                {fmtPoker$(preview.creator_prize)}
              </div>
            ) : (
              <div className="mt-3 text-sm text-zinc-500">They haven’t finished yet.</div>
            )}

            {settlementHint ? (
              <div className="mt-3 rounded-2xl bg-emerald-950/50 px-3 py-2 text-sm font-semibold text-emerald-200">
                {settlementHint}
              </div>
            ) : null}

            {doneMsg ? (
              <p className="mt-4 text-sm text-emerald-300">{doneMsg}</p>
            ) : (
              <>
                <label className="mt-4 block">
                  <span className="mb-1 block text-xs font-semibold uppercase text-zinc-500">
                    Your buy-in
                  </span>
                  <input
                    className="h-12 w-full rounded-2xl bg-zinc-800 px-4 text-white outline-none focus:ring-2 focus:ring-emerald-500/40"
                    inputMode="decimal"
                    value={buyIn}
                    onChange={(e) => setBuyIn(e.target.value)}
                  />
                </label>
                <label className="mt-3 block">
                  <span className="mb-1 block text-xs font-semibold uppercase text-zinc-500">
                    Your prize (cash)
                  </span>
                  <input
                    className="h-12 w-full rounded-2xl bg-zinc-800 px-4 text-white outline-none focus:ring-2 focus:ring-emerald-500/40"
                    inputMode="decimal"
                    value={prize}
                    onChange={(e) => setPrize(e.target.value)}
                  />
                </label>
                <label className="mt-3 flex items-center gap-2 text-sm text-zinc-300">
                  <input
                    type="checkbox"
                    checked={markPaid}
                    onChange={(e) => setMarkPaid(e.target.checked)}
                    className="h-4 w-4 rounded border-zinc-600"
                  />
                  Mark settled (if cash already exchanged)
                </label>
                {error ? <p className="mt-3 text-center text-sm text-rose-400">{error}</p> : null}
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void submit()}
                  className="mt-4 w-full rounded-2xl bg-emerald-600 py-3.5 text-base font-bold text-white touch-manipulation disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save my result'}
                </button>
              </>
            )}
          </div>
        ) : null}
        </div>
      </div>
    </div>
  )
}
