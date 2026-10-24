/**
 * Shared saturated-dominant accent sampling from RGBA pixel data.
 * Used by browser canvas + Node sharp backfill (same algorithm).
 *
 * Picks the winning hue bucket (not a muddy RGB average), then snaps to GUIDE_ACCENT_PALETTE.
 */
import { snapGuideAccentToPalette, rgbToHsl } from './guideAccentPalette.js'

const HUE_BINS = 36

/**
 * @param {Uint8ClampedArray | Uint8Array} data length width*height*4
 * @returns {string | null} #rrggbb from curated palette
 */
export function dominantAccentFromRgba(data) {
  return dominantAccentsFromRgba(data, 1)[0] ?? null
}

/**
 * Up to `count` distinct palette accents, strongest hue first. Runner-up hues must carry a real share of the image
 * (a few stray pixels are not a second color).
 * @param {Uint8ClampedArray | Uint8Array} data length width*height*4
 * @param {number} count
 * @returns {string[]} #rrggbb from curated palette
 */
export function dominantAccentsFromRgba(data, count = 2) {
  /** @type {{ weight: number, hueSum: number, hueWeight: number }[]} */
  const bins = Array.from({ length: HUE_BINS }, () => ({
    weight: 0,
    hueSum: 0,
    hueWeight: 0,
  }))

  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3]
    if (a < 40) continue

    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    if (max < 28) continue
    if (max - min < 16) continue
    if (max > 245 && min > 210) continue

    const { h, s, l } = rgbToHsl(r, g, b)
    if (s < 0.14) continue
    if (l < 0.1 || l > 0.9) continue

    const vivid = s * s * (a / 255)
    const bin = Math.min(HUE_BINS - 1, Math.floor((h / 360) * HUE_BINS))
    bins[bin].weight += vivid
    bins[bin].hueSum += h * vivid
    bins[bin].hueWeight += vivid
  }

  // Stable sort keeps the first-found bin on ties, matching the old single-winner scan.
  const ranked = bins.filter((bin) => bin.weight > 0).sort((a, b) => b.weight - a.weight)
  const best = ranked[0]
  if (!best || best.weight < 0.01 || best.hueWeight < 0.01) return []

  const out = []
  for (const bin of ranked) {
    if (out.length >= count) break
    if (bin.weight < 0.01 || bin.hueWeight < 0.01) break
    if (out.length && bin.weight < best.weight * 0.15) break
    const meanHue = bin.hueSum / bin.hueWeight
    // Synthetic mid-vivid sample at winning hue → palette snap
    const hex = snapGuideAccentToPalette(hslToHex(meanHue, 0.68, 0.52))
    if (!hex && bin === best) return []
    if (hex && !out.includes(hex)) out.push(hex)
  }
  return out
}

/** @param {number} h @param {number} s @param {number} l 0-1 */
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
