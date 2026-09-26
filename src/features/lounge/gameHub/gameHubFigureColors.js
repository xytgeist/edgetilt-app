/**
 * Dynamic uniform recoloring engine for Game Hub authentic NFL figures.
 * Preserves 3D sculpt shading, muscle contours, fabric creases, and specular
 * highlights while transforming apparel to match active team kits.
 */

import { CATCH_PIECES } from './gameHubCatchPieces.js'
import { RUSH_PIECES } from './gameHubRushPieces.js'

/**
 * Standard authentic helmet & pants color presets for all 32 NFL franchises.
 * Used to derive pro-accurate helmet shells and pants beyond just the primary jersey tone.
 */
export const NFL_TEAM_KITS = {
  ARI: { helmet: '#FFFFFF', pants: '#FFFFFF' },
  ATL: { helmet: '#000000', pants: '#FFFFFF' },
  BAL: { helmet: '#000000', pants: '#FFFFFF' },
  BUF: { helmet: '#FFFFFF', pants: '#FFFFFF' },
  CAR: { helmet: '#A5ACAF', pants: '#A5ACAF' },
  CHI: { helmet: '#0B162A', pants: '#FFFFFF' },
  CIN: { helmet: '#FB4F14', pants: '#FFFFFF' },
  CLE: { helmet: '#FF3C00', pants: '#FFFFFF' },
  DAL: { helmet: '#B0B7BC', pants: '#B0B7BC' },
  DEN: { helmet: '#002244', pants: '#FFFFFF' },
  DET: { helmet: '#B0B7BC', pants: '#B0B7BC' },
  GB:  { helmet: '#FFB612', pants: '#FFB612' },
  HOU: { helmet: '#03202F', pants: '#FFFFFF' },
  IND: { helmet: '#FFFFFF', pants: '#FFFFFF' },
  JAX: { helmet: '#000000', pants: '#FFFFFF' },
  KC:  { helmet: '#E31837', pants: '#FFFFFF' },
  LAC: { helmet: '#FFFFFF', pants: '#FFC20E' },
  LAR: { helmet: '#003594', pants: '#FFD100' },
  LV:  { helmet: '#A5ACAF', pants: '#A5ACAF' },
  MIA: { helmet: '#FFFFFF', pants: '#FFFFFF' },
  MIN: { helmet: '#4F2683', pants: '#FFFFFF' },
  NE:  { helmet: '#A5ACAF', pants: '#002244' },
  NO:  { helmet: '#D3BC8D', pants: '#000000' },
  NYG: { helmet: '#0B2265', pants: '#FFFFFF' },
  NYJ: { helmet: '#003F2D', pants: '#FFFFFF' },
  PHI: { helmet: '#004C54', pants: '#FFFFFF' },
  PIT: { helmet: '#000000', pants: '#FFB612' },
  SF:  { helmet: '#B3995D', pants: '#B3995D' },
  SEA: { helmet: '#002244', pants: '#002244' },
  TB:  { helmet: '#54585A', pants: '#54585A' },
  TEN: { helmet: '#FFFFFF', pants: '#0C2340' },
  WAS: { helmet: '#5A1414', pants: '#FFB612' },
}

const TEAM_KIT_ALIASES = {
  JAC: 'JAX',
  WSH: 'WAS',
}

/**
 * Resolves full kit styling (helmet, pants, tights) given a team abbrev and base colors.
 */
export function resolveTeamKit(abbrev, primary, secondary) {
  const normAbbrev = String(abbrev || '').trim().toUpperCase()
  const key = TEAM_KIT_ALIASES[normAbbrev] || normAbbrev
  const preset = NFL_TEAM_KITS[key]

  const prim = primary || '#97233F'
  const sec = secondary || '#FFFFFF'
  const helmetColor = preset?.helmet || prim
  const pantsColor = preset?.pants || '#FFFFFF'
  const tightsColor = prim

  return {
    primary: prim,
    secondary: sec,
    helmetColor,
    pantsColor,
    tightsColor,
  }
}

/** Converts #RRGGBB or #RGB to [r, g, b] in 0..255. */
export function hexToRgb(hex) {
  if (!hex || typeof hex !== 'string') return [0, 0, 0]
  const clean = hex.replace('#', '').trim()
  if (clean.length === 3) {
    return [
      parseInt(clean[0] + clean[0], 16),
      parseInt(clean[1] + clean[1], 16),
      parseInt(clean[2] + clean[2], 16),
    ]
  }
  if (clean.length === 6) {
    return [
      parseInt(clean.slice(0, 2), 16),
      parseInt(clean.slice(2, 4), 16),
      parseInt(clean.slice(4, 6), 16),
    ]
  }
  return [0, 0, 0]
}

/** Converts [r, g, b] to uppercase #RRGGBB. */
export function rgbToHex([r, g, b]) {
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)))
  return `#${((1 << 24) + (clamp(r) << 16) + (clamp(g) << 8) + clamp(b))
    .toString(16)
    .slice(1)
    .toUpperCase()}`
}

/** Perceptual luminance (Rec. 709 / sRGB) normalized 0..1. */
export function getLuminance(rgb) {
  return (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255
}

/** Converts hex to HSL: h in 0..360, s in 0..1, l in 0..1. */
export function hexToHsl(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0
  let s = 0
  const l = (max + min) / 2

  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0)
        break
      case g:
        h = (b - r) / d + 2
        break
      case b:
        h = (r - g) / d + 4
        break
      default:
        break
    }
    h *= 60
  }
  return { h, s, l }
}

