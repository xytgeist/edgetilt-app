import { APP_MODAL_OVERLAY_CLASS, APP_MODAL_SHEET_PANEL_CLASS } from '../../constants/appZIndex.js'
import { fmtPoker$ } from '../poker-bankroll/pokerBankrollMath.js'
import { dealTypeLabel } from './pokerStableMath.js'
import { dealStakeeDisplayName } from './pokerStableTerms.js'

/**
 * Backer-facing sheet after a horse stake is closed, revoked, or declined.
 * Manual archive only ... carousel keeps the card until the backer taps Archive.
 */
export default function PokerStableClosedHorseSheet({
  deal,
  profilesById = {},
  saving = false,
  onClose,
  onArchive,
  onDelete,
}) {
  if (!deal) return null

  const label = deal.label?.trim() || dealTypeLabel(deal.deal_type) || 'Cash backing'
  const playerName = dealStakeeDisplayName(deal, profilesById) || 'The player'
  const closedAt = deal.settled_at || deal.updated_at || deal.responded_at
  const closedLabel = closedAt
    ? new Date(closedAt).toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : null
  const isDeclined = deal.status === 'declined'
  const isRevoked = deal.status === 'revoked'

  return (
    <div className={`${APP_MODAL_OVERLAY_CLASS} overflow-x-hidden`} onClick={onClose}>
      <div
        data-poker-stable-closed-horse-sheet
        className={`relative z-10 w-full max-w-lg max-h-[85dvh] overflow-y-auto ${APP_MODAL_SHEET_PANEL_CLASS}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">Closed stake</p>
            <h3 className="mt-1 text-lg font-bold text-white">{label}</h3>
            <p className="mt-0.5 text-xs text-zinc-500">{dealTypeLabel(deal.deal_type)}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-3 py-1.5 text-sm font-semibold text-zinc-400 touch-manipulation"
          >
            Close
          </button>
        </div>

        <div className="rounded-2xl border border-zinc-700/70 bg-zinc-950/70 p-4 text-sm leading-relaxed text-zinc-300">
          {isDeclined ? (
            <p>This stake was declined and is no longer active.</p>
          ) : isRevoked ? (
            <p>
              This stake was revoked. Sessions stay on {playerName}&apos;s Bankroll history. Archive
              this card when you are ready to move it out of the carousel.
            </p>
          ) : (
            <p>
              This stake was closed{closedLabel ? ` on ${closedLabel}` : ''}. Archive this card when
              you are ready to move it out of the carousel.
            </p>
          )}
        </div>

        <dl className="mt-4 space-y-2 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-zinc-500">Player</dt>
            <dd className="text-right font-medium text-zinc-100">{playerName}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-zinc-500">Baseline</dt>
            <dd className="text-right font-medium text-zinc-100">
              {fmtPoker$(Number(deal.baseline_bankroll) || 0)}
            </dd>
          </div>
        </dl>

        <button
          type="button"
          disabled={saving}
          onClick={() => onArchive?.()}
          className="mt-5 w-full rounded-2xl bg-amber-600 py-3.5 text-base font-bold text-white touch-manipulation hover:bg-amber-500 active:bg-amber-700 disabled:opacity-50"
        >
          Archive stake
        </button>
        <p className="mt-2 text-center text-xs text-zinc-500">
          Moves this stake to your Closed stakes list. You can review it there anytime.
        </p>

        <button
          type="button"
          disabled={saving}
          onClick={() => onDelete?.()}
          className="mt-6 w-full py-2 text-sm font-semibold text-rose-400 touch-manipulation disabled:opacity-50"
        >
          {saving ? 'Deleting…' : 'Delete from Stable'}
        </button>
        <p className="mt-1 text-center text-xs text-zinc-500">
          Removes this stake from your carousel and Closed stakes. Does not erase the player&apos;s
          history.
        </p>
      </div>
    </div>
  )
}
