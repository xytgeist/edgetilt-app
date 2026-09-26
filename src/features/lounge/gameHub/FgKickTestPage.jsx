import { useMemo, useState } from 'react'
import GameHubHero from './GameHubHero.jsx'

const MOCK_GAME = {
  sport_key: 'americanfootball_nfl',
  status: 'in',
  broadcast: 'TEST',
  away: {
    name: 'Cardinals',
    abbrev: 'ARI',
    score: 17,
    record: '2-1',
    logo: '/sports/nfl/logos/ARI.png',
    primary: '#97233F',
  },
  home: {
    name: 'Chiefs',
    abbrev: 'KC',
    score: 21,
    record: '3-0',
    logo: '/sports/nfl/logos/KC.png',
    primary: '#E31837',
  },
}

function buildLive({ possession, period, yardLine }) {
  return {
    possession,
    period,
    quarter: period,
    clock: '5:42',
    down: 4,
    distance: 7,
    yard_line: yardLine,
    yardLine,
    away_timeouts: 2,
    home_timeouts: 3,
  }
}

const SCENARIOS = [
  { id: 'made-33-r', label: 'Made 33 → right', yards: 33, made: true, possession: 'away', missSide: null },
  { id: 'made-47-r', label: 'Made 47 → right', yards: 47, made: true, possession: 'away', missSide: null },
  { id: 'made-33-l', label: 'Made 33 → left', yards: 33, made: true, possession: 'home', missSide: null },
  { id: 'made-52-l', label: 'Made 52 → left', yards: 52, made: true, possession: 'home', missSide: null },
  { id: 'miss-wl', label: 'Miss wide left', yards: 41, made: false, possession: 'away', missSide: 'left' },
  { id: 'miss-wr', label: 'Miss wide right', yards: 41, made: false, possession: 'away', missSide: 'right' },
  { id: 'miss-wl-l', label: 'Miss WL → left posts', yards: 38, made: false, possession: 'home', missSide: 'left' },
  { id: 'miss-wr-l', label: 'Miss WR → left posts', yards: 38, made: false, possession: 'home', missSide: 'right' },
]

function playText({ yards, made, missSide }) {
  const who = '#3 H.Butker'
  if (made) return `${who} ${yards} yard field goal is GOOD`
  if (missSide === 'left') return `${who} ${yards} yard field goal is NO GOOD, wide left`
  if (missSide === 'right') return `${who} ${yards} yard field goal is NO GOOD, wide right`
  return `${who} ${yards} yard field goal is NO GOOD`
}

/**
 * Local harness for FG flight / front-pole smoke … not linked from nav.
 * Open `/fg-kick-test` on the Vite app (or test deploy).
 */
export default function FgKickTestPage() {
  const [half, setHalf] = useState(1)
  const [nonce, setNonce] = useState(0)
  const [lastPlay, setLastPlay] = useState('')
  const [possession, setPossession] = useState('away')
  const [yards, setYards] = useState(40)

  const live = useMemo(
    () =>
      buildLive({
        possession,
        period: half,
        // Midfield-ish; resolveFgLosAndKick prefers implied LOS from FG yards.
        yardLine: 50,
      }),
    [possession, half],
  )

  const fire = (scenario) => {
    const nextPossession = scenario.possession
    setPossession(nextPossession)
    setYards(scenario.yards)
    setLastPlay(playText(scenario))
    setNonce((n) => n + 1)
  }

  const fireCustom = ({ made, missSide }) => {
    setLastPlay(playText({ yards, made, missSide }))
    setNonce((n) => n + 1)
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-3xl px-3 py-4 sm:px-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-lg font-bold tracking-tight text-white">FG kick test</h1>
            <p className="text-[12px] text-zinc-400">
              Real GameHubHero field … front pole + flight. Half {half === 1 ? '1 (no flip)' : '2 (flipped)'}.
            </p>
          </div>
          <a href="/" className="text-[12px] font-semibold text-emerald-400 hover:text-emerald-300">
            ← App
          </a>
        </div>

        <div className="mb-3 flex flex-wrap gap-2">
          <button
            type="button"
            className={`rounded-md px-3 py-1.5 text-[12px] font-semibold ${
              half === 1 ? 'bg-emerald-600 text-white' : 'bg-zinc-800 text-zinc-200'
            }`}
            onClick={() => setHalf(1)}
          >
            1H
          </button>
          <button
            type="button"
            className={`rounded-md px-3 py-1.5 text-[12px] font-semibold ${
              half === 3 ? 'bg-emerald-600 text-white' : 'bg-zinc-800 text-zinc-200'
            }`}
            onClick={() => setHalf(3)}
          >
            2H (flip)
          </button>
          <button
            type="button"
            className={`rounded-md px-3 py-1.5 text-[12px] font-semibold ${
              possession === 'away' ? 'bg-sky-600 text-white' : 'bg-zinc-800 text-zinc-200'
            }`}
            onClick={() => setPossession('away')}
          >
            Away ball (→ right in 1H)
          </button>
          <button
            type="button"
            className={`rounded-md px-3 py-1.5 text-[12px] font-semibold ${
              possession === 'home' ? 'bg-rose-600 text-white' : 'bg-zinc-800 text-zinc-200'
            }`}
            onClick={() => setPossession('home')}
          >
            Home ball (→ left in 1H)
          </button>
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <label className="text-[12px] text-zinc-400">
            Yards{' '}
            <input
              type="number"
              min={18}
              max={65}
              value={yards}
              onChange={(e) => setYards(Number(e.target.value) || 40)}
              className="ml-1 w-14 rounded border border-zinc-700 bg-zinc-900 px-1.5 py-1 text-zinc-100"
            />
          </label>
          <button
            type="button"
            className="rounded-md bg-emerald-700 px-3 py-1.5 text-[12px] font-semibold text-white"
            onClick={() => fireCustom({ made: true, missSide: null })}
          >
            Kick good
          </button>
          <button
            type="button"
            className="rounded-md bg-amber-700 px-3 py-1.5 text-[12px] font-semibold text-white"
            onClick={() => fireCustom({ made: false, missSide: 'left' })}
          >
            Miss WL
          </button>
          <button
            type="button"
            className="rounded-md bg-amber-700 px-3 py-1.5 text-[12px] font-semibold text-white"
            onClick={() => fireCustom({ made: false, missSide: 'right' })}
          >
            Miss WR
          </button>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          {SCENARIOS.map((s) => (
            <button
              key={s.id}
              type="button"
              className="rounded-md bg-zinc-800 px-2.5 py-1.5 text-[11px] font-semibold text-zinc-100 hover:bg-zinc-700"
              onClick={() => fire(s)}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 shadow-xl">
          <GameHubHero
            game={MOCK_GAME}
            live={live}
            lastPlay={lastPlay}
            playReplayNonce={nonce}
            replayTeam={possession}
          />
        </div>

        <p className="mt-3 break-all font-mono text-[11px] text-zinc-500">
          {lastPlay || '(tap a kick)'} · nonce {nonce}
        </p>
      </div>
    </div>
  )
}
