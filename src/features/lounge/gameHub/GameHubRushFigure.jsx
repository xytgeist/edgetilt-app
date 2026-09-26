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
  // When running toward the right endzone (facing >= 0), flip the player body horizontally across the viewBox width (740).
  const isFacingRight = facing >= 0
  const bodyFlip = isFacingRight ? 'scale(-1, 1) translate(-740, 0)' : undefined

  // Number placement: centered on the red torso chest plate.
  // Left-facing center is at x=255, y=410 with -14 deg forward tilt.
  // Right-facing center is mirrored at x=485 (740 - 255), y=410 with +14 deg forward tilt.
  // Glyphs are rendered in un-mirrored space so they always read left-to-right naturally.
  const numTransform = isFacingRight
    ? 'translate(485, 410) rotate(14)'
    : 'translate(255, 410) rotate(-14)'

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

      <g filter={`url(#shadow-${uid})`}>
        {/* Base player sculpt, flipped horizontally when driving right */}
        <g transform={bodyFlip}>
          <image
            href="/sports/nfl/cardinals-rb-player.png"
            width="740"
            height="1378"
            preserveAspectRatio="xMidYMid meet"
          />
        </g>

        {/* Dynamic chest number overlay - ALWAYS un-mirrored and readable */}
        {num ? (
          <g transform={numTransform}>
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
            {/* Clean readable athletic fill */}
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
