import { NFL_TEAM_CATALOG } from '../loungeSportsMatch.js'
import {
  downDistanceLabel,
  fieldPercent,
  formatKickoff,
  liveClockLabel,
  scoreText,
  yardLineLabel,
} from './gameHubFormatters.js'

function teamMeta(abbrev) {
  const a = String(abbrev || '').toUpperCase()
  return NFL_TEAM_CATALOG.find((t) => t.abbrev === a) || null
}

function TeamLogo({ side, size = 56 }) {
  const letter = String(side?.abbrev || '?').slice(0, 1)
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center drop-shadow"
      style={{ width: size, height: size }}
    >
      {side?.logo ? (
        <img
          src={side.logo}
          alt=""
          className="h-full w-full object-contain"
          onError={(ev) => {
            ev.currentTarget.style.display = 'none'
          }}
        />
      ) : (
        <span className="text-lg font-bold text-white/90">{letter}</span>
      )}
    </span>
  )
}

function FieldViz({ game, live }) {
  if (!String(game.sport_key || '').includes('football')) return null
  if (game.status === 'pre') return null
  const pos = fieldPercent(live)
  if (pos == null && !live?.possession) return null
  const left = pos == null ? 50 : pos
  return (
    <div data-lounge-game-field className="px-4 pb-3 pt-1">
      <div className="relative h-[64px] overflow-hidden rounded-2xl border border-white/10 bg-emerald-900/90 shadow-inner">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              'repeating-linear-gradient(90deg, transparent, transparent 9.5%, rgba(255,255,255,0.08) 9.5%, rgba(255,255,255,0.08) 10%)',
          }}
        />
        <div className="absolute inset-y-0 left-[20%] w-px bg-white/30" />
        <div className="absolute inset-y-0 left-1/2 w-px bg-yellow-300/90" />
        <div className="absolute inset-y-0 left-[80%] w-px bg-white/30" />
        <span className="absolute left-2 top-1.5 text-[10px] font-bold uppercase tracking-wide text-white/85">
          {game.away?.abbrev}
        </span>
        <span className="absolute right-2 top-1.5 text-[10px] font-bold uppercase tracking-wide text-white/85">
          {game.home?.abbrev}
        </span>
        <span className="absolute bottom-1.5 left-[20%] -translate-x-1/2 text-[9px] font-semibold text-white/70">
          20
        </span>
        <span className="absolute bottom-1.5 left-1/2 -translate-x-1/2 text-[9px] font-semibold text-white/70">
          50
        </span>
        <span className="absolute bottom-1.5 left-[80%] -translate-x-1/2 text-[9px] font-semibold text-white/70">
          20
        </span>
        <span
          className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-amber-300 shadow-lg"
          style={{ left: `${left}%` }}
        />
      </div>
    </div>
  )
}

/**
 * X-style split team-color hero. `topBar` (back + game pills) sits inside the wash
 * so colors run under the status / title row.
 */
export default function GameHubHero({ game, live, lastPlay, topBar = null }) {
  const awayMeta = teamMeta(game.away?.abbrev)
  const homeMeta = teamMeta(game.home?.abbrev)
  const awayColor = awayMeta?.color || '#3f3f46'
  const homeColor = homeMeta?.color || '#27272a'
  const clock = liveClockLabel(game, live)
  const down = downDistanceLabel(live)
  const yard = yardLineLabel(game, live)
  const kickoff = game.status === 'pre' ? formatKickoff(game.commence_time) : ''

  return (
    <div data-lounge-game-hero className="relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `linear-gradient(90deg, ${awayColor} 0%, ${awayColor} 46%, ${homeColor} 54%, ${homeColor} 100%)`,
        }}
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/20 via-black/30 to-zinc-950" />

      {topBar ? <div className="relative z-[1]">{topBar}</div> : null}

      <div className="relative px-4 pb-2 pt-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
            <TeamLogo side={game.away} size={52} />
            <div className="min-w-0">
              <div className="truncate text-[13px] font-semibold uppercase tracking-wide text-white/80">
                {game.away?.abbrev}
              </div>
              <div className="text-[40px] font-bold leading-none tabular-nums text-white drop-shadow">
                {scoreText(game.away, game.status)}
              </div>
            </div>
          </div>

          <div className="flex max-w-[38%] flex-col items-center gap-0.5 px-1 text-center">
            <span
              className={`text-[13px] font-bold tracking-wide ${
                game.status === 'in' ? 'text-rose-300' : 'text-white/85'
              }`}
            >
              {clock}
            </span>
            {down ? <span className="text-[12px] font-semibold text-white/90">{down}</span> : null}
            {yard ? <span className="text-[12px] font-semibold text-white/70">{yard}</span> : null}
            {kickoff ? <span className="text-[11px] font-medium text-white/70">{kickoff}</span> : null}
            {game.status === 'pre' ? (
              <span className="mt-1 rounded-full border border-white/20 bg-white/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/90">
                Pregame
              </span>
            ) : null}
          </div>

          <div className="flex min-w-0 flex-1 flex-col items-end gap-1">
            <TeamLogo side={game.home} size={52} />
            <div className="min-w-0 text-right">
              <div className="truncate text-[13px] font-semibold uppercase tracking-wide text-white/80">
                {game.home?.abbrev}
              </div>
              <div className="text-[40px] font-bold leading-none tabular-nums text-white drop-shadow">
                {scoreText(game.home, game.status)}
              </div>
            </div>
          </div>
        </div>
      </div>

      <FieldViz game={game} live={live} />

      {lastPlay ? (
        <div className="relative truncate px-4 pb-3 text-[12px] text-white/75">
          <span className="font-semibold uppercase tracking-wide text-white/55">Last play </span>
          {lastPlay}
        </div>
      ) : null}
    </div>
  )
}
