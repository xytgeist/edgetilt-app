import { useState } from 'react'
import { APP_MODAL_OVERLAY_CLASS, APP_MODAL_SHEET_PANEL_CLASS } from '../../constants/appZIndex.js'
import { fmtPoker$ } from '../poker-bankroll/pokerBankrollMath.js'
import PokerStablePeriodicSettleSheet from './PokerStablePeriodicSettleSheet.jsx'
import PokerStableCloseStakeSheet from './PokerStableCloseStakeSheet.jsx'
import EdgeHandleTypeahead from './EdgeHandleTypeahead.jsx'
import { computeProfitAboveBaseline } from './pokerStableMath.js'
import {
  canReassignGuestSlice,
  dealCanPeriodicSettle,
  dealTermsMeta,
  sliceTermsSummary,
  stakeDealCanBeCancelled,
  stakeeCanEditDealTerms,
  stakeeCanOpenLedger,
  stakeeCanSettleStake,
  termsPayloadToFormState,
} from './pokerStableTerms.js'
import {
  pokerStableSliceCardClass,
  pokerStableSliceTitleClass,
  pokerStableSliceToneAttr,
} from './pokerStableSliceTone.js'

function GuestReassignPanel({
  supabaseClient,
  userId,
  saving,
  onCancel,
  onConfirm,
  onError,
}) {
  const [handle, setHandle] = useState('')
  const [selectedProfile, setSelectedProfile] = useState(null)

  return (
    <div
      data-poker-stable-guest-reassign-panel
      className="mt-3 rounded-2xl border p-3"
    >
      <p
        data-poker-stable-guest-reassign-hint
        className="mb-2 text-xs"
      >
        Link this guest backer to their Edge account. They will get a slice invite in Stable to
        accept.
      </p>
      <EdgeHandleTypeahead
        supabaseClient={supabaseClient}
        excludeUserId={userId}
        value={handle}
        onChange={setHandle}
        onSelectProfile={setSelectedProfile}
        selectedProfile={selectedProfile}
        placeholder="@handle"
      />
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={() => {
            onError?.('')
            if (!selectedProfile?.user_id) {
              onError?.('Pick an Edge user by handle.')
              return
            }
            void onConfirm?.(selectedProfile.user_id)
          }}
          className="flex-1 rounded-2xl py-2.5 text-sm font-semibold text-white touch-manipulation disabled:opacity-50"
          data-poker-stable-guest-reassign-primary-btn
        >
          {saving ? 'Saving…' : 'Assign to Edge user'}
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={onCancel}
          className="rounded-2xl bg-zinc-800 px-4 py-2.5 text-sm font-semibold text-zinc-300 touch-manipulation disabled:opacity-50"
          data-poker-stable-guest-reassign-cancel-btn
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

function TermsSliceCard({
  slice,
  idx,
  profilesById,
  proposed = false,
  showReassign = false,
  reassignOpen = false,
  userId,
  supabaseClient,
  saving,
  onReassignOpen,
  onReassignCancel,
  onReassignConfirm,
  onError,
}) {
  const summary = sliceTermsSummary(slice, profilesById)
  return (
    <div
      data-poker-stable-slice={idx}
      data-poker-stable-slice-tone={pokerStableSliceToneAttr(idx)}
      className={pokerStableSliceCardClass(idx)}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className={pokerStableSliceTitleClass(idx)}>
          {summary.name}
          {proposed ? ' (proposed)' : ''}
        </span>
        {slice.status ? (
          <span className="rounded-md bg-zinc-800 px-2 py-0.5 text-[10px] font-bold uppercase text-zinc-400">
            {slice.status}
          </span>
        ) : null}
      </div>
      <div className="space-y-1.5 text-sm text-zinc-300" data-poker-stable-slice-body>
        {summary.lines.map((line) => (
          <p key={line.label}>
            <span className="text-zinc-500">{line.label}: </span>
            {line.value}
          </p>
        ))}
        {(slice.guest_phone || slice.guest_email) && slice.counterparty_kind === 'guest' ? (
          <p className="text-xs text-zinc-500">
            {slice.guest_phone ? `SMS ${slice.guest_phone}` : null}
            {slice.guest_phone && slice.guest_email ? ' · ' : null}
            {slice.guest_email ? slice.guest_email : null}
          </p>
        ) : null}
      </div>
      {showReassign && !reassignOpen ? (
        <button
          type="button"
          disabled={saving}
          onClick={() => {
            onError?.('')
            onReassignOpen?.()
          }}
          className="mt-3 w-full rounded-xl border py-2.5 text-sm font-semibold touch-manipulation disabled:opacity-50"
          data-poker-stable-guest-reassign-btn
        >
          Assign to Edge user
        </button>
      ) : null}
      {showReassign && reassignOpen ? (
        <GuestReassignPanel
          userId={userId}
          supabaseClient={supabaseClient}
          saving={saving}
          onCancel={onReassignCancel}
          onConfirm={onReassignConfirm}
          onError={onError}
        />
      ) : null}
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
  supabaseClient,
  saving = false,
  onClose,
  onEdit,
  onAcceptProposal,
  onDeclineProposal,
  onReassignGuest,
  onCancelStake,
  onPeriodicSettle,
  onCloseStake,
  onOpenLedger,
  dealRoll = null,
  onError,
}) {
  const [reassignSliceId, setReassignSliceId] = useState(null)
  const [periodicSettleOpen, setPeriodicSettleOpen] = useState(false)
  const [closeStakeOpen, setCloseStakeOpen] = useState(false)

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
    isStakee &&
    stakeeCanEditDealTerms(deal, slices, { hasProposal }) &&
    typeof onEdit === 'function'
  const canCancel =
    isStakee &&
    stakeDealCanBeCancelled(deal, slices, { userId }) &&
    typeof onCancelStake === 'function'
  const canOpenLedger =
    stakeeCanOpenLedger(deal, { userId, hasProposal }) && typeof onOpenLedger === 'function'
  const canSettle =
    stakeeCanSettleStake(deal, slices, { userId, hasProposal }) &&
    (typeof onPeriodicSettle === 'function' || typeof onCloseStake === 'function')
  const showPeriodicSettle = canSettle && dealCanPeriodicSettle(deal, dealRoll)
  const rollValue =
    dealRoll?.overall_bankroll ?? deal.starting_roll ?? deal.baseline_bankroll ?? 0
  const profitUp = computeProfitAboveBaseline({
    baseline_bankroll: deal.baseline_bankroll,
    roll: rollValue,
  })

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
            className="mb-4 border-l-2 border-amber-500/70 pl-3 text-sm leading-relaxed text-amber-100"
          >
            A backer proposed new terms. Review below and accept to update your stake, or decline to
            keep your current terms.
          </div>
        ) : null}

        {!hasProposal && isStakee && deal.status === 'revoked' ? (
          <div
            data-poker-stable-sheet-hint
            className="mb-4 border-l-2 border-rose-500/60 pl-3 text-xs leading-relaxed text-rose-200/90"
          >
            A backer revoked this stake. Edit backers to re-offer, or close the stake to archive it.
          </div>
        ) : null}

        {!hasProposal && isStakee && deal.status === 'active' && canEdit ? (
          <div
            data-poker-stable-sheet-hint
            className="mb-4 border-l-2 border-zinc-600 pl-3 text-xs leading-relaxed text-zinc-400"
          >
            Guest backers are not on Edge ... you can edit terms here or assign a guest to their
            Edge account when they join.
          </div>
        ) : null}

        <div
          data-poker-stable-deal-summary
          className="mb-5 border-b border-zinc-700/80 pb-4"
        >
          <p className="text-base font-bold leading-snug text-white">{deal.label || 'Cash backing'}</p>
          {dealTermsMeta(deal) ? (
            <p className="mt-1 text-sm text-zinc-400">{dealTermsMeta(deal)}</p>
          ) : null}
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
            <div className="mb-4 space-y-2">
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
              <>
                <p className="mb-1 text-sm font-semibold text-amber-100">
                  {proposedState.label?.trim() || deal.label || 'Proposed terms'}
                </p>
                <p className="mb-2 text-xs text-zinc-500">
                  {dealTermsMeta({
                    ...deal,
                    baseline_bankroll: proposedState.baseline,
                    starting_roll: proposedState.startingRoll,
                    is_migration: proposedState.isMigration,
                    stake_wide_starting_pl: proposedState.stakeWidePl,
                    lifetime_pl_display: proposedState.lifetimePl,
                  })}
                </p>
              </>
            ) : null}
            <div className="mb-4 space-y-2">
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
          <div className="mb-4 space-y-2">
            {slices.map((slice, idx) => (
              <TermsSliceCard
                key={slice.id || idx}
                slice={slice}
                idx={idx}
                profilesById={profilesById}
                showReassign={
                  canReassignGuestSlice({ deal, slice, userId, hasProposal }) &&
                  typeof onReassignGuest === 'function'
                }
                reassignOpen={reassignSliceId === slice.id}
                userId={userId}
                supabaseClient={supabaseClient}
                saving={saving}
                onReassignOpen={() => setReassignSliceId(slice.id)}
                onReassignCancel={() => setReassignSliceId(null)}
                onReassignConfirm={async (stakerUserId) => {
                  await onReassignGuest?.({ sliceId: slice.id, stakerUserId })
                  setReassignSliceId(null)
                }}
                onError={onError}
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
                className="w-full rounded-xl bg-emerald-600 py-3.5 text-base font-bold text-white touch-manipulation disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Accept proposed terms'}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void onDeclineProposal?.()}
                className="w-full rounded-xl bg-zinc-800 py-3 text-sm font-semibold text-zinc-200 touch-manipulation disabled:opacity-50"
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
              data-poker-stable-terms-edit-btn
              className="w-full rounded-xl bg-zinc-100 py-3 text-sm font-semibold text-zinc-900 touch-manipulation disabled:opacity-50"
            >
              Edit terms
            </button>
          ) : null}
          {canOpenLedger ? (
            <>
              <h4 className="pt-1 text-[11px] font-bold uppercase tracking-wide text-zinc-500">
                Ledger
              </h4>
              <p className="text-xs text-zinc-500">
                Record top-ups and settlements with your backers.
              </p>
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  onError?.('')
                  onOpenLedger?.()
                }}
                className="w-full rounded-xl bg-zinc-800 py-3 text-sm font-semibold text-zinc-100 touch-manipulation disabled:opacity-50"
              >
                Open ledger
              </button>
            </>
          ) : null}
          {canSettle ? (
            <>
              <h4 className="pt-1 text-[11px] font-bold uppercase tracking-wide text-zinc-500">
                Settle stake
              </h4>
              <p className="text-xs text-zinc-500">
                Profit above baseline: {fmtPoker$(profitUp)}
                {showPeriodicSettle
                  ? ' · periodic keeps the stake open; close merges sessions into personal history.'
                  : ' · close settles the package and merges sessions into personal history.'}
              </p>
              {showPeriodicSettle && typeof onPeriodicSettle === 'function' ? (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setPeriodicSettleOpen(true)}
                  className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white touch-manipulation disabled:opacity-50"
                >
                  Periodic settle
                </button>
              ) : null}
              {typeof onCloseStake === 'function' ? (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setCloseStakeOpen(true)}
                  className={`w-full rounded-xl py-3 text-sm font-semibold touch-manipulation disabled:opacity-50 ${
                    showPeriodicSettle
                      ? 'bg-zinc-800 text-zinc-100'
                      : 'bg-emerald-600 font-bold text-white'
                  }`}
                >
                  Close stake
                </button>
              ) : null}
            </>
          ) : null}
          {canCancel ? (
            <button
              type="button"
              disabled={saving}
              onClick={() => void onCancelStake?.()}
              className="w-full rounded-xl py-3 text-sm font-semibold text-rose-400 touch-manipulation disabled:opacity-50"
            >
              {saving ? 'Deleting…' : 'Delete stake'}
            </button>
          ) : null}
        </div>
      </div>

      {periodicSettleOpen ? (
        <PokerStablePeriodicSettleSheet
          deal={deal}
          slices={slices}
          dealRoll={dealRoll}
          saving={saving}
          onClose={() => setPeriodicSettleOpen(false)}
          onError={onError}
          onConfirm={(rakebackAmount) => {
            onError?.('')
            void onPeriodicSettle?.(rakebackAmount)
          }}
        />
      ) : null}

      {closeStakeOpen ? (
        <PokerStableCloseStakeSheet
          deal={deal}
          slices={slices}
          dealRoll={dealRoll}
          saving={saving}
          onClose={() => setCloseStakeOpen(false)}
          onError={onError}
          onConfirm={(rakebackAmount) => {
            onError?.('')
            void onCloseStake?.(rakebackAmount)
          }}
        />
      ) : null}
    </div>
  )
}
