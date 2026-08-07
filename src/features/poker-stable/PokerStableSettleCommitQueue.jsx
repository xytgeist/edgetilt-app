import { useState } from 'react'
import { triggerTapHapticLight } from '../../utils/tapHaptic.js'
import { syncDealCommit } from './pokerStableApi.js'
import PokerStableCommitSyncPanel from './PokerStableCommitSyncPanel.jsx'
import {
  formatPokerStableCommitDate,
  isSettleCommitKind,
} from './pokerStableTerms.js'
import { pokerStableCommitEventLabel } from './pokerStableActivity.js'

/**
 * Backer/player Overview: settle Commit queue (oldest first) with dates + Commit all.
 * Non-settle pending commits stay as separate panels outside this component.
 */
export default function PokerStableSettleCommitQueue({
  supabaseClient,
  userId,
  settleCommits = [],
  saving = false,
  onSavingChange,
  onSynced,
  onError,
}) {
  const [committingAll, setCommittingAll] = useState(false)
  const queue = settleCommits.filter((row) => isSettleCommitKind(row.event_kind))
  if (!queue.length || !supabaseClient || !userId) return null

  const head = queue[0]
  const rest = queue.slice(1)
  const total = queue.length
  const headDate = formatPokerStableCommitDate(head.created_at)
  const dateRange =
    total === 1
      ? headDate
      : [formatPokerStableCommitDate(queue[0].created_at), formatPokerStableCommitDate(queue[total - 1].created_at)]
          .filter(Boolean)
          .join(' – ')

  async function commitAll() {
    if (committingAll || saving || !queue.length) return
    setCommittingAll(true)
    onSavingChange?.(true)
    onError?.('')
    try {
      let lastDealId = null
      for (const row of queue) {
        const { error } = await syncDealCommit(supabaseClient, row.commit_id)
        if (error) throw error
        lastDealId = row.deal_id
      }
      triggerTapHapticLight()
      onSynced?.({ status: 'synced', dealId: lastDealId, committedAll: true })
    } catch (e) {
      onError?.(e?.message || 'Could not commit settlements.')
      await onSynced?.({ status: 'partial' })
    } finally {
      setCommittingAll(false)
      onSavingChange?.(false)
    }
  }

  const busy = saving || committingAll

  return (
    <div data-poker-stable-settle-commit-queue className="mb-4 space-y-3 px-1.5 py-1">
      {total > 1 ? (
        <div
          data-poker-stable-settle-commit-queue-header
          className="rounded-2xl border border-zinc-700/40 bg-zinc-900/70 px-3 py-2.5 shadow-none"
        >
          <p className="text-xs font-bold uppercase tracking-wide text-zinc-400">
            {total} settlements to commit
          </p>
          {dateRange ? (
            <p className="mt-0.5 text-xs leading-relaxed text-zinc-400">{dateRange}</p>
          ) : null}
          <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
            Commit oldest first so each period hits your books in order.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void commitAll()}
            className="mt-2 w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-bold text-white touch-manipulation disabled:opacity-50"
          >
            {committingAll ? 'Committing…' : 'Commit all'}
          </button>
        </div>
      ) : null}

      <PokerStableCommitSyncPanel
        variant="inline"
        supabaseClient={supabaseClient}
        userId={userId}
        commitId={String(head.commit_id)}
        queueIndex={total > 1 ? 1 : null}
        queueTotal={total > 1 ? total : null}
        settleDateLabel={headDate}
        saving={busy}
        onSavingChange={onSavingChange}
        onSynced={onSynced}
        onError={onError}
      />

      {rest.length ? (
        <ul className="space-y-1.5 rounded-2xl border border-zinc-800 bg-zinc-900/40 px-3 py-2">
          {rest.map((row, i) => {
            const dateLabel = formatPokerStableCommitDate(row.created_at)
            const kindLabel = pokerStableCommitEventLabel(row.event_kind)
            return (
              <li
                key={row.commit_id}
                className="flex items-baseline justify-between gap-2 text-xs text-zinc-400"
              >
                <span>
                  <span className="font-semibold text-zinc-300">{i + 2} of {total}</span>
                  {dateLabel ? ` · ${dateLabel}` : ''}
                  {kindLabel ? ` · ${kindLabel}` : ''}
                </span>
                <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                  Next
                </span>
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}
