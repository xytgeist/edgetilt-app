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
  SETTLE_BLOCKED_PENDING_COMMIT_MESSAGE,
  settleBlockedByPendingCommit,
  sliceTermsSummary,
  stakeDealCanBeCancelled,
  stakeeCanOpenLedger,
  stakeeCanSettleStake,
} from './pokerStableTerms.js'
import {
  pokerStableSliceCardClass,
  pokerStableSliceStatusClass,
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
  deal,
  profilesById,
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
  const summary = sliceTermsSummary(slice, profilesById, { deal })
  return (
    <div
      data-poker-stable-slice={idx}
      data-poker-stable-slice-tone={pokerStableSliceToneAttr(idx)}
      className={pokerStableSliceCardClass(idx)}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className={pokerStableSliceTitleClass(idx)}>{summary.name}</span>
        {slice.status ? (
          <span
            className={`rounded-md bg-zinc-800/80 px-2 py-0.5 ${pokerStableSliceStatusClass(idx, slice.status)}`}
          >
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
        {slice.guest_email && slice.counterparty_kind === 'guest' ? (
          <p className="text-xs text-zinc-500">{slice.guest_email}</p>
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
 * Read-only stake terms (view, guest reassign, ledger, settle, cancel/revoke).
 */
export default function PokerStableDealTermsSheet({
  deal,
  slices = [],
  profilesById = {},
  userId,
  supabaseClient,
  saving = false,
  onClose,
  onReassignGuest,
  onCancelStake,
  onPeriodicSettle,
  onCloseStake,
  onOpenLedger,
  dealRoll = null,
  pendingCommits = [],
  onError,
}) {
  const [reassignSliceId, setReassignSliceId] = useState(null)
  const [periodicSettleOpen, setPeriodicSettleOpen] = useState(false)
  const [closeStakeOpen, setCloseStakeOpen] = useState(false)

  if (!deal) return null

  const isStakee = deal.stakee_user_id === userId
  const settleBlockedPending = settleBlockedByPendingCommit(pendingCommits, deal.id)

  // Backers only see their own slice(s). Player (stakee) still sees the full syndicate.
  const visibleSlices = isStakee
    ? slices
    : (slices || []).filter((s) => s.staker_user_id === userId)

  const canCancel =
    isStakee &&
    stakeDealCanBeCancelled(deal, slices, { userId }) &&
    typeof onCancelStake === 'function'
  const canOpenLedger =
    stakeeCanOpenLedger(deal, { userId }) && typeof onOpenLedger === 'function'
  const canSettleBase =
    stakeeCanSettleStake(deal, slices, { userId }) &&
    (typeof onPeriodicSettle === 'function' || typeof onCloseStake === 'function')
  const canSettle = canSettleBase
  const showPeriodicSettle = canSettleBase && dealCanPeriodicSettle(deal, dealRoll)
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

        {isStakee && deal.status === 'revoked' ? (
          <div
            data-poker-stable-sheet-hint
            className="mb-4 border-l-2 border-rose-500/60 pl-3 text-xs leading-relaxed text-rose-200/90"
          >
            A backer revoked this stake. Close the stake to archive it, or delete if still allowed.
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

        <div className="mb-4 space-y-2">
          {visibleSlices.map((slice, idx) => (
            <TermsSliceCard
              key={slice.id || idx}
              slice={slice}
              idx={typeof slice.slice_index === 'number' ? slice.slice_index : idx}
              deal={deal}
              profilesById={profilesById}
              showReassign={
                canReassignGuestSlice({ deal, slice, userId }) &&
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

        <div className="space-y-2">
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
              {settleBlockedPending ? (
                <p
                  data-poker-stable-settle-blocked
                  className="border-l-2 border-amber-500/70 pl-3 text-xs leading-relaxed text-amber-100"
                >
                  {SETTLE_BLOCKED_PENDING_COMMIT_MESSAGE}
                </p>
              ) : (
                <p className="text-xs text-zinc-500">
                  Profit above baseline: {fmtPoker$(profitUp)}
                  {showPeriodicSettle
                    ? ' · periodic keeps the stake open; close merges sessions into personal history.'
                    : ' · close settles the package and merges sessions into personal history.'}
                </p>
              )}
              {showPeriodicSettle && typeof onPeriodicSettle === 'function' ? (
                <button
                  type="button"
                  disabled={saving || settleBlockedPending}
                  onClick={() => setPeriodicSettleOpen(true)}
                  className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white touch-manipulation disabled:opacity-50"
                >
                  Periodic settle
                </button>
              ) : null}
              {typeof onCloseStake === 'function' ? (
                <button
                  type="button"
                  disabled={saving || settleBlockedPending}
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
          profilesById={profilesById}
          userId={userId}
          saving={saving}
          onClose={() => setPeriodicSettleOpen(false)}
          onError={onError}
          onConfirm={(rakebackAmount, stakeReductionAmount) => {
            onError?.('')
            void onPeriodicSettle?.(rakebackAmount, stakeReductionAmount)
          }}
        />
      ) : null}

      {closeStakeOpen ? (
        <PokerStableCloseStakeSheet
          deal={deal}
          slices={slices}
          dealRoll={dealRoll}
          profilesById={profilesById}
          supabaseClient={supabaseClient}
          userId={userId}
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
