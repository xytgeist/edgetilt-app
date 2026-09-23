/**
 * Session-only map: Cloudflare Stream uid → composer-captured JPEG poster URL.
 * `blob:` from browser crop, or `data:image/…` from the iPhone native picker.
 * Used so the feed tile can show stable intrinsic dimensions immediately after post,
 * then `LoungePostStreamVideo` swaps to CF `thumbnail.jpg` when it loads and revokes here.
 */

const byUid = new Map()

/** Composer / native session poster usable in the pending feed tile (pixel reveal). */
export function isLoungeSessionPosterSrc(url) {
  const u = String(url || '').trim()
  return u.startsWith('blob:') || u.startsWith('data:image/')
}

/**
 * @param {string} uid Stream asset id (hex)
 * @param {string} objectUrl `blob:` or `data:image/…` JPEG poster
 */
export function pinLoungeStreamSessionPoster(uid, objectUrl) {
  const id = String(uid || '').trim()
  const u = String(objectUrl || '').trim()
  if (!id || !isLoungeSessionPosterSrc(u)) return
  const prev = byUid.get(id)
  if (prev && prev !== u && prev.startsWith('blob:')) {
    try {
      URL.revokeObjectURL(prev)
    } catch {
      // ignore
    }
  }
  byUid.set(id, u)
}

/** @param {string} uid */
export function peekLoungeStreamSessionPoster(uid) {
  const id = String(uid || '').trim()
  if (!id) return ''
  return byUid.get(id) || ''
}

/** Revoke and drop (call after CF poster is showing). */
export function releaseLoungeStreamSessionPoster(uid) {
  const id = String(uid || '').trim()
  const u = byUid.get(id)
  if (!u) return
  if (u.startsWith('blob:')) {
    try {
      URL.revokeObjectURL(u)
    } catch {
      // ignore
    }
  }
  byUid.delete(id)
}

function collectSubmitSnapshotBlobUrlsFromPart(part, urls) {
  if (!part || typeof part !== 'object') return
  const poster = String(part.sessionStreamPosterBlobUrl || '').trim()
  if (poster.startsWith('blob:')) urls.add(poster)
  const restore = part.videoPrepSlotRestore
  if (restore && typeof restore === 'object') {
    const po = String(restore.posterUrl || '').trim()
    const pr = String(restore.preview || '').trim()
    if (po.startsWith('blob:')) urls.add(po)
    if (pr.startsWith('blob:')) urls.add(pr)
  }
  if (Array.isArray(part.imagePreviewBlobUrls)) {
    for (const raw of part.imagePreviewBlobUrls) {
      const p = String(raw || '').trim()
      if (p.startsWith('blob:')) urls.add(p)
    }
  }
}

/** Blob URLs on a submit snapshot that must stay alive until the background job finishes. */
export function loungeSubmitSnapshotBlobUrls(snapshot) {
  /** @type {Set<string>} */
  const urls = new Set()
  if (!snapshot) return urls
  collectSubmitSnapshotBlobUrlsFromPart(snapshot, urls)
  if (Array.isArray(snapshot.imagePreviewBlobUrls)) {
    for (const raw of snapshot.imagePreviewBlobUrls) {
      const p = String(raw || '').trim()
      if (p.startsWith('blob:')) urls.add(p)
    }
  }
  if (Array.isArray(snapshot.threadParts)) {
    for (const part of snapshot.threadParts) collectSubmitSnapshotBlobUrlsFromPart(part, urls)
  }
  return urls
}

/**
 * Resolve a JPEG poster `File` from snapshot poster URL and/or session pin for a Stream uid.
 * @param {{ sessionStreamPosterBlobUrl?: string | null }} snapshot
 * @param {string} streamVideoUid
 * @param {AbortSignal} [signal]
 * @returns {Promise<File | null>}
 */
export async function fetchLoungeStreamPosterFileFromSnapshot(snapshot, streamVideoUid, signal) {
  /** @type {string[]} */
  const candidates = []
  const sess = String(snapshot?.sessionStreamPosterBlobUrl || '').trim()
  if (isLoungeSessionPosterSrc(sess)) candidates.push(sess)
  const pinned = peekLoungeStreamSessionPoster(streamVideoUid)
  if (isLoungeSessionPosterSrc(pinned) && !candidates.includes(pinned)) candidates.push(pinned)
  for (const url of candidates) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    try {
      const res = await fetch(url)
      const b = await res.blob()
      if (b?.size) return new File([b], 'stream-poster.jpg', { type: 'image/jpeg' })
    } catch {
      // try next candidate
    }
  }
  return null
}
