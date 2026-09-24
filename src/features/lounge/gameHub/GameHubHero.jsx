import {
  LoungeSportsTeamLogo,
  useLoungeSportsPillWashAndLogos,
} from '../loungeSportsPillPaint.jsx'
import {
  downDistanceLabel,
  fieldPercent,
  formatKickoff,
  kalshiContracts,
  liveClockLabel,
  scoreText,
  yardLineLabel,
} from './gameHubFormatters.js'
import { pickGameMoneyline } from './gameHubMoneyline.js'

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

function MoneylineRow({ side, accent }) {
  if (!side) return null
  const inner = (
    <>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-semibold text-white">{side.label}</div>
        <div className="mt-0.5 h-[3px] w-10 rounded-full" style={{ background: accent }} />
      </div>
      <span className="shrink-0 text-[11px] font-medium tabular-nums text-white/45">{side.mult}x</span>
      <span className="inline-flex shrink-0 items-center justify-center rounded-full border border-emerald-400/45 bg-emerald-500/15 px-2.5 py-1 text-[12px] font-bold tabular-nums text-emerald-300">
        {side.pct}%
      </span>
    </>
  )
  if (side.url) {
    return (
      <a
        href={side.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 touch-manipulation active:opacity-85"
      >
        {inner}
      </a>
    )
  }
  return <div className="flex items-center gap-2">{inner}</div>
}

function HeroMoneylineMarket({ game, props, books, awayColor, homeColor }) {
  const market = pickGameMoneyline({ props, books, game })
  if (!market?.away || !market?.home) return null
  const volLabel =
    market.volume != null && market.volume > 0 ? `${kalshiContracts(market.volume)} vol` : null
  const sourceLabel =
    market.source === 'polymarket' ? 'Poly' : market.source === 'kalshi' ? 'Kalshi' : market.source

  return (
    <div data-lounge-game-hero-ml className="px-4 pb-3 pt-1">
      <div className="space-y-2 rounded-2xl border border-white/10 bg-black/25 px-3 py-2.5 backdrop-blur-[2px]">
        <MoneylineRow side={market.away} accent={awayColor || '#ef4444'} />
        <MoneylineRow side={market.home} accent={homeColor || '#22c55e'} />
        {volLabel || sourceLabel ? (
          <div className="flex items-center justify-between gap-2 pt-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/40">
            <span>{volLabel || 'Winner'}</span>
            {sourceLabel ? <span>{sourceLabel}</span> : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}

/**
 * X-style split team-color hero. Same silver gridiron + multiply washes as Lounge
 * post game cards. `topBar` sits inside the wash so colors run under the status row.
 */
export default function GameHubHero({
  game,
  live,
  lastPlay,
  topBar = null,
  props = null,
  books = null,
}) {
  const { awayColor, homeColor, awayTreatment, homeTreatment } = useLoungeSportsPillWashAndLogos(game)
  const clock = liveClockLabel(game, live)
  const down = downDistanceLabel(live)
  const yard = yardLineLabel(game, live)
  const kickoff = game.status === 'pre' ? formatKickoff(game.commence_time) : ''

  return (
    <div
      data-lounge-game-hero
      className="relative overflow-hidden"
      style={{
        '--hero-away': awayColor,
        '--hero-home': homeColor,
      }}
    >
      <span data-lounge-game-hero-field aria-hidden="true" />
      <span data-lounge-game-hero-away aria-hidden="true" />
      <span data-lounge-game-hero-home aria-hidden="true" />
      <span data-lounge-game-hero-seam aria-hidden="true" />
      <div className="pointer-events-none absolute inset-0 z-[3] bg-gradient-to-b from-black/15 via-black/28 to-zinc-950" />

      {topBar ? <div className="relative z-[4]">{topBar}</div> : null}

      <div className="relative z-[4] px-4 pb-2 pt-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
            <LoungeSportsTeamLogo side={game.away} treatment={awayTreatment} size={52} />
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
          </div>

          <div className="flex min-w-0 flex-1 flex-col items-end gap-1">
            <LoungeSportsTeamLogo side={game.home} treatment={homeTreatment} size={52} />
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

      <div className="relative z-[4]">
        <HeroMoneylineMarket
          game={game}
          props={props}
          books={books}
          awayColor={awayColor}
          homeColor={homeColor}
        />
        <FieldViz game={game} live={live} />
      </div>

      {lastPlay ? (
        <div className="relative z-[4] truncate px-4 pb-3 text-[12px] text-white/75">
          <span className="font-semibold uppercase tracking-wide text-white/55">Last play </span>
          {lastPlay}
        </div>
      ) : null}
    </div>
  )
}
