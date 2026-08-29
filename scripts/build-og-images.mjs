import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const root = path.resolve(import.meta.dirname, '..')
const publicDir = path.join(root, 'public')

async function generateOgImages() {
  // Base logo buffer - resize cleanly
  const logoPath = path.join(publicDir, 'edge-lounge-logo-transparent.png')
  const logoBuf = await sharp(logoPath)
    .resize({ width: 500 })
    .png()
    .toBuffer()

  // 1. Base Main OG Image (1200x630) - Clean dark obsidian theme with subtle top rim light
  const svgOverlayMain = `
  <svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <!-- Deep subtle dark gradients without muddy muddy colors -->
      <radialGradient id="mainTopRim" cx="50%" cy="0%" r="55%">
        <stop offset="0%" stop-color="#22d3ee" stop-opacity="0.12" />
        <stop offset="100%" stop-color="#09090b" stop-opacity="0" />
      </radialGradient>
      <linearGradient id="cardBorder" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#3f3f46" stop-opacity="0.7" />
        <stop offset="100%" stop-color="#18181b" stop-opacity="0.4" />
      </linearGradient>
    </defs>

    <!-- Deep Clean Background -->
    <rect width="1200" height="630" fill="#09090b" />
    <rect width="1200" height="630" fill="url(#mainTopRim)" />

    <!-- Subtle framing border -->
    <rect x="24" y="24" width="1152" height="582" rx="24" fill="none" stroke="url(#cardBorder)" stroke-width="1.5" />

    <!-- Subtitle / Tagline -->
    <text x="600" y="348" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-weight="700" font-size="30" fill="#f4f4f5" text-anchor="middle" letter-spacing="-0.5px">
      The Social Platform for Risk Takers
    </text>

    <!-- Feature Pills (Comfortable width & vertical centering) -->
    <g transform="translate(600, 415)">
      <!-- Pill 1: Slots -->
      <g transform="translate(-360, 0)">
        <rect x="-70" y="-20" width="140" height="40" rx="20" fill="#18181b" stroke="#27272a" stroke-width="1.5" />
        <text x="0" y="6" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-weight="700" font-size="14" fill="#38bdf8" text-anchor="middle" letter-spacing="0.5px">SLOTS</text>
      </g>
      <!-- Pill 2: Poker -->
      <g transform="translate(-180, 0)">
        <rect x="-70" y="-20" width="140" height="40" rx="20" fill="#18181b" stroke="#27272a" stroke-width="1.5" />
        <text x="0" y="6" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-weight="700" font-size="14" fill="#fb923c" text-anchor="middle" letter-spacing="0.5px">POKER</text>
      </g>
      <!-- Pill 3: Markets -->
      <g transform="translate(0, 0)">
        <rect x="-75" y="-20" width="150" height="40" rx="20" fill="#18181b" stroke="#27272a" stroke-width="1.5" />
        <text x="0" y="6" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-weight="700" font-size="14" fill="#34d399" text-anchor="middle" letter-spacing="0.5px">MARKETS</text>
      </g>
      <!-- Pill 4: Odds -->
      <g transform="translate(180, 0)">
        <rect x="-70" y="-20" width="140" height="40" rx="20" fill="#18181b" stroke="#27272a" stroke-width="1.5" />
        <text x="0" y="6" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-weight="700" font-size="14" fill="#a78bfa" text-anchor="middle" letter-spacing="0.5px">ODDS</text>
      </g>
      <!-- Pill 5: Lounge -->
      <g transform="translate(360, 0)">
        <rect x="-75" y="-20" width="150" height="40" rx="20" fill="#18181b" stroke="#27272a" stroke-width="1.5" />
        <text x="0" y="6" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-weight="700" font-size="14" fill="#f472b6" text-anchor="middle" letter-spacing="0.5px">LOUNGE</text>
      </g>
    </g>

    <!-- Bottom URL Footer -->
    <g transform="translate(600, 520)">
      <rect x="-110" y="-19" width="220" height="38" rx="19" fill="#18181b" stroke="#06cefc" stroke-width="1.5" />
      <text x="0" y="6" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-weight="800" font-size="15" fill="#38bdf8" text-anchor="middle" letter-spacing="0.6px">edgetilt.com</text>
    </g>
  </svg>
  `

  const ogMainPath = path.join(publicDir, 'og-image.png')
  await sharp(Buffer.from(svgOverlayMain))
    .composite([
      {
        input: logoBuf,
        top: 140,
        left: Math.round((1200 - 500) / 2),
      },
    ])
    .png({ quality: 95 })
    .toFile(ogMainPath)
  console.log(`Created ${ogMainPath} (${fs.statSync(ogMainPath).size} bytes)`)

  // 2. Dedicated Slots OG Image (1200x630) - Clean dark theme
  const svgOverlaySlots = `
  <svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="slotsTopGlow" cx="50%" cy="0%" r="55%">
        <stop offset="0%" stop-color="#06cefc" stop-opacity="0.14" />
        <stop offset="100%" stop-color="#09090b" stop-opacity="0" />
      </radialGradient>
      <linearGradient id="slotsBorder" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#3f3f46" stop-opacity="0.7" />
        <stop offset="100%" stop-color="#18181b" stop-opacity="0.4" />
      </linearGradient>
    </defs>

    <!-- Deep Clean Background -->
    <rect width="1200" height="630" fill="#09090b" />
    <rect width="1200" height="630" fill="url(#slotsTopGlow)" />

    <!-- Subtle framing border -->
    <rect x="24" y="24" width="1152" height="582" rx="24" fill="none" stroke="url(#slotsBorder)" stroke-width="1.5" />

    <!-- Main Headline -->
    <text x="600" y="315" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-weight="800" font-size="44" fill="#ffffff" text-anchor="middle" letter-spacing="-1px">
      +EV Edge for Slots
    </text>

    <!-- Subtitle -->
    <text x="600" y="365" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-weight="500" font-size="20" fill="#a1a1aa" text-anchor="middle">
      AP Guides · EV Calculators · Bankroll · Play Logbook · Lounge
    </text>

    <!-- Feature Badges (Generous width to prevent text overflow) -->
    <g transform="translate(600, 435)">
      <g transform="translate(-330, 0)">
        <rect x="-90" y="-19" width="180" height="38" rx="19" fill="#18181b" stroke="#27272a" stroke-width="1.5" />
        <text x="0" y="6" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-weight="700" font-size="13" fill="#fb923c" text-anchor="middle" letter-spacing="0.5px">310+ AP GUIDES</text>
      </g>
      <g transform="translate(-110, 0)">
        <rect x="-95" y="-19" width="190" height="38" rx="19" fill="#18181b" stroke="#27272a" stroke-width="1.5" />
        <text x="0" y="6" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-weight="700" font-size="13" fill="#38bdf8" text-anchor="middle" letter-spacing="0.5px">EV CALCULATORS</text>
      </g>
      <g transform="translate(115, 0)">
        <rect x="-95" y="-19" width="190" height="38" rx="19" fill="#18181b" stroke="#27272a" stroke-width="1.5" />
        <text x="0" y="6" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-weight="700" font-size="13" fill="#34d399" text-anchor="middle" letter-spacing="0.5px">BANKROLL TRACKER</text>
      </g>
      <g transform="translate(330, 0)">
        <rect x="-85" y="-19" width="170" height="38" rx="19" fill="#18181b" stroke="#27272a" stroke-width="1.5" />
        <text x="0" y="6" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-weight="700" font-size="13" fill="#f472b6" text-anchor="middle" letter-spacing="0.5px">PLAY LOGBOOK</text>
      </g>
    </g>

    <!-- Bottom URL Footer -->
    <g transform="translate(600, 520)">
      <rect x="-120" y="-19" width="240" height="38" rx="19" fill="#18181b" stroke="#06cefc" stroke-width="1.5" />
      <text x="0" y="6" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-weight="800" font-size="15" fill="#38bdf8" text-anchor="middle" letter-spacing="0.6px">edgetilt.com/slots</text>
    </g>
  </svg>
  `

  const ogSlotsPath = path.join(publicDir, 'og-slots.png')
  await sharp(Buffer.from(svgOverlaySlots))
    .composite([
      {
        input: logoBuf,
        top: 120,
        left: Math.round((1200 - 500) / 2),
      },
    ])
    .png({ quality: 95 })
    .toFile(ogSlotsPath)
  console.log(`Created ${ogSlotsPath} (${fs.statSync(ogSlotsPath).size} bytes)`)

  // 3. Dedicated Poker OG Image (1200x630) - Clean dark theme
  const svgOverlayPoker = `
  <svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="pokerTopGlow" cx="50%" cy="0%" r="55%">
        <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.12" />
        <stop offset="100%" stop-color="#09090b" stop-opacity="0" />
      </radialGradient>
      <linearGradient id="pokerBorder" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#3f3f46" stop-opacity="0.7" />
        <stop offset="100%" stop-color="#18181b" stop-opacity="0.4" />
      </linearGradient>
    </defs>

    <!-- Deep Clean Background -->
    <rect width="1200" height="630" fill="#09090b" />
    <rect width="1200" height="630" fill="url(#pokerTopGlow)" />

    <!-- Subtle framing border -->
    <rect x="24" y="24" width="1152" height="582" rx="24" fill="none" stroke="url(#pokerBorder)" stroke-width="1.5" />

    <!-- Main Headline -->
    <text x="600" y="315" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-weight="800" font-size="44" fill="#ffffff" text-anchor="middle" letter-spacing="-1px">
      Edge Tilt for Poker
    </text>

    <!-- Subtitle -->
    <text x="600" y="365" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-weight="500" font-size="20" fill="#a1a1aa" text-anchor="middle">
      Bankroll Tracker · Stable Manager · Stakes &amp; Swaps · Horses &amp; Deals
    </text>

    <!-- Feature Badges (Wide comfortable pill enclosures) -->
    <g transform="translate(600, 435)">
      <g transform="translate(-340, 0)">
        <rect x="-85" y="-19" width="170" height="38" rx="19" fill="#18181b" stroke="#27272a" stroke-width="1.5" />
        <text x="0" y="6" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-weight="700" font-size="13" fill="#fb923c" text-anchor="middle" letter-spacing="0.5px">CASH SESSIONS</text>
      </g>
      <g transform="translate(-115, 0)">
        <rect x="-85" y="-19" width="170" height="38" rx="19" fill="#18181b" stroke="#27272a" stroke-width="1.5" />
        <text x="0" y="6" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-weight="700" font-size="13" fill="#38bdf8" text-anchor="middle" letter-spacing="0.5px">TOURNAMENTS</text>
      </g>
      <g transform="translate(115, 0)">
        <rect x="-105" y="-19" width="210" height="38" rx="19" fill="#18181b" stroke="#27272a" stroke-width="1.5" />
        <text x="0" y="6" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-weight="700" font-size="13" fill="#34d399" text-anchor="middle" letter-spacing="0.5px">STABLE &amp; BACKING</text>
      </g>
      <g transform="translate(340, 0)">
        <rect x="-80" y="-19" width="160" height="38" rx="19" fill="#18181b" stroke="#27272a" stroke-width="1.5" />
        <text x="0" y="6" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-weight="700" font-size="13" fill="#f472b6" text-anchor="middle" letter-spacing="0.5px">ROI &amp; TRENDS</text>
      </g>
    </g>

    <!-- Bottom URL Footer -->
    <g transform="translate(600, 520)">
      <rect x="-120" y="-19" width="240" height="38" rx="19" fill="#18181b" stroke="#06cefc" stroke-width="1.5" />
      <text x="0" y="6" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-weight="800" font-size="15" fill="#38bdf8" text-anchor="middle" letter-spacing="0.6px">edgetilt.com/poker</text>
    </g>
  </svg>
  `

  const ogPokerPath = path.join(publicDir, 'og-poker.png')
  await sharp(Buffer.from(svgOverlayPoker))
    .composite([
      {
        input: logoBuf,
        top: 120,
        left: Math.round((1200 - 500) / 2),
      },
    ])
    .png({ quality: 95 })
    .toFile(ogPokerPath)
  console.log(`Created ${ogPokerPath} (${fs.statSync(ogPokerPath).size} bytes)`)
}

generateOgImages().catch(console.error)
