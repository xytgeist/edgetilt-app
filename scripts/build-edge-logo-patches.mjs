import sharp from 'sharp'
import fs from 'fs'
import path from 'path'

const outDir = 'public/patches'
const logoFull = 'public/edge-lounge-logo-transparent.png'
const logoE = 'public/EdgeIconBlack/apple-icon-180x180.png'
const logoERed = 'public/EdgeEV_Black_Red_AppIcon/apple-icon-180x180.png'

/** 3.5" × 2" display canvas */
const W = 1050
const H = 600
const merrow = 34

async function patchBase({ borderRgb = [28, 28, 30], fill = '#0a0a0a' } = {}) {
  const svg = Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <filter id="fabric" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch" result="n"/>
        <feColorMatrix type="matrix" values="0 0 0 0 0.1  0 0 0 0 0.1  0 0 0 0 0.11  0 0 0 0.22 0" in="n" result="t"/>
        <feBlend in="SourceGraphic" in2="t" mode="overlay"/>
      </filter>
    </defs>
    <rect width="${W}" height="${H}" rx="40" ry="40" fill="rgb(${borderRgb.join(',')})"/>
    <rect x="${merrow}" y="${merrow}" width="${W - merrow * 2}" height="${H - merrow * 2}" rx="24" ry="24" fill="${fill}" filter="url(#fabric)"/>
  </svg>`)
  return sharp(svg).png().toBuffer()
}

/** Knock out near-black app-icon backgrounds so marks sit clean on the patch. */
async function logoOnClear(logoPath, { width, height, threshold = 18 } = {}) {
  const { data, info } = await sharp(logoPath)
    .ensureAlpha()
    .resize({ width, height, fit: 'inside' })
    .raw()
    .toBuffer({ resolveWithObject: true })
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    if (r <= threshold && g <= threshold && b <= threshold) data[i + 3] = 0
  }
  return sharp(data, { raw: info }).png().toBuffer()
}

async function textLayer({
  text,
  color = '#ffffff',
  fontSize = 28,
  height = 36,
  weight = 700,
  letterSpacing = 0,
}) {
  const tracking =
    letterSpacing > 0 ? `letter-spacing="${letterSpacing}px"` : ''
  const svg = Buffer.from(`<svg width="${W}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <text x="50%" y="72%" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="${weight}" fill="${color}" ${tracking}>${text}</text>
  </svg>`)
  return sharp(svg).png().toBuffer()
}

/**
 * Preferred layout (matches Ryan's favorite embroidered mock):
 * EDGE logo → edgetilt.com → Poker · Slots · Sports
 */
async function composeStack({
  name,
  logoPath,
  logoW,
  logoH,
  borderRgb = [28, 28, 30],
  domainColor = '#ffffff',
  tribesColor = '#ffffff',
  tribes = 'Poker · Slots · Sports',
}) {
  const base = await patchBase({ borderRgb })
  const logoBuf = await logoOnClear(logoPath, { width: logoW, height: logoH })
  const domainBuf = await textLayer({
    text: 'edgetilt.com',
    color: domainColor,
    fontSize: 30,
    height: 36,
    weight: 700,
  })
  const tribesBuf = await textLayer({
    text: tribes,
    color: tribesColor,
    fontSize: 22,
    height: 30,
    weight: 600,
    letterSpacing: 1.2,
  })

  const logoMeta = await sharp(logoBuf).metadata()
  const gapLogoDomain = 14
  const gapDomainTribes = 10
  const blockH = logoMeta.height + gapLogoDomain + 36 + gapDomainTribes + 30
  const top = Math.round((H - blockH) / 2)
  const logoLeft = Math.round((W - logoMeta.width) / 2)

  const webpPath = path.join(outDir, `${name}.webp`)
  await sharp(base)
    .composite([
      { input: logoBuf, left: logoLeft, top },
      { input: domainBuf, left: 0, top: top + logoMeta.height + gapLogoDomain },
      {
        input: tribesBuf,
        left: 0,
        top: top + logoMeta.height + gapLogoDomain + 36 + gapDomainTribes,
      },
    ])
    .webp({ quality: 86 })
    .toFile(webpPath)
  console.log('wrote', webpPath)
}

fs.mkdirSync(outDir, { recursive: true })

await composeStack({
  name: 'patch-hero-wordmark',
  logoPath: logoFull,
  logoW: 820,
  logoH: 230,
  borderRgb: [22, 22, 24],
  domainColor: '#ffffff',
  tribesColor: '#e5e5e5',
})

await composeStack({
  name: 'patch-hero-wordmark-cyan-tribes',
  logoPath: logoFull,
  logoW: 800,
  logoH: 220,
  borderRgb: [22, 22, 24],
  domainColor: '#ffffff',
  tribesColor: '#22d3ee',
})

await composeStack({
  name: 'patch-hero-emark',
  logoPath: logoE,
  logoW: 280,
  logoH: 280,
  borderRgb: [22, 22, 24],
  domainColor: '#ffffff',
  tribesColor: '#e5e5e5',
})

await composeStack({
  name: 'patch-hero-emark-redborder',
  logoPath: logoERed,
  logoW: 260,
  logoH: 260,
  borderRgb: [180, 30, 30],
  domainColor: '#ffffff',
  tribesColor: '#fca5a5',
})

await composeStack({
  name: 'patch-hero-wordmark-silver',
  logoPath: logoFull,
  logoW: 800,
  logoH: 220,
  borderRgb: [180, 180, 190],
  domainColor: '#ffffff',
  tribesColor: '#d4d4d8',
})

// Legacy silver-border logo set (kept for /patches archive section).
async function composeLegacy({
  name,
  logoPath,
  logoW,
  logoH,
  borderRgb,
  domainColor = '#22d3ee',
}) {
  const base = await patchBase({ borderRgb })
  const logoBuf = await logoOnClear(logoPath, { width: logoW, height: logoH })
  const meta = await sharp(logoBuf).metadata()
  const lx = Math.round((W - meta.width) / 2)
  const domainBuf = await textLayer({
    text: 'edgetilt.com',
    color: domainColor,
    fontSize: 28,
    height: 34,
  })
  const gap = 18
  const blockH = meta.height + gap + 34
  const top = Math.round((H - blockH) / 2)
  await sharp(base)
    .composite([
      { input: logoBuf, left: lx, top },
      { input: domainBuf, left: 0, top: top + meta.height + gap },
    ])
    .webp({ quality: 84 })
    .toFile(path.join(outDir, `${name}.webp`))
  console.log('wrote', path.join(outDir, `${name}.webp`))
}

await composeLegacy({
  name: 'patch-logo-wordmark',
  logoPath: logoFull,
  logoW: 780,
  logoH: 220,
  borderRgb: [190, 190, 200],
})
await composeLegacy({
  name: 'patch-logo-wordmark-bold',
  logoPath: logoFull,
  logoW: 860,
  logoH: 260,
  borderRgb: [210, 210, 218],
})
await composeLegacy({
  name: 'patch-logo-mark-e',
  logoPath: logoE,
  logoW: 320,
  logoH: 320,
  borderRgb: [190, 190, 200],
})
await composeLegacy({
  name: 'patch-logo-mark-e-redborder',
  logoPath: logoERed,
  logoW: 300,
  logoH: 300,
  borderRgb: [220, 38, 38],
})
await composeLegacy({
  name: 'patch-logo-wordmark-orange',
  logoPath: logoFull,
  logoW: 780,
  logoH: 220,
  borderRgb: [251, 146, 60],
  domainColor: '#67e8f9',
})

console.log(
  'hero patches:',
  fs.readdirSync(outDir).filter((f) => f.startsWith('patch-hero-')),
)
