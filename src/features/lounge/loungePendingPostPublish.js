import {
  waitForCfStreamManifestReady,
  isLoungeCfStreamProcessingError,
} from '../../utils/loungeVideoUpload.js'
import {
  loungeSubmissionSnapshotIncludesVideo,
  loungeSubmissionSnapshotThreadPartCount,
} from './loungeSubmissionSnapshot.js'

/** @typedef {{ progress: number, status: string, detail: string, phase?: string, processingStartedAt?: number }} LoungePendingPostProgress */

/** Stored progress once CF Stream ingest begins (~92%). */
export const LOUNGE_CF_PROCESSING_PROGRESS_FLOOR = 0.92
/** Creep cap while polling CF (~+1% every 7s until ready or this cap). */
export const LOUNGE_CF_PROCESSING_PROGRESS_CAP = 0.99
export const LOUNGE_CF_PROCESSING_TICK_MS = 7000
/** Default CF wait for staged publish background poll. */
export const LOUNGE_CF_PROCESSING_TIMEOUT_BASE_MS = 300_000
/** Large direct uploads (Android CF transcode) can exceed 5 minutes. */
export const LOUNGE_CF_PROCESSING_TIMEOUT_LARGE_MS = 900_000
/** Source size above which staged publish uses the large timeout (~50 MB). */
export const LOUNGE_CF_PROCESSING_LARGE_SOURCE_BYTES = 50 * 1024 * 1024

const progressByKey = new Map()
const listeners = new Set()

/** @typedef {{
 *   streamUid: string,
 *   supabaseClient: import('@supabase/supabase-js').SupabaseClient,
 *   timeoutMs: number,
 *   abortController: AbortController | null,
 *   running: boolean,
 *   finalizeInFlight?: boolean,
 * }} LoungeStagedFeedPostPublishJob */

/** @type {Map<string, LoungeStagedFeedPostPublishJob>} */
const stagedFeedPostPublishJobs = new Map()
const stagedFeedPostPublishCompleteListeners = new Set()
const cfStreamProcessingFailedListeners = new Set()

/** @typedef {{
 *   streamUid: string,
 *   supabaseClient?: import('@supabase/supabase-js').SupabaseClient,
 *   timeoutMs: number,
 *   abortController: AbortController | null,
 *   running: boolean,
 * }} LoungePendingCommentCfJob */

/** @type {Map<string, LoungePendingCommentCfJob>} */
const pendingCommentCfJobs = new Map()
const pendingCommentCfCompleteListeners = new Set()

async function runLoungeStagedFeedPostPublishLoop(postId) {
  const id = String(postId || '').trim()
  const job = stagedFeedPostPublishJobs.get(id)
  if (!id || !job || job.running || job.finalizeInFlight) return

  job.running = true
  try {
    job.abortController?.abort()
  } catch {
    // ignore
  }
  const ac = new AbortController()
  job.abortController = ac

  try {
    setLoungePendingPostProgress(id, {
      progress: 0.92,
      status: 'Processing video…',
      detail: '',
      phase: 'processing',
      processingStartedAt: Date.now(),
    })
    await publishLoungeFeedPostWhenStreamReady({
      supabaseClient: job.supabaseClient,
      postId: id,
      streamUid: job.streamUid,
      signal: ac.signal,
      timeoutMs: job.timeoutMs,
      onProgress: (info) => {
        setLoungePendingPostProgress(id, {
          progress: info.progress,
          status: info.status,
          detail: '',
          phase: 'processing',
        })
      },
    })
  } catch (e) {
    if (e?.name === 'AbortError') return
    if (isLoungeCfStreamProcessingError(e)) {
      unregisterLoungeStagedFeedPostPublishJob(id)
      const message = e instanceof Error ? e.message : String(e)
      setLoungePendingPostProgress(id, {
        progress: 1,
        status: "Video couldn't be processed",
        detail: message,
        phase: 'error',
      })
      notifyCfStreamProcessingFailed({
        target: 'post',
        postId: id,
        streamUid: job.streamUid,
        message,
        cfStatus: e.cfStatus ?? null,
      })
      return
    }
    console.warn('staged video publish:', e)
    setLoungePendingPostProgress(id, {
      progress: 0.99,
      status: 'Still processing…',
      detail: 'Checking again when you return to EdgeTilt.',
      phase: 'processing',
    })
  } finally {
    if (job.abortController === ac) {
      job.running = false
      job.abortController = null
    }
  }
}

