import { useEffect, useMemo, useState } from 'react'
import { dominantAccentsFromRgba } from '../../utils/dominantAccentFromRgba.js'
import { GUIDE_ACCENT_PALETTE, guideAccentForLightSurface } from '../../utils/guideAccentPalette.js'

const sampled = new Map()

function hashIndex(seed, n) {
  let h = 0
  for (const ch of String(seed || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return n ? h % n : 0
}

/** Top two palette hues of the logo (strongest first), or null when it cannot be read. */
function sampleLogo(url) {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.decoding = 'async'
    img.onload = () => {
      try {
        const size = 32
        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        ctx.drawImage(img, 0, 0, size, size)
        const hues = dominantAccentsFromRgba(ctx.getImageData(0, 0, size, size).data, 2)
        resolve(hues.length ? hues : null)
      } catch {
        resolve(null)
      }
    }
    img.onerror = () => resolve(null)
    img.src = url
  })
}

const themed = (dark) => ({ dark, light: guideAccentForLightSurface(dark) || dark })

/**
 * Team color for the fantasy matchup card: the logo's dominant hue snapped to the guide palette.
 * Hosts that block CORS (or letter avatars) get a stable palette pick from the team id / name.
 * Returns `{ dark, light, alt }` hex for the two themes; `alt` is the logo's second hue (or null).
 */
export function useTeamAccent(url, seed) {
  const key = String(url || '').trim()
  const [found, setFound] = useState({ key: '', hues: null })
  const hues = !key ? null : found.key === key ? found.hues : sampled.get(key) ?? null
  useEffect(() => {
    if (!key || sampled.has(key)) return undefined
    let alive = true
    void sampleLogo(key).then((value) => {
      sampled.set(key, value)
      if (alive) setFound({ key, hues: value })
    })
    return () => {
      alive = false
    }
  }, [key])
  return useMemo(() => {
    const dark = hues?.[0] || GUIDE_ACCENT_PALETTE[hashIndex(seed, GUIDE_ACCENT_PALETTE.length)].hex
    return { ...themed(dark), alt: hues?.[1] ? themed(hues[1]) : null }
  }, [hues, seed])
}

function paletteGap(a, b) {
  const n = GUIDE_ACCENT_PALETTE.length
  const at = GUIDE_ACCENT_PALETTE.findIndex((p) => p.hex === a)
  const other = GUIDE_ACCENT_PALETTE.findIndex((p) => p.hex === b)
  if (at < 0 || other < 0) return n
  return Math.min(Math.abs(at - other), n - Math.abs(at - other))
}

/**
 * Same pick unless it sits within a few palette steps of `taken` (red vs rose read as one side); then the logo's
 * second hue if that one stands apart. Still close after that is fine (Ryan): both sides keep their real colors
 * rather than every clash jumping to the same opposite hue.
 */
export function distinctTeamAccent(accent, taken) {
  if (!taken || paletteGap(accent.dark, taken.dark) > 2) return accent
  if (accent.alt && paletteGap(accent.alt.dark, taken.dark) > 2) return { ...accent.alt, alt: null }
  return accent
}
