import { useState } from 'react'
import { APP_MODAL_OVERLAY_CLASS, APP_MODAL_SHEET_PANEL_CLASS } from '../../constants/appZIndex.js'
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
  onEditTerms,
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
        className={`relative z-10 max-h-[92dvh] overflow-y-auto ${APP_MODAL_SHEET_PANEL_CLASS}`}
        onClick={(e) => e.stopPropagation()}
      >
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
          then accept, decline, or propose changes.
        </p>

        {offerDetails ? (
          <div className="mt-5">
            <PokerStableGuestClaimOfferDetails {...offerDetails} />
          </div>
        ) : null}

        {declineConfirm ? (
          <div className="mt-4 rounded-2xl border border-rose-500/40 bg-rose-950/40 p-4 text-sm text-rose-100">
            <p className="text-center">
              Decline your slice on <span className="font-semibold text-white">{label}</span>? Other
              backers on this stake are not affected.
            </p>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => setDeclineConfirm(false)}
                className="rounded-2xl bg-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-200 touch-manipulation disabled:opacity-50"
              >
                Go back
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => onDecline?.()}
                className="rounded-2xl bg-rose-600 px-4 py-2 text-sm font-bold text-white touch-manipulation disabled:opacity-50"
              >
                Yes, decline slice
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => onAccept?.()}
              className="min-w-[7.5rem] flex-1 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white touch-manipulation disabled:opacity-50 sm:flex-none"
            >
              Accept
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => setDeclineConfirm(true)}
              className="min-w-[7.5rem] flex-1 rounded-2xl bg-zinc-700 px-4 py-3 text-sm font-semibold text-zinc-200 touch-manipulation disabled:opacity-50 sm:flex-none"
            >
              Decline
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => onEditTerms?.()}
              className="w-full rounded-2xl bg-zinc-800 px-4 py-3 text-sm font-semibold text-cyan-200 touch-manipulation disabled:opacity-50"
            >
              Edit terms
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
