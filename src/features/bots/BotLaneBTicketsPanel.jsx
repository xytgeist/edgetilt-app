import { useCallback, useEffect, useState } from 'react'
import { invokeLoungeOddsLaneBRefresh } from './botPortalApi.js'

/**
 * Lane B scraped tickets viewer + refresh (Syndicate ops).
 */
export default function BotLaneBTicketsPanel({
  supabaseClient,
  setToast,
  selectedSportKey,
  botSlug = 'sharpe-syndicate',
}) {
  const [busy, setBusy] = useState(false)
  const [tickets, setTickets] = useState([])
  const [refreshMeta, setRefreshMeta] = useState(null)
  const [sportKey, setSportKey] = useState(
    selectedSportKey?.includes('nfl') ? 'americanfootball_nfl' : 'americanfootball_ncaaf',
  )

  useEffect(() => {
    if (selectedSportKey?.includes('nfl')) setSportKey('americanfootball_nfl')
    else if (selectedSportKey?.includes('ncaaf') || selectedSportKey === 'cfb') {
      setSportKey('americanfootball_ncaaf')
    }
  }, [selectedSportKey])

  const runRefresh = useCallback(async () => {
    if (!supabaseClient) return
    setBusy(true)
    try {
      const result = await invokeLoungeOddsLaneBRefresh(supabaseClient, {
        sportKey,
        slug: botSlug || 'sharpe-syndicate',
      })
      if (result?.error && !result?.data) {
        setToast?.({ type: 'error', message: String(result.error.message || result.error) })
        return
      }
      const data = result?.data || result
      setTickets(Array.isArray(data?.tickets) ? data.tickets : [])
      setRefreshMeta(data?.refresh || null)
      const matched = data?.refresh?.matched_events ?? 0
      const parsed = data?.refresh?.tickets_parsed ?? 0
      setToast?.({
        type: data?.ok === false ? 'error' : 'success',
        message: data?.ok === false
          ? `Lane B soft-fail … ${data?.refresh?.errors?.[0] || data?.error || 'see status'}`
          : `Lane B: ${parsed} parsed, ${matched} matched events (lock still OK if zero)`,
      })
    } catch (e) {
      setToast?.({ type: 'error', message: String(e?.message || e) })
    } finally {
      setBusy(false)
    }
  }, [supabaseClient, sportKey, setToast, botSlug])

  useEffect(() => {
    runRefresh()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- initial load only

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-zinc-700/80 bg-zinc-900/60 p-4">
        <div className="flex flex-wrap items-center gap-3 justify-between">
          <div>
            <h3 className="text-sm font-semibold text-zinc-100">Lane B tickets</h3>
            <p className="text-xs text-zinc-400 mt-1 max-w-xl">
              Auto-discover VSiN / Covers / free-play cards before slate lock. Soft-fail never blocks
              Quorum or house lock. Boyds/Jack weight 0.5.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="rounded-lg border border-zinc-600 bg-zinc-950 text-zinc-100 text-xs px-2 py-1.5"
              value={sportKey}
              onChange={(e) => setSportKey(e.target.value)}
              disabled={busy}
            >
              <option value="americanfootball_ncaaf">CFB</option>
              <option value="americanfootball_nfl">NFL</option>
            </select>
            <button
              type="button"
              disabled={busy}
              onClick={runRefresh}
              className="rounded-lg bg-red-700/90 hover:bg-red-600 disabled:opacity-50 text-white text-xs font-medium px-3 py-1.5"
            >
              {busy ? 'Refreshing…' : 'Refresh now'}
            </button>
          </div>
        </div>
        {refreshMeta && (
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-zinc-400">
            <div>URLs: {refreshMeta.discovered_urls ?? '—'}</div>
            <div>Fetched: {refreshMeta.fetched_ok ?? '—'}</div>
            <div>Parsed: {refreshMeta.tickets_parsed ?? '—'}</div>
            <div>Matched: {refreshMeta.matched_events ?? '—'}</div>
          </div>
        )}
        {Array.isArray(refreshMeta?.errors) && refreshMeta.errors.length > 0 && (
          <p className="mt-2 text-[11px] text-amber-400/90">
            Notes: {refreshMeta.errors.slice(0, 3).join(' · ')}
          </p>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-700/80">
        <table className="min-w-full text-left text-xs">
          <thead className="bg-zinc-900/80 text-zinc-400">
            <tr>
              <th className="px-3 py-2 font-medium">Source</th>
              <th className="px-3 py-2 font-medium">Market</th>
              <th className="px-3 py-2 font-medium">Selection</th>
              <th className="px-3 py-2 font-medium">Line</th>
              <th className="px-3 py-2 font-medium">Matchup</th>
              <th className="px-3 py-2 font-medium">Wt</th>
              <th className="px-3 py-2 font-medium">Event</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {tickets.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-zinc-500 text-center">
                  No tickets yet … Refresh or wait for slate lock scrape.
                </td>
              </tr>
            )}
            {tickets.map((t, i) => (
              <tr key={`${t.source_id}-${t.selection}-${t.line}-${i}`} className="text-zinc-200">
                <td className="px-3 py-2 whitespace-nowrap">{t.source_id}</td>
                <td className="px-3 py-2">{t.market}</td>
                <td className="px-3 py-2">{t.selection}</td>
                <td className="px-3 py-2">{t.line ?? '—'}</td>
                <td className="px-3 py-2 max-w-[220px] truncate" title={t.matchup_text}>
                  {t.matchup_text}
                </td>
                <td className="px-3 py-2">{t.weight_factor}</td>
                <td className="px-3 py-2 font-mono text-[10px] text-zinc-500">
                  {t.event_id ? String(t.event_id).slice(0, 8) : 'unmatched'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
