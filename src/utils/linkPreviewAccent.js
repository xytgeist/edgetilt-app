/** Known brand accents when OG/theme-color is missing (compact link pills). */
export const DOMAIN_ACCENT_COLORS = {
  'google.com': '#B2402E',
  'facebook.com': '#1877F2',
  'fb.com': '#1877F2',
  'instagram.com': '#E4405F',
  'x.com': '#000000',
  'twitter.com': '#1D9BF0',
  'youtube.com': '#FF0000',
  'reddit.com': '#FF4500',
  'linkedin.com': '#0A66C2',
  'tiktok.com': '#010101',
  'amazon.com': '#FF9900',
  'apple.com': '#555555',
  'microsoft.com': '#0078D4',
  'github.com': '#24292F',
  'kalshi.com': '#00C389',
  'spotify.com': '#1DB954',
  'discord.com': '#5865F2',
  'whatsapp.com': '#25D366',
}

export function hostnameDomainKey(hostname) {
  const h = String(hostname || '')
    .toLowerCase()
    .replace(/^www\./, '')
  const parts = h.split('.').filter(Boolean)
  if (parts.length >= 2) return parts.slice(-2).join('.')
  return h
}

export function domainAccentColor(urlOrHost) {
  let host = String(urlOrHost || '').trim()
  if (!host) return null
  try {
    if (/^https?:\/\//i.test(host)) host = new URL(host).hostname
  } catch {
    /* */
  }
  return DOMAIN_ACCENT_COLORS[hostnameDomainKey(host)] || null
}

export function normalizeAccentHex(raw) {
  const s = String(raw || '').trim()
  if (!s) return null
  if (/^#[0-9a-f]{3}$/i.test(s)) {
    const h = s.slice(1)
    return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`.toLowerCase()
  }
  if (/^#[0-9a-f]{6}$/i.test(s)) return s.toLowerCase()
  if (/^#[0-9a-f]{8}$/i.test(s)) return s.slice(0, 7).toLowerCase()
  const rgb = s.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i)
  if (rgb) {
    const clamp = (n) => Math.max(0, Math.min(255, Number(n) || 0))
    const hex = (n) => clamp(n).toString(16).padStart(2, '0')
    return `#${hex(rgb[1])}${hex(rgb[2])}${hex(rgb[3])}`
  }
  return null
}

function hexToRgb(hex) {
  const h = normalizeAccentHex(hex)
  if (!h) return null
  return {
    r: parseInt(h.slice(1, 3), 16),
    g: parseInt(h.slice(3, 5), 16),
    b: parseInt(h.slice(5, 7), 16),
  }
}

/** Relative luminance (sRGB) - for picking readable text on tinted bubbles. */
export function accentLuminance(hex) {
  const c = hexToRgb(hex)
  if (!c) return 0
  const lin = (v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b)
}

/** Darken very light theme colors so white title text still reads on the pill. */
export function bubbleAccentBackground(hex) {
  const base = normalizeAccentHex(hex)
  if (!base) return null
  const c = hexToRgb(base)
  if (!c) return null
  const lum = accentLuminance(base)
  const factor = lum > 0.62 ? 0.72 : lum > 0.45 ? 0.88 : 1
  const mix = (v) => Math.round(v * factor)
  const toHex = (n) => mix(n).toString(16).padStart(2, '0')
  return `#${toHex(c.r)}${toHex(c.g)}${toHex(c.b)}`
}

export function resolvePreviewAccent(preview) {
  const fromPayload = normalizeAccentHex(preview?.accent_color)
  if (fromPayload) return fromPayload
  return domainAccentColor(preview?.url || preview?.site_name)
}

/** Google favicon proxy does not send CORS headers - display-only, no canvas sampling. */
function canSampleImageUrl(url) {
  try {
    const u = new URL(url)
    if (u.hostname === 'www.google.com' && u.pathname.startsWith('/s2/favicons')) return false
  } catch {
    return false
  }
  return true
}

/**
 * Sample a saturated dominant color from a favicon/og thumb (best-effort; CORS may block).
 * @param {string} url
 * @returns {Promise<string|null>}
 */
export function extractAccentFromImageUrl(url) {
  const src = String(url || '').trim()
  if (!src || !canSampleImageUrl(src)) return Promise.resolve(null)

  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.referrerPolicy = 'no-referrer'
    img.decoding = 'async'

    const finish = (value) => {
      resolve(normalizeAccentHex(value))
    }

    img.onload = () => {
      try {
        const size = 32
        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (!ctx) {
          finish(null)
          return
        }
        ctx.drawImage(img, 0, 0, size, size)
        const { data } = ctx.getImageData(0, 0, size, size)
        let rSum = 0
        let gSum = 0
        let bSum = 0
        let weight = 0
        for (let i = 0; i < data.length; i += 4) {
          const a = data[i + 3]
          if (a < 40) continue
          const r = data[i]
          const g = data[i + 1]
          const b = data[i + 2]
          const max = Math.max(r, g, b)
          const min = Math.min(r, g, b)
          if (max - min < 18) continue
          if (max > 245 && min > 210) continue
          const sat = (max - min) / max
          const w = sat * (a / 255)
          rSum += r * w
          gSum += g * w
          bSum += b * w
          weight += w
        }
        if (weight < 0.01) {
          finish(null)
          return
        }
        const toHex = (n) => Math.round(n / weight).toString(16).padStart(2, '0')
        finish(`#${toHex(rSum)}${toHex(gSum)}${toHex(bSum)}`)
      } catch {
        finish(null)
      }
    }

    img.onerror = () => finish(null)
    img.src = src
  })
}
