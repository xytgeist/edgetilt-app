#!/usr/bin/env node
/** Opaque email header bands (single JPG each — no CSS swap; Gmail-safe). */
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const root = path.resolve(import.meta.dirname, '..')
const publicDir = path.join(root, 'public')
const width = 520
const height = 72
const logoHeight = 40

async function buildHeader(filename, background, logoPath) {
  if (!fs.existsSync(logoPath)) {
    console.warn(`Skip ${filename}: missing ${path.relative(root, logoPath)}`)
    return
  }
  const logoBuf = await sharp(logoPath).resize({ height: logoHeight }).png().toBuffer()
  const outPath = path.join(publicDir, filename)
  await sharp({
    create: { width, height, channels: 3, background },
  })
    .composite([{ input: logoBuf, gravity: 'center' }])
    .jpeg({ quality: 92, mozjpeg: true })
    .toFile(outPath)
  console.log(`${filename} -> ${fs.statSync(outPath).size} bytes`)
}

await buildHeader(
  'edge-email-header-dark.jpg',
  { r: 48, g: 48, b: 48 },
  path.join(publicDir, 'edge-lounge-logo-transparent.png'),
)

const lightLogo = fs.existsSync(path.join(publicDir, 'edge-email-logo-light-transparent.png'))
  ? path.join(publicDir, 'edge-email-logo-light-transparent.png')
  : path.join(publicDir, 'edge-lounge-logo.png')
await buildHeader('edge-email-header-light.jpg', { r: 255, g: 255, b: 255 }, lightLogo)
