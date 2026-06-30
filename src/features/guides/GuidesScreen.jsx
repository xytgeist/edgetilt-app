import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import GuideLockTvSnowCanvas from './GuideLockTvSnowCanvas'
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { format, parseISO } from 'date-fns'
import { stashPlayLogPrefill } from '../../utils/playLogPrefill.js'
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
import { guideMarkdownForDisplay, parseGuideMarkdown } from '../../slot-guide-form/formUtils.js'
import { communityFeedPostInsertPayload } from '../../utils/communityFeedPost'
import { prepareAvatarImageForUpload, isProbablyImageFile } from '../../utils/compressImageForUpload'
import {
  checkProfileHandleAvailability,
  fetchOwnProfile,
  formatProfileSaveDebugError,
  handleSlugFromAtInput,
  isProfileHandleUniqueViolation,
  normalizeHandle,
  profileAvatarInitials,
  profileAvatarToneClass,
  profileSeedFromUser,
  saveProfileWithHandleFallback,
  suggestAvailableProfileHandle,
  uploadProfileAvatar,
} from '../profiles/profileGate'
import ProfileHandleConflictDialog from '../profiles/ProfileHandleConflictDialog.jsx'
import { loungeProfileNeedsGate, writeProfileGateAck } from '../lounge/loungeStorage'
import ProfileAvatarCropModal from '../lounge/ProfileAvatarCropModal'
import LoungePostCategoryPillPicker from '../lounge/LoungePostCategoryPillPicker.jsx'
import {
  loungePostCategoryPillChipClass,
  normalizeLoungeProfileCategoryPills,
  profileCategoryPills,
} from '../../utils/loungePostCategoryPills.js'
import ScrollLinkedEdgeTitleBarShell from '../../components/ScrollLinkedEdgeTitleBarShell.jsx'
import SlotsToolPageHeader from '../../components/SlotsToolPageHeader.jsx'
import NavLockGlyph from '../../components/NavLockGlyph.jsx'
import ContentAccessAdminSwitch from '../../components/ContentAccessAdminSwitch.jsx'
import {
  canOpenGuide,
  guideRequiresSlotsEdge,
  normalizeGuideAccessSlug,
  resolveGuidePostSlug,
  showGuideLock,
} from './guideAccess.js'
import { resolveGuideAccent } from '../../utils/guideCardAccent.js'
import { LOG_PLAY_LOGBOOK_BTN_CLASS } from '../calculators/CalculatorLogPlayButton.jsx'
import FreemiumUsageCounter from '../billing/FreemiumUsageCounter.jsx'
import { FREE_PLAY_LOG_LIMIT } from '../billing/freemiumToolLimits.js'

const ACTIVE_SUPABASE_HOST = (() => {
  try {
    return new URL(import.meta.env.VITE_SUPABASE_URL || '').host || 'unknown-host'
  } catch {
    return 'unknown-host'
  }
})()

