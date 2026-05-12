import { prepareLoungeFeedImageForUpload } from '../../utils/compressImageForUpload'
import { communityFeedPostInsertPayload, uploadLoungeFeedPostImage } from '../../utils/communityFeedPost'
import {
  LOUNGE_CF_STREAM_MAX_UPLOAD_BYTES,
  LOUNGE_VIDEO_MAX_SECONDS,
  probeVideoFileDurationSeconds,
  requestCfStreamDirectUpload,
  uploadVideoToCfStreamDirectUrlWithProgress,
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
 * @param {(ratio: number) => void} [opts.onProgress] 0–1
 * @param {(msg: string) => string} opts.rateLimitMessage
 */
export async function executeLoungeCommunityPostSubmission({
  supabaseClient,
  snapshot,
  signal,
  onProgress,
  rateLimitMessage,
}) {
  const tick = (n) => {
    if (typeof onProgress === 'function') onProgress(Math.max(0, Math.min(1, n)))
  }

  const throwIfAborted = () => {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
  }

  throwIfAborted()
  tick(0.02)

  const {
    data: { session },
  } = await supabaseClient.auth.getSession()
  if (!session?.user) {
    throw new Error('You must be signed in to post in Lounge.')
  }

  const { caption, gifOnlyUrl, imageFiles, videoFile, wantsPin, isStaffPoster } = snapshot
  const hasVideo = videoFile != null
  const nImg = Array.isArray(imageFiles) ? imageFiles.length : 0

  if (hasVideo && gifOnlyUrl) {
    throw new Error('Remove the GIF before posting a video.')
  }

  throwIfAborted()
  tick(0.05)

  let streamVideoUid = ''
  if (hasVideo && videoFile) {
    const vf = videoFile
    if (vf.size > LOUNGE_CF_STREAM_MAX_UPLOAD_BYTES) {
      throw new Error('Video must be 200 MB or smaller for upload.')
    }
    const dur = await probeVideoFileDurationSeconds(vf)
    throwIfAborted()
    if (!Number.isFinite(dur) || dur > LOUNGE_VIDEO_MAX_SECONDS + 0.35) {
      throw new Error(`Video must be ${LOUNGE_VIDEO_MAX_SECONDS} seconds or shorter.`)
    }
    tick(0.08)
    const { uploadURL, uid } = await requestCfStreamDirectUpload(supabaseClient)
    throwIfAborted()
    tick(0.1)
    await uploadVideoToCfStreamDirectUrlWithProgress(uploadURL, vf, {
      signal,
      onProgress: (r) => tick(0.1 + r * 0.52),
    })
    throwIfAborted()
    tick(0.64)
    await waitForCfStreamManifestReady(uid, {
      signal,
      onPoll: ({ elapsed }) => {
        const cap = 120_000
        const t = Math.min(1, elapsed / cap)
        tick(0.64 + t * 0.24)
      },
    })
    streamVideoUid = uid
  }

  throwIfAborted()
  const uploadedUrls = []
  for (let i = 0; i < nImg; i += 1) {
    throwIfAborted()
    const file = imageFiles[i]
    const base = hasVideo ? 0.1 : 0.08
    const span = hasVideo ? 0.2 : 0.82
    tick(base + ((i + 1) / nImg) * span)
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
  tick(0.9)

  let insertPayload
  if (streamVideoUid) {
    insertPayload = communityFeedPostInsertPayload({
      caption,
      gameTitle: 'Lounge',
      gameSlug: null,
      pinned: isStaffPoster && wantsPin ? true : undefined,
      streamVideoUid,
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
    if (/media_url|gif_url|image_urls|stream_video_uid|schema cache/i.test(msg)) {
      throw new Error(
        'Media attachments need the latest DB scripts. Run supabase/lounge_feed_post_media.sql, supabase/lounge_feed_post_gif_url.sql, supabase/lounge_feed_post_image_urls.sql, and supabase/lounge_feed_post_stream_video.sql in Supabase.',
      )
    }
    throw new Error(msg || 'Could not post right now.')
  }

  tick(1)
}
