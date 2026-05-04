import { useCallback, useEffect, useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { format, parseISO } from 'date-fns'
import {
  BUFFALO_LINK_DEMO_SLUG,
  buffaloLinkGuideMarkdown,
} from './buffaloLinkGuideDemo'
import {
  PHOENIX_LINK_DEMO_SLUG,
  phoenixLinkGuideMarkdown,
} from './phoenixLinkGuideDemo'
import {
  STACK_UP_PAYS_DEMO_SLUG,
  stackUpPaysGuideMarkdown,
} from './stackUpPaysGuideDemo'
import {
  AGS_MHB_KNOWN_TITLES_LINE,
  AGS_MHB_SEARCH_KEYWORDS,
  AGS_MUST_HIT_BY_DEMO_SLUG,
  agsMustHitByGuideMarkdown,
} from './agsMustHitByGuideDemo'
import {
  IGT_MHB_KNOWN_TITLES_LINE,
  IGT_MHB_SEARCH_KEYWORDS,
  IGT_MUST_HIT_BY_DEMO_SLUG,
  igtMustHitByGuideMarkdown,
} from './igtMustHitByGuideDemo'
import {
  AINSWORTH_MHB_KNOWN_TITLES_LINE,
  AINSWORTH_MHB_SEARCH_KEYWORDS,
  AINSWORTH_MUST_HIT_BY_DEMO_SLUG,
  ainsworthMustHitByGuideMarkdown,
} from './mustHitByGuideDemo'
import { defaultCardGistForSlug } from '../../constants/slotCardGists'

function formatGuideDate(iso) {
  if (!iso) return '—'
  try {
    return format(typeof iso === 'string' ? parseISO(iso) : iso, 'MMM d, yyyy')
  } catch {
    return '—'
  }
}

/** Map DB \`machines.calculator_slug\` / slug → AppShell \`openCalculator\` keys. */
function resolveCalculatorKey(machine) {
  if (!machine) return null
  const { slug, calculator_slug: calc, has_calculator: has } = machine
  if (slug === 'buffalo-link' || calc === 'buffalo') return 'buffalo'
  if (slug === 'stack-up-pays' || calc === 'stack-up-pays') return 'stackup'
  if (slug === 'phoenix-link' || calc === 'phoenix-link') return 'phoenix'
  if (
    slug === 'ainsworth-must-hit-by' ||
    slug === 'ags-must-hit-by' ||
    slug === 'igt-must-hit-by' ||
    calc === 'mhb'
  ) {
    return 'mhb'
  }
  if (slug === 'cash-machine-lock' || calc === 'cash-machine-lock') return null
  if (has && calc === 'mhb') return 'mhb'
  if (has && calc && ['buffalo', 'stackup', 'phoenix', 'mhb'].includes(calc)) return calc
  return null
}

function mergeLocalGuideDemos(rows) {
  const base = [...(rows || [])]
  const slugs = new Set(base.map((r) => machineForGuide(r)?.slug).filter(Boolean))
  const extras = []

  if (!slugs.has(PHOENIX_LINK_DEMO_SLUG)) {
    extras.push({
      id: 'local-demo-phoenix-link',
      slug: 'phoenix-link',
      title: 'Phoenix Link',
      content_markdown: phoenixLinkGuideMarkdown,
      last_updated: null,
      created_at: null,
      updated_at: null,
      thumbnail_url: null,
      published: true,
      machines: {
        id: null,
        slug: PHOENIX_LINK_DEMO_SLUG,
        name: 'Phoenix Link',
        manufacturer: 'Aristocrat',
        type: 'Must-Hit-By',
        difficulty: 'Beginner',
        vegas_availability: 'Very Common',
        nerf_risk: 'Medium',
        has_calculator: false,
        calculator_slug: null,
        thumbnail_url: null,
        created_at: null,
        updated_at: null,
      },
    })
  }

  if (!slugs.has(BUFFALO_LINK_DEMO_SLUG)) {
    extras.push({
      id: 'local-demo-buffalo-link',
      slug: 'buffalo-link',
      title: 'Buffalo Link',
      content_markdown: buffaloLinkGuideMarkdown,
      last_updated: null,
      created_at: null,
      updated_at: null,
      thumbnail_url: null,
      published: true,
      machines: {
        id: null,
        slug: BUFFALO_LINK_DEMO_SLUG,
        name: 'Buffalo Link',
        manufacturer: 'Aristocrat',
        type: 'Persistent State',
        difficulty: 'Intermediate',
        vegas_availability: 'Very Common',
        nerf_risk: 'High',
        has_calculator: false,
        calculator_slug: null,
        thumbnail_url: null,
        created_at: null,
        updated_at: null,
      },
    })
  }

  if (!slugs.has(STACK_UP_PAYS_DEMO_SLUG)) {
    extras.push({
      id: 'local-demo-stack-up-pays',
      slug: 'stack-up-pays',
      title: 'Stack Up Pays (Ascending Fortunes)',
      content_markdown: stackUpPaysGuideMarkdown,
      last_updated: null,
      created_at: null,
      updated_at: null,
      thumbnail_url: null,
      published: true,
      machines: {
        id: null,
        slug: STACK_UP_PAYS_DEMO_SLUG,
        name: 'Stack Up Pays (Ascending Fortunes)',
        manufacturer: 'IGT',
        type: 'Persistent State',
        difficulty: 'Intermediate',
        vegas_availability: 'Very Common',
        nerf_risk: 'Medium',
        has_calculator: true,
        calculator_slug: 'stack-up-pays',
        thumbnail_url: null,
        created_at: null,
        updated_at: null,
      },
    })
  }

  if (!slugs.has(AINSWORTH_MUST_HIT_BY_DEMO_SLUG)) {
    extras.push({
      id: 'local-demo-ainsworth-must-hit-by',
      slug: 'ainsworth-must-hit-by',
      title: 'Ainsworth Must Hit By (Mystery Progressives)',
      content_markdown: ainsworthMustHitByGuideMarkdown,
      known_titles_line: AINSWORTH_MHB_KNOWN_TITLES_LINE,
      /** Client-only: substring search in AP Guides (not a Supabase column). */
      guide_search_text: AINSWORTH_MHB_SEARCH_KEYWORDS,
      last_updated: null,
      created_at: null,
      updated_at: null,
      thumbnail_url: null,
      published: true,
      machines: {
        id: null,
        slug: AINSWORTH_MUST_HIT_BY_DEMO_SLUG,
        name: 'Ainsworth Must Hit By',
        manufacturer: 'Ainsworth',
        type: 'Must-Hit-By Mystery Progressive',
        difficulty: 'Intermediate',
        vegas_availability: 'Common',
        nerf_risk: 'Medium',
        has_calculator: true,
        calculator_slug: 'mhb',
        thumbnail_url: null,
        created_at: null,
        updated_at: null,
      },
    })
  }

  if (!slugs.has(AGS_MUST_HIT_BY_DEMO_SLUG)) {
    extras.push({
      id: 'local-demo-ags-must-hit-by',
      slug: 'ags-must-hit-by',
      title: 'AGS Must Hit By (Mystery Progressives)',
      content_markdown: agsMustHitByGuideMarkdown,
      known_titles_line: AGS_MHB_KNOWN_TITLES_LINE,
      guide_search_text: AGS_MHB_SEARCH_KEYWORDS,
      last_updated: null,
      created_at: null,
      updated_at: null,
      thumbnail_url: null,
      published: true,
      machines: {
        id: null,
        slug: AGS_MUST_HIT_BY_DEMO_SLUG,
        name: 'AGS Must Hit By',
        manufacturer: 'AGS',
        type: 'Must-Hit-By Mystery Progressive',
        difficulty: 'Advanced',
        vegas_availability: 'Common',
        nerf_risk: 'High',
        has_calculator: true,
        calculator_slug: 'mhb',
        thumbnail_url: null,
        created_at: null,
        updated_at: null,
      },
    })
  }

  if (!slugs.has(IGT_MUST_HIT_BY_DEMO_SLUG)) {
    extras.push({
      id: 'local-demo-igt-must-hit-by',
      slug: 'igt-must-hit-by',
      title: 'IGT Must Hit By (Mystery / WMS-Style)',
      content_markdown: igtMustHitByGuideMarkdown,
      known_titles_line: IGT_MHB_KNOWN_TITLES_LINE,
      guide_search_text: IGT_MHB_SEARCH_KEYWORDS,
      last_updated: null,
      created_at: null,
      updated_at: null,
      thumbnail_url: null,
      published: true,
      machines: {
        id: null,
        slug: IGT_MUST_HIT_BY_DEMO_SLUG,
        name: 'IGT Must Hit By',
        manufacturer: 'IGT',
        type: 'Must-Hit-By Mystery Progressive',
        difficulty: 'Intermediate',
        vegas_availability: 'Very Common',
        nerf_risk: 'Medium',
        has_calculator: true,
        calculator_slug: 'mhb',
        thumbnail_url: null,
        created_at: null,
        updated_at: null,
      },
    })
  }

  const merged = [...extras, ...base]
  merged.sort((a, b) =>
    (a.machines?.name || a.title || '').localeCompare(b.machines?.name || b.title || '', undefined, {
      sensitivity: 'base',
    })
  )
  return merged
}

/** One-line operator cue — DB `guides.card_gist`, else catalog default from slug/type. */
function cardGistForRow(row) {
  const raw = typeof row.card_gist === 'string' ? row.card_gist.trim() : ''
  if (raw) return raw
  const m = machineForGuide(row)
  if (m?.slug) return defaultCardGistForSlug(m.slug, m.type)
  return TYPE_LINE_FALLBACK_GUIDE_HINT
}

const TYPE_LINE_FALLBACK_GUIDE_HINT = 'Verify +EV on the glass — open guide'

function makeGuideMarkdownComponents(machineSlug) {
  const h2Tone =
    machineSlug === 'phoenix-link'
      ? 'text-orange-100'
      : machineSlug === 'buffalo-link'
        ? 'text-amber-100'
        : machineSlug === 'stack-up-pays'
          ? 'text-cyan-100'
          : machineSlug === 'ainsworth-must-hit-by'
            ? 'text-violet-100'
            : machineSlug === 'ags-must-hit-by'
              ? 'text-rose-100'
              : machineSlug === 'igt-must-hit-by'
                ? 'text-sky-100'
                : 'text-amber-100'
  return {
    h2: ({ children }) => <h2 className={`text-lg font-black ${h2Tone} mt-6 first:mt-0 mb-2`}>{children}</h2>,
    h3: ({ children }) => <h3 className="text-base font-bold text-zinc-100 mt-4 mb-1.5">{children}</h3>,
    p: ({ children }) => <p className="text-zinc-300 leading-relaxed mb-3 last:mb-0">{children}</p>,
    ul: ({ children }) => <ul className="list-disc pl-5 space-y-1.5 text-zinc-300 mb-3">{children}</ul>,
    ol: ({ children }) => <ol className="list-decimal pl-5 space-y-1.5 text-zinc-300 mb-3">{children}</ol>,
    li: ({ children }) => <li className="leading-relaxed">{children}</li>,
    strong: ({ children }) => <strong className="text-white font-semibold">{children}</strong>,
    a: ({ href, children }) => (
      <a href={href} className="text-cyan-400 underline font-medium hover:text-cyan-300">
        {children}
      </a>
    ),
  }
}

function volatilityLabel(row) {
  const m = machineForGuide(row)
  if (!m) return '—'
  if (m.volatility_index) return m.volatility_index
  if (m.nerf_risk && m.difficulty) return `${m.difficulty} play / ${m.nerf_risk} nerf risk`
  return m.difficulty || m.nerf_risk || '—'
}

function popularityLabel(row) {
  const m = machineForGuide(row)
  if (!m) return '—'
  if (m.popularity_summary) return m.popularity_summary
  return m.vegas_availability || '—'
}

function defaultHeroSrc(machineSlug) {
  if (machineSlug === 'phoenix-link') return '/phoenix-link-logo.png'
  if (machineSlug === 'buffalo-link') return '/buffalo-icon.png'
  if (machineSlug === 'stack-up-pays') return '/stackup-icon.jpg'
  if (machineSlug === 'adventures-of-sinbad') return '/adventures-of-sinbad-hero.webp'
  if (machineSlug === 'ainsworth-must-hit-by') return '/ainsworth-must-hit-by-hero.png'
  if (machineSlug === 'ags-must-hit-by') return '/ags-must-hit-by-hero.png'
  if (machineSlug === 'igt-must-hit-by') return '/igt-must-hit-by-hero.png'
  return '/buffalo-icon.png'
}

/** Supabase may return `machines` as an object or a one-element array depending on FK metadata. */
function machineForGuide(row) {
  const m = row?.machines
  if (m == null) return null
  return Array.isArray(m) ? m[0] ?? null : m
}

/** Treat generic buffalo placeholder thumbs as “unset” so game-specific `defaultHeroSrc` wins. */
function normalizeGuideThumbUrl(url, machineSlug) {
  if (url == null || String(url).trim() === '') return null
  const u = String(url).trim()
  const isBuffaloIcon = u === '/buffalo-icon.png' || u.endsWith('/buffalo-icon.png')
  if (machineSlug && machineSlug !== 'buffalo-link' && isBuffaloIcon) return null
  return u
}

function heroImage(row) {
  const machine = machineForGuide(row)
  const ms = machine?.slug
  const g = normalizeGuideThumbUrl(row.thumbnail_url, ms)
  const mt = normalizeGuideThumbUrl(machine?.thumbnail_url, ms)
  return g || mt || defaultHeroSrc(ms)
}

function guideHeroImgOnError(e) {
  const el = e.currentTarget
  const slug = el.dataset.machineSlug || ''
  const def = defaultHeroSrc(slug)
  const defFile = def.replace(/^\//, '')
  if (el.dataset.heroStep === 'retry') {
    el.dataset.heroStep = 'buffalo'
    el.src = '/buffalo-icon.png'
    return
  }
  el.dataset.heroStep = 'retry'
  const cur = el.getAttribute('src') || ''
  if (defFile && cur.includes(defFile)) {
    el.dataset.heroStep = 'buffalo'
    el.src = '/buffalo-icon.png'
  } else {
    el.src = def
  }
}

function clamp255(v) {
  return Math.max(0, Math.min(255, Math.round(v)))
}

function rgbObjToRgb({ r, g, b }) {
  return { r: clamp255(r), g: clamp255(g), b: clamp255(b) }
}

function rgbToCss({ r, g, b }, a = 1) {
  const o = rgbObjToRgb({ r, g, b })
  return `rgba(${o.r},${o.g},${o.b},${a})`
}

/** Mix two linear RGB-ish triples (already 0–255 scale). */
function blendRgbTriple(a, b, t) {
  return rgbObjToRgb({
    r: a.r * (1 - t) + b.r * t,
    g: a.g * (1 - t) + b.g * t,
    b: a.b * (1 - t) + b.b * t,
  })
}

/** Returns [hue 0–1, saturation 0–1, lightness 0–1] */
function rgbToHslApprox(r, g, b) {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const L = (max + min) / 2
  if (Math.abs(max - min) < 1e-6) return [0, 0, L]
  const d = max - min
  const S = L > 0.5 ? d / (2 - max - min) : d / (max + min)
  let H = 0
  if (max === rn) H = (gn - bn) / d + (gn < bn ? 6 : 0)
  else if (max === gn) H = (bn - rn) / d + 2
  else H = (rn - gn) / d + 4
  H /= 6
  return [H, S, L]
}

/**
 * Sample saturated colors + overall tone from a loaded & same-origin drawable.
 * Cross-origin thumbnails (no CORS) throw when reading pixels — caller catches.
 */
function extractHeroPaletteFromImage(imgEl) {
  try {
    const rawSrc = imgEl.currentSrc || imgEl.src || ''
    if (/buffalo-icon\.png|phoenix-link-logo|stackup-icon|must-hit-by-hero/i.test(rawSrc)) return null
  } catch {
    /* ignore */
  }
  const wnat = imgEl.naturalWidth
  const hn = imgEl.naturalHeight
  if (!wnat || !hn || !imgEl.complete) return null
  const tw = 56
  const th = Math.max(28, Math.round((hn / wnat) * tw))
  const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null
  if (!canvas) return null
  canvas.width = tw
  canvas.height = th
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  ctx.drawImage(imgEl, 0, 0, tw, th)
  let data
  try {
    data = ctx.getImageData(0, 0, tw, th).data
  } catch {
    return null /* tainted canvas (cross-origin thumbnail) */
  }

  let vr = 0
  let vg = 0
  let vb = 0
  let vw = 0
  let mr = 0
  let mg = 0
  let mb = 0
  let mw = 0
  let ar = 0
  let ag = 0
  let ab = 0
  let nx = 0

  for (let i = 0; i < data.length; i += 4 * 6) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const aa = data[i + 3]
    if (aa < 140) continue
    const [, s, lum] = rgbToHslApprox(r, g, b)
    const satKick = Math.max(0, s - 0.06)
    const weight = satKick * satKick
    vr += r * weight
    vg += g * weight
    vb += b * weight
    vw += weight
    const midW = lum > 0.1 && lum < 0.92 ? 1 : 0.25
    mr += r * midW
    mg += g * midW
    mb += b * midW
    mw += midW
    ar += r
    ag += g
    ab += b
    nx += 1
  }

  if (!vw || !mw || !nx) return null

  const zincRef = { r: 23, g: 23, b: 25 }
  const vibrantRaw = rgbObjToRgb({ r: vr / vw, g: vg / vw, b: vb / vw })
  const mutedRaw = rgbObjToRgb({ r: mr / mw, g: mg / mw, b: mb / mw })
  const overallRaw = rgbObjToRgb({ r: ar / nx, g: ag / nx, b: ab / nx })

  const calm = blendRgbTriple(vibrantRaw, mutedRaw, 0.5)
  const cardEdge = blendRgbTriple(vibrantRaw, zincRef, 0.78)

  const pillBgRgb = blendRgbTriple(calm, zincRef, 0.82)
  return {
    /** Strong accent for glows */
    vibrant: vibrantRaw,
    /** Calmer mid used for washes */
    calm,
    muted: mutedRaw,
    overall: overallRaw,
    pillBg: rgbToCss(pillBgRgb, 0.72),
    pillBorder: rgbToCss(calm, 0.52),
    cardBorder: rgbToCss(cardEdge, 0.55),
    cardGlow: rgbToCss(vibrantRaw, 0.18),
    heroWash: rgbToCss(blendRgbTriple(vibrantRaw, overallRaw, 0.35), 0.38),
    heroWashSoft: rgbToCss(vibrantRaw, 0.12),
    gistAccent: rgbToCss(vibrantRaw, 0.55),
    gistGlow: rgbToCss(vibrantRaw, 0.22),
    accentPop: rgbToCss(vibrantRaw, 0.92),
  }
}

function heroGradientClass(machineSlug) {
  if (machineSlug === 'phoenix-link') return 'from-orange-950/80 via-zinc-900/40 to-zinc-950'
  if (machineSlug === 'stack-up-pays') return 'from-cyan-950/80 via-sky-950/40 to-zinc-950'
  if (machineSlug === 'adventures-of-sinbad') return 'from-amber-950/85 via-orange-950/35 to-zinc-950'
  if (machineSlug === 'ainsworth-must-hit-by') return 'from-violet-950/85 via-fuchsia-950/35 to-zinc-950'
  if (machineSlug === 'ags-must-hit-by') return 'from-rose-950/85 via-red-950/40 to-zinc-950'
  if (machineSlug === 'igt-must-hit-by') return 'from-sky-950/80 via-blue-950/45 to-zinc-950'
  return 'from-amber-900/40 to-zinc-950'
}

function cardAccent(machineSlug) {
  if (machineSlug === 'phoenix-link') {
    return {
      chevron: 'text-orange-500',
      strong: 'text-orange-100',
      subtitle: 'text-orange-200/90',
      expandedBorder: 'border-orange-500/50 shadow-lg shadow-orange-900/20',
    }
  }
  if (machineSlug === 'stack-up-pays') {
    return {
      chevron: 'text-cyan-500',
      strong: 'text-cyan-100',
      subtitle: 'text-cyan-200/90',
      expandedBorder: 'border-cyan-500/50 shadow-lg shadow-cyan-900/25',
    }
  }
  if (machineSlug === 'ainsworth-must-hit-by') {
    return {
      chevron: 'text-fuchsia-400',
      strong: 'text-violet-100',
      subtitle: 'text-fuchsia-200/90',
      expandedBorder: 'border-violet-500/50 shadow-lg shadow-fuchsia-950/30',
    }
  }
  if (machineSlug === 'ags-must-hit-by') {
    return {
      chevron: 'text-rose-400',
      strong: 'text-rose-100',
      subtitle: 'text-rose-200/90',
      expandedBorder: 'border-rose-500/50 shadow-lg shadow-rose-950/35',
    }
  }
  if (machineSlug === 'igt-must-hit-by') {
    return {
      chevron: 'text-sky-400',
      strong: 'text-sky-100',
      subtitle: 'text-sky-200/90',
      expandedBorder: 'border-sky-500/50 shadow-lg shadow-blue-950/30',
    }
  }
  return {
    chevron: 'text-amber-500',
    strong: 'text-amber-100',
    subtitle: 'text-amber-200/90',
    expandedBorder: 'border-amber-500/50 shadow-lg shadow-amber-900/20',
  }
}

const GUIDE_CARD_VARIANT_BY_SLUG = {
  'adventures-of-sinbad': 'aurora',
  'ags-must-hit-by': 'nova',
  'ainsworth-must-hit-by': 'violet',
  'aladdins-fortune': 'lamp',
  'aztec-banner': 'temple',
  'buffalo-ascension': 'trail',
}

function guideCardDesignVariant(slug) {
  return GUIDE_CARD_VARIANT_BY_SLUG[slug] ?? 'ember'
}

function StatPill({ emoji, children, className = '', palette }) {
  const tint =
    palette && typeof palette.pillBg === 'string'
      ? {
          backgroundColor: palette.pillBg,
          borderColor: palette.pillBorder,
          boxShadow: `inset 0 0 0 1px ${palette.heroWashSoft}`,
        }
      : undefined
  return (
    <span
      style={tint}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-semibold leading-tight text-zinc-100 bg-zinc-950/55 border-zinc-700/55 ${className}`.trim()}
    >
      <span className="opacity-90" aria-hidden>
        {emoji}
      </span>
      <span className="min-w-0 break-words">{children}</span>
    </span>
  )
}

function MetaDatesRow({ row, m }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-zinc-500">
      <span className="inline-flex items-center gap-1">
        <span aria-hidden>📝</span>
        <span>
          Added <span className="text-zinc-400">{formatGuideDate(row.created_at || m?.created_at)}</span>
        </span>
      </span>
      <span className="inline-flex items-center gap-1">
        <span aria-hidden>🔄</span>
        <span>
          Updated <span className="text-zinc-400">{formatGuideDate(row.updated_at || row.last_updated)}</span>
        </span>
      </span>
    </div>
  )
}

/** Softer card bodies: showcase layouts for selected slugs + fresh default for everyone else. */
function GuideCardMetaBlock({ variant, row, m, gistLine, accent, palette }) {
  const vol = volatilityLabel(row)
  const pop = popularityLabel(row)
  const typ = m?.type || '—'
  const yr = m?.release_year ?? '—'
  const known = row.known_titles_line

  const aura =
    palette && typeof palette.pillBorder === 'string'
      ? {
          borderColor: palette.pillBorder,
          boxShadow: `0 18px 55px -28px ${palette.gistGlow}`,
        }
      : undefined

  const gistBlock = (extraClass = '') => (
    <div style={aura} className={`rounded-2xl px-3.5 py-3 ${extraClass}`.trim()}>
      <p className={`text-sm leading-snug font-semibold ${accent.strong}`}>{gistLine}</p>
    </div>
  )

  const knownSoft = known ? (
    <p className="text-[12px] leading-snug text-zinc-400 italic px-0.5">
      <span aria-hidden>📋 </span>
      {known}
    </p>
  ) : null

  if (variant === 'aurora') {
    return (
      <div className="space-y-3">
        <div
          className="rounded-2xl bg-gradient-to-br from-amber-950/50 via-violet-950/25 to-cyan-950/20 border border-white/10 p-3 shadow-inner"
          style={
            palette?.pillBorder
              ? {
                  borderColor: palette.pillBorder,
                  boxShadow: `inset 0 1px 0 0 ${palette.heroWashSoft}, inset 0 -32px 52px -22px ${palette.heroWashSoft}`,
                }
              : undefined
          }
        >
          <div className="flex flex-wrap gap-2">
            <StatPill palette={palette} emoji="🌊" className="bg-white/10 border-white/10 backdrop-blur-sm">
              {vol}
            </StatPill>
            <StatPill palette={palette} emoji="👀" className="bg-white/10 border-white/10 backdrop-blur-sm">
              {pop}
            </StatPill>
            <StatPill palette={palette} emoji="🗺️" className="bg-white/10 border-white/10 backdrop-blur-sm">
              {typ}
            </StatPill>
            <StatPill palette={palette} emoji="📆" className="bg-white/10 border-white/10 backdrop-blur-sm">
              {yr}
            </StatPill>
          </div>
        </div>
        {knownSoft}
        <div
          className="rounded-2xl bg-zinc-950/60 border border-amber-400/20 px-3 py-3 relative overflow-hidden"
          style={
            palette?.gistGlow
              ? {
                  borderColor: palette.pillBorder,
                  boxShadow: `0 22px 54px -26px ${palette.gistGlow}`,
                  backgroundImage: palette.heroWash ? `linear-gradient(145deg, transparent 0%, transparent 55%, ${palette.heroWash} 155%)` : undefined,
                }
              : undefined
          }
        >
          <div className="absolute -right-6 -top-6 text-5xl opacity-20 pointer-events-none select-none" aria-hidden>
            ✨
          </div>
          <div className="flex gap-2 relative">
            <span className="text-xl shrink-0" aria-hidden>
              ⚓
            </span>
            <p className={`text-sm leading-snug ${accent.strong}`}>{gistLine}</p>
          </div>
        </div>
        <MetaDatesRow row={row} m={m} />
      </div>
    )
  }

  if (variant === 'nova') {
    return (
      <div className="space-y-3">
        <div
          className="-mx-1 rounded-2xl bg-gradient-to-r from-rose-950/35 via-zinc-950 to-rose-950/20 border border-rose-500/20 p-3"
          style={
            palette?.pillBorder
              ? {
                  borderColor: palette.pillBorder,
                  boxShadow: `inset 0 -30px 48px -28px ${palette.heroWashSoft}`,
                }
              : undefined
          }
        >
          <div className="flex gap-2 overflow-x-auto pb-1 snap-x snap-mandatory [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {[['🎯', vol], ['🔥', pop], ['🎰', typ], ['📅', yr]].map(([emoji, val], i) => (
              <StatPill palette={palette} key={i} emoji={emoji} className="snap-start shrink-0 border-rose-500/25 bg-rose-950/40">
                {val}
              </StatPill>
            ))}
          </div>
        </div>
        {knownSoft}
        <div
          className="rounded-2xl border border-rose-400/30 bg-gradient-to-br from-rose-950/40 to-zinc-950 px-3 py-3 shadow-lg shadow-rose-950/20 flex gap-2"
          style={
            palette?.gistGlow
              ? {
                  borderColor: palette.pillBorder,
                  boxShadow: `0 24px 60px -30px ${palette.gistGlow}, inset 0 0 0 1px ${palette.heroWashSoft}`,
                }
              : undefined
          }
        >
          <span className="text-lg shrink-0" aria-hidden>
            💥
          </span>
          <p className={`text-sm leading-snug ${accent.strong}`}>{gistLine}</p>
        </div>
        <MetaDatesRow row={row} m={m} />
      </div>
    )
  }

  if (variant === 'violet') {
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap gap-x-3 gap-y-2 text-[13px] text-zinc-200 items-center">
          <span
            className="inline-flex items-center gap-1 rounded-lg bg-fuchsia-950/35 px-2 py-1 border border-fuchsia-500/25"
            style={
              palette?.pillBg
                ? { backgroundColor: palette.pillBg, borderColor: palette.pillBorder }
                : undefined
            }
          >
            <span aria-hidden>🔮</span>
            <span className="font-semibold">{vol}</span>
          </span>
          <span className="text-zinc-600">·</span>
          <span className="inline-flex items-center gap-1">
            <span aria-hidden>🎡</span>
            <span>{pop}</span>
          </span>
          <span className="text-zinc-600">·</span>
          <span className="inline-flex items-center gap-1">
            <span aria-hidden>💠</span>
            <span>{typ}</span>
          </span>
          <span className="text-zinc-600">·</span>
          <span className="inline-flex items-center gap-1 text-zinc-300">
            <span aria-hidden>🕰️</span>
            <span className="font-medium">{yr}</span>
          </span>
        </div>
        {knownSoft}
        <div
          className="rounded-2xl ring-2 ring-fuchsia-500/35 ring-offset-2 ring-offset-zinc-900 bg-zinc-950/80 px-3.5 py-3 flex gap-2"
          style={
            palette?.gistAccent
              ? {
                  boxShadow: `0 0 0 2px ${palette.heroWashSoft}, 0 28px 64px -32px ${palette.gistGlow}`,
                }
              : undefined
          }
        >
          <span
            className="text-fuchsia-400 shrink-0"
            style={palette?.accentPop ? { color: palette.accentPop } : undefined}
            aria-hidden
          >
            ✦
          </span>
          <p className={`text-sm leading-snug ${accent.strong}`}>{gistLine}</p>
        </div>
        <MetaDatesRow row={row} m={m} />
      </div>
    )
  }

  if (variant === 'lamp') {
    return (
      <div className="space-y-3">
        <div
          className="rounded-2xl border border-amber-400/25 bg-gradient-to-br from-amber-900/25 via-zinc-950 to-yellow-950/20 px-3 py-3"
          style={
            palette?.pillBorder
              ? {
                  borderColor: palette.pillBorder,
                  boxShadow: `inset 0 -40px 56px -40px ${palette.heroWash}`,
                }
              : undefined
          }
        >
          <div className="grid grid-cols-2 gap-2">
            <div
              className="rounded-xl bg-black/25 px-2.5 py-2 flex items-start gap-2"
              style={palette?.pillBg ? { boxShadow: `inset 0 0 0 1px ${palette.heroWashSoft}` } : undefined}
            >
              <span className="text-lg" aria-hidden>
                🪔
              </span>
              <div>
                <div className="text-[11px] text-amber-200/75 font-medium">Swing</div>
                <div className="text-sm font-bold text-amber-50">{vol}</div>
              </div>
            </div>
            <div
              className="rounded-xl bg-black/25 px-2.5 py-2 flex items-start gap-2"
              style={palette?.pillBg ? { boxShadow: `inset 0 0 0 1px ${palette.heroWashSoft}` } : undefined}
            >
              <span className="text-lg" aria-hidden>
                👥
              </span>
              <div>
                <div className="text-[11px] text-amber-200/75 font-medium">Spots</div>
                <div className="text-sm font-bold text-amber-50 leading-snug">{pop}</div>
              </div>
            </div>
            <div
              className="rounded-xl bg-black/25 px-2.5 py-2 flex items-start gap-2 col-span-2 sm:col-span-1"
              style={palette?.pillBg ? { boxShadow: `inset 0 0 0 1px ${palette.heroWashSoft}` } : undefined}
            >
              <span className="text-lg" aria-hidden>
                🕌
              </span>
              <div>
                <div className="text-[11px] text-amber-200/75 font-medium">Format</div>
                <div className="text-sm font-semibold text-zinc-100">{typ}</div>
              </div>
            </div>
            <div
              className="rounded-xl bg-black/25 px-2.5 py-2 flex items-start gap-2 col-span-2 sm:col-span-1"
              style={palette?.pillBg ? { boxShadow: `inset 0 0 0 1px ${palette.heroWashSoft}` } : undefined}
            >
              <span className="text-lg" aria-hidden>
                ✳️
              </span>
              <div>
                <div className="text-[11px] text-amber-200/75 font-medium">Era</div>
                <div className="text-sm font-bold text-amber-50">{yr}</div>
              </div>
            </div>
          </div>
        </div>
        {knownSoft}
        <div
          className="border-l-[3px] border-amber-400/70 pl-3 py-1 flex gap-2"
          style={palette?.gistAccent ? { borderLeftColor: palette.accentPop } : undefined}
        >
          <span
            className="text-amber-300/90 text-lg shrink-0"
            style={palette?.accentPop ? { color: palette.accentPop } : undefined}
            aria-hidden
          >
            ✨
          </span>
          <p className={`text-sm leading-snug ${accent.strong}`}>{gistLine}</p>
        </div>
        <MetaDatesRow row={row} m={m} />
      </div>
    )
  }

  if (variant === 'temple') {
    return (
      <div className="space-y-3">
        <div className="flex flex-col items-center gap-2">
          <StatPill palette={palette} emoji="🗿" className="bg-emerald-950/35 border-emerald-500/30">
            {vol}
          </StatPill>
          <div className="flex flex-wrap justify-center gap-2 w-full">
            <StatPill palette={palette} emoji="🌴" className="bg-teal-950/30 border-teal-500/25">
              {pop}
            </StatPill>
            <StatPill palette={palette} emoji="🎴" className="bg-teal-950/30 border-teal-500/25">
              {typ}
            </StatPill>
          </div>
          <StatPill palette={palette} emoji="☀️" className="bg-emerald-950/35 border-emerald-500/30 opacity-95">
            {yr}
          </StatPill>
        </div>
        {knownSoft}
        <div
          className="rounded-2xl bg-gradient-to-t from-emerald-950/25 to-zinc-950 border-t-2 border-emerald-400/35 px-3 py-3"
          style={
            palette?.gistGlow
              ? {
                  borderTopColor: palette.pillBorder,
                  boxShadow: `0 -16px 48px -26px ${palette.gistGlow}`,
                }
              : undefined
          }
        >
          <p className={`text-sm leading-snug ${accent.strong}`}>{gistLine}</p>
        </div>
        <MetaDatesRow row={row} m={m} />
      </div>
    )
  }

  if (variant === 'trail') {
    return (
      <div className="space-y-3">
        <div
          className="relative rounded-2xl overflow-hidden border border-amber-800/40"
          style={
            palette?.pillBorder ? { borderColor: palette.cardBorder || palette.pillBorder } : undefined
          }
        >
          <div className="absolute inset-0 bg-gradient-to-br from-amber-600/10 via-transparent to-sky-500/10" />
          <div className="relative flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-3 text-[13px]">
            <span className="text-lg" aria-hidden>
              🦬
            </span>
            <span className="text-zinc-500">—</span>
            <span className="font-bold text-white">{vol}</span>
            <span className="text-amber-500/70">›</span>
            <span className="text-zinc-300">{pop}</span>
            <span className="text-amber-500/70">›</span>
            <span className="text-zinc-400">{typ}</span>
            <span className="text-amber-500/70">›</span>
            <span className="text-zinc-200 font-semibold">{yr}</span>
            <span className="text-amber-400/90 text-[10px] font-black tracking-[0.3em] ml-auto uppercase"> Ascent </span>
          </div>
        </div>
        {knownSoft}
        <div
          className="rounded-2xl bg-zinc-950/70 px-3 py-3 border border-zinc-800 flex gap-3"
          style={
            palette?.gistGlow
              ? { borderColor: palette.pillBorder, boxShadow: `0 20px 54px -30px ${palette.gistGlow}` }
              : undefined
          }
        >
          <span className="text-2xl shrink-0 select-none">⛰️</span>
          <p className={`text-sm leading-snug ${accent.strong}`}>{gistLine}</p>
        </div>
        <MetaDatesRow row={row} m={m} />
      </div>
    )
  }

  /* ember — default modern layout */
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <StatPill palette={palette} emoji="⚡">{vol}</StatPill>
        <StatPill palette={palette} emoji="📍">{pop}</StatPill>
        <StatPill palette={palette} emoji="🎰">{typ}</StatPill>
        <StatPill palette={palette} emoji="📅">{String(yr)}</StatPill>
      </div>
      {knownSoft}
      {gistBlock('bg-zinc-950/45 border border-zinc-800/70 shadow-sm')}
      <MetaDatesRow row={row} m={m} />
    </div>
  )
}

function AskCommunityModal({ open, onClose, guideRow, supabaseClient, onPosted }) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const gameTitle = guideRow?.machines?.name || guideRow?.title || 'Game'
  const gameSlug = guideRow?.machines?.slug || guideRow?.slug || ''

  useEffect(() => {
    if (open) {
      setTitle('')
      setBody('')
      setErr('')
    }
  }, [open, guideRow?.id])

  if (!open || !guideRow) return null

  const submit = async (e) => {
    e.preventDefault()
    setErr('')
    if (!body.trim()) {
      setErr('Write your question in the details box.')
      return
    }
    setBusy(true)
    try {
      const {
        data: { session },
      } = await supabaseClient.auth.getSession()
      if (!session?.user) {
        setErr('You must be signed in to post to the feed.')
        setBusy(false)
        return
      }

      const header = `Guide: **${gameTitle}** (${gameSlug || 'no slug'})\nManufacturer: ${guideRow.machines?.manufacturer || '—'}\n`
      const postTitle = (title.trim() || `Question · ${gameTitle}`).slice(0, 200)
      const postBody = `${header}\n---\n\n${body.trim()}`

      const { error } = await supabaseClient.from('community_feed_posts').insert({
        game_slug: gameSlug || null,
        game_title: gameTitle,
        title: postTitle,
        body: postBody,
      })

      if (error) {
        if (error.message?.includes('relation') || error.code === '42P01') {
          setErr(
            'Home feed table is not set up yet. Run `supabase/community_feed_posts.sql` in the Supabase SQL editor, then try again.'
          )
        } else {
          setErr(error.message || 'Could not post.')
        }
        setBusy(false)
        return
      }

      onPosted?.()
      onClose()
    } catch (ex) {
      setErr(ex?.message || 'Could not post.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center p-4 bg-black/60" role="dialog" aria-modal>
      <button type="button" className="absolute inset-0 z-0 cursor-default" aria-label="Close" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-3xl bg-zinc-900 border border-zinc-700 shadow-2xl max-h-[90dvh] overflow-hidden flex flex-col">
        <div className="p-5 border-b border-zinc-800 shrink-0">
          <div className="text-white font-bold text-lg">Ask the community</div>
          <div className="text-zinc-400 text-sm mt-1">
            Posts to the <span className="text-cyan-300 font-semibold">Home</span> feed with this game tagged.
          </div>
          <div className="mt-3 rounded-2xl bg-zinc-800/80 px-3 py-2 text-sm text-amber-100 font-semibold">{gameTitle}</div>
        </div>
        <form onSubmit={submit} className="p-5 flex flex-col gap-3 min-h-0 flex-1 overflow-y-auto">
          <label className="block">
            <span className="text-zinc-400 text-xs font-semibold uppercase tracking-wide">Subject (optional)</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full min-h-12 rounded-2xl bg-zinc-950 border border-zinc-700 px-4 py-3 text-white text-base focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
              placeholder={`e.g. Denom on ${gameTitle} majors`}
            />
          </label>
          <label className="block flex-1 min-h-[8rem]">
            <span className="text-zinc-400 text-xs font-semibold uppercase tracking-wide">Your question</span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={6}
              className="mt-1 w-full rounded-2xl bg-zinc-950 border border-zinc-700 px-4 py-3 text-white text-base focus:outline-none focus:ring-2 focus:ring-cyan-500/40 resize-y min-h-[10rem]"
              required
              placeholder="Context, casino, photos you saw on the glass, what you need verified…"
            />
          </label>
          {err ? <div className="text-red-300 text-sm leading-relaxed">{err}</div> : null}
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 min-h-12 rounded-2xl bg-zinc-800 text-zinc-100 font-bold touch-manipulation"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="flex-1 min-h-12 rounded-2xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-bold touch-manipulation"
            >
              {busy ? 'Posting…' : 'Post to Home'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function GuidesScreen({ supabaseClient, onOpenCalculator, onNavigateHome, onCommunityPosted }) {
  const [query, setQuery] = useState('')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState('')
  const [expandedSlug, setExpandedSlug] = useState(null)
  const [askFor, setAskFor] = useState(null)
  /** Sampled from hero bitmap (same-origin only); cross-origin thumbs skip extraction. */
  const [heroPalettes, setHeroPalettes] = useState(() => ({}))

  const load = useCallback(async () => {
    setLoading(true)
    setLoadErr('')
    try {
      const { data, error } = await supabaseClient.from('guides').select(`
          id,
          slug,
          title,
          content_markdown,
          card_gist,
          last_updated,
          created_at,
          updated_at,
          thumbnail_url,
          published,
          machines (
            id,
            slug,
            name,
            manufacturer,
            type,
            difficulty,
            vegas_availability,
            nerf_risk,
            has_calculator,
            calculator_slug,
            thumbnail_url,
            created_at,
            updated_at,
            release_year,
            volatility_index,
            popularity_summary
          )
        `)
        .eq('published', true)
        .order('title')

      if (error) {
        const missingOptionalCols =
          error.message?.includes('volatility_index') ||
          error.message?.includes('popularity_summary') ||
          error.message?.includes('card_gist') ||
          error.message?.includes('release_year')
        if (missingOptionalCols) {
          const { data: d2, error: e2 } = await supabaseClient
            .from('guides')
            .select(
              `
              id,
              slug,
              title,
              content_markdown,
              last_updated,
              created_at,
              updated_at,
              thumbnail_url,
              published,
              machines (
                id,
                slug,
                name,
                manufacturer,
                type,
                difficulty,
                vegas_availability,
                nerf_risk,
                has_calculator,
                calculator_slug,
                thumbnail_url,
                created_at,
                updated_at
              )
            `
            )
            .eq('published', true)
            .order('title')
          if (e2) throw e2
          setRows(mergeLocalGuideDemos(d2 || []))
        } else {
          throw error
        }
      } else {
        setRows(mergeLocalGuideDemos(data || []))
      }
    } catch (e) {
      setLoadErr(e?.message || 'Could not load guides.')
      setRows(mergeLocalGuideDemos([]))
    } finally {
      setLoading(false)
    }
  }, [supabaseClient])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) => {
      const mx = machineForGuide(r)
      const name = (mx?.name || '').toLowerCase()
      const title = (r.title || '').toLowerCase()
      const slug = (r.slug || '').toLowerCase()
      const manu = (mx?.manufacturer || '').toLowerCase()
      const typ = (mx?.type || '').toLowerCase()
      const keywords = (r.guide_search_text || '').toLowerCase()
      const body = (r.content_markdown || '').toLowerCase()
      return (
        name.includes(q) ||
        title.includes(q) ||
        slug.includes(q) ||
        manu.includes(q) ||
        typ.includes(q) ||
        keywords.includes(q) ||
        body.includes(q)
      )
    })
  }, [rows, query])

  return (
    <div className="max-w-lg mx-auto px-4 py-6 pt-[max(0.5rem,env(safe-area-inset-top))] pb-24">
      <div className="mb-5">
        <div className="text-white text-2xl font-black tracking-tight">AP Guides</div>
        <div className="text-zinc-400 text-sm mt-0.5">+EV quick read · expand for full playbook</div>
      </div>

      <label className="block mb-5">
        <span className="sr-only">Search guides</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search slot name…"
          className="w-full min-h-12 rounded-2xl bg-zinc-900 border border-zinc-700 px-4 py-3 text-white text-base placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
          enterKeyHint="search"
        />
      </label>

      {loadErr ? (
        <div className="mb-4 rounded-2xl border border-amber-700/50 bg-amber-950/30 px-4 py-3 text-amber-100 text-sm">{loadErr}</div>
      ) : null}

      {loading ? (
        <div className="text-zinc-500 text-sm py-8 text-center">Loading guides…</div>
      ) : filtered.length === 0 ? (
        <div className="text-zinc-500 text-sm py-8 text-center">No guides match that search.</div>
      ) : (
        <ul className="space-y-5 list-none p-0 m-0">
          {filtered.map((row) => {
            const m = machineForGuide(row)
            const slug = m?.slug || row.slug
            const expanded = expandedSlug === slug
            const calcKey = resolveCalculatorKey(m)
            const gistLine = cardGistForRow(row)
            const accent = cardAccent(slug)
            const cardVariant = guideCardDesignVariant(slug)
            const heroPalette = heroPalettes[slug] ?? null
            const ringFocus =
              slug === 'phoenix-link'
                ? 'focus-visible:ring-orange-500/60'
                : slug === 'stack-up-pays'
                  ? 'focus-visible:ring-cyan-500/60'
                  : slug === 'ainsworth-must-hit-by'
                    ? 'focus-visible:ring-violet-500/60'
                    : slug === 'ags-must-hit-by'
                      ? 'focus-visible:ring-rose-500/60'
                      : slug === 'igt-must-hit-by'
                        ? 'focus-visible:ring-sky-500/60'
                        : 'focus-visible:ring-amber-500/60'

            return (
              <li key={row.id || row.slug}>
                <article
                  className={`rounded-3xl border overflow-hidden transition-shadow bg-zinc-900 ${
                    expanded ? accent.expandedBorder : heroPalette?.cardBorder ? '' : 'border-zinc-800'
                  }`}
                  style={
                    heroPalette && !expanded
                      ? {
                          borderColor: heroPalette.cardBorder,
                          boxShadow: `0 12px 40px -14px ${heroPalette.cardGlow}`,
                        }
                      : heroPalette && expanded
                        ? { boxShadow: `0 18px 50px -16px ${heroPalette.cardGlow}` }
                        : undefined
                  }
                >
                  <button
                    type="button"
                    onClick={() => setExpandedSlug((s) => (s === slug ? null : slug))}
                    className={`w-full text-left touch-manipulation focus:outline-none focus-visible:ring-2 ${ringFocus}`}
                    aria-expanded={expanded}
                  >
                    <div className={`relative h-28 w-full bg-gradient-to-br ${heroGradientClass(slug)}`}>
                      <img
                        src={heroImage(row)}
                        alt=""
                        className="h-full w-full object-cover opacity-95"
                        data-machine-slug={slug}
                        onError={guideHeroImgOnError}
                        onLoad={(e) => {
                          const pal = extractHeroPaletteFromImage(e.currentTarget)
                          if (pal) setHeroPalettes((prev) => ({ ...prev, [slug]: pal }))
                        }}
                      />
                      {heroPalette?.heroWash ? (
                        <div
                          aria-hidden
                          className="pointer-events-none absolute inset-0"
                          style={{
                            background: `linear-gradient(180deg, ${heroPalette.heroWashSoft} 0%, transparent 40%, ${heroPalette.heroWash} 100%)`,
                          }}
                        />
                      ) : null}
                      <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/20 to-transparent" />
                      <div className="absolute bottom-3 left-4 right-4">
                        <h2 className="text-white font-black text-xl tracking-tight drop-shadow-md">{m?.name || row.title}</h2>
                        <div className={`${accent.subtitle} text-[11px] font-semibold mt-0.5`}>{m?.manufacturer || '—'}</div>
                      </div>
                    </div>

                    <div className="p-4 space-y-3">
                      <GuideCardMetaBlock
                        variant={cardVariant}
                        row={row}
                        m={m}
                        gistLine={gistLine}
                        accent={accent}
                        palette={heroPalette}
                      />

                      <div className="flex items-center gap-2 text-zinc-500 text-xs font-medium pt-1">
                        <span aria-hidden>👆</span>
                        <span>{expanded ? 'Tap to collapse' : 'Tap for full guide'}</span>
                      </div>
                    </div>
                  </button>

                  <div className="px-4 pb-4 flex flex-col gap-2 border-t border-zinc-800/80 pt-3 -mt-px">
                    <div className="flex gap-2">
                      {calcKey ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            onOpenCalculator(calcKey)
                          }}
                          className="flex-1 min-h-11 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold touch-manipulation"
                        >
                          Open calculator
                        </button>
                      ) : (
                        <div className="flex-1 min-h-11 rounded-2xl bg-zinc-800 text-zinc-500 text-sm font-bold flex items-center justify-center">
                          No calc yet
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setAskFor(row)
                        }}
                        className="flex-1 min-h-11 rounded-2xl bg-cyan-700 hover:bg-cyan-600 text-white text-sm font-bold touch-manipulation"
                      >
                        Ask community
                      </button>
                    </div>
                  </div>

                  {expanded ? (
                    <div
                      style={heroPalette ? { borderTopColor: heroPalette.cardBorder } : undefined}
                      className="border-t border-zinc-800 px-4 py-5 bg-zinc-950/90 text-sm max-w-none"
                    >
                      <ReactMarkdown components={makeGuideMarkdownComponents(slug)}>
                        {row.content_markdown || ''}
                      </ReactMarkdown>
                    </div>
                  ) : null}
                </article>
              </li>
            )
          })}
        </ul>
      )}

      <AskCommunityModal
        open={!!askFor}
        guideRow={askFor}
        onClose={() => setAskFor(null)}
        supabaseClient={supabaseClient}
        onPosted={() => {
          onCommunityPosted?.()
          onNavigateHome?.()
        }}
      />
    </div>
  )
}
