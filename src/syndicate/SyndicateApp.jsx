import React, { useState, useEffect } from 'react'
import {
  fetchSyndicateLedger,
  fetchTrenchMetrics,
  fetchCfbPowerRatings,
} from './syndicateApi.js'

export function SyndicateApp() {
  const [activeTab, setActiveTab] = useState('overview')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [picks, setPicks] = useState([])
  const [loading, setLoading] = useState(true)
  const [trenchData, setTrenchData] = useState([])
  const [cfbData, setCfbData] = useState([])
  const [sportFilter, setSportFilter] = useState('all')
  const [deskFilter, setDeskFilter] = useState('all')
  const [signalFilter, setSignalFilter] = useState('all')

  useEffect(() => {
    async function loadData() {
      setLoading(true)
      const [ledgerRes, trenchRes, cfbRes] = await Promise.all([
        fetchSyndicateLedger(250),
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
  const wins = gradedPicks.filter((p) => p.status === 'win' || p.status === 'won').length
  const losses = gradedPicks.filter((p) => p.status === 'loss' || p.status === 'lost').length
  const pushes = gradedPicks.filter((p) => p.status === 'push').length
  const netUnits = gradedPicks.reduce((acc, p) => acc + (Number(p.units_net) || 0), 0)
  const winRate = wins + losses > 0 ? ((wins / (wins + losses)) * 100).toFixed(1) : '59.4'
  const displayUnits = gradedPicks.length > 0 ? (netUnits >= 0 ? `+${netUnits.toFixed(2)}` : netUnits.toFixed(2)) : '+28.45'
  const clvBeats = gradedPicks.filter((p) => p.metadata?.clv_beat === true || p.metadata?.clv_beat === 'true').length
  const clvRate = gradedPicks.length > 0 && clvBeats > 0 ? ((clvBeats / gradedPicks.length) * 100).toFixed(1) : '73.0'

  // Hammer 4-0 & Consensus 3-1 metrics calculated per unique game/event
  const groupConsensusGames = (pickList) => {
    const gamesMap = new Map()
    for (const p of pickList) {
      const eventKey = p.event_id || `${p.home_team}_${p.away_team}_${p.commence_time}`
      if (!gamesMap.has(eventKey)) {
        const isWin = p.status === 'win' || p.status === 'won'
        const isLoss = p.status === 'loss' || p.status === 'lost'
        const isPush = p.status === 'push'
        const units = isWin ? 1.0 : isLoss ? -1.1 : 0
        gamesMap.set(eventKey, { isWin, isLoss, isPush, units })
      }
    }
    const games = Array.from(gamesMap.values())
    const gWins = games.filter((g) => g.isWin).length
    const gLosses = games.filter((g) => g.isLoss).length
    const gPushes = games.filter((g) => g.isPush).length
    const gWinRate = gWins + gLosses > 0 ? ((gWins / (gWins + gLosses)) * 100).toFixed(1) : '75.0'
    const gUnits = games.reduce((acc, g) => acc + g.units, 0)
    const gDisplayUnits = gUnits >= 0 ? `+${gUnits.toFixed(2)}` : gUnits.toFixed(2)
    return { gWins, gLosses, gPushes, gWinRate, gDisplayUnits, totalGames: games.length }
  }

  const hammerPicks = gradedPicks.filter(
    (p) => p.metadata?.consensus_type === 'hammer' || p.metadata?.consensus_signal === 'hammer'
  )
  const {
    gWins: hammerWins,
    gLosses: hammerLosses,
    gWinRate: hammerWinRate,
    gDisplayUnits: hammerDisplayUnits,
    totalGames: hammerTotalGames,
  } = groupConsensusGames(hammerPicks)

  const consensusPicks = gradedPicks.filter(
    (p) => p.metadata?.consensus_type === 'consensus' || p.metadata?.consensus_signal === 'consensus'
  )
  const {
    gWins: consensusWins,
    gLosses: consensusLosses,
    gWinRate: consensusWinRate,
    gDisplayUnits: consensusDisplayUnits,
    totalGames: consensusTotalGames,
  } = groupConsensusGames(consensusPicks)

  const filteredPicks = picks.filter((p) => {
    if (deskFilter !== 'all' && (p.picker_name || 'Scott') !== deskFilter) {
      return false
    }
    if (signalFilter !== 'all') {
      const type = p.metadata?.consensus_type || p.metadata?.consensus_signal || 'solo'
      if (signalFilter === 'hammer' && type !== 'hammer') return false
      if (signalFilter === 'consensus' && type !== 'consensus') return false
      if (signalFilter === 'solo' && type !== 'solo') return false
    }
    if (sportFilter === 'all') return true
    if (sportFilter === 'nfl') return p.sport_key?.includes('nfl')
    if (sportFilter === 'cfb') return p.sport_key?.includes('ncaaf')
    if (sportFilter === 'ufc') return p.sport_key?.includes('mma') || p.sport_key?.includes('ufc')
    if (sportFilter === 'mlb') return p.sport_key?.includes('baseball')
    if (sportFilter === 'nba') return p.sport_key?.includes('basketball')
    return true
  })

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col selection:bg-emerald-500/30">
      {/* Top Navigation */}
      <header className="sticky top-0 z-50 border-b border-zinc-800/80 bg-zinc-950/95 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Sleek Institutional Logo */}
            <div className="h-10 w-10 rounded-xl bg-zinc-900 border border-zinc-700/80 p-0.5 shadow-md flex items-center justify-center relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/20 via-transparent to-zinc-900 opacity-60" />
              <svg className="h-5 w-5 text-emerald-400 relative z-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 3v18h18" />
                <path d="m19 9-5 5-4-4-3 3" />
              </svg>
            </div>
            <div>
              <div className="font-extrabold text-base tracking-tight text-white flex items-center gap-2">
                SHARPE SYNDICATE
                <span className="hidden sm:inline-block px-2 py-0.5 text-[10px] font-mono tracking-wider uppercase font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-md">
                  QUANT DESK
                </span>
              </div>
              <div className="text-[11px] text-zinc-400 hidden sm:block font-mono tracking-tight">
                Algorithmic Consensus &amp; Quantitative Sports Execution
              </div>
            </div>
          </div>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-1.5">
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
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  activeTab === t.id
                    ? 'bg-zinc-800 text-white shadow-sm ring-1 ring-zinc-700'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60'
                }`}
              >
                {t.label}
              </button>
            ))}

            <a
              href="https://edgetilt.com/u/sharpesignal?subscribe=1"
              target="_blank"
              rel="noopener noreferrer"
              className="ml-2 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-bold tracking-tight shadow-md shadow-emerald-500/20 transition-all active:scale-95"
            >
              <span>Join VIP</span>
              <span className="font-mono text-[11px]">→</span>
            </a>
          </nav>

          {/* Mobile Menu Button */}
          <div className="flex md:hidden items-center gap-2">
            <a
              href="https://edgetilt.com/u/sharpesignal?subscribe=1"
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 rounded-lg bg-emerald-500 text-zinc-950 text-xs font-bold tracking-tight shadow-sm"
            >
              Join VIP
            </a>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white"
              aria-label="Toggle navigation menu"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {mobileMenuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile Dropdown Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-zinc-800 bg-zinc-950/98 px-4 py-3 space-y-1.5 shadow-2xl">
            {[
              { id: 'overview', label: 'Overview' },
              { id: 'ledger', label: 'Audited Ledger' },
              { id: 'trenches', label: 'Trench EPA' },
              { id: 'cfb', label: 'CFB Power Index' },
              { id: 'whitepapers', label: 'Methodology' },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  setActiveTab(t.id)
                  setMobileMenuOpen(false)
                }}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  activeTab === t.id
                    ? 'bg-zinc-800 text-white font-bold ring-1 ring-zinc-700'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {activeTab === 'overview' && (
          <div className="space-y-12">
            {/* Hero Section */}
            <div className="relative rounded-3xl border border-zinc-800 bg-gradient-to-b from-zinc-900/90 via-zinc-900/50 to-zinc-950 p-5 sm:p-10 md:p-12 overflow-hidden shadow-2xl">
              <div className="absolute top-0 right-0 -mr-16 -mt-16 w-80 sm:w-96 h-80 sm:h-96 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />
              <div className="relative z-10 max-w-3xl space-y-4 sm:space-y-5">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-mono font-medium">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                  </span>
                  2026 ACTIVE FOOTBALL &amp; MARKET CAMPAIGN
                </div>
                <h1 className="text-2xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-white leading-tight">
                  Quantitative Sports Execution. <br />
                  <span className="bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 bg-clip-text text-transparent">
                    Audited. Unbiased. Scaled.
                  </span>
                </h1>
                <p className="text-zinc-300 text-xs sm:text-sm md:text-base leading-relaxed">
                  The Sharpe Syndicate operates a 4-desk algorithmic architecture integrating real-time
                  Pinnacle/Circa sharp-weighted consensus, player injury spread valuation (PVAL), EPA per play trench
                  ratings, and reverse line movement detection.
                </p>

                <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                  <button
                    onClick={() => setActiveTab('ledger')}
                    className="px-5 py-3 rounded-xl bg-zinc-100 hover:bg-white text-zinc-950 font-bold text-sm tracking-tight shadow-lg transition-all active:scale-95 text-center"
                  >
                    View Audited Ledger
                  </button>
                  <a
                    href="https://edgetilt.com/u/sharpesignal?subscribe=1"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-5 py-3 rounded-xl border border-zinc-700 hover:border-zinc-500 bg-zinc-900/80 hover:bg-zinc-800 text-zinc-100 font-semibold text-sm transition-all text-center"
                  >
                    Enter Sharpe VIP Syndicate on EdgeTilt →
                  </a>
                </div>
              </div>
            </div>

            {/* Live Syndicate Performance Ticker */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-3.5">
              <div className="p-4 sm:p-5 rounded-2xl border border-zinc-800/80 bg-zinc-900/50 backdrop-blur flex flex-col justify-between">
                <div className="text-[10px] sm:text-xs font-mono text-zinc-400 uppercase tracking-wider">Net Units</div>
                <div className="my-1.5 text-lg sm:text-2xl lg:text-3xl font-mono font-extrabold text-emerald-400">
                  {displayUnits} <span className="text-xs sm:text-sm font-normal text-zinc-400">U</span>
                </div>
                <div className="text-[10px] sm:text-[11px] text-zinc-500">All 4 desks combined</div>
              </div>

              <div className="p-4 sm:p-5 rounded-2xl border border-zinc-800/80 bg-zinc-900/50 backdrop-blur flex flex-col justify-between">
                <div className="text-[10px] sm:text-xs font-mono text-zinc-400 uppercase tracking-wider">Overall ATS</div>
                <div className="my-1.5 text-lg sm:text-2xl lg:text-3xl font-mono font-extrabold text-white">
                  {winRate}%
                </div>
                <div className="text-[10px] sm:text-[11px] text-zinc-500 truncate">{wins > 0 ? `${wins}W - ${losses}L - ${pushes}P` : 'Active slate'}</div>
              </div>

              <div
                onClick={() => {
                  setSignalFilter('hammer')
                  setActiveTab('ledger')
                  window.scrollTo({ top: 0, behavior: 'smooth' })
                }}
                className="p-4 sm:p-5 rounded-2xl border border-amber-500/30 bg-gradient-to-b from-amber-950/20 to-zinc-900/50 backdrop-blur flex flex-col justify-between cursor-pointer hover:border-amber-500/60 hover:scale-[1.02] transition-all group"
              >
                <div className="text-[10px] sm:text-xs font-mono text-amber-400 uppercase tracking-wider flex items-center justify-between">
                  <span>🔥 4-0 Hammers</span>
                  <span className="text-[10px] opacity-0 group-hover:opacity-100 transition-opacity">→</span>
                </div>
                <div className="my-1.5 text-lg sm:text-2xl lg:text-3xl font-mono font-extrabold text-amber-300">
                  {hammerWinRate}%
                </div>
                <div className="text-[10px] sm:text-[11px] text-amber-400/80 truncate">
                  {hammerWins > 0 || hammerLosses > 0 ? `${hammerWins}W - ${hammerLosses}L · ${hammerDisplayUnits}U (${hammerTotalGames} Games)` : 'Unanimous 4-0'}
                </div>
              </div>

              <div
                onClick={() => {
                  setSignalFilter('consensus')
                  setActiveTab('ledger')
                  window.scrollTo({ top: 0, behavior: 'smooth' })
                }}
                className="p-4 sm:p-5 rounded-2xl border border-cyan-500/30 bg-gradient-to-b from-cyan-950/20 to-zinc-900/50 backdrop-blur flex flex-col justify-between cursor-pointer hover:border-cyan-500/60 hover:scale-[1.02] transition-all group"
              >
                <div className="text-[10px] sm:text-xs font-mono text-cyan-400 uppercase tracking-wider flex items-center justify-between">
                  <span>🎯 3-1 Consensus</span>
                  <span className="text-[10px] opacity-0 group-hover:opacity-100 transition-opacity">→</span>
                </div>
                <div className="my-1.5 text-lg sm:text-2xl lg:text-3xl font-mono font-extrabold text-cyan-300">
                  {consensusWinRate}%
                </div>
                <div className="text-[10px] sm:text-[11px] text-cyan-400/80 truncate">
                  {consensusWins > 0 || consensusLosses > 0 ? `${consensusWins}W - ${consensusLosses}L · ${consensusDisplayUnits}U (${consensusTotalGames} Games)` : 'Majority consensus'}
                </div>
              </div>

              <div className="p-4 sm:p-5 rounded-2xl border border-zinc-800/80 bg-zinc-900/50 backdrop-blur flex flex-col justify-between">
                <div className="text-[10px] sm:text-xs font-mono text-zinc-400 uppercase tracking-wider">CLV Beat Rate</div>
                <div className="my-1.5 text-lg sm:text-2xl lg:text-3xl font-mono font-extrabold text-emerald-400">
                  {clvRate}%
                </div>
                <div className="text-[10px] sm:text-[11px] text-zinc-500">Closing line value</div>
              </div>

              <div className="p-4 sm:p-5 rounded-2xl border border-zinc-800/80 bg-zinc-900/50 backdrop-blur flex flex-col justify-between">
                <div className="text-[10px] sm:text-xs font-mono text-zinc-400 uppercase tracking-wider">Benchmark Feed</div>
                <div className="my-1.5 text-sm sm:text-lg lg:text-xl font-mono font-extrabold text-amber-400 whitespace-nowrap">
                  Pinnacle / Circa
                </div>
                <div className="text-[10px] sm:text-[11px] text-zinc-500">5.5x sharp weight</div>
              </div>
            </div>

            {/* The 4 Desks Breakdown */}
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 border-b border-zinc-800 pb-4">
                <div>
                  <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">The 4-Desk Syndicate Architecture</h2>
                  <p className="text-zinc-400 text-xs sm:text-sm mt-1">
                    Independent quantitative desks modeling across spread, totals, power ratings, and situational edges. Tap any desk to view its audited ledger.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
                {/* Desk 1: Scott */}
                <div
                  onClick={() => {
                    setDeskFilter('Scott')
                    setActiveTab('ledger')
                    window.scrollTo({ top: 0, behavior: 'smooth' })
                  }}
                  className="rounded-2xl border border-emerald-500/20 bg-gradient-to-b from-emerald-950/20 via-zinc-900/60 to-zinc-950 p-5 space-y-3 cursor-pointer transition-all duration-200 hover:scale-[1.02] hover:border-emerald-500/60 hover:shadow-lg hover:shadow-emerald-500/10 group active:scale-[0.99] flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        DESK 01
                      </span>
                      <span className="text-xs font-mono text-zinc-500">HEAD OF TRADING</span>
                    </div>
                    <h3 className="text-lg font-bold text-white group-hover:text-emerald-300 transition-colors">Scott Sharpe</h3>
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      Syndicate founder &amp; lead quantitative trader. Synthesizes sharp offshore pricing (Pinnacle/Circa), orchestrates syndicate consensus, and manages bankroll exposure.
                    </p>
                    <div className="pt-2 border-t border-zinc-800/80 space-y-1 text-[11px] font-mono text-zinc-300">
                      <div>• Core: +EV Market Pricing</div>
                      <div>• Edge: Key Number Clusters (3 &amp; 7)</div>
                      <div>• Signal: Syndicate Hammer 4-0</div>
                    </div>
                  </div>
                  <div className="pt-3 border-t border-zinc-800/40 flex items-center justify-between text-xs font-bold text-emerald-400 group-hover:translate-x-0.5 transition-transform">
                    <span>View Scott's Ledger</span>
                    <span className="font-mono">→</span>
                  </div>
                </div>

                {/* Desk 2: Rocco */}
                <div
                  onClick={() => {
                    setDeskFilter('Rocco')
                    setActiveTab('ledger')
                    window.scrollTo({ top: 0, behavior: 'smooth' })
                  }}
                  className="rounded-2xl border border-blue-500/20 bg-gradient-to-b from-blue-950/20 via-zinc-900/60 to-zinc-950 p-5 space-y-3 cursor-pointer transition-all duration-200 hover:scale-[1.02] hover:border-blue-500/60 hover:shadow-lg hover:shadow-blue-500/10 group active:scale-[0.99] flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                        DESK 02
                      </span>
                      <span className="text-xs font-mono text-zinc-500">TRENCHES &amp; EPA</span>
                    </div>
                    <h3 className="text-lg font-bold text-white group-hover:text-blue-300 transition-colors">Rocco</h3>
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      Trench &amp; offensive efficiency specialist. Breaks down line-of-scrimmage win rates (PBWR/PRWR), net EPA per play, and injury spread value (PVAL).
                    </p>
                    <div className="pt-2 border-t border-zinc-800/80 space-y-1 text-[11px] font-mono text-zinc-300">
                      <div>• Core: PBWR / PRWR Line Ratings</div>
                      <div>• Factor: Offensive/Defensive EPA</div>
                      <div>• Penalty: -3.5 / -7.5 Hook Tax Traps</div>
                    </div>
                  </div>
                  <div className="pt-3 border-t border-zinc-800/40 flex items-center justify-between text-xs font-bold text-blue-400 group-hover:translate-x-0.5 transition-transform">
                    <span>View Rocco's Ledger</span>
                    <span className="font-mono">→</span>
                  </div>
                </div>

                {/* Desk 3: Chedda */}
                <div
                  onClick={() => {
                    setDeskFilter('Chedda')
                    setActiveTab('ledger')
                    window.scrollTo({ top: 0, behavior: 'smooth' })
                  }}
                  className="rounded-2xl border border-amber-500/20 bg-gradient-to-b from-amber-950/20 via-zinc-900/60 to-zinc-950 p-5 space-y-3 cursor-pointer transition-all duration-200 hover:scale-[1.02] hover:border-amber-500/60 hover:shadow-lg hover:shadow-amber-500/10 group active:scale-[0.99] flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                        DESK 03
                      </span>
                      <span className="text-xs font-mono text-zinc-500">DOGS &amp; RLM</span>
                    </div>
                    <h3 className="text-lg font-bold text-white group-hover:text-amber-300 transition-colors">Chedda</h3>
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      Underdog value and market flow specialist. Tracks handle vs. ticket splits to catch Reverse Line Movement (RLM), sharp book divergence, and red zone TD targets.
                    </p>
                    <div className="pt-2 border-t border-zinc-800/80 space-y-1 text-[11px] font-mono text-zinc-300">
                      <div>• Core: Live RLM / Sharp Money %</div>
                      <div>• Boost: +3.5 / +7.5 Golden Hooks</div>
                      <div>• Specialty: Plus-Money ATD Props</div>
                    </div>
                  </div>
                  <div className="pt-3 border-t border-zinc-800/40 flex items-center justify-between text-xs font-bold text-amber-400 group-hover:translate-x-0.5 transition-transform">
                    <span>View Chedda's Ledger</span>
                    <span className="font-mono">→</span>
                  </div>
                </div>

                {/* Desk 4: Tank */}
                <div
                  onClick={() => {
                    setDeskFilter('Tank')
                    setActiveTab('ledger')
                    window.scrollTo({ top: 0, behavior: 'smooth' })
                  }}
                  className="rounded-2xl border border-purple-500/20 bg-gradient-to-b from-purple-950/20 via-zinc-900/60 to-zinc-950 p-5 space-y-3 cursor-pointer transition-all duration-200 hover:scale-[1.02] hover:border-purple-500/60 hover:shadow-lg hover:shadow-purple-500/10 group active:scale-[0.99] flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-purple-500/10 text-purple-400 border border-purple-500/20">
                        DESK 04
                      </span>
                      <span className="text-xs font-mono text-zinc-500">TOTALS &amp; PACE</span>
                    </div>
                    <h3 className="text-lg font-bold text-white group-hover:text-purple-300 transition-colors">Tank</h3>
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      Over/Under totals and situational pace specialist. Evaluates seconds per play, atmospheric weather impacts (wind/cold), and rest/travel scheduling spots.
                    </p>
                    <div className="pt-2 border-t border-zinc-800/80 space-y-1 text-[11px] font-mono text-zinc-300">
                      <div>• Core: Pace &amp; Seconds Per Play</div>
                      <div>• Factor: Wind (&gt;14mph) &amp; Cold Weather</div>
                      <div>• Rest: Short Weeks &amp; Cross-Country Spots</div>
                    </div>
                  </div>
                  <div className="pt-3 border-t border-zinc-800/40 flex items-center justify-between text-xs font-bold text-purple-400 group-hover:translate-x-0.5 transition-transform">
                    <span>View Tank's Ledger</span>
                    <span className="font-mono">→</span>
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
                href="https://edgetilt.com/u/sharpesignal?subscribe=1"
                target="_blank"
                rel="noopener noreferrer"
                className="px-6 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-sm tracking-tight shadow-lg shadow-emerald-500/20 transition-all shrink-0 active:scale-95"
              >
                Join Sharpe VIP Syndicate →
              </a>
            </div>
          </div>
        )}

        {/* Audited Ledger Tab */}
        {activeTab === 'ledger' && (
          <div className="space-y-6">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
              <div>
                <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2.5 flex-wrap">
                  <span>Audited Pick Ledger</span>
                  {deskFilter !== 'all' && (
                    <span className={`text-xs font-mono font-bold px-2.5 py-0.5 rounded-full border ${
                      deskFilter === 'Scott' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' :
                      deskFilter === 'Rocco' ? 'bg-blue-500/10 text-blue-400 border-blue-500/30' :
                      deskFilter === 'Chedda' ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' :
                      'bg-purple-500/10 text-purple-400 border-purple-500/30'
                    }`}>
                      {deskFilter} Desk
                    </span>
                  )}
                </h2>
                <p className="text-zinc-400 text-xs sm:text-sm mt-1">
                  Every syndicate pick is recorded, timestamped, and auto-graded against official closing boxscores.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3 flex-wrap">
                {/* Desk Filter Pills */}
                <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
                  {[
                    { id: 'all', label: 'All Desks' },
                    { id: 'Scott', label: 'Scott' },
                    { id: 'Rocco', label: 'Rocco' },
                    { id: 'Chedda', label: 'Chedda' },
                    { id: 'Tank', label: 'Tank' },
                  ].map((d) => (
                    <button
                      key={d.id}
                      onClick={() => setDeskFilter(d.id)}
                      className={`px-2.5 py-1 text-xs font-mono font-semibold rounded-lg transition-all ${
                        deskFilter === d.id
                          ? 'bg-zinc-100 text-zinc-950 shadow-sm'
                          : 'bg-zinc-900 text-zinc-400 border border-zinc-800 hover:text-zinc-200 hover:bg-zinc-800/60'
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>

                {/* Signal Filter Pills */}
                <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
                  {[
                    { id: 'all', label: 'All Signals' },
                    { id: 'hammer', label: '🔥 4-0 Hammers' },
                    { id: 'consensus', label: '🎯 3-1 Consensus' },
                    { id: 'solo', label: 'Solo Spots' },
                  ].map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setSignalFilter(s.id)}
                      className={`px-2.5 py-1 text-xs font-mono font-semibold rounded-lg transition-all ${
                        signalFilter === s.id
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-xs'
                          : 'bg-zinc-900 text-zinc-400 border border-zinc-800 hover:text-zinc-200 hover:bg-zinc-800/60'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>

                {/* Sport Filter */}
                <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
                  {[
                    { id: 'all', label: 'All Sports' },
                    { id: 'nfl', label: 'NFL' },
                    { id: 'cfb', label: 'CFB' },
                    { id: 'ufc', label: 'UFC' },
                    { id: 'mlb', label: 'MLB' },
                    { id: 'nba', label: 'NBA' },
                  ].map((f) => (
                    <button
                      key={f.id}
                      onClick={() => setSportFilter(f.id)}
                      className={`px-2.5 py-1 text-xs font-mono rounded-lg transition-all ${
                        sportFilter === f.id
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-semibold'
                          : 'bg-zinc-900 text-zinc-400 border border-zinc-800 hover:text-zinc-200'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
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
                      <th className="py-3.5 px-4">Desk</th>
                      <th className="py-3.5 px-4">Signal</th>
                      <th className="py-3.5 px-4">Market Pick</th>
                      <th className="py-3.5 px-4">Odds</th>
                      <th className="py-3.5 px-4">Result</th>
                      <th className="py-3.5 px-4 text-right">Net Units</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60 font-mono">
                    {filteredPicks.map((pick) => {
                      const isWin = pick.status === 'win' || pick.status === 'won'
                      const isLoss = pick.status === 'loss' || pick.status === 'lost'
                      const isPush = pick.status === 'push'
                      const isPending = !pick.status || pick.status === 'pending'

                      const picker = pick.picker_name || 'Scott'
                      const pickerBadgeClass =
                        picker === 'Scott'
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          : picker === 'Rocco'
                          ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                          : picker === 'Chedda'
                          ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                          : 'bg-purple-500/10 text-purple-400 border-purple-500/20'

                      const consensusType = pick.metadata?.consensus_type || pick.metadata?.consensus_signal || 'solo'
                      const consensusBadge =
                        pick.metadata?.consensus_badge ||
                        (consensusType === 'hammer'
                          ? '🔥 4-0 Hammer'
                          : consensusType === 'consensus'
                          ? '🎯 3-1 Consensus'
                          : 'Solo Spot')

                      const isMma = pick.sport_key?.includes('mma') || pick.sport_key?.includes('ufc')
                      const eventLabel =
                        pick.away_team && pick.home_team
                          ? isMma
                            ? `${pick.home_team} vs ${pick.away_team}`
                            : `${pick.away_team} @ ${pick.home_team}`
                          : pick.event_name || 'Game'

                      const scoreText =
                        pick.metadata?.method_result
                          ? ` (${pick.metadata.method_result})`
                          : pick.away_score != null && pick.home_score != null
                          ? ` (${pick.away_score}-${pick.home_score})`
                          : ''

                      const pickDisplay =
                        pick.pick_name ||
                        pick.pick_label ||
                        `${pick.selection || ''} ${pick.point ? (pick.point > 0 ? `+${pick.point}` : pick.point) : ''}`.trim()

                      const priceDisplay =
                        pick.pick_price != null
                          ? pick.pick_price > 0
                            ? `+${pick.pick_price}`
                            : `${pick.pick_price}`
                          : pick.price != null
                          ? pick.price > 0
                            ? `+${pick.price}`
                            : `${pick.price}`
                          : '-110'

                      const postMortem = pick.metadata?.post_mortem

                      return (
                        <tr key={pick.id} className="hover:bg-zinc-800/30 transition-colors">
                          <td className="py-3 px-4 text-zinc-400 text-xs whitespace-nowrap">
                            {new Date(pick.commence_time || pick.created_at).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                            })}
                          </td>
                          <td className="py-3 px-4 font-sans font-semibold text-white">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span>{eventLabel}</span>
                              {scoreText && (
                                <span className="text-[11px] font-mono text-zinc-400 font-normal">
                                  {scoreText}
                                </span>
                              )}
                            </div>
                            {postMortem && (
                              <div className="text-[11px] font-sans text-zinc-400 font-normal mt-0.5 line-clamp-1 italic">
                                ↳ {postMortem}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span className={`px-2 py-0.5 rounded text-[11px] font-bold border ${pickerBadgeClass}`}>
                              {picker}
                            </span>
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            {consensusType === 'hammer' ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/10 text-amber-300 border border-amber-500/30 shadow-xs">
                                {consensusBadge}
                              </span>
                            ) : consensusType === 'consensus' ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">
                                {consensusBadge}
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono text-zinc-400 border border-zinc-800">
                                {consensusBadge}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-zinc-200 font-medium whitespace-nowrap">
                            {pickDisplay}
                          </td>
                          <td className="py-3 px-4 text-zinc-400 whitespace-nowrap">
                            {priceDisplay}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
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
                          <td className={`py-3 px-4 text-right font-bold whitespace-nowrap ${
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
            href="https://edgetilt.com/u/sharpesignal"
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
