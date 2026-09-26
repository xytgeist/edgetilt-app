import { useId, useState, useEffect } from 'react'

/**
 * High-fidelity RB figure modeled after the McFarlane Arizona Cardinals #31 running sculpt.
 * - Leaning forward athletic sprint with right arm cradling football
 * - Left arm extended back for counter-balance with splayed fingers
 * - Trailing leg kicked high at ~90 degrees
 * - Planted front leg with cleat on the turf line
 * - Team-colorable: jersey, compression sleeves, pant stripes, helmet
 * - Head slot: roster avatar headshot when available, realistic sculpted helmet when not
 */
export default function GameHubRushFigure({
  primary = '#C4122E',
  secondary = '#FFFFFF',
  accent = '#000000',
  helmetColor = '',
  pantsColor = '#FFFFFF',
  jerseyNumber = '31',
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
  // Model naturally faces forward-right. When facing < 0 (toward away left endzone), mirror.
  const flip = facing < 0 ? 'scale(-1, 1) translate(-200, 0)' : ''
  const helmet = helmetColor || secondary || '#FFFFFF'
  const pants = pantsColor || '#FFFFFF'

  return (
    <svg
      viewBox="0 0 200 240"
      width={width}
      height={height}
      className={className}
      overflow="visible"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`jg-${uid}`} x1="20%" y1="0%" x2="80%" y2="100%">
          <stop offset="0%" stopColor="#ef4444" stopOpacity="1" />
          <stop offset="25%" stopColor={primary} stopOpacity="1" />
          <stop offset="85%" stopColor={primary} stopOpacity="0.95" />
          <stop offset="100%" stopColor="#7f1d1d" stopOpacity="1" />
        </linearGradient>

        <linearGradient id={`hs-${uid}`} x1="25%" y1="5%" x2="75%" y2="95%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
          <stop offset="40%" stopColor={helmet} stopOpacity="1" />
          <stop offset="85%" stopColor="#e2e8f0" stopOpacity="1" />
          <stop offset="100%" stopColor="#cbd5e1" stopOpacity="1" />
        </linearGradient>

        <linearGradient id={`pg-${uid}`} x1="15%" y1="10%" x2="85%" y2="90%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
          <stop offset="60%" stopColor={pants} stopOpacity="1" />
          <stop offset="100%" stopColor="#e2e8f0" stopOpacity="1" />
        </linearGradient>

        <linearGradient id={`bg-${uid}`} x1="20%" y1="10%" x2="80%" y2="90%">
          <stop offset="0%" stopColor="#a0522d" />
          <stop offset="50%" stopColor="#78350f" />
          <stop offset="100%" stopColor="#451a03" />
        </linearGradient>

        <clipPath id={clipId}>
          <circle cx="86" cy="30" r="19" />
        </clipPath>
      </defs>

      <g transform={flip}>
        {/* Ground shadow (cast beneath planted left foot & torso) */}
        <ellipse cx="94" cy="226" rx="40" ry="7" fill="#000000" opacity="0.45" />
        <ellipse cx="90" cy="225" rx="22" ry="4" fill="#000000" opacity="0.75" />

        {/* Trailing rear right leg (high step bent ~90°) */}
        <path
          d="M108 100 C118 98 132 104 145 116 C149 120 148 126 142 131 C135 135 122 122 111 113 Z"
          fill={`url(#pg-${uid})`}
          stroke="#94a3b8"
          strokeWidth="0.5"
        />
        <path
          d="M112 101 C124 107 136 116 144 123 L141 127 C132 119 120 110 110 104 Z"
          fill={primary}
        />
        <path
          d="M111 101 C123 107 135 116 143 123"
          stroke={accent}
          strokeWidth="0.8"
          fill="none"
          opacity="0.85"
        />

        {/* Rear lower leg (compression sleeve) */}
        <path
          d="M142 123 C149 130 157 139 161 149 L152 153 C146 143 140 135 136 129 Z"
          fill={primary}
          stroke="#991b1b"
          strokeWidth="0.5"
        />
        {/* Rear ankle white sock band */}
        <path d="M158 147 L164 155 L157 159 L151 151 Z" fill="#ffffff" stroke="#cbd5e1" strokeWidth="0.5" />
        {/* Rear cleat (black with white stripes & studs) */}
        <g transform="translate(153, 147) rotate(40)">
          <path d="M2 2 C8 0 16 2 20 8 C22 12 18 16 12 16 L2 14 C0 10 0 4 2 2 Z" fill="#18181b" stroke="#09090b" strokeWidth="0.6" />
          <line x1="8" y1="3" x2="11" y2="13" stroke="#ffffff" strokeWidth="1.3" />
          <line x1="11" y1="3" x2="14" y2="13" stroke="#ffffff" strokeWidth="1.3" />
          <line x1="14" y1="4" x2="17" y2="12" stroke="#ffffff" strokeWidth="1.3" />
          <circle cx="4" cy="15" r="1.1" fill="#71717a" />
          <circle cx="9" cy="16" r="1.1" fill="#71717a" />
          <circle cx="16" cy="14" r="1.1" fill="#71717a" />
        </g>

        {/* Left balance arm (reaching back/down, fingers spread) */}
        <path
          d="M112 44 C120 42 130 46 134 54 C136 60 130 68 122 68 C116 68 112 60 112 44 Z"
          fill={`url(#jg-${uid})`}
        />
        {jerseyNumber ? (
          <text
            x="124"
            y="56"
            fill="#ffffff"
            stroke={accent}
            strokeWidth="0.5"
            fontSize="8"
            fontWeight="900"
            fontFamily="'Arial Black', Impact, sans-serif"
            transform="rotate(18, 124, 56)"
          >
            {jerseyNumber}
          </text>
        ) : null}
        <path d="M124 58 C130 64 138 72 142 80 L136 84 C132 76 124 68 120 62 Z" fill="#452718" />
        <path d="M128 66 L134 71 L132 74 L126 69 Z" fill="#18181b" />
        <path d="M138 78 C142 84 146 90 148 96 L142 98 C140 92 136 86 134 82 Z" fill="#452718" />
        <rect x="141" y="88" width="6" height="5" fill={primary} rx="1" transform="rotate(-15, 144, 90)" />
        {/* Left glove */}
        <path
          d="M144 94 C148 96 154 94 156 98 C158 102 152 108 148 106 C144 104 142 98 144 94 Z"
          fill={primary}
        />
        <path
          d="M152 98 L160 98 M153 101 L161 102 M151 104 L158 107 M148 105 L154 110"
          stroke={primary}
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <path d="M149 97 C152 98 153 102 150 104 Z" fill="#ffffff" opacity="0.8" />

        {/* Planted lead left leg (forward stride) */}
        <path
          d="M96 96 C92 110 88 124 90 144 C92 152 102 152 106 142 C108 126 112 110 114 96 Z"
          fill={`url(#pg-${uid})`}
          stroke="#94a3b8"
          strokeWidth="0.5"
        />
        <path
          d="M106 97 C104 112 102 128 98 142 L94 142 C98 126 101 112 102 97 Z"
          fill={primary}
        />
        <path
          d="M106 97 C104 112 102 128 98 142"
          stroke={accent}
          strokeWidth="0.8"
          fill="none"
          opacity="0.85"
        />

        {/* Front lower leg (compression sleeve to knee) */}
        <path
          d="M91 144 C89 160 88 176 90 190 L98 190 C99 176 102 160 103 144 Z"
          fill={primary}
          stroke="#991b1b"
          strokeWidth="0.5"
        />
        {/* Front ankle white sock band */}
        <path d="M89 188 C88 196 87 204 88 210 L98 210 C98 204 98 196 98 188 Z" fill="#ffffff" stroke="#cbd5e1" strokeWidth="0.5" />

        {/* Front planted cleat */}
        <g transform="translate(74, 206)">
          <path d="M4 14 C6 8 14 6 22 8 C28 10 32 14 30 18 L10 18 C6 18 2 16 4 14 Z" fill="#18181b" stroke="#09090b" strokeWidth="0.8" />
          <path d="M6 14 C10 10 16 9 20 10" stroke="#ffffff" strokeWidth="1.3" fill="none" />
          <path d="M22 10 L25 15" stroke="#ffffff" strokeWidth="1.3" />
          <path d="M18 9 L21 15" stroke="#ffffff" strokeWidth="1.3" />
          <path d="M14 9 L17 15" stroke="#ffffff" strokeWidth="1.3" />
          <rect x="8" y="18" width="22" height="2" fill="#09090b" rx="1" />
          <rect x="10" y="20" width="3" height="2" fill="#71717a" />
          <rect x="18" y="20" width="3" height="2" fill="#71717a" />
          <rect x="26" y="20" width="3" height="2" fill="#71717a" />
        </g>

        {/* Torso, belt, jersey, numbers */}
        <path d="M94 92 C98 90 110 90 116 94 L114 100 C108 97 98 97 94 98 Z" fill="#ffffff" stroke="#cbd5e1" strokeWidth="0.6" />
        <rect x="103" y="93" width="4" height="4" fill="#a1a1aa" rx="0.5" />

        <path
          d="M76 48 C72 60 72 74 76 86 C80 94 90 98 100 96 C108 94 114 88 116 80 C118 68 116 54 112 44 C100 40 88 42 76 48 Z"
          fill={`url(#jg-${uid})`}
          stroke="#991b1b"
          strokeWidth="0.5"
        />

        {/* Jersey white/black flank inserts */}
        <path d="M77 62 C76 72 78 80 82 86 L80 87 C75 80 74 70 75 61 Z" fill="#ffffff" opacity="0.9" />
        <path d="M78 62 C77 72 79 80 83 86" stroke={accent} strokeWidth="0.6" fill="none" />

        {/* V-neck collar & shield */}
        <path d="M84 44 C88 42 98 42 102 44 L98 52 C95 54 91 54 88 52 Z" fill="#18181b" />
        <path d="M86 44 L93 52 L100 44" stroke="#ffffff" strokeWidth="1.2" fill="none" />
        <polygon points="93,48 91,51 93,54 95,51" fill="#e11d48" stroke="#ffffff" strokeWidth="0.4" />

        {/* Chest number */}
        {jerseyNumber ? (
          <g transform="translate(86, 74)">
            <text
              x="0"
              y="0"
              textAnchor="middle"
              dominantBaseline="central"
              fill="none"
              stroke={accent}
              strokeWidth="3"
              strokeLinejoin="round"
              fontFamily="'Arial Black', Impact, sans-serif"
              fontSize="22"
              fontWeight="900"
              letterSpacing="-1"
            >
              {jerseyNumber}
            </text>
            <text
              x="0"
              y="0"
              textAnchor="middle"
              dominantBaseline="central"
              fill="#ffffff"
              fontFamily="'Arial Black', Impact, sans-serif"
              fontSize="22"
              fontWeight="900"
              letterSpacing="-1"
            >
              {jerseyNumber}
            </text>
          </g>
        ) : null}

        {/* Carrier right arm & tucked football */}
        <path
          d="M66 42 C60 48 60 58 64 66 C70 68 76 66 78 58 C80 50 76 44 66 42 Z"
          fill={`url(#jg-${uid})`}
        />
        {jerseyNumber ? (
          <text
            x="70"
            y="54"
            fill="#ffffff"
            stroke={accent}
            strokeWidth="0.5"
            fontSize="8"
            fontWeight="900"
            fontFamily="'Arial Black', Impact, sans-serif"
            transform="rotate(-15, 70, 54)"
          >
            {jerseyNumber}
          </text>
        ) : null}

        <path d="M65 62 C62 70 66 78 74 82 L78 76 C72 72 70 66 71 60 Z" fill="#452718" />

        {/* Football clutched tight */}
        <g transform="translate(68, 54) rotate(16)">
          <ellipse cx="14" cy="10" rx="15" ry="9" fill={`url(#bg-${uid})`} stroke="#271406" strokeWidth="0.8" />
          <path d="M4 4 C6 7 6 13 4 16" stroke="#ffffff" strokeWidth="1.4" fill="none" opacity="0.9" />
          <path d="M24 4 C22 7 22 13 24 16" stroke="#ffffff" strokeWidth="1.4" fill="none" opacity="0.9" />
          <line x1="8" y1="5" x2="20" y2="5" stroke="#ffffff" strokeWidth="1.2" strokeLinecap="round" />
          <line x1="10" y1="3" x2="10" y2="7" stroke="#ffffff" strokeWidth="1" strokeLinecap="round" />
          <line x1="13" y1="3" x2="13" y2="7" stroke="#ffffff" strokeWidth="1" strokeLinecap="round" />
          <line x1="16" y1="3" x2="16" y2="7" stroke="#ffffff" strokeWidth="1" strokeLinecap="round" />
          <line x1="19" y1="3" x2="19" y2="7" stroke="#ffffff" strokeWidth="1" strokeLinecap="round" />
        </g>

        {/* Right glove */}
        <path d="M78 68 C82 66 88 68 88 74 C86 78 80 80 76 76 Z" fill={primary} />
        <path d="M79 67 C83 67 86 70 85 73" stroke="#991b1b" strokeWidth="1.8" strokeLinecap="round" fill="none" />
        <path d="M81 69 C85 70 87 73 86 76" stroke="#991b1b" strokeWidth="1.8" strokeLinecap="round" fill="none" />
        <path d="M82 72 C85 74 86 77 84 80" stroke="#991b1b" strokeWidth="1.8" strokeLinecap="round" fill="none" />
        <rect x="74" y="74" width="6" height="4" fill="#ffffff" rx="1" transform="rotate(25, 77, 76)" />

        {/* Head slot: roster avatar vs realistic helmet */}
        {showHead ? (
          <g>
            <image
              href={headshotUrl}
              xlinkHref={headshotUrl}
              x="66"
              y="10"
              width="40"
              height="40"
              preserveAspectRatio="xMidYMid slice"
              clipPath={`url(#${clipId})`}
              onError={() => setImgFailed(true)}
            />
            <circle cx="86" cy="30" r="19" fill="none" stroke={primary} strokeWidth="2.5" />
            <circle cx="86" cy="30" r="19" fill="none" stroke="#09090b" strokeWidth="1" opacity="0.6" />
          </g>
        ) : (
          <g>
            {/* White helmet shell with 3D specular highlight */}
            <ellipse cx="86" cy="30" rx="19" ry="18" fill={`url(#hs-${uid})`} stroke="#94a3b8" strokeWidth="0.8" />
            
            {/* Cardinals logo on temple */}
            <path d="M78 26 C82 23 88 24 92 27 C90 28 86 28 84 30 C82 32 78 30 78 26 Z" fill={primary} />
            <polygon points="92,27 95,28 92,29" fill="#facc15" />

            {/* Dark visor & face inside mask */}
            <path d="M80 28 C84 27 94 27 98 32 C99 38 96 44 88 44 C82 44 79 38 80 28 Z" fill="#18181b" />
            <ellipse cx="88" cy="33" rx="3" ry="1.5" fill="#452718" />
            <circle cx="87" cy="33" r="0.8" fill="#ffffff" opacity="0.85" />
            <circle cx="92" cy="33" r="0.8" fill="#ffffff" opacity="0.85" />

            {/* Chrome facemask */}
            <g stroke="#cbd5e1" strokeWidth="1.4" fill="none" strokeLinecap="round">
              <path d="M79 30 C86 29 95 30 99 33" />
              <path d="M78 34 C85 33 95 34 98 38" />
              <path d="M80 39 C86 38 93 39 96 42" />
              <path d="M83 44 C87 43 91 43 94 45" />
              <path d="M84 29 L85 44" />
              <path d="M90 29 L90 44" />
              <path d="M96 32 L95 44" />
            </g>

            {/* Chin strap */}
            <path d="M82 42 C85 47 91 47 94 43" stroke="#ffffff" strokeWidth="2" fill="none" strokeLinecap="round" />
            <circle cx="81" cy="38" r="1.5" fill="#a1a1aa" />
            <circle cx="96" cy="39" r="1.5" fill="#a1a1aa" />
          </g>
        )}
      </g>
    </svg>
  )
}
