/**
 * RB Figure Studio Harness
 * Precision vector model matching the Arizona Cardinals #31 McFarlane sculpt reference.
 */

export const TEAM_PRESETS = {
  ARI: { primary: '#C4122E', secondary: '#FFFFFF', accent: '#000000', helmet: '#FFFFFF', pants: '#FFFFFF', name: 'Cardinals' },
  SF:  { primary: '#AA0000', secondary: '#B3995D', accent: '#000000', helmet: '#B3995D', pants: '#B3995D', name: '49ers' },
  KC:  { primary: '#E31837', secondary: '#FFB612', accent: '#FFFFFF', helmet: '#E31837', pants: '#FFFFFF', name: 'Chiefs' },
  PHI: { primary: '#004C54', secondary: '#A5ACAF', accent: '#000000', helmet: '#004C54', pants: '#FFFFFF', name: 'Eagles' },
  DET: { primary: '#0076B6', secondary: '#B0B7BC', accent: '#FFFFFF', helmet: '#B0B7BC', pants: '#B0B7BC', name: 'Lions' },
  BAL: { primary: '#241773', secondary: '#9E7C0C', accent: '#000000', helmet: '#000000', pants: '#FFFFFF', name: 'Ravens' },
}

let instanceCounter = 0

/**
 * Builds the high-fidelity SVG matching the reference action figure.
 * ViewBox: 0 0 200 240
 */
