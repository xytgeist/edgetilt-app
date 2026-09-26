import { useId, useMemo } from 'react'
import {
  CATCH_PIECES,
  CATCH_VIEWBOX_H,
  CATCH_VIEWBOX_W,
} from './gameHubCatchPieces.js'
import { buildCatchColorMap } from './gameHubFigureColors.js'

/**
 * Authentic Wide Receiver / Tight End figure assembled from the 12-piece studio sculpt.
 * - Exact vector paths and Z-stacking from wr-cutout-studio / wr_puzzle_pieces.json
 * - Dynamic leaping catch pose with both arms extended upward reaching for the football
 * - Planted lead cleat and high trailing kick cleat
 * - Dynamic team kit recoloring (helmet shell, jersey, pants, compression tights/socks)
 * - Photorealistic skin contours, athletic facial features, receiving gloves, and pro cleats
 * - Dynamic chest jersey number (un-mirrored, always readable)
 * - Horizontal flip based on play direction (facing >= 0 for rightward drive, < 0 for leftward drive)
 */
export default function GameHubCatchFigure({
  primary = '#002244',
  secondary = '#FFFFFF',
  accent = '#000000',
  helmetColor,
  pantsColor,
  tightsColor,
  jerseyNumber = '',
  _headshotUrl = '',
  facing = 1,
  width = 124,
  height = 156,
  className = '',
}) {
  const uid = useId().replace(/:/g, '')

  const secondaryColor = secondary || '#FFFFFF'
  const accentColor = accent || '#000000'

  const colorMap = useMemo(
    () =>
      buildCatchColorMap({
        primary,
        secondary: secondaryColor,
        helmetColor,
        pantsColor,
        tightsColor,
      }),
    [primary, secondaryColor, helmetColor, pantsColor, tightsColor]
  )

  // The base sculpt naturally faces right (facing >= 0).
  // When driving toward the left endzone (facing < 0), flip horizontally across viewBox width (710).
  const isFacingRight = facing >= 0
  const bodyFlip = isFacingRight ? undefined : 'scale(-1, 1) translate(-710, 0)'

  // Number placement: centered on the chest plate.
  // Right-facing center is at x=480, y=440 with -8 deg upright tilt.
  // Left-facing center is mirrored at x=230 (710 - 480), y=440 with +8 deg upright tilt.
  // Glyphs are rendered in un-mirrored space so they always read left-to-right naturally.
  const numTransform = isFacingRight
    ? 'translate(480, 440) rotate(-8)'
    : 'translate(230, 440) rotate(8)'

  const num = String(jerseyNumber ?? '').trim()

  return (
    <svg
      viewBox={`0 0 ${CATCH_VIEWBOX_W} ${CATCH_VIEWBOX_H}`}
      width={width}
      height={height}
      preserveAspectRatio="xMidYMid meet"
      className={className}
      overflow="visible"
      aria-hidden="true"
    >
      <defs>
        {/* Soft ground shadow cast below the leaping figure */}
        <filter id={`shadow-${uid}`} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="16" stdDeviation="12" floodColor="#000000" floodOpacity="0.45" />
        </filter>
      </defs>

      {/* Body in filter; number OUTSIDE so feDropShadow never clips jersey glyphs. */}
      <g filter={`url(#shadow-${uid})`}>
        <g transform={bodyFlip}>
          {CATCH_PIECES.map((piece) => {
            const transform = `translate(${piece.x}, ${piece.y}) rotate(${piece.rot}) scale(${piece.scale})`
            return (
              <g key={piece.id} id={`piece-${piece.id}`} transform={transform}>
                {piece.paths.map((p, i) => (
                  <path
                    key={`${piece.id}-${i}`}
                    d={p.d}
                    fill={colorMap[`${piece.id}:${p.fill}`] || p.fill}
                    transform={p.transform || undefined}
                  />
                ))}
              </g>
            )
          })}
        </g>
      </g>

      {/* Dynamic chest number overlay - ALWAYS un-mirrored and readable (incl. jersey 0). */}
      {num.length > 0 ? (
        <g transform={numTransform}>
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
            fontSize="130"
            fontWeight="900"
            letterSpacing="-4"
          >
            {num}
          </text>
          <text
            x="0"
            y="0"
            textAnchor="middle"
            dominantBaseline="central"
            fill={secondaryColor}
            fontFamily="'Arial Black', Impact, sans-serif"
            fontSize="130"
            fontWeight="900"
            letterSpacing="-4"
          >
            {num}
          </text>
        </g>
      ) : null}
    </svg>
  )
}
