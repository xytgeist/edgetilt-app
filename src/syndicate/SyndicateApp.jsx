import React, { useState, useEffect, useRef } from 'react'
import {
  fetchSyndicateLedger,
  fetchTrenchMetrics,
  fetchCfbPowerRatings,
  fetchUfcFighterMetrics,
} from './syndicateApi.js'

const PRIMARY_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'ledger', label: 'Audited Ledger' },
  { id: 'whitepapers', label: 'Methodology' },
]

const SPORT_TABS = [
  { id: 'nfl', label: 'NFL' },
  { id: 'cfb', label: 'CFB' },
  { id: 'ufc', label: 'UFC' },
]

function isSportTab(tabId) {
  return SPORT_TABS.some((t) => t.id === tabId)
}

/** Match lounge-odds-poll grading window: no result until commence + 90m. */
const PICK_SETTLE_BUFFER_MS = 90 * 60 * 1000

function pickCommenceMs(pick) {
  const t = pick.commence_time || pick.created_at
  return t ? new Date(t).getTime() : 0
}

/** True when the event has started long enough ago to appear in the Audited Ledger. */
function isPickAuditable(pick) {
  const commence = pickCommenceMs(pick)
  if (!commence) return false
  return commence <= Date.now() - PICK_SETTLE_BUFFER_MS
}

/** True only when the game should have finished and status is not pending. */
function isPickSettled(pick) {
  if (!pick.status || pick.status === 'pending') return false
  const commence = pickCommenceMs(pick)
  if (!commence) return true
  return commence <= Date.now() - PICK_SETTLE_BUFFER_MS
}

