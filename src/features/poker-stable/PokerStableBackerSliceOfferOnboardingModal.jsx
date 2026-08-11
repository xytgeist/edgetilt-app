import { useState } from 'react'
import { APP_MODAL_OVERLAY_CLASS } from '../../constants/appZIndex.js'
import { PokerStableGuestClaimOfferDetails } from './PokerStableGuestClaimOfferDetails.jsx'
import { guestBackerSliceOfferDetails } from './pokerStableGuestClaimOffer.js'
import { dealStakeeDisplayName } from './pokerStableTerms.js'

/**
 * First-run guest backer: blocking slice-offer sheet with terms visible (mirrors Bankroll stakee onboarding).
 */
export default function PokerStableBackerSliceOfferOnboardingModal({
  deal,
  slice,
  profilesById = {},
  saving = false,
  onAccept,
  onDecline,
}) {
  const [declineConfirm, setDeclineConfirm] = useState(false)

  if (!deal || !slice) return null

  const playerName = dealStakeeDisplayName(deal, profilesById) || 'the player'
  const offerDetails = guestBackerSliceOfferDetails(deal, slice, profilesById)
  const label = offerDetails?.label || 'Cash backing'

  return (
    <div
      className={`${APP_MODAL_OVERLAY_CLASS} z-[140] overflow-x-hidden bg-black/75 backdrop-blur-sm`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="poker-backer-slice-offer-onboarding-title"
    >
      <div
        data-poker-stake-offer-onboarding
        className="relative z-10 flex w-full max-w-lg min-h-0 max-h-[min(92dvh,calc(100dvh-env(safe-area-inset-top,0px)-4.5rem))] flex-col overflow-hidden rounded-t-3xl border-t border-zinc-700/50 bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-5 pb-4 [-webkit-overflow-scrolling:touch]">
          <div className="mx-auto mb-3 h-1 w-10 shrink-0 rounded-full bg-zinc-600/70" aria-hidden />

          <p className="text-center text-xs font-bold uppercase tracking-[0.18em] text-cyan-300/90">
            Backing invitation
          </p>
          <h2
            id="poker-backer-slice-offer-onboarding-title"
            className="mt-2 text-center text-xl font-black tracking-tight text-white"
          >
            Review your backing slice
          </h2>
          <p className="mt-2 text-center text-sm leading-relaxed text-zinc-300">
            {playerName} invited you to back them on EdgeTilt Stable Manager. Review the terms below,
            then accept or decline.
          </p>

          {offerDetails ? (
            <div className="mt-5">
              <PokerStableGuestClaimOfferDetails {...offerDetails} />
            </div>
          ) : null}
        </div>

        <div
          data-poker-stake-offer-cta
          className="shrink-0 border-t border-zinc-800/90 bg-zinc-900 px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
        >
          {declineConfirm ? (
            <div className="rounded-2xl border border-rose-500/40 bg-rose-950/40 p-4 text-sm text-rose-100">
              <p className="text-center">
                Decline your slice on <span className="font-semibold text-white">{label}</span>? Other
                backers on this stake are not affected.
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setDeclineConfirm(false)}
                  className="min-w-0 flex-1 rounded-2xl bg-zinc-700 px-4 py-3 text-sm font-semibold text-zinc-200 touch-manipulation disabled:opacity-50"
                >
                  Go back
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => onDecline?.()}
                  className="min-w-0 flex-1 rounded-2xl bg-rose-600 px-4 py-3 text-sm font-bold text-white touch-manipulation disabled:opacity-50"
                >
                  Yes, decline slice
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                type="button"
                data-poker-stake-offer-decline
                disabled={saving}
                onClick={() => setDeclineConfirm(true)}
                className="min-w-0 flex-1 rounded-2xl bg-zinc-700 px-4 py-3 text-sm font-semibold text-zinc-200 touch-manipulation disabled:opacity-50"
              >
                Decline
              </button>
              <button
                type="button"
                data-poker-stake-offer-accept
                disabled={saving}
                onClick={() => onAccept?.()}
                className="min-w-0 flex-1 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white touch-manipulation disabled:opacity-50"
              >
                Accept
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
