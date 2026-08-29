import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const root = path.resolve(import.meta.dirname, '..')
const publicDir = path.join(root, 'public')

async function generateOgImages() {
  // Base logo buffer
  const logoPath = path.join(publicDir, 'edge-lounge-logo-transparent.png')
  const logoBuf = await sharp(logoPath)
    .resize({ width: 520 })
    .png()
    .toBuffer()

  // 1. Base Main OG Image (1200x630)
  const svgOverlayMain = `
  <svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="cyanGlow" cx="50%" cy="0%" r="70%">
        <stop offset="0%" stop-color="#22d3ee" stop-opacity="0.25" />
        <stop offset="50%" stop-color="#0891b2" stop-opacity="0.08" />
        <stop offset="100%" stop-color="#09090b" stop-opacity="0" />
      </radialGradient>
      <radialGradient id="ambient" cx="80%" cy="90%" r="50%">
        <stop offset="0%" stop-color="#f43f5e" stop-opacity="0.12" />
        <stop offset="100%" stop-color="#09090b" stop-opacity="0" />
      </radialGradient>
    </defs>

    <!-- Background -->
    <rect width="1200" height="630" fill="#09090b" />
    <rect width="1200" height="630" fill="url(#cyanGlow)" />
    <rect width="1200" height="630" fill="url(#ambient)" />

    <!-- Subtle framing border -->
    <rect x="24" y="24" width="1152" height="582" rx="28" fill="none" stroke="#27272a" stroke-width="2" opacity="0.6" />

    <!-- Subtitle / Tagline -->
    <text x="600" y="360" font-family="Montserrat, system-ui, sans-serif" font-weight="700" font-size="34" fill="#f4f4f5" text-anchor="middle" letter-spacing="-0.5px">
      The Social Platform for Risk Takers
    </text>

    <!-- Feature Pills -->
    <g transform="translate(600, 420)">
      <!-- Pill 1: Slots -->
      <g transform="translate(-320, 0)">
        <rect x="-65" y="-18" width="130" height="36" rx="18" fill="#18181b" stroke="#3f3f46" stroke-width="1.5" />
        <text x="0" y="6" font-family="Montserrat, system-ui, sans-serif" font-weight="700" font-size="16" fill="#22d3ee" text-anchor="middle">⚡ SLOTS</text>
      </g>
      <!-- Pill 2: Poker -->
      <g transform="translate(-160, 0)">
        <rect x="-65" y="-18" width="130" height="36" rx="18" fill="#18181b" stroke="#3f3f46" stroke-width="1.5" />
        <text x="0" y="6" font-family="Montserrat, system-ui, sans-serif" font-weight="700" font-size="16" fill="#fb923c" text-anchor="middle">♠️ POKER</text>
      </g>
      <!-- Pill 3: Markets -->
      <g transform="translate(0, 0)">
        <rect x="-75" y="-18" width="150" height="36" rx="18" fill="#18181b" stroke="#3f3f46" stroke-width="1.5" />
        <text x="0" y="6" font-family="Montserrat, system-ui, sans-serif" font-weight="700" font-size="16" fill="#34d399" text-anchor="middle">📈 MARKETS</text>
      </g>
      <!-- Pill 4: Odds -->
      <g transform="translate(160, 0)">
        <rect x="-65" y="-18" width="130" height="36" rx="18" fill="#18181b" stroke="#3f3f46" stroke-width="1.5" />
        <text x="0" y="6" font-family="Montserrat, system-ui, sans-serif" font-weight="700" font-size="16" fill="#a78bfa" text-anchor="middle">🎯 ODDS</text>
      </g>
      <!-- Pill 5: Lounge -->
      <g transform="translate(320, 0)">
        <rect x="-70" y="-18" width="140" height="36" rx="18" fill="#18181b" stroke="#3f3f46" stroke-width="1.5" />
        <text x="0" y="6" font-family="Montserrat, system-ui, sans-serif" font-weight="700" font-size="16" fill="#f472b6" text-anchor="middle">🔥 LOUNGE</text>
      </g>
    </g>

    <!-- Bottom URL Footer -->
    <g transform="translate(600, 525)">
      <rect x="-105" y="-18" width="210" height="36" rx="18" fill="#083344" stroke="#06cefc" stroke-width="1.5" />
      <text x="0" y="6" font-family="Montserrat, system-ui, sans-serif" font-weight="800" font-size="16" fill="#38bdf8" text-anchor="middle" letter-spacing="0.5px">edgetilt.com</text>
    </g>
  </svg>
  `

  const ogMainPath = path.join(publicDir, 'og-image.png')
  await sharp(Buffer.from(svgOverlayMain))
    .composite([
      {
        input: logoBuf,
        top: 155,
        left: Math.round((1200 - 520) / 2),
      },
    ])
    .png({ quality: 95 })
    .toFile(ogMainPath)
  console.log(`Created ${ogMainPath} (${fs.statSync(ogMainPath).size} bytes)`)

  // 2. Dedicated Slots OG Image (1200x630)
  const svgOverlaySlots = `
  <svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="slotsCyanGlow" cx="50%" cy="0%" r="70%">
        <stop offset="0%" stop-color="#22d3ee" stop-opacity="0.30" />
        <stop offset="45%" stop-color="#0891b2" stop-opacity="0.10" />
        <stop offset="100%" stop-color="#09090b" stop-opacity="0" />
      </radialGradient>
      <radialGradient id="slotsOrangeGlow" cx="85%" cy="85%" r="50%">
        <stop offset="0%" stop-color="#fb923c" stop-opacity="0.14" />
        <stop offset="100%" stop-color="#09090b" stop-opacity="0" />
      </radialGradient>
    </defs>

    <!-- Background -->
    <rect width="1200" height="630" fill="#09090b" />
    <rect width="1200" height="630" fill="url(#slotsCyanGlow)" />
    <rect width="1200" height="630" fill="url(#slotsOrangeGlow)" />

    <!-- Subtle framing border -->
    <rect x="24" y="24" width="1152" height="582" rx="28" fill="none" stroke="#27272a" stroke-width="2" opacity="0.6" />

    <!-- Main Headline -->
    <text x="600" y="325" font-family="Montserrat, system-ui, sans-serif" font-weight="800" font-size="46" fill="#ffffff" text-anchor="middle" letter-spacing="-1px">
      +EV Edge for Slots
    </text>

    <!-- Subtitle -->
    <text x="600" y="380" font-family="Montserrat, system-ui, sans-serif" font-weight="500" font-size="22" fill="#a1a1aa" text-anchor="middle">
      AP Guides · EV Calculators · Bankroll · Play Logbook · Lounge
    </text>

    <!-- Feature Badges -->
    <g transform="translate(600, 445)">
      <g transform="translate(-250, 0)">
        <rect x="-70" y="-16" width="140" height="32" rx="16" fill="#18181b" stroke="#3f3f46" stroke-width="1.2" />
        <text x="0" y="5" font-family="Montserrat, system-ui, sans-serif" font-weight="700" font-size="14" fill="#fb923c" text-anchor="middle">310+ AP GUIDES</text>
      </g>
      <g transform="translate(-80, 0)">
        <rect x="-75" y="-16" width="150" height="32" rx="16" fill="#18181b" stroke="#3f3f46" stroke-width="1.2" />
        <text x="0" y="5" font-family="Montserrat, system-ui, sans-serif" font-weight="700" font-size="14" fill="#22d3ee" text-anchor="middle">EV CALCULATORS</text>
      </g>
      <g transform="translate(90, 0)">
        <rect x="-75" y="-16" width="150" height="32" rx="16" fill="#18181b" stroke="#3f3f46" stroke-width="1.2" />
        <text x="0" y="5" font-family="Montserrat, system-ui, sans-serif" font-weight="700" font-size="14" fill="#34d399" text-anchor="middle">BANKROLL TRACKER</text>
      </g>
      <g transform="translate(255, 0)">
        <rect x="-70" y="-16" width="140" height="32" rx="16" fill="#18181b" stroke="#3f3f46" stroke-width="1.2" />
        <text x="0" y="5" font-family="Montserrat, system-ui, sans-serif" font-weight="700" font-size="14" fill="#f472b6" text-anchor="middle">PLAY LOGBOOK</text>
      </g>
    </g>

    <!-- Bottom URL Footer -->
    <g transform="translate(600, 530)">
      <rect x="-120" y="-18" width="240" height="36" rx="18" fill="#083344" stroke="#06cefc" stroke-width="1.5" />
      <text x="0" y="6" font-family="Montserrat, system-ui, sans-serif" font-weight="800" font-size="16" fill="#38bdf8" text-anchor="middle" letter-spacing="0.5px">edgetilt.com/slots</text>
    </g>
  </svg>
  `

  const ogSlotsPath = path.join(publicDir, 'og-slots.png')
  await sharp(Buffer.from(svgOverlaySlots))
    .composite([
      {
        input: logoBuf,
        top: 130,
        left: Math.round((1200 - 520) / 2),
      },
    ])
    .png({ quality: 95 })
    .toFile(ogSlotsPath)
  console.log(`Created ${ogSlotsPath} (${fs.statSync(ogSlotsPath).size} bytes)`)

  // 3. Dedicated Poker OG Image (1200x630)
  const svgOverlayPoker = `
  <svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="pokerAmberGlow" cx="50%" cy="0%" r="70%">
        <stop offset="0%" stop-color="#f59e0b" stop-opacity="0.28" />
        <stop offset="45%" stop-color="#b45309" stop-opacity="0.09" />
        <stop offset="100%" stop-color="#09090b" stop-opacity="0" />
      </radialGradient>
      <radialGradient id="pokerEmeraldGlow" cx="85%" cy="85%" r="50%">
        <stop offset="0%" stop-color="#10b981" stop-opacity="0.15" />
        <stop offset="100%" stop-color="#09090b" stop-opacity="0" />
      </radialGradient>
    </defs>

    <!-- Background -->
    <rect width="1200" height="630" fill="#09090b" />
    <rect width="1200" height="630" fill="url(#pokerAmberGlow)" />
    <rect width="1200" height="630" fill="url(#pokerEmeraldGlow)" />

    <!-- Subtle framing border -->
    <rect x="24" y="24" width="1152" height="582" rx="28" fill="none" stroke="#27272a" stroke-width="2" opacity="0.6" />

    <!-- Main Headline -->
    <text x="600" y="325" font-family="Montserrat, system-ui, sans-serif" font-weight="800" font-size="46" fill="#ffffff" text-anchor="middle" letter-spacing="-1px">
      Edge Tilt for Poker
    </text>

    <!-- Subtitle -->
    <text x="600" y="380" font-family="Montserrat, system-ui, sans-serif" font-weight="500" font-size="22" fill="#a1a1aa" text-anchor="middle">
      Bankroll Tracker · Stable Manager · Stakes &amp; Swaps · Horses &amp; Deals
    </text>

    <!-- Feature Badges -->
    <g transform="translate(600, 445)">
      <g transform="translate(-250, 0)">
        <rect x="-70" y="-16" width="140" height="32" rx="16" fill="#18181b" stroke="#3f3f46" stroke-width="1.2" />
        <text x="0" y="5" font-family="Montserrat, system-ui, sans-serif" font-weight="700" font-size="14" fill="#fbbf24" text-anchor="middle">♠️ CASH SESSIONS</text>
      </g>
      <g transform="translate(-80, 0)">
        <rect x="-75" y="-16" width="150" height="32" rx="16" fill="#18181b" stroke="#3f3f46" stroke-width="1.2" />
        <text x="0" y="5" font-family="Montserrat, system-ui, sans-serif" font-weight="700" font-size="14" fill="#34d399" text-anchor="middle">🏆 TOURNAMENTS</text>
      </g>
      <g transform="translate(90, 0)">
        <rect x="-75" y="-16" width="150" height="32" rx="16" fill="#18181b" stroke="#3f3f46" stroke-width="1.2" />
        <text x="0" y="5" font-family="Montserrat, system-ui, sans-serif" font-weight="700" font-size="14" fill="#22d3ee" text-anchor="middle">🤝 STABLE &amp; BACKING</text>
      </g>
      <g transform="translate(255, 0)">
        <rect x="-70" y="-16" width="140" height="32" rx="16" fill="#18181b" stroke="#3f3f46" stroke-width="1.2" />
        <text x="0" y="5" font-family="Montserrat, system-ui, sans-serif" font-weight="700" font-size="14" fill="#f472b6" text-anchor="middle">📊 ROI &amp; TRENDS</text>
      </g>
    </g>

    <!-- Bottom URL Footer -->
    <g transform="translate(600, 530)">
      <rect x="-120" y="-18" width="240" height="36" rx="18" fill="#451a03" stroke="#f59e0b" stroke-width="1.5" />
      <text x="0" y="6" font-family="Montserrat, system-ui, sans-serif" font-weight="800" font-size="16" fill="#fbbf24" text-anchor="middle" letter-spacing="0.5px">edgetilt.com/poker</text>
    </g>
  </svg>
  `

  const ogPokerPath = path.join(publicDir, 'og-poker.png')
  await sharp(Buffer.from(svgOverlayPoker))
    .composite([
      {
        input: logoBuf,
        top: 130,
        left: Math.round((1200 - 520) / 2),
      },
    ])
    .png({ quality: 95 })
    .toFile(ogPokerPath)
  console.log(`Created ${ogPokerPath} (${fs.statSync(ogPokerPath).size} bytes)`)
}

generateOgImages().catch(console.error)
