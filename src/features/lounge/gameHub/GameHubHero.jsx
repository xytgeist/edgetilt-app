import {
  LoungeSportsTeamLogo,
  useLoungeSportsPillWashAndLogos,
} from '../loungeSportsPillPaint.jsx'
import {
  downDistanceLabel,
  fieldPercent,
  formatKickoff,
  liveClockLabel,
  scoreText,
  yardLineLabel,
} from './gameHubFormatters.js'

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
 * One bets bar (away left / home right). Money lives in the side pair `bets·$`
 * under each abbrev … no second rail, no seam tick.
 */
function HeroPublicBetting({ game, splits, awayColor, homeColor }) {
  if (!splits) return null
  const awayBets = Math.max(0, Math.min(100, Number(splits.away_ticket_pct)))
  const homeBets = Math.max(0, Math.min(100, Number(splits.home_ticket_pct)))
  const awayMoney = Math.max(0, Math.min(100, Number(splits.away_handle_pct)))
  const homeMoney = Math.max(0, Math.min(100, Number(splits.home_handle_pct)))
  if ([awayBets, homeBets, awayMoney, homeMoney].some((n) => Number.isNaN(n))) return null

  const moneySkew =
    Math.abs(awayMoney - awayBets) >= 12 || Boolean(splits.is_fade_public)
  const awayTint = awayColor || '#ef4444'
  const homeTint = homeColor || '#22c55e'

  return (
    <div data-lounge-game-hero-splits className="px-4 pb-2.5 pt-0.5">
      <div
        className={`relative h-[7px] overflow-hidden rounded-full bg-black/25 ring-1 ring-inset ${
          moneySkew ? 'ring-amber-300/45' : 'ring-white/15'
        }`}
        title="% of bets"
      >
        <div className="absolute inset-0 flex">
          <div
            className="h-full transition-[width] duration-500 ease-out"
            style={{
              width: `${awayBets}%`,
              background: `linear-gradient(90deg, ${awayTint}bb, ${awayTint})`,
            }}
          />
          <div
            className="h-full transition-[width] duration-500 ease-out"
            style={{
              width: `${homeBets}%`,
              background: `linear-gradient(90deg, ${homeTint}, ${homeTint}bb)`,
            }}
          />
        </div>
      </div>

      <div className="mt-1.5 flex items-start justify-between gap-2">
        <div className="min-w-0 text-left">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/70 drop-shadow">
            {game.away?.abbrev}
          </div>
          <div className="mt-0.5 text-[12px] font-bold tabular-nums leading-none text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.65)]">
            {Math.round(awayBets)}
            <span className="mx-0.5 font-semibold text-white/40">·</span>
            <span className={moneySkew ? 'text-amber-200' : 'text-white/75'}>
              {Math.round(awayMoney)}
            </span>
          </div>
        </div>
        <div className="pt-0.5 text-center text-[9px] font-semibold uppercase tracking-[0.14em] text-white/40">
          <div>{moneySkew ? 'Public · $ split' : 'Public'}</div>
          <div className="mt-0.5 font-medium normal-case tracking-normal text-white/30">bets · $</div>
        </div>
        <div className="min-w-0 text-right">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/70 drop-shadow">
            {game.home?.abbrev}
          </div>
          <div className="mt-0.5 text-[12px] font-bold tabular-nums leading-none text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.65)]">
            {Math.round(homeBets)}
            <span className="mx-0.5 font-semibold text-white/40">·</span>
            <span className={moneySkew ? 'text-amber-200' : 'text-white/75'}>
              {Math.round(homeMoney)}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * X-style split team-color hero. Soft radial team glows (same recipe as Lounge
 * post game cards). `topBar` sits inside the wash so colors run under the status row.
 */
export default function GameHubHero({
  game,
  live,
  lastPlay,
  topBar = null,
  splits = null,
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
        <HeroPublicBetting
          game={game}
          splits={splits}
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
