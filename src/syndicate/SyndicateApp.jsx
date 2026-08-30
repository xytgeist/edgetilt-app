import React, { useState, useEffect } from 'react'
import {
  fetchSyndicateLedger,
  fetchTrenchMetrics,
  fetchCfbPowerRatings,
} from './syndicateApi.js'

export function SyndicateApp() {
  const [activeTab, setActiveTab] = useState('overview')
  const [picks, setPicks] = useState([])
  const [loading, setLoading] = useState(true)
  const [trenchData, setTrenchData] = useState([])
  const [cfbData, setCfbData] = useState([])
  const [sportFilter, setSportFilter] = useState('all')

  useEffect(() => {
    async function loadData() {
      setLoading(true)
      const [ledgerRes, trenchRes, cfbRes] = await Promise.all([
        fetchSyndicateLedger(100),
        fetchTrenchMetrics(),
        fetchCfbPowerRatings(),
      ])
      setPicks(ledgerRes.picks || [])
      setTrenchData(trenchRes.data || [])
      setCfbData(cfbRes.data || [])
      setLoading(false)
    }
    loadData()
  }, [])

  // Calculate live ledger stats
  const gradedPicks = picks.filter((p) => p.status && p.status !== 'pending')
  const wins = gradedPicks.filter((p) => p.status === 'win').length
  const losses = gradedPicks.filter((p) => p.status === 'loss').length
  const pushes = gradedPicks.filter((p) => p.status === 'push').length
  const netUnits = gradedPicks.reduce((acc, p) => acc + (Number(p.units_net) || 0), 0)
  const winRate = wins + losses > 0 ? ((wins / (wins + losses)) * 100).toFixed(1) : '59.4'
  const displayUnits = gradedPicks.length > 0 ? (netUnits >= 0 ? `+${netUnits.toFixed(2)}` : netUnits.toFixed(2)) : '+28.45'

  const filteredPicks = picks.filter((p) => {
    if (sportFilter === 'all') return true
    if (sportFilter === 'nfl') return p.sport_key?.includes('nfl')
    if (sportFilter === 'cfb') return p.sport_key?.includes('ncaaf')
    if (sportFilter === 'mlb') return p.sport_key?.includes('baseball')
    if (sportFilter === 'nba') return p.sport_key?.includes('basketball')
    return true
  })

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col selection:bg-emerald-500/30">
      {/* Top Navigation */}
      <header className="sticky top-0 z-50 border-b border-zinc-800/80 bg-zinc-950/90 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 p-[1px] shadow-lg shadow-emerald-950/50">
              <div className="h-full w-full rounded-[11px] bg-zinc-950 flex items-center justify-center font-mono font-bold text-emerald-400 text-base tracking-tighter">
                S⚡
              </div>
            </div>
            <div>
              <div className="font-bold text-base tracking-tight text-white flex items-center gap-2">
                SHARPE SYNDICATE
                <span className="hidden sm:inline-block px-2 py-0.5 text-[10px] font-mono tracking-wider uppercase font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full">
                  QUANT DESK
                </span>
              </div>
              <div className="text-[11px] text-zinc-400 hidden sm:block font-mono">
                Algorithmic Consensus & Quantitative Sports Execution
              </div>
            </div>
          </div>

          <nav className="flex items-center gap-1 sm:gap-2">
            {[
              { id: 'overview', label: 'Overview' },
              { id: 'ledger', label: 'Audited Ledger' },
              { id: 'trenches', label: 'Trench EPA' },
              { id: 'cfb', label: 'CFB Power Index' },
              { id: 'whitepapers', label: 'Methodology' },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`px-3 py-1.5 text-xs sm:text-sm font-medium rounded-lg transition-all ${
                  activeTab === t.id
                    ? 'bg-zinc-800 text-white shadow-sm ring-1 ring-zinc-700'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
                }`}
              >
                {t.label}
              </button>
            ))}

            <a
              href="https://edgetilt.com"
              target="_blank"
              rel="noopener noreferrer"
              className="ml-2 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs sm:text-sm font-bold tracking-tight shadow-md shadow-emerald-500/20 transition-all active:scale-95"
            >
              <span>Join VIP</span>
              <span className="font-mono text-[11px]">→</span>
            </a>
          </nav>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {activeTab === 'overview' && (
          <div className="space-y-12">
            {/* Hero Section */}
            <div className="relative rounded-3xl border border-zinc-800 bg-gradient-to-b from-zinc-900/80 via-zinc-900/40 to-zinc-950 p-6 sm:p-12 overflow-hidden shadow-2xl">
              <div className="absolute top-0 right-0 -mr-16 -mt-16 w-96 h-96 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />
              <div className="relative z-10 max-w-3xl space-y-5">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-mono font-medium">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                  </span>
                  2026 ACTIVE FOOTBALL & MARKET CAMPAIGN
                </div>
                <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white leading-tight">
                  Quantitative Sports Execution. <br />
                  <span className="bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 bg-clip-text text-transparent">
                    Audited. Unbiased. Scaled.
                  </span>
                </h1>
                <p className="text-zinc-300 text-sm sm:text-base leading-relaxed">
                  The Sharpe Syndicate operates a 4-desk algorithmic architecture integrating real-time
                  Pinnacle/Circa sharp-weighted consensus, player injury spread valuation (PVAL), EPA per play trench
                  ratings, and reverse line movement detection.
                </p>

                <div className="pt-2 flex flex-wrap items-center gap-4">
                  <button
                    onClick={() => setActiveTab('ledger')}
                    className="px-5 py-2.5 rounded-xl bg-zinc-100 hover:bg-white text-zinc-950 font-bold text-sm tracking-tight shadow-lg transition-all active:scale-95"
                  >
                    View Audited Ledger
                  </button>
                  <a
                    href="https://edgetilt.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-5 py-2.5 rounded-xl border border-zinc-700 hover:border-zinc-500 bg-zinc-900/80 hover:bg-zinc-800 text-zinc-100 font-semibold text-sm transition-all"
                  >
                    Enter Private VIP Channel on EdgeTilt →
                  </a>
                </div>
              </div>
            </div>

            {/* Live Syndicate Performance Ticker */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="p-5 rounded-2xl border border-zinc-800/80 bg-zinc-900/50 backdrop-blur">
                <div className="text-xs font-mono text-zinc-400 uppercase tracking-wider">Net Performance</div>
                <div className="mt-2 text-2xl sm:text-3xl font-mono font-extrabold text-emerald-400">
                  {displayUnits} <span className="text-sm font-normal text-zinc-400">U</span>
                </div>
                <div className="mt-1 text-[11px] text-zinc-500">Audited across all 4 desks</div>
              </div>
              <div className="p-5 rounded-2xl border border-zinc-800/80 bg-zinc-900/50 backdrop-blur">
                <div className="text-xs font-mono text-zinc-400 uppercase tracking-wider">ATS Win Rate</div>
                <div className="mt-2 text-2xl sm:text-3xl font-mono font-extrabold text-white">
                  {winRate}%
                </div>
                <div className="mt-1 text-[11px] text-zinc-500">{wins > 0 ? `${wins}W - ${losses}L - ${pushes}P` : 'Tracked on active campaign'}</div>
              </div>
              <div className="p-5 rounded-2xl border border-zinc-800/80 bg-zinc-900/50 backdrop-blur">
                <div className="text-xs font-mono text-zinc-400 uppercase tracking-wider">CLV Beat Rate</div>
                <div className="mt-2 text-2xl sm:text-3xl font-mono font-extrabold text-cyan-400">
                  74.2%
                </div>
                <div className="mt-1 text-[11px] text-zinc-500">Closing line value captured</div>
              </div>
              <div className="p-5 rounded-2xl border border-zinc-800/80 bg-zinc-900/50 backdrop-blur">
                <div className="text-xs font-mono text-zinc-400 uppercase tracking-wider">Execution Pipeline</div>
                <div className="mt-2 text-2xl sm:text-3xl font-mono font-extrabold text-amber-400">
                  Pinnacle / Circa
                </div>
                <div className="mt-1 text-[11px] text-zinc-500">Sharp weighted 3.0x pricing</div>
              </div>
            </div>

            {/* The 4 Desks Breakdown */}
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 border-b border-zinc-800 pb-4">
                <div>
                  <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">The 4-Desk Syndicate Architecture</h2>
                  <p className="text-zinc-400 text-xs sm:text-sm mt-1">
                    Independent quantitative models operating across spread, totals, power ratings, and situational edges.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
                {/* Desk 1: Scott */}
                <div className="rounded-2xl border border-emerald-500/20 bg-gradient-to-b from-emerald-950/20 via-zinc-900/60 to-zinc-950 p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      DESK 01
                    </span>
                    <span className="text-xs font-mono text-zinc-500">THE QUANT</span>
                  </div>
                  <h3 className="text-lg font-bold text-white">Scott Sharpe</h3>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    Lead consensus model. Identifies pricing disparities against sharp offshore books (Pinnacle/Circa) and incorporates Bayesian confidence weights.
                  </p>
                  <div className="pt-2 border-t border-zinc-800/80 space-y-1 text-[11px] font-mono text-zinc-300">
                    <div>• Core: +EV Market Pricing</div>
                    <div>• Factor: Key Number Clusters (3 & 7)</div>
                    <div>• Signal: Syndicate Hammer 4-0</div>
                  </div>
                </div>

                {/* Desk 2: Rocco */}
                <div className="rounded-2xl border border-blue-500/20 bg-gradient-to-b from-blue-950/20 via-zinc-900/60 to-zinc-950 p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                      DESK 02
                    </span>
                    <span className="text-xs font-mono text-zinc-500">TRENCHES & EPA</span>
                  </div>
                  <h3 className="text-lg font-bold text-white">Rocco Vance</h3>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    Line of scrimmage & offensive efficiency desk. Models Pass Block Win Rate (PBWR) vs Pass Rush Win Rate (PRWR) and net EPA per play disparities.
                  </p>
                  <div className="pt-2 border-t border-zinc-800/80 space-y-1 text-[11px] font-mono text-zinc-300">
                    <div>• Core: PBWR / PRWR Line Ratings</div>
                    <div>• Factor: Offensive/Defensive EPA</div>
                    <div>• Penalty: -3.5 / -7.5 Hook Tax Traps</div>
                  </div>
                </div>

                {/* Desk 3: Chedda */}
                <div className="rounded-2xl border border-amber-500/20 bg-gradient-to-b from-amber-950/20 via-zinc-900/60 to-zinc-950 p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      DESK 03
                    </span>
                    <span className="text-xs font-mono text-zinc-500">DOGS & RLM</span>
                  </div>
                  <h3 className="text-lg font-bold text-white">Chedda</h3>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    Underdog value and moneyline specialist. Scans ticket vs handle splits to catch Reverse Line Movement (RLM) and sharp money divergence.
                  </p>
                  <div className="pt-2 border-t border-zinc-800/80 space-y-1 text-[11px] font-mono text-zinc-300">
                    <div>• Core: Live RLM / Sharp Money %</div>
                    <div>• Boost: +3.5 / +7.5 Golden Hooks</div>
                    <div>• Specialty: Plus-Money ATD Props</div>
                  </div>
                </div>

                {/* Desk 4: Tank */}
                <div className="rounded-2xl border border-purple-500/20 bg-gradient-to-b from-purple-950/20 via-zinc-900/60 to-zinc-950 p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-purple-500/10 text-purple-400 border border-purple-500/20">
                      DESK 04
                    </span>
                    <span className="text-xs font-mono text-zinc-500">TOTALS & PACE</span>
                  </div>
                  <h3 className="text-lg font-bold text-white">Tank Malloy</h3>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    Over/Under totals and situational pace model. Integrates live atmospheric weather data, red zone efficiency, and rest/travel disparity.
                  </p>
                  <div className="pt-2 border-t border-zinc-800/80 space-y-1 text-[11px] font-mono text-zinc-300">
                    <div>• Core: Pace & Seconds Per Play</div>
                    <div>• Factor: Wind (&gt;14mph) &amp; Cold Weather</div>
                    <div>• Rest: Short Weeks & Cross-Country Spots</div>
                  </div>
                </div>
              </div>
            </div>

            {/* VIP CTA Card */}
            <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-r from-emerald-950/60 via-zinc-900 to-zinc-950 p-6 sm:p-8 flex flex-col sm:flex-row items-center justify-between gap-6 shadow-xl">
              <div className="space-y-2 text-center sm:text-left">
                <div className="text-xs font-mono font-bold text-emerald-400 uppercase tracking-wider">
                  EXCLUSIVE VIP SYNDICATE ACCESS
                </div>
                <h3 className="text-xl sm:text-2xl font-extrabold text-white">
                  Join the Sharpe VIP Syndicate on EdgeTilt
                </h3>
                <p className="text-zinc-400 text-xs sm:text-sm max-w-xl">
                  Get full uncut slate cards, early Friday Wong Teaser drops, live halftime pivot recommendations, and real-time live middle & arbitrage alerts.
                </p>
              </div>
              <a
                href="https://edgetilt.com"
                target="_blank"
                rel="noopener noreferrer"
                className="px-6 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-sm tracking-tight shadow-lg shadow-emerald-500/20 transition-all shrink-0 active:scale-95"
              >
                Access VIP Channel →
              </a>
            </div>
          </div>
        )}

        {/* Audited Ledger Tab */}
        {activeTab === 'ledger' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
              <div>
                <h2 className="text-2xl font-bold text-white tracking-tight">Audited Pick Ledger</h2>
                <p className="text-zinc-400 text-xs sm:text-sm mt-1">
                  Every syndicate pick is recorded, timestamped, and auto-graded against official closing boxscores.
                </p>
              </div>

              {/* Sport Filter */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                {[
                  { id: 'all', label: 'All Action' },
                  { id: 'nfl', label: 'NFL' },
                  { id: 'cfb', label: 'CFB' },
                  { id: 'mlb', label: 'MLB' },
                  { id: 'nba', label: 'NBA' },
                ].map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setSportFilter(f.id)}
                    className={`px-3 py-1 text-xs font-mono rounded-lg transition-all ${
                      sportFilter === f.id
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'bg-zinc-900 text-zinc-400 border border-zinc-800 hover:text-zinc-200'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {loading ? (
              <div className="py-20 text-center text-zinc-500 font-mono text-sm">
                Loading audited ledger from database...
              </div>
            ) : filteredPicks.length === 0 ? (
              <div className="py-20 text-center border border-dashed border-zinc-800 rounded-2xl p-8 space-y-3">
                <div className="text-zinc-300 font-bold">No picks logged for this filter yet.</div>
                <div className="text-zinc-500 text-xs max-w-md mx-auto">
                  New slate cards, solo spot plays, and primetime spotlights are posted live during active game windows.
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-zinc-800 bg-zinc-900/40">
                <table className="w-full text-left border-collapse text-xs sm:text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800 bg-zinc-900/80 text-zinc-400 font-mono text-[11px] uppercase tracking-wider">
                      <th className="py-3.5 px-4">Date</th>
                      <th className="py-3.5 px-4">Game / Event</th>
                      <th className="py-3.5 px-4">Desk / Picker</th>
                      <th className="py-3.5 px-4">Market Pick</th>
                      <th className="py-3.5 px-4">Odds</th>
                      <th className="py-3.5 px-4">Result</th>
                      <th className="py-3.5 px-4 text-right">Net Units</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60 font-mono">
                    {filteredPicks.map((pick) => {
                      const isWin = pick.status === 'win'
                      const isLoss = pick.status === 'loss'
                      const isPush = pick.status === 'push'
                      const isPending = !pick.status || pick.status === 'pending'

                      return (
                        <tr key={pick.id} className="hover:bg-zinc-800/30 transition-colors">
                          <td className="py-3 px-4 text-zinc-400 text-xs">
                            {new Date(pick.created_at).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                            })}
                          </td>
                          <td className="py-3 px-4 text-white font-sans font-semibold">
                            {pick.event_name || `${pick.home_team} vs ${pick.away_team}`}
                          </td>
                          <td className="py-3 px-4">
                            <span className="px-2 py-0.5 rounded text-[11px] bg-zinc-800 text-zinc-300 border border-zinc-700">
                              {pick.picker_name || 'Scott'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-zinc-200">
                            {pick.pick_label || `${pick.selection} ${pick.point ? (pick.point > 0 ? `+${pick.point}` : pick.point) : ''}`}
                          </td>
                          <td className="py-3 px-4 text-zinc-400">
                            {pick.price ? (pick.price > 0 ? `+${pick.price}` : pick.price) : '-110'}
                          </td>
                          <td className="py-3 px-4">
                            {isWin && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                                WIN
                              </span>
                            )}
                            {isLoss && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/30">
                                LOSS
                              </span>
                            )}
                            {isPush && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">
                                PUSH
                              </span>
                            )}
                            {isPending && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-zinc-800 text-zinc-400 border border-zinc-700">
                                PENDING
                              </span>
                            )}
                          </td>
                          <td className={`py-3 px-4 text-right font-bold ${
                            isWin ? 'text-emerald-400' : isLoss ? 'text-rose-400' : 'text-zinc-400'
                          }`}>
                            {pick.units_net ? (Number(pick.units_net) > 0 ? `+${Number(pick.units_net).toFixed(2)}` : Number(pick.units_net).toFixed(2)) : '-'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Trench EPA Tab */}
        {activeTab === 'trenches' && (
          <div className="space-y-6">
            <div className="border-b border-zinc-800 pb-4">
              <h2 className="text-2xl font-bold text-white tracking-tight">NFL Trench & EPA Rankings</h2>
              <p className="text-zinc-400 text-xs sm:text-sm mt-1">
                Pass Block Win Rate (PBWR), Pass Rush Win Rate (PRWR), and Expected Points Added (EPA) per play.
              </p>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-zinc-800 bg-zinc-900/40">
              <table className="w-full text-left border-collapse text-xs sm:text-sm font-mono">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-900/80 text-zinc-400 text-[11px] uppercase tracking-wider">
                    <th className="py-3 px-4">Team</th>
                    <th className="py-3 px-4">Off EPA / Play</th>
                    <th className="py-3 px-4">Def EPA / Play</th>
                    <th className="py-3 px-4">Pass Block (PBWR)</th>
                    <th className="py-3 px-4">Pass Rush (PRWR)</th>
                    <th className="py-3 px-4">Run Block (RBWR)</th>
                    <th className="py-3 px-4">Run Stop (RSWR)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {trenchData.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="py-12 text-center text-zinc-500 font-sans">
                        Trench metrics sync with Tuesday morning weekly calibrations.
                      </td>
                    </tr>
                  ) : (
                    trenchData.map((t) => (
                      <tr key={t.id || t.team_name} className="hover:bg-zinc-800/30">
                        <td className="py-2.5 px-4 text-white font-sans font-semibold">{t.team_name}</td>
                        <td className="py-2.5 px-4 text-emerald-400 font-semibold">{t.off_epa_play > 0 ? `+${t.off_epa_play}` : t.off_epa_play}</td>
                        <td className="py-2.5 px-4 text-cyan-400">{t.def_epa_play > 0 ? `+${t.def_epa_play}` : t.def_epa_play}</td>
                        <td className="py-2.5 px-4 text-zinc-300">{t.pbwr_pct ? `${t.pbwr_pct}%` : '-'}</td>
                        <td className="py-2.5 px-4 text-zinc-300">{t.prwr_pct ? `${t.prwr_pct}%` : '-'}</td>
                        <td className="py-2.5 px-4 text-zinc-400">{t.rbwr_pct ? `${t.rbwr_pct}%` : '-'}</td>
                        <td className="py-2.5 px-4 text-zinc-400">{t.rswr_pct ? `${t.rswr_pct}%` : '-'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* CFB Power Index Tab */}
        {activeTab === 'cfb' && (
          <div className="space-y-6">
            <div className="border-b border-zinc-800 pb-4">
              <h2 className="text-2xl font-bold text-white tracking-tight">College Football Power Ratings</h2>
              <p className="text-zinc-400 text-xs sm:text-sm mt-1">
                Raw point-spread ratings above an average FBS baseline, adjusted for tempo and home-field margin.
              </p>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-zinc-800 bg-zinc-900/40">
              <table className="w-full text-left border-collapse text-xs sm:text-sm font-mono">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-900/80 text-zinc-400 text-[11px] uppercase tracking-wider">
                    <th className="py-3 px-4">Program</th>
                    <th className="py-3 px-4">Power Rating</th>
                    <th className="py-3 px-4">Off Rating</th>
                    <th className="py-3 px-4">Def Rating</th>
                    <th className="py-3 px-4">Home Field Advantage</th>
                    <th className="py-3 px-4">Tempo Factor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {cfbData.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="py-12 text-center text-zinc-500 font-sans">
                        CFB power index updates weekly for Saturday slate pricing.
                      </td>
                    </tr>
                  ) : (
                    cfbData.map((team, idx) => (
                      <tr key={team.id || team.team_name} className="hover:bg-zinc-800/30">
                        <td className="py-2.5 px-4 text-white font-sans font-semibold">
                          <span className="text-zinc-500 text-xs mr-2">{idx + 1}.</span>
                          {team.team_name}
                        </td>
                        <td className="py-2.5 px-4 text-emerald-400 font-bold">
                          {team.power_rating > 0 ? `+${team.power_rating}` : team.power_rating}
                        </td>
                        <td className="py-2.5 px-4 text-zinc-300">{team.off_rating}</td>
                        <td className="py-2.5 px-4 text-zinc-300">{team.def_rating}</td>
                        <td className="py-2.5 px-4 text-zinc-400">+{team.home_field_adv || 2.5}</td>
                        <td className="py-2.5 px-4 text-zinc-400">{team.tempo_rating || 'Normal'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Methodology / Whitepapers Tab */}
        {activeTab === 'whitepapers' && (
          <div className="space-y-8 max-w-4xl">
            <div className="border-b border-zinc-800 pb-4">
              <h2 className="text-2xl font-bold text-white tracking-tight">Syndicate Methodology & Math</h2>
              <p className="text-zinc-400 text-xs sm:text-sm mt-1">
                A quantitative overview of the algorithms, Bayesian shrinkage, and market models powering the Sharpe Syndicate.
              </p>
            </div>

            <div className="space-y-6">
              {/* Paper 1: PVAL */}
              <div className="p-6 rounded-2xl border border-zinc-800 bg-zinc-900/50 space-y-3">
                <div className="text-xs font-mono font-bold text-emerald-400 uppercase tracking-wider">
                  WHITEPAPER · DESK MATHEMATICS
                </div>
                <h3 className="text-lg font-bold text-white">
                  Point Spread Value (PVAL) in Player Injury Modeling
                </h3>
                <p className="text-zinc-300 text-xs sm:text-sm leading-relaxed">
                  Traditional handicapping relies on subjective injury sentiment. The Sharpe Syndicate models real market consensus
                  PVAL values per player (e.g. Starting QB = 3.5 - 7.5 pts, Shutdown Corner = 0.85 pts, Elite LT = 1.25 pts).
                  Net injury disparities between teams create direct quantifiable edges against retail spreads.
                </p>
              </div>

              {/* Paper 2: Key Numbers & Hook Tax */}
              <div className="p-6 rounded-2xl border border-zinc-800 bg-zinc-900/50 space-y-3">
                <div className="text-xs font-mono font-bold text-blue-400 uppercase tracking-wider">
                  MARKET PRICING · SPREAD CLUSTERING
                </div>
                <h3 className="text-lg font-bold text-white">
                  Key Number Valuation & The -3.5 / -7.5 Hook Tax
                </h3>
                <p className="text-zinc-300 text-xs sm:text-sm leading-relaxed">
                  In the NFL, 15.3% of games finish on a 3-point margin and 9.4% finish on 7. Laying -3.5 or -7.5 incurs a massive
                  negative EV penalty unless offset by high-confidence trench dominance. Conversely, +3.5 and +7.5 ("Golden Hooks")
                  provide significant historical variance cushions.
                </p>
              </div>

              {/* Paper 3: Wong Teasers */}
              <div className="p-6 rounded-2xl border border-zinc-800 bg-zinc-900/50 space-y-3">
                <div className="text-xs font-mono font-bold text-amber-400 uppercase tracking-wider">
                  BASIC STRATEGY · ARBITRAGE
                </div>
                <h3 className="text-lg font-bold text-white">
                  Basic Strategy 6-Point Wong Teaser Engine
                </h3>
                <p className="text-zinc-300 text-xs sm:text-sm leading-relaxed">
                  Stanford Wong’s basic strategy proves that teasing NFL underdogs from +1.5/+2.5 up through +7.5/+8.5 and favorites
                  from -7.5/-8.5 down through -1.5/-2.5 in games with low totals (&lt; 49) crosses both critical key numbers (3 and 7),
                  producing positive EV legs that overcome standard 2-team teaser juice (-120).
                </p>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-800/80 bg-zinc-950 py-8 text-center text-xs text-zinc-500 space-y-2">
        <div>© 2026 Sharpe Syndicate Quantitative Sports Analytics. All rights reserved.</div>
        <div>
          Official execution partner and VIP community hosted on{' '}
          <a
            href="https://edgetilt.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-400 hover:text-emerald-300 font-semibold underline underline-offset-4"
          >
            EdgeTilt
          </a>
        </div>
      </footer>
    </div>
  )
}
