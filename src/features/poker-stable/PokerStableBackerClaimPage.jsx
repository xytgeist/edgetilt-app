import { useEffect, useRef, useState } from 'react'
import {
  guestBackerClaimByEmail,
  guestBackerClaimLink,
  guestBackerClaimPreview,
} from './pokerStableApi.js'
import {
  clearStashedPokerStableClaimToken,
} from './pokerStableBackerClaimNav.js'
import {
  recoverStaleStableBackerClaim,
  tryOpenPendingBackerSliceOnboarding,
} from './pokerGuestBackerAutoLink.js'
import { PokerStableGuestClaimOfferDetails } from './PokerStableGuestClaimOfferDetails.jsx'
import { guestBackerClaimOfferDetails } from './pokerStableGuestClaimOffer.js'

/**
 * Guest backer claim: /poker-stable-claim?token=…
 * Links an Edge account to a player-created guest slice, then sends the backer to Stable Manager.
 *
 * @param {{
 *   supabaseClient: import('@supabase/supabase-js').SupabaseClient | null,
 *   token: string,
 *   userId?: string | null,
 *   onOpenAuth?: () => void,
 *   onDone?: (payload?: { redirect?: string, dealId?: string, sliceId?: string }) => void,
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
    void guestBackerClaimPreview(supabaseClient, token).then(async ({ preview: data, error: err }) => {
      if (cancelled) return
      if (err) {
        const msg = String(err.message || '').toLowerCase()
        if (msg.includes('invalid or expired claim link') || msg.includes('invalid token')) {
          clearStashedPokerStableClaimToken()
          if (userId) {
            const recovered = await recoverStaleStableBackerClaim(supabaseClient)
            if (recovered) return
          } else {
            const opened = await tryOpenPendingBackerSliceOnboarding(supabaseClient, { force: true })
            if (opened) return
          }
        }
        setError(
          err.message?.toLowerCase().includes('invalid or expired claim link')
            ? 'This invitation link is outdated. Sign in and open Stable Manager to accept your slice, or use the link from your latest backing email.'
            : err.message || 'Invalid or expired claim link.',
        )
        setPreview(null)
      } else {
        setPreview(data)
      }
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [supabaseClient, token, userId])

  useEffect(() => {
    if (!supabaseClient || !token || !userId || !preview || linked || linkAttemptedRef.current) {
      return undefined
    }
    if (preview.already_linked && preview.claimed) {
      setLinked(true)
      onDoneRef.current?.({
        redirect: preview.deal_id
          ? `/?tab=poker-stable&stableDeal=${preview.deal_id}`
          : undefined,
        dealId: preview.deal_id,
        sliceId: preview.slice_id,
      })
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
            let dealId = ''
            try {
              dealId = String(
                new URL(
                  byEmail.result?.redirect || '/?tab=poker-stable',
                  window.location.origin,
                ).searchParams.get('stableDeal') || '',
              ).trim()
            } catch {
              // ignore
            }
            onDoneRef.current?.({
              redirect: byEmail.result?.redirect || undefined,
              dealId: dealId || preview?.deal_id,
              sliceId: byEmail.result.slice_ids[0] || preview?.slice_id,
            })
            return
          }
          setError(err.message || 'Could not link this backing slice.')
          return
        }
        setLinked(true)
        onDoneRef.current?.({
          redirect: result?.redirect || undefined,
          dealId: result?.deal_id || preview?.deal_id,
          sliceId: result?.slice_id || preview?.slice_id,
        })
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

  const offerDetails = guestBackerClaimOfferDetails(preview)
  const playerName = preview?.player_label || 'the player'
  const showGuestAuthDock = Boolean(preview && offerDetails && !linked && !userId)
  const showSignedInRetryDock = Boolean(preview && offerDetails && !linked && userId && !claiming && error)

  return (
    <div
      data-poker-stable-claim
      data-edge-scroll-shell
      className="flex h-dvh max-h-dvh flex-col overflow-hidden bg-zinc-950 text-zinc-50"
    >
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]">
        <div
          className={`mx-auto w-full max-w-md px-4 pt-8 ${
            showGuestAuthDock || showSignedInRetryDock ? 'pb-4' : 'pb-[max(2.5rem,max(env(safe-area-inset-bottom,0px),var(--edge-sab,0px)))]'
          }`}
        >
          <div className="mb-5 text-center">
            <div className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-400/90">
              EdgeTilt
            </div>
            <p className="mt-3 text-xs font-bold uppercase tracking-[0.18em] text-cyan-300/90">
              Backing invitation
            </p>
            <h1 className="mt-2 text-xl font-black tracking-tight text-white">Review your backing slice</h1>
            <p className="mt-2 text-sm leading-relaxed text-zinc-300">
              {preview
                ? `${playerName} invited you to back them on EdgeTilt Stable Manager. Review the terms below, then create an account or sign in to link your slice.`
                : 'Link your Edge account, then accept or decline your slice in Stable Manager.'}
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
                  Slice linked. Opening Stable Manager…
                </p>
              ) : userId && claiming ? (
                <p className="mt-4 text-center text-sm text-zinc-400">Linking slice…</p>
              ) : null}
            </>
          ) : null}
        </div>
      </div>

      {showGuestAuthDock ? (
        <div
          data-poker-stable-claim-cta
          className="shrink-0 border-t border-zinc-800/90 bg-zinc-950 px-4 pt-3 pb-[max(0.75rem,max(env(safe-area-inset-bottom,0px),var(--edge-sab,0px)))]"
        >
          <div className="mx-auto w-full max-w-md">
            <p className="text-sm leading-snug text-zinc-300">
              Use the email this invitation was sent to. After you confirm, we link your slice and open
              Stable Manager.
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
          data-poker-stable-claim-cta
          className="shrink-0 border-t border-zinc-800/90 bg-zinc-950 px-4 pt-3 pb-[max(0.75rem,max(env(safe-area-inset-bottom,0px),var(--edge-sab,0px)))]"
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