/**
 * @param {object} opts
 * @param {string} opts.postId
 * @param {string} opts.streamUid
 * @param {import('@supabase/supabase-js').SupabaseClient} opts.supabaseClient
 * @param {number} [opts.timeoutMs]
 */
export function startLoungeStagedFeedPostPublish({
  postId,
  streamUid,
  supabaseClient,
  timeoutMs = LOUNGE_CF_PROCESSING_TIMEOUT_BASE_MS,
}) {
  const id = String(postId || '').trim()
  const uid = String(streamUid || '').trim()
  if (!id || !uid || !supabaseClient) return

  const prev = stagedFeedPostPublishJobs.get(id)
  stagedFeedPostPublishJobs.set(id, {
    streamUid: uid,
    supabaseClient,
    timeoutMs:
      typeof timeoutMs === 'number' && Number.isFinite(timeoutMs)
        ? timeoutMs
        : LOUNGE_CF_PROCESSING_TIMEOUT_BASE_MS,
    abortController: prev?.abortController ?? null,
    running: false,
    finalizeInFlight: prev?.finalizeInFlight,
  })
  void runLoungeStagedFeedPostPublishLoop(id)
}

/** Restart CF polling for registered feed-post jobs (e.g. after app refocus). */
export function resumeAllLoungeStagedFeedPostPublishJobs() {
  for (const postId of stagedFeedPostPublishJobs.keys()) {
    void runLoungeStagedFeedPostPublishLoop(postId)
  }
}

async function runPendingCommentCfPollLoop(commentId) {
  const id = String(commentId || '').trim()
  const job = pendingCommentCfJobs.get(id)
  if (!id || !job || job.running) return

  job.running = true
  try {
    job.abortController?.abort()
  } catch {
    // ignore
  }
  const ac = new AbortController()
  job.abortController = ac

  try {
    setLoungePendingPostProgress(id, {
      progress: 0.92,
      status: 'Processing video…',
      detail: '',
      phase: 'processing',
      processingStartedAt: Date.now(),
    })
    await waitForCfStreamManifestReady(job.streamUid, {
      signal: ac.signal,
      timeoutMs: job.timeoutMs,
      supabaseClient: job.supabaseClient,
    })
    clearLoungePendingPostProgress(id)
    unregisterLoungePendingCommentVideoProcessing(id)
    notifyPendingCommentCfComplete({ commentId: id })
  } catch (e) {
    if (e?.name === 'AbortError') return
    if (isLoungeCfStreamProcessingError(e)) {
      unregisterLoungePendingCommentVideoProcessing(id)
      const message = e instanceof Error ? e.message : String(e)
      setLoungePendingPostProgress(id, {
        progress: 1,
        status: "Video couldn't be processed",
        detail: message,
        phase: 'error',
      })
      notifyCfStreamProcessingFailed({
        target: 'comment',
        postId: id,
        streamUid: job.streamUid,
        message,
        cfStatus: e.cfStatus ?? null,
      })
      return
    }
    console.warn('pending comment video CF wait:', e)
    setLoungePendingPostProgress(id, {
      progress: 0.99,
      status: 'Still processing…',
      detail: 'Checking again when you return to EdgeTilt.',
      phase: 'processing',
    })
  } finally {
    if (job.abortController === ac) {
      job.running = false
      job.abortController = null
    }
  }
}

