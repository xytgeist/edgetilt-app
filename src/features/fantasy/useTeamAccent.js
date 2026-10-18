import { useEffect, useMemo, useState } from 'react'
import { dominantAccentFromRgba } from '../../utils/dominantAccentFromRgba.js'
import { GUIDE_ACCENT_PALETTE, guideAccentForLightSurface } from '../../utils/guideAccentPalette.js'

const sampled = new Map()

function hashIndex(seed, n) {
  let h = 0
  for (const ch of String(seed || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return n ? h % n : 0
}

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
        resolve(dominantAccentFromRgba(ctx.getImageData(0, 0, size, size).data))
      } catch {
        resolve(null)
      }
    }
    img.onerror = () => resolve(null)
    img.src = url
  })
}

/**
 * Team color for the fantasy matchup card: the logo's dominant hue snapped to the guide palette.
 * Hosts that block CORS (or letter avatars) get a stable palette pick from the team id / name.
 * Returns `{ dark, light }` hex for the two themes.
 */
export function useTeamAccent(url, seed) {
  const key = String(url || '').trim()
  const [found, setFound] = useState({ key: '', hex: null })
  const hex = !key ? null : found.key === key ? found.hex : sampled.get(key) ?? null
  useEffect(() => {
    if (!key || sampled.has(key)) return undefined
    let alive = true
    void sampleLogo(key).then((value) => {
      sampled.set(key, value)
      if (alive) setFound({ key, hex: value })
    })
    return () => {
      alive = false
    }
  }, [key])
  return useMemo(() => {
    const dark = hex || GUIDE_ACCENT_PALETTE[hashIndex(seed, GUIDE_ACCENT_PALETTE.length)].hex
    return { dark, light: guideAccentForLightSurface(dark) || dark }
  }, [hex, seed])
}

/** Same pick but never equal to `taken` (two teams with the same hue read as one side). */
export function distinctTeamAccent(accent, taken, seed) {
  if (!taken || accent.dark !== taken.dark) return accent
  const n = GUIDE_ACCENT_PALETTE.length
  const at = GUIDE_ACCENT_PALETTE.findIndex((p) => p.hex === accent.dark)
  const next = GUIDE_ACCENT_PALETTE[((at >= 0 ? at : hashIndex(seed, n)) + Math.floor(n / 2)) % n]
  return { dark: next.hex, light: next.lightHex }
}
