import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
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
import { defaultCardEvThresholdForSlug } from '../../constants/slotCardEvThreshold'

/** Calculator / generic placeholder art for Buffalo Link — also used when a guide hero fails to load. */
const BUFFALO_PLACEHOLDER_SRC = '/guides/buffalo-link/buffalo-link-calculator-icon.webp'

function formatGuideDate(iso) {
  if (!iso) return '—'
  try {
    return format(typeof iso === 'string' ? parseISO(iso) : iso, 'MMM d, yyyy')
  } catch {
    return '—'
  }
}

function IconCalendar({ className }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path
        d="M5.5 3.25v1.5m9-1.5v1.5m-10.25 3h10.5m-12 0v7.5a1.5 1.5 0 001.5 1.5h11a1.5 1.5 0 001.5-1.5v-7.5m-14 0v-1.5a1.5 1.5 0 011.5-1.5h11a1.5 1.5 0 011.5 1.5v1.5m-14 0h14"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function IconClock({ className }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <circle cx="10" cy="10" r="6.25" stroke="currentColor" strokeWidth="1.25" />
      <path
        d="M10 7v3.25l2.25 1.25"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function IconChevronFold({ expanded, className }) {
  return (
    <svg
      className={className}
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      {expanded ? (
        <path
          d="M5 12.5l5-5 5 5"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : (
        <path
          d="M5 7.5l5 5 5-5"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  )
}

/** Shipped with the app when Supabase has no published row for that slug yet (see `mergeLocalGuideDemos`). */
function isLocalDemoGuide(row) {
  return typeof row?.id === 'string' && row.id.startsWith('local-demo-')
}

/** Map DB \`machines.calculator_slug\` / slug → AppShell \`openCalculator\` keys. */
function resolveCalculatorKey(machine) {
  if (!machine) return null
  const { slug, calculator_slug: calc, has_calculator: has } = machine
  if (slug === 'buffalo-link' || slug === 'lightning-buffalo-link' || calc === 'buffalo') return 'buffalo'
  if (slug === 'stack-up-pays' || calc === 'stack-up-pays') return 'stackup'
  if (slug === 'phoenix-link' || calc === 'phoenix-link') return 'phoenix'
  if (
    slug === 'ainsworth-must-hit-by' ||
    slug === 'must-hit-by-aig' ||
    slug === 'ags-must-hit-by' ||
    slug === 'must-hit-by-ags' ||
    slug === 'igt-must-hit-by' ||
    slug === 'must-hit-by-igt' ||
    calc === 'mhb'
  ) {
    return 'mhb'
  }
  if (slug === 'cash-machine-lock' || calc === 'cash-machine-lock') return null
  if (has && calc === 'mhb') return 'mhb'
  if (has && calc && ['buffalo', 'stackup', 'phoenix', 'mhb'].includes(calc)) return calc
  return null
}

/**
 * Prefer one Published row per must-hit vendor when both legacy (`must-hit-by-*`) and canonical (`*-must-hit-by`) guides exist from older syncs / migrations.
 */
function dedupeMustHitByAliasRows(rows) {
  const list = [...(rows || [])]
  const embed = (r) => {
    const m = r?.machines
    if (m == null) return null
    return Array.isArray(m) ? m[0] ?? null : m
  }
  const vendorFamilyOf = (r) => {
    const ms = (embed(r)?.slug || '').trim()
    const gs = typeof r.slug === 'string' ? r.slug.trim() : ''
    const slugSet = new Set([ms, gs].filter(Boolean))
    if (slugSet.has('ags-must-hit-by') || slugSet.has('must-hit-by-ags')) return 'ags'
    if (slugSet.has('igt-must-hit-by') || slugSet.has('must-hit-by-igt')) return 'igt'
    if (slugSet.has('ainsworth-must-hit-by') || slugSet.has('must-hit-by-aig')) return 'ainsworth'
    return ''
  }
  const canonicalSlug = (fam) =>
    fam === 'ags'
      ? 'ags-must-hit-by'
      : fam === 'igt'
        ? 'igt-must-hit-by'
        : 'ainsworth-must-hit-by'
  /** Order rows so we keep canonical slug machines when scores tie / no updated_at drift. */
  const scoreRowForFamily = (r, fam) => {
    const ms = (embed(r)?.slug || '').trim()
    const gs = typeof r.slug === 'string' ? r.slug.trim() : ''
    const want = canonicalSlug(fam)
    let s = ms === want || gs === want ? 100 : 60
    if (fam === 'ags' && (ms === 'must-hit-by-ags' || gs === 'must-hit-by-ags')) s -= 1
    if (fam === 'igt' && (ms === 'must-hit-by-igt' || gs === 'must-hit-by-igt')) s -= 1
    if (fam === 'ainsworth' && (ms === 'must-hit-by-aig' || gs === 'must-hit-by-aig')) s -= 1
    return s
  }
  /** @type {Map<string, { row: (typeof list)[number]; score: number }>} */
  const best = new Map()
  for (const r of list) {
    const fam = vendorFamilyOf(r)
    if (!fam) continue
    const sc = scoreRowForFamily(r, fam)
    const prev = best.get(fam)
    if (
      !prev ||
      sc > prev.score ||
      (sc === prev.score &&
        String(r.updated_at || '') > String((prev.row && prev.row.updated_at) || ''))
    ) {
      best.set(fam, { row: r, score: sc })
    }
  }
  return list.filter((r) => {
    const fam = vendorFamilyOf(r)
    if (!fam) return true
    return best.get(fam)?.row === r
  })
}

function mergeLocalGuideDemos(rows) {
  const base = dedupeMustHitByAliasRows([...(rows || [])])
  /** Suppress a bundled demo if *either* the linked machine slug or this guide's `guides.slug` is present — avoids doubling when FK join fails or slug lives only on the guide row. */
  const slugs = new Set()
  for (const r of base) {
    const ms = machineForGuide(r)?.slug
    const gs = typeof r.slug === 'string' ? r.slug.trim() : ''
    if (ms) slugs.add(ms)
    if (gs) slugs.add(gs)
  }
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
        type: 'Must Hit By',
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

  if (!slugs.has(AINSWORTH_MUST_HIT_BY_DEMO_SLUG) && !slugs.has('must-hit-by-aig')) {
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
        type: 'Must Hit By Mystery Progressive',
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

  if (!slugs.has(AGS_MUST_HIT_BY_DEMO_SLUG) && !slugs.has('must-hit-by-ags')) {
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
        type: 'Must Hit By Mystery Progressive',
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

  if (!slugs.has(IGT_MUST_HIT_BY_DEMO_SLUG) && !slugs.has('must-hit-by-igt')) {
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
        type: 'Must Hit By Mystery Progressive',
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

/** One-line +EV threshold — DB `guides.card_ev_threshold` (legacy `card_gist`), else catalog default from slug/type. */
function cardEvThresholdForRow(row) {
  const fromNew = typeof row.card_ev_threshold === 'string' ? row.card_ev_threshold.trim() : ''
  if (fromNew) return fromNew
  const legacy = typeof row.card_gist === 'string' ? row.card_gist.trim() : ''
  if (legacy) return legacy
  const m = machineForGuide(row)
  if (m?.slug) return defaultCardEvThresholdForSlug(m.slug, m.type)
  return TYPE_LINE_FALLBACK_GUIDE_HINT
}

const TYPE_LINE_FALLBACK_GUIDE_HINT = 'Verify +EV on the glass — open guide'

function makeGuideMarkdownComponents(machineSlug) {
  const h2Tone =
    machineSlug === 'phoenix-link'
      ? 'text-orange-100'
      : machineSlug === 'lightning-buffalo-link'
        ? 'text-indigo-100'
      : machineSlug === 'buffalo-link'
        ? 'text-amber-100'
        : machineSlug === 'stack-up-pays'
          ? 'text-cyan-100'
          : machineSlug === 'aladdins-fortune'
            ? 'text-emerald-100'
            : machineSlug === 'aztec-banner'
              ? 'text-lime-100'
              : machineSlug === 'pegasus-banner'
                ? 'text-sky-100'
          : machineSlug === 'ainsworth-must-hit-by' || machineSlug === 'must-hit-by-aig'
            ? 'text-violet-100'
            : machineSlug === 'ags-must-hit-by' || machineSlug === 'must-hit-by-ags'
              ? 'text-rose-100'
              : machineSlug === 'igt-must-hit-by' || machineSlug === 'must-hit-by-igt'
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
    img: ({ src, alt }) => (
      <img
        src={src}
        alt={alt ?? ''}
        className="max-w-full h-auto rounded-xl border border-zinc-800/90 my-4 block"
        loading="lazy"
        decoding="async"
      />
    ),
  }
}

function volatilityLabel(row) {
  const m = machineForGuide(row)
  if (!m) return '—'
  const viRaw = m.volatility_index
  const vi = typeof viRaw === 'string' ? viRaw.trim() : viRaw
  if (vi != null && vi !== '') return typeof viRaw === 'string' ? vi : String(vi)
  if (m.nerf_risk && m.difficulty) return `${m.difficulty} play / ${m.nerf_risk} nerf risk`
  return m.difficulty || m.nerf_risk || '—'
}

function popularityLabel(row) {
  const m = machineForGuide(row)
  if (!m) return '—'
  if (m.popularity_summary) return m.popularity_summary
  return m.vegas_availability || '—'
}

/** 1–5 ⚡ from volatility copy (custom index, label, or machine fields). */
function volatilityLightningCount(row) {
  const m = machineForGuide(row)
  if (!m) return 3
  const label = volatilityLabel(row)
  const blob = `${m.volatility_index || ''} ${label}`.toLowerCase()

  if (/\bmed-?high\b|\bmedium[- ]high\b/.test(blob)) return 4
  if (/\blow[- –]medium\b/.test(blob)) return 2
  if (/\bhigh\b/.test(blob)) return 5
  if (/\bmedium\b/.test(blob)) return 3
  if (/\blow\b/.test(blob)) return 1

  const nerf = String(m.nerf_risk || '')
    .toLowerCase()
    .trim()
  if (nerf === 'high') return 5
  if (nerf === 'medium') return 3
  if (nerf === 'low') return 2

  const diff = String(m.difficulty || '')
    .toLowerCase()
    .trim()
  if (diff === 'advanced') return 4
  if (diff === 'beginner') return 2
  if (diff === 'intermediate') return 3

  return 3
}

/** 1–5 🔥 from floor-presence wording (`popularity_summary` / `vegas_availability`). */
function popularityFireCount(row) {
  const m = machineForGuide(row)
  if (!m) return 3
  const haystack = `${m.popularity_summary || ''} ${m.vegas_availability || ''} ${popularityLabel(row)}`.toLowerCase()

  if (haystack.includes('extremely common')) return 5
  if (haystack.includes('abundant')) return 4
  if (haystack.includes('very common')) return 4
  if (haystack.includes('uncommon')) return 2
  if (haystack.includes('rare')) return 1
  if (haystack.includes('common')) return 3

  return 3
}

function lightningMeter(count) {
  const n = Math.min(5, Math.max(1, count))
  return '⚡'.repeat(n)
}

function fireMeter(count) {
  const n = Math.min(5, Math.max(1, count))
  return '🔥'.repeat(n)
}

function IconEvTrendingUp({ className }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path
        d="M3.5 13.5L8.25 8.75l2.75 2.75 5-6"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12.25 5.25h4.5v4.5"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function GuideEvThresholdPanel({ line, accent }) {
  return (
    <div className={accent.evTablesBox}>
      <div className={`flex items-center gap-2 ${accent.evTablesHead}`}>
        <IconEvTrendingUp className="h-3.5 w-3.5 shrink-0 opacity-90" />
        <span className="text-[10px] font-semibold uppercase tracking-[0.2em]">+EV Threshold</span>
      </div>
      <div className={`relative mt-2 border-l-2 pl-3 ${accent.evTablesRule}`}>
        <p className={`text-base font-normal leading-snug ${accent.strong}`}>{line}</p>
      </div>
    </div>
  )
}

function defaultHeroSrc(machineSlug) {
  if (machineSlug === 'buffalo-link') return '/guides/buffalo-link/hero.webp'
  if (machineSlug === 'lightning-buffalo-link') return '/guides/lightning-buffalo-link/hero.webp'
  if (machineSlug === 'phoenix-link') return '/guides/phoenix-link/hero.webp'
  if (machineSlug === 'stack-up-pays') return '/guides/stack-up-pays/hero.webp'
  if (machineSlug === 'adventures-of-sinbad') return '/guides/adventures-of-sinbad/hero.webp'
  if (machineSlug === 'aladdins-fortune') return '/guides/aladdins-fortune/hero.webp'
  if (machineSlug === 'aztec-banner') return '/guides/aztec-banner/hero.webp'
  if (machineSlug === 'pegasus-banner') return '/guides/pegasus-banner/hero.webp'
  if (machineSlug === 'ainsworth-must-hit-by' || machineSlug === 'must-hit-by-aig')
    return '/guides/ainsworth-must-hit-by/hero.webp'
  if (machineSlug === 'ags-must-hit-by' || machineSlug === 'must-hit-by-ags')
    return '/guides/ags-must-hit-by/hero.webp'
  if (machineSlug === 'igt-must-hit-by' || machineSlug === 'must-hit-by-igt')
    return '/guides/igt-must-hit-by/hero.webp'
  return BUFFALO_PLACEHOLDER_SRC
}

/** Supabase may return `machines` as an object or an array depending on FK metadata — pick the embed that matches `guides.slug` or carries `volatility_index`. */
function machineForGuide(row) {
  const m = row?.machines
  if (m == null) return null
  if (!Array.isArray(m)) return m

  const list = m.filter(Boolean)
  if (list.length === 0) return null
  const gs = typeof row.slug === 'string' ? row.slug.trim().toLowerCase() : ''
  const slugMatch =
    gs && list.find((x) => typeof x.slug === 'string' && x.slug.trim().toLowerCase() === gs)
  const withVi = list.find(
    (x) => x.volatility_index != null && String(x.volatility_index).trim() !== ''
  )
  return slugMatch ?? withVi ?? list[0]
}

function heroImage(row) {
  const machine = machineForGuide(row)
  const ms = machine?.slug
  let thumb = row.thumbnail_url || machine?.thumbnail_url
  if (typeof thumb === 'string' && /buffalo-icon\.png/i.test(thumb)) thumb = null
  return thumb || defaultHeroSrc(ms)
}

function guideHeroImgOnError(e) {
  const el = e.currentTarget
  if (el.dataset.fallback === '1') return
  el.dataset.fallback = '1'
  el.src = BUFFALO_PLACEHOLDER_SRC
}

function heroGradientClass(machineSlug) {
  if (machineSlug === 'lightning-buffalo-link')
    return 'from-indigo-950/85 via-sky-950/40 to-zinc-950'
  if (machineSlug === 'phoenix-link') return 'from-orange-950/80 via-zinc-900/40 to-zinc-950'
  if (machineSlug === 'stack-up-pays') return 'from-cyan-950/80 via-sky-950/40 to-zinc-950'
  if (machineSlug === 'adventures-of-sinbad') return 'from-amber-950/85 via-orange-950/35 to-zinc-950'
  if (machineSlug === 'aladdins-fortune')
    return 'from-emerald-950/75 via-amber-950/30 to-zinc-950'
  if (machineSlug === 'aztec-banner')
    return 'from-green-950/80 via-orange-950/35 to-zinc-950'
  if (machineSlug === 'pegasus-banner')
    return 'from-sky-950/80 via-amber-950/30 to-zinc-950'
  if (machineSlug === 'ainsworth-must-hit-by' || machineSlug === 'must-hit-by-aig')
    return 'from-violet-950/85 via-fuchsia-950/35 to-zinc-950'
  if (machineSlug === 'ags-must-hit-by' || machineSlug === 'must-hit-by-ags')
    return 'from-rose-950/85 via-red-950/40 to-zinc-950'
  if (machineSlug === 'igt-must-hit-by' || machineSlug === 'must-hit-by-igt')
    return 'from-sky-950/80 via-blue-950/45 to-zinc-950'
  return 'from-amber-900/40 to-zinc-950'
}

function cardAccent(machineSlug) {
  if (machineSlug === 'phoenix-link') {
    return {
      chevron: 'text-orange-500',
      strong: 'text-orange-50',
      subtitle: 'text-orange-200/90',
      expandedBorder: 'border-orange-500/50 shadow-lg shadow-orange-900/20',
      evTablesBox:
        'rounded-xl border border-dashed border-orange-400/55 bg-gradient-to-br from-orange-950/35 via-zinc-950/40 to-zinc-950 px-4 py-3.5',
      evTablesHead: 'text-orange-300',
      evTablesRule: 'border-orange-400/65',
    }
  }
  if (machineSlug === 'stack-up-pays') {
    return {
      chevron: 'text-cyan-500',
      strong: 'text-cyan-50',
      subtitle: 'text-cyan-200/90',
      expandedBorder: 'border-cyan-500/50 shadow-lg shadow-cyan-900/25',
      evTablesBox:
        'rounded-xl border border-dashed border-cyan-400/55 bg-gradient-to-br from-cyan-950/35 via-zinc-950/40 to-zinc-950 px-4 py-3.5',
      evTablesHead: 'text-cyan-300',
      evTablesRule: 'border-cyan-400/65',
    }
  }
  if (machineSlug === 'lightning-buffalo-link') {
    return {
      chevron: 'text-indigo-400',
      strong: 'text-indigo-50',
      subtitle: 'text-amber-200/85',
      expandedBorder: 'border-indigo-500/50 shadow-lg shadow-indigo-950/35',
      evTablesBox:
        'rounded-xl border border-dashed border-indigo-400/55 bg-gradient-to-br from-indigo-950/40 via-blue-950/25 to-zinc-950 px-4 py-3.5',
      evTablesHead: 'text-indigo-300',
      evTablesRule: 'border-indigo-400/65',
    }
  }
  if (machineSlug === 'ainsworth-must-hit-by' || machineSlug === 'must-hit-by-aig') {
    return {
      chevron: 'text-fuchsia-400',
      strong: 'text-violet-50',
      subtitle: 'text-fuchsia-200/90',
      expandedBorder: 'border-violet-500/50 shadow-lg shadow-fuchsia-950/30',
      evTablesBox:
        'rounded-xl border border-dashed border-violet-400/55 bg-gradient-to-br from-violet-950/35 via-zinc-950/40 to-zinc-950 px-4 py-3.5',
      evTablesHead: 'text-violet-300',
      evTablesRule: 'border-violet-400/65',
    }
  }
  if (machineSlug === 'ags-must-hit-by' || machineSlug === 'must-hit-by-ags') {
    return {
      chevron: 'text-rose-400',
      strong: 'text-rose-50',
      subtitle: 'text-rose-200/90',
      expandedBorder: 'border-rose-500/50 shadow-lg shadow-rose-950/35',
      evTablesBox:
        'rounded-xl border border-dashed border-rose-400/55 bg-gradient-to-br from-rose-950/35 via-zinc-950/40 to-zinc-950 px-4 py-3.5',
      evTablesHead: 'text-rose-300',
      evTablesRule: 'border-rose-400/65',
    }
  }
  if (machineSlug === 'igt-must-hit-by' || machineSlug === 'must-hit-by-igt') {
    return {
      chevron: 'text-sky-400',
      strong: 'text-sky-50',
      subtitle: 'text-sky-200/90',
      expandedBorder: 'border-sky-500/50 shadow-lg shadow-blue-950/30',
      evTablesBox:
        'rounded-xl border border-dashed border-sky-400/55 bg-gradient-to-br from-sky-950/35 via-zinc-950/40 to-zinc-950 px-4 py-3.5',
      evTablesHead: 'text-sky-300',
      evTablesRule: 'border-sky-400/65',
    }
  }
  if (machineSlug === 'aladdins-fortune') {
    return {
      chevron: 'text-emerald-400',
      strong: 'text-emerald-50',
      subtitle: 'text-emerald-200/90',
      expandedBorder: 'border-emerald-500/45 shadow-lg shadow-emerald-950/25',
      evTablesBox:
        'rounded-xl border border-dashed border-emerald-400/55 bg-gradient-to-br from-emerald-950/35 via-zinc-950/40 to-zinc-950 px-4 py-3.5',
      evTablesHead: 'text-emerald-300',
      evTablesRule: 'border-emerald-400/65',
    }
  }
  if (machineSlug === 'aztec-banner') {
    return {
      chevron: 'text-lime-400',
      strong: 'text-lime-50',
      subtitle: 'text-orange-200/88',
      expandedBorder: 'border-green-500/45 shadow-lg shadow-green-950/30',
      evTablesBox:
        'rounded-xl border border-dashed border-lime-400/50 bg-gradient-to-br from-green-950/40 via-zinc-950/40 to-zinc-950 px-4 py-3.5',
      evTablesHead: 'text-lime-300',
      evTablesRule: 'border-lime-400/60',
    }
  }
  if (machineSlug === 'pegasus-banner') {
    return {
      chevron: 'text-sky-400',
      strong: 'text-sky-50',
      subtitle: 'text-amber-200/88',
      expandedBorder: 'border-sky-500/45 shadow-lg shadow-blue-950/35',
      evTablesBox:
        'rounded-xl border border-dashed border-sky-400/55 bg-gradient-to-br from-blue-950/38 via-zinc-950/40 to-zinc-950 px-4 py-3.5',
      evTablesHead: 'text-sky-300',
      evTablesRule: 'border-sky-400/60',
    }
  }
  return {
    chevron: 'text-amber-500',
    strong: 'text-amber-50',
    subtitle: 'text-amber-200/90',
    expandedBorder: 'border-amber-500/50 shadow-lg shadow-amber-900/20',
    evTablesBox:
      'rounded-xl border border-dashed border-amber-400/55 bg-gradient-to-br from-amber-950/35 via-zinc-950/40 to-zinc-950 px-4 py-3.5',
    evTablesHead: 'text-amber-300',
    evTablesRule: 'border-amber-400/65',
  }
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
  const guideCardRefs = useRef(Object.create(null))

  const load = useCallback(async () => {
    setLoading(true)
    setLoadErr('')
    try {
      const { data, error } = await supabaseClient.from('guides').select(`
          id,
          slug,
          title,
          content_markdown,
          card_ev_threshold,
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
          error.message?.includes('card_ev_threshold') ||
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

  useLayoutEffect(() => {
    if (!expandedSlug) return
    const el = guideCardRefs.current[expandedSlug]
    if (!(el instanceof HTMLElement)) return
    const reduceMotion =
      typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    el.scrollIntoView({ block: 'start', inline: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' })
  }, [expandedSlug])

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
        <ul className="space-y-8 list-none p-0 m-0">
          {filtered.map((row) => {
            const m = machineForGuide(row)
            const slug = m?.slug || row.slug
            const expanded = expandedSlug === slug
            const calcKey = resolveCalculatorKey(m)
            const evThresholdLine = cardEvThresholdForRow(row)
            const accent = cardAccent(slug)
            const ringFocus =
              slug === 'phoenix-link'
                ? 'focus-visible:ring-orange-500/60'
                : slug === 'stack-up-pays'
                  ? 'focus-visible:ring-cyan-500/60'
                  : slug === 'lightning-buffalo-link'
                    ? 'focus-visible:ring-indigo-500/60'
                    : slug === 'ainsworth-must-hit-by' || slug === 'must-hit-by-aig'
                    ? 'focus-visible:ring-violet-500/60'
                    : slug === 'ags-must-hit-by' || slug === 'must-hit-by-ags'
                      ? 'focus-visible:ring-rose-500/60'
                      : slug === 'igt-must-hit-by' || slug === 'must-hit-by-igt'
                        ? 'focus-visible:ring-sky-500/60'
                        : slug === 'aladdins-fortune'
                          ? 'focus-visible:ring-emerald-500/60'
                          : slug === 'aztec-banner'
                            ? 'focus-visible:ring-lime-500/60'
                            : slug === 'pegasus-banner'
                              ? 'focus-visible:ring-sky-500/60'
                              : 'focus-visible:ring-amber-500/60'

            return (
              <li key={row.id || row.slug}>
                <article
                  ref={(el) => {
                    if (el) guideCardRefs.current[slug] = el
                    else delete guideCardRefs.current[slug]
                  }}
                  className={`rounded-3xl border overflow-hidden bg-zinc-900 scroll-mt-[max(0.5rem,env(safe-area-inset-top))] transition-[box-shadow,border-color,ring-color] duration-200 ${
                    expanded
                      ? `${accent.expandedBorder} ring-1 ring-white/[0.07] shadow-2xl`
                      : 'border-zinc-700/85 ring-1 ring-zinc-500/15 shadow-[0_12px_40px_-8px_rgba(0,0,0,0.65)]'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setExpandedSlug((s) => (s === slug ? null : slug))}
                    className={`w-full text-left touch-manipulation focus:outline-none focus-visible:ring-2 ${ringFocus}`}
                    aria-expanded={expanded}
                  >
                    <div
                      className={`relative w-full bg-gradient-to-br ${heroGradientClass(slug)} ${
                        expanded ? 'flex justify-center' : 'h-[10.5rem] overflow-hidden'
                      }`}
                    >
                      <img
                        src={heroImage(row)}
                        alt=""
                        className={
                          expanded
                            ? 'max-h-[min(85vh,900px)] max-w-full w-auto h-auto object-contain opacity-95'
                            : 'h-full w-full object-cover opacity-95'
                        }
                        onError={guideHeroImgOnError}
                      />
                      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/20 to-transparent" />
                      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-zinc-950 via-zinc-950/85 to-transparent px-4 pb-3 pt-12">
                        <div className="flex items-end justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <h2 className="text-white font-black text-xl tracking-tight drop-shadow-md leading-tight">
                              {m?.name || row.title}
                            </h2>
                            <div className={`${accent.subtitle} text-[11px] font-semibold mt-0.5`}>
                              {m?.manufacturer || '—'}
                            </div>
                          </div>
                          <div className="shrink-0 text-right leading-tight pb-px">
                            <div className="text-[9px] font-semibold uppercase tracking-wider text-zinc-400/95">
                              Released
                            </div>
                            <div className="text-[11px] font-bold tabular-nums text-zinc-100 drop-shadow-md">
                              {m?.release_year != null ? m.release_year : '—'}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="p-4 space-y-3">
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="rounded-xl bg-zinc-950/80 px-3 py-2 border border-zinc-800">
                          <div className="flex flex-nowrap items-center gap-1 whitespace-nowrap overflow-hidden">
                            <span className="text-zinc-500 font-semibold uppercase tracking-wide text-[10px] shrink-0">
                              Volatility
                            </span>
                            <span
                              className="inline-block origin-left scale-[0.65] text-sm leading-none text-amber-300 whitespace-nowrap"
                              title={`${volatilityLightningCount(row)} of 5`}
                              aria-hidden
                            >
                              {lightningMeter(volatilityLightningCount(row))}
                            </span>
                          </div>
                          <div className="text-zinc-100 font-bold mt-0.5 leading-snug">{volatilityLabel(row)}</div>
                        </div>
                        <div className="rounded-xl bg-zinc-950/80 px-3 py-2 border border-zinc-800">
                          <div className="flex flex-nowrap items-center gap-1 whitespace-nowrap overflow-hidden">
                            <span className="text-zinc-500 font-semibold uppercase tracking-wide text-[10px] shrink-0">
                              Popularity
                            </span>
                            <span
                              className="inline-block origin-left scale-[0.65] text-sm leading-none whitespace-nowrap"
                              title={`${popularityFireCount(row)} of 5`}
                              aria-hidden
                            >
                              {fireMeter(popularityFireCount(row))}
                            </span>
                          </div>
                          <div className="text-zinc-100 font-bold mt-0.5 leading-snug">{popularityLabel(row)}</div>
                        </div>
                        <div className="rounded-xl bg-zinc-950/80 px-3 py-2 border border-zinc-800 col-span-2">
                          <div className="text-zinc-500 font-semibold uppercase tracking-wide">Type</div>
                          <div className="text-zinc-200 font-semibold mt-0.5 leading-snug">{m?.type || '—'}</div>
                        </div>
                        {row.known_titles_line ? (
                          <div className="rounded-xl bg-zinc-950/80 px-3 py-2 border border-zinc-800 col-span-2">
                            <div className="text-zinc-500 font-semibold uppercase tracking-wide">Known titles</div>
                            <div className="text-zinc-300 text-xs font-medium mt-1 leading-snug">{row.known_titles_line}</div>
                          </div>
                        ) : null}
                      </div>

                      <GuideEvThresholdPanel line={evThresholdLine} accent={accent} />

                      <div className="flex flex-col gap-2 pt-2 border-t border-zinc-800/80 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                        {isLocalDemoGuide(row) ? (
                          <p className="text-zinc-500 text-[10px] leading-snug max-w-[16rem]">
                            Added / updated dates appear here once this guide is in Supabase (bundled demo for now).
                          </p>
                        ) : (
                          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[10px] leading-snug text-zinc-500">
                            <span className="inline-flex items-center gap-1">
                              <IconCalendar
                                className="h-3 w-3 shrink-0 text-emerald-500/80"
                                aria-hidden
                              />
                              <span className="text-zinc-600">Added</span>
                              <span className="tabular-nums text-zinc-400">{formatGuideDate(row.created_at)}</span>
                            </span>
                            <span className="text-zinc-700 opacity-70" aria-hidden>
                              ·
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <IconClock className="h-3 w-3 shrink-0 text-sky-500/75" aria-hidden />
                              <span className="text-zinc-600">Updated</span>
                              <span className="tabular-nums text-zinc-400">{formatGuideDate(row.updated_at)}</span>
                            </span>
                          </div>
                        )}
                        <div className="inline-flex shrink-0 items-center gap-1.5 text-zinc-500 text-xs font-medium sm:justify-end">
                          {expanded ? (
                            <>
                              <IconChevronFold expanded className="h-4 w-4 text-zinc-500" />
                              Tap to collapse
                            </>
                          ) : (
                            <>
                              <span aria-hidden>👆</span>
                              Tap for full guide
                            </>
                          )}
                        </div>
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
                    <div className="border-t border-zinc-800 px-4 py-5 bg-zinc-950/90 text-sm max-w-none">
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
