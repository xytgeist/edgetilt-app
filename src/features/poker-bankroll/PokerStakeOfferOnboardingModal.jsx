import { useState } from 'react'
import { APP_MODAL_OVERLAY_CLASS, APP_MODAL_SHEET_PANEL_CLASS } from '../../constants/appZIndex.js'
import { fmtPoker$ } from './pokerBankrollMath.js'
import { dealTypeLabel, sumSliceActionPct } from '../poker-stable/pokerStableMath.js'
import {
  dealLeadBackerDisplayName,
  sliceTermsSummary,
} from '../poker-stable/pokerStableTerms.js'
import { venueKindLabel } from './pokerStakeeOnboarding.js'

/**
 * First-run guest stakee: blocking stake-offer sheet with terms visible.
 */
export default function PokerStakeOfferOnboardingModal({
  deal,
  slices = [],
  stableProfilesById = {},
  saving = false,
  onAccept,
  onDecline,
  onOfferNewTerms,
}) {  const [declineConfirm, setDeclineConfirm] = useState(false)

  if (!deal) return null

  const label = deal.label?.trim() || dealTypeLabel(deal.deal_type) || 'Cash backing'
  const backerName = dealLeadBackerDisplayName(deal, stableProfilesById) || 'Your backer'
  const actionSold = sumSliceActionPct(slices)
  const baseline = Number(deal.baseline_bankroll) || 0
  const sliceSummaries = (slices || []).map((slice) => sliceTermsSummary(slice, stableProfilesById))

  return (
    <div
      className={`${APP_MODAL_OVERLAY_CLASS} z-[140] overflow-x-hidden bg-black/75 backdrop-blur-sm`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="poker-stake-offer-onboarding-title"
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
          id="poker-stake-offer-onboarding-title"
          className="mt-2 text-center text-xl font-black tracking-tight text-white"
        >
          Review your stake
        </h2>
        <p className="mt-2 text-center text-sm leading-relaxed text-zinc-300">
          {backerName} invited you to a backing stake on EdgeTilt Poker Bankroll. Review the terms
          below, then accept, decline, or propose changes.
        </p>

        <div className="mt-5 rounded-2xl border border-zinc-700/70 bg-zinc-950/70 p-4">
          <div className="text-lg font-bold text-white">{label}</div>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex items-start justify-between gap-3">
              <dt className="text-zinc-400">Backer</dt>
              <dd className="text-right font-medium text-zinc-100">{backerName}</dd>
            </div>
            <div className="flex items-start justify-between gap-3">
              <dt className="text-zinc-400">Deal type</dt>
              <dd className="text-right font-medium text-zinc-100">{dealTypeLabel(deal.deal_type)}</dd>
            </div>
            <div className="flex items-start justify-between gap-3">
              <dt className="text-zinc-400">Venue</dt>
              <dd className="text-right font-medium text-zinc-100">
                {venueKindLabel(deal.venue_kind)}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-3">
              <dt className="text-zinc-400">Baseline bankroll</dt>
              <dd className="text-right font-medium text-zinc-100">{fmtPoker$(baseline)}</dd>
            </div>
            <div className="flex items-start justify-between gap-3">
              <dt className="text-zinc-400">Action sold</dt>
              <dd className="text-right font-medium text-zinc-100">{actionSold}%</dd>
            </div>
          </dl>

          {sliceSummaries.length ? (
            <div className="mt-4 space-y-3 border-t border-zinc-800 pt-4">
              {sliceSummaries.map((summary, idx) => (
                <div key={`${summary.name}-${idx}`}>
                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Backer slice {sliceSummaries.length > 1 ? idx + 1 : ''}
                  </div>
                  <div className="mt-1 text-sm font-medium text-zinc-200">{summary.name}</div>
                  <ul className="mt-1 space-y-0.5 text-sm text-zinc-400">
                    {summary.lines.map((line) => (
                      <li key={line.label}>
                        {line.label}: <span className="text-zinc-200">{line.value}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : null}

          {deal.notes?.trim() ? (
            <div className="mt-4 border-t border-zinc-800 pt-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Notes</div>
              <p className="mt-1 text-sm leading-relaxed text-zinc-300">{deal.notes.trim()}</p>
            </div>
          ) : null}
        </div>

        {declineConfirm ? (          <div className="mt-4 rounded-2xl border border-rose-500/40 bg-rose-950/40 p-4 text-sm text-rose-100">
            <p className="text-center">
              Decline <span className="font-semibold text-white">{label}</span>? This kills the stake
              for everyone.
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
                Yes, decline
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
              onClick={() => onOfferNewTerms?.()}
              className="w-full rounded-2xl bg-zinc-800 px-4 py-3 text-sm font-semibold text-cyan-200 touch-manipulation disabled:opacity-50"
            >
              Offer new terms
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
