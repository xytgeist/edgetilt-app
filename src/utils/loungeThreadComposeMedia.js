/** @typedef {{ id?: string, file?: File, preview?: string, remoteUrl?: string }} ThreadComposeImageItem */

/** @typedef {object | null} ThreadComposeVideoSlot */

/** @typedef {{ progress: number, status: string, detail: string } | null} ThreadComposeVideoPrepHud */

/**
 * @typedef {{
 *   imageItems: ThreadComposeImageItem[],
 *   gifUrl: string,
 *   videoSlot: ThreadComposeVideoSlot,
 *   videoPrepHud: ThreadComposeVideoPrepHud,
 * }} ThreadComposePartMedia
 */

export function emptyThreadComposePartMedia() {
  return { imageItems: [], gifUrl: '', videoSlot: null, videoPrepHud: null }
}

/** @param {ThreadComposePartMedia | null | undefined} part */
export function revokeThreadComposePartMedia(part) {
  for (const it of part?.imageItems || []) {
    try {
      if (it?.preview?.startsWith?.('blob:')) URL.revokeObjectURL(it.preview)
    } catch {
      // ignore
    }
  }
}

/** @param {ThreadComposeVideoSlot | null | undefined} slot @param {Set<string> | null | undefined} [skipUrls] */
export function revokeThreadComposePartVideoSlot(slot, skipUrls) {
  if (!slot) return
  const skip = skipUrls instanceof Set ? skipUrls : null
  const p = slot.preview
  const po = slot.posterUrl
  if (p && !skip?.has(p)) {
    try {
      URL.revokeObjectURL(p)
    } catch {
      // ignore
    }
  }
  if (po && po !== p && !skip?.has(po)) {
    try {
      URL.revokeObjectURL(po)
    } catch {
      // ignore
    }
  }
}

/** @param {ThreadComposePartMedia | null | undefined} part @param {Set<string> | null | undefined} [skipUrls] */
export function revokeThreadComposePartMediaFull(part, skipUrls) {
  revokeThreadComposePartMedia(part)
  revokeThreadComposePartVideoSlot(part?.videoSlot, skipUrls)
}

/** @param {ThreadComposePartMedia | null | undefined} part */
export function threadComposePartHasMedia(part) {
  if (!part) return false
  if ((part.imageItems?.length ?? 0) > 0) return true
  return Boolean(String(part.gifUrl || '').trim())
}

/** @param {ThreadComposePartMedia | null | undefined} part */
export function threadComposePartHasVideo(part) {
  return part?.videoSlot != null
}

/** @param {ThreadComposePartMedia | null | undefined} part */
export function threadComposePartCarouselUrls(part) {
  const gif = String(part?.gifUrl || '').trim()
  const imgs = (part?.imageItems || []).map((it) => it.preview || it.remoteUrl).filter(Boolean)
  return gif ? [...imgs, gif] : imgs
}

/**
 * @param {string} caption
 * @param {ThreadComposePartMedia | null | undefined} part
 */
export function threadComposePartHasContent(caption, part) {
  if (threadComposePartHasVideo(part)) return true
  if (String(caption || '').trim()) return true
  return threadComposePartHasMedia(part)
}

/**
 * @param {string[]} captions
 * @param {ThreadComposePartMedia[]} partMedia
 */
/** Blob previews to pin on submit snapshot so closeThreadCompose does not revoke them mid-job. */
export function threadPartImagePreviewBlobUrlsFromMedia(part) {
  return (part?.imageItems || [])
    .map((it) => String(it.preview || '').trim())
    .filter((p) => p.startsWith('blob:'))
}

/** Restore compose image tiles from a captured thread-part snapshot. */
export function threadPartImageItemsFromSnapshot(part) {
  /** @type {ThreadComposeImageItem[]} */
  const items = []
  let seq = 0
  const nextId = () => `thread-snap-img-${Date.now()}-${seq++}`
  for (const url of Array.isArray(part?.existingImageUrls) ? part.existingImageUrls : []) {
    const u = String(url ?? '').trim()
    if (!u) continue
    items.push({ id: nextId(), remoteUrl: u, preview: u })
  }
  for (const file of Array.isArray(part?.imageFiles) ? part.imageFiles : []) {
    if (!(file instanceof File)) continue
    items.push({ id: nextId(), file, preview: URL.createObjectURL(file) })
  }
  return items
}

/** Blob URLs to keep alive while a background draft-save job runs. */
export function collectThreadComposePartMediaBlobUrls(partMedia) {
  /** @type {Set<string>} */
  const urls = new Set()
  for (const part of Array.isArray(partMedia) ? partMedia : []) {
    for (const it of part?.imageItems || []) {
      const p = String(it?.preview || '').trim()
      if (p.startsWith('blob:')) urls.add(p)
    }
    const slot = part?.videoSlot
    for (const raw of [slot?.preview, slot?.posterUrl]) {
      const u = String(raw || '').trim()
      if (u.startsWith('blob:')) urls.add(u)
    }
  }
  return urls
}

/** Restore a compose video slot from persisted draft Stream fields. */
export function threadPartVideoSlotFromDraft(streamFields) {
  const uid =
    String(streamFields?.stream_video_uid ?? streamFields?.streamVideoUid ?? '').trim() || null
  if (!uid) return null
  const poster =
    String(streamFields?.stream_poster_url ?? streamFields?.streamPosterUrl ?? '').trim() || null
  return {
    prepJobId: 0,
    file: null,
    posterUrl: poster,
    preview: poster,
    streamVideoUid: uid,
    prepStatus: 'ready',
    prepError: '',
  }
}

export function normalizeThreadComposePartsForSubmit(captions, partMedia) {
  const cap = Array.isArray(captions) ? captions : ['']
  const media = Array.isArray(partMedia) ? partMedia : [emptyThreadComposePartMedia()]
  const rows = cap.map((text, i) => {
    const m = media[i] || emptyThreadComposePartMedia()
    return {
      body: String(text || '').trim(),
      gifUrl: String(m.gifUrl || '').trim(),
      imageFiles: (m.imageItems || []).map((it) => it.file).filter((f) => f instanceof File),
      existingImageUrls: (m.imageItems || [])
        .map((it) => String(it.remoteUrl || '').trim())
        .filter(Boolean),
      _part: m,
    }
  })
  let end = rows.length
  while (end > 1 && !threadComposePartHasContent(rows[end - 1].body, rows[end - 1]._part)) {
    end -= 1
  }
  return rows.slice(0, end).map(({ body, gifUrl, imageFiles, existingImageUrls, _part }) => ({
    body,
    gifUrl,
    imageFiles,
    existingImageUrls,
    videoSlot: _part?.videoSlot ?? null,
  }))
}
