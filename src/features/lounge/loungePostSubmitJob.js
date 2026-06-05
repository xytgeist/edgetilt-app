import { prepareLoungeFeedImageForUpload } from '../../utils/compressImageForUpload'
import {
  communityFeedCommentQuoteRepostInsertPayload,
  communityFeedPostInsertPayload,
  communityFeedQuoteRepostInsertPayload,
  normalizeFeedCaption,
  uploadLoungeFeedPostImage,
} from '../../utils/communityFeedPost'
import {
  LOUNGE_CF_STREAM_MAX_UPLOAD_BYTES,
  LOUNGE_VIDEO_MAX_SECONDS,
  captureVideoFilePosterObjectUrl,
  deleteCfStreamOrphanAsset,
  probeVideoFileDisplaySize,
  probeVideoFileDurationSeconds,
  uploadVideoToCfStreamResumableTus,
  waitForCfStreamManifestReady,
} from '../../utils/loungeVideoUpload'
import { fetchLoungeStreamPosterFileFromSnapshot } from './loungeStreamSessionPoster.js'
import { normalizeLoungePostCategoryPills } from '../../utils/loungePostCategoryPills.js'
import { feedCommentThreadPartInsertPayload } from '../../utils/communityFeedComment.js'
import { attachLinkPreview } from '../../utils/loungeLinkPreviewApi.js'
import { resolveLoungeSubmissionVideoPrep } from './loungeQueuedVideoPrep.js'

async function uploadLoungeThreadPartImageFiles({
  supabaseClient,
  user,
  imageFiles,
  existingImageUrls,
  signal,
  onProgress,
  progressBase,
  progressSpan,
  label,
}) {
  const uploadedUrls = Array.isArray(existingImageUrls)
    ? existingImageUrls.map((u) => String(u ?? '').trim()).filter(Boolean)
    : []
  const files = Array.isArray(imageFiles) ? imageFiles : []
  const total = uploadedUrls.length + files.length
  for (let i = 0; i < files.length; i += 1) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
    const file = files[i]
    if (typeof onProgress === 'function') {
      onProgress({
        progress: progressBase + ((uploadedUrls.length + i + 1) / Math.max(1, total)) * progressSpan,
        status: label,
        detail: `${uploadedUrls.length + i + 1} of ${total}`,
      })
    }
    const { file: ready, error: cErr } = await prepareLoungeFeedImageForUpload(file)
    if (cErr) throw new Error(cErr.message)
    const { data: upUrl, error: upErr } = await uploadLoungeFeedPostImage({
      supabaseClient,
      user,
      file: ready,
    })
    if (upErr) throw new Error(upErr.message || 'Could not upload image.')
    if (!upUrl) throw new Error('Could not upload image.')
    uploadedUrls.push(upUrl)
  }
  return uploadedUrls
}

/**
 * Resolve Stream video + poster for a thread part (parts 2+; sequential caller).
 *
 * @returns {Promise<{ streamVideoUid: string, streamPosterPublicUrl: string, streamVideoWidthOut: number, streamVideoHeightOut: number, pendingUid: string | null } | null>}
 */
async function resolveThreadPartStreamVideoForInsert({
  part,
  supabaseClient,
  user,
  signal,
  onProgress,
  onUploadDiagnostic,
  progressBase,
  progressSpan,
  label,
}) {
  const preUid = String(part?.streamVideoUid ?? '').trim()
  const videoFile = part?.videoFile instanceof File ? part.videoFile : null
  const hasVideo =
    Boolean(preUid) ||
    Boolean(videoFile) ||
    Boolean(part?.videoPrepSpec) ||
    part?.awaitingThreadPartVideoPrepJobId != null ||
    Boolean(part?._capturedPrepHandoff)
  if (!hasVideo) return null

  const report = (progress, status, detail = '') => {
    if (typeof onProgress !== 'function') return
    const st = String(status || label || '').trim()
    const prefixed =
      label && st && !st.startsWith(String(label)) ? `${label} · ${st}` : st || String(label || '')
    onProgress({
      progress: progressBase + progress * progressSpan,
      status: prefixed,
      detail: detail ? String(detail) : '',
    })
  }

  let streamVideoUid = ''
  let pendingCfUploadUid = preUid || null

  const prepSnap = {
    streamVideoUid: preUid || null,
    videoFile,
    videoPrepSpec: part?.videoPrepSpec ?? null,
    awaitingComposerVideoPrepJobId: part?.awaitingThreadPartVideoPrepJobId ?? null,
    _capturedPrepHandoff: part?._capturedPrepHandoff ?? null,
    sessionStreamPosterBlobUrl: part?.sessionStreamPosterBlobUrl ?? null,
    videoPrepSlotRestore: part?.videoPrepSlotRestore ?? null,
  }

  if (preUid) {
    streamVideoUid = preUid
    report(0.2, label, 'Checking playback')
    await waitForCfStreamManifestReady(preUid, {
      signal,
      onUploadDiagnostic,
      onPoll: ({ elapsed }) => {
        const cap = 120_000
        const t = Math.min(1, elapsed / cap)
        report(0.2 + t * 0.5, label, `${Math.round(elapsed / 1000)}s`)
      },
    })
  } else {
    report(0.05, label, 'Preparing video')
    const out = await resolveLoungeSubmissionVideoPrep({
      snapshot: prepSnap,
      supabaseClient,
      signal,
      onProgress: (info) => report(0.05 + (info.progress ?? 0) * 0.55, info.status, info.detail),
      onUploadDiagnostic,
    })
    streamVideoUid = String(out.streamVideoUid || '').trim()
    pendingCfUploadUid = streamVideoUid || null
    if (!streamVideoUid) throw new Error('Could not upload thread video.')
    report(0.65, label, 'Checking playback')
    await waitForCfStreamManifestReady(streamVideoUid, {
      signal,
      onUploadDiagnostic,
      onPoll: ({ elapsed }) => {
        const cap = 120_000
        const t = Math.min(1, elapsed / cap)
        report(0.65 + t * 0.25, label, `${Math.round(elapsed / 1000)}s`)
      },
    })
  }

  let streamPosterPublicUrl = ''
  let streamVideoWidthOut = 0
  let streamVideoHeightOut = 0
  const fileProbe =
    (videoFile instanceof File ? videoFile : null) ||
    (part?.videoFile instanceof File ? part.videoFile : null)
  if (fileProbe) {
    const dim = await probeVideoFileDisplaySize(fileProbe)
    if (dim) {
      streamVideoWidthOut = dim.width
      streamVideoHeightOut = dim.height
    }
  }

  let posterFile = await fetchLoungeStreamPosterFileFromSnapshot(
    { sessionStreamPosterBlobUrl: part?.sessionStreamPosterBlobUrl ?? null },
    streamVideoUid,
    signal,
  )
  if (!posterFile && fileProbe) {
    const obj = await captureVideoFilePosterObjectUrl(fileProbe)
    if (obj) {
      try {
        const res = await fetch(obj)
        const blob = await res.blob()
        URL.revokeObjectURL(obj)
        if (blob?.size) posterFile = new File([blob], 'stream-poster.jpg', { type: 'image/jpeg' })
      } catch {
        try {
          URL.revokeObjectURL(obj)
        } catch {
          // ignore
        }
      }
    }
  }

  if (posterFile) {
    report(0.92, label, 'Uploading preview')
    const { file: readyPoster, error: posterPrepErr } = await prepareLoungeFeedImageForUpload(posterFile)
    if (posterPrepErr) throw new Error(posterPrepErr.message)
    const { data: upUrl, error: upErr } = await uploadLoungeFeedPostImage({
      supabaseClient,
      user,
      file: readyPoster,
    })
    if (upErr) throw new Error(upErr.message || 'Could not upload video preview image.')
    if (!upUrl) throw new Error('Could not upload video preview image.')
    streamPosterPublicUrl = upUrl
  }

  return {
    streamVideoUid,
    streamPosterPublicUrl,
    streamVideoWidthOut,
    streamVideoHeightOut,
    pendingUid: pendingCfUploadUid,
  }
}