function notifyPendingCommentCfComplete(payload) {
  for (const fn of pendingCommentCfCompleteListeners) {
    try {
      fn(payload)
    } catch {
      // ignore
    }
  }
}

/** @param {(payload: { commentId: string }) => void} listener */
export function subscribeLoungePendingCommentVideoProcessingComplete(listener) {
  pendingCommentCfCompleteListeners.add(listener)
  return () => pendingCommentCfCompleteListeners.delete(listener)
}

/**
 * @param {object} opts
 * @param {string} opts.commentId
 * @param {string} opts.streamUid
 * @param {string} [opts.pendingKey]
 * @param {number} [opts.timeoutMs]
 * @param {import('@supabase/supabase-js').SupabaseClient} [opts.supabaseClient]
 */
export function startLoungePendingCommentVideoProcessing({
  commentId,
  streamUid,
  pendingKey,
  timeoutMs = LOUNGE_CF_PROCESSING_TIMEOUT_BASE_MS,
  supabaseClient,
}) {
  const id = String(commentId || '').trim()
  const uid = String(streamUid || '').trim()
  const key = String(pendingKey || id).trim()
  if (!id || !uid) return

  remitLoungePendingPostProgressKey(key, id)
  const prev = pendingCommentCfJobs.get(id)
  pendingCommentCfJobs.set(id, {
    streamUid: uid,
    supabaseClient: supabaseClient ?? prev?.supabaseClient,
    timeoutMs:
      typeof timeoutMs === 'number' && Number.isFinite(timeoutMs)
        ? timeoutMs
        : LOUNGE_CF_PROCESSING_TIMEOUT_BASE_MS,
    abortController: prev?.abortController ?? null,
    running: false,
  })
  void runPendingCommentCfPollLoop(id)
}

/**
 * @param {object} opts
 * @param {string} opts.commentId
 * @param {string} opts.streamUid
 * @param {number} [opts.timeoutMs]
 * @param {import('@supabase/supabase-js').SupabaseClient} [opts.supabaseClient]
 */
export function registerLoungePendingCommentVideoProcessingJob({
  commentId,
  streamUid,
  timeoutMs,
  supabaseClient,
}) {
  const id = String(commentId || '').trim()
  const uid = String(streamUid || '').trim()
  if (!id || !uid) return
  const prev = pendingCommentCfJobs.get(id)
  pendingCommentCfJobs.set(id, {
    streamUid: uid,
    supabaseClient: supabaseClient ?? prev?.supabaseClient,
    timeoutMs:
      typeof timeoutMs === 'number' && Number.isFinite(timeoutMs)
        ? timeoutMs
        : prev?.timeoutMs ?? LOUNGE_CF_PROCESSING_TIMEOUT_BASE_MS,
    abortController: prev?.abortController ?? null,
    running: prev?.running ?? false,
  })
}

/** @param {string} commentId */
export function unregisterLoungePendingCommentVideoProcessing(commentId) {
  const id = String(commentId || '').trim()
  if (!id) return
  pendingCommentCfJobs.delete(id)
}

/** Stop in-flight CF polling for a pending comment (does not delete the comment). */
export function abortLoungePendingCommentVideoProcessing(commentId) {
  const id = String(commentId || '').trim()
  if (!id) return
  const job = pendingCommentCfJobs.get(id)
  if (!job) return
  try {
    job.abortController?.abort()
  } catch {
    // ignore
  }
  job.abortController = null
  job.running = false
}

/** Restart CF polling for feed posts and comment tiles (e.g. after app refocus). */
export function resumeAllLoungePendingCfWaitJobs() {
  resumeAllLoungeStagedFeedPostPublishJobs()
  for (const commentId of pendingCommentCfJobs.keys()) {
    void runPendingCommentCfPollLoop(commentId)
  }
}

