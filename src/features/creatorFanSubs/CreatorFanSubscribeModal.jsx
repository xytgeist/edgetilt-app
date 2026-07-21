import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { formatFanTierLabel } from './fanSubTiers.js'
import { creatorFanOfferHeadline } from './fanSubOffer.js'
import { startCreatorFanCheckout, openCreatorFanBillingPortal } from './creatorFanSubsApi.js'
import {
  profileAvatarInitials,
  profileAvatarToneClass,
} from '../profiles/profileGate.js'
import { Z_APP_MODAL } from '../../constants/appZIndex.js'

/**
 * @param {{
 *   open: boolean,
 *   onClose: () => void,
 *   supabaseClient: import('@supabase/supabase-js').SupabaseClient,
 *   offer: Record<string, unknown> | null,
 *   alreadySubscribed?: boolean,
 *   postAlertsEnabled?: boolean,
 *   onEnablePostAlerts?: () => void | Promise<void>,
 *   onDisablePostAlerts?: () => void | Promise<void>,
 * }} props
 */
export default function CreatorFanSubscribeModal({
  open,
  onClose,
  supabaseClient,
  offer,
  alreadySubscribed = false,
  postAlertsEnabled = false,
  onEnablePostAlerts,
  onDisablePostAlerts,
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setBusy(false)
    setError('')
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (ev) => {
      if (ev.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  if (!open || !offer) return null

  const handle = String(offer.handle || '').trim()
  const handleAt = handle ? `@${handle.replace(/^@/, '')}` : '@creator'
  const displayName = String(offer.display_name || handle || 'Creator').trim() || 'Creator'
  const tierLabel = formatFanTierLabel(String(offer.fan_tier_key || ''))
  const headline = creatorFanOfferHeadline(offer, handle)
  const intro = String(offer.offer_intro || '').trim()
  const posts = String(offer.offer_private_posts || '').trim()
  const chat = String(offer.offer_fan_chat || '').trim()
  const creatorUserId = String(offer.creator_user_id || '')

  const onSubscribe = async () => {
    if (!supabaseClient || !creatorUserId || busy || alreadySubscribed) return
    setBusy(true)
    setError('')
    try {
      await startCreatorFanCheckout(supabaseClient, creatorUserId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Checkout could not start.')
      setBusy(false)
    }
  }

  const onAlertsAction = async () => {
    if (busy) return
    if (postAlertsEnabled) {
      if (!onDisablePostAlerts) return
      setBusy(true)
      setError('')
      try {
        await onDisablePostAlerts()
        onClose()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not turn off alerts.')
      } finally {
        setBusy(false)
      }
      return
    }
    if (!onEnablePostAlerts) return
    setBusy(true)
    setError('')
    try {
      await onEnablePostAlerts()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not turn on alerts.')
    } finally {
      setBusy(false)
    }
  }

  const onUnsubscribe = async () => {
    if (!supabaseClient || busy || !creatorUserId) return
    setBusy(true)
    setError('')
    try {
      await openCreatorFanBillingPortal(supabaseClient, creatorUserId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open billing portal.')
      setBusy(false)
    }
  }

  const body = (
    <div
      data-creator-fan-subscribe-modal
      className={`fixed inset-0 z-[${Z_APP_MODAL}] flex flex-col bg-orange-600 text-white`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="creator-fan-subscribe-title"
    >
      <header
        data-creator-fan-subscribe-header
        className="shrink-0 px-3 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))]"
      >
        <div className="grid h-11 grid-cols-[2.75rem_1fr_2.75rem] items-center">
          <button
            type="button"
            aria-label="Close"
            disabled={busy}
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center rounded-full text-white/95 touch-manipulation hover:bg-white/10 disabled:opacity-50"
          >
            <X className="h-6 w-6" strokeWidth={2} aria-hidden />
          </button>
          <h2 id="creator-fan-subscribe-title" className="text-center text-[17px] font-bold leading-tight">
            Subscribe
          </h2>
          <span className="h-11 w-11" aria-hidden />
        </div>

        <div className="flex flex-col items-center px-4 pb-6 pt-3 text-center">
          <div className="h-[4.5rem] w-[4.5rem] shrink-0 overflow-hidden rounded-full border-[3px] border-white/90 bg-zinc-800 shadow-md">
            {offer.avatar_url ? (
              <img src={String(offer.avatar_url)} alt="" className="h-full w-full object-cover" />
            ) : (
              <span
                className={`grid h-full w-full place-items-center text-[22px] font-bold text-white ${profileAvatarToneClass(
                  offer.creator_user_id || handle,
                )}`}
              >
                {profileAvatarInitials(displayName, handle)}
              </span>
            )}
          </div>
          <p className="mt-3 text-[20px] font-bold leading-tight">{displayName}</p>
          <p className="mt-1 text-[15px] font-medium text-white/85">{handleAt}</p>
        </div>
      </header>

      <div
        data-creator-fan-subscribe-sheet
        className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-t-[1.35rem] border-t border-white/10 bg-zinc-950 text-zinc-100"
      >
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-5 pb-4 pt-5">
          {alreadySubscribed ? (
            <p
              data-creator-fan-subscribed-thanks
              className="text-[15px] leading-relaxed text-emerald-300/95"
            >
              You are already supporting this creator. Thanks for being here.
            </p>
          ) : (
            <>
              <p className="text-[17px] font-bold text-zinc-100">{headline}</p>
              <p className="mt-1 text-[14px] font-semibold text-orange-400">{tierLabel}</p>

              {intro ? (
                <p className="mt-4 text-[15px] leading-relaxed text-zinc-300 whitespace-pre-wrap">{intro}</p>
              ) : null}

              {posts ? (
                <section className="mt-5">
                  <h3 className="text-[13px] font-bold text-zinc-100">Subscription perks</h3>
                  <p className="mt-2 flex items-start gap-2 text-[15px] leading-relaxed text-zinc-300">
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full border border-zinc-500" aria-hidden />
                    <span className="whitespace-pre-wrap">{posts}</span>
                  </p>
                </section>
              ) : null}

              {chat ? (
                <section className="mt-5">
                  <h3 className="text-[13px] font-bold text-zinc-100">Fan group chat</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-zinc-300 whitespace-pre-wrap">{chat}</p>
                </section>
              ) : null}

              <p className="mt-6 text-[12px] leading-snug text-zinc-600">
                Paid fan access is billed monthly through Stripe. Alerts only is free post notifications.
              </p>
            </>
          )}

          {error ? <p className="mt-4 text-[13px] text-red-300/95">{error}</p> : null}
        </div>

        <div className="shrink-0 border-t border-zinc-800/90 bg-zinc-950 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
          {!alreadySubscribed ? (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => void onSubscribe()}
                className="flex min-h-[3.25rem] w-full items-center justify-center rounded-full bg-orange-500 px-5 text-[16px] font-bold text-zinc-950 touch-manipulation hover:bg-orange-400 disabled:opacity-50"
              >
                {busy ? '…' : `Subscribe · ${tierLabel}`}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void onAlertsAction()}
                className="mt-3 flex min-h-11 w-full items-center justify-center rounded-full border border-zinc-700/90 px-4 text-[15px] font-semibold text-zinc-200 touch-manipulation hover:bg-zinc-900/80 disabled:opacity-50"
              >
                {postAlertsEnabled ? 'Turn off alerts' : 'Alerts only'}
              </button>
            </>
          ) : (
            <>
              {postAlertsEnabled && onDisablePostAlerts ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onAlertsAction()}
                  className="mb-3 flex min-h-11 w-full items-center justify-center rounded-full border border-zinc-700/90 px-4 text-[15px] font-semibold text-zinc-200 touch-manipulation hover:bg-zinc-900/80 disabled:opacity-50"
                >
                  Turn off alerts
                </button>
              ) : null}
              <button
                type="button"
                disabled={busy}
                onClick={() => void onUnsubscribe()}
                className="mb-3 flex min-h-11 w-full items-center justify-center rounded-full border border-red-800/70 px-4 text-[15px] font-semibold text-red-300 touch-manipulation hover:bg-red-950/35 disabled:opacity-50"
              >
                {busy ? '…' : 'Cancel Subscription'}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={onClose}
                className="flex min-h-[3.25rem] w-full items-center justify-center rounded-full bg-orange-500 px-5 text-[16px] font-bold text-zinc-950 touch-manipulation hover:bg-orange-400 disabled:opacity-50"
              >
                Close
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )

  if (typeof document === 'undefined') return body
  return createPortal(body, document.body)
}