/** Mirrors `SocialFeed` so insert failures surface the same copy. */
const LOUNGE_MAX_PINNED_ALERT =
  'The maximum number of pinned posts is two. Unpin a post to pin this one.'

/**
 * Slice a thread snapshot after partial publish so Retry resumes on the existing post.
 *
 * @param {object} snapshot
 * @param {number} publishedPartCount Parts already on the feed (root = 1).
 * @param {string | null | undefined} postId Root post id from partial publish.
 */
export function sliceThreadSubmissionSnapshotForResume(snapshot, publishedPartCount, postId) {
  if (!snapshot || typeof snapshot !== 'object') return snapshot
  const published = Math.max(0, Number(publishedPartCount) || 0)
  const resumePostId = String(postId || '').trim()
  if (!resumePostId || published <= 0) return snapshot
  const allParts = Array.isArray(snapshot.threadParts) ? snapshot.threadParts : []
  if (published >= allParts.length) return snapshot
  const remaining = allParts.slice(published)
  if (remaining.length === 0) return snapshot
  const first = remaining[0]
  const originalTotal =
    allParts.length > 1
      ? allParts.length
      : loungeSubmissionSnapshotThreadPartCount(snapshot)
  return {
    ...snapshot,
    caption: String(first?.body ?? ''),
    gifOnlyUrl: String(first?.gifUrl ?? '').trim(),
    imageFiles: Array.isArray(first?.imageFiles)
      ? first.imageFiles.filter((f) => f instanceof File)
      : [],
    existingImageUrls: Array.isArray(first?.existingImageUrls)
      ? first.existingImageUrls.map((u) => String(u ?? '').trim()).filter(Boolean)
      : [],
    imagePreviewBlobUrls: Array.isArray(first?.imagePreviewBlobUrls)
      ? first.imagePreviewBlobUrls.map((u) => String(u ?? '').trim()).filter((p) => p.startsWith('blob:'))
      : [],
    videoFile: first?.videoFile instanceof File ? first.videoFile : null,
    streamVideoUid: String(first?.streamVideoUid ?? '').trim() || null,
    awaitingComposerVideoPrepJobId: first?.awaitingThreadPartVideoPrepJobId ?? null,
    videoPrepSpec: first?.videoPrepSpec ?? null,
    videoPrepSlotRestore: first?.videoPrepSlotRestore ?? null,
    sessionStreamPosterBlobUrl: first?.sessionStreamPosterBlobUrl ?? null,
    _capturedPrepHandoff: first?._capturedPrepHandoff ?? null,
    threadParts: remaining,
    threadCaptions: remaining.map((p) => String(p?.body ?? '')),
    threadResumePostId: resumePostId,
    threadResumePartOffset: published,
    threadOriginalPartTotal: originalTotal > 0 ? originalTotal : remaining.length,
  }
}

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

/** True when a background Lounge post/comment job includes Stream video (not images/GIF-only). */
function loungeThreadPartSnapshotHasVideo(part) {
  if (!part || typeof part !== 'object') return false
  if (String(part.streamVideoUid ?? '').trim()) return true
  if (part.videoFile instanceof File) return true
  if (part.videoPrepSpec) return true
  if (part.awaitingThreadPartVideoPrepJobId != null) return true
  if (part._capturedPrepHandoff) return true
  return false
}

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

