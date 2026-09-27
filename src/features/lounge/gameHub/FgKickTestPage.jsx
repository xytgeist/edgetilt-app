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

/** Pick-six texts in both feed dialects; the return yards drive the pick spot. */
function pickSixText({ format, returnYards }) {
  if (format === 'nfl') {
    return `(8:12) (Shotgun) P.Mahomes pass short right intended for T.Kelce INTERCEPTED by B.Baker at KC 38. B.Baker for ${returnYards} yards, TOUCHDOWN. C.Ryland extra point is GOOD.`
  }
  return `(02:25) Shotgun #16 L.Sellers pass intercepted by #6 R.Morgan at USC23 #6 R.Morgan return ${returnYards} yards to the USC00 TOUCHDOWN, clock 02:20 #31 C.Talty kick attempt good (H: #32 A.Asparuhov, LS: #55 A.Rozier)`
}

/** `losOwn` = LOS in the offense's own territory (yard 1-50), else the defense's. */
const PICK_SCENARIOS = [
  { id: 'pick-cfb-home', label: 'Pick 6 CFB text · KC ball own 12 · ret 23', offense: 'home', losYard: 12, losOwn: true, returnYards: 23, format: 'cfb' },
  { id: 'pick-nfl-home', label: 'Pick 6 NFL text · KC ball own 30 · ret 38', offense: 'home', losYard: 30, losOwn: true, returnYards: 38, format: 'nfl' },
  { id: 'pick-away', label: 'Pick 6 · ARI ball own 35 · ret 40', offense: 'away', losYard: 35, losOwn: true, returnYards: 40, format: 'cfb' },
  { id: 'pick-long', label: 'Pick 6 · ARI ball at 50 · ret 85', offense: 'away', losYard: 50, losOwn: true, returnYards: 85, format: 'nfl' },
]

function pickStartSpot({ offense, losYard, losOwn }) {
  const defense = offense === 'home' ? 'away' : 'home'
  return { yard_line: losYard, yard_side: losOwn ? offense : defense, down: 3, distance: 7 }
}

function playText({ yards, made, missSide }) {
  const who = '#3 H.Butker'
  if (made) return `${who} ${yards} yard field goal is GOOD`
  if (missSide === 'left') return `${who} ${yards} yard field goal is NO GOOD, wide left`
  if (missSide === 'right') return `${who} ${yards} yard field goal is NO GOOD, wide right`
  return `${who} ${yards} yard field goal is NO GOOD`
}

/**
 * Local harness for Game Hub field animations (FG flight / front pole, pick-six) … not linked from nav.
 * Open `/play-anim-test` (or legacy `/fg-kick-test`) on the Vite app or test deploy.
 */
export default function FgKickTestPage() {
  const [half, setHalf] = useState(1)
  const [nonce, setNonce] = useState(0)
  const [lastPlay, setLastPlay] = useState('')
  const [possession, setPossession] = useState('away')
  const [yards, setYards] = useState(40)
  /** Feed LOS for the replayed play (pick-six); FG derives its own LOS from kick yards. */
  const [startSpot, setStartSpot] = useState(null)
  const [pickReturn, setPickReturn] = useState(30)
  const [pickLosYard, setPickLosYard] = useState(25)
  const [pickLosOwn, setPickLosOwn] = useState(true)

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
    setStartSpot(null)
    setLastPlay(playText(scenario))
    setNonce((n) => n + 1)
  }

  const fireCustom = ({ made, missSide }) => {
    setStartSpot(null)
    setLastPlay(playText({ yards, made, missSide }))
    setNonce((n) => n + 1)
  }

  const firePick = (scenario) => {
    setPossession(scenario.offense)
    setPickReturn(scenario.returnYards)
    setPickLosYard(scenario.losYard)
    setPickLosOwn(scenario.losOwn)
    setStartSpot(pickStartSpot(scenario))
    setLastPlay(pickSixText(scenario))
    setNonce((n) => n + 1)
  }

  const firePickCustom = (format) => {
    setStartSpot(pickStartSpot({ offense: possession, losYard: pickLosYard, losOwn: pickLosOwn }))
    setLastPlay(pickSixText({ format, returnYards: pickReturn }))
    setNonce((n) => n + 1)
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-3xl px-3 py-4 sm:px-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-lg font-bold tracking-tight text-white">Play animation test</h1>
            <p className="text-[12px] text-zinc-400">
              Real GameHubHero field … FG flight + pick-six. Half {half === 1 ? '1 (no flip)' : '2 (flipped)'}.
              Ball buttons set the offense.
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

        <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-zinc-500">Pick-six</div>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <label className="text-[12px] text-zinc-400">
            Return yds{' '}
            <input
              type="number"
              min={1}
              max={100}
              value={pickReturn}
              onChange={(e) => setPickReturn(Number(e.target.value) || 30)}
              className="ml-1 w-14 rounded border border-zinc-700 bg-zinc-900 px-1.5 py-1 text-zinc-100"
            />
          </label>
          <label className="text-[12px] text-zinc-400">
            LOS{' '}
            <input
              type="number"
              min={1}
              max={50}
              value={pickLosYard}
              onChange={(e) => setPickLosYard(Math.max(1, Math.min(50, Number(e.target.value) || 25)))}
              className="ml-1 w-14 rounded border border-zinc-700 bg-zinc-900 px-1.5 py-1 text-zinc-100"
            />
          </label>
          <button
            type="button"
            className="rounded-md bg-zinc-800 px-2.5 py-1.5 text-[12px] font-semibold text-zinc-100"
            onClick={() => setPickLosOwn((v) => !v)}
          >
            {pickLosOwn ? 'Offense own side' : 'Defense side'}
          </button>
          <button
            type="button"
            className="rounded-md bg-violet-700 px-3 py-1.5 text-[12px] font-semibold text-white"
            onClick={() => firePickCustom('cfb')}
          >
            Throw pick (CFB text)
          </button>
          <button
            type="button"
            className="rounded-md bg-violet-700 px-3 py-1.5 text-[12px] font-semibold text-white"
            onClick={() => firePickCustom('nfl')}
          >
            Throw pick (NFL text)
          </button>
        </div>
        <div className="mb-4 flex flex-wrap gap-2">
          {PICK_SCENARIOS.map((s) => (
            <button
              key={s.id}
              type="button"
              className="rounded-md bg-zinc-800 px-2.5 py-1.5 text-[11px] font-semibold text-zinc-100 hover:bg-zinc-700"
              onClick={() => firePick(s)}
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
            playStartSpot={startSpot}
          />
        </div>

        <p className="mt-3 break-all font-mono text-[11px] text-zinc-500">
          {lastPlay || '(tap a kick)'} · nonce {nonce}
        </p>
      </div>
    </div>
  )
}
