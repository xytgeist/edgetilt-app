import { useId, useState, useEffect } from 'react'

/**
 * Stylized RB in a running pose (reference: tucked ball, lead plant, trail knee up).
 * Faces +X (toward home endzone). Flip with `facing={-1}` for the other way.
 *
 * Color draping:
 * - primary → jersey, pants stripe, sock band, glove accents
 * - secondary → pants, helmet shell (under head), jersey trim
 */
export default function GameHubRushFigure({
  primary = '#b91c1c',
  secondary = '#fafafa',
  headshotUrl = '',
  facing = 1,
  width = 64,
  height = 74,
  className = '',
}) {
  const uid = useId().replace(/:/g, '')
  const clipId = `rb-head-${uid}`
  const [imgFailed, setImgFailed] = useState(false)
  useEffect(() => {
    setImgFailed(false)
  }, [headshotUrl])

  const showHead = Boolean(headshotUrl) && !imgFailed
  const flip = facing < 0 ? 'scale(-1,1) translate(-120,0)' : ''

  return (
    <svg
      viewBox="0 0 120 140"
      width={width}
      height={height}
      className={className}
      overflow="visible"
      aria-hidden="true"
    >
      <defs>
        <clipPath id={clipId}>
          <circle cx="58" cy="22" r="18" />
        </clipPath>
      </defs>
      <g transform={flip}>
        {/* Soft ground contact */}
        <ellipse cx="52" cy="132" rx="22" ry="4" fill="#000000" opacity="0.35" />

        {/* Trailing leg (right) … bent up behind */}
        <path
          d="M48 78 C54 72 68 70 74 78 C78 84 80 96 78 108 L70 110 C72 98 70 88 64 84 C58 80 52 82 48 86 Z"
          fill={secondary}
        />
        <path
          d="M70 108 C74 112 78 118 76 124 C74 128 68 130 64 126 C60 122 62 114 66 110 Z"
          fill="#18181b"
        />
        {/* Pants stripe on trail leg */}
        <path
          d="M58 80 C64 78 70 82 72 90 C70 92 64 90 60 88 Z"
          fill={primary}
          opacity="0.9"
        />

        {/* Lead leg (left) … planted */}
        <path
          d="M42 76 C36 82 28 96 32 114 L44 116 C42 100 44 88 48 82 Z"
          fill={secondary}
        />
        <path
          d="M30 112 C24 116 22 124 28 128 C36 132 48 130 52 124 C46 122 40 118 36 114 Z"
          fill="#18181b"
        />
        <path
          d="M38 90 C40 98 40 106 38 112 L34 110 C36 102 36 96 36 90 Z"
          fill={primary}
          opacity="0.9"
        />

        {/* Sock bands */}
        <path d="M34 108 L42 110 L41 114 L33 112 Z" fill={primary} />
        <path d="M72 106 L78 108 L77 112 L71 110 Z" fill={primary} />

        {/* Torso / jersey */}
        <path
          d="M40 36 C36 44 34 56 36 68 C40 78 52 82 62 78 C70 74 74 64 72 52 C70 42 64 34 56 30 C50 28 44 30 40 36 Z"
          fill={primary}
        />
        {/* Jersey trim / collar */}
        <path
          d="M48 30 C52 28 60 28 64 32 L62 38 C58 36 52 36 48 38 Z"
          fill={secondary}
        />
        {/* Sleeve cuff accents */}
        <path d="M34 48 L28 56 L32 60 L38 52 Z" fill={secondary} opacity="0.85" />
        <path d="M70 46 L78 52 L74 58 L68 50 Z" fill={secondary} opacity="0.85" />

        {/* Balance arm (extended back / left of figure) */}
        <path
          d="M36 48 C24 52 14 58 10 66 C8 70 12 74 16 72 C22 66 30 58 38 54 Z"
          fill={primary}
        />
        <ellipse cx="12" cy="70" rx="5" ry="4.5" fill={secondary} />
        <ellipse cx="12" cy="70" rx="3.2" ry="2.8" fill={primary} opacity="0.55" />

        {/* Ball-carry arm + football tucked */}
        <path
          d="M62 50 C70 54 74 62 70 70 C66 76 58 76 54 70 C56 62 58 54 62 50 Z"
          fill={primary}
        />
        <ellipse cx="66" cy="64" rx="7" ry="5" fill="#6b3a1f" transform="rotate(-25 66 64)" />
        <ellipse cx="66" cy="64" rx="5.5" ry="3.2" fill="#9a6238" transform="rotate(-25 66 64)" opacity="0.85" />
        <line
          x1="62"
          y1="62"
          x2="70"
          y2="66"
          stroke="#1c1008"
          strokeWidth="0.8"
          strokeLinecap="round"
          transform="rotate(-25 66 64)"
        />
        <ellipse cx="58" cy="68" rx="4.5" ry="4" fill={secondary} />

        {/* Helmet shell (under oversized head) */}
        <ellipse cx="58" cy="24" rx="16" ry="15" fill={secondary} />
        <path
          d="M46 28 C48 34 54 38 62 36 C68 34 72 28 70 24 L66 26 C62 30 54 30 48 28 Z"
          fill={primary}
          opacity="0.35"
        />
        {/* Facemask bars */}
        <g stroke="#27272a" strokeWidth="1.4" fill="none" strokeLinecap="round">
          <path d="M50 26 H68" />
          <path d="M50 30 H66" />
          <path d="M52 22 V34" />
          <path d="M58 20 V35" />
          <path d="M64 22 V34" />
        </g>

        {/* Oversized avatar head (or solid primary disk) */}
        {showHead ? (
          <image
            href={headshotUrl}
            xlinkHref={headshotUrl}
            x={58 - 22}
            y={22 - 24}
            width="44"
            height="48"
            preserveAspectRatio="xMidYMid slice"
            clipPath={`url(#${clipId})`}
            onError={() => setImgFailed(true)}
          />
        ) : (
          <circle cx="58" cy="22" r="18" fill={primary} stroke={secondary} strokeWidth="2" />
        )}
        {/* Head rim */}
        <circle
          cx="58"
          cy="22"
          r="18"
          fill="none"
          stroke="#09090b"
          strokeWidth="1.2"
          opacity="0.55"
        />
      </g>
    </svg>
  )
}