/**
 * @typedef {object} LoungePostSubmissionSnapshot
 * @property {string} caption
 * @property {string} gifOnlyUrl
 * @property {File[]} imageFiles
 * @property {string[] | null | undefined} [existingImageUrls] Already-uploaded image URLs (from server draft restore).
 * @property {File | null} videoFile
 * @property {string | null} [streamVideoUid] When set, video already uploaded to Cloudflare Stream (composer prep).
 * @property {number | null | undefined} [awaitingComposerVideoPrepJobId] When set, post job awaits in-flight video prep for this job id (composer or quote repost; see `quoteRepostOfPostId`).
 * @property {object | null | undefined} [videoPrepSpec] Spec for `runComposerStreamVideoPrepWithRetries` (retry / interrupted handoff).
 * @property {{ posterUrl: string, preview: string } | null | undefined} [videoPrepSlotRestore] Trim poster URLs when restoring composer after cancel.
 * @property {string | null | undefined} [sessionStreamPosterBlobUrl] Composer JPEG `blob:` URL to pin for feed until CF thumbnail loads (same-tab).
 * @property {boolean} wantsPin
 * @property {boolean} isStaffPoster
 * @property {string | null | undefined} [quoteRepostOfPostId] When set, insert a quote repost row instead of a normal post.
 * @property {string[] | null | undefined} [categoryPills] Optional audience category slugs (0–3).
 * @property {string | null | undefined} [savedDraftId] Server draft row to delete after successful publish.
 * @property {string[] | null | undefined} [threadCaptions] Ordered caption parts (root + continuations); legacy text-only.
 * @property {Array<{ body: string, gifUrl?: string, imageFiles?: File[], existingImageUrls?: string[] }> | null | undefined} [threadParts] Full thread parts with per-section media.
 */

/**
 * Uploads media and inserts `community_feed_posts` (used after the composer is cleared).
 *
 * @param {object} opts
 * @param {import('@supabase/supabase-js').SupabaseClient} opts.supabaseClient
 * @param {LoungePostSubmissionSnapshot} opts.snapshot
 * @param {AbortSignal} opts.signal
 * @param {(info: { progress: number, status: string, detail?: string }) => void} [opts.onProgress]
 * @param {(msg: string) => string} opts.rateLimitMessage
 * @param {(detail: string) => void} [opts.onUploadDiagnostic] Mint / upload / manifest failures → upload bar detail
 */
