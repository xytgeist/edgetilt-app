import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { useLoungeSportsFeed } from './LoungeSportsFeedContext.jsx'
import { LOUNGE_FEED_ATTACHMENT_COLUMN_CLASS } from './loungeFeedAvatar.js'
import {
  nflPillWashLikelyTreatment,
  probeLogoWashTreatment,
  resolveNflPillWashes,
} from './loungeSportsMatch.js'

const PRE_SPREAD_MAX_PX = 28
const PRE_SPREAD_MIN_PX = 13
/** Aim for this fraction of the logo↔status gutter width. */
const PRIMARY_GUTTER_FILL = 0.48

function FitPrimary({ children, className, align }) {
  const ref = useRef(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    // Measure the logo↔status gutter, not the shrink-wrapped number wrapper.
    const measureEl =
      el.closest('[data-lounge-game-pill-score-gutter]') || el.parentElement
    if (!measureEl) return
    const fit = () => {
      const avail = measureEl.clientWidth
      if (avail <= 0) return
      const target = Math.max(
        PRE_SPREAD_MIN_PX,
        Math.min(PRE_SPREAD_MAX_PX, Math.floor(avail * PRIMARY_GUTTER_FILL)),
      )
      el.style.fontSize = `${target}px`
      const need = el.scrollWidth
      if (need > avail) {
        const next = Math.max(PRE_SPREAD_MIN_PX, Math.floor(target * (avail / need) * 0.98))
        el.style.fontSize = `${next}px`
      }
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(measureEl)
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

function TeamMark({ side, dimmed, treatment = 'default' }) {
  const defaultSrc = side?.logo || ''
  const lightSrc = side?.logoLight || ''
  const [lightFailed, setLightFailed] = useState(false)
  useEffect(() => {
    setLightFailed(false)
  }, [lightSrc, treatment, defaultSrc])
  const wantAssetLight = Boolean(treatment === 'light' && lightSrc && !lightFailed)
  const src = wantAssetLight ? lightSrc : defaultSrc
  const letter = String(side?.abbrev || side?.mascot || '?').slice(0, 1)
  let logoTone = 'dark'
  if (wantAssetLight) logoTone = 'light'
  else if (treatment === 'light') logoTone = 'silhouette'
  else if (treatment === 'halo') logoTone = 'halo'
  return (
    <span
      data-lounge-game-pill-mark
      className="relative inline-flex shrink-0 items-center justify-center"
    >
      {src ? (
        <img
          src={src}
          alt=""
          data-lounge-game-pill-logo={logoTone}
          className={`h-full w-full object-contain ${dimmed ? 'opacity-55' : ''}`}
          loading="lazy"
          decoding="async"
          onError={(ev) => {
            if (wantAssetLight) {
              setLightFailed(true)
              return
            }
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
  const spreadLine = pre ? null : formatLoungeSportsSpread(side?.spread)
  const mlLine = formatLoungeSportsMoneyline(side?.ml)
  const primaryClass = `whitespace-nowrap font-bold leading-none tabular-nums drop-shadow-[0_1px_2px_rgba(0,0,0,0.7)] ${
    dimmed ? 'text-white/55' : 'text-white'
  }`
  const satLineClass =
    'flex items-center justify-center gap-1 whitespace-nowrap text-[9px] font-semibold leading-none tabular-nums tracking-wide text-white/80 drop-shadow-[0_1px_2px_rgba(0,0,0,0.7)]'
  // Pre: spread primary + ML under when set. Live/final: spread above score, ML below.
  return (
    <span data-lounge-game-pill-num="fit" className="flex w-full min-w-0 flex-col items-center justify-center gap-0.5">
      {!pre && spreadLine ? (
        <span data-lounge-game-pill-spread-cover={covered ? '' : undefined} className={satLineClass}>
          {covered ? (
            <span
              data-lounge-game-pill-cover-dot
              className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-white"
              aria-hidden="true"
            />
          ) : null}
          <span>{spreadLine}</span>
        </span>
      ) : null}
      <FitPrimary className={primaryClass} align="center">
        {primary}
      </FitPrimary>
      {mlLine ? <span className={satLineClass}>{mlLine}</span> : null}
    </span>
  )
}

function usePillWashAndLogos(game) {
  const washes = game
    ? resolveNflPillWashes(game.home, game.away)
    : { homeWash: '#3f3f46', awayWash: '#3f3f46' }
  const awayColor = washes.awayWash
  const homeColor = washes.homeWash
  const awaySrc = game?.away?.logo || ''
  const homeSrc = game?.home?.logo || ''
  const [awayTreatment, setAwayTreatment] = useState(() => nflPillWashLikelyTreatment(awayColor))
  const [homeTreatment, setHomeTreatment] = useState(() => nflPillWashLikelyTreatment(homeColor))
  useEffect(() => {
    setAwayTreatment(nflPillWashLikelyTreatment(awayColor))
    setHomeTreatment(nflPillWashLikelyTreatment(homeColor))
    if (typeof document === 'undefined') return undefined
    let alive = true
    if (awaySrc) {
      void probeLogoWashTreatment(awaySrc, awayColor).then((t) => {
        if (alive) setAwayTreatment(t)
      })
    }
    if (homeSrc) {
      void probeLogoWashTreatment(homeSrc, homeColor).then((t) => {
        if (alive) setHomeTreatment(t)
      })
    }
    return () => {
      alive = false
    }
  }, [awaySrc, homeSrc, awayColor, homeColor])
  return { awayColor, homeColor, awayTreatment, homeTreatment }
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
  const paint = usePillWashAndLogos(game)
  if (!game) return null

  const homeWon = game.status === 'post' && game.home?.score != null && game.away?.score != null && game.home.score > game.away.score
  const awayWon = game.status === 'post' && game.home?.score != null && game.away?.score != null && game.away.score > game.home.score
  const live = game.status === 'in'
  const cover = loungeSportsSpreadCover(game)
  const awayCovered = game.status === 'post' && cover.away
  const homeCovered = game.status === 'post' && cover.home
  const awayColor = paint.awayColor
  const homeColor = paint.homeColor
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
  const awayLine =
    game.status === 'pre'
      ? [awayMl].filter(Boolean).join(' ')
      : [awaySpread, awayMl].filter(Boolean).join(' ')
  const homeLine =
    game.status === 'pre'
      ? [homeMl].filter(Boolean).join(' ')
      : [homeSpread, homeMl].filter(Boolean).join(' ')
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
        data-lounge-game-pill-hub={canOpenHub ? '' : undefined}
        aria-label={label}
      >
        <span data-lounge-game-pill-field aria-hidden="true" />
        <span data-lounge-game-pill-away aria-hidden="true" />
        <span data-lounge-game-pill-home aria-hidden="true" />
        <span data-lounge-game-pill-seam aria-hidden="true" />
        <span data-lounge-game-pill-row>
          <TeamMark side={game.away} dimmed={game.status === 'post' && !awayWon} treatment={paint.awayTreatment} />
          <span data-lounge-game-pill-score-gutter>
            <ScoreStack
              side={game.away}
              status={game.status}
              dimmed={game.status === 'post' && !awayWon && !live}
              covered={awayCovered}
            />
          </span>
          <span data-lounge-game-pill-status>
            {live ? <span className="mb-0.5 h-1.5 w-1.5 rounded-full bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.9)]" /> : null}
            <span className="text-center text-[10px] font-semibold uppercase leading-tight tracking-wide text-white/80 drop-shadow-[0_1px_2px_rgba(0,0,0,0.7)]">
              {game.status_label}
            </span>
          </span>
          <span data-lounge-game-pill-score-gutter>
            <ScoreStack
              side={game.home}
              status={game.status}
              dimmed={game.status === 'post' && !homeWon && !live}
              covered={homeCovered}
            />
          </span>
          <TeamMark side={game.home} dimmed={game.status === 'post' && !homeWon} treatment={paint.homeTreatment} />
        </span>
        {canOpenHub ? (
          <span data-lounge-game-pill-chevron aria-hidden="true">
            <ChevronRight className="h-5 w-5 text-white/70 drop-shadow-[0_1px_2px_rgba(0,0,0,0.7)]" strokeWidth={2.25} />
          </span>
        ) : null}
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
