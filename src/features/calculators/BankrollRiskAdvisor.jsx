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

/** playStake = bet size / $ per play unit (e.g. $25/spin). */
function resolvePlayStake(playDetails) {
  const raw = playDetails?.playStake ?? playDetails?.betSize
  const stake = Number(raw)
  return Number.isFinite(stake) && stake > 0 ? stake : null
}

function computeRiskMetrics({ maxExpectedLoss, riskBudget, playStake }) {
  const budget = Math.max(0, Number(riskBudget) || 0)
  const maxLoss = Math.max(0, Number(maxExpectedLoss) || 0)
  const coveragePct = maxLoss > 0 ? Math.min(100, Math.round((budget / maxLoss) * 100)) : 0
  const sellPct = Math.max(0, 100 - coveragePct)
  const coverageDollars = Math.round(Math.min(budget, maxLoss))
  const sellOnPlay = playStake != null ? Math.round(playStake * sellPct / 100) : null
  const maxActionOnPlay = playStake != null
    ? Math.max(0, Math.round(playStake * coveragePct / 100))
    : budget
  return {
    coveragePct,
    sellPct,
    coverageDollars,
    sellOnPlay,
    maxActionOnPlay,
    playStake,
    fullyFunded: maxLoss > 0 && budget >= maxLoss,
  }
}

// ── Need Help modal ────────────────────────────────────────────────────────────

