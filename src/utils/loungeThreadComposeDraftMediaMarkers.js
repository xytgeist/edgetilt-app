import { LOUNGE_CAPTION_MAX } from './loungeCommentLimits.js'

/** Visible draft reminder line - stripped when matching media is re-attached. */
export const THREAD_DRAFT_MEDIA_MARKER_PREFIX = '📎 '

function basenameFromUrl(url) {
  const s = String(url || '').trim()
  if (!s) return ''
  try {
    const path = new URL(s).pathname
    const base = path.split('/').filter(Boolean).pop()
    return base ? decodeURIComponent(base) : ''
  } catch {
    const slash = s.lastIndexOf('/')
    return slash >= 0 ? s.slice(slash + 1) : s
  }
}

/** @param {string} url */
export function threadDraftGifDisplayName(url) {
  const base = basenameFromUrl(url)
  return base && /\.gif$/i.test(base) ? base : 'GIF'
}

/** @param {{ file?: File, remoteUrl?: string, preview?: string } | null | undefined} item */
export function threadDraftImageItemDisplayName(item) {
  if (item?.file instanceof File && item.file.name) return item.file.name
  const base = basenameFromUrl(item?.remoteUrl || item?.preview || '')
  return base || 'image'
}

/** @param {object | null | undefined} slot */
export function threadDraftVideoSlotDisplayName(slot) {
  if (slot?.file instanceof File && slot.file.name) return slot.file.name
  return 'video'
}

/**
 * Media names that are not restored from a saved thread draft for this part.
 *
 * @param {import('./loungeThreadComposeMedia.js').ThreadComposePartMedia | null | undefined} part
 * @param {number} partIndex
 */
export function listUnpersistedThreadPartMediaNames(part, partIndex) {
  if (!part) return []
  /** @type {string[]} */
  const names = []
  if (part.videoSlot) {
    names.push(threadDraftVideoSlotDisplayName(part.videoSlot))
  }
  if (partIndex === 0) return names
  for (const it of part.imageItems || []) {
    names.push(threadDraftImageItemDisplayName(it))
  }
  const gif = String(part.gifUrl || '').trim()
  if (gif) names.push(threadDraftGifDisplayName(gif))
  return names
}

/**
 * @param {object | null | undefined} part Snapshot thread part (submit / failure draft).
 * @param {number} partIndex
 */
export function listUnpersistedMediaNamesFromSnapshotPart(part, partIndex) {
  if (!part) return []
  /** @type {string[]} */
  const names = []
  const persistedUid = String(part.streamVideoUid || '').trim()
  if (!persistedUid) {
    if (part.videoFile instanceof File && part.videoFile.name) {
      names.push(part.videoFile.name)
    } else if (part.videoPrepSpec?.file instanceof File && part.videoPrepSpec.file.name) {
      names.push(part.videoPrepSpec.file.name)
    } else if (part.videoPrepSpec?.sourceFile instanceof File && part.videoPrepSpec.sourceFile.name) {
      names.push(part.videoPrepSpec.sourceFile.name)
    } else if (part.videoPrepSpec) {
      names.push('video')
    }
  }
  if (partIndex === 0) return names
  for (const f of Array.isArray(part.imageFiles) ? part.imageFiles : []) {
    if (f instanceof File && f.name) names.push(f.name)
  }
  const gif = String(part.gifUrl ?? '').trim()
  if (gif) names.push(threadDraftGifDisplayName(gif))
  return names
}

export function threadDraftMediaMarkerLine(name) {
  const n = String(name || '').trim()
  if (!n) return ''
  return `${THREAD_DRAFT_MEDIA_MARKER_PREFIX}${n}`
}

function captionHasDraftMediaMarker(caption, name) {
  const n = String(name || '').trim()
  if (!n) return false
  const escaped = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`^${THREAD_DRAFT_MEDIA_MARKER_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}${escaped}$`, 'm').test(
    String(caption ?? ''),
  )
}

/**
 * Append one marker line per media name (not already present).
 *
 * @param {string} caption
 * @param {string[]} names
 */
export function injectDraftMediaMarkersIntoCaption(caption, names) {
  const base = String(caption ?? '')
  const toAdd = (Array.isArray(names) ? names : [])
    .map((n) => String(n || '').trim())
    .filter((n) => n && !captionHasDraftMediaMarker(base, n))
  if (!toAdd.length) return base.slice(0, LOUNGE_CAPTION_MAX)
  const suffix = toAdd.map(threadDraftMediaMarkerLine).join('\n')
  const trimmed = base.replace(/\s+$/, '')
  const next = trimmed ? `${trimmed}\n${suffix}` : suffix
  return next.slice(0, LOUNGE_CAPTION_MAX)
}

/**
 * Remove draft marker lines for the given media names.
 *
 * @param {string} caption
 * @param {string | string[]} names
 */
export function stripDraftMediaMarkersFromCaption(caption, names) {
  let text = String(caption ?? '')
  const targets = (Array.isArray(names) ? names : [names])
    .map((n) => String(n || '').trim())
    .filter(Boolean)
  if (!targets.length) return text
  for (const name of targets) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const prefix = THREAD_DRAFT_MEDIA_MARKER_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    text = text.replace(new RegExp(`\\n?${prefix}${escaped}(?=\\n|$)`, 'g'), '')
  }
  return text.replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '').trimEnd()
}

/**
 * @param {string[]} captions
 * @param {import('./loungeThreadComposeMedia.js').ThreadComposePartMedia[]} partMedia
 */
export function buildThreadDraftCaptionsWithMediaMarkers(captions, partMedia) {
  const caps = Array.isArray(captions) ? captions : []
  const media = Array.isArray(partMedia) ? partMedia : []
  return caps.map((caption, i) =>
    injectDraftMediaMarkersIntoCaption(caption, listUnpersistedThreadPartMediaNames(media[i], i)),
  )
}

/**
 * @param {string[]} threadCaptions
 * @param {object[]} snapshotParts Aligned with captions (threadParts slice).
 */
export function buildThreadDraftCaptionsWithSnapshotMediaMarkers(threadCaptions, snapshotParts) {
  const caps = Array.isArray(threadCaptions) ? threadCaptions : []
  const parts = Array.isArray(snapshotParts) ? snapshotParts : []
  return caps.map((caption, i) =>
    injectDraftMediaMarkersIntoCaption(
      caption,
      listUnpersistedMediaNamesFromSnapshotPart(parts[i], i),
    ),
  )
}
