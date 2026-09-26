import { useId, useState, useEffect } from 'react'

/**
 * Stylized WR in a leaping catch pose (reference: high reach, trail knee up, lead plant).
 * Faces +X. Flip with `facing={-1}` for the other way.
 *
 * Color draping (Broncos-style reference map):
 * - primary → jersey body, cleats
 * - secondary → helmet shell, pant stripe, sock band, jersey side panel
 * - pants body stays near-white for contrast
 *
 * Catch hands (local viewBox, facing +X): ~(92, 14) … parent uses this for ball arc end.
 */
export const CATCH_HANDS_LOCAL = { x: 92, y: 14 }

export default function GameHubCatchFigure({
  primary = '#fb4f14',
  secondary = '#002244',
  headshotUrl = '',
  facing = 1,
  width = 64,
  height = 74,
  className = '',
}) {
  const uid = useId().replace(/:/g, '')
  const clipId = `wr-head-${uid}`
  const [imgFailed, setImgFailed] = useState(false)
  useEffect(() => {
    setImgFailed(false)
  }, [headshotUrl])

  const showHead = Boolean(headshotUrl) && !imgFailed
  const flip = facing < 0 ? 'scale(-1,1) translate(-120,0)' : ''
  const pants = '#f4f4f5'

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
          <circle cx="52" cy="28" r="17" />
        </clipPath>
      </defs>
      <g transform={flip}>
        {/* Soft ground contact under lead foot */}
        <ellipse cx="58" cy="132" rx="24" ry="4" fill="#000000" opacity="0.32" />

        {/* Trailing leg … kicked back, knee bent */}
        <path
          d="M44 78 C38 72 28 74 24 84 C20 94 22 108 28 118 L38 116 C34 106 32 94 36 88 C40 82 44 82 44 78 Z"
          fill={pants}
        />
        <path
          d="M28 116 C24 120 22 128 28 130 C36 132 44 128 46 122 C40 122 34 120 32 116 Z"
          fill={primary}
        />
        <path
          d="M36 86 C32 94 30 104 32 112 L28 110 C28 100 30 92 34 86 Z"
          fill={secondary}
          opacity="0.95"
        />
        <path d="M30 112 L38 114 L37 118 L29 116 Z" fill={secondary} />

        {/* Lead leg … extended forward plant */}
        <path
          d="M52 76 C58 82 68 96 72 114 L60 116 C58 100 52 88 48 80 Z"
          fill={pants}
        />
        <path
          d="M70 112 C74 116 82 122 78 128 C72 134 60 132 56 126 C62 124 68 120 70 114 Z"
          fill={primary}
        />
        <path
          d="M56 92 C60 100 64 108 66 114 L62 116 C58 108 56 100 54 94 Z"
          fill={secondary}
          opacity="0.95"
        />
        <path d="M64 112 L72 114 L71 118 L63 116 Z" fill={secondary} />

        {/* Torso / jersey lean */}
        <path
          d="M40 40 C36 48 34 60 38 72 C42 82 54 86 64 80 C72 74 74 62 70 50 C68 42 60 34 50 32 C44 32 42 36 40 40 Z"
          fill={primary}
        />
        {/* Side panel / trim */}
        <path
          d="M42 48 C40 58 42 68 46 74 L52 70 C48 64 46 56 48 48 Z"
          fill={secondary}
          opacity="0.55"
        />
        {/* Collar */}
        <path
          d="M46 34 C50 32 58 32 62 36 L60 42 C56 40 50 40 46 42 Z"
          fill={secondary}
        />

        {/* Trailing arm … bent at chest, open hand */}
        <path
          d="M44 52 C36 56 30 64 32 72 C34 78 42 78 46 72 C46 64 46 56 44 52 Z"
          fill={primary}
        />
        <ellipse cx="34" cy="74" rx="5.5" ry="5" fill="#c4a484" />

        {/* Lead arm … high reach for the ball */}
        <path
          d="M62 48 C72 40 82 28 90 16 C94 12 98 14 96 20 C90 32 80 44 70 52 Z"
          fill={primary}
        />
        <ellipse cx="94" cy="14" rx="6.5" ry="6" fill="#c4a484" />
        {/* Fingers suggestion */}
        <g stroke="#8a6a4a" strokeWidth="1.1" fill="none" strokeLinecap="round">
          <path d="M92 8 L90 4" />
          <path d="M96 9 L98 4" />
          <path d="M99 12 L104 10" />
        </g>

        {/* Helmet shell under avatar */}
        <ellipse cx="52" cy="30" rx="15" ry="14" fill={secondary} />
        <g stroke="#1c1917" strokeWidth="1.3" fill="none" strokeLinecap="round">
          <path d="M44 32 H62" />
          <path d="M44 36 H60" />
          <path d="M46 28 V40" />
          <path d="M52 26 V41" />
          <path d="M58 28 V40" />
        </g>

        {/* Oversized avatar head */}
        {showHead ? (
          <image
            href={headshotUrl}
            xlinkHref={headshotUrl}
            x={52 - 21}
            y={28 - 23}
            width="42"
            height="46"
            preserveAspectRatio="xMidYMid slice"
            clipPath={`url(#${clipId})`}
            onError={() => setImgFailed(true)}
          />
        ) : (
          <circle cx="52" cy="28" r="17" fill={primary} stroke={secondary} strokeWidth="2" />
        )}
        <circle
          cx="52"
          cy="28"
          r="17"
          fill="none"
          stroke="#09090b"
          strokeWidth="1.2"
          opacity="0.55"
        />
      </g>
    </svg>
  )
}
