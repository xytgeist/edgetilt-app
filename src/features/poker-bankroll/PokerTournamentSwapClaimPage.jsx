import { useEffect, useMemo, useRef, useState } from 'react'
import { PokerStableGuestClaimOfferDetails } from '../poker-stable/PokerStableGuestClaimOfferDetails.jsx'
import { formatSwapTermLine } from './pokerTournamentSwapMath.js'
import {
  guestSwapClaimByEmail,
  guestSwapClaimLink,
  guestSwapClaimPreview,
} from './pokerTournamentSwapApi.js'
import { buildTournamentSwapBankrollUrl } from './pokerTournamentSwapNav.js'

/**
 * Guest tournament swap claim: /poker-swap-claim?token=…
 * Review terms → create/sign in → auto-link → Poker Bankroll Incoming.
 *
 * @param {{
 *   supabaseClient: import('@supabase/supabase-js').SupabaseClient | null,
 *   token: string,
 *   userId?: string | null,
 *   onOpenAuth?: () => void,
 *   onDone?: (redirect?: string) => void,
 * }} props
 */
export default function PokerTournamentSwapClaimPage({
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

  useEffect(() => {
    onDoneRef.current = onDone
  }, [onDone])

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
    void guestSwapClaimPreview(supabaseClient, token).then(({ preview: data, error: err }) => {
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
    if (preview.already_linked && (preview.linked_user_is_viewer || preview.claimed)) {
      setLinked(true)
      onDoneRef.current?.(
        preview.swap_id ? buildTournamentSwapBankrollUrl(preview.swap_id) : undefined,
      )
      return undefined
    }

    linkAttemptedRef.current = true
    setClaiming(true)
    setError('')
    void guestSwapClaimLink(supabaseClient, token)
      .then(async ({ result, error: err }) => {
        if (err) {
          const byEmail = await guestSwapClaimByEmail(supabaseClient)
          if (!byEmail.error && Array.isArray(byEmail.result?.swap_ids) && byEmail.result.swap_ids.length) {
            setLinked(true)
            onDoneRef.current?.(byEmail.result?.redirect || undefined)
            return
          }
          setError(err.message || 'Could not link this swap.')
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
    preview?.swap_id,
    preview?.already_linked,
    preview?.claimed,
    preview?.linked_user_is_viewer,
    linkRetry,
  ])

  const offerDetails = useMemo(() => {
    if (!preview) return null
    const rows = [
      { label: 'Player', value: preview.creator_label || 'Player' },
      {
        label: 'You receive',
        value: `${preview.pct_creator_gives}% of ${preview.creator_label || 'their'} result`,
      },
      {
        label: 'They receive',
        value: `${preview.pct_counterparty_gives}% of your result`,
      },
    ]
    if (preview.event_label) {
      rows.splice(1, 0, { label: 'Tournament', value: preview.event_label })
    }
    const terms = formatSwapTermLine(preview)
    if (terms) rows.push({ label: 'Terms', value: terms })
    return {
      label: `${preview.pct_creator_gives}% ↔ ${preview.pct_counterparty_gives}%`,
      rows,
    }
  }, [preview])

  const creatorName = preview?.creator_label || 'Your partner'
  const showGuestAuthDock = Boolean(preview && offerDetails && !userId && !linked)
  const showSignedInRetryDock = Boolean(preview && offerDetails && userId && !linked && !claiming && error)

  return (
    <div
      data-poker-swap-claim
      data-edge-scroll-shell
      className="flex h-dvh max-h-dvh flex-col overflow-hidden bg-zinc-950 text-zinc-50"
    >
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]">
        <div
          className={`mx-auto w-full max-w-md px-4 pt-8 ${
            showGuestAuthDock || showSignedInRetryDock
              ? 'pb-4'
              : 'pb-[max(2.5rem,max(env(safe-area-inset-bottom, 0px), var(--edge-sab, 0px)))]'
          }`}
        >
          <div className="mb-5 text-center">
            <div className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-400/90">
              EdgeTilt
            </div>
            <p className="mt-3 text-xs font-bold uppercase tracking-[0.18em] text-cyan-300/90">
              Swap invitation
            </p>
            <h1 className="mt-2 text-xl font-black tracking-tight text-white">
              Review your tournament swap
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-zinc-300">
              {preview
                ? `${creatorName} invited you to a tournament swap on EdgeTilt Poker Bankroll. Review the terms below, then create an account or sign in to link the swap.`
                : 'Link your Edge account, then accept or decline the swap in Poker Bankroll.'}
            </p>
          </div>

          {loading ? (
            <p className="text-center text-zinc-400">Loading…</p>
          ) : error && !preview ? (
            <p className="rounded-2xl border border-rose-500/40 bg-rose-950/40 p-4 text-center text-sm text-rose-200">
              {error}
            </p>
          ) : preview && offerDetails ? (
            <>
              <PokerStableGuestClaimOfferDetails {...offerDetails} />

              {preview.guest_email ? (
                <p className="mt-3 text-center text-xs text-zinc-500">
                  Invitation sent to {preview.guest_email}
                </p>
              ) : null}

              {linked ? (
                <p className="mt-4 text-center text-sm text-emerald-300">
                  Swap linked. Opening Poker Bankroll…
                </p>
              ) : userId && claiming ? (
                <p className="mt-4 text-center text-sm text-zinc-400">Linking swap…</p>
              ) : null}
            </>
          ) : null}
        </div>
      </div>

      {showGuestAuthDock ? (
        <div
          data-poker-swap-claim-cta
          className="shrink-0 border-t border-zinc-800/90 bg-zinc-950 px-4 pt-3 pb-[max(0.75rem,max(env(safe-area-inset-bottom, 0px), var(--edge-sab, 0px)))]"
        >
          <div className="mx-auto w-full max-w-md">
            <p className="text-sm leading-snug text-zinc-300">
              Use the email this invitation was sent to. After you confirm, we link the swap and open
              Poker Bankroll so you can Accept or Decline.
            </p>
            {error ? <p className="mt-2 text-center text-sm text-rose-400">{error}</p> : null}
            <button
              type="button"
              onClick={() => onOpenAuth?.()}
              className="mt-3 w-full rounded-2xl bg-cyan-600 py-3.5 text-base font-bold text-white touch-manipulation"
            >
              Create account or sign in
            </button>
          </div>
        </div>
      ) : null}

      {showSignedInRetryDock ? (
        <div
          data-poker-swap-claim-cta
          className="shrink-0 border-t border-zinc-800/90 bg-zinc-950 px-4 pt-3 pb-[max(0.75rem,max(env(safe-area-inset-bottom, 0px), var(--edge-sab, 0px)))]"
        >
          <div className="mx-auto w-full max-w-md">
            <p className="text-center text-sm text-rose-400">{error}</p>
            <button
              type="button"
              onClick={() => {
                linkAttemptedRef.current = false
                setError('')
                setLinkRetry((n) => n + 1)
              }}
              className="mt-3 w-full rounded-2xl border border-zinc-600 py-3 text-sm font-semibold text-zinc-200 touch-manipulation"
            >
              Try again
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
