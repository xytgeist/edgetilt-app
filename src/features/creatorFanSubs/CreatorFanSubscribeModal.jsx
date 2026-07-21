import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { formatFanTierLabel } from './fanSubTiers.js'
import { creatorFanOfferHeadline } from './fanSubOffer.js'
import { startCreatorFanCheckout } from './creatorFanSubsApi.js'
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
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setBusy(false)
    setError('')
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

  const onAlertsOnly = async () => {
    if (busy || postAlertsEnabled) {
      onClose()
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

  const body = (
    <div
      className={`fixed inset-0 z-[${Z_APP_MODAL}] flex items-end justify-center sm:items-center sm:p-4`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="creator-fan-subscribe-title"
    >
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-black/70"
        onClick={onClose}
      />
      <div
        data-creator-fan-subscribe-modal
        className="relative z-10 max-h-[min(92vh,720px)] w-full max-w-md overflow-y-auto rounded-t-2xl border border-zinc-800 bg-zinc-950 p-5 shadow-2xl sm:rounded-2xl"
      >
        <div className="flex items-start gap-3">
          <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full bg-zinc-800">
            {offer.avatar_url ? (
              <img src={String(offer.avatar_url)} alt="" className="h-full w-full object-cover" />
            ) : (
              <span
                className={`grid h-full w-full place-items-center text-[15px] font-bold text-white ${profileAvatarToneClass(
                  offer.creator_user_id || handle,
                )}`}
              >
                {profileAvatarInitials(displayName, handle)}
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h2 id="creator-fan-subscribe-title" className="text-[17px] font-bold text-zinc-100">
              {headline}
            </h2>
            <p className="mt-0.5 text-[13px] text-zinc-500">
              {displayName} · {handleAt}
            </p>
            <p className="mt-1 text-[14px] font-semibold text-orange-400">{tierLabel}</p>
          </div>
        </div>

        {alreadySubscribed ? (
          <p className="mt-4 text-[14px] leading-relaxed text-emerald-300/95">
            You are already supporting this creator. Thanks for being here.
          </p>
        ) : (
          <>
            {intro ? (
              <p className="mt-4 text-[14px] leading-relaxed text-zinc-300 whitespace-pre-wrap">{intro}</p>
            ) : null}

            {posts ? (
              <section className="mt-4">
                <h3 className="text-[12px] font-semibold uppercase tracking-wide text-zinc-500">
                  Private posts
                </h3>
                <p className="mt-1.5 text-[14px] leading-relaxed text-zinc-300 whitespace-pre-wrap">{posts}</p>
              </section>
            ) : null}

            {chat ? (
              <section className="mt-4">
                <h3 className="text-[12px] font-semibold uppercase tracking-wide text-zinc-500">
                  Fan group chat
                </h3>
                <p className="mt-1.5 text-[14px] leading-relaxed text-zinc-300 whitespace-pre-wrap">{chat}</p>
              </section>
            ) : null}

            <p className="mt-4 text-[12px] leading-snug text-zinc-600">
              Paid fan access is billed monthly through Stripe. Alerts only is free post notifications.
            </p>
          </>
        )}

        {error ? <p className="mt-3 text-[13px] text-red-300/95">{error}</p> : null}

        <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
          {alreadySubscribed ? (
            <button
              type="button"
              disabled={busy}
              onClick={onClose}
              className="min-h-11 rounded-xl border border-zinc-700/90 px-4 text-[14px] font-semibold text-zinc-200 hover:bg-zinc-900 disabled:opacity-50"
            >
              Close
            </button>
          ) : (
            <>
              <button
                type="button"
                disabled={busy || postAlertsEnabled}
                onClick={() => void onAlertsOnly()}
                className="min-h-11 rounded-xl border border-zinc-700/90 px-4 text-[14px] font-semibold text-zinc-200 hover:bg-zinc-900 disabled:opacity-50 touch-manipulation"
              >
                {postAlertsEnabled ? 'Alerts on' : 'Alerts only'}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void onSubscribe()}
                title={`Paid fan subscription · ${tierLabel}`}
                className="min-h-11 rounded-xl bg-orange-500 px-5 text-[14px] font-bold text-zinc-950 hover:bg-orange-400 disabled:opacity-50 touch-manipulation"
              >
                {busy ? '…' : 'Subscribe'}
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