/** Deterministic fake model digits for public tease columns (not real ratings). */
function hashStr(s) {
  let h = 2166136261
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function formatTeasePoints(v) {
  const n = Math.round(Number(v) * 10) / 10
  if (!Number.isFinite(n)) return '+0.0'
  return n > 0 ? `+${n}` : String(n)
}

/**
 * Public-only placeholders on a shared points-ish scale so no voter fingerprint
 * (e.g. Sagarin ~100) leaks through blur.
 */
function fakeModelPlaceholders(teamName, consensus, rankIdx) {
  const h = hashStr(`${teamName || 'team'}|syndicate-model-tease-v1`)
  const base = Number.isFinite(Number(consensus)) ? Number(consensus) : Math.max(0, 28 - rankIdx)
  const j1 = ((h % 17) - 8) / 10
  const j2 = (((h >>> 5) % 19) - 9) / 10
  const j3 = (((h >>> 11) % 15) - 7) / 10
  return {
    a: formatTeasePoints(base + j1 + 1.1),
    b: formatTeasePoints(base + j2 - 0.5),
    c: formatTeasePoints(base + j3 + 0.2),
  }
}

function BlurredModelTease({ value }) {
  return (
    <span className="syndicate-model-tease" aria-hidden="true">
      {value}
    </span>
  )
}

export function SyndicateApp() {
  const [activeTab, setActiveTab] = useState('overview')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [sportsMenuOpen, setSportsMenuOpen] = useState(false)
  const [mobileSportsOpen, setMobileSportsOpen] = useState(false)
  const sportsMenuRef = useRef(null)
  const [picks, setPicks] = useState([])
  const [loading, setLoading] = useState(true)
  const [trenchData, setTrenchData] = useState([])
  const [cfbData, setCfbData] = useState([])
  const [ufcData, setUfcData] = useState([])
  const [sportFilter, setSportFilter] = useState('all')
  const [deskFilter, setDeskFilter] = useState('all')
  const [signalFilter, setSignalFilter] = useState('all')

  useEffect(() => {
    async function loadData() {
      setLoading(true)
      const [ledgerRes, trenchRes, cfbRes, ufcRes] = await Promise.all([
        fetchSyndicateLedger(250),
        fetchTrenchMetrics(),
        fetchCfbPowerRatings(),
        fetchUfcFighterMetrics(),
      ])
      setPicks(ledgerRes.picks || [])
      setTrenchData(trenchRes.data || [])
      setCfbData(cfbRes.data || [])
      setUfcData(ufcRes.data || [])
      setLoading(false)
    }
    loadData()
  }, [])

  useEffect(() => {
    if (!sportsMenuOpen) return undefined
    function onPointerDown(e) {
      if (sportsMenuRef.current && !sportsMenuRef.current.contains(e.target)) {
        setSportsMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [sportsMenuOpen])

  // Calculate live ledger stats (exclude future / in-progress games)
  const gradedPicks = picks.filter(isPickSettled)
  const wins = gradedPicks.filter((p) => p.status === 'win' || p.status === 'won').length
  const losses = gradedPicks.filter((p) => p.status === 'loss' || p.status === 'lost').length
  const pushes = gradedPicks.filter((p) => p.status === 'push').length
  const netUnits = gradedPicks.reduce((acc, p) => acc + (Number(p.units_net) || 0), 0)
  const winRate = wins + losses > 0 ? ((wins / (wins + losses)) * 100).toFixed(1) : '—'
  const displayUnits =
    gradedPicks.length > 0 ? (netUnits >= 0 ? `+${netUnits.toFixed(2)}` : netUnits.toFixed(2)) : '—'
  const clvBeats = gradedPicks.filter((p) => p.metadata?.clv_beat === true || p.metadata?.clv_beat === 'true').length
  const clvRate =
    gradedPicks.length > 0 && clvBeats > 0 ? ((clvBeats / gradedPicks.length) * 100).toFixed(1) : '—'

  // Hammer 4-0 & Consensus 3-1 metrics calculated per unique game/event
  const groupConsensusGames = (pickList) => {
    const gamesMap = new Map()
    for (const p of pickList) {
      const eventKey = p.event_id || `${p.home_team}_${p.away_team}_${p.commence_time}`
      if (!gamesMap.has(eventKey)) {
        if (!isPickSettled(p)) continue
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
    const gWinRate = gWins + gLosses > 0 ? ((gWins / (gWins + gLosses)) * 100).toFixed(1) : '—'
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

  const summarizePicks = (pickList) => {
    const graded = pickList.filter(isPickSettled)
    const w = graded.filter((p) => p.status === 'win' || p.status === 'won').length
    const l = graded.filter((p) => p.status === 'loss' || p.status === 'lost').length
    const pu = graded.filter((p) => p.status === 'push').length
    const units = graded.reduce((acc, p) => acc + (Number(p.units_net) || 0), 0)
    const rate = w + l > 0 ? ((w / (w + l)) * 100).toFixed(1) : null
    const display = units >= 0 ? `+${units.toFixed(2)}` : units.toFixed(2)
    return {
      wins: w,
      losses: l,
      pushes: pu,
      netUnits: units,
      winRate: rate,
      displayUnits: display,
      gradedCount: graded.length,
      pendingCount: pickList.length - graded.length,
    }
  }

  const deskStatsByName = {
    Scott: summarizePicks(gradedPicks.filter((p) => (p.picker_name || 'Scott') === 'Scott')),
    Rocco: summarizePicks(gradedPicks.filter((p) => p.picker_name === 'Rocco')),
    Chedda: summarizePicks(gradedPicks.filter((p) => p.picker_name === 'Chedda')),
    Tank: summarizePicks(gradedPicks.filter((p) => p.picker_name === 'Tank')),
  }

  const filteredPicks = picks.filter((p) => {
    if (!isPickAuditable(p)) return false
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

  const filteredStats = summarizePicks(filteredPicks)

  return (
    <div
      data-syndicate
      className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col selection:bg-emerald-500/30"
    >
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
            {PRIMARY_TABS.filter((t) => t.id !== 'whitepapers').map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setActiveTab(t.id)
                  setSportsMenuOpen(false)
                }}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  activeTab === t.id
                    ? 'bg-zinc-800 text-white shadow-sm ring-1 ring-zinc-700'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60'
                }`}
              >
                {t.label}
              </button>
            ))}

            <div className="relative" ref={sportsMenuRef}>
              <button
                type="button"
                onClick={() => setSportsMenuOpen((open) => !open)}
                className={`inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  isSportTab(activeTab)
                    ? 'bg-zinc-800 text-white shadow-sm ring-1 ring-zinc-700'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60'
                }`}
                aria-expanded={sportsMenuOpen}
                aria-haspopup="true"
              >
                <span>Sports</span>
                <svg
                  className={`w-3.5 h-3.5 transition-transform ${sportsMenuOpen ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {sportsMenuOpen ? (
                <div className="absolute left-0 top-full z-50 mt-1.5 min-w-[9rem] rounded-xl border border-zinc-800 bg-zinc-950 py-1.5 shadow-xl shadow-black/40">
                  {SPORT_TABS.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        setActiveTab(t.id)
                        setSportsMenuOpen(false)
                      }}
                      className={`w-full text-left px-3 py-2 text-xs font-semibold transition-colors ${
                        activeTab === t.id
                          ? 'bg-zinc-800 text-white'
                          : 'text-zinc-400 hover:bg-zinc-900 hover:text-white'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <button
              type="button"
              onClick={() => {
                setActiveTab('whitepapers')
                setSportsMenuOpen(false)
              }}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                activeTab === 'whitepapers'
                  ? 'bg-zinc-800 text-white shadow-sm ring-1 ring-zinc-700'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60'
              }`}
            >
              Methodology
            </button>

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
            {PRIMARY_TABS.filter((t) => t.id !== 'whitepapers').map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setActiveTab(t.id)
                  setMobileMenuOpen(false)
                  setMobileSportsOpen(false)
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

            <button
              type="button"
              onClick={() => setMobileSportsOpen((open) => !open)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                isSportTab(activeTab)
                  ? 'bg-zinc-800 text-white font-bold ring-1 ring-zinc-700'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
              }`}
              aria-expanded={mobileSportsOpen}
            >
              <span>Sports</span>
              <svg
                className={`w-4 h-4 transition-transform ${mobileSportsOpen || isSportTab(activeTab) ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {(mobileSportsOpen || isSportTab(activeTab)) && (
              <div className="ml-2 space-y-1 border-l border-zinc-800 pl-2">
                {SPORT_TABS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(t.id)
                      setMobileMenuOpen(false)
                      setMobileSportsOpen(true)
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

            <button
              type="button"
              onClick={() => {
                setActiveTab('whitepapers')
                setMobileMenuOpen(false)
                setMobileSportsOpen(false)
              }}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'whitepapers'
                  ? 'bg-zinc-800 text-white font-bold ring-1 ring-zinc-700'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
              }`}
            >
              Methodology
            </button>
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
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-3.5">
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
                <div className="text-[10px] sm:text-[11px] text-zinc-500">Benchmark: Pinnacle</div>
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
                    <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 px-3 py-2 font-mono">
                      <div className="text-[10px] uppercase tracking-wider text-emerald-400/80">Overall record</div>
                      <div className="mt-0.5 flex items-baseline justify-between gap-2">
                        <span className="text-sm font-bold text-white">
                          {deskStatsByName.Scott.gradedCount > 0
                            ? `${deskStatsByName.Scott.wins}W-${deskStatsByName.Scott.losses}L${deskStatsByName.Scott.pushes > 0 ? `-${deskStatsByName.Scott.pushes}P` : ''}`
                            : '—'}
                        </span>
                        <span className={`text-sm font-extrabold ${deskStatsByName.Scott.netUnits >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {deskStatsByName.Scott.gradedCount > 0 ? `${deskStatsByName.Scott.displayUnits}U` : '—'}
                        </span>
                      </div>
                      {deskStatsByName.Scott.winRate ? (
                        <div className="mt-0.5 text-[10px] text-zinc-500">{deskStatsByName.Scott.winRate}% ATS</div>
                      ) : null}
                    </div>
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
                    <div className="rounded-xl border border-blue-500/25 bg-blue-500/5 px-3 py-2 font-mono">
                      <div className="text-[10px] uppercase tracking-wider text-blue-400/80">Overall record</div>
                      <div className="mt-0.5 flex items-baseline justify-between gap-2">
                        <span className="text-sm font-bold text-white">
                          {deskStatsByName.Rocco.gradedCount > 0
                            ? `${deskStatsByName.Rocco.wins}W-${deskStatsByName.Rocco.losses}L${deskStatsByName.Rocco.pushes > 0 ? `-${deskStatsByName.Rocco.pushes}P` : ''}`
                            : '—'}
                        </span>
                        <span className={`text-sm font-extrabold ${deskStatsByName.Rocco.netUnits >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {deskStatsByName.Rocco.gradedCount > 0 ? `${deskStatsByName.Rocco.displayUnits}U` : '—'}
                        </span>
                      </div>
                      {deskStatsByName.Rocco.winRate ? (
                        <div className="mt-0.5 text-[10px] text-zinc-500">{deskStatsByName.Rocco.winRate}% ATS</div>
                      ) : null}
                    </div>
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      Trench &amp; offensive efficiency specialist. Breaks down net EPA per play and injury spread value (PVAL) for NFL pricing.
                    </p>
                    <div className="pt-2 border-t border-zinc-800/80 space-y-1 text-[11px] font-mono text-zinc-300">
                      <div>• Core: Offensive / Defensive EPA</div>
                      <div>• Factor: Injury spread value (PVAL)</div>
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
                    <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 px-3 py-2 font-mono">
                      <div className="text-[10px] uppercase tracking-wider text-amber-400/80">Overall record</div>
                      <div className="mt-0.5 flex items-baseline justify-between gap-2">
                        <span className="text-sm font-bold text-white">
                          {deskStatsByName.Chedda.gradedCount > 0
                            ? `${deskStatsByName.Chedda.wins}W-${deskStatsByName.Chedda.losses}L${deskStatsByName.Chedda.pushes > 0 ? `-${deskStatsByName.Chedda.pushes}P` : ''}`
                            : '—'}
                        </span>
                        <span className={`text-sm font-extrabold ${deskStatsByName.Chedda.netUnits >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {deskStatsByName.Chedda.gradedCount > 0 ? `${deskStatsByName.Chedda.displayUnits}U` : '—'}
                        </span>
                      </div>
                      {deskStatsByName.Chedda.winRate ? (
                        <div className="mt-0.5 text-[10px] text-zinc-500">{deskStatsByName.Chedda.winRate}% ATS</div>
                      ) : null}
                    </div>
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
                    <div className="rounded-xl border border-purple-500/25 bg-purple-500/5 px-3 py-2 font-mono">
                      <div className="text-[10px] uppercase tracking-wider text-purple-400/80">Overall record</div>
                      <div className="mt-0.5 flex items-baseline justify-between gap-2">
                        <span className="text-sm font-bold text-white">
                          {deskStatsByName.Tank.gradedCount > 0
                            ? `${deskStatsByName.Tank.wins}W-${deskStatsByName.Tank.losses}L${deskStatsByName.Tank.pushes > 0 ? `-${deskStatsByName.Tank.pushes}P` : ''}`
                            : '—'}
                        </span>
                        <span className={`text-sm font-extrabold ${deskStatsByName.Tank.netUnits >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {deskStatsByName.Tank.gradedCount > 0 ? `${deskStatsByName.Tank.displayUnits}U` : '—'}
                        </span>
                      </div>
                      {deskStatsByName.Tank.winRate ? (
                        <div className="mt-0.5 text-[10px] text-zinc-500">{deskStatsByName.Tank.winRate}% ATS</div>
                      ) : null}
                    </div>
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
              <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-3.5 py-3">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Filtered record</div>
                  <div className="mt-1 text-sm sm:text-base font-mono font-bold text-white">
                    {filteredStats.gradedCount > 0
                      ? `${filteredStats.wins}W-${filteredStats.losses}L${filteredStats.pushes > 0 ? `-${filteredStats.pushes}P` : ''}`
                      : 'No graded picks'}
                  </div>
                </div>
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-3.5 py-3">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Filtered net units</div>
                  <div className={`mt-1 text-sm sm:text-base font-mono font-extrabold ${filteredStats.netUnits >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {filteredStats.gradedCount > 0 ? `${filteredStats.displayUnits}U` : '—'}
                  </div>
                </div>
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-3.5 py-3">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Win rate</div>
                  <div className="mt-1 text-sm sm:text-base font-mono font-bold text-white">
                    {filteredStats.winRate ? `${filteredStats.winRate}%` : '—'}
                  </div>
                </div>
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-3.5 py-3">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Rows in view</div>
                  <div className="mt-1 text-sm sm:text-base font-mono font-bold text-zinc-200">
                    {filteredPicks.length}
                    {filteredStats.pendingCount > 0 ? (
                      <span className="ml-1 text-[10px] font-semibold text-zinc-500">({filteredStats.pendingCount} pending)</span>
                    ) : null}
                  </div>
                </div>
              </div>

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
                      const settled = isPickSettled(pick)
                      const isWin = settled && (pick.status === 'win' || pick.status === 'won')
                      const isLoss = settled && (pick.status === 'loss' || pick.status === 'lost')
                      const isPush = settled && pick.status === 'push'
                      const isPending = !settled

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

                      const scoreText = settled
                        ? pick.metadata?.method_result
                          ? ` (${pick.metadata.method_result})`
                          : pick.away_score != null && pick.home_score != null
                          ? ` (${pick.away_score}-${pick.home_score})`
                          : ''
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
              </>
            )}
          </div>
        )}

        {/* NFL EPA Tab */}
        {activeTab === 'nfl' && (
          <div className="space-y-6">
            <div className="border-b border-zinc-800 pb-4">
              <h2 className="text-2xl font-bold text-white tracking-tight">NFL EPA Rankings</h2>
              <p className="text-zinc-400 text-xs sm:text-sm mt-1">
                Expected Points Added (EPA) per play on offense and defense. Public efficiency board only.
              </p>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-zinc-800 bg-zinc-900/40">
              <table className="w-full text-left border-collapse text-xs sm:text-sm font-mono">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-900/80 text-zinc-400 text-[11px] uppercase tracking-wider">
                    <th className="py-3 px-4">Team</th>
                    <th className="py-3 px-4">Off EPA / Play</th>
                    <th className="py-3 px-4">Def EPA / Play</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {trenchData.length === 0 ? (
                    <tr>
                      <td colSpan="3" className="py-12 text-center text-zinc-500 font-sans">
                        EPA metrics sync with Tuesday morning weekly calibrations.
                      </td>
                    </tr>
                  ) : (
                    trenchData.map((t) => (
                      <tr key={t.id || t.team_name} className="hover:bg-zinc-800/30">
                        <td className="py-2.5 px-4 text-white font-sans font-semibold">{t.team_name}</td>
                        <td className="py-2.5 px-4 text-emerald-400 font-semibold">
                          {t.off_epa_play > 0 ? `+${t.off_epa_play}` : t.off_epa_play}
                        </td>
                        <td className="py-2.5 px-4 text-cyan-400">
                          {t.def_epa_play > 0 ? `+${t.def_epa_play}` : t.def_epa_play}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* CFB Power Index Tab (public consensus; model stack teased/blurred) */}
        {activeTab === 'cfb' && (
          <div className="space-y-6">
            <div className="border-b border-zinc-800 pb-4">
              <h2 className="text-2xl font-bold text-white tracking-tight">College Football Power Ratings</h2>
              <p className="text-zinc-400 text-xs sm:text-sm mt-1">
                Multi-model consensus board. Component models stay locked on the public view. Not an AP poll.
              </p>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-zinc-800 bg-zinc-900/40">
              <table className="w-full text-left border-collapse text-xs sm:text-sm font-mono">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-900/80 text-zinc-400 text-[11px] uppercase tracking-wider">
                    <th className="py-3 px-4">Program</th>
                    <th className="py-3 px-4">Consensus</th>
                    <th className="py-3 px-4" title="Locked on public">
                      Model A
                    </th>
                    <th className="py-3 px-4" title="Locked on public">
                      Model B
                    </th>
                    <th className="py-3 px-4" title="Locked on public">
                      Model C
                    </th>
                    <th className="py-3 px-4">Off</th>
                    <th className="py-3 px-4">Def</th>
                    <th className="py-3 px-4">HFA</th>
                    <th className="py-3 px-4">Tempo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {cfbData.length === 0 ? (
                    <tr>
                      <td colSpan="9" className="py-12 text-center text-zinc-500 font-sans">
                        CFB consensus board updates weekly.
                      </td>
                    </tr>
                  ) : (
                    cfbData.map((team, idx) => {
                      const tease = fakeModelPlaceholders(team.team_name, team.power_rating, idx)
                      return (
                        <tr key={team.id || team.team_name} className="hover:bg-zinc-800/30">
                          <td className="py-2.5 px-4 text-white font-sans font-semibold whitespace-nowrap">
                            <span className="text-zinc-500 text-xs mr-2">{idx + 1}.</span>
                            {team.team_name}
                          </td>
                          <td className="py-2.5 px-4 text-emerald-400 font-bold">
                            {team.power_rating > 0 ? `+${team.power_rating}` : team.power_rating}
                          </td>
                          <td className="py-2.5 px-4 text-zinc-400">
                            <BlurredModelTease value={tease.a} />
                          </td>
                          <td className="py-2.5 px-4 text-zinc-400">
                            <BlurredModelTease value={tease.b} />
                          </td>
                          <td className="py-2.5 px-4 text-zinc-400">
                            <BlurredModelTease value={tease.c} />
                          </td>
                          <td className="py-2.5 px-4 text-zinc-300">{team.off_rating}</td>
                          <td className="py-2.5 px-4 text-zinc-300">{team.def_rating}</td>
                          <td className="py-2.5 px-4 text-zinc-400">
                            +{team.home_field_advantage ?? team.home_field_adv ?? 2.5}
                          </td>
                          <td className="py-2.5 px-4 text-zinc-400">{team.tempo_rating ?? '—'}</td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* UFC Stats Tab */}
        {activeTab === 'ufc' && (
          <div className="space-y-6">
            <div className="border-b border-zinc-800 pb-4">
              <h2 className="text-2xl font-bold text-white tracking-tight">UFC Fighter Metrics</h2>
              <p className="text-zinc-400 text-xs sm:text-sm mt-1">
                Official UFC Stats-style striking, grappling, and finish rates. Public numbers available elsewhere.
              </p>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-zinc-800 bg-zinc-900/40">
              <table className="w-full text-left border-collapse text-[11px] sm:text-xs font-mono">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-900/80 text-zinc-400 text-[10px] uppercase tracking-wider">
                    <th className="py-3 px-3">Fighter</th>
                    <th className="py-3 px-3">Division</th>
                    <th className="py-3 px-3">Reach</th>
                    <th className="py-3 px-3">Stance</th>
                    <th className="py-3 px-3">SLpM</th>
                    <th className="py-3 px-3">SApM</th>
                    <th className="py-3 px-3">Str Acc</th>
                    <th className="py-3 px-3">Str Def</th>
                    <th className="py-3 px-3">TD Avg</th>
                    <th className="py-3 px-3">TD Acc</th>
                    <th className="py-3 px-3">TD Def</th>
                    <th className="py-3 px-3">Sub Avg</th>
                    <th className="py-3 px-3">Finish %</th>
                    <th className="py-3 px-3">KO %</th>
                    <th className="py-3 px-3">Sub %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {ufcData.length === 0 ? (
                    <tr>
                      <td colSpan="15" className="py-12 text-center text-zinc-500 font-sans">
                        Fighter metrics sync ahead of each UFC card.
                      </td>
                    </tr>
                  ) : (
                    ufcData.map((f) => (
                      <tr key={f.id || f.fighter_name} className="hover:bg-zinc-800/30">
                        <td className="py-2 px-3 text-white font-sans font-semibold whitespace-nowrap">
                          {f.fighter_name}
                        </td>
                        <td className="py-2 px-3 text-zinc-300 whitespace-nowrap">{f.division}</td>
                        <td className="py-2 px-3 text-zinc-400">{f.reach_inches}&quot;</td>
                        <td className="py-2 px-3 text-zinc-400">{f.stance}</td>
                        <td className="py-2 px-3 text-emerald-400">{f.slpm}</td>
                        <td className="py-2 px-3 text-cyan-400">{f.sapm}</td>
                        <td className="py-2 px-3 text-zinc-300">{f.str_acc}%</td>
                        <td className="py-2 px-3 text-zinc-300">{f.str_def}%</td>
                        <td className="py-2 px-3 text-zinc-300">{f.td_avg}</td>
                        <td className="py-2 px-3 text-zinc-400">{f.td_acc}%</td>
                        <td className="py-2 px-3 text-zinc-400">{f.td_def}%</td>
                        <td className="py-2 px-3 text-zinc-300">{f.sub_avg}</td>
                        <td className="py-2 px-3 text-zinc-300">{f.finish_rate}%</td>
                        <td className="py-2 px-3 text-zinc-400">{f.ko_finish_rate}%</td>
                        <td className="py-2 px-3 text-zinc-400">{f.sub_finish_rate}%</td>
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
                How the ensemble is built, then what each desk actually owns ... without burying four specialists under one generic stack.
              </p>
            </div>

            <div className="space-y-6">
              {/* Overview: Four-Desk Ensemble */}
              <div className="p-6 rounded-2xl border border-zinc-800 bg-zinc-900/50 space-y-3">
                <div className="text-xs font-mono font-bold text-purple-400 uppercase tracking-wider">
                  ARCHITECTURE · ENSEMBLE DESIGN
                </div>
                <h3 className="text-lg font-bold text-white">
                  Why Four Desks Beat One Overfit Number
                </h3>
                <p className="text-zinc-300 text-xs sm:text-sm leading-relaxed">
                  Most retail &quot;AI&quot; handicappers stack 120+ micro-weighted features into a single projected spread, then
                  backtest until the output looks clean. That is curve-fitting: the model memorizes noise in last season&apos;s box
                  scores and collapses the moment roster churn, officiating variance, or a weather pivot shifts the profile.
                </p>
                <p className="text-zinc-300 text-xs sm:text-sm leading-relaxed">
                  The Sharpe Syndicate runs four independent desks ... each tuned to a narrow, high-signal lane (pure EV modeling,
                  trench favorites &amp; key numbers, underdog value, situational totals). Every desk ingests only its most robust
                  inputs, publishes a standalone pick, and compares that thesis against the other three. Unanimous agreement surfaces
                  as a hammer; a 2–2 split stays visible on the slate instead of getting averaged into one buried decimal.
                </p>
                <p className="text-zinc-300 text-xs sm:text-sm leading-relaxed">
                  That structure leaves room for calibrated human intuition. When Scott&apos;s model and Rocco&apos;s trench read
                  diverge by half a point on a -3 hook, the tension stays auditable on the card. Desk leads can apply situational
                  overrides (short-week travel, motivational spots, late injury pivots) without retraining the entire stack.
                </p>
              </div>

              {/* Desk: Scott */}
              <div id="methodology-scott" className="p-6 rounded-2xl border border-emerald-500/20 bg-gradient-to-b from-emerald-950/15 via-zinc-900/50 to-zinc-950 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-mono font-bold text-emerald-400 uppercase tracking-wider">
                    DESK 01 · SCOTT SHARPE
                  </span>
                  <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">The Model</span>
                </div>
                <h3 className="text-lg font-bold text-white">
                  Pure EV Modeling &amp; Injury PVAL
                </h3>
                <p className="text-zinc-300 text-xs sm:text-sm leading-relaxed">
                  Scott&apos;s lane is closing-line EV: synthesize sharp offshore pricing (Pinnacle / Circa), project a fair number,
                  and only press when the market is wrong enough to clear juice. He owns syndicate consensus orchestration and bankroll
                  exposure when desks align into a hammer.
                </p>
                <p className="text-zinc-300 text-xs sm:text-sm leading-relaxed">
                  Injury edges are modeled as Point Spread Value (PVAL). Market-consensus player values (starting QB in the
                  multi-point range, elite trench / coverage pieces in fractions of a point) net into a quantifiable spread gap versus
                  retail boards, so a late scratch moves the fair number in a measurable way.
                </p>
              </div>

              {/* Desk: Rocco */}
              <div id="methodology-rocco" className="p-6 rounded-2xl border border-blue-500/20 bg-gradient-to-b from-blue-950/15 via-zinc-900/50 to-zinc-950 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-mono font-bold text-blue-400 uppercase tracking-wider">
                    DESK 02 · ROCCO
                  </span>
                  <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">Trenches</span>
                </div>
                <h3 className="text-lg font-bold text-white">
                  Key Numbers, Hook Tax &amp; Wong Structure
                </h3>
                <p className="text-zinc-300 text-xs sm:text-sm leading-relaxed">
                  Rocco lives in favorites, trench / EPA edges, and NFL key-number reality. Roughly 15% of games land on 3 and ~9% on 7,
                  so laying -3.5 or -7.5 carries a real hook tax unless trench dominance justifies crossing the number. Buying
                  +3.5 / +7.5 still matters on his desk when the cushion around those keys is the edge.
                </p>
                <p className="text-zinc-300 text-xs sm:text-sm leading-relaxed">
                  That same key-number map powers the 6-point Wong teaser engine: favorites teased from -7.5/-8.5 down through
                  -1.5/-2.5 (and paired dog legs in the classic Wong windows) in low-total games (&lt; 49) so both 3 and 7 get
                  crossed ... enough theoretical edge to fight standard 2-team teaser juice.
                </p>
              </div>

              {/* Desk: Chedda */}
              <div id="methodology-chedda" className="p-6 rounded-2xl border border-amber-500/20 bg-gradient-to-b from-amber-950/15 via-zinc-900/50 to-zinc-950 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-mono font-bold text-amber-400 uppercase tracking-wider">
                    DESK 03 · CHEDDA
                  </span>
                  <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">Dogs &amp; ML</span>
                </div>
                <h3 className="text-lg font-bold text-white">
                  Underdog Value &amp; Moneyline Pricing
                </h3>
                <p className="text-zinc-300 text-xs sm:text-sm leading-relaxed">
                  Chedda hunts mispriced dogs and plus-money moneylines ... spots where public overreaction, inflated favorites, or
                  soft retail juice leaves +EV on the underdog side. He isolates dogs whose true win probability clears the price
                  on the board.
                </p>
                <p className="text-zinc-300 text-xs sm:text-sm leading-relaxed">
                  On structured teasers, Chedda owns the dog-side Wong windows (+1.5/+2.5 up through +7.5/+8.5) when the total stays
                  low and the hook math still works with the rest of the ticket.
                </p>
              </div>

              {/* Desk: Tank */}
              <div id="methodology-tank" className="p-6 rounded-2xl border border-rose-500/20 bg-gradient-to-b from-rose-950/15 via-zinc-900/50 to-zinc-950 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-mono font-bold text-rose-400 uppercase tracking-wider">
                    DESK 04 · TANK
                  </span>
                  <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">Totals</span>
                </div>
                <h3 className="text-lg font-bold text-white">
                  Situational Totals &amp; Pace / Environment Edges
                </h3>
                <p className="text-zinc-300 text-xs sm:text-sm leading-relaxed">
                  Tank&apos;s lane is totals-native: pace, play-calling tendencies, weather and wind, short weeks, and other
                  situational levers that move scoring distribution. Those inputs can change the total even when the side stays put.
                </p>
                <p className="text-zinc-300 text-xs sm:text-sm leading-relaxed">
                  Totals also have their own clustering (certain numbers hit more often historically). Tank prices those frequencies
                  into whether an under or over at a soft number is actually +EV, then publishes a standalone totals thesis the
                  other desks can agree with, fade, or leave alone.
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
