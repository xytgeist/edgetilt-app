import { useEffect, useState } from 'react'
import {
  nflPillWashLikelyTreatment,
  peekLogoWashTreatment,
  probeLogoWashTreatment,
  resolveNflPillWashes,
} from './loungeSportsMatch.js'
import { useWebkitResumeSrc } from '../../utils/webkitImageResumeRepair.js'

function initialTreatment(src, washHex) {
  return (src && peekLogoWashTreatment(src, washHex)) || nflPillWashLikelyTreatment(washHex)
}

/**
 * Same wash + logo treatment as Lounge post game cards.
 * Home primary (lifted if near-black); away secondary on primary clash; probe light vs halo.
 */
export function useLoungeSportsPillWashAndLogos(game) {
  const washes = game
    ? resolveNflPillWashes(game.home, game.away)
    : { homeWash: '#3f3f46', awayWash: '#3f3f46' }
  const awayColor = washes.awayWash
  const homeColor = washes.homeWash
  const awaySrc = game?.away?.logo || ''
  const homeSrc = game?.home?.logo || ''
  const [awayTreatment, setAwayTreatment] = useState(() => initialTreatment(awaySrc, awayColor))
  const [homeTreatment, setHomeTreatment] = useState(() => initialTreatment(homeSrc, homeColor))
  useEffect(() => {
    setAwayTreatment(initialTreatment(awaySrc, awayColor))
    setHomeTreatment(initialTreatment(homeSrc, homeColor))
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
 * Team mark with light / halo / silhouette treatment (shared by post pills + game hub hero).
 * Optional `size` sets inline width/height (hero); pills size via CSS on `[data-lounge-game-pill-mark]`.
 */
/** Top 25 rank (1-25) or null … ESPN `curatedRank` via the board's `side.rank`. */
function loungeTeamTop25Rank(side) {
  const n = Number(side?.rank)
  return Number.isInteger(n) && n >= 1 && n <= 25 ? n : null
}

/**
 * `rankCorner` ('left' | 'right') opts into a small Top 25 badge on that top corner of the mark.
 */
function ncaaEspnLogoSrc(side) {
  const id = String(side?.team_id ?? side?.espn_id ?? '').trim()
  if (!/^\d+$/.test(id)) return ''
  return `https://a.espncdn.com/i/teamlogos/ncaa/500/${id}.png`
}

export function LoungeSportsTeamLogo({ side, treatment = 'halo', size = null, className = '', rankCorner = null }) {
  const rank = rankCorner ? loungeTeamTop25Rank(side) : null
  const defaultSrc = side?.logo || ''
  const lightSrc = side?.logoLight || ''
  const espnSrc = ncaaEspnLogoSrc(side)
  const [lightFailed, setLightFailed] = useState(false)
  const [srcFailed, setSrcFailed] = useState(false)
  const [gone, setGone] = useState(false)
  useEffect(() => {
    setLightFailed(false)
    setSrcFailed(false)
    setGone(false)
  }, [lightSrc, treatment, defaultSrc, espnSrc])
  const wantAssetLight = Boolean(treatment === 'light' && lightSrc && !lightFailed)
  let src = wantAssetLight ? lightSrc : defaultSrc
  if (!gone && srcFailed && espnSrc && espnSrc !== src) src = espnSrc
  if (gone) src = ''
  const paintSrc = useWebkitResumeSrc(src)
  const letter = String(side?.abbrev || side?.mascot || '?').slice(0, 1)
  let logoTone = 'halo'
  if (wantAssetLight && !srcFailed) logoTone = 'light'
  else if (treatment === 'light' && !espnSrc) logoTone = 'silhouette'
  return (
    <span
      data-lounge-game-pill-mark
      className={`relative inline-flex shrink-0 items-center justify-center ${className}`.trim()}
      style={size != null ? { width: size, height: size } : undefined}
    >
      {src ? (
        <img
          key={paintSrc}
          src={paintSrc}
          alt=""
          data-lounge-game-pill-logo={logoTone}
          className="h-full w-full object-contain"
          decoding="async"
          onError={() => {
            if (wantAssetLight && !srcFailed) {
              setLightFailed(true)
              return
            }
            if (espnSrc && src !== espnSrc) {
              setSrcFailed(true)
              return
            }
            setGone(true)
          }}
        />
      ) : (
        <span className="text-[13px] font-bold text-white/80">{letter}</span>
      )}
      {rank != null ? (
        <span data-lounge-team-rank-badge={rankCorner} aria-label={`Ranked ${rank}`}>
          {rank}
        </span>
      ) : null}
    </span>
  )
}
