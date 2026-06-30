/**
 * Curated guide-card accent hues (Tailwind 400 family).
 * Hero sampling picks a hue; we snap to these so UI accents stay vivid, not brown/gray mud.
 */
import { normalizeAccentHex } from './linkPreviewAccent.js'

/** @type {{ h: number, hex: string, lightHex: string }[]} Tailwind 400 on dark; 600–700 on light surfaces */
export const GUIDE_ACCENT_PALETTE = [
  { h: 0, hex: '#f87171', lightHex: '#dc2626' }, // red
  { h: 12, hex: '#fb7185', lightHex: '#e11d48' }, // rose
  { h: 25, hex: '#fb923c', lightHex: '#c2410c' }, // orange
  { h: 38, hex: '#fbbf24', lightHex: '#b45309' }, // amber
  { h: 48, hex: '#facc15', lightHex: '#a16207' }, // yellow
  { h: 84, hex: '#a3e635', lightHex: '#4d7c0f' }, // lime
  { h: 142, hex: '#4ade80', lightHex: '#15803d' }, // green
  { h: 160, hex: '#34d399', lightHex: '#047857' }, // emerald
  { h: 187, hex: '#22d3ee', lightHex: '#0e7490' }, // cyan
  { h: 198, hex: '#38bdf8', lightHex: '#0369a1' }, // sky
  { h: 213, hex: '#60a5fa', lightHex: '#1d4ed8' }, // blue
  { h: 239, hex: '#818cf8', lightHex: '#4338ca' }, // indigo
  { h: 258, hex: '#a78bfa', lightHex: '#6d28d9' }, // violet
  { h: 292, hex: '#c084fc', lightHex: '#7e22ce' }, // purple
  { h: 330, hex: '#f472b6', lightHex: '#be185d' }, // pink
]

/** @param {number} degrees */
function normalizeHue(degrees) {
  const h = degrees % 360
  return h < 0 ? h + 360 : h
}

/** @param {number} a @param {number} b */
function hueDistance(a, b) {
  const d = Math.abs(normalizeHue(a) - normalizeHue(b))
  return d > 180 ? 360 - d : d
}

/**
 * @param {number} r @param {number} g @param {number} b 0-255
 * @returns {{ h: number, s: number, l: number }}
 */
export function rgbToHsl(r, g, b) {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l }

  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60
  else if (max === gn) h = ((bn - rn) / d + 2) * 60
  else h = ((rn - gn) / d + 4) * 60
  return { h: normalizeHue(h), s, l }
}

/**
 * Snap a sampled hero color to the nearest curated accent.
 * @param {string | null | undefined} raw
 * @returns {string | null}
 */
export function snapGuideAccentToPalette(raw) {
  const hex = normalizeAccentHex(raw)
  if (!hex) return null

  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const { h, s } = rgbToHsl(r, g, b)

  // Near-neutral samples have unreliable hue - caller should fall back to legacy default.
  if (s < 0.12) return null

  let best = GUIDE_ACCENT_PALETTE[0]
  let bestDist = Infinity
  for (const entry of GUIDE_ACCENT_PALETTE) {
    const d = hueDistance(h, entry.h)
    if (d < bestDist) {
      bestDist = d
      best = entry
    }
  }
  return best.hex
}

/** @param {number} h @param {number} s @param {number} l 0–1 */
function hslToHex(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  let rp = 0
  let gp = 0
  let bp = 0
  if (h < 60) {
    rp = c
    gp = x
  } else if (h < 120) {
    rp = x
    gp = c
  } else if (h < 180) {
    gp = c
    bp = x
  } else if (h < 240) {
    gp = x
    bp = c
  } else if (h < 300) {
    rp = x
    bp = c
  } else {
    rp = c
    bp = x
  }
  const toHex = (n) =>
    Math.round((n + m) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${toHex(rp)}${toHex(gp)}${toHex(bp)}`
}

/**
 * Dark-mode palette hex → readable accent on white/light gray (light mode only).
 * @param {string | null | undefined} hex
 * @returns {string | null}
 */
export function guideAccentForLightSurface(hex) {
  const n = normalizeAccentHex(hex)
  if (!n) return null

  const entry = GUIDE_ACCENT_PALETTE.find((p) => p.hex === n)
  if (entry?.lightHex) return entry.lightHex

  const r = parseInt(n.slice(1, 3), 16)
  const g = parseInt(n.slice(3, 5), 16)
  const b = parseInt(n.slice(5, 7), 16)
  const { h, s, l } = rgbToHsl(r, g, b)

  // Yellow / gold / lime family - worst offenders on pale UI
  if (h >= 35 && h <= 100) {
    return hslToHex(h, Math.min(Math.max(s, 0.72), 0.95), 0.4)
  }
  if (l > 0.58) {
    return hslToHex(h, s, Math.max(l * 0.72, 0.38))
  }
  return n
}
