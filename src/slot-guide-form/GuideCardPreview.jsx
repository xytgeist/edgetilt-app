/**
 * GuideCardPreview - pixel-faithful replica of the AP guide card (both views).
 * Mirrors the exact logic/classes from GuidesScreen so what you see here is
 * what renders in the app. Togglable collapsed ↔ expanded.
 *
 * Props:
 *   guide            - guide fields (slug, title, card_ev_threshold, created_at, updated_at)
 *   machine          - machine fields (name, manufacturer, type, volatility_index, …)
 *   heroFile         - optional File for a newly chosen hero image (local preview)
 *   heroUrl          - existing stored hero URL
 *   contentMarkdown  - assembled markdown string for the expanded view
 */
import { useMemo, useState, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { guideMarkdownForDisplay } from './formUtils.js'
import { useBlobObjectUrl } from './guideImageUtils.js'
import { extractAccentFromImageFile, resolveGuideAccent } from '../utils/guideCardAccent.js'

// ─── ratings helpers ──────────────────────────────────────────────────────────
function volatilityLabel(m) {
  if (!m) return '-'
  const vi = typeof m.volatility_index === 'string' ? m.volatility_index.trim() : m.volatility_index
  if (vi != null && vi !== '') return vi
  if (m.nerf_risk && m.difficulty) return `${m.difficulty} play / ${m.nerf_risk} nerf risk`
  return m.difficulty || m.nerf_risk || '-'
}

function machinePopularity(m) {
  if (!m) return ''
  return m.popularity ?? m.vegas_availability ?? ''
}

function popularityLabel(m) {
  if (!m) return '-'
  const pop = machinePopularity(m)
  return pop || '-'
}

function volatilityCount(m) {
  if (!m) return 3
  const label = volatilityLabel(m)
  const blob = `${m.volatility_index || ''} ${label}`.toLowerCase()
  if (/\bmed-?high\b|\bmedium[- ]high\b/.test(blob)) return 4
  if (/\blow[- –]medium\b/.test(blob)) return 2
  if (/\bhigh\b/.test(blob)) return 5
  if (/\bmedium\b/.test(blob)) return 3
  if (/\blow\b/.test(blob)) return 1
  const nerf = String(m.nerf_risk || '').toLowerCase().trim()
  if (nerf === 'high') return 5
  if (nerf === 'medium') return 3
  if (nerf === 'low') return 2
  const diff = String(m.difficulty || '').toLowerCase().trim()
  if (diff === 'advanced') return 4
  if (diff === 'beginner') return 2
  if (diff === 'intermediate') return 3
  return 3
}

function popularityCount(m) {
  if (!m) return 3
  const h = machinePopularity(m).toLowerCase()
  if (h.includes('extremely common')) return 5
  if (h.includes('abundant')) return 4
  if (h.includes('very common')) return 4
  if (h.includes('uncommon')) return 2
  if (h.includes('rare')) return 1
  if (h.includes('common')) return 3
  return 3
}

function lightningMeter(n) { return '⚡'.repeat(Math.min(5, Math.max(1, n))) }
function fireMeter(n)      { return '🔥'.repeat(Math.min(5, Math.max(1, n))) }

// ─── markdown helpers ─────────────────────────────────────────────────────────
function flattenText(children) {
  if (typeof children === 'string' || typeof children === 'number') return String(children)
  if (!Array.isArray(children)) return ''
  return children.map((c) => {
    if (typeof c === 'string' || typeof c === 'number') return String(c)
    if (c && typeof c === 'object' && 'props' in c) return flattenText(c.props?.children)
    return ''
  }).join('')
}

function tintRGB(children) {
  const raw = flattenText(children).trim().toLowerCase()
  if (raw === 'red')   return <span className="text-red-400 font-semibold">{children}</span>
  if (raw === 'green') return <span className="text-emerald-400 font-semibold">{children}</span>
  if (raw === 'blue')  return <span className="text-sky-400 font-semibold">{children}</span>
  return children
}

// ─── preview skin card (mirrors GuideSkinCard in GuidesScreen) ───────────────
function resolveGuideHero(row) {
  if (!row) return null
  const m = Array.isArray(row.machines) ? row.machines[0] : row.machines
  let thumb = row.thumbnail_url || m?.thumbnail_url
  if (typeof thumb === 'string' && /buffalo-icon\.png/i.test(thumb)) thumb = null
  const trimmed = typeof thumb === 'string' ? thumb.trim() : ''
  return trimmed || null
}

function PreviewSkinCard({ targetSlug, label, allGuides }) {
  const row = allGuides?.find((g) => {
    const m = Array.isArray(g.machines) ? g.machines[0] : g.machines
    return (m?.slug || g.slug) === targetSlug
  })
  const m = row ? (Array.isArray(row.machines) ? row.machines[0] : row.machines) : null
  const name = m?.name || row?.title || label
  const src = resolveGuideHero(row)
  const accent = resolveGuideAccent({
    slug: m?.slug || targetSlug,
    cardAccentColor: row?.card_accent_color,
  })
  const heroGrad =
    accent.mode === 'hex'
      ? accent.heroGradientClass
      : `bg-gradient-to-br ${accent.heroGradientClass}`

  return (
    <div className={[
      'group my-3 w-full rounded-2xl overflow-hidden border border-zinc-700/80',
      accent.mode === 'hex' ? 'guide-accent-themed' : '',
      'bg-zinc-900 shadow-[0_6px_24px_-4px_rgba(0,0,0,0.55)]',
    ].join(' ')}
    style={accent.cssVars}
    >
      <div className={`relative h-24 ${heroGrad} overflow-hidden`}>
        {src ? (
          <img
            src={src}
            alt={name}
            className="h-full w-full object-cover opacity-90"
            onError={(e) => { e.currentTarget.style.display = 'none' }}
          />
        ) : null}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-zinc-950/80 via-zinc-950/15 to-transparent" />
        <div className="absolute bottom-0 inset-x-0 px-3 pb-2 pt-6 bg-gradient-to-t from-zinc-950/90 via-zinc-950/60 to-transparent">
          <p className="text-white font-bold text-sm leading-tight drop-shadow truncate">{name}</p>
          {m?.manufacturer && (
            <p className="text-zinc-400 text-[11px] font-medium mt-0.5 truncate">{m.manufacturer}</p>
          )}
        </div>
      </div>
      <div className="flex items-center justify-between px-3 py-2 border-t border-zinc-800/70 bg-zinc-950/60">
        <span className="text-[11px] font-semibold text-cyan-400">
          {row ? 'View guide →' : 'Guide coming soon'}
        </span>
        {!row && <span className="text-[10px] text-zinc-600 italic">No card yet</span>}
      </div>
    </div>
  )
}

function makeMarkdownComponents(accent, allGuides) {
  const { h2Tone, hrVia, titleBarTo } = accent
  return {
    h1: ({ children }) => (
      <div className="flex items-center gap-3 w-full mb-5 mt-0.5 select-none">
        <span className={`h-0.5 flex-1 min-w-[0.75rem] rounded-full bg-gradient-to-r from-zinc-800/20 ${titleBarTo}`} aria-hidden />
        <h1 className="text-center text-[1.35rem] leading-tight font-black text-white tracking-tight m-0 px-1 shrink-0 max-w-[85%]">{children}</h1>
        <span className={`h-0.5 flex-1 min-w-[0.75rem] rounded-full bg-gradient-to-l from-zinc-800/20 ${titleBarTo}`} aria-hidden />
      </div>
    ),
    h2: ({ children }) => (
      <h2 className={`guide-section-heading text-lg font-black ${h2Tone} mt-6 first:mt-0 mb-2`}>{children}</h2>
    ),
    h3: ({ children }) => <h3 className="text-base font-bold text-zinc-100 mt-4 mb-1.5">{children}</h3>,
    p:  ({ children }) => <p className="text-zinc-300 leading-relaxed mb-3 last:mb-0">{children}</p>,
    ul: ({ children }) => <ul className="list-disc pl-5 space-y-1.5 text-zinc-300 mb-3">{children}</ul>,
    ol: ({ children }) => <ol className="list-decimal pl-5 space-y-1.5 text-zinc-300 mb-3">{children}</ol>,
    li: ({ children }) => <li className="leading-relaxed">{children}</li>,
    strong: ({ children }) => <strong className="text-white font-semibold">{children}</strong>,
    a: ({ href, children }) => {
      if (typeof href === 'string') {
        const gm = /^guide:/i.exec(href)
        if (gm) {
          const target = href.slice(gm[0].length).trim().replace(/^\/+|\/+$/g, '')
          if (target) {
            const label = flattenText(children)
            return <PreviewSkinCard targetSlug={target} label={label} allGuides={allGuides} />
          }
        }
      }
      return <a href={href} className="text-cyan-400 underline font-medium hover:text-cyan-300">{children}</a>
    },
    img: ({ src, alt }) => (
      <img src={src} alt={alt ?? ''} className="max-w-full h-auto rounded-xl border border-zinc-800/90 my-4 block" loading="lazy" decoding="async" />
    ),
    table: ({ children }) => (
      <div className="my-4 overflow-x-auto rounded-xl border border-zinc-800/90">
        <table className="min-w-full border-collapse text-sm text-zinc-200">{children}</table>
      </div>
    ),
    thead: ({ children }) => <thead className="bg-zinc-900/80">{children}</thead>,
    tbody: ({ children }) => <tbody className="divide-y divide-zinc-800/70">{children}</tbody>,
    tr:    ({ children }) => <tr className="odd:bg-zinc-950/55 even:bg-zinc-950/25">{children}</tr>,
    th:    ({ children }) => <th className="px-3 py-2 text-left font-bold uppercase tracking-wide text-zinc-100">{tintRGB(children)}</th>,
    td:    ({ children }) => <td className="px-3 py-2 align-top">{tintRGB(children)}</td>,
    hr: () => (
      <hr role="separator" className={`my-7 border-0 h-0.5 w-full max-w-full rounded-full bg-gradient-to-r from-zinc-800/30 ${hrVia} to-zinc-800/30`} />
    ),
  }
}

// ─── icons ────────────────────────────────────────────────────────────────────
function IconEvTrendingUp({ className }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden>
      <path d="M3.5 13.5L8.25 8.75l2.75 2.75 5-6" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12.25 5.25h4.5v4.5"              stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function fmtDate(iso) {
  if (!iso) return '-'
  try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }
  catch { return '-' }
}

