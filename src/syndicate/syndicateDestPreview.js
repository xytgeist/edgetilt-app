/**
 * Ops Preview dest tabs. Prefer Edge `destPreviews` (same strip as publish).
 * Fallback rebuilds from legacy caption fields when poll is on an older deploy.
 */

const COLOR_NAMES = 'green|red|gold|blue|purple'
const X_SAFE_CHARS = 280

export const DEST_PREVIEW_TABS = [
  { id: 'public', label: 'Public' },
  { id: 'private', label: 'Private' },
  { id: 'chat', label: 'Chat' },
  { id: 'x', label: 'X' },
]

export const DEST_PREVIEW_NOTES = {
  public: 'Lounge markdown. Posts when Lounge public is checked.',
  private: 'Fan-only Lounge markdown. Posts when Lounge fan-only is checked.',
  chat: 'VIP chat plain text. Posts when VIP chat is checked.',
  x: 'Tweet as @sharpesyndicate. Posts when X is checked. 280 cap, no URLs.',
}

function colorPairRe() {
  return new RegExp(`\\[(${COLOR_NAMES})\\]([\\s\\S]*?)\\[\\/(?:${COLOR_NAMES})\\]`, 'gi')
}

function colorTagRe() {
  return new RegExp(`\\[\\/?(?:${COLOR_NAMES})\\]`, 'gi')
}

function stripInlineMarkdown(text) {
  let s = String(text || '')
  for (let i = 0; i < 8; i++) {
    const next = s.replace(colorPairRe(), '$2')
    if (next === s) break
    s = next
  }
  s = s.replace(colorTagRe(), '')
  s = s.replace(/`([^`]+)`/g, '$1')
  s = s.replace(/\*\*([^*]+)\*\*/g, '$1')
  s = s.replace(/__([^_]+)__/g, '$1')
  s = s.replace(/~~([^~]+)~~/g, '$1')
  s = s.replace(/==([^=]+)==/g, '$1')
  s = s.replace(/\|\|([^|]+)\|\|/g, '$1')
  s = s.replace(/\*([^*\n]+)\*/g, '$1')
  s = s.replace(/(^|[\s(])_([^_\n]+)_(?=[\s).,!?:;-]|$)/g, '$1$2')
  return s
}

function stripLineMarkers(line) {
  const trimmed = String(line || '')
  if (/^\s*([*\-_])(\s*\1){2,}\s*$/.test(trimmed)) return ''
  let t = trimmed.replace(/^\s*#{1,6}\s+/, '')
  t = t.replace(/^>\s?/, '')
  t = t.replace(/^\s*[-*]\s+(?:\[[ xX]\]\s+)?/, '')
  t = t.replace(/^\s*\d+\.\s+/, '')
  return stripInlineMarkdown(t)
}

export function toPlainPreviewText(raw) {
  const source = String(raw || '').replace(/```[\w-]*\r?\n?([\s\S]*?)```/g, '$1')
  const lines = source.split(/\r?\n/).map(stripLineMarkers)
  const stripped = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
  return stripped
    .split('\n')
    .map((line) => line.replace(/^[ \t]*·[ \t]*/, '').replace(/[ \t]*·[ \t]*/g, ' - ').replace(/·/g, ' - '))
    .join('\n')
    .replace(/https?:\/\/[^\s]+/gi, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function formatXPreviewText(raw) {
  const plain = toPlainPreviewText(raw)
  if (plain.length <= X_SAFE_CHARS) return plain
  return `${plain.slice(0, X_SAFE_CHARS - 3).trimEnd()}...`
}

function emptySlot() {
  return { caption: '', threadParts: [] }
}

function normalizeSlot(slot) {
  const caption = String(slot?.caption || '').trim()
  const threadParts = Array.isArray(slot?.threadParts)
    ? slot.threadParts
        .map((p) => ({
          label: String(p?.label || '').trim() || undefined,
          body: String(p?.body || '').trim(),
        }))
        .filter((p) => p.body)
    : []
  const chars = Number.isFinite(slot?.chars) ? slot.chars : caption.length
  return { caption, threadParts, chars }
}

function slotHasCopy(slot) {
  return Boolean(slot?.caption || slot?.threadParts?.length)
}

export function destSlotHasCopy(slot) {
  return slotHasCopy(slot)
}

function destPreviewsFromLegacy(preview) {
  const publicCaption = String(preview?.previewCaption || '').trim()
  const fanOnlyCaption = String(preview?.vipPreviewCaption || '').trim()
  const fanThreads = Array.isArray(preview?.subscriberThreadParts)
    ? preview.subscriberThreadParts
        .map((p) => ({
          label: String(p?.label || '').trim() || undefined,
          body: String(p?.body || '').trim(),
        }))
        .filter((p) => p.body)
    : []
  const publicOut = publicCaption || fanOnlyCaption
  const privateOut = fanOnlyCaption || publicCaption
  const chatRoot = fanOnlyCaption || publicCaption
  const xOut = formatXPreviewText(publicCaption || fanOnlyCaption)
  return {
    public: { caption: publicOut, threadParts: [], chars: publicOut.length },
    private: { caption: privateOut, threadParts: fanThreads, chars: privateOut.length },
    chat: {
      caption: toPlainPreviewText(chatRoot),
      threadParts: fanThreads.map((p) => ({ ...p, body: toPlainPreviewText(p.body) })),
      chars: 0,
    },
    x: { caption: xOut, threadParts: [], chars: xOut.length },
  }
}

export function resolveDestPreviews(preview) {
  const incoming = preview?.destPreviews
  if (incoming && typeof incoming === 'object' && (incoming.public || incoming.chat || incoming.x)) {
    return {
      public: normalizeSlot(incoming.public),
      private: normalizeSlot(incoming.private),
      chat: normalizeSlot(incoming.chat),
      x: normalizeSlot(incoming.x),
    }
  }
  return destPreviewsFromLegacy(preview)
}

export function firstDestTabWithCopy(dests) {
  for (const tab of DEST_PREVIEW_TABS) {
    if (slotHasCopy(dests[tab.id])) return tab.id
  }
  return 'public'
}
