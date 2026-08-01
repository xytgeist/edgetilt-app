import { APP_MODAL_OVERLAY_CLASS, APP_MODAL_SHEET_PANEL_CLASS } from '../../constants/appZIndex.js'
import { fmtPoker$ } from '../poker-bankroll/pokerBankrollMath.js'
import { sliceDisplayName } from './pokerStableApi.js'
import {
  dealTermsHeader,
  pricingModeLabel,
  rakebackModeLabel,
  sliceTermsSummary,
  termsPayloadToFormState,
} from './pokerStableTerms.js'
import {
  POKER_STABLE_SLICE_INNER_CLASS,
  pokerStableSliceCardClass,
  pokerStableSliceTitleClass,
  pokerStableSliceToneAttr,
} from './pokerStableSliceTone.js'

function TermsSliceCard({ slice, idx, profilesById, proposed = false }) {
  const summary = sliceTermsSummary(slice, profilesById)
  return (
    <div
      data-poker-stable-slice={idx}
      data-poker-stable-slice-tone={pokerStableSliceToneAttr(idx)}
      className={pokerStableSliceCardClass(idx)}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span
          className={`text-xs font-black uppercase tracking-wide ${pokerStableSliceTitleClass(idx)}`}
        >
          {summary.name}
          {proposed ? ' (proposed)' : ''}
        </span>
        {slice.status ? (
          <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-bold uppercase text-zinc-400">
            {slice.status}
          </span>
        ) : null}
      </div>
      <div className={`${POKER_STABLE_SLICE_INNER_CLASS} space-y-1 text-sm text-zinc-300`}>
        <p>{summary.action}</p>
        <p>{summary.pricing}</p>
        <p>{summary.rake}</p>
        {(slice.guest_phone || slice.guest_email) && slice.counterparty_kind === 'guest' ? (
          <p className="text-xs text-zinc-500">
            {slice.guest_phone ? `SMS ${slice.guest_phone}` : null}
            {slice.guest_phone && slice.guest_email ? ' · ' : null}
            {slice.guest_email ? slice.guest_email : null}
          </p>
        ) : null}
      </div>
    </div>
  )
}

/**
 * Read-only stake terms + optional accept/decline for backer-proposed revisions.
 */
