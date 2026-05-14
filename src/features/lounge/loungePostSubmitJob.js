import { prepareLoungeFeedImageForUpload } from '../../utils/compressImageForUpload'
import { communityFeedPostInsertPayload, uploadLoungeFeedPostImage } from '../../utils/communityFeedPost'
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

/** Mirrors `SocialFeed` so insert failures surface the same copy. */
const LOUNGE_MAX_PINNED_ALERT =
  'The maximum number of pinned posts is two. Unpin a post to pin this one.'

/**
 * @typedef {object} LoungePostSubmissionSnapshot
 * @property {string} caption
 * @property {string} gifOnlyUrl
 * @property {File[]} imageFiles
 * @property {File | null} videoFile
 * @property {string | null} [streamVideoUid] When set, video already uploaded to Cloudflare Stream (composer prep).
 * @property {number | null | undefined} [awaitingComposerVideoPrepJobId] When set, post job awaits in-flight composer prep for this job id.
 * @property {object | null | undefined} [videoPrepSpec] Spec for `runComposerStreamVideoPrepWithRetries` (retry / interrupted handoff).
 * @property {{ posterUrl: string, preview: string } | null | undefined} [videoPrepSlotRestore] Trim poster URLs when restoring composer after cancel.
 * @property {string | null | undefined} [sessionStreamPosterBlobUrl] Composer JPEG `blob:` URL to pin for feed until CF thumbnail loads (same-tab).
 * @property {boolean} wantsPin
 * @property {boolean} isStaffPoster
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

  const { caption, gifOnlyUrl, imageFiles, videoFile, streamVideoUid: preUploadedUid, wantsPin, isStaffPoster } =
    snapshot
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
      report(0.08, 'Uploading video', 'Cloudflare Stream (resumable)')
      const { uid } = await uploadVideoToCfStreamResumableTus(supabaseClient, vf, {
        signal,
        onUploadDiagnostic,
        onStreamUidAvailable: (id) => {
          pendingCfUploadUid = id
        },
        onProgress: (r) =>
          report(0.08 + r * 0.54, 'Uploading video to Cloudflare', `${Math.round(r * 100)}% sent`),
      })
      pendingCfUploadUid = uid
      throwIfAborted()
      report(0.64, 'Waiting for Cloudflare encoding', 'Polling HLS manifest…')
      await waitForCfStreamManifestReady(uid, {
        signal,
        onUploadDiagnostic,
        onPoll: ({ elapsed }) => {
          const cap = 120_000
          const t = Math.min(1, elapsed / cap)
          report(
            0.64 + t * 0.24,
            'Waiting for Cloudflare encoding',
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
      const sess = String(snapshot.sessionStreamPosterBlobUrl || '').trim()
      if (sess.startsWith('blob:')) {
        throwIfAborted()
        const res = await fetch(sess)
        const b = await res.blob()
        if (b?.size) {
          posterFile = new File([b], 'stream-poster.jpg', { type: 'image/jpeg' })
        }
      } else if (fileProbe) {
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
        const { data: upUrl, error: upErr } = await uploadLoungeFeedPostImage({
          supabaseClient,
          user: session.user,
          file: posterFile,
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
    report(0.9, 'Publishing post', 'Inserting into community feed…')

    let insertPayload
    if (streamVideoUid) {
      insertPayload = communityFeedPostInsertPayload({
        caption,
        gameTitle: 'Lounge',
        gameSlug: null,
        pinned: isStaffPoster && wantsPin ? true : undefined,
        streamVideoUid,
        streamPosterUrl: streamPosterPublicUrl || undefined,
        streamVideoWidth: streamVideoWidthOut || undefined,
        streamVideoHeight: streamVideoHeightOut || undefined,
      })
    } else if (uploadedUrls.length > 0) {
      insertPayload = communityFeedPostInsertPayload({
        caption,
        gameTitle: 'Lounge',
        gameSlug: null,
        pinned: isStaffPoster && wantsPin ? true : undefined,
        imageUrls: uploadedUrls,
        gifUrl: gifOnlyUrl || undefined,
      })
    } else if (gifOnlyUrl) {
      insertPayload = communityFeedPostInsertPayload({
        caption,
        gameTitle: 'Lounge',
        gameSlug: null,
        pinned: isStaffPoster && wantsPin ? true : undefined,
        mediaUrl: gifOnlyUrl,
      })
    } else {
      insertPayload = communityFeedPostInsertPayload({
        caption,
        gameTitle: 'Lounge',
        gameSlug: null,
        pinned: isStaffPoster && wantsPin ? true : undefined,
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
      if (/media_url|gif_url|image_urls|stream_video_uid|stream_poster_url|stream_video_width|stream_video_height|schema cache/i.test(msg)) {
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
