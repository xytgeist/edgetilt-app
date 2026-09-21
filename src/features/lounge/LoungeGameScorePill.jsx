import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { useLoungeSportsFeed } from './LoungeSportsFeedContext.jsx'
import { LOUNGE_FEED_ATTACHMENT_COLUMN_CLASS } from './loungeFeedAvatar.js'
import { nflPillWash, nflPillWashLikelyAir, probeLogoWashConflict } from './loungeSportsMatch.js'

const PRE_SPREAD_MAX_PX = 26
const PRE_SPREAD_MIN_PX = 13

function FitPrimary({ children, className, align }) {
  const ref = useRef(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const parent = el.parentElement
    if (!parent) return
    const fit = () => {
      el.style.fontSize = `${PRE_SPREAD_MAX_PX}px`
      const avail = parent.clientWidth
      const need = el.scrollWidth
      if (avail > 0 && need > avail) {
        const next = Math.max(PRE_SPREAD_MIN_PX, Math.floor(PRE_SPREAD_MAX_PX * (avail / need) * 0.98))
        el.style.fontSize = `${next}px`
      }
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(parent)
    return () => ro.disconnect()
  }, [children])
  const pin = align === 'end' ? 'ml-auto' : align === 'center' ? 'mx-auto' : 'mr-auto'
  return (
    <span
      ref={ref}
      data-lounge-game-pill-primary
      className={`${className} block w-fit ${pin}`}
    >
      {children}
    </span>
  )
}

export function formatLoungeSportsMoneyline(price) {
  if (price == null || !Number.isFinite(Number(price))) return null
  const n = Math.round(Number(price))
  if (n === 0) return null
  return n > 0 ? `+${n}` : String(n)
}

export function formatLoungeSportsSpread(point) {
  if (point == null || !Number.isFinite(Number(point))) return null
  const n = Number(point)
  if (n === 0) return 'PK'
  const abs = Math.abs(n)
  const body = Number.isInteger(abs) ? String(abs) : String(abs)
  return n > 0 ? `+${body}` : `-${body}`
}

/** Home ATS result: (home score - away score) + home spread. >0 home covers, <0 away covers. */
export function loungeSportsSpreadCover(game) {
  if (!game || game.status === 'pre') return { home: false, away: false, push: false }
  const homeScore = Number(game.home?.score)
  const awayScore = Number(game.away?.score)
  let homeSpread = Number(game.home?.spread)
  const awaySpread = Number(game.away?.spread)
  if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore)) {
    return { home: false, away: false, push: false }
  }
  if (!Number.isFinite(homeSpread)) {
    if (!Number.isFinite(awaySpread)) return { home: false, away: false, push: false }
    homeSpread = -awaySpread
  }
  const margin = homeScore - awayScore + homeSpread
  if (margin > 0) return { home: true, away: false, push: false }
  if (margin < 0) return { home: false, away: true, push: false }
  return { home: false, away: false, push: true }
}

function scoreLabel(side, status) {
  if (status === 'pre') return formatLoungeSportsSpread(side?.spread) || '—'
  if (side?.score == null) return '—'
  return String(side.score)
}

function TeamMark({ side, dimmed, halo = false }) {
  const src = side?.logo
  const letter = String(side?.abbrev || side?.mascot || '?').slice(0, 1)
  return (
    <span className="relative inline-flex h-10 w-10 shrink-0 items-center justify-center sm:h-11 sm:w-11">
      {src ? (
        <img
          src={src}
          alt=""
          data-lounge-game-pill-logo={halo ? 'light' : 'dark'}
          className={`h-full w-full object-contain ${dimmed ? 'opacity-55' : ''}`}
          loading="lazy"
          decoding="async"
          onError={(ev) => {
            ev.currentTarget.style.display = 'none'
          }}
        />
      ) : (
        <span className="text-[13px] font-bold text-white/80">{letter}</span>
      )}
    </span>
  )
}