export async function executeLoungeCommunityPostSubmission({
  supabaseClient,
  snapshot,
  signal,
  onProgress,
  rateLimitMessage,
  onUploadDiagnostic,
}) {
  const throwIfAborted = () => {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
  }

  throwIfAborted()

  const {
    data: { session },
  } = await supabaseClient.auth.getSession()
  if (!session?.user) {
    throw new Error('You must be signed in to post in Lounge.')
  }

  const {
    caption,
    gifOnlyUrl,
    imageFiles,
    existingImageUrls: snapshotExistingImageUrls,
    videoFile,
    streamVideoUid: preUploadedUid,
    wantsPin,
    isStaffPoster,
    quoteRepostOfPostId,
    quoteRepostOfCommentId,
    categoryPills,
    threadCaptions: snapshotThreadCaptions,
    threadParts: snapshotThreadParts,
  } = snapshot
  const quoteParentId = quoteRepostOfPostId != null ? String(quoteRepostOfPostId).trim() : ''
  const quoteCommentParentId =
    quoteRepostOfCommentId != null ? String(quoteRepostOfCommentId).trim() : ''
  const threadParts = Array.isArray(snapshotThreadParts) && snapshotThreadParts.length > 0
    ? snapshotThreadParts.map((part) => ({
        body: normalizeFeedCaption(part?.body),
        gifUrl: String(part?.gifUrl ?? part?.gifOnlyUrl ?? '').trim(),
        imageFiles: Array.isArray(part?.imageFiles)
          ? part.imageFiles.filter((f) => f instanceof File)
          : [],
        existingImageUrls: Array.isArray(part?.existingImageUrls)
          ? part.existingImageUrls.map((u) => String(u ?? '').trim()).filter(Boolean)
          : [],
        videoFile: part?.videoFile instanceof File ? part.videoFile : null,
        streamVideoUid: String(part?.streamVideoUid ?? '').trim(),
        videoPrepSpec: part?.videoPrepSpec ?? null,
        awaitingThreadPartVideoPrepJobId: part?.awaitingThreadPartVideoPrepJobId ?? null,
        sessionStreamPosterBlobUrl: part?.sessionStreamPosterBlobUrl ?? null,
        videoPrepSlotRestore: part?.videoPrepSlotRestore ?? null,
        _capturedPrepHandoff: part?._capturedPrepHandoff ?? null,
      }))
    : Array.isArray(snapshotThreadCaptions)
      ? snapshotThreadCaptions.map((t) => ({
          body: normalizeFeedCaption(t),
          gifUrl: '',
          imageFiles: [],
          existingImageUrls: [],
          videoFile: null,
          streamVideoUid: '',
          videoPrepSpec: null,
          awaitingThreadPartVideoPrepJobId: null,
          sessionStreamPosterBlobUrl: null,
          videoPrepSlotRestore: null,
          _capturedPrepHandoff: null,
        })).filter((p) => p.body)
      : []
  if (quoteParentId && quoteCommentParentId) {
    throw new Error('Quote repost target must be a post or a comment, not both.')
  }
  if (quoteCommentParentId && threadParts.length > 1) {
    throw new Error('Quote reposts cannot be part of a thread.')
  }
  if (quoteParentId && threadParts.length > 1) {
    throw new Error('Quote reposts cannot be part of a thread.')
  }
  const threadPartTotal = threadParts.length
  const threadResumePostId = String(snapshot.threadResumePostId || '').trim()
  const threadResumePartOffset = Math.max(0, Number(snapshot.threadResumePartOffset) || 0)
  const threadOriginalPartTotal =
    Number(snapshot.threadOriginalPartTotal) > 0
      ? Number(snapshot.threadOriginalPartTotal)
      : threadPartTotal
  const isThreadResume = Boolean(threadResumePostId) && threadPartTotal >= 1

  const threadPartStatus = (partNum, status) => {
    const st = String(status || '').trim()
    if (!st) return ''
    if (/^Part \d+/.test(st)) return st
    return partNum != null && partNum > 0 ? `Part ${partNum} · ${st}` : st
  }

  const report = (progressOrInfo, status, detail = '', threadProgress = null) => {
    if (typeof onProgress !== 'function') return
    let progress = progressOrInfo
    let stRaw = status
    let det = detail
    let tp = threadProgress
    if (progressOrInfo && typeof progressOrInfo === 'object' && typeof progressOrInfo.progress === 'number') {
      progress = progressOrInfo.progress
      stRaw = progressOrInfo.status
      det = progressOrInfo.detail
      tp = null
    }
    tp = tp && typeof tp === 'object' ? tp : null
    const activePart =
      tp && typeof tp.threadPartActive === 'number'
        ? tp.threadPartActive
        : threadPartTotal > 1 && !quoteParentId && !quoteCommentParentId
          ? 1
          : null
    let st = String(stRaw || '')
    if (activePart != null && st) {
      st = threadPartStatus(activePart, st)
    }
    const payload = {
      progress: Math.max(0, Math.min(1, progress)),
      status: st,
      detail: det ? String(det) : '',
    }
    if (tp) {
      if (typeof tp.threadPartPublished === 'number') {
        payload.threadPartPublished = tp.threadPartPublished
      }
      if (typeof tp.threadPartTotal === 'number') {
        payload.threadPartTotal = tp.threadPartTotal
      }
      if (typeof tp.threadPartActive === 'number') {
        payload.threadPartActive = tp.threadPartActive
      }
    } else if (threadPartTotal > 1 && activePart != null) {
      payload.threadPartTotal = threadPartTotal
      payload.threadPartActive = activePart
    }
    onProgress(payload)
  }

  report(0.02, 'Checking session', '')

  const preUid = String(preUploadedUid || '').trim()
  const hasVideo = Boolean(videoFile) || Boolean(preUid)
  const preUploadedImageUrls = Array.isArray(snapshotExistingImageUrls)
    ? snapshotExistingImageUrls.map((u) => String(u ?? '').trim()).filter(Boolean)
    : []
  const nImg = Array.isArray(imageFiles) ? imageFiles.length : 0

  if (hasVideo && gifOnlyUrl) {
    throw new Error('Remove the GIF before posting a video.')
  }

  throwIfAborted()
  report(0.05, 'Preparing post', '', threadPartTotal > 1 ? { threadPartTotal, threadPartActive: 1 } : null)

  let streamVideoUid = ''
  /** Set when direct upload URL is minted; cleared only after DB insert succeeds. Used to delete CF orphans on any failure. */
  let pendingCfUploadUid = null
  let insertSucceeded = false

  /** @param {string} postId @param {typeof threadParts} parts @param {number} indexOffset @param {number} totalParts */
  async function publishThreadPartsAsComments(postId, parts, indexOffset, totalParts) {
    const userId = session.user.id
    for (let i = 0; i < parts.length; i += 1) {
      throwIfAborted()
      const part = parts[i]
      const partNum = indexOffset + i + 1
      const partThreadProgress = {
        threadPartTotal: totalParts,
        threadPartActive: partNum,
        threadPartPublished: partNum - 1,
      }
      const partProgress = (info) => report(info, undefined, undefined, partThreadProgress)
      const partBody = String(part?.body ?? '').trim()
      const partGif = String(part?.gifUrl ?? '').trim()
      const partHasVideo =
        Boolean(String(part?.streamVideoUid ?? '').trim()) ||
        part?.videoFile instanceof File ||
        Boolean(part?.videoPrepSpec) ||
        part?.awaitingThreadPartVideoPrepJobId != null ||
        Boolean(part?._capturedPrepHandoff)
      if (partHasVideo && partGif) {
        throw new Error(`Remove the GIF from thread post ${partNum} before posting its video.`)
      }
      const partSpanBase = 0.91 + (i / Math.max(1, parts.length)) * 0.08
      const partSpan = 0.08 / Math.max(1, parts.length)
      let partPendingCfUid = null
      try {
        const streamOut = await resolveThreadPartStreamVideoForInsert({
          part,
          supabaseClient,
          user: session.user,
          signal,
          onProgress: partProgress,
          onUploadDiagnostic,
          progressBase: partSpanBase,
          progressSpan: partSpan * 0.72,
          label: `Part ${partNum}`,
        })
        let partPayload
        if (streamOut) {
          partPendingCfUid = streamOut.pendingUid
          partPayload = feedCommentThreadPartInsertPayload({
            body: partBody,
            threadPartIndex: indexOffset + i,
            streamVideoUid: streamOut.streamVideoUid,
            streamPosterUrl: streamOut.streamPosterPublicUrl || undefined,
            streamVideoWidth: streamOut.streamVideoWidthOut || undefined,
            streamVideoHeight: streamOut.streamVideoHeightOut || undefined,
          })
        } else {
          const partImageFiles = Array.isArray(part?.imageFiles)
            ? part.imageFiles.filter((f) => f instanceof File)
            : []
          const partExistingUrls = Array.isArray(part?.existingImageUrls)
            ? part.existingImageUrls.map((u) => String(u ?? '').trim()).filter(Boolean)
            : []
          const uploadedPartUrls = await uploadLoungeThreadPartImageFiles({
            supabaseClient,
            user: session.user,
            imageFiles: partImageFiles,
            existingImageUrls: partExistingUrls,
            signal,
            onProgress: partProgress,
            progressBase: partSpanBase,
            progressSpan: partSpan * 0.72,
            label: `Uploading images`,
          })
          partPayload = feedCommentThreadPartInsertPayload({
            body: partBody,
            threadPartIndex: indexOffset + i,
            ...(uploadedPartUrls.length > 0
              ? {
                  imageUrls: uploadedPartUrls,
                  gifUrl: partGif || undefined,
                }
              : partGif
                ? { gifUrl: partGif }
                : {}),
          })
        }
        const { data: insertedPart, error: partErr } = await supabaseClient
          .from('feed_comments')
          .insert({
            post_id: postId,
            user_id: userId,
            ...partPayload,
          })
          .select('id')
          .single()
        if (partErr) throw new Error(partErr.message || `Could not publish thread part ${partNum}.`)
        partPendingCfUid = null
        const publishedPartCount = partNum
        const { error: countErr } = await supabaseClient
          .from('community_feed_posts')
          .update({ thread_part_count: publishedPartCount })
          .eq('id', postId)
        if (countErr) {
          throw new Error(countErr.message || `Could not update thread after part ${partNum}.`)
        }
        if (insertedPart?.id && partBody) {
          await attachLinkPreview(supabaseClient, {
            entityType: 'feed_comment',
            entityId: insertedPart.id,
            text: partBody,
          })
        }
        report(
          0.88 + ((i + 1) / Math.max(1, parts.length)) * 0.1,
          `Part ${publishedPartCount} of ${totalParts} posted`,
          '',
          {
            threadPartPublished: publishedPartCount,
            threadPartTotal: totalParts,
            threadPartActive: Math.min(publishedPartCount + 1, totalParts),
          },
        )
      } catch (partUploadErr) {
        if (partPendingCfUid) {
          await deleteCfStreamOrphanAsset(supabaseClient, partPendingCfUid)
        }
        const partMsg =
          (partUploadErr instanceof Error ? partUploadErr.message : String(partUploadErr || '')).trim() ||
          `Could not publish thread part ${partNum}.`
        const err = new Error(`Thread part ${partNum} of ${totalParts}: ${partMsg}`)
        err.threadPublishedParts = indexOffset + i
        err.threadPublishedPostId = postId
        throw err
      }
    }
  }

  try {
    if (isThreadResume) {
      insertSucceeded = true
      report(0.05, 'Resuming thread', `Continuing on existing post…`, {
        threadPartTotal: threadOriginalPartTotal,
        threadPartActive: threadResumePartOffset + 1,
        threadPartPublished: threadResumePartOffset,
      })
      await publishThreadPartsAsComments(
        threadResumePostId,
        threadParts,
        threadResumePartOffset,
        threadOriginalPartTotal,
      )
      report(1, 'Finishing', '')
      return
    }

    if (hasVideo && preUid) {
      streamVideoUid = preUid
      pendingCfUploadUid = preUid
      throwIfAborted()
      report(0.55, 'Video ready', 'Using upload from composer')
      await waitForCfStreamManifestReady(preUid, {
        signal,
        onUploadDiagnostic,
        onPoll: ({ elapsed }) => {
          const cap = 120_000
          const t = Math.min(1, elapsed / cap)
          report(0.55 + t * 0.3, 'Checking playback', `${Math.round(elapsed / 1000)}s`)
        },
      })
    } else if (hasVideo && videoFile) {
      const vf = videoFile
      if (vf.size > LOUNGE_CF_STREAM_MAX_UPLOAD_BYTES) {
        throw new Error('Video must be 200 MB or smaller for upload.')
      }
      report(0.06, 'Reading video metadata', `${Math.round(vf.size / (1024 * 1024))} MB file`)
      const dur = await probeVideoFileDurationSeconds(vf)
      throwIfAborted()
      if (!Number.isFinite(dur) || dur > LOUNGE_VIDEO_MAX_SECONDS + 0.35) {
        throw new Error(`Video must be ${LOUNGE_VIDEO_MAX_SECONDS} seconds or shorter.`)
      }
      report(0.08, 'Uploading video', 'Ether Stream (resumable)')
      const { uid } = await uploadVideoToCfStreamResumableTus(supabaseClient, vf, {
        signal,
        onUploadDiagnostic,
        onStreamUidAvailable: (id) => {
          pendingCfUploadUid = id
        },
        onProgress: (r) =>
          report(0.08 + r * 0.54, 'Uploading video to Ether', `${Math.round(r * 100)}% sent`),
      })
      pendingCfUploadUid = uid
      throwIfAborted()
      report(0.64, 'Waiting for Ether encoding', 'Polling HLS manifest…')
      await waitForCfStreamManifestReady(uid, {
        signal,
        onUploadDiagnostic,
        onPoll: ({ elapsed }) => {
          const cap = 120_000
          const t = Math.min(1, elapsed / cap)
          report(
            0.64 + t * 0.24,
            'Waiting for Ether encoding',
            `${Math.round(elapsed / 1000)}s elapsed (manifest must return 200)`,
          )
        },
      })
      streamVideoUid = uid
    }

    let streamPosterPublicUrl = ''
    let streamVideoWidthOut = 0
    let streamVideoHeightOut = 0

    if (streamVideoUid) {
      const fileProbe = videoFile instanceof File ? videoFile : null
      if (fileProbe) {
        const dim = await probeVideoFileDisplaySize(fileProbe)
        if (dim) {
          streamVideoWidthOut = dim.width
          streamVideoHeightOut = dim.height
        }
      }

      let posterFile = null
      throwIfAborted()
      posterFile = await fetchLoungeStreamPosterFileFromSnapshot(snapshot, streamVideoUid, signal)
      if (!posterFile && fileProbe) {
        throwIfAborted()
        const obj = await captureVideoFilePosterObjectUrl(fileProbe)
        if (obj) {
          try {
            const res = await fetch(obj)
            const blob = await res.blob()
            URL.revokeObjectURL(obj)
            if (blob?.size) {
              posterFile = new File([blob], 'stream-poster.jpg', { type: 'image/jpeg' })
            }
          } catch {
            try {
              URL.revokeObjectURL(obj)
            } catch {
              // ignore
            }
          }
        }
      }

      if (posterFile) {
        throwIfAborted()
        report(0.82, 'Uploading preview', 'Poster image')
        const { file: readyPoster, error: posterPrepErr } = await prepareLoungeFeedImageForUpload(posterFile)
        if (posterPrepErr) throw new Error(posterPrepErr.message)
        const { data: upUrl, error: upErr } = await uploadLoungeFeedPostImage({
          supabaseClient,
          user: session.user,
          file: readyPoster,
        })
        if (upErr) throw new Error(upErr.message || 'Could not upload video preview image.')
        if (!upUrl) throw new Error('Could not upload video preview image.')
        streamPosterPublicUrl = upUrl
      }
    }

    throwIfAborted()
    const uploadedUrls = [...preUploadedImageUrls]
    for (let i = 0; i < nImg; i += 1) {
      throwIfAborted()
      const file = imageFiles[i]
      const base = hasVideo ? 0.1 : 0.08
      const span = hasVideo ? 0.2 : 0.82
      const totalImg = preUploadedImageUrls.length + nImg
      report(
        base + ((preUploadedImageUrls.length + i + 1) / Math.max(1, totalImg)) * span,
        'Uploading images',
        `${preUploadedImageUrls.length + i + 1} of ${totalImg}`,
      )
      const { file: ready, error: cErr } = await prepareLoungeFeedImageForUpload(file)
      if (cErr) throw new Error(cErr.message)
      const { data: upUrl, error: upErr } = await uploadLoungeFeedPostImage({
        supabaseClient,
        user: session.user,
        file: ready,
      })
      if (upErr) throw new Error(upErr.message || 'Could not upload image.')
      if (!upUrl) throw new Error('Could not upload image.')
      uploadedUrls.push(upUrl)
    }

    throwIfAborted()
    report(
      0.9,
      quoteParentId || quoteCommentParentId ? 'Publishing quote repost' : 'Publishing post',
      'Inserting into community feed…',
    )

    let insertPayload
    if (quoteCommentParentId) {
      if (streamVideoUid) {
        insertPayload = communityFeedCommentQuoteRepostInsertPayload({
          caption,
          originalCommentId: quoteCommentParentId,
          streamVideoUid,
          streamPosterUrl: streamPosterPublicUrl || undefined,
          streamVideoWidth: streamVideoWidthOut || undefined,
          streamVideoHeight: streamVideoHeightOut || undefined,
          categoryPills,
        })
      } else if (uploadedUrls.length > 0) {
        insertPayload = communityFeedCommentQuoteRepostInsertPayload({
          caption,
          originalCommentId: quoteCommentParentId,
          imageUrls: uploadedUrls,
          gifUrl: gifOnlyUrl || undefined,
          categoryPills,
        })
      } else if (gifOnlyUrl) {
        insertPayload = communityFeedCommentQuoteRepostInsertPayload({
          caption,
          originalCommentId: quoteCommentParentId,
          gifUrl: gifOnlyUrl,
          categoryPills,
        })
      } else {
        insertPayload = communityFeedCommentQuoteRepostInsertPayload({
          caption,
          originalCommentId: quoteCommentParentId,
          categoryPills,
        })
      }
    } else if (quoteParentId) {
      if (streamVideoUid) {
        insertPayload = communityFeedQuoteRepostInsertPayload({
          caption,
          originalPostId: quoteParentId,
          streamVideoUid,
          streamPosterUrl: streamPosterPublicUrl || undefined,
          streamVideoWidth: streamVideoWidthOut || undefined,
          streamVideoHeight: streamVideoHeightOut || undefined,
          categoryPills,
        })
      } else if (uploadedUrls.length > 0) {
        insertPayload = communityFeedQuoteRepostInsertPayload({
          caption,
          originalPostId: quoteParentId,
          imageUrls: uploadedUrls,
          mediaUrl: uploadedUrls.length === 0 && gifOnlyUrl ? gifOnlyUrl : undefined,
          gifUrl: uploadedUrls.length > 0 && gifOnlyUrl ? gifOnlyUrl : undefined,
          categoryPills,
        })
      } else if (gifOnlyUrl) {
        insertPayload = communityFeedQuoteRepostInsertPayload({
          caption,
          originalPostId: quoteParentId,
          mediaUrl: gifOnlyUrl,
          categoryPills,
        })
      } else {
        insertPayload = communityFeedQuoteRepostInsertPayload({
          caption,
          originalPostId: quoteParentId,
          categoryPills,
        })
      }
    } else if (streamVideoUid) {
      insertPayload = communityFeedPostInsertPayload({
        caption,
        pinned: isStaffPoster && wantsPin ? true : undefined,
        streamVideoUid,
        streamPosterUrl: streamPosterPublicUrl || undefined,
        streamVideoWidth: streamVideoWidthOut || undefined,
        streamVideoHeight: streamVideoHeightOut || undefined,
        categoryPills,
      })
    } else if (uploadedUrls.length > 0) {
      insertPayload = communityFeedPostInsertPayload({
        caption,
        pinned: isStaffPoster && wantsPin ? true : undefined,
        imageUrls: uploadedUrls,
        gifUrl: gifOnlyUrl || undefined,
        categoryPills,
      })
    } else if (gifOnlyUrl) {
      insertPayload = communityFeedPostInsertPayload({
        caption,
        pinned: isStaffPoster && wantsPin ? true : undefined,
        mediaUrl: gifOnlyUrl,
        categoryPills,
      })
    } else {
      insertPayload = communityFeedPostInsertPayload({
        caption,
        pinned: isStaffPoster && wantsPin ? true : undefined,
        categoryPills,
      })
    }

    const { data: insertedPost, error } = await supabaseClient
      .from('community_feed_posts')
      .insert(insertPayload)
      .select('id')
      .single()

    if (error) {
      const msg = String(error.message || '')
      if (msg.toLowerCase().includes('rate limit exceeded')) {
        throw new Error(rateLimitMessage(msg))
      }
      if (error.code === '42501') {
        throw new Error('Posting is blocked by current permissions. Please sign in and try again.')
      }
      if (error.code === '42P01') {
        throw new Error('Lounge feed table is not set up in this project yet.')
      }
      if (msg.includes('MAX_PINNED_POSTS')) {
        throw new Error(LOUNGE_MAX_PINNED_ALERT)
      }
      if (/media_url|gif_url|image_urls|stream_video_uid|stream_poster_url|stream_video_width|stream_video_height|category_pills|schema cache/i.test(msg)) {
        throw new Error(
          'Media attachments need the latest DB scripts. Run supabase/lounge_feed_post_media.sql, supabase/lounge_feed_post_gif_url.sql, supabase/lounge_feed_post_image_urls.sql, and supabase/lounge_feed_post_stream_video.sql in Supabase.',
        )
      }
      throw new Error(msg || 'Could not post right now.')
    }

    insertSucceeded = true
    pendingCfUploadUid = null
    const extraThreadParts = threadParts.slice(1)
    if (insertedPost?.id && threadPartTotal > 1) {
      report(0.88, `Part 1 of ${threadPartTotal} posted`, '', {
        threadPartPublished: 1,
        threadPartTotal,
        threadPartActive: Math.min(2, threadPartTotal),
      })
    }
    if (insertedPost?.id && extraThreadParts.length > 0) {
      const totalParts = threadPartTotal
      await publishThreadPartsAsComments(insertedPost.id, extraThreadParts, 1, totalParts)
    }
    if (insertedPost?.id && caption?.trim()) {
      await attachLinkPreview(supabaseClient, {
        entityType: 'feed_post',
        entityId: insertedPost.id,
        text: caption,
      })
    }
    report(1, 'Finishing', '')
  } catch (e) {
    if (pendingCfUploadUid && !insertSucceeded) {
      await deleteCfStreamOrphanAsset(supabaseClient, pendingCfUploadUid)
    }
    throw e
  }
}

