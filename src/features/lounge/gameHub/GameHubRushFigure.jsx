import { useId } from 'react'

/**
 * Authentic Running Back figure modeled after the McFarlane Arizona Cardinals running back sculpt.
 * - Dynamic forward-sprint pose with right arm tucking football tight to chest
 * - Left balance arm extended back with splayed fingers
 * - Trailing leg kicked high at ~90 degrees
 * - Planted front foot aligned to turf yard line
 * - Dynamic chest jersey number angled to match torso lean
 * - Horizontal flip based on play direction (facing >= 0 for rightward drive, < 0 for leftward drive)
 */
export default function GameHubRushFigure({
  _primary = '#C4122E',
  secondary = '#FFFFFF',
  accent = '#000000',
  jerseyNumber = '',
  facing = 1,
  width = 54,
  height = 72,
  className = '',
}) {
  const uid = useId().replace(/:/g, '')

  // The base cutout naturally faces left (facing < 0).
  // When running toward the right endzone (facing >= 0), flip horizontally across the viewBox width (740).
  const isFacingRight = facing >= 0
  const flip = isFacingRight ? 'scale(-1, 1) translate(-740, 0)' : ''

  const num = String(jerseyNumber || '').trim()

  return (
    <svg
      viewBox="0 0 740 1378"
      width={width}
      height={height}
      className={className}
      overflow="visible"
      aria-hidden="true"
    >
      <defs>
        {/* Soft ground shadow cast by planted foot */}
        <filter id={`shadow-${uid}`} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="16" stdDeviation="12" floodColor="#000000" floodOpacity="0.45" />
        </filter>
      </defs>

      <g transform={flip} filter={`url(#shadow-${uid})`}>
        {/* Isolated high-fidelity figure cutout */}
        <image
          href="/sports/nfl/cardinals-rb-player.png"
          width="740"
          height="1378"
          preserveAspectRatio="xMidYMid meet"
        />

        {/* Dynamic jersey number on chest, tilted with player forward sprint lean (-14 deg) */}
        {num ? (
          <g transform="translate(230, 410) rotate(-14)">
            {/* Dark contrast stroke */}
            <text
              x="0"
              y="0"
              textAnchor="middle"
              dominantBaseline="central"
              fill="none"
              stroke={accent || '#000000'}
              strokeWidth="26"
              strokeLinejoin="round"
              fontFamily="'Arial Black', Impact, sans-serif"
              fontSize="140"
              fontWeight="900"
              letterSpacing="-4"
            >
              {num}
            </text>
            {/* White/secondary fill */}
            <text
              x="0"
              y="0"
              textAnchor="middle"
              dominantBaseline="central"
              fill={secondary || '#ffffff'}
              fontFamily="'Arial Black', Impact, sans-serif"
              fontSize="140"
              fontWeight="900"
              letterSpacing="-4"
            >
              {num}
            </text>
          </g>
        ) : null}
      </g>
    </svg>
  )
}