function ScoreStack({ side, status, dimmed, covered }) {
  const pre = status === 'pre'
  const primary = scoreLabel(side, status)
  const spreadUnder = pre ? null : formatLoungeSportsSpread(side?.spread)
  const mlUnder = pre ? null : formatLoungeSportsMoneyline(side?.ml)
  const underLine = [spreadUnder, mlUnder].filter(Boolean).join(' ')
  const primaryClass = `whitespace-nowrap font-bold leading-none tabular-nums drop-shadow-[0_1px_2px_rgba(0,0,0,0.7)] ${
    pre ? '' : 'text-[26px]'
  } ${dimmed ? 'text-white/55' : 'text-white'}`
  if (pre) {
    // Fill the logo↔FINAL gutter so FitPrimary can shrink long spreads.
    return (
      <span data-lounge-game-pill-num="fit" className="flex w-full min-w-0 justify-center overflow-hidden">
        <FitPrimary className={primaryClass} align="center">
          {primary}
        </FitPrimary>
      </span>
    )
  }
  // Content-sized; parent gutter centers this in the logo↔FINAL span.
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center">
      <span data-lounge-game-pill-primary className={primaryClass}>
        {primary}
      </span>
      {underLine ? (
        <span
          data-lounge-game-pill-spread-cover={covered ? '' : undefined}
          className="absolute left-1/2 top-full z-[1] mt-0.5 flex -translate-x-1/2 items-center gap-1 whitespace-nowrap text-[11px] font-semibold leading-none tabular-nums tracking-wide text-white/80 drop-shadow-[0_1px_2px_rgba(0,0,0,0.7)]"
        >
          {covered ? (
            <span
              data-lounge-game-pill-cover-dot
              className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-white"
              aria-hidden="true"
            />
          ) : null}
          <span>{underLine}</span>
        </span>
      ) : null}
    </span>
  )
}

function usePillAirSides(game) {
  const awayColor = game ? nflPillWash(game.away?.color, game.away?.color2) : '#3f3f46'
  const homeColor = game ? nflPillWash(game.home?.color, game.home?.color2) : '#3f3f46'
  const awaySrc = game?.away?.logo || ''
  const homeSrc = game?.home?.logo || ''
  const [awayAir, setAwayAir] = useState(() => nflPillWashLikelyAir(awayColor))
  const [homeAir, setHomeAir] = useState(() => nflPillWashLikelyAir(homeColor))
  useEffect(() => {
    setAwayAir(nflPillWashLikelyAir(awayColor))
    setHomeAir(nflPillWashLikelyAir(homeColor))
    if (typeof document === 'undefined') return undefined
    let alive = true
    if (awaySrc) {
      void probeLogoWashConflict(awaySrc, awayColor).then((air) => {
        if (alive) setAwayAir(air)
      })
    }
    if (homeSrc) {
      void probeLogoWashConflict(homeSrc, homeColor).then((air) => {
        if (alive) setHomeAir(air)
      })
    }
    return () => {
      alive = false
    }
  }, [awaySrc, homeSrc, awayColor, homeColor])
  return { awayColor, homeColor, awayAir, homeAir }
}

/**
 * In-post score pill (X sports chip). Tap opens the Edge game hub.
 * Pass `game` to skip caption matching (composer / strip).
 * `pendingInclude` = composer suggest overlay until the author opts in.
 */