export default function PokerStableDealTermsSheet({
  deal,
  slices = [],
  proposedPayload = null,
  profilesById = {},
  userId,
  saving = false,
  onClose,
  onEdit,
  onAcceptProposal,
  onDeclineProposal,
  onError,
}) {
  if (!deal) return null

  const isStakee = deal.stakee_user_id === userId
  const hasProposal = Boolean(deal.stakee_terms_ack_required && proposedPayload)
  const proposedState = proposedPayload
    ? termsPayloadToFormState(proposedPayload, profilesById)
    : null
  const proposedSlices =
    proposedPayload?.slices?.map((sl, idx) => ({
      ...sl,
      counterparty_kind: sl.counterparty_kind || sl.counterpartyKind,
      action_pct: sl.action_pct ?? sl.actionPct,
      pricing_mode: sl.pricing_mode || sl.pricingMode,
      player_profit_pct: sl.player_profit_pct ?? sl.playerProfitPct,
      markup_rate: sl.markup_rate ?? sl.markupRate,
      rakeback_mode: sl.rakeback_mode || sl.rakebackMode || 'disabled',
      rakeback_player_pct: sl.rakeback_player_pct ?? sl.rakebackPlayerPct,
      guest_label: sl.guest_label || sl.guestLabel,
      guest_phone: sl.guest_phone || sl.guestPhone,
      guest_email: sl.guest_email || sl.guestEmail,
      staker_user_id: sl.staker_user_id || sl.stakerUserId,
      slice_index: idx,
      status: 'proposed',
    })) || []

  const canEdit =
    deal.status === 'pending' && !hasProposal && typeof onEdit === 'function'

  return (
    <div className={`${APP_MODAL_OVERLAY_CLASS} overflow-x-hidden`} onClick={onClose}>
      <div
        data-poker-stable-sheet
        className={`relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto ${APP_MODAL_SHEET_PANEL_CLASS}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-lg font-bold text-white">Stake terms</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-3 py-1.5 text-sm font-semibold text-zinc-400 touch-manipulation"
          >
            Close
          </button>
        </div>

        {hasProposal && isStakee ? (
          <div
            data-poker-stake-notice
            className="mb-4 rounded-2xl border border-amber-500/40 bg-amber-950/40 px-4 py-3 text-sm text-amber-100"
          >
            A backer proposed new terms. Review below and accept to update your stake, or decline to
            keep your current terms.
          </div>
        ) : null}

        <div className="mb-4 rounded-2xl border border-zinc-700/80 bg-zinc-900/60 p-4">
          <p className="text-sm font-semibold text-white">{deal.label || 'Cash backing'}</p>
          <p className="mt-1 text-sm text-zinc-400">{dealTermsHeader(deal)}</p>
          {deal.is_migration ? (
            <p className="mt-2 text-xs text-zinc-500">
              Migration · stake-wide P/L{' '}
              {deal.stake_wide_starting_pl != null
                ? fmtPoker$(Number(deal.stake_wide_starting_pl))
                : '—'}
              {deal.lifetime_pl_display != null
                ? ` · lifetime ${fmtPoker$(Number(deal.lifetime_pl_display))}`
                : ''}
            </p>
          ) : null}
        </div>

        {hasProposal ? (
          <>
            <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-zinc-500">
              Current terms
            </h4>
            <div className="mb-4 space-y-3">
              {slices.map((slice, idx) => (
                <TermsSliceCard
                  key={slice.id || `cur-${idx}`}
                  slice={slice}
                  idx={idx}
                  profilesById={profilesById}
                />
              ))}
            </div>
            <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-amber-300/90">
              Proposed terms
            </h4>
            {proposedState ? (
              <p className="mb-2 text-xs text-zinc-500">
                {dealTermsHeader({
                  ...deal,
                  label: proposedState.label || deal.label,
                  baseline_bankroll: proposedState.baseline,
                  starting_roll: proposedState.startingRoll,
                  is_migration: proposedState.isMigration,
                  stake_wide_starting_pl: proposedState.stakeWidePl,
                  lifetime_pl_display: proposedState.lifetimePl,
                })}
              </p>
            ) : null}
            <div className="mb-4 space-y-3">
              {proposedSlices.map((slice, idx) => (
                <TermsSliceCard
                  key={`prop-${idx}`}
                  slice={slice}
                  idx={idx}
                  profilesById={profilesById}
                  proposed
                />
              ))}
            </div>
          </>
        ) : (
          <div className="mb-4 space-y-3">
            {slices.map((slice, idx) => (
              <TermsSliceCard
                key={slice.id || idx}
                slice={slice}
                idx={idx}
                profilesById={profilesById}
              />
            ))}
          </div>
        )}

        <div className="space-y-2">
          {hasProposal && isStakee ? (
            <>
              <button
                type="button"
                disabled={saving}
                onClick={() => void onAcceptProposal?.()}
                className="w-full rounded-3xl bg-emerald-600 py-3.5 text-base font-bold text-white touch-manipulation disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Accept proposed terms'}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void onDeclineProposal?.()}
                className="w-full rounded-2xl bg-zinc-800 py-3 text-sm font-semibold text-zinc-200 touch-manipulation disabled:opacity-50"
              >
                Decline proposal
              </button>
            </>
          ) : null}
          {canEdit ? (
            <button
              type="button"
              disabled={saving}
              onClick={() => {
                onError?.('')
                onEdit?.()
              }}
              className="w-full rounded-2xl border border-zinc-600 py-3 text-sm font-semibold text-zinc-200 touch-manipulation disabled:opacity-50"
            >
              Edit terms
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}