// ─── main component ───────────────────────────────────────────────────────────
export default function GuideCardPreview({
  guide = {},
  machine = {},
  heroFile = null,
  heroUrl = null,
  contentMarkdown = '',
  guideList = [],
}) {
  const [expanded, setExpanded] = useState(false)
  const [pendingHeroAccent, setPendingHeroAccent] = useState(null)

  const slug = machine.slug || guide.slug || ''
  const heroBlobUrl = useBlobObjectUrl(heroFile)
  const heroSrc = heroBlobUrl || heroUrl || null

  useEffect(() => {
    if (!heroFile) {
      setPendingHeroAccent(null)
      return
    }
    let cancelled = false
    extractAccentFromImageFile(heroFile).then((hex) => {
      if (!cancelled) setPendingHeroAccent(hex)
    })
    return () => { cancelled = true }
  }, [heroFile])

  const accent = useMemo(
    () => resolveGuideAccent({
      slug,
      cardAccentColor: pendingHeroAccent || guide.card_accent_color,
    }),
    [slug, pendingHeroAccent, guide.card_accent_color],
  )
  const mdComponents = useMemo(() => makeMarkdownComponents(accent, guideList), [accent, guideList])

  const heroGrad =
    accent.mode === 'hex'
      ? accent.heroGradientClass
      : `bg-gradient-to-br ${accent.heroGradientClass}`

  const evLine = guide.card_ev_threshold?.trim() || 'Verify +EV on the glass - open guide'
  const calcKey = machine.has_calculator
    ? (machine.calculator_slug || machine.slug || slug)
    : null

  const vLabel = volatilityLabel(machine)
  const pLabel = popularityLabel(machine)
  const vCount = volatilityCount(machine)
  const pCount = popularityCount(machine)

  return (
    <article
      style={accent.cssVars}
      onClick={
        expanded
          ? (e) => {
              const target = e.target
              if (!(target instanceof Element)) return
              if (target.closest('a, button, input, textarea, select')) return
              setExpanded(false)
            }
          : undefined
      }
      className={[
        'rounded-3xl border overflow-hidden bg-zinc-900',
        accent.mode === 'hex' ? 'guide-accent-themed' : '',
        expanded ? 'guide-card-expanded-tap-collapse touch-manipulation' : '',
        expanded
          ? accent.mode === 'hex'
            ? `${accent.expandedBorder} guide-accent-expanded`
            : `${accent.expandedBorder} ring-1 ring-white/[0.07] shadow-2xl`
          : 'border-zinc-700/85 ring-1 ring-zinc-500/15 shadow-[0_12px_40px_-8px_rgba(0,0,0,0.65)]',
      ].join(' ')}
    >
      {/* ── HERO ── */}
      <button
        type="button"
        onClick={() => setExpanded((x) => !x)}
        className="w-full text-left touch-manipulation focus:outline-none"
        aria-expanded={expanded}
        title={expanded ? 'Collapse preview' : 'Expand preview'}
      >
        <div
          className={[
            `relative w-full ${heroGrad}`,
            expanded ? 'flex justify-center overflow-hidden' : 'h-[10.5rem] overflow-hidden',
          ].join(' ')}
        >
          {heroSrc ? (
            <img
              src={heroSrc}
              alt={machine.name || guide.title || 'Guide hero'}
              className={expanded
                ? 'guide-card-hero-img-expanded opacity-95'
                : 'h-full w-full object-cover opacity-95'}
              onError={(e) => { e.currentTarget.style.display = 'none' }}
            />
          ) : null}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/20 to-transparent" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-zinc-950 via-zinc-950/85 to-transparent px-4 pb-3 pt-12">
            <div className="flex items-end justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="text-white font-black text-xl tracking-tight drop-shadow-md leading-tight">
                  {machine.name || guide.title || <span className="text-zinc-500 italic">Machine name</span>}
                </h2>
                <div className={`${accent.subtitle} text-[11px] font-semibold mt-0.5`}>
                  {machine.manufacturer || <span className="text-zinc-600 italic">Manufacturer</span>}
                </div>
              </div>
              <div className="shrink-0 text-right leading-tight pb-px">
                <div className="text-[9px] font-semibold uppercase tracking-wider text-zinc-400/95">Released</div>
                <div className="text-[11px] font-bold tabular-nums text-zinc-100 drop-shadow-md">
                  {machine.release_year ?? '-'}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── SUMMARY ── */}
        <div className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-xl bg-zinc-950/80 px-3 py-2 border border-zinc-800">
              <div className="text-zinc-500 font-semibold uppercase tracking-wide text-[10px]">Volatility</div>
              <div className="text-amber-300 mt-0.5">
                <span className="inline-block origin-left scale-[0.65] text-sm leading-none" title={`${vCount} of 5`}>
                  {lightningMeter(vCount)}
                </span>
              </div>
              <div className="text-zinc-100 font-bold mt-0.5 leading-snug">{vLabel}</div>
            </div>

            <div className="rounded-xl bg-zinc-950/80 px-3 py-2 border border-zinc-800">
              <div className="text-zinc-500 font-semibold uppercase tracking-wide text-[10px]">Popularity</div>
              <div className="mt-0.5">
                <span className="inline-block origin-left scale-[0.65] text-sm leading-none" title={`${pCount} of 5`}>
                  {fireMeter(pCount)}
                </span>
              </div>
              <div className="text-zinc-100 font-bold mt-0.5 leading-snug">{pLabel}</div>
            </div>

            <div className="rounded-xl bg-zinc-950/80 px-3 py-2 border border-zinc-800 col-span-2">
              <div className="text-zinc-500 font-semibold uppercase tracking-wide text-[10px]">Type</div>
              <div className="text-zinc-200 font-semibold mt-0.5">
                {machine.type || <span className="text-zinc-600 italic">-</span>}
              </div>
            </div>
          </div>

          {/* +EV panel */}
          <div className={`guide-ev-threshold-panel ${accent.evTablesBox}`}>
            <div className={`guide-ev-threshold-head flex items-center gap-2 ${accent.evTablesHead} text-[10px] font-bold uppercase tracking-[0.2em]`}>
              <IconEvTrendingUp className="h-3.5 w-3.5 shrink-0" />
              +EV Threshold
            </div>
            <div className={accent.evTablesRule}>
              <p className={`guide-ev-threshold-text text-base font-normal leading-snug ${accent.strong}`}>
                {evLine || <span className="text-zinc-500 italic">Enter +EV threshold above</span>}
              </p>
            </div>
          </div>

          {/* Dates + tap hint */}
          <div className="flex flex-col gap-2 pt-2 border-t border-zinc-800/80 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <div className="flex flex-wrap gap-x-3 gap-y-0.5">
              {guide.created_at && (
                <span className="text-[10px] leading-snug text-zinc-500">
                  <span className="text-zinc-600">Added </span>
                  <span className="tabular-nums text-zinc-400">{fmtDate(guide.created_at)}</span>
                </span>
              )}
              {guide.updated_at && (
                <span className="text-[10px] leading-snug text-zinc-500">
                  <span className="text-zinc-600">Updated </span>
                  <span className="tabular-nums text-zinc-400">{fmtDate(guide.updated_at)}</span>
                </span>
              )}
            </div>
            <div className="inline-flex shrink-0 items-center gap-1.5 text-zinc-500 text-xs font-medium">
              <svg
                className={`h-3 w-3 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
                viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round" aria-hidden
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
              {expanded ? 'Tap to collapse' : 'Tap for full guide'}
            </div>
          </div>
        </div>
      </button>

      {/* ── ACTION BUTTONS ── */}
      <div className="px-4 pb-4 flex flex-col gap-2 border-t border-zinc-800/80 pt-3 -mt-px">
        <div className="flex gap-2">
          {calcKey && (
            <button type="button" className="flex-1 min-h-11 rounded-2xl bg-emerald-600 text-white text-sm font-bold cursor-default select-none">
              Open calculator
            </button>
          )}
          <button type="button" className="flex-1 min-h-11 rounded-2xl bg-cyan-700 text-white text-sm font-bold cursor-default select-none">
            Ask community
          </button>
        </div>
      </div>

      {/* ── EXPANDED MARKDOWN CONTENT ── */}
      {expanded && (
        <div className="guide-markdown-body border-t border-zinc-800 px-4 py-5 bg-zinc-950/90 text-sm max-w-none">
          {contentMarkdown ? (
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
              {guideMarkdownForDisplay(contentMarkdown)}
            </ReactMarkdown>
          ) : (
            <p className="text-zinc-500 italic text-sm text-center py-4">
              Fill in the guide sections above to preview the full content here.
            </p>
          )}
        </div>
      )}
    </article>
  )
}
