import { useId } from 'react'
import { RUSH_PIECES } from './gameHubRushPieces.js'

/**
 * Authentic Running Back figure assembled from the 15-piece studio sculpt.
 * - Exact vector paths and Z-stacking from rb-cutout-studio / puzzle_pieces.json
 * - Dynamic forward-sprint pose with right arm tucking football tight to chest
 * - Planted front foot aligned to turf yard line
 * - Trailing leg kicked high at sprint angle
 * - Detailed helmet shell, multi-bar facemask, athletic facial features & skin contours
 * - Authentic football with textured pebble shading and pro laces
 * - Dynamic chest jersey number angled to match torso lean (un-mirrored, always readable)
 * - Horizontal flip based on play direction (facing >= 0 for rightward drive, < 0 for leftward drive)
 */
export default function GameHubRushFigure({
  _primary = '#C4122E',
  secondary = '#FFFFFF',
  accent = '#000000',
  _helmetColor,
  _pantsColor,
  jerseyNumber = '',
  _headshotUrl = '',
  facing = 1,
  width = 124,
  height = 144,
  className = '',
}) {
  const uid = useId().replace(/:/g, '')

  const secondaryColor = secondary || '#FFFFFF'
  const accentColor = accent || '#000000'

  // The base cutout naturally faces left (facing < 0).
  // When running toward the right endzone (facing >= 0), flip the player body horizontally across viewBox width (728).
  const isFacingRight = facing >= 0
  const bodyFlip = isFacingRight ? 'scale(-1, 1) translate(-728, 0)' : undefined

  // Number placement: centered on the torso chest plate.
  // Left-facing center is at x=245, y=410 with -14 deg forward tilt.
  // Right-facing center is mirrored at x=483 (728 - 245), y=410 with +14 deg forward tilt.
  // Glyphs are rendered in un-mirrored space so they always read left-to-right naturally.
  const numTransform = isFacingRight
    ? 'translate(483, 410) rotate(14)'
    : 'translate(245, 410) rotate(-14)'

  const num = String(jerseyNumber || '').trim()

  return (
    <svg
      viewBox="0 0 728 1382"
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
        {/* Assembled 15-piece sculpt, flipped horizontally when driving right */}
        <g transform={bodyFlip}>
          {RUSH_PIECES.map((piece) => {
            const transform = `translate(${piece.x}, ${piece.y}) rotate(${piece.rot}) scale(${piece.scale})`
            return (
              <g key={piece.id} id={`piece-${piece.id}`} transform={transform}>
                {piece.paths.map((p, i) => (
                  <path
                    key={`${piece.id}-${i}`}
                    d={p.d}
                    fill={p.fill}
                    transform={p.transform || undefined}
                  />
                ))}
              </g>
            )
          })}
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
              stroke={accentColor}
              strokeWidth="24"
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
              fill={secondaryColor}
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
