import { useEffect, useRef, useState } from 'react'
import { fmtPoker$ } from './pokerBankrollMath.js'
import { guestStakeeClaimLink, guestStakeeClaimPreview } from '../poker-stable/pokerStableApi.js'

/**
 * Guest stakee claim: /poker-stake-claim?token=…
 * Links an Edge account to a backer-initiated stake, then sends the player to Bankroll.
 *
 * @param {{
 *   supabaseClient: import('@supabase/supabase-js').SupabaseClient | null,
 *   token: string,
 *   userId?: string | null,
 *   onOpenAuth?: () => void,
 *   onDone?: (redirect?: string) => void,
 * }} props
 */
export default function PokerStableStakeClaimPage({
  supabaseClient,
  token,
  userId = null,
  onOpenAuth,
  onDone,
}) {
  const [loading, setLoading] = useState(true)
  const [preview, setPreview] = useState(null)
  const [error, setError] = useState('')
  const [claiming, setClaiming] = useState(false)
  const [linked, setLinked] = useState(false)
  const [linkRetry, setLinkRetry] = useState(0)
  const onDoneRef = useRef(onDone)
  const linkAttemptedRef = useRef(false)
  onDoneRef.current = onDone

  useEffect(() => {
    linkAttemptedRef.current = false
  }, [token])

  useEffect(() => {
    if (!supabaseClient || !token) {
      setLoading(false)
      setError('Missing claim link.')
      return undefined
    }
    let cancelled = false
    setLoading(true)
    setError('')
    void guestStakeeClaimPreview(supabaseClient, token).then(({ preview: data, error: err }) => {
      if (cancelled) return
      if (err) {
        setError(err.message || 'Invalid or expired claim link.')
        setPreview(null)
      } else {
        setPreview(data)
      }
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [supabaseClient, token])

  useEffect(() => {
    if (!supabaseClient || !token || !userId || !preview || linked || linkAttemptedRef.current) {
      return undefined
    }
    if (preview.already_linked && preview.claimed) {
      setLinked(true)
      onDoneRef.current?.(
        preview.deal_id ? `/?tab=poker-bankroll&stableDeal=${preview.deal_id}` : undefined,
      )
      return undefined
    }

    linkAttemptedRef.current = true
    setClaiming(true)
    setError('')
    void guestStakeeClaimLink(supabaseClient, token)
      .then(({ result, error: err }) => {
        if (err) {
          setError(err.message || 'Could not link this stake.')
          return
        }
        setLinked(true)
        onDoneRef.current?.(result?.redirect || undefined)
      })
      .finally(() => {
        setClaiming(false)
      })
  }, [
    supabaseClient,
    token,
    userId,
    linked,
    preview?.deal_id,
    preview?.already_linked,
    preview?.claimed,
    linkRetry,
  ])

  return (
    <div
      data-poker-stake-claim
      className="min-h-screen bg-zinc-950 px-4 py-10 text-zinc-50"
    >
      <div className="mx-auto w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-400/90">
            EdgeTilt
          </div>
          <h1 className="mt-2 text-2xl font-black tracking-tight">Backing stake</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Link your Edge account, then accept or counter the backer&apos;s terms on Bankroll.
          </p>
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
              {preview.backer_label} invited you as the player
            </div>
            <div className="mt-1 text-lg font-bold text-white">
              {preview.deal_label?.trim() || 'Cash backing'}
            </div>
            <div className="mt-2 text-sm text-zinc-300">
              Stake baseline {fmtPoker$(preview.baseline_bankroll)} · action sold{' '}
              {Number(preview.action_sold_pct) || 0}%
            </div>
            {preview.guest_email ? (
              <div className="mt-2 text-xs text-zinc-500">
                Invitation sent to {preview.guest_email}
              </div>
            ) : null}

            {linked ? (
              <p className="mt-4 text-sm text-emerald-300">
                Stake linked. Opening Bankroll…
              </p>
            ) : !userId ? (
              <>
                <p className="mt-4 text-sm text-zinc-300">
                  Create an account or sign in with the email this invitation was sent to. After you
                  confirm your email, this page will link the stake and send you to Bankroll.
                </p>
                {error ? <p className="mt-3 text-center text-sm text-rose-400">{error}</p> : null}
                <button
                  type="button"
                  onClick={() => onOpenAuth?.()}
                  className="mt-4 w-full rounded-2xl bg-cyan-600 py-3.5 text-base font-bold text-white touch-manipulation"
                >
                  Create account or sign in
                </button>
              </>
            ) : claiming ? (
              <p className="mt-4 text-center text-sm text-zinc-400">Linking stake…</p>
            ) : error ? (
              <>
                <p className="mt-4 text-center text-sm text-rose-400">{error}</p>
                <button
                  type="button"
                  onClick={() => {
                    linkAttemptedRef.current = false
                    setError('')
                    setLinkRetry((n) => n + 1)
                  }}
                  className="mt-4 w-full rounded-2xl border border-zinc-600 py-3 text-sm font-semibold text-zinc-200 touch-manipulation"
                >
                  Try again
                </button>
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}
