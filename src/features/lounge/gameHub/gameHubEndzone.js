import { NFL_TEAM_CATALOG } from '../loungeSportsMatch.js'

function hexToRgb(hex) {
  if (!hex || typeof hex !== 'string') return null
  const n = hex.replace(/^#/, '').trim()
  if (n.length === 3) {
    return {
      r: parseInt(n[0] + n[0], 16),
      g: parseInt(n[1] + n[1], 16),
      b: parseInt(n[2] + n[2], 16),
    }
  }
  if (n.length !== 6) return null
  const r = parseInt(n.slice(0, 2), 16)
  const g = parseInt(n.slice(2, 4), 16)
  const b = parseInt(n.slice(4, 6), 16)
  if ([r, g, b].some((v) => Number.isNaN(v))) return null
  return { r, g, b }
}

function rgbLuminance(rgb) {
  if (!rgb) return 0
  const lin = (c) => {
    const x = c / 255
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(rgb.r) + 0.7152 * lin(rgb.g) + 0.0722 * lin(rgb.b)
}

function hexLuminance(hex) {
  return rgbLuminance(hexToRgb(hex))
}

function mixHex(a, b, t) {
  const A = hexToRgb(a)
  const B = hexToRgb(b)
  if (!A || !B) return a
  const m = (x, y) => Math.round(x + (y - x) * t)
  return `#${[m(A.r, B.r), m(A.g, B.g), m(A.b, B.b)].map((n) => n.toString(16).padStart(2, '0')).join('')}`
}

/** Teams that traditionally feature athletic gold/yellow endzone lettering */
const GOLD_TEXT_TEAMS = new Set(['GB', 'PIT', 'WAS', 'MIN', 'LAR', 'KC'])

/**
 * Universal end zone styling for all 32 NFL teams.
 * Calibrates colors, lighting gradients, dynamic letter scaling, and outlines.
 */
export function resolveEndzoneDesign(side, fallbackColor = '#3f3f46', sideKey = 'left') {
  const abbrev = String(side?.abbrev || '').trim().toUpperCase()
  const catalog = NFL_TEAM_CATALOG.find((t) => t.abbrev === abbrev) || null

  // Mascot text resolution: side.mascot -> catalog names[1] -> last word of side.name -> abbrev
  let mascot = String(side?.mascot || catalog?.names?.[1] || '').trim().toUpperCase()
  if (!mascot) {
    const nameTokens = String(side?.name || '').trim().split(/\s+/)
    mascot = (nameTokens[nameTokens.length - 1] || abbrev).toUpperCase()
  }

  const primary = side?.color || catalog?.color || fallbackColor || '#3f3f46'
  const secondary = side?.color2 || catalog?.color2 || '#ffffff'

  // Turf wash luminance clamping:
  // Deep black / midnight navy teams (Raiders, Steelers, Bears, Texans) are lifted
  // to a rich slate so turf texture remains visible underneath without mud.
  let wash = primary
  const lum = hexLuminance(primary)
  if (lum < 0.02) {
    wash = mixHex(primary, '#ffffff', 0.20)
  }

  // 3-stop lighting gradient across the 3D stadium surface (subtle paint wash showing grass texture)
  const gradSheen = mixHex(wash, '#ffffff', 0.18)
  const gradMid = wash
  const gradDeep = mixHex(wash, '#000000', 0.16)

  // Typography calibration: dynamic size for word lengths from 4 to 10 characters
  // Calibrated for Impact athletic block typography to boldly span the end zone on mobile
  const len = mascot.length
  let fontSize = 58
  let letterSpacing = 5
  if (len <= 4) {
    fontSize = 72
    letterSpacing = 14
  } else if (len <= 6) {
    fontSize = 64
    letterSpacing = 8
  } else if (len <= 7) {
    fontSize = 58
    letterSpacing = 5
  } else if (len <= 8) {
    fontSize = 52
    letterSpacing = 4
  } else {
    // 9-10 letters (e.g. BUCCANEERS, COMMANDERS)
    fontSize = 44
    letterSpacing = 2.5
  }

  // Text fill and outline hierarchy
  const isGoldText = GOLD_TEXT_TEAMS.has(abbrev)
  const textFill = isGoldText
    ? (catalog?.color2 && hexLuminance(catalog.color2) > 0.35 ? catalog.color2 : '#FFB612')
    : '#ffffff'

  // Letter border stroke:
  // - Gold text gets team primary (e.g. Dark Green for Packers, Black for Steelers)
  // - White text gets vibrant team stroke (e.g. Falcons Red #A71930)
  let textStroke = primary
  if (isGoldText) {
    textStroke = primary
  } else if (hexLuminance(primary) > 0.05 && hexLuminance(primary) < 0.75) {
    textStroke = primary
  } else if (secondary && hexLuminance(secondary) > 0.05 && hexLuminance(secondary) < 0.75) {
    textStroke = secondary
  } else {
    textStroke = '#000000'
  }

  const isLeft = sideKey === 'left'
  const glyphs = computeEndzonePerspectiveGlyphs(mascot, isLeft)

  return {
    abbrev,
    mascot,
    wash,
    gradSheen,
    gradMid,
    gradDeep,
    fontSize,
    letterSpacing,
    textFill,
    textStroke,
    isGoldText,
    glyphs,
  }
}

/**
 * Computes individual letter glyph positions, 3D perspective depth scaling,
 * and ground-plane alignment for authentic stadium end zones.
 *
 * @param {string} mascot - Team mascot wordmark (e.g. "FALCONS", "PACKERS")
 * @param {boolean} isLeft - True for away/left endzone, false for home/right endzone
 * @returns {Array<{ char: string, transform: string, s: number, x: number, y: number }>}
 */
export function computeEndzonePerspectiveGlyphs(mascot, isLeft) {
  const text = String(mascot || '').trim().toUpperCase()
  const len = text.length
  if (!len) return []

  // Dynamic corridor bounds based on word length to fill the end zone space
  // Far sideline: y=191, Near sideline: y=478 (depth span: 287px)
  let yFar = 216
  let yNear = 454
  if (len <= 4) {
    yFar = 236
    yNear = 434
  } else if (len <= 6) {
    yFar = 222
    yNear = 448
  } else if (len <= 8) {
    yFar = 214
    yNear = 456
  } else {
    // 9-10 letters (e.g. BUCCANEERS, COMMANDERS)
    yFar = 206
    yNear = 464
  }

  const span = yNear - yFar
  // 3D perspective depth scale:
  // In true stadium perspective, the far endzone width is 71px and near width is 93px (ratio ~1.31)
  // Letters visibly shrink as they recede into the distance (towards yFar)
  const sFar = 0.62
  const sNear = 1.08
  const ratio = sNear / sFar // ~1.74

  const glyphs = []
  for (let i = 0; i < len; i++) {
    const char = text[i]
    // Word reading flow:
    // Right endzone (Packers): reads far-to-near (top-to-bottom), i=0 is at far sideline, i=len-1 is at near sideline
    // Left endzone (Falcons): reads near-to-far (bottom-to-top), i=0 is at near sideline, i=len-1 is at far sideline
    // so both have letter feet anchored along their respective goal lines, facing outward toward uprights.
    const u = isLeft
      ? (1 - (i + 0.5) / len)
      : (i + 0.5) / len

    // Project ground fraction u into screen perspective t
    const t = (Math.pow(ratio, u) - 1) / (ratio - 1)
    const y = yFar + t * span
    const s = sFar + t * (sNear - sFar)
    // 1.16 athletic height scale to fill end zone depth
    const sy = s * 1.16

    // End zone 3D centerline x-coordinate at this vertical level y:
    const tField = (y - 191) / 287
    const x = isLeft
      ? 203.5 * (1 - tField) + 114.5 * tField
      : 1059.5 * (1 - tField) + 1145.5 * tField

    // Rotation:
    // Left endzone: -90 deg rotation with +16.5 deg perspective shear matching left yard lines
    // Right endzone: +90 deg rotation with -16.0 deg perspective shear matching right yard lines
    const rot = isLeft ? -90 : 90
    const skew = isLeft ? 16.5 : -16.0

    const transform = `translate(${x.toFixed(1)}, ${y.toFixed(1)}) rotate(${rot}) skewY(${skew}) scale(${s.toFixed(3)}, ${sy.toFixed(3)})`
    glyphs.push({
      char,
      i,
      x: Number(x.toFixed(1)),
      y: Number(y.toFixed(1)),
      s: Number(s.toFixed(3)),
      transform,
    })
  }

  return glyphs
}

/** 3D Endzone boundary and typography paths (viewBox 0 0 1266 533) */
export const ENDZONE_COORDS = {
  left: {
    // Bounded by goal line (top 239, bot 161) and end line (top 168, bot 68)
    paintPath: 'M 239 191 L 168 191 L 68 478 L 161 478 Z',
    centerX: 159,
    centerY: 334.5,
    // Unified top-to-bottom reading with 3D perspective shear aligned with yard lines
    transform: 'translate(159, 334.5) rotate(90) skewY(16.5) scale(1, 1.15)',
  },
  right: {
    // Bounded by goal line (top 1023, bot 1098) and end line (top 1096, bot 1193)
    paintPath: 'M 1023 191 L 1096 191 L 1193 478 L 1098 478 Z',
    centerX: 1102.5,
    centerY: 334.5,
    // Unified top-to-bottom reading with 3D perspective shear aligned with yard lines
    transform: 'translate(1102.5, 334.5) rotate(90) skewY(-16.0) scale(1, 1.15)',
  },
}

/** 8 Corner Pylons with ground-plane perspective scaling */
export const CORNER_PYLONS = [
  // Left endzone corners: top-goal, top-back, bot-back, bot-goal
  { key: 'l-tg', x: 239, y: 191, isNear: false },
  { key: 'l-tb', x: 168, y: 191, isNear: false },
  { key: 'l-bb', x: 68, y: 478, isNear: true },
  { key: 'l-bg', x: 161, y: 478, isNear: true },
  // Right endzone corners: top-goal, top-back, bot-back, bot-goal
  { key: 'r-tg', x: 1023, y: 191, isNear: false },
  { key: 'r-tb', x: 1096, y: 191, isNear: false },
  { key: 'r-bb', x: 1193, y: 478, isNear: true },
  { key: 'r-bg', x: 1098, y: 478, isNear: true },
]
