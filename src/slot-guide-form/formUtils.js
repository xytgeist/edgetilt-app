import { buildGuideMarkdown as buildGuideMarkdownCore } from '../../scripts/lib/slotGuideIngestCore.mjs'

export { diagramFilename, slugify } from '../../scripts/lib/slotGuideIngestCore.mjs'

export function slugifyInput(raw) {
  return String(raw ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+/, '')
    .replace(/-{2,}/g, '-')
}

function trimBody(text) {
  return String(text ?? '').trim()
}

const KNOWN_SECTION =
  /When to play|When to stop|How to check|Bankroll|Risk|Where to find|Skins|Gameplay/i

/**
 * Parse compiled guide markdown into structured section fields.
 * Preserves embedded markdown images (including R2 / Storage URLs).
 */
export function parseGuideMarkdown(markdown) {
  const out = {
    when_to_play: '', when_to_stop: '', how_to_check: '',
    risk_bankroll: '', risk_summary: '', risk_bullets: '',
    where_to_find: '',
    skins_markdown: '', gameplay_mechanics: '',
  }
  if (!markdown) return out

  const withoutH1 = markdown.replace(/^#\s[^\n]*\n+/, '')
  const cleaned = withoutH1.replace(/^---\s*\n/gm, '')
  const parts = cleaned.split(/^## /m)
  const orphans = []

  for (const part of parts) {
    if (!part.trim()) continue
    const nl = part.indexOf('\n')
    const header = nl === -1 ? part.trim() : part.slice(0, nl).trim()
    const body = nl === -1 ? '' : part.slice(nl + 1)

    if (/When to play/i.test(header)) {
      out.when_to_play = trimBody(body)
    } else if (/When to stop/i.test(header)) {
      out.when_to_stop = trimBody(body)
    } else if (/How to check/i.test(header)) {
      out.how_to_check = trimBody(body)
    } else if (/Bankroll on hand/i.test(header)) {
      out.risk_bankroll = trimBody(body)
    } else if (/Risk/i.test(header)) {
      const lines = body.split('\n')
      const summaryLines = []
      const bullets = []
      for (const line of lines) {
        const bm = line.match(/^\*\*Bankroll on hand:\s*(.+?)\*\*/)
        if (bm && !out.risk_bankroll) {
          out.risk_bankroll = bm[1].trim()
          continue
        }
        if (/^- /.test(line)) { bullets.push(line.slice(2).trim()); continue }
        summaryLines.push(line)
      }
      out.risk_summary = summaryLines.join('\n').trim()
      out.risk_bullets = bullets.join('\n')
    } else if (/Where to find/i.test(header)) {
      out.where_to_find = trimBody(body)
    } else if (/Skins/i.test(header)) {
      out.skins_markdown = trimBody(body)
    } else if (/Gameplay/i.test(header)) {
      out.gameplay_mechanics = trimBody(body)
    } else if (header && !KNOWN_SECTION.test(header)) {
      orphans.push(`## ${header}\n\n${trimBody(body)}`)
    }
  }

  if (orphans.length) {
    const block = orphans.join('\n\n')
    out.when_to_play = [out.when_to_play, block].filter(Boolean).join('\n\n\n')
  }

  return out
}

/** Optional sections hidden on the card when the compiled body is empty. */
const OPTIONAL_EMPTY_SECTION_HEADERS = [/Where to find/i]

/**
 * Strip optional guide sections that have no body (legacy rows with a bare ## header).
 * @param {string} markdown
 */
export function guideMarkdownForDisplay(markdown) {
  if (!markdown) return ''
  let out = markdown
  for (const headerTest of OPTIONAL_EMPTY_SECTION_HEADERS) {
    out = removeEmptySectionByHeader(out, headerTest)
  }
  return out
}

function removeEmptySectionByHeader(markdown, headerTest) {
  const parts = markdown.split(/^## /m)
  if (parts.length <= 1) return markdown

  const kept = [parts[0]]
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i]
    const nl = part.indexOf('\n')
    const header = nl === -1 ? part.trim() : part.slice(0, nl).trim()
    const body = nl === -1 ? '' : part.slice(nl + 1)

    if (headerTest.test(header) && !trimBody(body)) continue
    kept.push(`## ${part}`)
  }
  return kept.join('')
}

/**
 * @param {{
 *   machine: Record<string, unknown>,
 *   guide: Record<string, unknown>,
 *   diagrams?: Array<{ alt: string, filename: string, placement: string }>,
 *   resolveImageUrl?: (filename: string) => string | undefined,
 * }} args
 */
export function buildGuideMarkdown({ machine, guide, diagrams = [], resolveImageUrl }) {
  const riskBullets = Array.isArray(guide.risk_bullets)
    ? guide.risk_bullets
    : String(guide.risk_bullets ?? '')
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean)

  return buildGuideMarkdownCore(
    {
      machine: { slug: machine.slug, name: machine.name, ...machine },
      guide: {
        ...guide,
        title: guide.title || machine.name,
        risk_bullets: riskBullets,
      },
      diagrams,
    },
    { resolveImageUrl },
  )
}

