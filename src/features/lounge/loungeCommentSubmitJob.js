import { prepareLoungeFeedImageForUpload } from '../../utils/compressImageForUpload'
import { feedCommentInsertPayload } from '../../utils/communityFeedComment.js'
import { uploadLoungeFeedPostImage } from '../../utils/communityFeedPost'
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

/**
 * Uploads media and inserts `feed_comments`.
 *
 * @param {object} opts
 * @param {import('@supabase/supabase-js').SupabaseClient} opts.supabaseClient
 * @param {{ body: string, gifOnlyUrl: string, imageFiles: File[], videoFile: File | null, streamVideoUid?: string | null, sessionStreamPosterBlobUrl?: string | null, postId: string, parentId?: string | null, userId: string }} opts.snapshot
 * @param {AbortSignal} [opts.signal]
 * @param {(info: { progress: number, status: string, detail?: string }) => void} [opts.onProgress]
 * @param {(detail: string) => void} [opts.onUploadDiagnostic]
 */
export async function executeLoungeCommentSubmission({
  supabaseClient,
  snapshot,
  signal,
  onProgress,
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
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  }

  throwIfAborted()
  report(0.05, 'Checking session', '')

  const {
    data: { session },
  } = await supabaseClient.auth.getSession()
  if (!session?.user) {
    throw new Error('You must be signed in to reply.')
  }

  const {
    body,
    gifOnlyUrl,
    imageFiles,
    videoFile,
    streamVideoUid: preUploadedUid,
    sessionStreamPosterBlobUrl,
    postId,
    parentId,
    userId,
  } = snapshot

  const preUid = String(preUploadedUid || '').trim()
  const hasVideo = Boolean(videoFile) || Boolean(preUid)
  const nImg = Array.isArray(imageFiles) ? imageFiles.length : 0

  if (hasVideo && gifOnlyUrl) {
    throw new Error('Remove the GIF before posting a video.')
  }

  let streamVideoUid = ''
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
      report(0.08, 'Reading video metadata', '')
      const dur = await probeVideoFileDurationSeconds(vf)
      throwIfAborted()
      if (!Number.isFinite(dur) || dur > LOUNGE_VIDEO_MAX_SECONDS + 0.35) {
        throw new Error(`Video must be ${LOUNGE_VIDEO_MAX_SECONDS} seconds or shorter.`)
      }
      report(0.1, 'Uploading video', 'Ether Stream (resumable)')
      const { uid } = await uploadVideoToCfStreamResumableTus(supabaseClient, vf, {
        signal,
        onUploadDiagnostic,
        onStreamUidAvailable: (id) => {
          pendingCfUploadUid = id
        },
        onProgress: (r) => report(0.1 + r * 0.5, 'Uploading video', `${Math.round(r * 100)}% sent`),
      })
      pendingCfUploadUid = uid
      throwIfAborted()
      report(0.62, 'Waiting for encoding', '')
      await waitForCfStreamManifestReady(uid, {
        signal,
        onUploadDiagnostic,
        onPoll: ({ elapsed }) => {
          const cap = 120_000
          const t = Math.min(1, elapsed / cap)
          report(0.62 + t * 0.22, 'Waiting for encoding', `${Math.round(elapsed / 1000)}s`)
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
      posterFile = await fetchLoungeStreamPosterFileFromSnapshot(
        { sessionStreamPosterBlobUrl },
        streamVideoUid,
        signal,
      )
      if (!posterFile && fileProbe) {
        throwIfAborted()
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
        throwIfAborted()
        report(0.86, 'Uploading preview', '')
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

    const uploadedUrls = []
    for (let i = 0; i < nImg; i += 1) {
      throwIfAborted()
      const file = imageFiles[i]
      report(0.2 + ((i + 1) / Math.max(nImg, 1)) * (hasVideo ? 0.15 : 0.65), 'Uploading images', `${i + 1} of ${nImg}`)
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
    report(0.92, 'Publishing reply', '')

    const mediaPart =
      streamVideoUid
        ? feedCommentInsertPayload({
            body,
            streamVideoUid,
            streamPosterUrl: streamPosterPublicUrl || undefined,
            streamVideoWidth: streamVideoWidthOut || undefined,
            streamVideoHeight: streamVideoHeightOut || undefined,
          })
        : uploadedUrls.length > 0
          ? feedCommentInsertPayload({
              body,
              imageUrls: uploadedUrls,
              gifUrl: uploadedUrls.length > 0 && gifOnlyUrl ? gifOnlyUrl : undefined,
            })
          : gifOnlyUrl
            ? feedCommentInsertPayload({ body, mediaUrl: gifOnlyUrl })
            : feedCommentInsertPayload({ body })

    const insertRow = {
      post_id: postId,
      user_id: userId,
      ...mediaPart,
    }
    if (parentId) insertRow.parent_id = parentId

    const { data, error } = await supabaseClient
      .from('feed_comments')
      .insert(insertRow)
      .select(
        'id,body,created_at,user_id,parent_id,comment_count,like_count,repost_count,bookmark_count,media_url,gif_url,image_urls,stream_video_uid,stream_poster_url,stream_video_width,stream_video_height,edited_at',
      )
      .single()

    if (error) {
      const msg = String(error.message || '')
      if (/media_url|gif_url|image_urls|stream_video_uid|stream_poster_url|stream_video_width|stream_video_height|comment_count|schema cache/i.test(msg)) {
        throw new Error(
          'Reply needs the latest feed_comments migrations on Supabase (media + comment_count).',
        )
      }
      throw new Error(msg || 'Could not post reply.')
    }

    insertSucceeded = true
    pendingCfUploadUid = null
    report(1, 'Done', '')
    return data
  } catch (e) {
    if (pendingCfUploadUid && !insertSucceeded) {
      await deleteCfStreamOrphanAsset(supabaseClient, pendingCfUploadUid)
    }
    throw e
  }
}

const COMMENT_UPDATE_SELECT =
  'id,body,created_at,user_id,parent_id,comment_count,like_count,repost_count,bookmark_count,media_url,gif_url,image_urls,stream_video_uid,stream_poster_url,stream_video_width,stream_video_height,edited_at'

/**
 * Uploads new media and updates an existing `feed_comments` row (author edit).
 */
export async function executeLoungeCommentUpdate({
  supabaseClient,
  snapshot,
  signal,
  onProgress,
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
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  }

  throwIfAborted()
  report(0.05, 'Checking session', '')

  const {
    data: { session },
  } = await supabaseClient.auth.getSession()
  if (!session?.user) {
    throw new Error('You must be signed in to edit this reply.')
  }

  const commentId = String(snapshot?.commentId || '').trim()
  const userId = String(snapshot?.userId || '').trim()
  if (!commentId || !userId) throw new Error('Could not save edit.')

  const {
    body,
    gifOnlyUrl,
    imageFiles,
    videoFile,
    streamVideoUid: preUploadedUid,
    sessionStreamPosterBlobUrl,
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
      report(0.08, 'Reading video metadata', '')
      const dur = await probeVideoFileDurationSeconds(vf)
      throwIfAborted()
      if (!Number.isFinite(dur) || dur > LOUNGE_VIDEO_MAX_SECONDS + 0.35) {
        throw new Error(`Video must be ${LOUNGE_VIDEO_MAX_SECONDS} seconds or shorter.`)
      }
      report(0.1, 'Uploading video', 'Ether Stream (resumable)')
      const { uid } = await uploadVideoToCfStreamResumableTus(supabaseClient, vf, {
        signal,
        onUploadDiagnostic,
        onStreamUidAvailable: (id) => {
          pendingCfUploadUid = id
        },
        onProgress: (r) => report(0.1 + r * 0.5, 'Uploading video', `${Math.round(r * 100)}% sent`),
      })
      pendingCfUploadUid = uid
      throwIfAborted()
      report(0.62, 'Waiting for encoding', '')
      await waitForCfStreamManifestReady(uid, {
        signal,
        onUploadDiagnostic,
        onPoll: ({ elapsed }) => {
          const cap = 120_000
          const t = Math.min(1, elapsed / cap)
          report(0.62 + t * 0.22, 'Waiting for encoding', `${Math.round(elapsed / 1000)}s`)
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
      posterFile = await fetchLoungeStreamPosterFileFromSnapshot(
        { sessionStreamPosterBlobUrl },
        streamVideoUid,
        signal,
      )
      if (!posterFile && fileProbe) {
        throwIfAborted()
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
        throwIfAborted()
        report(0.86, 'Uploading preview', '')
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

    const uploadedUrls = []
    for (let i = 0; i < nImg; i += 1) {
      throwIfAborted()
      const file = imageFiles[i]
      report(0.2 + ((i + 1) / Math.max(nImg, 1)) * (hasVideo ? 0.15 : 0.65), 'Uploading images', `${i + 1} of ${nImg}`)
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
    report(0.92, 'Saving edit', '')

    const mergedImageUrls = [...remoteImageUrls, ...uploadedUrls]
    const gu = String(gifOnlyUrl || '').trim()

    let mediaPart
    if (streamVideoUid) {
      mediaPart = feedCommentInsertPayload({
        body: '',
        streamVideoUid,
        streamPosterUrl: streamPosterPublicUrl || undefined,
        streamVideoWidth: streamVideoWidthOut || undefined,
        streamVideoHeight: streamVideoHeightOut || undefined,
      })
    } else if (mergedImageUrls.length > 0) {
      mediaPart = feedCommentInsertPayload({
        body: '',
        imageUrls: mergedImageUrls,
        gifUrl: gu || undefined,
      })
    } else if (gu) {
      mediaPart = feedCommentInsertPayload({ body: '', mediaUrl: gu })
    } else {
      mediaPart = feedCommentInsertPayload({ body: '' })
      if (clearStream || previousStreamUid) {
        mediaPart.stream_video_uid = null
        mediaPart.stream_poster_url = null
        mediaPart.stream_video_width = null
        mediaPart.stream_video_height = null
      }
    }

    const { body: _body, ...mediaCols } = mediaPart
    const updateBody = {
      body,
      edited_at: new Date().toISOString(),
      ...mediaCols,
    }

    const { data, error } = await supabaseClient
      .from('feed_comments')
      .update(updateBody)
      .eq('id', commentId)
      .eq('user_id', userId)
      .select(COMMENT_UPDATE_SELECT)
      .maybeSingle()

    if (error) {
      const msg = String(error.message || '')
      if (error.code === '42501') {
        throw new Error('You do not have permission to edit this reply.')
      }
      if (/media_url|gif_url|image_urls|stream_video_uid|stream_poster_url|stream_video_width|stream_video_height|comment_count|schema cache/i.test(msg)) {
        throw new Error(
          'Reply needs the latest feed_comments migrations on Supabase (media + comment_count).',
        )
      }
      throw new Error(msg || 'Could not save edit.')
    }
    if (!data?.id) {
      throw new Error('Could not save edit.')
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
