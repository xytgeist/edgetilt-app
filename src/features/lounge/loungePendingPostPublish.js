import { waitForCfStreamManifestReady } from '../../utils/loungeVideoUpload.js'
import {
  loungeSubmissionSnapshotIncludesVideo,
  loungeSubmissionSnapshotThreadPartCount,
} from './loungeSubmissionSnapshot.js'

/** @typedef {{ progress: number, status: string, detail: string, phase?: string }} LoungePendingPostProgress */

const progressByKey = new Map()
const listeners = new Set()

function notifyPendingPostProgress() {
  for (const fn of listeners) {
    try {
      fn()
    } catch {
      // ignore
    }
  }
}

export function subscribeLoungePendingPostProgress(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** @param {string} key */
export function getLoungePendingPostProgress(key) {
  const k = String(key || '').trim()
  if (!k) return null
  return progressByKey.get(k) ?? null
}

/**
 * @param {string} key
 * @param {Partial<LoungePendingPostProgress>} info
 */
export function setLoungePendingPostProgress(key, info) {
  const k = String(key || '').trim()
  if (!k) return
  const prev = progressByKey.get(k) || { progress: 0, status: '', detail: '' }
  progressByKey.set(k, {
    progress:
      typeof info?.progress === 'number'
        ? Math.max(0, Math.min(1, info.progress))
        : prev.progress,
    status: info?.status != null ? String(info.status) : prev.status,
    detail: info?.detail != null ? String(info.detail) : prev.detail,
    phase: info?.phase != null ? String(info.phase) : prev.phase,
  })
  notifyPendingPostProgress()
}

/** @param {string} key */
export function clearLoungePendingPostProgress(key) {
  const k = String(key || '').trim()
  if (!k) return
  if (!progressByKey.has(k)) return
  progressByKey.delete(k)
  notifyPendingPostProgress()
}

/** Move in-flight progress from optimistic id to real post id. */
export function remitLoungePendingPostProgressKey(fromKey, toKey) {
  const from = String(fromKey || '').trim()
  const to = String(toKey || '').trim()
  if (!from || !to || from === to) return
  const prev = progressByKey.get(from)
  if (prev) {
    progressByKey.set(to, prev)
    progressByKey.delete(from)
    notifyPendingPostProgress()
  }
}

/** Any Lounge submit snapshot with Stream video uses inline tile progress (not the bottom bar). */
export function loungeSubmissionUsesInlineVideoPostProgress(snapshot) {
  return loungeSubmissionSnapshotIncludesVideo(snapshot)
}

/** Post/comment edit: inline tile only when a new Stream upload is in flight (not caption-only on existing video). */
export function loungeEditSnapshotHasIncomingVideoUpload(snapshot) {
  if (!snapshot) return false
  if (snapshot.videoFile instanceof File) return true
  if (snapshot.videoPrepSpec) return true
  if (snapshot.awaitingDetailEditVideoPrepJobId != null) return true
  if (snapshot.awaitingDetailCommentEditVideoPrepJobId != null) return true
  const uid = String(snapshot.streamVideoUid || '').trim()
  const prev = String(snapshot.previousStreamUid || '').trim()
  if (uid && uid !== prev) return true
  return false
}

/** Bottom upload bar: text-only multi-part threads (no video anywhere in the snapshot). */
export function loungeSubmissionShouldUseBottomUploadBar(snapshot) {
  if (loungeSubmissionSnapshotIncludesVideo(snapshot)) return false
  return loungeSubmissionSnapshotThreadPartCount(snapshot) > 1
}

/** @param {string} [prefix] */
export function createLoungePendingPublishKey(prefix = 'pending') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Optimistic feed row shown to the author while encode/upload runs.
 *
 * @param {object} opts
 * @param {object} opts.snapshot
 * @param {string} opts.pendingKey
 * @param {string} opts.userId
 * @param {object | null | undefined} [opts.authorProfile]
 */
function sessionPosterBlobFromSnapshot(snapshot) {
  const posterBlob = String(snapshot?.sessionStreamPosterBlobUrl || '').trim()
  return posterBlob.startsWith('blob:') ? posterBlob : null
}

export function buildAuthorPendingVideoFeedPost({ snapshot, pendingKey, userId, authorProfile }) {
  const now = new Date().toISOString()
  const uid = String(snapshot?.streamVideoUid || '').trim()
  return {
    id: pendingKey,
    caption: String(snapshot?.caption || ''),
    user_id: userId,
    created_at: now,
    feed_visible_at: null,
    stream_video_uid: uid || null,
    stream_poster_url: null,
    _authorPendingPublish: true,
    _pendingPublishKey: pendingKey,
    _sessionStreamPosterBlob: sessionPosterBlobFromSnapshot(snapshot),
    author_profile: authorProfile || null,
    like_count: 0,
    comment_count: 0,
    repost_count: 0,
    category_pills: Array.isArray(snapshot?.categoryPills) ? snapshot.categoryPills : [],
    creator_fan_only: snapshot?.creatorFanOnly === true,
  }
}

export function buildAuthorPendingVideoQuoteRepost({
  snapshot,
  pendingKey,
  userId,
  authorProfile,
  original,
  originalKind = 'post',
}) {
  const base = buildAuthorPendingVideoFeedPost({ snapshot, pendingKey, userId, authorProfile })
  const orig = original && typeof original === 'object' ? original : null
  const isComment = originalKind === 'comment'
  return {
    ...base,
    is_plain_repost: false,
    reposted_post: isComment ? null : orig,
    reposted_comment: isComment ? orig : null,
    repost_of_post_id: isComment ? null : orig?.id ?? null,
    repost_of_comment_id: isComment ? orig?.id ?? null : null,
  }
}

export function buildAuthorPendingVideoThreadRootPost({
  snapshot,
  pendingKey,
  userId,
  authorProfile,
  threadPartCount,
}) {
  const base = buildAuthorPendingVideoFeedPost({ snapshot, pendingKey, userId, authorProfile })
  return {
    ...base,
    thread_part_index: 0,
    thread_part_count: Math.max(1, Number(threadPartCount) || 1),
  }
}

export function buildAuthorPendingVideoComment({
  snapshot,
  pendingKey,
  userId,
  authorProfile,
  postId,
  parentId,
}) {
  const now = new Date().toISOString()
  const uid = String(snapshot?.streamVideoUid || '').trim()
  return {
    id: pendingKey,
    body: String(snapshot?.body || ''),
    post_id: postId,
    parent_id: parentId ?? null,
    user_id: userId,
    created_at: now,
    stream_video_uid: uid || null,
    _authorPendingPublish: true,
    _pendingPublishKey: pendingKey,
    _sessionStreamPosterBlob: sessionPosterBlobFromSnapshot(snapshot),
    author_profile: authorProfile || null,
    like_count: 0,
    reply_count: 0,
    repost_count: 0,
  }
}

/** Poll CF HLS then clear pending comment tile state (comments have no feed_visible_at). */
export async function finishLoungePendingCommentVideoProcessing({
  commentId,
  streamUid,
  pendingKey,
  signal,
  onProgress,
}) {
  const id = String(commentId || '').trim()
  const uid = String(streamUid || '').trim()
  const key = String(pendingKey || id).trim()
  if (!id || !uid) return
  remitLoungePendingPostProgressKey(key, id)
  onProgress?.({ progress: 0.92, status: 'Processing video…' })
  await waitForCfStreamManifestReady(uid, { signal })
  onProgress?.({ progress: 1, status: 'Ready' })
  clearLoungePendingPostProgress(id)
}

function feedPostStreamVideoUid(row) {
  const u = String(row?.stream_video_uid ?? '').trim()
  return u || ''
}

/** True when the feed row is author-only staged publish (DB or optimistic). */
export function loungeFeedPostIsAuthorPendingPublish(row, viewerUserId) {
  if (!row || !viewerUserId) return false
  if (String(row.user_id || '') !== String(viewerUserId)) return false
  if (row._authorPendingPublish === true) return true
  if (row.feed_visible_at === null && feedPostStreamVideoUid(row)) return true
  return false
}

/**
 * Poll CF HLS, then set `feed_visible_at` so the post goes live for everyone.
 *
 * @param {object} opts
 * @param {import('@supabase/supabase-js').SupabaseClient} opts.supabaseClient
 * @param {string} opts.postId
 * @param {string} opts.streamUid
 * @param {AbortSignal} [opts.signal]
 * @param {(info: { progress: number, status: string }) => void} [opts.onProgress]
 */
export async function publishLoungeFeedPostWhenStreamReady({
  supabaseClient,
  postId,
  streamUid,
  signal,
  onProgress,
}) {
  const id = String(postId || '').trim()
  const uid = String(streamUid || '').trim()
  if (!id || !uid) return

  onProgress?.({ progress: 0.92, status: 'Processing video…' })
  await waitForCfStreamManifestReady(uid, { signal })
  onProgress?.({ progress: 0.98, status: 'Going live…' })

  const visibleAt = new Date().toISOString()
  const { error } = await supabaseClient
    .from('community_feed_posts')
    .update({ feed_visible_at: visibleAt })
    .eq('id', id)
    .is('feed_visible_at', null)

  if (error) throw new Error(error.message || 'Could not publish video post.')
  onProgress?.({ progress: 1, status: 'Live' })
  return visibleAt
}
