import { useId } from 'react'
import { RUSH_PATHS } from './gameHubRushPaths.js'

/**
 * Authentic Running Back figure modeled after the McFarlane sculpt reference.
 * - Pure SVG vector paths supporting dynamic team uniform recoloring (primary, secondary, helmet, pants)
 * - Dynamic forward-sprint pose with right arm tucking football tight to chest
 * - Football is layered directly beneath the gripping hand/fingers on the chest
 * - Left balance arm extended back with splayed fingers
 * - Trailing leg kicked high at ~90 degrees
 * - Planted front foot aligned to turf yard line
 * - Authentic dark brown football (#78350F) with crisp white laces
 * - Natural athletic skin tone (#74452C) and detailed helmet shell & facemask
 * - Dynamic chest jersey number angled to match torso lean (un-mirrored, always readable)
 * - Horizontal flip based on play direction (facing >= 0 for rightward drive, < 0 for leftward drive)
 */
export default function GameHubRushFigure({
  primary = '#C4122E',
  secondary = '#FFFFFF',
  accent = '#000000',
  helmetColor,
  pantsColor,
  jerseyNumber = '',
  _headshotUrl = '',
  facing = 1,
  width = 108,
  height = 144,
  className = '',
}) {
  const uid = useId().replace(/:/g, '')

  const primaryColor = primary || '#C4122E'
  const secondaryColor = secondary || '#FFFFFF'
  const helmet = helmetColor || primaryColor
  const pants = pantsColor || secondaryColor || '#FFFFFF'
  const accentColor = accent || '#000000'

  // The base cutout naturally faces left (facing < 0).
  // When running toward the right endzone (facing >= 0), flip the player body horizontally across the viewBox width (740).
  const isFacingRight = facing >= 0
  const bodyFlip = isFacingRight ? 'scale(-1, 1) translate(-740, 0)' : undefined

  // Number placement: centered on the torso chest plate.
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
        {/* Base player sculpt paths, flipped horizontally when driving right */}
        <g transform={bodyFlip}>
          {/* 1. Skin tone & facial contours */}
          <g id="rb-skin" fill="#74452C">
            {RUSH_PATHS.skin.map((p, i) => (
              <path key={`skin-${i}`} d={p.d} transform={p.transform || undefined} />
            ))}
          </g>

          {/* 2. Cleats base (black) */}
          <g id="rb-cleats-base" fill="#18181B">
            {RUSH_PATHS.cleats_base.map((p, i) => (
              <path key={`cl-b-${i}`} d={p.d} transform={p.transform || undefined} />
            ))}
          </g>

          {/* 3. Cleats white trim & Nike accents */}
          <g id="rb-cleats-white" fill="#FFFFFF">
            {RUSH_PATHS.cleats_white.map((p, i) => (
              <path key={`cl-w-${i}`} d={p.d} transform={p.transform || undefined} />
            ))}
          </g>

          {/* 4. Socks primary color */}
          <g id="rb-socks-primary" fill={primaryColor}>
            {RUSH_PATHS.socks_primary.map((p, i) => (
              <path key={`sk-p-${i}`} d={p.d} transform={p.transform || undefined} />
            ))}
          </g>

          {/* 5. Socks white cuffs & tape */}
          <g id="rb-socks-white" fill="#FFFFFF">
            {RUSH_PATHS.socks_white.map((p, i) => (
              <path key={`sk-w-${i}`} d={p.d} transform={p.transform || undefined} />
            ))}
          </g>

          {/* 6. Pants base */}
          <g id="rb-pants-base" fill={pants}>
            {RUSH_PATHS.pants_base.map((p, i) => (
              <path key={`pnt-b-${i}`} d={p.d} transform={p.transform || undefined} />
            ))}
          </g>

          {/* 7. Pants shadow / athletic folds */}
          <g id="rb-pants-shadow" fill="#000000" fillOpacity={0.15}>
            {RUSH_PATHS.pants_shadow.map((p, i) => (
              <path key={`pnt-s-${i}`} d={p.d} transform={p.transform || undefined} />
            ))}
          </g>

          {/* 8. Pants team stripe */}
          <g id="rb-pants-stripe" fill={primaryColor}>
            {RUSH_PATHS.pants_stripe.map((p, i) => (
              <path key={`pnt-st-${i}`} d={p.d} transform={p.transform || undefined} />
            ))}
          </g>

          {/* 9. Jersey base */}
          <g id="rb-jersey-base" fill={primaryColor}>
            {RUSH_PATHS.jersey_base.map((p, i) => (
              <path key={`jrs-b-${i}`} d={p.d} transform={p.transform || undefined} />
            ))}
          </g>

          {/* 10. Jersey white accents / swoosh */}
          <g id="rb-jersey-white" fill={secondaryColor}>
            {RUSH_PATHS.jersey_white.map((p, i) => (
              <path key={`jrs-w-${i}`} d={p.d} transform={p.transform || undefined} />
            ))}
          </g>

          {/* 11. Jersey fabric creases & muscle definition */}
          <g id="rb-jersey-shadow" fill="#000000" fillOpacity={0.16}>
            {RUSH_PATHS.jersey_shadow.map((p, i) => (
              <path key={`jrs-s-${i}`} d={p.d} transform={p.transform || undefined} />
            ))}
          </g>

          {/* 12. Football ... placed in the crook of the right arm directly under the hand */}
          <g id="rb-football" transform="translate(60, 280) scale(1.35)">
            <g fill="#78350F">
              {RUSH_PATHS.football_base.map((p, i) => (
                <path key={`fb-${i}`} d={p.d} transform={p.transform || undefined} />
              ))}
            </g>
            {/* Authentic pro white laces */}
            <g fill="none" stroke="#FFFFFF" strokeLinecap="round">
              <path d="M80 40 L45 125" strokeWidth={3.5} />
              <path d="M69 50 L81 55" strokeWidth={2.5} />
              <path d="M62 67 L74 72" strokeWidth={2.5} />
              <path d="M55 84 L67 89" strokeWidth={2.5} />
              <path d="M48 101 L60 106" strokeWidth={2.5} />
            </g>
          </g>

          {/* 13. Gloves primary ... layered over football so fingers grip the ball */}
          <g id="rb-gloves-primary" fill={primaryColor}>
            {RUSH_PATHS.gloves_primary.map((p, i) => (
              <path key={`glv-p-${i}`} d={p.d} transform={p.transform || undefined} />
            ))}
          </g>

          {/* 14. Gloves white accents & grips */}
          <g id="rb-gloves-white" fill={secondaryColor}>
            {RUSH_PATHS.gloves_white.map((p, i) => (
              <path key={`glv-w-${i}`} d={p.d} transform={p.transform || undefined} />
            ))}
          </g>

          {/* 15. Helmet shell */}
          <g id="rb-helmet-shell" fill={helmet}>
            {RUSH_PATHS.helmet_shell.map((p, i) => (
              <path key={`hlm-s-${i}`} d={p.d} transform={p.transform || undefined} />
            ))}
            {/* Specular gloss highlight on dome */}
            <path
              d="M220 40 C260 22 310 25 340 50 C320 38 270 32 230 46 Z"
              fill="#FFFFFF"
              fillOpacity={0.22}
            />
          </g>

          {/* 16. Helmet facemask (metallic white/silver bars) */}
          <g id="rb-helmet-mask" fill="#E2E8F0" stroke="#1E293B" strokeWidth={1.5} strokeLinejoin="round">
            {RUSH_PATHS.helmet_mask.map((p, i) => (
              <path key={`hlm-m-${i}`} d={p.d} transform={p.transform || undefined} />
            ))}
          </g>
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
