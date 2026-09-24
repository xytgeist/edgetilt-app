import { useEffect, useState } from 'react'
import {
  nflPillWashLikelyTreatment,
  probeLogoWashTreatment,
  resolveNflPillWashes,
} from './loungeSportsMatch.js'

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
 * Team mark with light / halo / silhouette treatment (shared by post pills + game hub hero).
 * Optional `size` sets inline width/height (hero); pills size via CSS on `[data-lounge-game-pill-mark]`.
 */
export function LoungeSportsTeamLogo({ side, treatment = 'halo', size = null, className = '' }) {
  const defaultSrc = side?.logo || ''
  const lightSrc = side?.logoLight || ''
  const [lightFailed, setLightFailed] = useState(false)
  useEffect(() => {
    setLightFailed(false)
  }, [lightSrc, treatment, defaultSrc])
  const wantAssetLight = Boolean(treatment === 'light' && lightSrc && !lightFailed)
  const src = wantAssetLight ? lightSrc : defaultSrc
  const letter = String(side?.abbrev || side?.mascot || '?').slice(0, 1)
  let logoTone = 'halo'
  if (wantAssetLight) logoTone = 'light'
  else if (treatment === 'light') logoTone = 'silhouette'
  return (
    <span
      data-lounge-game-pill-mark
      className={`relative inline-flex shrink-0 items-center justify-center ${className}`.trim()}
      style={size != null ? { width: size, height: size } : undefined}
    >
      {src ? (
        <img
          src={src}
          alt=""
          data-lounge-game-pill-logo={logoTone}
          className="h-full w-full object-contain"
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