export function renderRbFigureSvg({
  primary = '#C4122E',
  secondary = '#FFFFFF',
  accent = '#000000',
  helmetColor = '#FFFFFF',
  pantsColor = '#FFFFFF',
  jerseyNumber = '31',
  headMode = 'helmet',
  headshotUrl = '',
  width = 280,
  height = 336,
  facing = 1,
} = {}) {
  const uid = `rb-${++instanceCounter}`
  const flip = facing < 0 ? 'scale(-1, 1) translate(-200, 0)' : ''
  const isAvatar = headMode === 'avatar' && Boolean(headshotUrl)

  return `
    <svg viewBox="0 0 200 240" width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg" style="overflow: visible;">
      <defs>
        <!-- Jersey Fabric Gradient (Red with 3D athletic shading) -->
        <linearGradient id="${uid}-jersey-grad" x1="20%" y1="0%" x2="80%" y2="100%">
          <stop offset="0%" stop-color="#ef4444" stop-opacity="1" />
          <stop offset="25%" stop-color="${primary}" stop-opacity="1" />
          <stop offset="85%" stop-color="${primary}" stop-opacity="0.95" />
          <stop offset="100%" stop-color="#7f1d1d" stop-opacity="1" />
        </linearGradient>

        <!-- White Helmet Specular Dome -->
        <linearGradient id="${uid}-helmet-sheen" x1="25%" y1="5%" x2="75%" y2="95%">
          <stop offset="0%" stop-color="#ffffff" stop-opacity="1" />
          <stop offset="40%" stop-color="${helmetColor}" stop-opacity="1" />
          <stop offset="85%" stop-color="#e2e8f0" stop-opacity="1" />
          <stop offset="100%" stop-color="#cbd5e1" stop-opacity="1" />
        </linearGradient>

        <!-- White Pants Muscle Gradient -->
        <linearGradient id="${uid}-pants-grad" x1="15%" y1="10%" x2="85%" y2="90%">
          <stop offset="0%" stop-color="#ffffff" stop-opacity="1" />
          <stop offset="60%" stop-color="${pantsColor}" stop-opacity="1" />
          <stop offset="100%" stop-color="#e2e8f0" stop-opacity="1" />
        </linearGradient>

        <!-- Football Leather Gradient -->
        <linearGradient id="${uid}-ball-grad" x1="20%" y1="10%" x2="80%" y2="90%">
          <stop offset="0%" stop-color="#a0522d" />
          <stop offset="50%" stop-color="#78350f" />
          <stop offset="100%" stop-color="#451a03" />
        </linearGradient>

        <clipPath id="${uid}-head-clip">
          <circle cx="86" cy="30" r="19" />
        </clipPath>
      </defs>

      <g transform="${flip}">
        <!-- 1. Ground Shadow (Cast beneath planted left foot & torso) -->
        <ellipse cx="94" cy="226" rx="40" ry="7" fill="#000000" opacity="0.45" filter="blur(2.5px)" />
        <ellipse cx="90" cy="225" rx="22" ry="4" fill="#000000" opacity="0.75" />

        <!-- 2. Trailing Rear Right Leg (High Step Bent ~90°) -->
        <!-- Rear Thigh (White Football Pants) -->
        <path d="M108 100 C118 98 132 104 145 116 C149 120 148 126 142 131 C135 135 122 122 111 113 Z" fill="url(#${uid}-pants-grad)" stroke="#94a3b8" stroke-width="0.5" />
        <!-- Rear Thigh Red Stripe + Black Piping -->
        <path d="M112 101 C124 107 136 116 144 123 L141 127 C132 119 120 110 110 104 Z" fill="${primary}" />
        <path d="M111 101 C123 107 135 116 143 123" stroke="${accent}" stroke-width="0.8" fill="none" opacity="0.85" />

        <!-- Rear Lower Leg (Red Compression Sleeve) -->
        <path d="M142 123 C149 130 157 139 161 149 L152 153 C146 143 140 135 136 129 Z" fill="${primary}" stroke="#991b1b" stroke-width="0.5" />
        <!-- Rear Ankle White Sock Band -->
        <path d="M158 147 L164 155 L157 159 L151 151 Z" fill="#ffffff" stroke="#cbd5e1" stroke-width="0.5" />
        <!-- Rear Cleat (Black with white Adidas stripes & cleat studs) -->
        <g transform="translate(153, 147) rotate(40)">
          <path d="M2 2 C8 0 16 2 20 8 C22 12 18 16 12 16 L2 14 C0 10 0 4 2 2 Z" fill="#18181b" stroke="#09090b" stroke-width="0.6" />
          <!-- White Adidas Stripes -->
          <line x1="8" y1="3" x2="11" y2="13" stroke="#ffffff" stroke-width="1.3" />
          <line x1="11" y1="3" x2="14" y2="13" stroke="#ffffff" stroke-width="1.3" />
          <line x1="14" y1="4" x2="17" y2="12" stroke="#ffffff" stroke-width="1.3" />
          <!-- Cleat Studs -->
          <circle cx="4" cy="15" r="1.1" fill="#71717a" />
          <circle cx="9" cy="16" r="1.1" fill="#71717a" />
          <circle cx="16" cy="14" r="1.1" fill="#71717a" />
        </g>

        <!-- 3. Left Balance Arm (Reaching back/down, fingers spread) -->
        <!-- Left Shoulder Pad -->
        <path d="M112 44 C120 42 130 46 134 54 C136 60 130 68 122 68 C116 68 112 60 112 44 Z" fill="url(#${uid}-jersey-grad)" />
        <!-- Left Shoulder Number "31" -->
        <text x="124" y="56" fill="#ffffff" stroke="${accent}" stroke-width="0.5" font-size="8" font-weight="900" font-family="'Arial Black', Impact, sans-serif" transform="rotate(18, 124, 56)">${jerseyNumber}</text>
        <!-- Muscular Left Arm & Black Bicep Band -->
        <path d="M124 58 C130 64 138 72 142 80 L136 84 C132 76 124 68 120 62 Z" fill="#452718" />
        <path d="M128 66 L134 71 L132 74 L126 69 Z" fill="#18181b" />
        <!-- Left Forearm & Red Wristband -->
        <path d="M138 78 C142 84 146 90 148 96 L142 98 C140 92 136 86 134 82 Z" fill="#452718" />
        <rect x="141" y="88" width="6" height="5" fill="${primary}" rx="1" transform="rotate(-15, 144, 90)" />
        <!-- Left Glove (Red, fingers spread wide back for balance) -->
        <path d="M144 94 C148 96 154 94 156 98 C158 102 152 108 148 106 C144 104 142 98 144 94 Z" fill="${primary}" />
        <path d="M152 98 L160 98 M153 101 L161 102 M151 104 L158 107 M148 105 L154 110" stroke="${primary}" stroke-width="1.6" stroke-linecap="round" />
        <path d="M149 97 C152 98 153 102 150 104 Z" fill="#ffffff" opacity="0.8" />

        <!-- 4. Planted Lead Left Leg (Forward Stride) -->
        <!-- Front Thigh / Quad (White Football Pants) -->
        <path d="M96 96 C92 110 88 124 90 144 C92 152 102 152 106 142 C108 126 112 110 114 96 Z" fill="url(#${uid}-pants-grad)" stroke="#94a3b8" stroke-width="0.5" />
        <!-- Front Red Thigh Stripe + Black Piping -->
        <path d="M106 97 C104 112 102 128 98 142 L94 142 C98 126 101 112 102 97 Z" fill="${primary}" />
        <path d="M106 97 C104 112 102 128 98 142" stroke="${accent}" stroke-width="0.8" fill="none" opacity="0.85" />

        <!-- Front Lower Leg (Red Compression Sleeve to Knee) -->
        <path d="M91 144 C89 160 88 176 90 190 L98 190 C99 176 102 160 103 144 Z" fill="${primary}" stroke="#991b1b" stroke-width="0.5" />
        <!-- Front Ankle White Sock Band -->
        <path d="M89 188 C88 196 87 204 88 210 L98 210 C98 204 98 196 98 188 Z" fill="#ffffff" stroke="#cbd5e1" stroke-width="0.5" />

        <!-- Front Planted Cleat (Black with white Adidas stripes, planted firmly on yard line) -->
        <g transform="translate(74, 206)">
          <path d="M4 14 C6 8 14 6 22 8 C28 10 32 14 30 18 L10 18 C6 18 2 16 4 14 Z" fill="#18181b" stroke="#09090b" stroke-width="0.8" />
          <!-- White Stripes -->
          <path d="M6 14 C10 10 16 9 20 10" stroke="#ffffff" stroke-width="1.3" fill="none" />
          <path d="M22 10 L25 15" stroke="#ffffff" stroke-width="1.3" />
          <path d="M18 9 L21 15" stroke="#ffffff" stroke-width="1.3" />
          <path d="M14 9 L17 15" stroke="#ffffff" stroke-width="1.3" />
          <!-- Turf Sole & Cleats -->
          <rect x="8" y="18" width="22" height="2" fill="#09090b" rx="1" />
          <rect x="10" y="20" width="3" height="2" fill="#71717a" />
          <rect x="18" y="20" width="3" height="2" fill="#71717a" />
          <rect x="26" y="20" width="3" height="2" fill="#71717a" />
        </g>

        <!-- 5. Torso, Belt, Jersey, Numbers -->
        <!-- White Pants Waistband -->
        <path d="M94 92 C98 90 110 90 116 94 L114 100 C108 97 98 97 94 98 Z" fill="#ffffff" stroke="#cbd5e1" stroke-width="0.6" />
        <rect x="103" y="93" width="4" height="4" fill="#a1a1aa" rx="0.5" />

        <!-- Red Jersey Body (Tucked into pants, athletic forward lean) -->
        <path d="M76 48 C72 60 72 74 76 86 C80 94 90 98 100 96 C108 94 114 88 116 80 C118 68 116 54 112 44 C100 40 88 42 76 48 Z" fill="url(#${uid}-jersey-grad)" stroke="#991b1b" stroke-width="0.5" />

        <!-- Jersey White/Black Flank Inserts -->
        <path d="M77 62 C76 72 78 80 82 86 L80 87 C75 80 74 70 75 61 Z" fill="#ffffff" opacity="0.9" />
        <path d="M78 62 C77 72 79 80 83 86" stroke="${accent}" stroke-width="0.6" fill="none" />

        <!-- V-Neck Collar & Team Crest -->
        <path d="M84 44 C88 42 98 42 102 44 L98 52 C95 54 91 54 88 52 Z" fill="#18181b" />
        <path d="M86 44 L93 52 L100 44" stroke="#ffffff" stroke-width="1.2" fill="none" />
        <!-- NFL Shield at Collar -->
        <polygon points="93,48 91,51 93,54 95,51" fill="#e11d48" stroke="#ffffff" stroke-width="0.4" />

        <!-- Bold Chest Number "31" (White with black drop shadow outline) -->
        <g transform="translate(86, 74)">
          <text x="0" y="0" textAnchor="middle" dominant-baseline="central" fill="none" stroke="${accent}" stroke-width="3" stroke-linejoin="round" font-family="'Arial Black', Impact, sans-serif" font-size="22" font-weight="900" letter-spacing="-1">${jerseyNumber}</text>
          <text x="0" y="0" textAnchor="middle" dominant-baseline="central" fill="#ffffff" font-family="'Arial Black', Impact, sans-serif" font-size="22" font-weight="900" letter-spacing="-1">${jerseyNumber}</text>
        </g>

        <!-- 6. Carrier Right Arm & Football Tucked Tight -->
        <!-- Right Shoulder Cap with Number "31" -->
        <path d="M66 42 C60 48 60 58 64 66 C70 68 76 66 78 58 C80 50 76 44 66 42 Z" fill="url(#${uid}-jersey-grad)" />
        <text x="70" y="54" fill="#ffffff" stroke="${accent}" stroke-width="0.5" font-size="8" font-weight="900" font-family="'Arial Black', Impact, sans-serif" transform="rotate(-15, 70, 54)">${jerseyNumber}</text>

        <!-- Right Bicep & Forearm Cradling the Ball -->
        <path d="M65 62 C62 70 66 78 74 82 L78 76 C72 72 70 66 71 60 Z" fill="#452718" />

        <!-- The Football (Oblong leather clutched against ribs) -->
        <g transform="translate(68, 54) rotate(16)">
          <ellipse cx="14" cy="10" rx="15" ry="9" fill="url(#${uid}-ball-grad)" stroke="#271406" stroke-width="0.8" />
          <path d="M4 4 C6 7 6 13 4 16" stroke="#ffffff" stroke-width="1.4" fill="none" opacity="0.9" />
          <path d="M24 4 C22 7 22 13 24 16" stroke="#ffffff" stroke-width="1.4" fill="none" opacity="0.9" />
          <!-- White Laces -->
          <line x1="8" y1="5" x2="20" y2="5" stroke="#ffffff" stroke-width="1.2" stroke-linecap="round" />
          <line x1="10" y1="3" x2="10" y2="7" stroke="#ffffff" stroke-width="1" stroke-linecap="round" />
          <line x1="13" y1="3" x2="13" y2="7" stroke="#ffffff" stroke-width="1" stroke-linecap="round" />
          <line x1="16" y1="3" x2="16" y2="7" stroke="#ffffff" stroke-width="1" stroke-linecap="round" />
          <line x1="19" y1="3" x2="19" y2="7" stroke="#ffffff" stroke-width="1" stroke-linecap="round" />
        </g>

        <!-- Right Hand (Red Glove clawing over the front nose of the football) -->
        <path d="M78 68 C82 66 88 68 88 74 C86 78 80 80 76 76 Z" fill="${primary}" />
        <path d="M79 67 C83 67 86 70 85 73" stroke="#991b1b" stroke-width="1.8" stroke-linecap="round" fill="none" />
        <path d="M81 69 C85 70 87 73 86 76" stroke="#991b1b" stroke-width="1.8" stroke-linecap="round" fill="none" />
        <path d="M82 72 C85 74 86 77 84 80" stroke="#991b1b" stroke-width="1.8" stroke-linecap="round" fill="none" />
        <rect x="74" y="74" width="6" height="4" fill="#ffffff" rx="1" transform="rotate(25, 77, 76)" />

        <!-- 7. Head & Helmet -->
        ${isAvatar ? `
          <!-- Roster Headshot Avatar Slot -->
          <image href="${headshotUrl}" x="66" y="10" width="40" height="40" clip-path="url(#${uid}-head-clip)" preserveAspectRatio="xMidYMid slice" />
          <circle cx="86" cy="30" r="19" fill="none" stroke="${primary}" stroke-width="2.5" />
          <circle cx="86" cy="30" r="19" fill="none" stroke="#09090b" stroke-width="1" opacity="0.6" />
        ` : `
          <!-- White Helmet Shell with 3D Specular Highlight -->
          <ellipse cx="86" cy="30" rx="19" ry="18" fill="url(#${uid}-helmet-sheen)" stroke="#94a3b8" stroke-width="0.8" />
          
          <!-- Cardinals Logo Silhouette on Side of Helmet -->
          <path d="M78 26 C82 23 88 24 92 27 C90 28 86 28 84 30 C82 32 78 30 78 26 Z" fill="${primary}" />
          <polygon points="92,27 95,28 92,29" fill="#facc15" />

          <!-- Dark Visor & Face Silhouette Inside Facemask -->
          <path d="M80 28 C84 27 94 27 98 32 C99 38 96 44 88 44 C82 44 79 38 80 28 Z" fill="#18181b" />
          <ellipse cx="88" cy="33" rx="3" ry="1.5" fill="#452718" />
          <circle cx="87" cy="33" r="0.8" fill="#ffffff" opacity="0.85" />
          <circle cx="92" cy="33" r="0.8" fill="#ffffff" opacity="0.85" />

          <!-- Chrome Multi-Bar Facemask -->
          <g stroke="#cbd5e1" stroke-width="1.4" fill="none" stroke-linecap="round">
            <path d="M79 30 C86 29 95 30 99 33" />
            <path d="M78 34 C85 33 95 34 98 38" />
            <path d="M80 39 C86 38 93 39 96 42" />
            <path d="M83 44 C87 43 91 43 94 45" />
            <path d="M84 29 L85 44" />
            <path d="M90 29 L90 44" />
            <path d="M96 32 L95 44" />
          </g>

          <!-- White Chin Strap with Side Snaps -->
          <path d="M82 42 C85 47 91 47 94 43" stroke="#ffffff" stroke-width="2" fill="none" stroke-linecap="round" />
          <circle cx="81" cy="38" r="1.5" fill="#a1a1aa" />
          <circle cx="96" cy="39" r="1.5" fill="#a1a1aa" />
        `}
      </g>
    </svg>
  `
}