const POST_UPDATE_SELECT =
  'id,caption,edited_at,category_pills,image_urls,media_url,gif_url,stream_video_uid,stream_poster_url,stream_video_width,stream_video_height,link_preview'

/**
 * Uploads new media and updates an existing `community_feed_posts` row (author edit).
 *
 * @param {object} opts
 * @param {import('@supabase/supabase-js').SupabaseClient} opts.supabaseClient
 * @param {object} opts.snapshot
 * @param {string} opts.snapshot.postId
 * @param {string} opts.snapshot.caption
 * @param {string[]} [opts.snapshot.remoteImageUrls]
 * @param {string} [opts.snapshot.gifOnlyUrl]
 * @param {File[]} [opts.snapshot.imageFiles]
 * @param {File | null} [opts.snapshot.videoFile]
 * @param {string | null} [opts.snapshot.streamVideoUid]
 * @param {string | null} [opts.snapshot.previousStreamUid]
 * @param {boolean} [opts.snapshot.clearStream]
 * @param {string[] | null | undefined} [opts.snapshot.categoryPills]
 * @param {AbortSignal} opts.signal
 * @param {(info: { progress: number, status: string, detail?: string }) => void} [opts.onProgress]
 * @param {(msg: string) => string} opts.rateLimitMessage
 * @param {(detail: string) => void} [opts.onUploadDiagnostic]
 */
