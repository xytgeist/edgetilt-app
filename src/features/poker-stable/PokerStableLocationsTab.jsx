import { useMemo } from 'react'
import { fmtPoker$, pokerSessionWinLoss } from '../poker-bankroll/pokerBankrollMath.js'
import { sliceDisplayName } from './pokerStableApi.js'

/**
 * Stable-wide locations rollup from on-stake sessions (read-only v1).
 */
export default function PokerStableLocationsTab({
  sessions = [],
  activeDeals = [],
  slicesByDeal = {},
  profilesById = {},
  userId,
  selectedDealId = null,
  onSelectDealId,
}) {
  const filteredSessions = useMemo(() => {
    if (!selectedDealId) return sessions
    return sessions.filter((s) => s.deal_id === selectedDealId)
  }, [sessions, selectedDealId])

  const byVenue = useMemo(() => {
    /** @type {Map<string, { name: string, sessions: number, profit: number }>} */
    const map = new Map()
    for (const s of filteredSessions) {
      const name = String(s.casino_name || s.stakes_label || 'Unknown').trim() || 'Unknown'
      const row = map.get(name) || { name, sessions: 0, profit: 0 }
      const wl = pokerSessionWinLoss(s) || 0
      row.sessions += 1
      row.profit += wl
      map.set(name, row)
    }
    return [...map.values()].sort((a, b) => b.sessions - a.sessions)
  }, [filteredSessions])

  return (
    <div data-poker-stable-locations className="pb-4">
      <div className="mb-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onSelectDealId?.(null)}
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            !selectedDealId ? 'bg-amber-600 text-white' : 'bg-zinc-800 text-zinc-300'
          }`}
        >
          All horses
        </button>
        {activeDeals.map((deal) => {
          const slice = (slicesByDeal[deal.id] || []).find((s) => s.staker_user_id === userId)
          const label = deal.label?.trim() || sliceDisplayName(slice || {}, profilesById)
          return (
            <button
              key={deal.id}
              type="button"
              onClick={() => onSelectDealId?.(deal.id)}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                selectedDealId === deal.id ? 'bg-amber-600 text-white' : 'bg-zinc-800 text-zinc-300'
              }`}
            >
              {label}
            </button>
          )
        })}
      </div>

      {byVenue.length === 0 ? (
        <p className="py-8 text-center text-sm text-zinc-500">No completed stake sessions yet.</p>
      ) : (
        <div className="space-y-2">
          {byVenue.map((row) => (
            <div
              key={row.name}
              className="rounded-2xl border border-zinc-800 bg-zinc-900/50 px-4 py-3"
            >
              <div className="font-semibold text-white">{row.name}</div>
              <div className="mt-1 flex justify-between text-xs text-zinc-400">
                <span>{row.sessions} sessions</span>
                <span
                  className={
                    row.profit >= 0 ? 'font-bold text-emerald-400' : 'font-bold text-rose-400'
                  }
                >
                  {fmtPoker$(row.profit)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
