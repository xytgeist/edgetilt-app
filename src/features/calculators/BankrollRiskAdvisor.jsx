import { useState, useEffect } from 'react'
import { loungeChatInvoke } from '../../utils/loungeChatApi.js'

const RISK_KEY = 'lvsp:bankrollRiskPct'

function fmt$(n) {
  if (n == null || isNaN(n)) return '$0'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.abs(n))
}

// ── Need Help modal ────────────────────────────────────────────────────────────

function NeedHelpModal({ playLabel, maxExpectedLoss, riskBudget, playDetails, supabaseClient, onClose }) {
  const [comment, setComment] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState(null)

  const coverageDollars = Math.round(Math.min(riskBudget, maxExpectedLoss))
  const sellAmount = Math.max(0, Math.round(maxExpectedLoss - riskBudget))
  const coveragePct = maxExpectedLoss > 0 ? Math.round((coverageDollars / maxExpectedLoss) * 100) : 0

  const handleSend = async () => {
    setSending(true)
    setError(null)
    try {
      const { data: admin, error: adminErr } = await supabaseClient
        .from('profiles')
        .select('user_id')
        .eq('role', 'admin')
        .maybeSingle()
      if (adminErr || !admin) throw new Error('Could not reach support. Try again later.')

      const { room_id } = await loungeChatInvoke(supabaseClient, {
        action: 'open_dm',
        peer_user_id: admin.user_id,
      })

      const lines = [`🎰 Play Action Request`, ``, `Game: ${playLabel}`]
      if (playDetails.counter != null) lines.push(`Counter: ${Number(playDetails.counter).toLocaleString()}`)
      if (playDetails.betSize != null)  lines.push(`Bet Size: $${playDetails.betSize}/spin`)
      if (playDetails.current != null)  lines.push(`Current Meter: $${Number(playDetails.current).toFixed(2)}`)
      if (playDetails.mustHitBy != null) lines.push(`Must Hit By: $${Number(playDetails.mustHitBy).toFixed(2)}`)
      lines.push(
        ``,
        `Max Cost (worst case): ${fmt$(maxExpectedLoss)}`,
        `My Coverage: ${fmt$(coverageDollars)} (${coveragePct}%)`,
        `Looking to Sell: ${fmt$(sellAmount)} (${100 - coveragePct}%)`,
      )
      if (comment.trim()) lines.push(``, comment.trim())
      lines.push(``, `Sent via LV Slot Pro Calculator`)

      await loungeChatInvoke(supabaseClient, {
        action: 'send_message',
        room_id,
        body: lines.join('\n'),
      })
      setSent(true)
    } catch (e) {
      setError(e.message || 'Failed to send. Please try again.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-zinc-900 border border-zinc-700 rounded-3xl p-5 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <div className="text-white font-bold text-base">Request Action Help</div>
          <button onClick={onClose} className="text-zinc-400 text-2xl leading-none touch-manipulation px-1">×</button>
        </div>

        {sent ? (
          <div className="text-center py-6">
            <div className="text-emerald-400 text-3xl mb-2">✓</div>
            <div className="text-white font-semibold mb-1">Request Sent!</div>
            <div className="text-zinc-400 text-sm mb-5">We'll get back to you in the Lounge chat.</div>
            <button
              onClick={onClose}
              className="bg-zinc-700 text-white rounded-xl px-8 py-2.5 text-sm font-semibold touch-manipulation"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            {/* Pre-filled play details */}
            <div className="bg-zinc-800 rounded-2xl p-3 mb-4 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-zinc-400">Game</span>
                <span className="text-white font-medium">{playLabel}</span>
              </div>
              {playDetails.counter != null && (
                <div className="flex justify-between">
                  <span className="text-zinc-400">Counter</span>
                  <span className="text-white">{Number(playDetails.counter).toLocaleString()}</span>
                </div>
              )}
              {playDetails.betSize != null && (
                <div className="flex justify-between">
                  <span className="text-zinc-400">Bet Size</span>
                  <span className="text-white">${playDetails.betSize}/spin</span>
                </div>
              )}
              {playDetails.current != null && (
                <div className="flex justify-between">
                  <span className="text-zinc-400">Current Meter</span>
                  <span className="text-white">${Number(playDetails.current).toFixed(2)}</span>
                </div>
              )}
              {playDetails.mustHitBy != null && (
                <div className="flex justify-between">
                  <span className="text-zinc-400">Must Hit By</span>
                  <span className="text-white">${Number(playDetails.mustHitBy).toFixed(2)}</span>
                </div>
              )}
              <div className="border-t border-zinc-700 pt-1.5 mt-0.5 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-zinc-400">Max Cost</span>
                  <span className="text-red-400 font-semibold">{fmt$(maxExpectedLoss)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">My Coverage</span>
                  <span className="text-emerald-400 font-semibold">{fmt$(coverageDollars)} ({coveragePct}%)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Looking to Sell</span>
                  <span className="text-cyan-400 font-semibold">{fmt$(sellAmount)} ({100 - coveragePct}%)</span>
                </div>
              </div>
            </div>

            <textarea
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder="Add notes — machine number, casino, time window…"
              rows={3}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl text-white text-sm px-3 py-2 resize-none placeholder-zinc-500 mb-3 focus:outline-none focus:border-cyan-600"
            />

            {error && <div className="text-red-400 text-xs mb-3">{error}</div>}

            <button
              onClick={handleSend}
              disabled={sending}
              className="w-full bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-bold rounded-xl py-3 text-sm transition-colors touch-manipulation"
            >
              {sending ? 'Sending…' : 'Send Request'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

/**
 * Bankroll risk section for calculators.
 * Shows risk budget vs play cost and offers "Need Help?" to sell action via DM.
 *
 * @param {object} props
 * @param {import('@supabase/supabase-js').SupabaseClient} props.supabaseClient
 * @param {number}  props.maxExpectedLoss  Worst-case play cost in dollars
 * @param {string}  props.playLabel        e.g. "Phoenix Link"
 * @param {object}  props.playDetails      Fields shown in the Need Help modal
 */
export default function BankrollRiskAdvisor({ supabaseClient, maxExpectedLoss, playLabel, playDetails = {} }) {
  const [bankroll, setBankroll] = useState(null)
  const [loggedIn, setLoggedIn] = useState(false)
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [riskPct, setRiskPct] = useState(() => {
    const saved = localStorage.getItem(RISK_KEY)
    return saved ? Math.min(5, Math.max(1, Number(saved))) : 2
  })

  useEffect(() => {
    if (!supabaseClient) { setLoading(false); return }
    let cancelled = false
    async function load() {
      try {
        const { data: { user } } = await supabaseClient.auth.getUser()
        if (!user || cancelled) { if (!cancelled) setLoading(false); return }
        setLoggedIn(true)
        const { data } = await supabaseClient
          .from('bankroll_profiles')
          .select('overall_bankroll')
          .eq('user_id', user.id)
          .maybeSingle()
        if (!cancelled) setBankroll(data?.overall_bankroll ?? null)
      } catch {
        // silent — non-critical section
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [supabaseClient])

  const adjustRisk = (delta) => {
    setRiskPct(prev => {
      const next = Math.min(5, Math.max(1, prev + delta))
      localStorage.setItem(RISK_KEY, String(next))
      return next
    })
  }

  if (!maxExpectedLoss || maxExpectedLoss <= 0) return null
  if (loading) return null
  if (!loggedIn) return null

  const hasBankroll = bankroll != null && Number(bankroll) > 0
  const bk = Number(bankroll) || 0
  const riskBudget    = hasBankroll ? Math.round(bk * riskPct / 100) : 0
  const coverageDollars = hasBankroll ? Math.round(Math.min(riskBudget, maxExpectedLoss)) : 0
  const coveragePct   = hasBankroll && maxExpectedLoss > 0
    ? Math.min(100, Math.round((riskBudget / maxExpectedLoss) * 100))
    : 0
  const sellAmount    = hasBankroll ? Math.max(0, Math.round(maxExpectedLoss - riskBudget)) : 0
  const fullyFunded   = hasBankroll && riskBudget >= maxExpectedLoss

  return (
    <>
      <div className="mt-6 rounded-2xl bg-zinc-900 border border-zinc-800 p-4">
        {/* Header + risk % stepper */}
        <div className="flex items-center justify-between mb-3">
          <div className="text-zinc-400 text-xs font-semibold uppercase tracking-wide">Bankroll Risk</div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => adjustRisk(-1)}
              disabled={riskPct <= 1}
              className="w-6 h-6 rounded-full bg-zinc-700 text-white text-sm flex items-center justify-center disabled:opacity-30 touch-manipulation"
            >−</button>
            <span className="text-white text-sm font-semibold w-8 text-center">{riskPct}%</span>
            <button
              onClick={() => adjustRisk(1)}
              disabled={riskPct >= 5}
              className="w-6 h-6 rounded-full bg-zinc-700 text-white text-sm flex items-center justify-center disabled:opacity-30 touch-manipulation"
            >+</button>
          </div>
        </div>

        {!hasBankroll ? (
          <div className="text-zinc-500 text-xs">
            Set your bankroll in the Bankroll Tracker to see your risk exposure here.
          </div>
        ) : (
          <>
            {/* Stat tiles */}
            <div className="flex gap-2 mb-3">
              <div className="flex-1 bg-zinc-800 rounded-xl p-2.5 text-center">
                <div className="text-zinc-500 text-[10px] uppercase tracking-wide mb-0.5">Bankroll</div>
                <div className="text-white font-bold text-sm">{fmt$(bk)}</div>
              </div>
              <div className="flex-1 bg-zinc-800 rounded-xl p-2.5 text-center">
                <div className="text-zinc-500 text-[10px] uppercase tracking-wide mb-0.5">Budget ({riskPct}%)</div>
                <div className="text-amber-400 font-bold text-sm">{fmt$(riskBudget)}</div>
              </div>
              <div className="flex-1 bg-zinc-800 rounded-xl p-2.5 text-center">
                <div className="text-zinc-500 text-[10px] uppercase tracking-wide mb-0.5">Play Cost</div>
                <div className="text-red-400 font-bold text-sm">{fmt$(maxExpectedLoss)}</div>
              </div>
            </div>

            {/* Coverage bar */}
            <div className="mb-3">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-zinc-400">Your coverage</span>
                <span className={fullyFunded ? 'text-emerald-400 font-semibold' : 'text-amber-400 font-semibold'}>
                  {fmt$(coverageDollars)} ({coveragePct}%)
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-zinc-700 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${fullyFunded ? 'bg-emerald-400' : 'bg-amber-400'}`}
                  style={{ width: `${coveragePct}%` }}
                />
              </div>
            </div>

            {/* Verdict */}
            {fullyFunded ? (
              <div className="text-emerald-400 text-xs font-semibold">✓ You're fully funded for this play.</div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs text-zinc-400 leading-snug">
                  Consider selling{' '}
                  <span className="text-cyan-400 font-semibold">{fmt$(sellAmount)}</span> of action
                </div>
                <button
                  onClick={() => setShowModal(true)}
                  className="shrink-0 bg-cyan-600 text-white text-xs font-bold rounded-lg px-3 py-1.5 touch-manipulation"
                >
                  Need Help?
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {showModal && (
        <NeedHelpModal
          playLabel={playLabel}
          maxExpectedLoss={maxExpectedLoss}
          riskBudget={riskBudget}
          playDetails={playDetails}
          supabaseClient={supabaseClient}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  )
}
