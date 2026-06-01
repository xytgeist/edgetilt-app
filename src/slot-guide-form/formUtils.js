export function slugify(raw) {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
}

/** Live slug field: allow a trailing hyphen while typing (e.g. `buffalo-` before `link`). */
export function slugifyInput(raw) {
  return String(raw ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+/, '')
    .replace(/-{2,}/g, '-')
}

export function diagramFilename(name, slug) {
  const base = slugify(name.replace(/\.[^.]+$/, '')) || `${slug}-diagram`
  return base.endsWith('.webp') ? base : `${base}.webp`
}

/** Strip embedded diagram images from a section body. */
function stripImages(text) {
  return text.replace(/!\[.*?\]\(.*?\)\n?/g, '').trim()
}

/**
 * Parse compiled guide markdown back into structured section fields.
 * Matches the structure produced by slotGuideIngestCore buildGuideMarkdown.
 */
export function parseGuideMarkdown(markdown) {
  const out = {
    when_to_play: '', when_to_stop: '', how_to_check: '',
    risk_bankroll: '', risk_summary: '', risk_bullets: '',
    skins_markdown: '', gameplay_mechanics: '',
  }
  if (!markdown) return out

  // Remove the leading H1 title line and split on H2 headers
  const withoutH1 = markdown.replace(/^#\s[^\n]*\n+/, '')
  // Remove horizontal rules that separate gameplay section
  const cleaned = withoutH1.replace(/^---\s*\n/gm, '')
  const parts = cleaned.split(/^## /m)

  for (const part of parts) {
    if (!part.trim()) continue
    const nl = part.indexOf('\n')
    const header = nl === -1 ? part.trim() : part.slice(0, nl).trim()
    const body   = nl === -1 ? '' : part.slice(nl + 1)

    if (/When to play/i.test(header)) {
      out.when_to_play = stripImages(body)
    } else if (/When to stop/i.test(header)) {
      out.when_to_stop = stripImages(body)
    } else if (/How to check/i.test(header)) {
      out.how_to_check = stripImages(body)
    } else if (/Risk/i.test(header)) {
      // Extract bankroll bold line, summary paragraphs, and bullet list
      const lines = body.split('\n')
      const summaryLines = []
      const bullets = []
      for (const line of lines) {
        const bm = line.match(/^\*\*Bankroll on hand:\s*(.+?)\*\*/)
        if (bm) { out.risk_bankroll = bm[1].trim(); continue }
        if (/^!\[/.test(line)) continue                  // skip images
        if (/^- /.test(line)) { bullets.push(line.slice(2).trim()); continue }
        summaryLines.push(line)
      }
      out.risk_summary = summaryLines.join('\n').trim()
      out.risk_bullets = bullets.join('\n')
    } else if (/Skins/i.test(header)) {
      out.skins_markdown = stripImages(body)
    } else if (/Gameplay/i.test(header)) {
      out.gameplay_mechanics = stripImages(body)
    }
  }

  return out
}

/**
 * Re-assemble structured guide fields back into the compiled markdown format.
 * Mirrors slotGuideIngestCore buildGuideMarkdown (no image embedding on client).
 */
export function buildGuideMarkdown({ title, guide }) {
  const t = String(title || '').trim()
  const g = guide
  let md = t ? `# ${t}\n\n` : ''

  md += `## 🟢 When to play\n\n${g.when_to_play.trim()}\n\n`
  md += `## 🛑 When to stop\n\n${g.when_to_stop.trim()}\n\n`
  md += `## 🔍 How to check (quick/easy)\n\n${g.how_to_check.trim()}\n\n`

  md += `## ⚠️ Risk & Warnings\n\n`
  if (g.risk_bankroll.trim()) md += `**Bankroll on hand: ${g.risk_bankroll.trim()}**\n\n`
  if (g.risk_summary.trim()) md += `${g.risk_summary.trim()}\n\n`
  const bullets = g.risk_bullets.split('\n').map(s => s.trim()).filter(Boolean)
  if (bullets.length) md += `${bullets.map(b => `- ${b}`).join('\n')}\n\n`

  const skins = g.skins_markdown.trim()
  if (skins) md += `## 🎭 Skins (same game different theme/art)\n\n${skins}\n\n`

  md += `---\n\n## 🎰 Gameplay Mechanics\n\n${g.gameplay_mechanics.trim()}\n`

  return md
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