/** Stop CF polling for a staged post or pending comment by id / pending key. */
export function abortLoungePendingCfWaitJob(targetId) {
  const id = String(targetId || '').trim()
  if (!id) return
  abortLoungeStagedFeedPostPublish(id)
  abortLoungePendingCommentVideoProcessing(id)
}

/** Client optimistic ids use a `pending-` prefix before the DB row exists. */
export function loungePendingPublishIsOptimisticId(id) {
  return String(id || '').trim().startsWith('pending-')
}

const LOUNGE_FEED_POST_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** True when a feed post / comment id is a persisted Supabase UUID (not an optimistic pending key). */
export function loungeFeedPostHasPersistedId(id) {
  const s = String(id || '').trim()
  if (!s || loungePendingPublishIsOptimisticId(s)) return false
  return LOUNGE_FEED_POST_UUID_RE.test(s)
}

function notifyCfStreamProcessingFailed(payload) {
  for (const fn of cfStreamProcessingFailedListeners) {
    try {
      fn(payload)
    } catch {
      // ignore UI hook failures
    }
  }
}

/** Fires when Cloudflare Stream reports `status.state: error` during staged publish / comment CF wait. */
export function subscribeLoungeCfStreamProcessingFailed(listener) {
  cfStreamProcessingFailedListeners.add(listener)
  return () => cfStreamProcessingFailedListeners.delete(listener)
}

/** Stop in-flight CF polling for a staged post (does not delete the post). */
export function abortLoungeStagedFeedPostPublish(postId) {
  const id = String(postId || '').trim()
  if (!id) return
  const job = stagedFeedPostPublishJobs.get(id)
  if (!job) return
  try {
    job.abortController?.abort()
  } catch {
    // ignore
  }
  job.abortController = null
  job.running = false
}

/**
 * @param {number | null | undefined} sourceBytes
 * @returns {number}
 */
export function resolveLoungeCfStreamProcessingTimeoutMs(sourceBytes) {
  const bytes = typeof sourceBytes === 'number' && Number.isFinite(sourceBytes) ? sourceBytes : 0
  if (bytes >= LOUNGE_CF_PROCESSING_LARGE_SOURCE_BYTES) {
    return LOUNGE_CF_PROCESSING_TIMEOUT_LARGE_MS
  }
  return LOUNGE_CF_PROCESSING_TIMEOUT_BASE_MS
}

function notifyStagedFeedPostPublishComplete(payload) {
  for (const fn of stagedFeedPostPublishCompleteListeners) {
    try {
      fn(payload)
    } catch {
      // ignore
    }
  }
}

/** @param {(payload: { postId: string, visibleAt: string }) => void} listener */
export function subscribeLoungeStagedFeedPostPublishComplete(listener) {
  stagedFeedPostPublishCompleteListeners.add(listener)
  return () => stagedFeedPostPublishCompleteListeners.delete(listener)
}

/**
 * @param {object} opts
 * @param {string} opts.postId
 * @param {string} opts.streamUid
 * @param {import('@supabase/supabase-js').SupabaseClient} opts.supabaseClient
 * @param {number} [opts.timeoutMs]
 */
export function registerLoungeStagedFeedPostPublishJob({
  postId,
  streamUid,
  supabaseClient,
  timeoutMs,
}) {
  const id = String(postId || '').trim()
  const uid = String(streamUid || '').trim()
  if (!id || !uid || !supabaseClient) return
  const prev = stagedFeedPostPublishJobs.get(id)
  stagedFeedPostPublishJobs.set(id, {
    streamUid: uid,
    supabaseClient,
    timeoutMs:
      typeof timeoutMs === 'number' && Number.isFinite(timeoutMs)
        ? timeoutMs
        : prev?.timeoutMs ?? LOUNGE_CF_PROCESSING_TIMEOUT_BASE_MS,
    abortController: prev?.abortController ?? null,
    running: prev?.running ?? false,
    finalizeInFlight: prev?.finalizeInFlight,
  })
}

