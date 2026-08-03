import { useEffect, useRef, useState } from 'react'
import { fmtPoker$ } from '../poker-bankroll/pokerBankrollMath.js'
import {
  guestBackerClaimByEmail,
  guestBackerClaimLink,
  guestBackerClaimPreview,
} from './pokerStableApi.js'

/**
 * Guest backer claim: /poker-stable-claim?token=…
 * Links an Edge account to a player-created guest slice, then sends the backer to Stable Manager.
 *
 * @param {{
 *   supabaseClient: import('@supabase/supabase-js').SupabaseClient | null,
 *   token: string,
 *   userId?: string | null,
 *   onOpenAuth?: () => void,
 *   onDone?: (redirect?: string) => void,
 * }} props
 */
export default function PokerStableBackerClaimPage({
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
    void guestBackerClaimPreview(supabaseClient, token).then(({ preview: data, error: err }) => {
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
        preview.deal_id ? `/?tab=poker-stable&stableDeal=${preview.deal_id}` : undefined,
      )
      return undefined
    }

    linkAttemptedRef.current = true
    setClaiming(true)
    setError('')
    void guestBackerClaimLink(supabaseClient, token)
      .then(async ({ result, error: err }) => {
        if (err) {
          const byEmail = await guestBackerClaimByEmail(supabaseClient)
          if (!byEmail.error && Array.isArray(byEmail.result?.slice_ids) && byEmail.result.slice_ids.length) {
            setLinked(true)
            onDoneRef.current?.(byEmail.result?.redirect || undefined)
            return
          }
          setError(err.message || 'Could not link this backing slice.')
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

  const pricingLabel = preview
    ? preview.pricing_mode === 'markup'
      ? `Markup ${Number(preview.markup_rate) || 0}x`
      : `Profit split · player keeps ${Number(preview.player_profit_pct) || 0}%`
    : ''

  return (
    <div
      data-poker-stable-claim
      className="min-h-screen bg-zinc-950 px-4 py-10 text-zinc-50"
    >
      <div className="mx-auto w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-400/90">
            EdgeTilt
          </div>
          <h1 className="mt-2 text-2xl font-black tracking-tight">Backing invitation</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Link your Edge account, then accept or decline your slice in Stable Manager.
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
              {preview.player_label} invited you as a backer
            </div>
            <div className="mt-1 text-lg font-bold text-white">
              {preview.deal_label?.trim() || 'Cash backing'}
            </div>
            <div className="mt-2 text-sm text-zinc-300">
              Stake baseline {fmtPoker$(preview.baseline_bankroll)} · your action{' '}
              {Number(preview.action_pct) || 0}%
            </div>
            <div className="mt-1 text-xs text-zinc-500">{pricingLabel}</div>
            {preview.guest_email ? (
              <div className="mt-2 text-xs text-zinc-500">
                Invitation sent to {preview.guest_email}
              </div>
            ) : null}

            {linked ? (
              <p className="mt-4 text-sm text-emerald-300">
                Slice linked. Opening Stable Manager…
              </p>
            ) : !userId ? (
              <>
                <p className="mt-4 text-sm text-zinc-300">
                  Create an account or sign in with the email this invitation was sent to. After you
                  confirm your email, this page will link your slice and send you to Stable Manager.
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
              <p className="mt-4 text-center text-sm text-zinc-400">Linking slice…</p>
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