function NeedHelpModal({ playLabel, maxExpectedLoss, riskBudget, playDetails, supabaseClient, onClose }) {
  const [comment, setComment] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState(null)

  const playStake = resolvePlayStake(playDetails)
  const { coveragePct, sellPct, coverageDollars, sellOnPlay } = computeRiskMetrics({
    maxExpectedLoss,
    riskBudget,
    playStake,
  })

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
        `Exposure (worst case): ${fmt$(maxExpectedLoss)}`,
        `My Coverage: ${fmt$(coverageDollars)} (${coveragePct}%)`,
        playStake != null
          ? `Looking to Sell: ${fmt$(sellOnPlay)} of action on this ${fmt$(playStake)} play (${sellPct}%)`
          : `Looking to Sell: ${sellPct}% of action`,
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
                  <span className="text-zinc-400">Exposure</span>
                  <span className="text-red-400 font-semibold">{fmt$(maxExpectedLoss)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">My Coverage</span>
                  <span className="text-emerald-400 font-semibold">{fmt$(coverageDollars)} ({coveragePct}%)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Looking to Sell</span>
                  <span className="text-cyan-400 font-semibold text-right">
                    {playStake != null
                      ? <>{fmt$(sellOnPlay)} on {fmt$(playStake)} play ({sellPct}%)</>
                      : <>{sellPct}% of action</>}
                  </span>
                </div>
              </div>
            </div>

            <textarea
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder="Add notes (machine number, casino, time window…)"
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

// ── Info modal ─────────────────────────────────────────────────────────────────

function InfoIconButton({ accentClass, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="About Bankroll Risk"
      className={`w-8 h-8 flex items-center justify-center touch-manipulation transition-colors ${accentClass} opacity-90 hover:opacity-100`}
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
      </svg>
    </button>
  )
}

function BankrollRiskInfoModal({ accentClass, accentBtnClass, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-3xl max-w-md w-full p-6 max-h-[85vh] overflow-y-auto">
        <h3 className={`text-xl font-semibold mb-4 ${accentClass}`}>Bankroll Risk</h3>
        <div className="text-gray-300 text-[15px] leading-relaxed space-y-4">
          <p>
            This is a <strong className="text-white">fixed fractional risk assessment</strong>. A standard bankroll rule that caps how much of your roll you&apos;re willing to lose on one play, then compares that to this calculator&apos;s worst-case cost before you commit money on the floor.
          </p>
          <p>
            <strong className="text-white">How it&apos;s calculated.</strong> We pull your <strong className="text-white">overall bankroll</strong> from the Bankroll Tracker and multiply it by your chosen risk % (1-5%, default 2%). That gives your <strong className="text-white">risk budget</strong>, your fixed slice of bankroll for this opportunity. <strong className="text-white">Exposure</strong> is the worst-case dollars to complete the play. <strong className="text-white">Coverage</strong> is how much of that exposure your budget can absorb. If you&apos;re underfunded, we show how much of your <strong className="text-white">bet size</strong> to consider selling (e.g. $20 of a $25 play).
          </p>
          <p>
            <strong className="text-white">Why fixed fractional over Kelly?</strong> Kelly sizes bets to maximize long-run growth from edge and payoff ratio. Useful in theory, but far too aggressive for AP slots. Slot variance is brutal: fat tails, long loss streaks, and rare huge wins. Full Kelly (and often even half-Kelly) assumes you can tolerate swings that would put most real bankrolls into 50%+ drawdowns or ruin. <strong className="text-white">Fixed fractional risk</strong> produces smoother equity curves and a much lower chance of catastrophic drawdowns, so you stay in the game long enough for edge to matter.
          </p>
          <p>
            <strong className="text-white">Why it matters.</strong> Positive EV doesn&apos;t help if one bad run wipes you out. If your budget covers the full exposure, you&apos;re funded. If not, sell or partner on the uncovered portion so you&apos;re not over-levered on a single machine.
          </p>
          <p className="italic text-gray-300">
            Tap <strong className="text-white">Need Help?</strong> to send a pre-filled action request via Lounge DM.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className={`mt-6 w-full py-4 rounded-2xl font-bold text-lg text-white transition-colors touch-manipulation ${accentBtnClass}`}
        >
          Got it
        </button>
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

/**
 * Bankroll risk section for calculators.
 * Shows risk budget vs exposure and offers "Need Help?" to sell action via DM.
 *
 * @param {object} props
 * @param {import('@supabase/supabase-js').SupabaseClient} props.supabaseClient
 * @param {number}  props.maxExpectedLoss  Exposure in dollars (worst case)
 * @param {string}  props.playLabel        e.g. "Phoenix Link"
 * @param {object}  props.playDetails      Fields shown in the Need Help modal
 * @param {string}  [props.accentClass]    Section title color (game accent)
 * @param {string}  [props.accentBtnClass] Primary button classes for info modal
 */
export default function BankrollRiskAdvisor({
  supabaseClient,
  maxExpectedLoss,
  playLabel,
  playDetails = {},
  accentClass = 'text-gray-300',
  accentBtnClass = 'bg-cyan-600 hover:bg-cyan-500',
}) {
  const [bankroll, setBankroll] = useState(null)
  const [loggedIn, setLoggedIn] = useState(false)
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [showInfoModal, setShowInfoModal] = useState(false)
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
        // silent; non-critical section
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
  const riskBudget = hasBankroll ? Math.round(bk * riskPct / 100) : 0
  const playStake = resolvePlayStake(playDetails)
  const {
    coveragePct,
    sellPct,
    coverageDollars,
    sellOnPlay,
    maxActionOnPlay,
    fullyFunded,
  } = computeRiskMetrics({ maxExpectedLoss, riskBudget, playStake })

  return (
    <>
      <div className="bg-gray-900 p-6 rounded-3xl mb-6">
        {/* Header + risk % stepper */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-1 min-w-0">
            <h2 className={`text-xl font-semibold ${accentClass}`}>Bankroll Risk</h2>
            <InfoIconButton accentClass={accentClass} onClick={() => setShowInfoModal(true)} />
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => adjustRisk(-1)}
              disabled={riskPct <= 1}
              className="w-7 h-7 rounded-full bg-gray-700 text-white text-sm flex items-center justify-center disabled:opacity-30 touch-manipulation active:bg-gray-600"
            >−</button>
            <span className="text-white text-sm font-semibold w-8 text-center">{riskPct}%</span>
            <button
              onClick={() => adjustRisk(1)}
              disabled={riskPct >= 5}
              className="w-7 h-7 rounded-full bg-gray-700 text-white text-sm flex items-center justify-center disabled:opacity-30 touch-manipulation active:bg-gray-600"
            >+</button>
          </div>
        </div>

        {!hasBankroll ? (
          <div className="text-gray-400 text-sm">
            Set your bankroll in the Bankroll Tracker to see your risk exposure here.
          </div>
        ) : (
          <>
            {/* Stat tiles */}
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="bg-gray-800 p-4 rounded-2xl text-center">
                <div className="text-gray-400 text-sm mb-1">Bankroll</div>
                <div className="text-white font-bold text-lg">{fmt$(bk)}</div>
              </div>
              <div className="bg-gray-800 p-4 rounded-2xl text-center">
                <div className="text-gray-400 text-sm mb-1">Budget ({riskPct}%)</div>
                <div className="text-amber-400 font-bold text-lg">{fmt$(riskBudget)}</div>
              </div>
              <div className="bg-gray-800 p-4 rounded-2xl text-center">
                <div className="text-gray-400 text-sm mb-1">Exposure</div>
                <div className="text-red-400 font-bold text-lg">{fmt$(maxExpectedLoss)}</div>
              </div>
            </div>

            {/* Coverage bar */}
            <div className={fullyFunded ? 'mb-4' : 'mb-3'}>
              <div className="flex justify-between text-sm mb-1.5">
                <span className="text-gray-400">Your coverage</span>
                <span className={fullyFunded ? 'text-green-400 font-semibold' : 'text-amber-400 font-semibold'}>
                  {fmt$(coverageDollars)} ({coveragePct}%)
                </span>
              </div>
              <div className="h-2 rounded-full bg-gray-700 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${fullyFunded ? 'bg-green-400' : 'bg-amber-400'}`}
                  style={{ width: `${coveragePct}%` }}
                />
              </div>
              {!fullyFunded && (
                <p className="mt-2 text-xs italic text-gray-500 leading-snug">
                  * Your risk profile and bankroll dictate{' '}
                  <span className="text-gray-400 not-italic font-medium">{fmt$(maxActionOnPlay)}</span>
                  {' '}is the maximum action you should take on this play.
                </p>
              )}
            </div>

            {/* Verdict */}
            {fullyFunded ? (
              <div className="p-4 rounded-2xl text-center text-sm font-bold bg-green-900 text-green-300">
                ✓ You're fully funded for this play.
              </div>
            ) : (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-4 rounded-2xl bg-gray-800">
                <div className="min-w-0 flex-1">
                  <p className="text-base text-gray-400 leading-snug">
                    {playStake != null ? (
                      <>
                        Consider selling{' '}
                        <span className="text-cyan-400 font-semibold">{fmt$(sellOnPlay)}</span>
                        {' '}of action on this{' '}
                        <span className="text-white font-semibold">{fmt$(playStake)}</span>
                        {' '}play.
                      </>
                    ) : (
                      <>
                        Consider selling{' '}
                        <span className="text-cyan-400 font-semibold">{sellPct}%</span>
                        {' '}of action on this play.
                      </>
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowModal(true)}
                  data-bankroll-need-help-btn
                  className="shrink-0 bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-bold rounded-xl px-4 py-2 touch-manipulation"
                >
                  Need Help?
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {showInfoModal && (
        <BankrollRiskInfoModal
          accentClass={accentClass}
          accentBtnClass={accentBtnClass}
          onClose={() => setShowInfoModal(false)}
        />
      )}

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