/**
 * Maps an original vector path color to a target team color while preserving
 * shadow depth, midtone texture, and highlight specular sheen.
 */
export function recolorTone(origHex, targetHex, baseMidL = 0.35) {
  const origRgb = hexToRgb(origHex)
  const targetRgb = hexToRgb(targetHex)
  const lOrig = getLuminance(origRgb)

  if (lOrig <= baseMidL) {
    // Darken towards deep shadow
    const t = Math.pow(lOrig / Math.max(0.01, baseMidL), 1.05)
    return rgbToHex(targetRgb.map((c) => c * t))
  }
  // Lighten towards specular highlight
  const t = Math.pow((lOrig - baseMidL) / Math.max(0.01, 1.0 - baseMidL), 1.15)
  return rgbToHex(targetRgb.map((c) => c + (255 - c) * t))
}

const WHITE_HEX_SET = new Set(['#FFFFFF', '#FAF9F6', '#FAFAFA', '#F8F9FA'])

/**
 * Builds the O(1) fill-lookup table for the WR/TE Catch figure.
 * Returns a map of `pieceId:originalHex` -> `recoloredHex`.
 */
export function buildCatchColorMap({
  primary = '#002244',
  _secondary = '#FFFFFF',
  helmetColor,
  pantsColor,
  tightsColor,
} = {}) {
  const helmet = helmetColor || primary
  const pants = pantsColor || '#FFFFFF'
  const tights = tightsColor || primary
  const isPantsWhite = WHITE_HEX_SET.has(pants.toUpperCase())

  const map = {}

  for (const piece of CATCH_PIECES) {
    const pid = piece.id
    for (const path of piece.paths) {
      const orig = path.fill
      const key = `${pid}:${orig}`
      if (map[key] !== undefined) continue

      if (pid === 'blue-jersey') {
        map[key] = recolorTone(orig, primary, 0.35)
      } else if (pid === 'blue-sock-trailing' || pid === 'blue-sock-front') {
        map[key] = recolorTone(orig, tights, 0.35)
      } else if (pid === 'blue-helmet') {
        const { s, l } = hexToHsl(orig)
        // Keep facemask bars (neutral / metallic silver) intact
        const isFacemask = s < 0.18 || l > 0.88 || l < 0.06
        map[key] = isFacemask ? orig : recolorTone(orig, helmet, 0.35)
      } else if (pid === 'yellow-pants') {
        const { h, s, l } = hexToHsl(orig)
        if (s > 0.25 && h >= 180 && h <= 260) {
          // Athletic side stripe -> team primary
          map[key] = recolorTone(orig, primary, 0.35)
        } else if (s > 0.20 && h >= 25 && h <= 75) {
          // Yellow base fabric -> pantsColor
          map[key] = recolorTone(orig, pants, 0.55)
        } else if (l > 0.85 && !isPantsWhite) {
          // Specular highlights on colored pants
          map[key] = recolorTone(orig, pants, 0.55)
        } else {
          // Neutral highlights / shadow folds on white pants
          map[key] = isPantsWhite ? orig : recolorTone(orig, pants, 0.55)
        }
      } else {
        // Keep body-skin, white-cleat, white-glove, nfl-collar, nfl-hip intact
        map[key] = orig
      }
    }
  }

  return map
}

/**
 * Builds the O(1) fill-lookup table for the RB Rush figure.
 * Returns a map of `pieceId:originalHex` -> `recoloredHex`.
 */
export function buildRushColorMap({
  primary = '#C4122E',
  secondary = '#FFFFFF',
  helmetColor,
  pantsColor,
  tightsColor,
} = {}) {
  const helmet = helmetColor || primary
  const pants = pantsColor || '#FFFFFF'
  const tights = tightsColor || primary
  const isPantsWhite = WHITE_HEX_SET.has(pants.toUpperCase())

  const map = {}

  for (const piece of RUSH_PIECES) {
    const pid = piece.id
    for (const path of piece.paths) {
      const orig = path.fill
      const key = `${pid}:${orig}`
      if (map[key] !== undefined) continue

      if (pid === 'red-jersey') {
        map[key] = recolorTone(orig, primary, 0.35)
      } else if (pid === 'red-tights' || pid === 'fwd-sock') {
        map[key] = recolorTone(orig, tights, 0.35)
      } else if (pid === 'red-gloves-1' || pid === 'red-gloves-2') {
        map[key] = recolorTone(orig, primary, 0.35)
      } else if (pid === 'red-helmet') {
        const { s, l } = hexToHsl(orig)
        // Keep facemask metallic bars intact
        const isFacemask = s < 0.15 || l > 0.88 || l < 0.08
        map[key] = isFacemask ? orig : recolorTone(orig, helmet, 0.35)
      } else if (pid === 'white-pants') {
        const { h, s } = hexToHsl(orig)
        // Red pants stripe -> primary
        if (s > 0.3 && (h < 25 || h > 340)) {
          map[key] = recolorTone(orig, primary, 0.35)
        } else if (!isPantsWhite) {
          // Tint white pants to team pants color (e.g. gold, yellow, silver)
          map[key] = recolorTone(orig, pants, 0.70)
        } else {
          map[key] = orig
        }
      } else if (pid.startsWith('nike-swoosh')) {
        map[key] = secondary || '#FFFFFF'
      } else {
        // Keep body-skin, front-cleat, black-cleats, football, nfl-shield-logo intact
        map[key] = orig
      }
    }
  }

  return map
}