export default function LoungeGameScorePill({
  post,
  game: gameProp = null,
  className = '',
  dismissible = false,
  onDismiss,
  onInclude,
  pendingInclude = false,
  interactive = true,
}) {
  const sports = useLoungeSportsFeed()
  const game = gameProp || sports?.matchPost?.(post)
  const air = usePillAirSides(game)
  if (!game) return null

  const homeWon = game.status === 'post' && game.home?.score != null && game.away?.score != null && game.home.score > game.away.score
  const awayWon = game.status === 'post' && game.home?.score != null && game.away?.score != null && game.away.score > game.home.score
  const live = game.status === 'in'
  const cover = loungeSportsSpreadCover(game)
  const awayCovered = game.status === 'post' && cover.away
  const homeCovered = game.status === 'post' && cover.home
  const awayColor = air.awayColor
  const homeColor = air.homeColor
  const canOpenHub = interactive && !pendingInclude
  const Tag = canOpenHub || pendingInclude ? 'button' : 'div'
  const awaySpread = formatLoungeSportsSpread(game.away?.spread)
  const homeSpread = formatLoungeSportsSpread(game.home?.spread)
  const awayMl = formatLoungeSportsMoneyline(game.away?.ml)
  const homeMl = formatLoungeSportsMoneyline(game.home?.ml)
  const coverNote = homeCovered
    ? `${game.home?.abbrev} covered`
    : awayCovered
      ? `${game.away?.abbrev} covered`
      : cover.push && game.status === 'post'
        ? 'push'
        : ''
  const awayLine = game.status !== 'pre' ? [awaySpread, awayMl].filter(Boolean).join(' ') : ''
  const homeLine = game.status !== 'pre' ? [homeSpread, homeMl].filter(Boolean).join(' ') : ''
  const label = pendingInclude
    ? `Tap to include ${game.away?.abbrev} at ${game.home?.abbrev}`
    : `${game.away?.abbrev} ${scoreLabel(game.away, game.status)}${awayLine ? ` ${awayLine}` : ''} ${game.home?.abbrev} ${scoreLabel(game.home, game.status)}${homeLine ? ` ${homeLine}` : ''} ${game.status_label}${coverNote ? ` ${coverNote}` : ''}`

  return (
    <div
      className={`relative ${className}`.trim()}
      data-lounge-composer-game-pill={dismissible || pendingInclude ? '' : undefined}
      data-lounge-game-pill-pending={pendingInclude ? '' : undefined}
    >
      <Tag
        type={canOpenHub || pendingInclude ? 'button' : undefined}
        data-lounge-game-pill
        onClick={
          pendingInclude
            ? (e) => {
                e.stopPropagation()
                onInclude?.()
              }
            : canOpenHub
              ? (e) => {
                  e.stopPropagation()
                  sports.openHub?.(game)
                }
              : undefined
        }
        style={{ '--pill-away': awayColor, '--pill-home': homeColor }}
        className={`${LOUNGE_FEED_ATTACHMENT_COLUMN_CLASS} relative min-h-[5.625rem] w-full overflow-hidden rounded-2xl text-left text-white touch-manipulation [-webkit-tap-highlight-color:transparent] ${canOpenHub || pendingInclude ? 'active:opacity-90' : ''}`.trim()}
        aria-label={label}
      >
        <span data-lounge-game-pill-field aria-hidden="true" />
        <span data-lounge-game-pill-away aria-hidden="true" />
        <span data-lounge-game-pill-home aria-hidden="true" />
        <span data-lounge-game-pill-seam aria-hidden="true" />
        <span className="relative z-[3] flex min-h-[5.625rem] w-full items-center gap-1.5 px-3 py-2.5">
          {/* Match chevron width so away/home logo↔FINAL gutters stay equal. */}
          <span className="h-5 w-5 shrink-0" aria-hidden="true" />
          <TeamMark side={game.away} dimmed={game.status === 'post' && !awayWon} halo={air.awayAir} />
          <span className="flex min-w-0 flex-1 items-center justify-center">
            <ScoreStack
              side={game.away}
              status={game.status}
              dimmed={game.status === 'post' && !awayWon && !live}
              covered={awayCovered}
            />
          </span>
          <span className="flex w-[4.75rem] shrink-0 flex-col items-center px-1">
            {live ? <span className="mb-0.5 h-1.5 w-1.5 rounded-full bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.9)]" /> : null}
            <span className="text-center text-[10px] font-semibold uppercase leading-tight tracking-wide text-white/80 drop-shadow-[0_1px_2px_rgba(0,0,0,0.7)]">
              {game.status_label}
            </span>
          </span>
          <span className="flex min-w-0 flex-1 items-center justify-center">
            <ScoreStack
              side={game.home}
              status={game.status}
              dimmed={game.status === 'post' && !homeWon && !live}
              covered={homeCovered}
            />
          </span>
          <TeamMark side={game.home} dimmed={game.status === 'post' && !homeWon} halo={air.homeAir} />
          {canOpenHub ? (
            <ChevronRight className="h-5 w-5 shrink-0 text-white/70 drop-shadow-[0_1px_2px_rgba(0,0,0,0.7)]" strokeWidth={2.25} />
          ) : (
            <span className="h-5 w-5 shrink-0" aria-hidden="true" />
          )}
        </span>
        {pendingInclude ? (
          <span
            data-lounge-game-pill-include-overlay
            className="pointer-events-none absolute inset-0 z-[4] flex flex-col items-center bg-black/45 px-10 pt-2"
            aria-hidden="true"
          >
            <span
              data-lounge-game-pill-include-hint
              className="text-center text-[11px] font-semibold tracking-wide text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)]"
            >
              Tap to include
            </span>
          </span>
        ) : null}
      </Tag>
      {dismissible ? (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            onDismiss?.()
          }}
          className="absolute left-2 top-2 z-10 flex h-6 w-6 touch-manipulation items-center justify-center rounded-full border border-zinc-600/80 bg-zinc-800/95 text-[13px] font-bold leading-none text-zinc-200 shadow-md hover:bg-zinc-700 active:bg-zinc-600 [-webkit-tap-highlight-color:transparent]"
          aria-label={pendingInclude ? 'Dismiss game suggestion' : 'Remove game pill'}
        >
          ×
        </button>
      ) : null}
    </div>
  )
}
