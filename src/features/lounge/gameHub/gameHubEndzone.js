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
export function resolveEndzoneDesign(side, fallbackColor = '#3f3f46') {
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

  // Typography calibration: dynamic size & tracking for word lengths from 4 to 10 characters
  const len = mascot.length
  let fontSize = 35
  let letterSpacing = 5
  if (len <= 4) {
    fontSize = 42
    letterSpacing = 8
  } else if (len <= 6) {
    fontSize = 38
    letterSpacing = 6
  } else if (len <= 7) {
    fontSize = 35
    letterSpacing = 5
  } else if (len <= 8) {
    fontSize = 31
    letterSpacing = 4
  } else {
    // 9-10 letters (e.g. BUCCANEERS, COMMANDERS)
    fontSize = 27
    letterSpacing = 3
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
  }
}

/** 3D Endzone boundary and chalk paths (viewBox 0 0 1266 533) */
export const ENDZONE_COORDS = {
  left: {
    // Bounded by goal line (top 239, bot 161) and end line (top 168, bot 68)
    paintPath: 'M 239 191 L 168 191 L 68 478 L 161 478 Z',
    // Inset chalk frame ~2 yards inside perimeter
    chalkPath: 'M 230.5 201 L 176.5 201 L 79 468 L 150 468 Z',
    centerX: 159,
    centerY: 334.5,
    // Baseline parallel to goal line, 3D shear aligning crossbars with sidelines
    transform: 'translate(159, 334.5) rotate(90) skewY(16.5) scale(0.88, 0.62)',
  },
  right: {
    // Bounded by goal line (top 1023, bot 1098) and end line (top 1096, bot 1193)
    paintPath: 'M 1023 191 L 1096 191 L 1193 478 L 1098 478 Z',
    // Inset chalk frame ~2 yards inside perimeter
    chalkPath: 'M 1032 201 L 1087 201 L 1182 468 L 1109 468 Z',
    centerX: 1102.5,
    centerY: 334.5,
    // Baseline parallel to goal line, 3D shear aligning crossbars with sidelines
    transform: 'translate(1102.5, 334.5) rotate(-90) skewY(-16.0) scale(0.88, 0.62)',
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
