/** Shared submit-snapshot helpers (no imports from submit/prep jobs — avoids circular deps). */

/** @returns {number} Multi-part thread size, or 0 when not a thread. */
export function loungeSubmissionSnapshotThreadPartCount(snapshot) {
  if (!snapshot) return 0
  if (Array.isArray(snapshot.threadParts) && snapshot.threadParts.length > 1) {
    return snapshot.threadParts.length
  }
  if (Array.isArray(snapshot.threadCaptions) && snapshot.threadCaptions.length > 1) {
    return snapshot.threadCaptions.length
  }
  return 0
}

function loungeThreadPartSnapshotHasVideo(part) {
  if (!part || typeof part !== 'object') return false
  if (String(part.streamVideoUid ?? '').trim()) return true
  if (part.videoFile instanceof File) return true
  if (part.videoPrepSpec) return true
  if (part.awaitingThreadPartVideoPrepJobId != null) return true
  if (part._capturedPrepHandoff) return true
  return false
}

/** True when a background Lounge post/comment job includes Stream video (not images/GIF-only). */
export function loungeSubmissionSnapshotIncludesVideo(snapshot) {
  if (!snapshot) return false
  if (String(snapshot.streamVideoUid || '').trim()) return true
  if (snapshot.videoFile instanceof File) return true
  if (snapshot.videoPrepSpec) return true
  if (snapshot.awaitingComposerVideoPrepJobId != null) return true
  if (snapshot.awaitingDetailCommentVideoPrepJobId != null) return true
  if (snapshot.awaitingDetailEditVideoPrepJobId != null) return true
  if (snapshot.awaitingDetailCommentEditVideoPrepJobId != null) return true
  if (Array.isArray(snapshot.threadParts) && snapshot.threadParts.some(loungeThreadPartSnapshotHasVideo)) {
    return true
  }
  return false
}