function formatGuideDate(iso) {
  if (!iso) return '-'
  try {
    return format(typeof iso === 'string' ? parseISO(iso) : iso, 'MMM d, yyyy')
  } catch {
    return '-'
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

/** Ignore taps on links, buttons, and form controls when collapsing an expanded guide card. */
function shouldIgnoreGuideCardCollapseClick(event) {
  const target = event.target
  if (!(target instanceof Element)) return true
  return Boolean(target.closest('a, button, input, textarea, select'))
}

/** Shipped with the app when Supabase has no published row for that slug yet (see `mergeLocalGuideDemos`). */
function isLocalDemoGuide(row) {
  return typeof row?.id === 'string' && row.id.startsWith('local-demo-')
}

/** Map DB \`machines.calculator_slug\` / slug → AppShell \`openCalculator\` keys. */
function resolveCalculatorKey(machine) {
  if (!machine) return null
  const { slug, calculator_slug: calc, has_calculator: has } = machine
  if (
    slug === 'buffalo-link' ||
    slug === 'lightning-buffalo-link' ||
    calc === 'buffalo-link' ||
    calc === 'buffalo'
  ) {
    return 'buffalo-link'
  }
  if (slug === 'buffalo-diamond' || slug === 'buffalo-diamond-extreme' || calc === 'buffalo-diamond') {
    return 'buffalo-diamond'
  }
  if (slug === 'stack-up-pays' || calc === 'stack-up-pays') return 'stackup'
  if (slug === 'phoenix-link' || calc === 'phoenix-link') return 'phoenix'
  if (
    slug === 'wheel-of-fortune-4d-collectors-edition' ||
    calc === 'wof-collectors-edition' ||
    calc === 'wheel-of-fortune-4d-collectors-edition'
  ) {
    return 'wof-collectors-edition'
  }
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
  if (has && calc && ['buffalo-link', 'buffalo', 'buffalo-diamond', 'stackup', 'phoenix', 'mhb'].includes(calc)) {
    return calc === 'buffalo' ? 'buffalo-link' : calc
  }
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
  /** Suppress a bundled demo if *either* the linked machine slug or this guide's `guides.slug` is present - avoids doubling when FK join fails or slug lives only on the guide row. */
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
        popularity: 'Very Common',
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
        popularity: 'Very Common',
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
        popularity: 'Very Common',
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
        popularity: 'Common',
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
        popularity: 'Common',
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
        popularity: 'Very Common',
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

/** One-line +EV threshold - DB `guides.card_ev_threshold` (legacy `card_gist`), else catalog default from slug/type. */
function cardEvThresholdForRow(row) {
  const fromNew = typeof row.card_ev_threshold === 'string' ? row.card_ev_threshold.trim() : ''
  if (fromNew) return fromNew
  const legacy = typeof row.card_gist === 'string' ? row.card_gist.trim() : ''
  if (legacy) return legacy
  const m = machineForGuide(row)
  if (m?.slug) return defaultCardEvThresholdForSlug(m.slug, m.type)
  return TYPE_LINE_FALLBACK_GUIDE_HINT
}

const TYPE_LINE_FALLBACK_GUIDE_HINT = 'Verify +EV on the glass - open guide'

/** Keep `guide:` links - react-markdown’s default URL transform strips unknown schemes, leaving `href=""` (clicks jump to `/` / home). */
function guideMarkdownUrlTransform(url) {
  const u = String(url ?? '')
  if (/^guide:/i.test(u)) return u
  return defaultUrlTransform(u)
}

function flattenMarkdownText(children) {
  if (typeof children === 'string' || typeof children === 'number') return String(children)
  if (!Array.isArray(children)) return ''
  return children
    .map((c) => {
      if (typeof c === 'string' || typeof c === 'number') return String(c)
      if (c && typeof c === 'object' && 'props' in c) return flattenMarkdownText(c.props?.children)
      return ''
    })
    .join('')
}

function tintRedGreenBlue(children) {
  const raw = flattenMarkdownText(children).trim()
  const normalized = raw.toLowerCase()
  if (normalized === 'red') return <span className="text-red-400 font-semibold">{children}</span>
  if (normalized === 'green') return <span className="text-emerald-400 font-semibold">{children}</span>
  if (normalized === 'blue') return <span className="text-sky-400 font-semibold">{children}</span>
  return children
}

/**
 * Compact skin-link card rendered inline inside guide markdown.
 * Shows the linked guide's hero image + machine name; tappable to open.
 */
function GuideSkinCard({ targetSlug, label, allGuides, onOpen }) {
  const row = allGuides?.find((r) => {
    const m = machineForGuide(r)
    return (m?.slug || r.slug) === targetSlug
  })
  const m = row ? machineForGuide(row) : null
  const name = m?.name || row?.title || label
  const src = row ? heroImage(row) : null
  const accent = resolveGuideAccent({
    slug: m?.slug || targetSlug,
    cardAccentColor: row?.card_accent_color,
  })
  const heroGrad =
    accent.mode === 'hex'
      ? accent.heroGradientClass
      : `bg-gradient-to-br ${accent.heroGradientClass}`

  return (
    <button
      type="button"
      onClick={() => onOpen?.(targetSlug)}
      className={[
        'group my-3 w-full text-left rounded-2xl overflow-hidden border border-zinc-700/80',
        accent.mode === 'hex' ? 'guide-accent-themed' : '',
        'bg-zinc-900 shadow-[0_6px_24px_-4px_rgba(0,0,0,0.55)]',
        'transition-[border-color,box-shadow] duration-150',
        'hover:border-zinc-500 hover:shadow-[0_8px_28px_-4px_rgba(0,0,0,0.65)]',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60',
      ].join(' ')}
      style={accent.cssVars}
    >
      {/* hero - gradient when no DB thumbnail; no repo fallback */}
      <div className={`relative ${heroGrad} min-h-[6rem]`}>
        {src ? (
          <img
            src={src}
            alt={name}
            className="w-full h-auto block opacity-90 transition-opacity duration-150 group-hover:opacity-100"
            onError={(e) => { e.currentTarget.style.display = 'none' }}
          />
        ) : null}
        <div className="guide-skin-scrim pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
        <div className="guide-skin-footer absolute bottom-0 inset-x-0 px-3 pb-3 pt-10 bg-gradient-to-t from-black/90 via-black/60 to-transparent">
          <p className="text-[#fff] font-bold text-sm leading-tight drop-shadow truncate">{name}</p>
          {m?.manufacturer && (
            <p className="text-zinc-400 text-[11px] font-medium mt-0.5 truncate">{m.manufacturer}</p>
          )}
          <span className="inline-flex items-center mt-1.5 rounded-full border border-cyan-500/40 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-cyan-300">
            View guide →
          </span>
        </div>
      </div>
    </button>
  )
}

/** Markdown links `[label](guide:slug)` jump to another guide card (same list). */
function makeGuideMarkdownComponents(accent, { onOpenGuideSlug, allGuides } = {}) {
  const h2Tone = accent.h2Tone || accent.strong || 'text-amber-100'
  const titleBarTo = accent.titleBarTo || 'to-amber-500/55'
  const guideHrVia = accent.hrVia || 'via-amber-500/48'
  return {
    h1: ({ children }) => (
      <div className="flex items-center gap-3 w-full mb-5 mt-0.5 select-none">
        <span
          className={`h-0.5 flex-1 min-w-[0.75rem] rounded-full bg-gradient-to-r from-zinc-800/20 ${titleBarTo}`}
          aria-hidden
        />
        <h1 className="text-center text-[1.35rem] leading-tight font-black text-white tracking-tight m-0 px-1 shrink-0 max-w-[85%]">
          {children}
        </h1>
        <span
          className={`h-0.5 flex-1 min-w-[0.75rem] rounded-full bg-gradient-to-l from-zinc-800/20 ${titleBarTo}`}
          aria-hidden
        />
      </div>
    ),
    h2: ({ children }) => (
      <h2 className={`guide-section-heading text-lg font-black ${h2Tone} mt-6 first:mt-0 mb-2`}>{children}</h2>
    ),
    h3: ({ children }) => <h3 className="text-base font-bold text-zinc-100 mt-4 mb-1.5">{children}</h3>,
    p: ({ children }) => <p className="text-zinc-300 leading-relaxed mb-3 last:mb-0">{children}</p>,
    ul: ({ children }) => <ul className="list-disc pl-5 space-y-1.5 text-zinc-300 mb-3">{children}</ul>,
    ol: ({ children }) => <ol className="list-decimal pl-5 space-y-1.5 text-zinc-300 mb-3">{children}</ol>,
    li: ({ children }) => <li className="leading-relaxed">{children}</li>,
    strong: ({ children }) => <strong className="text-white font-semibold">{children}</strong>,
    a: ({ href, children }) => {
      if (typeof href === 'string') {
        const m = /^guide:/i.exec(href)
        if (m) {
          const target = href.slice(m[0].length).trim().replace(/^\/+|\/+$/g, '')
          if (target) {
            const label = flattenMarkdownText(children)
            return (
              <GuideSkinCard
                targetSlug={target}
                label={label}
                allGuides={allGuides}
                onOpen={onOpenGuideSlug}
              />
            )
          }
        }
      }
      return (
        <a href={href} className="text-cyan-400 underline font-medium hover:text-cyan-300">
          {children}
        </a>
      )
    },
    img: ({ src, alt }) => (
      <img
        src={src}
        alt={alt ?? ''}
        className="max-w-full h-auto rounded-xl border border-zinc-800/90 my-4 block"
        loading="lazy"
        decoding="async"
      />
    ),
    table: ({ children }) => (
      <div className="my-4 overflow-x-auto rounded-xl border border-zinc-800/90">
        <table className="min-w-full border-collapse text-sm text-zinc-200">{children}</table>
      </div>
    ),
    thead: ({ children }) => <thead className="bg-zinc-900/80">{children}</thead>,
    tbody: ({ children }) => <tbody className="divide-y divide-zinc-800/70">{children}</tbody>,
    tr: ({ children }) => <tr className="odd:bg-zinc-950/55 even:bg-zinc-950/25">{children}</tr>,
    th: ({ children }) => (
      <th className="px-3 py-2 text-left font-bold uppercase tracking-wide text-zinc-100">
        {tintRedGreenBlue(children)}
      </th>
    ),
    td: ({ children }) => <td className="px-3 py-2 align-top">{tintRedGreenBlue(children)}</td>,
    hr: () => (
      <hr
        role="separator"
        className={`my-7 border-0 h-0.5 w-full max-w-full rounded-full bg-gradient-to-r from-zinc-800/30 ${guideHrVia} to-zinc-800/30`}
      />
    ),
  }
}

function volatilityLabel(row) {
  const m = machineForGuide(row)
  if (!m) return '-'
  const viRaw = m.volatility_index
  const vi = typeof viRaw === 'string' ? viRaw.trim() : viRaw
  if (vi != null && vi !== '') return typeof viRaw === 'string' ? vi : String(vi)
  if (m.nerf_risk && m.difficulty) return `${m.difficulty} play / ${m.nerf_risk} nerf risk`
  return m.difficulty || m.nerf_risk || '-'
}

function machinePopularity(m) {
  if (!m) return ''
  return m.popularity ?? m.vegas_availability ?? ''
}

function popularityLabel(row) {
  const m = machineForGuide(row)
  if (!m) return '-'
  const pop = machinePopularity(m)
  return pop || '-'
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

/** 1–5 🔥 from `machines.popularity` tier. */
function popularityFireCount(row) {
  const m = machineForGuide(row)
  if (!m) return 3
  const haystack = machinePopularity(m).toLowerCase()

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

function GuideLockedPaywallOverlay({ onUnlock }) {
  const [checkoutBusy, setCheckoutBusy] = useState(false)
  const [checkoutError, setCheckoutError] = useState('')
  const checkoutRedirectStartedRef = useRef(false)

  useEffect(() => {
    const resetCheckoutUi = () => {
      checkoutRedirectStartedRef.current = false
      setCheckoutBusy(false)
      setCheckoutError('')
    }

    const shouldResetAfterStripeReturn = () => {
      if (typeof window === 'undefined') return false
      try {
        return new URLSearchParams(window.location.search).get('billing') === 'cancel'
      } catch {
        return false
      }
    }

    const onPageShow = (event) => {
      if (!checkoutRedirectStartedRef.current) return
      if (event.persisted || shouldResetAfterStripeReturn()) {
        resetCheckoutUi()
      }
    }

    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return
      if (!checkoutRedirectStartedRef.current) return
      resetCheckoutUi()
    }

    if (checkoutRedirectStartedRef.current && shouldResetAfterStripeReturn()) {
      resetCheckoutUi()
    }

    window.addEventListener('pageshow', onPageShow)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.removeEventListener('pageshow', onPageShow)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [])

  return (
    <div className="guide-lock-glitch absolute inset-x-0 bottom-0 top-[10.5rem] z-10 flex items-center justify-center overflow-hidden rounded-b-3xl px-4 py-5">
      <div className="guide-lock-glitch__veil pointer-events-none absolute inset-0" aria-hidden />
      <GuideLockTvSnowCanvas className="guide-lock-glitch__tv-snow pointer-events-none absolute inset-0 overflow-hidden" />
      <div className="relative z-10 flex max-w-[16rem] flex-col items-center gap-3 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/20 bg-white/5 shadow-[0_0_22px_rgba(255,255,255,0.08)] backdrop-blur-[2px]">
          <NavLockGlyph className="h-4 w-4 text-white/90" />
        </div>
        <div>
          <p className="text-sm font-semibold leading-snug text-zinc-100 drop-shadow-[0_1px_8px_rgba(0,0,0,0.85)]">
            Full guide on Slots Edge
          </p>
          <p className="mt-1 text-xs leading-snug text-zinc-300 drop-shadow-[0_1px_6px_rgba(0,0,0,0.8)]">
            Subscribe to unlock this playbook and the rest of AP Guides.
          </p>
        </div>
        {checkoutError ? (
          <p className="text-xs leading-snug text-red-300 drop-shadow-[0_1px_6px_rgba(0,0,0,0.8)]">{checkoutError}</p>
        ) : null}
        <button
          type="button"
          disabled={checkoutBusy}
          onClick={async (event) => {
            event.stopPropagation()
            setCheckoutError('')
            checkoutRedirectStartedRef.current = true
            setCheckoutBusy(true)
            try {
              await onUnlock?.()
            } catch (error) {
              checkoutRedirectStartedRef.current = false
              setCheckoutBusy(false)
              setCheckoutError(error instanceof Error ? error.message : String(error))
            }
          }}
          className="min-h-11 w-full max-w-[13rem] rounded-2xl bg-amber-500 px-4 text-sm font-bold text-zinc-950 touch-manipulation hover:bg-amber-400 active:scale-[0.98] shadow-[0_0_24px_rgba(255,234,0,0.2)] disabled:cursor-wait disabled:opacity-80"
        >
          {checkoutBusy ? 'Opening checkout…' : 'Unlock guide'}
        </button>
      </div>
    </div>
  )
}

function GuideEvThresholdPanel({ line, accent }) {
  return (
    <div className={`guide-ev-threshold-panel ${accent.evTablesBox}`}>
      <div className={`guide-ev-threshold-head flex items-center gap-2 ${accent.evTablesHead}`}>
        <IconEvTrendingUp className="h-3.5 w-3.5 shrink-0" />
        <span className="text-[10px] font-bold uppercase tracking-[0.2em]">+EV Threshold</span>
      </div>
      <div className={accent.evTablesRule}>
        <p className={`guide-ev-threshold-text text-base font-normal leading-snug ${accent.strong}`}>{line}</p>
      </div>
    </div>
  )
}

/** Supabase may return `machines` as an object or an array depending on FK metadata - pick the embed that matches `guides.slug` or carries `volatility_index`. */
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
  let thumb = row.thumbnail_url || machine?.thumbnail_url
  if (typeof thumb === 'string' && /buffalo-icon\.png/i.test(thumb)) thumb = null
  const trimmed = typeof thumb === 'string' ? thumb.trim() : ''
  return trimmed || null
}

function hideGuideHeroOnError(e) {
  e.currentTarget.style.display = 'none'
}

/** Optional second fetch when `guides.card_accent_color` exists (migration applied). Never fails load. */
async function mergeGuideAccentColors(supabaseClient, rows) {
  if (!rows?.length) return rows || []
  const slugs = rows.map((r) => r.slug).filter(Boolean)
  if (!slugs.length) return rows
  try {
    const { data, error } = await supabaseClient
      .from('guides')
      .select('slug, card_accent_color')
      .in('slug', slugs)
    if (error || !data?.length) return rows
    const bySlug = new Map(data.map((d) => [d.slug, d.card_accent_color]))
    return rows.map((r) =>
      bySlug.has(r.slug) ? { ...r, card_accent_color: bySlug.get(r.slug) } : r
    )
  } catch {
    return rows
  }
}

function AskCommunityModal({ open, onClose, guideRow, supabaseClient, onPosted, onRequireAuth }) {
  const [caption, setCaption] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [authPromptOpen, setAuthPromptOpen] = useState(false)
  const [profileGateOpen, setProfileGateOpen] = useState(false)
  const [profileGateBusy, setProfileGateBusy] = useState(false)
  const [profileGateErr, setProfileGateErr] = useState('')
  const [profileGateHandle, setProfileGateHandle] = useState('')
  const [profileGateHandleConflict, setProfileGateHandleConflict] = useState(null)
  const [profileGateDisplayName, setProfileGateDisplayName] = useState('')
  const [profileGateCategoryPills, setProfileGateCategoryPills] = useState([])
  const [profileGateAvatarFile, setProfileGateAvatarFile] = useState(null)
  const [profileGateAvatarPreview, setProfileGateAvatarPreview] = useState('')
  const [profileGateAvatarCropFile, setProfileGateAvatarCropFile] = useState(null)

  const onProfileGateAvatarCropCancel = useCallback(() => {
    setProfileGateAvatarCropFile(null)
  }, [])

  const onProfileGateAvatarCropApply = useCallback(async (croppedFile) => {
    setProfileGateAvatarCropFile(null)
    setProfileGateErr('')
    const { file: ready, error } = await prepareAvatarImageForUpload(croppedFile)
    if (error) {
      setProfileGateErr(error.message)
      return
    }
    setProfileGateAvatarFile(ready)
    setProfileGateAvatarPreview(URL.createObjectURL(ready))
  }, [])

  const gameTitle = guideRow?.machines?.name || guideRow?.title || 'Game'
  const gameSlug = resolveGuidePostSlug(guideRow)
  const rateLimitMessage = (rawMessage) => {
    const m = /retry_in_seconds=(\d+)/i.exec(String(rawMessage || ''))
    const secs = m ? Number(m[1]) : NaN
    if (!Number.isFinite(secs) || secs <= 0) {
      return '🤖 You\'re in spam bot jail! Please wait a few minutes and try again.'
    }
    const mm = Math.floor(secs / 60)
    const ss = secs % 60
    const tail = mm > 0 ? `${mm}m ${String(ss).padStart(2, '0')}s` : `${ss}s`
    return `🤖 You're in spam bot jail! Try again in ${tail}.`
  }

  useEffect(() => {
    if (open) {
      setCaption('')
      setErr('')
      setAuthPromptOpen(false)
      setProfileGateOpen(false)
      setProfileGateErr('')
      setProfileGateAvatarFile(null)
      setProfileGateAvatarCropFile(null)
      setProfileGateAvatarPreview('')
    }
  }, [open, guideRow?.id])

  if (!open || !guideRow) return null

  const submit = async (e, forcedCaption = null) => {
    e?.preventDefault?.()
    setErr('')
    const cleanedCaption = String(forcedCaption ?? caption).trim()
    if (!cleanedCaption) return
    if (cleanedCaption.length > 280) {
      setErr('Caption must be 280 characters or fewer.')
      return
    }
    setBusy(true)
    try {
      const {
        data: { session },
      } = await supabaseClient.auth.getSession()
      if (!session?.user) {
        setAuthPromptOpen(true)
        setBusy(false)
        return
      }

      const { data: ownProfile, error: profileErr } = await fetchOwnProfile(supabaseClient, session.user.id)
      if (profileErr) {
        setErr(`Could not verify profile: ${profileErr.message || 'Unknown error.'}`)
        setBusy(false)
        return
      }
      if (loungeProfileNeedsGate(ownProfile, session.user.id)) {
        const h = String(ownProfile?.handle || '').trim()
        const d = String(ownProfile?.display_name || '').trim()
        const seed = profileSeedFromUser(session.user)
        setProfileGateHandle(h || seed.baseHandle)
        setProfileGateDisplayName(d || seed.displayName)
        setProfileGateAvatarFile(null)
        setProfileGateAvatarCropFile(null)
        setProfileGateAvatarPreview(ownProfile?.avatar_url || '')
        setProfileGateCategoryPills(profileCategoryPills(ownProfile))
        setProfileGateErr('')
        setProfileGateOpen(true)
        setErr('Complete your profile before posting.')
        setBusy(false)
        return
      }

      const { error } = await supabaseClient.from('community_feed_posts').insert(
        communityFeedPostInsertPayload({
          caption: cleanedCaption,
          gameTitle,
          gameSlug: gameSlug || null,
          categoryPills: ['ap_slots'],
          isApGuidePost: true,
          guideThumbnailUrl: heroImage(guideRow) || null,
        })
      )

      if (error) {
        if (error.message?.includes('relation') || error.code === '42P01') {
          setErr(
            `A required relation is missing in the active project (${ACTIVE_SUPABASE_HOST}). Run both SQL files in this same project: \`supabase/community_feed_posts.sql\` then \`supabase/feed_phase_a_profiles_public_read.sql\`. Details: ${error.message}`
          )
        } else if (error.message?.toLowerCase?.().includes('rate limit exceeded')) {
          setErr(rateLimitMessage(error.message))
        } else if (error.code === '42501') {
          setErr(`Posting blocked by RLS/policy in ${ACTIVE_SUPABASE_HOST}. Details: ${error.message}`)
        } else {
          setErr(`Could not post (${error.code || 'unknown'}): ${error.message || 'Unknown database error.'}`)
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

  const saveProfileGate = async (opts) => {
    setProfileGateErr('')
    const display = profileGateDisplayName.trim()
    if (!display) {
      setProfileGateErr('Display name is required.')
      return
    }
    const handle = normalizeHandle(opts?.forcedHandle ?? profileGateHandle)
    if (!handle) {
      setProfileGateErr('Handle must be at least 2 characters (letters, numbers, underscore).')
      return
    }
    setProfileGateBusy(true)
    try {
      const {
        data: { session },
      } = await supabaseClient.auth.getSession()
      if (!session?.user) {
        setProfileGateAvatarCropFile(null)
        setProfileGateOpen(false)
        setAuthPromptOpen(true)
        return
      }

      if (!opts?.forcedHandle) {
        const availability = await checkProfileHandleAvailability({
          supabaseClient,
          requestedHandle: handle,
          excludeUserId: session.user.id,
        })
        if (!availability.ok && availability.reason !== 'invalid') {
          setProfileGateHandleConflict({
            requestedHandle: availability.handle,
            reason: availability.reason,
            suggestedHandle: availability.suggestedHandle,
          })
          return
        }
        if (!availability.ok) {
          setProfileGateErr('Handle must be at least 2 characters (letters, numbers, underscore).')
          return
        }
      }

      let avatarUrl
      if (profileGateAvatarFile) {
        const { data: uploadedUrl, error: uploadErr } = await uploadProfileAvatar({
          supabaseClient,
          user: session.user,
          file: profileGateAvatarFile,
        })
        if (uploadErr) {
          setProfileGateErr(formatProfileSaveDebugError(uploadErr, 'Avatar upload'))
          return
        }
        avatarUrl = uploadedUrl || null
      }

      const { error } = await saveProfileWithHandleFallback({
        supabaseClient,
        user: session.user,
        displayName: display,
        requestedHandle: handle,
        avatarUrl,
        strictHandle: true,
      })
      if (error) {
        if (isProfileHandleUniqueViolation(error)) {
          const suggestedHandle = await suggestAvailableProfileHandle(
            supabaseClient,
            handle,
            session.user.id,
          )
          setProfileGateHandleConflict({
            requestedHandle: handle,
            reason: 'taken',
            suggestedHandle,
          })
          return
        }
        setProfileGateErr(formatProfileSaveDebugError(error, 'Save profile'))
        return
      }

      const nextCategoryPills = normalizeLoungeProfileCategoryPills(profileGateCategoryPills)
      const { error: categoryErr } = await supabaseClient
        .from('profiles')
        .update({ category_pills: nextCategoryPills })
        .eq('user_id', session.user.id)
      if (categoryErr) {
        const raw = String(categoryErr.message || '')
        if (/category_pills|schema cache/i.test(raw)) {
          setProfileGateErr(
            'Profile tribes need the latest SQL. In Supabase, run supabase/profile_category_pills.sql, then save again.',
          )
        } else {
          setProfileGateErr(raw || 'Could not save tribes.')
        }
        return
      }

      writeProfileGateAck(session.user.id)
      setProfileGateAvatarCropFile(null)
      setProfileGateHandleConflict(null)
      setProfileGateOpen(false)
      await submit(null, caption)
    } finally {
      setProfileGateBusy(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center p-4 bg-black/60" role="dialog" aria-modal>
        <button type="button" className="absolute inset-0 z-0 cursor-default" aria-label="Close" onClick={onClose} />
        <div className="relative z-10 w-full max-w-lg rounded-3xl bg-zinc-900 border border-zinc-700 shadow-2xl max-h-[90dvh] overflow-hidden flex flex-col" data-ask-community-modal>
          <div className="p-5 border-b border-zinc-800 shrink-0">
            <div className="text-white font-bold text-lg">Ask the community</div>
            <div className="text-zinc-400 text-sm mt-1">
              Posts to the <span className="text-cyan-300 font-semibold">Lounge</span> feed with the guide card attached.
            </div>
            <div className="mt-3 rounded-2xl bg-zinc-800/80 px-3 py-2 text-sm text-zinc-100 font-semibold">{gameTitle}</div>
            {/* Locked AP Slots pill - auto-applied, not removable */}
            <div className="mt-2 flex items-center gap-1.5">
              <span
                className={`lounge-category-pill inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${loungePostCategoryPillChipClass('ap_slots', 'display')}`}
              >
                <svg className="h-2.5 w-2.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                AP Slots
              </span>
              <span className="text-[10px] text-zinc-600">auto-tagged</span>
            </div>
          </div>
          <form noValidate onSubmit={submit} className="p-5 flex flex-col gap-3 min-h-0 flex-1 overflow-y-auto">
            <label className="block flex-1 min-h-[8rem]">
              <span className="text-zinc-400 text-xs font-semibold uppercase tracking-wide">Caption</span>
              <textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                rows={6}
                className="mt-1 w-full rounded-2xl bg-zinc-950 border border-zinc-700 px-4 py-3 text-white text-[16px] leading-snug placeholder:text-[16px] focus:outline-none focus:ring-2 focus:ring-cyan-500/40 resize-y min-h-[10rem] touch-manipulation"
                maxLength={280}
                placeholder="Ask your question or share a quick read..."
              />
              <div className="mt-1 text-right text-[16px] tabular-nums text-zinc-500">{caption.length}/280</div>
            </label>
            {err ? (
              <div className="rounded-2xl border border-rose-500/45 bg-rose-950/25 px-3 py-2 text-rose-200 text-[16px] leading-relaxed">
                {err}
              </div>
            ) : null}
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
                disabled={busy || !caption.trim()}
                className="flex-1 min-h-12 rounded-2xl bg-cyan-600 hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-40 text-white font-bold touch-manipulation"
              >
                {busy ? 'Posting…' : 'Post to Lounge'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {authPromptOpen ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/70" role="dialog" aria-modal>
          <button
            type="button"
            className="absolute inset-0 z-0 cursor-default"
            aria-label="Close auth prompt"
            onClick={() => setAuthPromptOpen(false)}
          />
          <div className="relative z-10 w-full max-w-md rounded-3xl border border-zinc-700 bg-zinc-900 shadow-2xl p-5" data-ask-community-auth-prompt>
            <div className="text-rose-200 text-sm font-semibold uppercase tracking-wide">Sign in required</div>
            <div className="text-white text-lg font-bold mt-1">You must be signed in to post in Lounge</div>
            <div className="text-zinc-400 text-sm mt-2 leading-relaxed">
              Choose an option below to continue. Your caption is still here if you cancel and come back after signing in.
            </div>
            <div className="mt-4 grid grid-cols-1 gap-2">
              <button
                type="button"
                onClick={() => onRequireAuth?.('login')}
                className="min-h-11 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-semibold"
              >
                Sign in
              </button>
              <button
                type="button"
                onClick={() => onRequireAuth?.('create')}
                className="min-h-11 rounded-xl border border-zinc-600 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-semibold"
              >
                Create account
              </button>
              <button
                type="button"
                onClick={() => setAuthPromptOpen(false)}
                className="min-h-10 rounded-xl text-zinc-400 hover:text-zinc-200"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {profileGateOpen ? (
        <div className="fixed inset-0 z-[115] flex items-center justify-center p-4 bg-black/75" role="dialog" aria-modal>
          <button
            type="button"
            className="absolute inset-0 z-0 cursor-default"
            aria-label="Close profile gate"
            onClick={() => {
              setProfileGateAvatarCropFile(null)
              setProfileGateOpen(false)
            }}
          />
          <div className="relative z-10 w-full max-w-md rounded-3xl border border-zinc-700 bg-zinc-900 shadow-2xl p-5" data-ask-community-profile-gate>
            <div className="profile-gate-kicker text-cyan-200 text-sm font-semibold uppercase tracking-wide">Complete your profile</div>
            <div className="text-white text-lg font-bold mt-1">One-time setup before posting</div>
            <div className="text-zinc-400 text-sm mt-2 leading-relaxed">
              Pick a handle and display name for Lounge posts.
            </div>
            <div className="mt-4 space-y-3">
              <label className="block">
                <span className="text-zinc-400 text-xs font-semibold uppercase tracking-wide">Profile photo</span>
                <div className="mt-1 flex items-center gap-3">
                  <label className="relative h-11 w-11 shrink-0 cursor-pointer overflow-hidden rounded-full border border-zinc-700 bg-zinc-950 grid place-items-center">
                    {profileGateAvatarPreview ? (
                      <img
                        src={profileGateAvatarPreview}
                        alt=""
                        className="h-full w-full object-cover"
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <span
                        className={`flex h-full w-full items-center justify-center text-xs font-bold text-white ${profileAvatarToneClass(
                          `${profileGateHandle}|${profileGateDisplayName}`
                        )}`}
                      >
                        {profileAvatarInitials(profileGateDisplayName, profileGateHandle)}
                      </span>
                    )}
                    <span
                      className="pointer-events-none absolute inset-0 flex items-center justify-center"
                      aria-hidden
                    >
                      <svg
                        viewBox="0 0 24 24"
                        className="h-1/2 w-1/2 text-cyan-400"
                        fill="none"
                        aria-hidden
                      >
                        <path
                          d="M12 4v16M4 12h16"
                          stroke="currentColor"
                          strokeWidth="2.2"
                          strokeLinecap="round"
                        />
                      </svg>
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const input = e.target
                        const file = input.files?.[0] || null
                        try {
                          input.value = ''
                        } catch {
                          // ignore
                        }
                        if (!file) return
                        if (!isProbablyImageFile(file)) {
                          setProfileGateErr('Please choose an image file.')
                          return
                        }
                        setProfileGateErr('')
                        setProfileGateAvatarCropFile(file)
                      }}
                    />
                  </label>
                </div>
              </label>
              <label className="block">
                <span className="text-zinc-400 text-xs font-semibold uppercase tracking-wide">Display name</span>
                <input
                  value={profileGateDisplayName}
                  onChange={(e) => setProfileGateDisplayName(e.target.value)}
                  maxLength={24}
                  className="mt-1 w-full min-h-11 rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-white text-[16px] focus:outline-none focus:ring-2 focus:ring-cyan-500/40 touch-manipulation"
                  placeholder="Bryan"
                />
              </label>
              <label className="block">
                <span className="text-zinc-400 text-xs font-semibold uppercase tracking-wide">Handle</span>
                <input
                  value={profileGateHandle ? `@${profileGateHandle}` : '@'}
                  onChange={(e) => setProfileGateHandle(handleSlugFromAtInput(e.target.value))}
                  className="mt-1 w-full min-h-11 rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-white text-[16px] outline-none focus:ring-2 focus:ring-cyan-500/40 touch-manipulation"
                  placeholder="@your_handle"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                />
              </label>
              <div className="block">
                <span className="text-zinc-400 text-xs font-semibold uppercase tracking-wide">Tribes</span>
                <LoungePostCategoryPillPicker
                  value={profileGateCategoryPills}
                  onChange={setProfileGateCategoryPills}
                  disabled={profileGateBusy}
                  maxPills={null}
                  collapsibleSingleRow={false}
                  sortAlphabetically
                  hint="Choose your tribes - helps us to deliver you better results."
                />
              </div>
              {profileGateErr ? (
                <div className="rounded-xl border border-rose-500/45 bg-rose-950/25 px-3 py-2 text-rose-200 text-xs leading-relaxed break-words whitespace-pre-wrap">
                  {profileGateErr}
                </div>
              ) : null}
            </div>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setProfileGateAvatarCropFile(null)
                  setProfileGateOpen(false)
                }}
                className="flex-1 min-h-10 rounded-xl bg-zinc-800 text-zinc-100 font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void saveProfileGate()}
                disabled={profileGateBusy}
                className="flex-1 min-h-10 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-semibold disabled:opacity-60"
              >
                {profileGateBusy ? 'Saving…' : 'Save profile'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <ProfileAvatarCropModal
        open={Boolean(profileGateAvatarCropFile)}
        file={profileGateAvatarCropFile}
        onCancel={onProfileGateAvatarCropCancel}
        onApply={onProfileGateAvatarCropApply}
      />

      <ProfileHandleConflictDialog
        open={Boolean(profileGateHandleConflict)}
        busy={profileGateBusy}
        requestedHandle={profileGateHandleConflict?.requestedHandle}
        reason={profileGateHandleConflict?.reason}
        suggestedHandle={profileGateHandleConflict?.suggestedHandle}
        onCancel={() => setProfileGateHandleConflict(null)}
        onUseSuggested={(next) => {
          if (!next) return
          setProfileGateHandle(String(next))
          setProfileGateHandleConflict(null)
          void saveProfileGate({ forcedHandle: next })
        }}
      />
    </>
  )
}

export default function GuidesScreen({
  supabaseClient,
  onOpenCalculator,
  onOpenLogbook = null,
  onNavigateHome,
  onCommunityPosted,
  onRequireAuth,
  hasSlotsEdge = false,
  isStaff = false,
  isAdmin = false,
  gatesMap = null,
  gatesDbReady = false,
  onSetContentGate,
  onRequireSubscribe,
  canCreatePlayLog = true,
  playLogsRemaining = null,
  freemiumUsageLoading = false,
  titleBarNavSlot = null,
  /** When set, scroll to and expand this guide card slug (used by Lounge guide embed tap). */
  openCardSlug = null,
  titleBarToolCloseVisible = false,
}) {
  const [query, setQuery] = useState('')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState('')
  const [expandedSlug, setExpandedSlug] = useState(null)
  const [askFor, setAskFor] = useState(null)

  // Deep-link: when openCardSlug is provided (from Lounge guide embed tap), expand + scroll to card
  useEffect(() => {
    if (!openCardSlug || loading) return
    const slug = normalizeGuideAccessSlug(openCardSlug)
    if (!slug) return
    setExpandedSlug(slug)
    setTimeout(() => {
      document.getElementById(`guide-card-${slug}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 120)
  }, [openCardSlug, loading])
  const [gateBusySlug, setGateBusySlug] = useState(null)
  /** @type {[null | { guideId: string, machineId: string | null, slug: string, name: string }, import('react').Dispatch<import('react').SetStateAction<null | { guideId: string, machineId: string | null, slug: string, name: string }>>]} */
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const guideCardRefs = useRef(Object.create(null))
  /** After collapse, scroll this slug's card header back into view (see useLayoutEffect). */
  const collapseScrollSlugRef = useRef(null)

  const collapseGuideCard = useCallback((rawSlug) => {
    const slug = normalizeGuideAccessSlug(rawSlug)
    if (!slug) return
    collapseScrollSlugRef.current = slug
    setExpandedSlug(null)
  }, [])
  const access = useMemo(
    () => ({ isStaff, hasSlotsEdge, gatesMap, browseMode: 'member' }),
    [isStaff, hasSlotsEdge, gatesMap],
  )

  const openGuideSlug = useCallback(
    (rawSlug) => {
      const slug = normalizeGuideAccessSlug(rawSlug)
      if (!slug) return
      if (!canOpenGuide(slug, { isStaff, hasSlotsEdge, gatesMap })) {
        onRequireSubscribe?.('slots-edge')
        return
      }
      setQuery('')
      setExpandedSlug(slug)
    },
    [gatesMap, hasSlotsEdge, isStaff, onRequireSubscribe],
  )

  const toggleGuideExpanded = useCallback(
    (rawSlug) => {
      const slug = normalizeGuideAccessSlug(rawSlug)
      if (!slug) return
      const isExpanded =
        expandedSlug != null && String(expandedSlug).toLowerCase() === String(slug).toLowerCase()
      if (isExpanded) {
        collapseGuideCard(slug)
        return
      }
      if (!canOpenGuide(slug, { isStaff, hasSlotsEdge, gatesMap })) {
        onRequireSubscribe?.('slots-edge')
        return
      }
      setExpandedSlug(slug)
    },
    [expandedSlug, gatesMap, hasSlotsEdge, isStaff, onRequireSubscribe, collapseGuideCard],
  )

  useEffect(() => {
    if (!expandedSlug || isStaff || hasSlotsEdge) return
    if (!guideRequiresSlotsEdge(expandedSlug, gatesMap)) return
    onRequireSubscribe?.('slots-edge')
    setExpandedSlug(null)
  }, [expandedSlug, gatesMap, hasSlotsEdge, isStaff, onRequireSubscribe])

  const handleAdminGuideLockToggle = useCallback(
    async (slug, locked) => {
      if (!isAdmin || !gatesDbReady || !onSetContentGate) return
      const normalized = normalizeGuideAccessSlug(slug)
      if (!normalized) return
      setGateBusySlug(normalized)
      try {
        await onSetContentGate('guide', normalized, locked)
      } finally {
        setGateBusySlug(null)
      }
    },
    [gatesDbReady, isAdmin, onSetContentGate],
  )

  const handleAdminDeleteGuide = useCallback(async () => {
    if (!deleteConfirm || !supabaseClient) return
    const { guideId, machineId, slug } = deleteConfirm
    const normalized = normalizeGuideAccessSlug(slug)
    setDeleteBusy(true)
    setLoadErr('')
    try {
      if (normalized) {
        const { error: gateErr } = await supabaseClient
          .from('content_access_gates')
          .delete()
          .eq('content_kind', 'guide')
          .eq('content_key', normalized)
        if (gateErr && !gateErr.message?.includes('content_access_gates')) throw gateErr
      }
      const { error: guideErr } = await supabaseClient.from('guides').delete().eq('id', guideId)
      if (guideErr) {
        if (guideErr.message?.includes('policy') || guideErr.code === '42501') {
          throw new Error(
            'Delete blocked by RLS. Apply migration 20260610180000_guide_admin_delete_rls.sql on test Supabase.',
          )
        }
        throw guideErr
      }
      if (machineId) {
        const { error: machineErr } = await supabaseClient.from('machines').delete().eq('id', machineId)
        if (machineErr) throw machineErr
      }
      setRows((prev) => prev.filter((r) => r.id !== guideId))
      if (
        expandedSlug != null &&
        normalized &&
        String(expandedSlug).toLowerCase() === String(normalized).toLowerCase()
      ) {
        setExpandedSlug(null)
      }
      setDeleteConfirm(null)
    } catch (err) {
      setLoadErr(err instanceof Error ? err.message : String(err))
    } finally {
      setDeleteBusy(false)
    }
  }, [deleteConfirm, expandedSlug, supabaseClient])

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
          card_accent_color,
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
            popularity,
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
        const missingPopularityCol =
          error.message?.includes('popularity') &&
          (error.message?.includes('machines') || error.message?.includes('column'))
        if (missingPopularityCol) {
          const { data: dPop, error: ePop } = await supabaseClient.from('guides').select(`
              id,
              slug,
              title,
              content_markdown,
              card_ev_threshold,
              card_accent_color,
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
          if (ePop) throw ePop
          setRows(await mergeGuideAccentColors(supabaseClient, mergeLocalGuideDemos(dPop || [])))
        } else {
        const missingOptionalCols =
          error.message?.includes('volatility_index') ||
          error.message?.includes('popularity_summary') ||
          error.message?.includes('card_ev_threshold') ||
          error.message?.includes('card_accent_color') ||
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
              card_ev_threshold,
              card_accent_color,
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
                popularity,
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
          const merged = mergeLocalGuideDemos(d2 || [])
          setRows(await mergeGuideAccentColors(supabaseClient, merged))
        } else {
          throw error
        }
        }
      } else {
        setRows(await mergeGuideAccentColors(supabaseClient, mergeLocalGuideDemos(data || [])))
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
    const reduceMotion =
      typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    const scrollCardToStart = (slug) => {
      if (!slug) return
      const el =
        guideCardRefs.current[slug] ?? document.getElementById(`guide-card-${slug}`)
      if (!(el instanceof HTMLElement)) return
      el.scrollIntoView({ block: 'start', inline: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' })
    }

    if (expandedSlug) {
      scrollCardToStart(expandedSlug)
      return
    }

    const collapseSlug = collapseScrollSlugRef.current
    if (!collapseSlug) return
    collapseScrollSlugRef.current = null
    scrollCardToStart(collapseSlug)
  }, [expandedSlug])

  /** Title + Skins only (not hunt copy, manufacturer, slug, or MHB keyword blobs). */
  const searchHaystackByRowId = useMemo(() => {
    /** @type {Record<string, string>} */
    const map = Object.create(null)
    for (const r of rows) {
      const mx = machineForGuide(r)
      const cardTitle = (mx?.name || r.title || '').toLowerCase()
      const guideTitle = (r.title || '').toLowerCase()
      const skins = parseGuideMarkdown(r.content_markdown || '').skins_markdown.toLowerCase()
      map[r.id] = [cardTitle, guideTitle !== cardTitle ? guideTitle : '', skins].filter(Boolean).join('\n')
    }
    return map
  }, [rows])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) => searchHaystackByRowId[r.id]?.includes(q))
  }, [rows, query, searchHaystackByRowId])

  return (
    <>
      <ScrollLinkedEdgeTitleBarShell
        titleBarNavSlot={titleBarNavSlot}
        titleBarToolCloseVisible={titleBarToolCloseVisible}
        contentClassName="px-3 pt-3 pb-[calc(6rem+env(safe-area-inset-bottom,0px))]"
      >
        <SlotsToolPageHeader quickLinkDestinationId="guides" />
        <h1 className="sr-only">AP Guides</h1>
        {isAdmin && !gatesDbReady ? (
          <p className="mb-4 text-xs text-fuchsia-300/90">
            Apply migration `20260526150000_content_access_gates.sql` to enable admin lock switches.
          </p>
        ) : null}

      <label className="block mb-5">
        <span className="sr-only">Search guides</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search title or skin…"
          className="ap-guides-search-input w-full min-h-12 rounded-2xl bg-zinc-900 border border-zinc-700 px-4 py-3 text-white text-base placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
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
            const cardSlug = normalizeGuideAccessSlug(slug) || slug
            const expanded =
              expandedSlug != null &&
              String(expandedSlug).toLowerCase() === String(cardSlug || '').toLowerCase()
            const calcKey = resolveCalculatorKey(m)
            const evThresholdLine = cardEvThresholdForRow(row)
            const accent = resolveGuideAccent({
              slug,
              cardAccentColor: row.card_accent_color,
            })
            const heroThumb = heroImage(row)
            const guideLocked = showGuideLock(slug, access)
            const adminGuideLocked = guideRequiresSlotsEdge(slug, gatesMap)
            const guideLockedCollapsed = guideLocked && !expanded
            const lockedSectionBlurClass = guideLockedCollapsed
              ? 'blur-[3px] brightness-[0.72] saturate-[0.9] select-none'
              : ''
            const normalizedGuideSlug = normalizeGuideAccessSlug(slug)
            const ringFocus = accent.ringFocus || 'focus-visible:ring-amber-500/60'
            const heroGrad =
              accent.mode === 'hex'
                ? accent.heroGradientClass
                : `bg-gradient-to-br ${accent.heroGradientClass}`

            return (
              <li key={row.id || row.slug} id={`guide-card-${cardSlug}`}>
                <article
                  ref={(el) => {
                    if (el) guideCardRefs.current[cardSlug] = el
                    else delete guideCardRefs.current[cardSlug]
                  }}
                  style={accent.cssVars}
                  onClick={
                    expanded
                      ? (e) => {
                          if (shouldIgnoreGuideCardCollapseClick(e)) return
                          collapseGuideCard(cardSlug)
                        }
                      : undefined
                  }
                  className={[
                    'rounded-3xl border overflow-hidden bg-zinc-900 scroll-mt-14 transition-[box-shadow,border-color,ring-color] duration-200',
                    accent.mode === 'hex' ? 'guide-accent-themed' : '',
                    expanded ? 'guide-card-expanded-tap-collapse touch-manipulation' : '',
                    expanded
                      ? accent.mode === 'hex'
                        ? `${accent.expandedBorder} guide-accent-expanded`
                        : `${accent.expandedBorder} ring-1 ring-white/[0.07] shadow-2xl`
                      : 'border-zinc-700/85 ring-1 ring-zinc-500/15 shadow-[0_12px_40px_-8px_rgba(0,0,0,0.65)]',
                  ].join(' ')}
                >
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => toggleGuideExpanded(slug)}
                      className={`w-full text-left touch-manipulation focus:outline-none focus-visible:ring-2 ${ringFocus}`}
                      aria-expanded={expanded}
                    >
                      <div
                        className={`relative w-full ${heroGrad} ${
                          expanded ? 'flex justify-center overflow-hidden' : 'h-[10.5rem] overflow-hidden'
                        }`}
                      >
                        {isAdmin ? (
                          <div className="absolute inset-x-3 top-3 z-20 flex items-start justify-between gap-2 pointer-events-none">
                            {!isLocalDemoGuide(row) ? (
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  setDeleteConfirm({
                                    guideId: row.id,
                                    machineId: m?.id ?? null,
                                    slug,
                                    name: m?.name || row.title || slug,
                                  })
                                }}
                                className="pointer-events-auto shrink-0 rounded-xl border border-red-500/70 bg-red-950/75 px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wide text-red-200 backdrop-blur-sm hover:bg-red-950/95 touch-manipulation [-webkit-tap-highlight-color:transparent]"
                              >
                                Delete
                              </button>
                            ) : (
                              <span className="pointer-events-none" aria-hidden />
                            )}
                            <div className="pointer-events-auto shrink-0">
                              <ContentAccessAdminSwitch
                                locked={adminGuideLocked}
                                busy={gateBusySlug === normalizedGuideSlug}
                                disabled={!gatesDbReady}
                                label={`${m?.name || row.title} Slots Edge lock`}
                                onLockedChange={(nextLocked) =>
                                  void handleAdminGuideLockToggle(slug, nextLocked)
                                }
                              />
                            </div>
                          </div>
                        ) : null}
                        {heroThumb ? (
                          <img
                            src={heroThumb}
                            alt=""
                            className={
                              expanded
                                ? 'guide-card-hero-img-expanded opacity-95'
                                : 'h-full w-full object-cover opacity-95'
                            }
                            onError={hideGuideHeroOnError}
                          />
                        ) : null}
                        <div className="guide-hero-scrim pointer-events-none absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent" />
                        <div className="guide-hero-footer pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/85 to-transparent px-4 pb-3 pt-12">
                          <div className="flex items-end justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <h2 className="text-[#fff] font-black text-xl tracking-tight drop-shadow-md leading-tight">
                                {m?.name || row.title}
                              </h2>
                              <div className={`${accent.subtitle} text-[11px] font-semibold mt-0.5`}>
                                {m?.manufacturer || '-'}
                              </div>
                            </div>
                            <div className="shrink-0 text-right leading-tight pb-px">
                              <div className="text-[9px] font-semibold uppercase tracking-wider text-[#a1a1aa]">
                                Released
                              </div>
                              <div className="text-[11px] font-bold tabular-nums text-[#e4e4e7] drop-shadow-md">
                                {m?.release_year != null ? m.release_year : '-'}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className={`p-4 space-y-3 ${lockedSectionBlurClass}`}>
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
                          <div className="text-zinc-200 font-semibold mt-0.5 leading-snug">{m?.type || '-'}</div>
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

                    <div className={`px-4 pb-4 flex flex-col gap-2 border-t border-zinc-800/80 pt-3 -mt-px ${lockedSectionBlurClass}`}>
                      <div className="flex flex-col gap-2">
                        {!calcKey && onOpenLogbook ? (
                          <FreemiumUsageCounter
                            remaining={playLogsRemaining}
                            limit={FREE_PLAY_LOG_LIMIT}
                            itemLabelPlural="play logs"
                            loading={freemiumUsageLoading}
                            compact
                            className="!mt-0 !mb-0 text-left"
                          />
                        ) : null}
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
                        ) : onOpenLogbook ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              if (!canCreatePlayLog) {
                                onRequireSubscribe?.('slots-edge')
                                return
                              }
                              const machineSlug = m?.slug || row.slug
                              if (!machineSlug) return
                              stashPlayLogPrefill({ templateSlug: machineSlug })
                              onOpenLogbook()
                            }}
                            className={`flex-1 min-h-11 rounded-2xl text-white text-sm font-bold touch-manipulation ${LOG_PLAY_LOGBOOK_BTN_CLASS} ${
                              !canCreatePlayLog ? 'opacity-45 cursor-not-allowed' : ''
                            }`}
                            data-log-play-logbook-btn
                            data-log-play-logbook-locked={!canCreatePlayLog ? 'true' : undefined}
                          >
                            Log play in Logbook
                          </button>
                        ) : null}
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
                    </div>

                    {guideLockedCollapsed ? (
                      <GuideLockedPaywallOverlay
                        onUnlock={() => onRequireSubscribe?.('slots-edge', { directCheckout: true })}
                      />
                    ) : null}
                  </div>

                  {expanded ? (
                    <div className="guide-markdown-body border-t border-zinc-800 px-4 py-5 bg-zinc-950/90 text-sm max-w-none">
                      <ReactMarkdown
                        urlTransform={guideMarkdownUrlTransform}
                        remarkPlugins={[remarkGfm]}
                        components={makeGuideMarkdownComponents(accent, { onOpenGuideSlug: openGuideSlug, allGuides: rows })}
                      >
                        {guideMarkdownForDisplay(row.content_markdown || '')}
                      </ReactMarkdown>
                    </div>
                  ) : null}
                </article>
              </li>
            )
          })}
        </ul>
      )}

      </ScrollLinkedEdgeTitleBarShell>

      {deleteConfirm ? (
        <div
          className="fixed inset-0 z-[115] flex items-center justify-center p-4 bg-black/75"
          role="dialog"
          aria-modal
          aria-labelledby="guide-delete-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl">
            <h2 id="guide-delete-title" className="text-lg font-bold text-white">
              Delete AP guide?
            </h2>
            <p className="mt-2 text-sm text-zinc-300 leading-relaxed">
              Remove <strong className="text-white">{deleteConfirm.name}</strong>{' '}
              (<code className="text-zinc-400">{deleteConfirm.slug}</code>) from the app on this
              environment. This deletes the Supabase <code className="text-zinc-400">guides</code> and{' '}
              <code className="text-zinc-400">machines</code> rows (and related access gates). Cloud
              images in R2/Storage are not removed automatically.
            </p>
            <div className="mt-5 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
              <button
                type="button"
                disabled={deleteBusy}
                onClick={() => setDeleteConfirm(null)}
                className="min-h-11 rounded-xl border border-zinc-600 px-4 py-2 text-sm font-semibold text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleteBusy}
                onClick={() => void handleAdminDeleteGuide()}
                className="min-h-11 rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-500 disabled:opacity-50"
              >
                {deleteBusy ? 'Deleting…' : 'Delete guide'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <AskCommunityModal
        open={!!askFor}
        guideRow={askFor}
        onClose={() => setAskFor(null)}
        supabaseClient={supabaseClient}
        onRequireAuth={onRequireAuth}
        onPosted={() => {
          onCommunityPosted?.()
          onNavigateHome?.()
        }}
      />
    </>
  )
}