// Live DOM wiring for public/rb-studio.html
if (typeof document !== 'undefined') {
  function update() {
    const presetKey = document.getElementById('teamPreset')?.value || 'ARI'
    const team = TEAM_PRESETS[presetKey] || TEAM_PRESETS.ARI
    const num = document.getElementById('numInput')?.value || '31'
    const headMode = document.getElementById('headMode')?.value || 'helmet'
    const opacity = (Number(document.getElementById('opacitySlider')?.value || 65)) / 100

    const sideSvgHost = document.getElementById('sideBySideSvgHost')
    const overlayHost = document.getElementById('overlaySvgHost')
    const largeHost = document.getElementById('largeSvgHost')
    const fieldHost = document.getElementById('fieldTurfHost')
    const opacityVal = document.getElementById('opacityVal')

    if (opacityVal) opacityVal.textContent = `${Math.round(opacity * 100)}%`
    if (overlayHost) overlayHost.style.opacity = String(opacity)

    // Render large 260px SVG
    const largeSvg = renderRbFigureSvg({
      primary: team.primary,
      secondary: team.secondary,
      accent: team.accent,
      helmetColor: team.helmet,
      pantsColor: team.pants,
      jerseyNumber: num,
      headMode,
      headshotUrl: '/sports/nfl/ref-cardinals-rb.png',
      width: 250,
      height: 300,
    })

    // Render side-by-side card SVG (140px)
    const sideSvg = renderRbFigureSvg({
      primary: team.primary,
      secondary: team.secondary,
      accent: team.accent,
      helmetColor: team.helmet,
      pantsColor: team.pants,
      jerseyNumber: num,
      headMode,
      headshotUrl: '/sports/nfl/ref-cardinals-rb.png',
      width: 140,
      height: 168,
    })

    // Render field scale (65px)
    const fieldSvg = renderRbFigureSvg({
      primary: team.primary,
      secondary: team.secondary,
      accent: team.accent,
      helmetColor: team.helmet,
      pantsColor: team.pants,
      jerseyNumber: num,
      headMode,
      width: 65,
      height: 78,
    })

    if (sideSvgHost) sideSvgHost.innerHTML = sideSvg
    if (overlayHost) overlayHost.innerHTML = largeSvg
    if (largeHost) largeHost.innerHTML = largeSvg
    if (fieldHost) fieldHost.innerHTML = fieldSvg
  }

  // Tab switching
  const tabs = document.querySelectorAll('.view-tab')
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'))
      tab.classList.add('active')
      const target = tab.getAttribute('data-tab')
      document.querySelectorAll('.tab-view').forEach(view => {
        view.classList.remove('active')
      })
      const activeView = document.getElementById(`view-${target}`)
      if (activeView) activeView.classList.add('active')
    })
  })

  document.getElementById('teamPreset')?.addEventListener('change', update)
  document.getElementById('numInput')?.addEventListener('input', update)
  document.getElementById('headMode')?.addEventListener('change', update)
  document.getElementById('opacitySlider')?.addEventListener('input', update)

  // Initial draw
  update()
}