/** @param {string} postId */
export function unregisterLoungeStagedFeedPostPublishJob(postId) {
  const id = String(postId || '').trim()
  if (!id) return
  stagedFeedPostPublishJobs.delete(id)
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {string} postId
 * @returns {Promise<string>}
 */
export async function setLoungeFeedPostFeedVisible(supabaseClient, postId) {
  const id = String(postId || '').trim()
  if (!id) throw new Error('Missing post id.')
  const visibleAt = new Date().toISOString()
  const { error } = await supabaseClient
    .from('community_feed_posts')
    .update({ feed_visible_at: visibleAt })
    .eq('id', id)
    .is('feed_visible_at', null)
  if (error) throw new Error(error.message || 'Could not publish video post.')
  return visibleAt
}

/**
 * Tile-side fallback: when HLS probe succeeds but the background staged publish
 * poll already timed out, still set `feed_visible_at` once.
 *
 * @param {string} postId
 * @returns {Promise<string | null>}
 */
export async function tryCompleteLoungeStagedFeedPostPublishFromPlayback(postId) {
  const id = String(postId || '').trim()
  if (!id) return null
  const job = stagedFeedPostPublishJobs.get(id)
  if (!job || job.finalizeInFlight) return null
  job.finalizeInFlight = true
  try {
    const visibleAt = await setLoungeFeedPostFeedVisible(job.supabaseClient, id)
    unregisterLoungeStagedFeedPostPublishJob(id)
    notifyStagedFeedPostPublishComplete({ postId: id, visibleAt })
    return visibleAt
  } catch (e) {
    job.finalizeInFlight = false
    throw e
  }
}

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
  const nextProgress =
    typeof info?.progress === 'number'
      ? Math.max(0, Math.min(1, info.progress))
      : prev.progress
  const labels = sanitizeLoungePendingStepLabels(
    info?.status != null ? info.status : prev.status,
    info?.detail != null ? info.detail : prev.detail,
  )
  const phase = info?.phase != null ? String(info.phase) : prev.phase
  const enteringCfWait =
    nextProgress >= LOUNGE_CF_PROCESSING_PROGRESS_FLOOR &&
    (typeof prev.progress !== 'number' || prev.progress < LOUNGE_CF_PROCESSING_PROGRESS_FLOOR)
  progressByKey.set(k, {
    progress: nextProgress,
    status: labels.status,
    detail: phase === 'error' ? labels.detail : '',
    phase,
    processingStartedAt:
      typeof info?.processingStartedAt === 'number'
        ? info.processingStartedAt
        : typeof prev.processingStartedAt === 'number'
          ? prev.processingStartedAt
          : enteringCfWait
            ? Date.now()
            : undefined,
  })
  notifyPendingPostProgress()
}

/** Strip per-step NN% from status/detail — inline tile shows one overall % only. */
export function sanitizeLoungePendingStepLabels(status, detail) {
  const strip = (value) => {
    let text = String(value || '').trim()
    if (!text) return ''
    text = text.replace(/\s*·\s*\d{1,3}%\s*$/g, '')
    text = text.replace(/\s+\d{1,3}%\s*$/g, '')
    if (/^\d{1,3}%$/.test(text)) return ''
    return text.trim()
  }
  return { status: strip(status), detail: strip(detail) }
}

/**
 * @param {number | null | undefined} progress
 * @param {boolean} [cfPlaybackReady]
 * @param {number | null | undefined} [processingStartedAt]
 */