export async function executeLoungeCommunityPostUpdate({
  supabaseClient,
  snapshot,
  signal,
  onProgress,
  rateLimitMessage,
  onUploadDiagnostic,
}) {
  const report = (progress, status, detail = '') => {
    if (typeof onProgress !== 'function') return
    onProgress({
      progress: Math.max(0, Math.min(1, progress)),
      status: String(status || ''),
      detail: detail ? String(detail) : '',
    })
  }

  const throwIfAborted = () => {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
  }

  throwIfAborted()
  report(0.02, 'Checking session', '')

  const {
    data: { session },
  } = await supabaseClient.auth.getSession()
  if (!session?.user) {
    throw new Error('You must be signed in to edit this post.')
  }

  const postId = String(snapshot?.postId || '').trim()
  if (!postId) throw new Error('Could not save — post id missing.')

  const {
    caption,
    gifOnlyUrl,
    imageFiles,
    videoFile,
    streamVideoUid: preUploadedUid,
    categoryPills,
    clearStream,
  } = snapshot
  const remoteImageUrls = Array.isArray(snapshot?.remoteImageUrls)
    ? snapshot.remoteImageUrls.map((u) => String(u ?? '').trim()).filter(Boolean)
    : []
  const previousStreamUid = String(snapshot?.previousStreamUid || '').trim()
  const preUid = String(preUploadedUid || '').trim()
  const hasVideo = Boolean(videoFile) || Boolean(preUid)
  const nImg = Array.isArray(imageFiles) ? imageFiles.length : 0

  if (hasVideo && gifOnlyUrl) {
    throw new Error('Remove the GIF before posting a video.')
  }

  throwIfAborted()
  report(0.05, 'Preparing edit', '')

  let streamVideoUid = ''
  let pendingCfUploadUid = null
  let updateSucceeded = false

  try {
    if (hasVideo && preUid) {
      streamVideoUid = preUid
      pendingCfUploadUid = preUid
      throwIfAborted()
      report(0.55, 'Video ready', 'Using upload from composer')
      await waitForCfStreamManifestReady(preUid, {
        signal,
        onUploadDiagnostic,
        onPoll: ({ elapsed }) => {
          const cap = 120_000
          const t = Math.min(1, elapsed / cap)
          report(0.55 + t * 0.3, 'Checking playback', `${Math.round(elapsed / 1000)}s`)
        },
      })
    } else if (hasVideo && videoFile) {
      const vf = videoFile
      if (vf.size > LOUNGE_CF_STREAM_MAX_UPLOAD_BYTES) {
        throw new Error('Video must be 200 MB or smaller for upload.')
      }
      report(0.06, 'Reading video metadata', `${Math.round(vf.size / (1024 * 1024))} MB file`)
      const dur = await probeVideoFileDurationSeconds(vf)
      throwIfAborted()
      if (!Number.isFinite(dur) || dur > LOUNGE_VIDEO_MAX_SECONDS + 0.35) {
        throw new Error(`Video must be ${LOUNGE_VIDEO_MAX_SECONDS} seconds or shorter.`)
      }
      report(0.08, 'Uploading video', 'Ether Stream (resumable)')
      const { uid } = await uploadVideoToCfStreamResumableTus(supabaseClient, vf, {
        signal,
        onUploadDiagnostic,
        onStreamUidAvailable: (id) => {
          pendingCfUploadUid = id
        },
        onProgress: (r) =>
          report(0.08 + r * 0.54, 'Uploading video to Ether', `${Math.round(r * 100)}% sent`),
      })
      pendingCfUploadUid = uid
      throwIfAborted()
      report(0.64, 'Waiting for Ether encoding', 'Polling HLS manifest…')
      await waitForCfStreamManifestReady(uid, {
        signal,
        onUploadDiagnostic,
        onPoll: ({ elapsed }) => {
          const cap = 120_000
          const t = Math.min(1, elapsed / cap)
          report(
            0.64 + t * 0.24,
            'Waiting for Ether encoding',
            `${Math.round(elapsed / 1000)}s elapsed (manifest must return 200)`,
          )
        },
      })
      streamVideoUid = uid
    }

    let streamPosterPublicUrl = ''
    let streamVideoWidthOut = 0
    let streamVideoHeightOut = 0

    if (streamVideoUid) {
      const fileProbe = videoFile instanceof File ? videoFile : null
      if (fileProbe) {
        const dim = await probeVideoFileDisplaySize(fileProbe)
        if (dim) {
          streamVideoWidthOut = dim.width
          streamVideoHeightOut = dim.height
        }
      }

      let posterFile = null
      throwIfAborted()
      posterFile = await fetchLoungeStreamPosterFileFromSnapshot(snapshot, streamVideoUid, signal)
      if (!posterFile && fileProbe) {
        throwIfAborted()
        const obj = await captureVideoFilePosterObjectUrl(fileProbe)
        if (obj) {
          try {
            const res = await fetch(obj)
            const blob = await res.blob()
            URL.revokeObjectURL(obj)
            if (blob?.size) {
              posterFile = new File([blob], 'stream-poster.jpg', { type: 'image/jpeg' })
            }
          } catch {
            try {
              URL.revokeObjectURL(obj)
            } catch {
              // ignore
            }
          }
        }
      }

      if (posterFile) {
        throwIfAborted()
        report(0.82, 'Uploading preview', 'Poster image')
        const { file: readyPoster, error: posterPrepErr } = await prepareLoungeFeedImageForUpload(posterFile)
        if (posterPrepErr) throw new Error(posterPrepErr.message)
        const { data: upUrl, error: upErr } = await uploadLoungeFeedPostImage({
          supabaseClient,
          user: session.user,
          file: readyPoster,
        })
        if (upErr) throw new Error(upErr.message || 'Could not upload video preview image.')
        if (!upUrl) throw new Error('Could not upload video preview image.')
        streamPosterPublicUrl = upUrl
      }
    }

    throwIfAborted()
    const uploadedUrls = []
    for (let i = 0; i < nImg; i += 1) {
      throwIfAborted()
      const file = imageFiles[i]
      const base = hasVideo ? 0.1 : 0.08
      const span = hasVideo ? 0.2 : 0.82
      report(base + ((i + 1) / nImg) * span, 'Uploading images', `${i + 1} of ${nImg}`)
      const { file: ready, error: cErr } = await prepareLoungeFeedImageForUpload(file)
      if (cErr) throw new Error(cErr.message)
      const { data: upUrl, error: upErr } = await uploadLoungeFeedPostImage({
        supabaseClient,
        user: session.user,
        file: ready,
      })
      if (upErr) throw new Error(upErr.message || 'Could not upload image.')
      if (!upUrl) throw new Error('Could not upload image.')
      uploadedUrls.push(upUrl)
    }

    throwIfAborted()
    report(0.9, 'Saving edit', 'Updating post…')

    const mergedImageUrls = [...remoteImageUrls, ...uploadedUrls]
    const gu = String(gifOnlyUrl || '').trim()

    let mediaPayload
    if (streamVideoUid) {
      mediaPayload = communityFeedPostInsertPayload({
        caption: '',
        streamVideoUid,
        streamPosterUrl: streamPosterPublicUrl || undefined,
        streamVideoWidth: streamVideoWidthOut || undefined,
        streamVideoHeight: streamVideoHeightOut || undefined,
      })
    } else if (mergedImageUrls.length > 0) {
      mediaPayload = communityFeedPostInsertPayload({
        caption: '',
        imageUrls: mergedImageUrls,
        gifUrl: gu || undefined,
      })
    } else if (gu) {
      mediaPayload = communityFeedPostInsertPayload({
        caption: '',
        mediaUrl: gu,
      })
    } else {
      mediaPayload = communityFeedPostInsertPayload({ caption: '' })
      if (clearStream || previousStreamUid) {
        mediaPayload.stream_video_uid = null
        mediaPayload.stream_poster_url = null
        mediaPayload.stream_video_width = null
        mediaPayload.stream_video_height = null
      }
    }

    const {
      game_title: _gt,
      game_slug: _gs,
      pinned: _pin,
      caption: _cap,
      category_pills: _mediaCategoryPills,
      ...mediaCols
    } = mediaPayload
    const updateBody = {
      caption,
      edited_at: new Date().toISOString(),
      ...mediaCols,
      category_pills: normalizeLoungePostCategoryPills(categoryPills),
    }

    const { data, error } = await supabaseClient
      .from('community_feed_posts')
      .update(updateBody)
      .eq('id', postId)
      .select(POST_UPDATE_SELECT)
      .maybeSingle()

    if (error) {
      const msg = String(error.message || '')
      if (msg.toLowerCase().includes('rate limit exceeded')) {
        throw new Error(rateLimitMessage(msg))
      }
      if (error.code === '42501') {
        throw new Error('You can no longer edit this post (time window or permissions).')
      }
      if (/media_url|gif_url|image_urls|stream_video_uid|stream_poster_url|stream_video_width|stream_video_height|category_pills|schema cache/i.test(msg)) {
        throw new Error(
          'Media attachments need the latest DB scripts. Run supabase/lounge_feed_post_media.sql, supabase/lounge_feed_post_gif_url.sql, supabase/lounge_feed_post_image_urls.sql, and supabase/lounge_feed_post_stream_video.sql in Supabase.',
        )
      }
      throw new Error(msg || 'Could not save.')
    }
    if (!data?.id) {
      throw new Error('Could not save. Try refreshing the feed.')
    }

    updateSucceeded = true
    pendingCfUploadUid = null
    let linkPreview = data?.link_preview ?? null
    if (caption?.trim()) {
      linkPreview = await attachLinkPreview(supabaseClient, {
        entityType: 'feed_post',
        entityId: postId,
        text: caption,
      })
    }
    if (previousStreamUid && streamVideoUid && previousStreamUid !== streamVideoUid) {
      await deleteCfStreamOrphanAsset(supabaseClient, previousStreamUid)
    } else if (previousStreamUid && !streamVideoUid && clearStream) {
      await deleteCfStreamOrphanAsset(supabaseClient, previousStreamUid)
    }
    report(1, 'Done', '')
    return linkPreview ? { ...data, link_preview: linkPreview } : data
  } catch (e) {
    if (pendingCfUploadUid && !updateSucceeded) {
      await deleteCfStreamOrphanAsset(supabaseClient, pendingCfUploadUid)
    }
    throw e
  }
}
