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
const merrow = 28

async function patchBase({ borderRgb = [196, 196, 206], fill = '#0a0a0a' } = {}) {
  const svg = Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <filter id="fabric" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" result="n"/>
        <feColorMatrix type="matrix" values="0 0 0 0 0.08  0 0 0 0 0.08  0 0 0 0 0.09  0 0 0 0.18 0" in="n" result="t"/>
        <feBlend in="SourceGraphic" in2="t" mode="overlay"/>
      </filter>
    </defs>
    <rect width="${W}" height="${H}" rx="36" ry="36" fill="rgb(${borderRgb.join(',')})"/>
    <rect x="${merrow}" y="${merrow}" width="${W - merrow * 2}" height="${H - merrow * 2}" rx="22" ry="22" fill="${fill}" filter="url(#fabric)"/>
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

async function domainLayer(color = '#22d3ee', fontSize = 28) {
  const svg = Buffer.from(`<svg width="${W}" height="34" xmlns="http://www.w3.org/2000/svg">
    <text x="50%" y="70%" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="700" fill="${color}">edgetilt.com</text>
  </svg>`)
  return sharp(svg).png().toBuffer()
}

async function compose({
  name,
  logoPath,
  logoW,
  logoH,
  domain = true,
  borderRgb,
  domainColor = '#22d3ee',
}) {
  const base = await patchBase({ borderRgb })
  const logoBuf = await logoOnClear(logoPath, { width: logoW, height: logoH })
  const meta = await sharp(logoBuf).metadata()
  const lx = Math.round((W - meta.width) / 2)
  const domainH = domain ? 34 : 0
  const gap = domain ? 18 : 0
  const blockH = meta.height + gap + domainH
  const top = Math.round((H - blockH) / 2)
  const layers = [{ input: logoBuf, left: lx, top }]
  if (domain) {
    layers.push({
      input: await domainLayer(domainColor),
      left: 0,
      top: top + meta.height + gap,
    })
  }
  const webpPath = path.join(outDir, `${name}.webp`)
  await sharp(base).composite(layers).webp({ quality: 84 }).toFile(webpPath)
  console.log('wrote', webpPath)
}

await compose({
  name: 'patch-logo-wordmark',
  logoPath: logoFull,
  logoW: 780,
  logoH: 220,
  borderRgb: [190, 190, 200],
})
await compose({
  name: 'patch-logo-wordmark-bold',
  logoPath: logoFull,
  logoW: 860,
  logoH: 260,
  borderRgb: [210, 210, 218],
})
await compose({
  name: 'patch-logo-mark-e',
  logoPath: logoE,
  logoW: 320,
  logoH: 320,
  borderRgb: [190, 190, 200],
})
await compose({
  name: 'patch-logo-mark-e-redborder',
  logoPath: logoERed,
  logoW: 300,
  logoH: 300,
  borderRgb: [220, 38, 38],
})
await compose({
  name: 'patch-logo-wordmark-orange',
  logoPath: logoFull,
  logoW: 780,
  logoH: 220,
  borderRgb: [251, 146, 60],
  domainColor: '#67e8f9',
})

{
  const base = await patchBase({ borderRgb: [190, 190, 200] })
  const eBuf = await logoOnClear(logoE, { width: 220, height: 220 })
  const wBuf = await logoOnClear(logoFull, { width: 560, height: 170 })
  const eMeta = await sharp(eBuf).metadata()
  const wMeta = await sharp(wBuf).metadata()
  const gap = 28
  const totalW = eMeta.width + gap + wMeta.width
  const left0 = Math.round((W - totalW) / 2)
  const rowH = Math.max(eMeta.height, wMeta.height)
  const midY = Math.round((H - rowH) / 2) - 16
  await sharp(base)
    .composite([
      {
        input: eBuf,
        left: left0,
        top: midY + Math.round((rowH - eMeta.height) / 2),
      },
      {
        input: wBuf,
        left: left0 + eMeta.width + gap,
        top: midY + Math.round((rowH - wMeta.height) / 2),
      },
      {
        input: await domainLayer('#22d3ee', 26),
        left: 0,
        top: midY + rowH + 22,
      },
    ])
    .webp({ quality: 84 })
    .toFile(path.join(outDir, 'patch-logo-combo-real.webp'))
  console.log('wrote public/patches/patch-logo-combo-real.webp')
}

// Keep concept AI hangs separate; logo set is the primary wall.
console.log(
  'logo patches:',
  fs.readdirSync(outDir).filter((f) => f.startsWith('patch-logo-')),
)