export function resolveLoungePendingPublishProgress(
  progress,
  cfPlaybackReady = false,
  processingStartedAt = null,
  phase = '',
) {
  if (cfPlaybackReady) return 1
  let p = typeof progress === 'number' && Number.isFinite(progress) ? progress : 0
  p = Math.max(0, Math.min(1, p))
  if (String(phase || '').trim() === 'error') return p
  if (
    typeof processingStartedAt === 'number' &&
    Number.isFinite(processingStartedAt) &&
    p >= LOUNGE_CF_PROCESSING_PROGRESS_FLOOR &&
    p < LOUNGE_CF_PROCESSING_PROGRESS_CAP
  ) {
    const elapsed = Math.max(0, Date.now() - processingStartedAt)
    const ticks = Math.floor(elapsed / LOUNGE_CF_PROCESSING_TICK_MS)
    const creep = Math.min(
      LOUNGE_CF_PROCESSING_PROGRESS_CAP - LOUNGE_CF_PROCESSING_PROGRESS_FLOOR,
      ticks * 0.01,
    )
    p = Math.max(p, LOUNGE_CF_PROCESSING_PROGRESS_FLOOR + creep)
  }
  return Math.min(p, 1)
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

/** Composer submit or edit flows that show progress on the feed/comment tile (not the bottom bar). */
export function loungeSnapshotUsesInlineTileVideoProgress(snapshot) {
  if (!snapshot) return false
  return (
    loungeSubmissionUsesInlineVideoPostProgress(snapshot) ||
    loungeEditSnapshotHasIncomingVideoUpload(snapshot)
  )
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

/** @deprecated Use {@link startLoungePendingCommentVideoProcessing} for resumable CF wait. */
export async function finishLoungePendingCommentVideoProcessing({
  commentId,
  streamUid,
  pendingKey,
  timeoutMs,
  onProgress,
}) {
  const id = String(commentId || '').trim()
  const uid = String(streamUid || '').trim()
  const key = String(pendingKey || id).trim()
  if (!id || !uid) return
  startLoungePendingCommentVideoProcessing({ commentId: id, streamUid: uid, pendingKey: key, timeoutMs })
  onProgress?.({ progress: 0.92, status: 'Processing video…' })
}

function feedPostStreamVideoUid(row) {
  const u = String(row?.stream_video_uid ?? '').trim()
  return u || ''
}

/** Client-only fields to re-apply after a feed reload during staged inline video publish. */
export function authorPendingPublishPatchFromSubmit({
  postId,
  streamVideoUid,
  pendingKey,
  sessionPosterBlobUrl,
}) {
  const id = String(postId || '').trim()
  const uid = String(streamVideoUid || '').trim()
  const poster = String(sessionPosterBlobUrl || '').trim()
  return {
    id,
    stream_video_uid: uid || null,
    _pendingPublishKey: id,
    _authorPendingPublish: true,
    feed_visible_at: null,
    ...(poster.startsWith('blob:') ? { _sessionStreamPosterBlob: poster } : {}),
  }
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
 * @param {number} [opts.timeoutMs]
 * @param {(info: { progress: number, status: string }) => void} [opts.onProgress]
 */
export async function publishLoungeFeedPostWhenStreamReady({
  supabaseClient,
  postId,
  streamUid,
  signal,
  timeoutMs,
  onProgress,
}) {
  const id = String(postId || '').trim()
  const uid = String(streamUid || '').trim()
  if (!id || !uid) return

  onProgress?.({ progress: 0.92, status: 'Processing video…' })
  await waitForCfStreamManifestReady(uid, {
    signal,
    supabaseClient,
    timeoutMs:
      typeof timeoutMs === 'number' && Number.isFinite(timeoutMs)
        ? timeoutMs
        : LOUNGE_CF_PROCESSING_TIMEOUT_BASE_MS,
  })
  onProgress?.({ progress: 0.98, status: 'Going live…' })

  const visibleAt = await setLoungeFeedPostFeedVisible(supabaseClient, id)
  unregisterLoungeStagedFeedPostPublishJob(id)
  notifyStagedFeedPostPublishComplete({ postId: id, visibleAt })
  onProgress?.({ progress: 1, status: 'Live' })
  return visibleAt
}