export const SLOT_GUIDE_DRAFT_KEY = 'slotGuideFormDraft:v1'

/** @typedef {{ version: number, savedAt: string, ingestId: string, machine: object, guide: object, diagrams: Array<{ id: string, alt: string, placement: string, filename: string }> }} SlotGuideDraft */

/**
 * @param {{ ingestId: string, machine: object, guide: object, diagrams: Array<{ id: string, alt: string, placement: string, filename: string, file?: File | null }> }} state
 * @returns {SlotGuideDraft | null}
 */
export function buildSlotGuideDraft(state) {
  const { ingestId, machine, guide, diagrams } = state
  const hasText =
    Object.values(machine).some((v) => (typeof v === 'string' ? v.trim() : v)) ||
    Object.entries(guide).some(([k, v]) => !k.startsWith('_') && String(v ?? '').trim()) ||
    diagrams.some((d) => d.alt?.trim() || d.filename?.trim())
  if (!hasText) return null

  return {
    version: 1,
    savedAt: new Date().toISOString(),
    ingestId: ingestId || 'test',
    machine: { ...machine },
    guide: { ...guide },
    diagrams: diagrams.map(({ id, alt, placement, filename }) => ({
      id: id || crypto.randomUUID(),
      alt: alt || '',
      placement: placement || 'when_to_play',
      filename: filename || '',
    })),
  }
}

/** @param {unknown} raw */
export function readSlotGuideDraft(raw) {
  if (!raw || typeof raw !== 'object') return null
  const d = /** @type {Record<string, unknown>} */ (raw)
  if (d.version !== 1 || !d.machine || !d.guide) return null
  return /** @type {SlotGuideDraft} */ (d)
}

export function loadSlotGuideDraftFromStorage() {
  try {
    const raw = JSON.parse(window.localStorage.getItem(SLOT_GUIDE_DRAFT_KEY) || 'null')
    return readSlotGuideDraft(raw)
  } catch {
    return null
  }
}

/** @param {SlotGuideDraft | null} draft */
export function writeSlotGuideDraftToStorage(draft) {
  try {
    if (!draft) window.localStorage.removeItem(SLOT_GUIDE_DRAFT_KEY)
    else window.localStorage.setItem(SLOT_GUIDE_DRAFT_KEY, JSON.stringify(draft))
  } catch { /* quota / private mode */ }
}

/** Supabase select for full guide editor load / duplicate fetch. */
export const GUIDE_FORM_SELECT = `
  id, slug, title, content_markdown, card_ev_threshold, published, thumbnail_url,
  created_at, updated_at,
  machines (
    id, slug, name, manufacturer, type, difficulty,
    popularity, nerf_risk, volatility_index,
    popularity_summary, release_year, has_calculator, calculator_slug, thumbnail_url
  )
`.trim().replace(/\s+/g, ' ')

/**
 * Map a guides row (+ nested machines) into slot-guide-form machine/guide fields.
 * @param {Record<string, unknown>} data
 */
export function guideRowToFormFields(data) {
  const m = Array.isArray(data.machines) ? data.machines[0] : data.machines
  const parsed = parseGuideMarkdown(String(data.content_markdown || ''))
  const machine = m
    ? {
        slug: m.slug || '',
        name: m.name || '',
        manufacturer: m.manufacturer || 'IGT',
        type: m.type || '',
        difficulty: m.difficulty || 'Beginner',
        popularity: m.popularity || m.vegas_availability || 'Common',
        nerf_risk: m.nerf_risk || 'auto',
        volatility_index: m.volatility_index || '',
        popularity_summary: m.popularity_summary || '',
        release_year: m.release_year ? String(m.release_year) : '',
        has_calculator: m.has_calculator || false,
        calculator_slug: m.calculator_slug || '',
      }
    : {
        slug: '', name: '', manufacturer: 'IGT', type: '', difficulty: 'Beginner',
        popularity: 'Common', nerf_risk: 'auto', volatility_index: '',
        popularity_summary: '', release_year: '', has_calculator: false, calculator_slug: '',
      }
  const guide = {
    ...parsed,
    title: data.title || '',
    card_ev_threshold: data.card_ev_threshold || '',
    published: data.published ?? true,
    _slug: data.slug || '',
    _created_at: data.created_at || '',
    _updated_at: data.updated_at || '',
  }
  return {
    machine,
    guide,
    thumbnailUrl: data.thumbnail_url || m?.thumbnail_url || '',
    editIds: m ? { guideId: data.id, machineId: m.id } : null,
  }
}
