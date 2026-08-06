import { triggerTapHapticLight } from '../../utils/tapHaptic.js'
import { formatPokerStableCommitDate } from './pokerStableTerms.js'

/**
 * Pending periodic/close settle review banner (player stake card + backer horse card).
 */
export default function PokerStableSettleNeedsAttnBanner({
  counterpartyName = 'Counterparty',
  settleCount = 1,
  /** Oldest pending settle created_at (ISO) */
  oldestSettleAt = null,
  /** Newest pending settle created_at (ISO) when count > 1 */
  newestSettleAt = null,
  onReview,
  className = '',
}) {
  const count = Math.max(1, Number(settleCount) || 1)
  const oldestLabel = formatPokerStableCommitDate(oldestSettleAt)
  const newestLabel = formatPokerStableCommitDate(newestSettleAt)
  const dateBit =
    count > 1 && oldestLabel && newestLabel
      ? `${oldestLabel} – ${newestLabel}`
      : oldestLabel || newestLabel || ''
  const settlePhrase =
    count === 1 ? 'a settlement' : `${count} settlements`
  const datePhrase = dateBit ? ` (${dateBit})` : ''

  return (
    <div
      data-poker-stake-needs-attn
      className={`rounded-xl border border-amber-500/25 bg-amber-950/30 px-3 py-2.5 text-left ${className}`}
    >
      <p className="text-xs leading-snug text-amber-100/95">
        <span className="font-bold uppercase tracking-wide text-amber-300/90">Needs attn:</span>{' '}
        {counterpartyName} logged {settlePhrase}
        {datePhrase}. Open the stake to review and commit.
      </p>
      <button
        type="button"
        data-poker-stake-needs-attn-btn
        onClick={() => {
          triggerTapHapticLight()
          onReview?.()
        }}
        className="mt-2 rounded-lg bg-amber-500/20 px-3 py-1.5 text-[11px] font-bold text-amber-100 touch-manipulation active:bg-amber-500/30"
      >
        Review stake
      </button>
    </div>
  )
}
