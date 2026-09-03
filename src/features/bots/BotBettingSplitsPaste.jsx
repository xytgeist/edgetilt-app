import { useCallback, useEffect, useMemo, useState } from 'react'

const SPORT_OPTIONS = [
  { id: 'americanfootball_ncaaf', label: 'CFB' },
  { id: 'americanfootball_nfl', label: 'NFL' },
]

const SOURCE_OPTIONS = [
  { id: 'action_pro', label: 'Action PRO' },
  { id: 'vsin_pro', label: 'VSiN Pro' },
  { id: 'manual', label: 'Manual / other' },
]

const emptyForm = () => ({
  sport_key: 'americanfootball_ncaaf',
  away_team: '',
  home_team: '',
  commence_time: '',
  event_id: '',
  home_ticket_pct: '',
  home_handle_pct: '',
  over_ticket_pct: '',
  over_handle_pct: '',
  source: 'action_pro',
  notes: '',
})

function clampPct(n) {
  if (!Number.isFinite(n)) return null
  return Math.max(0, Math.min(100, Math.round(n * 10) / 10))
}

/**
 * Paste ticket% / handle% from Action PRO or VSiN before slate lock.
 * Chedda reads these; no scraping.
 */
export default function BotBettingSplitsPaste({ supabaseClient, setToast }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(emptyForm)

  const awayTicket = useMemo(() => {
    const home = clampPct(Number(form.home_ticket_pct))
    return home == null ? null : clampPct(100 - home)
  }, [form.home_ticket_pct])

  const awayHandle = useMemo(() => {
    const home = clampPct(Number(form.home_handle_pct))
    return home == null ? null : clampPct(100 - home)
  }, [form.home_handle_pct])

  const loadRows = useCallback(async () => {
    if (!supabaseClient) return
    setLoading(true)
    try {
      const { data, error } = await supabaseClient
        .from('syndicate_betting_splits')
        .select('*')
        .eq('active', true)
        .order('updated_at', { ascending: false })
        .limit(80)
      if (error) throw error
      setRows(data || [])
    } catch (err) {
      console.error('Failed to load betting splits:', err)
      setToast?.(`Failed to load splits: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }, [supabaseClient, setToast])

  useEffect(() => {
    loadRows()
  }, [loadRows])

  const setField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const handleSave = async (e) => {
    e?.preventDefault?.()
    if (!supabaseClient) return

    const homeTicket = clampPct(Number(form.home_ticket_pct))
    const homeHandle = clampPct(Number(form.home_handle_pct))
    const awayT = awayTicket
    const awayH = awayHandle
    const homeTeam = form.home_team.trim()
    const awayTeam = form.away_team.trim()

    if (!homeTeam || !awayTeam) {
      setToast?.('Home and away team required.')
      return
    }
    if (homeTicket == null || homeHandle == null || awayT == null || awayH == null) {
      setToast?.('Enter home ticket % and home handle % (0-100). Away auto-fills.')
      return
    }

    setSaving(true)
    try {
      const payload = {
        sport_key: form.sport_key,
        home_team: homeTeam,
        away_team: awayTeam,
        commence_time: form.commence_time ? new Date(form.commence_time).toISOString() : null,
        event_id: form.event_id.trim() || null,
        home_ticket_pct: homeTicket,
        home_handle_pct: homeHandle,
        away_ticket_pct: awayT,
        away_handle_pct: awayH,
        over_ticket_pct: form.over_ticket_pct !== '' ? clampPct(Number(form.over_ticket_pct)) : null,
        over_handle_pct: form.over_handle_pct !== '' ? clampPct(Number(form.over_handle_pct)) : null,
        source: form.source,
        notes: form.notes.trim() || null,
        active: true,
        updated_at: new Date().toISOString(),
      }

      // Prefer update by event_id; else insert new active row
      if (payload.event_id) {
        const { data: existing } = await supabaseClient
          .from('syndicate_betting_splits')
          .select('id')
          .eq('event_id', payload.event_id)
          .eq('active', true)
          .maybeSingle()
        if (existing?.id) {
          const { error } = await supabaseClient
            .from('syndicate_betting_splits')
            .update(payload)
            .eq('id', existing.id)
          if (error) throw error
        } else {
          const { error } = await supabaseClient.from('syndicate_betting_splits').insert(payload)
          if (error) throw error
        }
      } else {
        const { error } = await supabaseClient.from('syndicate_betting_splits').insert(payload)
        if (error) throw error
      }

      setToast?.(`Saved splits: ${awayTeam} @ ${homeTeam} (tickets ${homeTicket}/${awayT}, handle ${homeHandle}/${awayH})`)
      setForm(emptyForm())
      await loadRows()
    } catch (err) {
      console.error('Save splits failed:', err)
      setToast?.(`Save failed: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  const handleDeactivate = async (id) => {
    if (!supabaseClient || !id) return
    try {
      const { error } = await supabaseClient
        .from('syndicate_betting_splits')
        .update({ active: false, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
      setToast?.('Split row deactivated.')
      await loadRows()
    } catch (err) {
      setToast?.(`Deactivate failed: ${err.message}`)
    }
  }

  return (
    <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/60 p-4 text-zinc-100 shadow-lg space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/80 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-base font-bold text-white tracking-wide">
              Chedda splits paste
            </span>
            <span className="rounded bg-amber-950/80 px-2 py-0.5 text-[10.5px] font-bold text-amber-300 ring-1 ring-amber-500/30">
              Action / VSiN
            </span>
          </div>
          <p className="mt-0.5 text-xs text-zinc-400 max-w-2xl">
            Once per slate before publish: open Action PRO (or VSiN), copy home bet% and money%, paste here.
            Away auto-fills to 100. Chedda votes on real divergence; we do not scrape.
          </p>
        </div>
        <button
          type="button"
          onClick={loadRows}
          disabled={loading}
          className="rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:text-white hover:bg-zinc-800 transition"
        >
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      <form onSubmit={handleSave} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-xs">
        <label className="space-y-1">
          <span className="text-zinc-500">Sport</span>
          <select
            value={form.sport_key}
            onChange={(e) => setField('sport_key', e.target.value)}
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-white"
          >
            {SPORT_OPTIONS.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-zinc-500">Source</span>
          <select
            value={form.source}
            onChange={(e) => setField('source', e.target.value)}
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-white"
          >
            {SOURCE_OPTIONS.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-zinc-500">Kickoff (optional)</span>
          <input
            type="datetime-local"
            value={form.commence_time}
            onChange={(e) => setField('commence_time', e.target.value)}
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-white"
          />
        </label>
        <label className="space-y-1">
          <span className="text-zinc-500">Away team</span>
          <input
            value={form.away_team}
            onChange={(e) => setField('away_team', e.target.value)}
            placeholder="Ohio State"
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-white"
            required
          />
        </label>
        <label className="space-y-1">
          <span className="text-zinc-500">Home team</span>
          <input
            value={form.home_team}
            onChange={(e) => setField('home_team', e.target.value)}
            placeholder="Texas"
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-white"
            required
          />
        </label>
        <label className="space-y-1">
          <span className="text-zinc-500">Odds event id (optional)</span>
          <input
            value={form.event_id}
            onChange={(e) => setField('event_id', e.target.value)}
            placeholder="from Odds API if you have it"
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-white"
          />
        </label>
        <label className="space-y-1">
          <span className="text-zinc-500">Home ticket % (bets)</span>
          <input
            type="number"
            min={0}
            max={100}
            step={0.1}
            value={form.home_ticket_pct}
            onChange={(e) => setField('home_ticket_pct', e.target.value)}
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-white"
            required
          />
        </label>
        <label className="space-y-1">
          <span className="text-zinc-500">Home handle % (money)</span>
          <input
            type="number"
            min={0}
            max={100}
            step={0.1}
            value={form.home_handle_pct}
            onChange={(e) => setField('home_handle_pct', e.target.value)}
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-white"
            required
          />
        </label>
        <div className="rounded-md border border-zinc-800 bg-zinc-900/50 px-2 py-1.5 space-y-0.5">
          <div className="text-zinc-500">Away auto</div>
          <div className="tabular-nums text-zinc-200">
            tickets {awayTicket != null ? awayTicket : 'n/a'}% · handle {awayHandle != null ? awayHandle : 'n/a'}%
          </div>
        </div>
        <label className="space-y-1">
          <span className="text-zinc-500">Over ticket % (optional)</span>
          <input
            type="number"
            min={0}
            max={100}
            step={0.1}
            value={form.over_ticket_pct}
            onChange={(e) => setField('over_ticket_pct', e.target.value)}
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-white"
          />
        </label>
        <label className="space-y-1">
          <span className="text-zinc-500">Over handle % (optional)</span>
          <input
            type="number"
            min={0}
            max={100}
            step={0.1}
            value={form.over_handle_pct}
            onChange={(e) => setField('over_handle_pct', e.target.value)}
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-white"
          />
        </label>
        <label className="space-y-1 sm:col-span-2 lg:col-span-3">
          <span className="text-zinc-500">Notes</span>
          <input
            value={form.notes}
            onChange={(e) => setField('notes', e.target.value)}
            placeholder="e.g. Action PRO · Fri 6pm PT"
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-white"
          />
        </label>
        <div className="sm:col-span-2 lg:col-span-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-amber-600 hover:bg-amber-500 px-4 py-2 text-xs font-bold text-black transition disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save splits for Chedda'}
          </button>
        </div>
      </form>

      <div className="overflow-x-auto">
        <div className="text-[10px] text-zinc-500 mb-1">Active pastes</div>
        <table className="w-full text-[11px] text-left">
          <thead className="text-zinc-500 border-b border-zinc-800">
            <tr>
              <th className="py-1 pr-2">Matchup</th>
              <th className="py-1 pr-2">Sport</th>
              <th className="py-1 pr-2">Tickets H/A</th>
              <th className="py-1 pr-2">Handle H/A</th>
              <th className="py-1 pr-2">Source</th>
              <th className="py-1"> </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-zinc-900 text-zinc-300">
                <td className="py-1 pr-2">{r.away_team} @ {r.home_team}</td>
                <td className="py-1 pr-2 text-zinc-500">{r.sport_key?.includes('ncaaf') ? 'CFB' : 'NFL'}</td>
                <td className="py-1 pr-2 tabular-nums">{r.home_ticket_pct}/{r.away_ticket_pct}</td>
                <td className="py-1 pr-2 tabular-nums">{r.home_handle_pct}/{r.away_handle_pct}</td>
                <td className="py-1 pr-2">{r.source}</td>
                <td className="py-1">
                  <button
                    type="button"
                    onClick={() => handleDeactivate(r.id)}
                    className="text-[10px] text-zinc-500 hover:text-rose-300"
                  >
                    Off
                  </button>
                </td>
              </tr>
            ))}
            {!rows.length && !loading && (
              <tr>
                <td colSpan={6} className="py-3 text-zinc-500">
                  No pastes yet. After Action PRO is live, drop Friday/Saturday numbers here before slate publish.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
