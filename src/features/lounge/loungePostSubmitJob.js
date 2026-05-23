import { prepareLoungeFeedImageForUpload } from '../../utils/compressImageForUpload'
import {
  communityFeedPostInsertPayload,
  communityFeedQuoteRepostInsertPayload,
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

/** Mirrors `SocialFeed` so insert failures surface the same copy. */
const LOUNGE_MAX_PINNED_ALERT =
  'The maximum number of pinned posts is two. Unpin a post to pin this one.'

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
  return false
}

/**
 * @typedef {object} LoungePostSubmissionSnapshot
 * @property {string} caption
 * @property {string} gifOnlyUrl
 * @property {File[]} imageFiles
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
    throw new Error('You must be signed in to post in Lounge.')
  }

  const {
    caption,
    gifOnlyUrl,
    imageFiles,
    videoFile,
    streamVideoUid: preUploadedUid,
    wantsPin,
    isStaffPoster,
    quoteRepostOfPostId,
    categoryPills,
  } = snapshot
  const quoteParentId = quoteRepostOfPostId != null ? String(quoteRepostOfPostId).trim() : ''
  const preUid = String(preUploadedUid || '').trim()
  const hasVideo = Boolean(videoFile) || Boolean(preUid)
  const nImg = Array.isArray(imageFiles) ? imageFiles.length : 0

  if (hasVideo && gifOnlyUrl) {
    throw new Error('Remove the GIF before posting a video.')
  }

  throwIfAborted()
  report(0.05, 'Preparing post', '')

  let streamVideoUid = ''
  /** Set when direct upload URL is minted; cleared only after DB insert succeeds. Used to delete CF orphans on any failure. */
  let pendingCfUploadUid = null
  let insertSucceeded = false

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
    report(0.9, quoteParentId ? 'Publishing quote repost' : 'Publishing post', 'Inserting into community feed…')

    let insertPayload
    if (quoteParentId) {
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

    const { error } = await supabaseClient.from('community_feed_posts').insert(insertPayload)

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
    report(1, 'Finishing', '')
  } catch (e) {
    if (pendingCfUploadUid && !insertSucceeded) {
      await deleteCfStreamOrphanAsset(supabaseClient, pendingCfUploadUid)
    }
    throw e
  }
}

const POST_UPDATE_SELECT =
  'id,caption,edited_at,category_pills,image_urls,media_url,gif_url,stream_video_uid,stream_poster_url,stream_video_width,stream_video_height'

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
    if (previousStreamUid && streamVideoUid && previousStreamUid !== streamVideoUid) {
      await deleteCfStreamOrphanAsset(supabaseClient, previousStreamUid)
    } else if (previousStreamUid && !streamVideoUid && clearStream) {
      await deleteCfStreamOrphanAsset(supabaseClient, previousStreamUid)
    }
    report(1, 'Done', '')
    return data
  } catch (e) {
    if (pendingCfUploadUid && !updateSucceeded) {
      await deleteCfStreamOrphanAsset(supabaseClient, pendingCfUploadUid)
    }
    throw e
  }
}
