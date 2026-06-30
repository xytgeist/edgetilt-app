import { prepareLoungeFeedImageForUpload } from './compressImageForUpload.js'
import { uploadLoungeFeedPostImage } from './communityFeedPost.js'
import { LOUNGE_CAPTION_MAX, LOUNGE_POST_THREAD_MAX_PARTS } from './loungeCommentLimits.js'
import { normalizeLoungePostCategoryPills } from './loungePostCategoryPills.js'
import { buildThreadDraftCaptionsWithSnapshotMediaMarkers } from './loungeThreadComposeDraftMediaMarkers.js'
import { emptyThreadComposePartMedia, threadPartVideoSlotFromDraft } from './loungeThreadComposeMedia.js'
import { threadComposePartVideoSnapshotFields } from '../features/lounge/loungeThreadComposeVideoPrep.js'
import { resolveLoungeSubmissionVideoPrep } from '../features/lounge/loungeQueuedVideoPrep.js'
import {
  captureVideoFilePosterObjectUrl,
  deleteCfStreamOrphanAsset,
  probeVideoFileDisplaySize,
} from './loungeVideoUpload.js'
import { fetchLoungeStreamPosterFileFromSnapshot } from '../features/lounge/loungeStreamSessionPoster.js'

export const LOUNGE_POST_DRAFTS_MAX = 20
export const LOUNGE_POST_DRAFTS_MAX_IMAGES = 6

const LOUNGE_POST_DRAFT_SELECT_BASE =
  'id, caption, category_pills, gif_url, image_urls, stream_video_uid, stream_poster_url, stream_video_width, stream_video_height, quote_repost_of_post_id, updated_at, created_at'

const LOUNGE_POST_DRAFT_SELECT_WITH_THREAD =
  'id, caption, category_pills, gif_url, image_urls, stream_video_uid, stream_poster_url, stream_video_width, stream_video_height, thread_captions, thread_part_media, quote_repost_of_post_id, updated_at, created_at'

function isThreadCaptionsSchemaError(error) {
  const msg = String(error?.message || '')
  return /thread_captions|schema cache|PGRST204/i.test(msg)
}

function isDraftMediaSchemaError(error) {
  const msg = String(error?.message || '')
  return /thread_part_media|stream_video_uid|stream_poster_url|stream_video_width|stream_video_height|schema cache|PGRST204/i.test(msg)
}

function normalizeThreadCaptionsForDraft(raw) {
  const parts = Array.isArray(raw)
    ? raw.map((t) => String(t ?? '').slice(0, LOUNGE_CAPTION_MAX))
    : []
  let end = parts.length
  while (end > 1 && !parts[end - 1].trim()) end -= 1
  const trimmed = parts.slice(0, Math.min(end, LOUNGE_POST_THREAD_MAX_PARTS))
  if (trimmed.length <= 1) {
    return { caption: trimmed[0] || '', threadCaptions: [] }
  }
  return { caption: trimmed[0], threadCaptions: trimmed }
}

/** @typedef {{
 *   gif_url: string,
 *   image_urls: string[],
 *   stream_video_uid: string,
 *   stream_poster_url: string,
 *   stream_video_width: number | null,
 *   stream_video_height: number | null,
 * }} LoungePostDraftPartMediaRow */

/** @typedef {{
 *   id: string,
 *   caption: string,
 *   category_pills: string[],
 *   gif_url: string,
 *   image_urls: string[],
 *   stream_video_uid: string,
 *   stream_poster_url: string,
 *   stream_video_width: number | null,
 *   stream_video_height: number | null,
 *   thread_captions: string[],
 *   thread_part_media: LoungePostDraftPartMediaRow[],
 *   quote_repost_of_post_id: string | null,
 *   updated_at: string,
 *   created_at: string,
 * }} LoungePostDraftRow */

function parseImageUrls(raw) {
  let imageUrls = raw
  if (typeof imageUrls === 'string') {
    try {
      imageUrls = JSON.parse(imageUrls)
    } catch {
      imageUrls = []
    }
  }
  return Array.isArray(imageUrls)
    ? imageUrls.map((u) => String(u ?? '').trim()).filter(Boolean).slice(0, LOUNGE_POST_DRAFTS_MAX_IMAGES)
    : []
}

function normalizeDraftPartMediaRow(raw) {
  if (!raw || typeof raw !== 'object') {
    return {
      gif_url: '',
      image_urls: [],
      stream_video_uid: '',
      stream_poster_url: '',
      stream_video_width: null,
      stream_video_height: null,
    }
  }
  const w = raw.stream_video_width
  const h = raw.stream_video_height
  return {
    gif_url: String(raw.gif_url ?? '').trim().slice(0, 2048),
    image_urls: parseImageUrls(raw.image_urls),
    stream_video_uid: String(raw.stream_video_uid ?? '').trim().slice(0, 128),
    stream_poster_url: String(raw.stream_poster_url ?? '').trim().slice(0, 2048),
    stream_video_width: Number.isFinite(Number(w)) && Number(w) > 0 ? Math.round(Number(w)) : null,
    stream_video_height: Number.isFinite(Number(h)) && Number(h) > 0 ? Math.round(Number(h)) : null,
  }
}

function normalizeDraftRow(row) {
  if (!row?.id) return null
  const threadCaptions = Array.isArray(row.thread_captions)
    ? row.thread_captions.map((t) => String(t ?? '').slice(0, LOUNGE_CAPTION_MAX))
    : []
  const normalizedThread = normalizeThreadCaptionsForDraft(threadCaptions)
  let threadPartMedia = []
  if (Array.isArray(row.thread_part_media)) {
    threadPartMedia = row.thread_part_media.map(normalizeDraftPartMediaRow)
  } else if (typeof row.thread_part_media === 'string') {
    try {
      const parsed = JSON.parse(row.thread_part_media)
      if (Array.isArray(parsed)) threadPartMedia = parsed.map(normalizeDraftPartMediaRow)
    } catch {
      threadPartMedia = []
    }
  }
  const w = row.stream_video_width
  const h = row.stream_video_height
  return {
    id: String(row.id),
    caption: String(row.caption ?? normalizedThread.caption).slice(0, LOUNGE_CAPTION_MAX),
    category_pills: normalizeLoungePostCategoryPills(row.category_pills),
    gif_url: String(row.gif_url ?? '').trim().slice(0, 2048),
    image_urls: parseImageUrls(row.image_urls),
    stream_video_uid: String(row.stream_video_uid ?? '').trim().slice(0, 128),
    stream_poster_url: String(row.stream_poster_url ?? '').trim().slice(0, 2048),
    stream_video_width: Number.isFinite(Number(w)) && Number(w) > 0 ? Math.round(Number(w)) : null,
    stream_video_height: Number.isFinite(Number(h)) && Number(h) > 0 ? Math.round(Number(h)) : null,
    thread_captions:
      normalizedThread.threadCaptions.length > 1
        ? normalizedThread.threadCaptions
        : [],
    thread_part_media: threadPartMedia,
    quote_repost_of_post_id: row.quote_repost_of_post_id ? String(row.quote_repost_of_post_id) : null,
    updated_at: String(row.updated_at ?? ''),
    created_at: String(row.created_at ?? ''),
  }
}

function draftImageItemsFromUrls(urls) {
  const list = Array.isArray(urls) ? urls : []
  return list.map((url, i) => ({
    id: `draft-img-${i}-${String(url).slice(-12)}`,
    file: null,
    preview: String(url),
    remoteUrl: String(url),
  }))
}

/** Collect Stream uids stored on a draft row (root + continuation parts). */
export function collectLoungePostDraftStreamUids(draft) {
  /** @type {string[]} */
  const uids = []
  const root = String(draft?.stream_video_uid ?? '').trim()
  if (root) uids.push(root)
  for (const part of Array.isArray(draft?.thread_part_media) ? draft.thread_part_media : []) {
    const uid = String(part?.stream_video_uid ?? '').trim()
    if (uid) uids.push(uid)
  }
  return uids
}

/** True when the draft should restore into the thread compose sheet. */
export function loungePostDraftIsThread(draft) {
  return Array.isArray(draft?.thread_captions) && draft.thread_captions.length > 1
}

function draftPartMediaHasContent(part) {
  if (!part) return false
  if (String(part.gif_url || part.gifUrl || '').trim()) return true
  if (Array.isArray(part.image_urls) && part.image_urls.length > 0) return true
  if (Array.isArray(part.existingImageUrls) && part.existingImageUrls.length > 0) return true
  if (Array.isArray(part.imageFiles) && part.imageFiles.length > 0) return true
  if (String(part.stream_video_uid || part.streamVideoUid || '').trim()) return true
  if (part.videoSlot) return true
  return false
}

/**
 * Build compose part-media rows from a normalized draft.
 *
 * @param {LoungePostDraftRow} draft
 * @param {number} partCount
 */
export function loungePostDraftThreadComposePartMedia(draft, partCount) {
  const n = Math.max(1, partCount)
  /** @type {import('./loungeThreadComposeMedia.js').ThreadComposePartMedia[]} */
  const rows = []
  for (let i = 0; i < n; i += 1) {
    if (i === 0) {
      rows.push({
        imageItems: draftImageItemsFromUrls(draft.image_urls),
        gifUrl: String(draft.gif_url || '').trim(),
        videoSlot: threadPartVideoSlotFromDraft({
          streamVideoUid: draft.stream_video_uid,
          streamPosterUrl: draft.stream_poster_url,
        }),
        videoPrepHud: null,
      })
      continue
    }
    const cont = draft.thread_part_media[i - 1] || normalizeDraftPartMediaRow(null)
    rows.push({
      imageItems: draftImageItemsFromUrls(cont.image_urls),
      gifUrl: String(cont.gif_url || '').trim(),
      videoSlot: threadPartVideoSlotFromDraft({
        streamVideoUid: cont.stream_video_uid,
        streamPosterUrl: cont.stream_poster_url,
      }),
      videoPrepHud: null,
    })
  }
  return rows
}

/** Single-post composer video slot from draft root stream fields. */
export function loungePostDraftComposerVideoSlot(draft) {
  return threadPartVideoSlotFromDraft({
    streamVideoUid: draft?.stream_video_uid,
    streamPosterUrl: draft?.stream_poster_url,
  })
}

/**
 * Block draft save only on failed video prep - in-flight prep continues in the background bar.
 *
 * @param {import('./loungeThreadComposeMedia.js').ThreadComposePartMedia[]} partMedia
 * @returns {string | null}
 */
export function loungePostDraftValidateComposePartsForSave(partMedia) {
  const media = Array.isArray(partMedia) ? partMedia : []
  for (let i = 0; i < media.length; i += 1) {
    if (media[i]?.videoSlot?.prepStatus === 'failed') {
      return `Post ${i + 1}: video upload failed - remove the video or pick a new one before saving.`
    }
  }
  return null
}

/** @param {object | null | undefined} slot */
export function loungePostDraftValidateComposerVideoSlotForSave(slot) {
  if (slot?.prepStatus === 'failed') {
    return 'Video upload failed - remove the video or pick a new one before saving.'
  }
  return null
}

async function resolveDraftVideoSlotForUpsert({
  supabaseClient,
  slot,
  prepMeta,
  signal,
  onProgress,
  label,
}) {
  const uid0 = String(slot?.streamVideoUid || '').trim()
  if (uid0) {
    return { ...slot, streamVideoUid: uid0, prepStatus: 'ready', prepError: '' }
  }
  if (!slot) return null

  const snap = threadComposePartVideoSnapshotFields(slot, prepMeta ?? null)
  const prepSnap = {
    streamVideoUid: null,
    videoFile: snap.videoFile,
    videoPrepSpec: snap.videoPrepSpec,
    awaitingComposerVideoPrepJobId: snap.awaitingThreadPartVideoPrepJobId,
    _capturedPrepHandoff: prepMeta?.handoff ?? snap._capturedPrepHandoff ?? null,
    sessionStreamPosterBlobUrl: snap.sessionStreamPosterBlobUrl,
    videoPrepSlotRestore: snap.videoPrepSlotRestore,
  }

  const report = (info) => {
    if (typeof onProgress !== 'function') return
    const st = label ? `${label} · ${String(info.status || 'Preparing video')}` : String(info.status || '')
    onProgress({
      progress: typeof info.progress === 'number' ? info.progress * 0.45 : 0.1,
      status: st,
      detail: String(info.detail || ''),
    })
  }

  const out = await resolveLoungeSubmissionVideoPrep({
    snapshot: prepSnap,
    supabaseClient,
    signal,
    onProgress: (info) => report(info),
  })
  const uid = String(out.streamVideoUid || '').trim()
  if (!uid) throw new Error('Could not upload draft video.')

  let preview = slot.preview
  if (out.encodedFile instanceof File) {
    try {
      preview = URL.createObjectURL(out.encodedFile)
    } catch {
      preview = slot.preview
    }
  }

  return {
    ...slot,
    file: out.encodedFile instanceof File ? out.encodedFile : slot.file,
    streamVideoUid: uid,
    preview,
    prepStatus: 'ready',
    prepError: '',
  }
}

/**
 * Finish in-flight Stream prep for draft parts, then return a payload ready for upsert.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {object} payload
 * @param {{ videoPrepByPart?: Record<number, object>, composerVideoPrep?: object | null, signal?: AbortSignal, onProgress?: (info: { progress: number, status: string, detail?: string }) => void }} opts
 */
export async function prepareLoungePostDraftPayloadForUpsert(supabaseClient, payload, opts = {}) {
  const signal = opts.signal
  const onProgress = opts.onProgress
  const videoPrepByPart = opts.videoPrepByPart && typeof opts.videoPrepByPart === 'object'
    ? opts.videoPrepByPart
    : {}

  let next = { ...payload }

  if (next.videoSlot) {
    onProgress?.({ progress: 0.08, status: 'Preparing video', detail: 'Part 1' })
    next = {
      ...next,
      videoSlot: await resolveDraftVideoSlotForUpsert({
        supabaseClient,
        slot: next.videoSlot,
        prepMeta: opts.composerVideoPrep ?? videoPrepByPart[0] ?? null,
        signal,
        onProgress,
        label: 'Part 1',
      }),
    }
  }

  const partInputs = Array.isArray(next.threadPartMediaInput) ? [...next.threadPartMediaInput] : []
  if (partInputs.length > 0) {
    for (let i = 0; i < partInputs.length; i += 1) {
      const input = partInputs[i]
      if (!input?.videoSlot) continue
      const partNum = i + 2
      onProgress?.({ progress: 0.1 + (i / Math.max(1, partInputs.length)) * 0.35, status: 'Preparing video', detail: `Part ${partNum}` })
      partInputs[i] = {
        ...input,
        videoSlot: await resolveDraftVideoSlotForUpsert({
          supabaseClient,
          slot: input.videoSlot,
          prepMeta: videoPrepByPart[i + 1] ?? null,
          signal,
          onProgress,
          label: `Part ${partNum}`,
        }),
      }
    }
    next = { ...next, threadPartMediaInput: partInputs }
  }

  return next
}

async function uploadPosterFileForDraft(supabaseClient, user, posterFile, signal) {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  const { file: readyPoster, error: posterPrepErr } = await prepareLoungeFeedImageForUpload(posterFile)
  if (posterPrepErr) throw new Error(posterPrepErr.message)
  const { data: upUrl, error: upErr } = await uploadLoungeFeedPostImage({
    supabaseClient,
    user,
    file: readyPoster,
    signal,
  })
  if (upErr) throw new Error(upErr.message || 'Could not upload video preview image.')
  if (!upUrl) throw new Error('Could not upload video preview image.')
  return String(upUrl).trim()
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {import('@supabase/supabase-js').User} user
 * @param {object | null | undefined} slot
 * @param {LoungePostDraftPartMediaRow | { stream_video_uid?: string, stream_poster_url?: string, stream_video_width?: number | null, stream_video_height?: number | null }} [existing]
 * @param {AbortSignal} [signal]
 */
async function resolveDraftVideoPersistFields(supabaseClient, user, slot, existing = {}, signal) {
  const uid = String(slot?.streamVideoUid || '').trim()
  if (!uid) {
    return {
      stream_video_uid: '',
      stream_poster_url: '',
      stream_video_width: null,
      stream_video_height: null,
    }
  }

  const existingUid = String(existing.stream_video_uid || '').trim()
  const existingPoster = String(existing.stream_poster_url || '').trim()
  const slotPoster = String(slot.posterUrl || '').trim()

  let posterUrl = ''
  if (slotPoster.startsWith('http')) {
    posterUrl = slotPoster
  } else if (existingUid === uid && existingPoster.startsWith('http')) {
    posterUrl = existingPoster
  } else {
    let posterFile = await fetchLoungeStreamPosterFileFromSnapshot(
      { sessionStreamPosterBlobUrl: slotPoster.startsWith('blob:') ? slotPoster : null },
      uid,
      signal,
    )
    const fileProbe = slot.file instanceof File ? slot.file : null
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
      posterUrl = await uploadPosterFileForDraft(supabaseClient, user, posterFile, signal)
    }
  }

  let streamVideoWidth = existing.stream_video_width ?? null
  let streamVideoHeight = existing.stream_video_height ?? null
  const fileProbe = slot.file instanceof File ? slot.file : null
  if (fileProbe) {
    const dim = await probeVideoFileDisplaySize(fileProbe)
    if (dim) {
      streamVideoWidth = dim.width
      streamVideoHeight = dim.height
    }
  }

  return {
    stream_video_uid: uid,
    stream_poster_url: posterUrl,
    stream_video_width: streamVideoWidth,
    stream_video_height: streamVideoHeight,
  }
}

/**
 * @param {import('./loungeThreadComposeMedia.js').ThreadComposePartMedia | null | undefined} part
 */
function composePartImagePayload(part) {
  const items = part?.imageItems || []
  return {
    existingImageUrls: items.map((it) => String(it.remoteUrl || '').trim()).filter(Boolean),
    imageFiles: items.map((it) => it.file).filter((f) => f instanceof File),
    gifUrl: String(part?.gifUrl || '').trim(),
  }
}

/**
 * Build draft upsert payload from a captured Lounge post snapshot (text/images; no video).
 *
 * @param {object} snapshot
 * @param {{ fromPartIndex?: number }} [opts] When set, only captions from this part index onward (partial publish recovery).
 */
export function loungePostDraftPayloadFromSubmissionSnapshot(snapshot, opts = {}) {
  if (!snapshot || typeof snapshot !== 'object') return null
  const fromIdx = Math.max(0, Number(opts.fromPartIndex) || 0)
  let threadCaptions = []
  let snapshotParts = null
  if (Array.isArray(snapshot.threadParts) && snapshot.threadParts.length > 1) {
    snapshotParts = snapshot.threadParts
    threadCaptions = snapshot.threadParts.map((p) => String(p?.body ?? ''))
  } else if (Array.isArray(snapshot.threadCaptions) && snapshot.threadCaptions.length > 1) {
    threadCaptions = snapshot.threadCaptions.map((t) => String(t ?? ''))
  }
  if (threadCaptions.length > 1 && fromIdx > 0) {
    threadCaptions = threadCaptions.slice(fromIdx)
    if (snapshotParts) snapshotParts = snapshotParts.slice(fromIdx)
  }
  if (threadCaptions.length > 1 && snapshotParts) {
    threadCaptions = buildThreadDraftCaptionsWithSnapshotMediaMarkers(threadCaptions, snapshotParts)
  }
  const rootPart =
    Array.isArray(snapshot.threadParts) && snapshot.threadParts.length > 0
      ? snapshot.threadParts[fromIdx > 0 ? fromIdx : 0]
      : null
  const gifUrl = rootPart
    ? String(rootPart.gifUrl ?? '').trim()
    : String(snapshot.gifOnlyUrl ?? '').trim()
  const existingImageUrls = rootPart
    ? (Array.isArray(rootPart.existingImageUrls)
        ? rootPart.existingImageUrls.map((u) => String(u ?? '').trim()).filter(Boolean)
        : [])
    : Array.isArray(snapshot.existingImageUrls)
      ? snapshot.existingImageUrls.map((u) => String(u ?? '').trim()).filter(Boolean)
      : []
  const imageFiles = rootPart
    ? (Array.isArray(rootPart.imageFiles) ? rootPart.imageFiles.filter((f) => f instanceof File) : [])
    : Array.isArray(snapshot.imageFiles)
      ? snapshot.imageFiles.filter((f) => f instanceof File)
      : []
  const caption = threadCaptions.length > 1 ? threadCaptions[0] : String(snapshot.caption ?? '')
  const rootStreamUid = rootPart
    ? String(rootPart.streamVideoUid ?? '').trim()
    : String(snapshot.streamVideoUid ?? '').trim()

  /** @type {LoungePostDraftPartMediaRow[]} */
  const threadPartMediaInput = []
  if (threadCaptions.length > 1 && snapshotParts) {
    for (let i = 1; i < snapshotParts.length; i += 1) {
      const p = snapshotParts[i]
      threadPartMediaInput.push({
        gif_url: String(p?.gifUrl ?? '').trim(),
        image_urls: Array.isArray(p?.existingImageUrls)
          ? p.existingImageUrls.map((u) => String(u ?? '').trim()).filter(Boolean)
          : [],
        imageFiles: Array.isArray(p?.imageFiles) ? p.imageFiles.filter((f) => f instanceof File) : [],
        streamVideoUid: String(p?.streamVideoUid ?? '').trim() || null,
        streamPosterUrl: '',
        videoSlot: p?.streamVideoUid
          ? {
              streamVideoUid: p.streamVideoUid,
              posterUrl: p.sessionStreamPosterBlobUrl || null,
              file: p.videoFile instanceof File ? p.videoFile : null,
            }
          : null,
      })
    }
  }

  return {
    id: snapshot.savedDraftId || null,
    caption,
    threadCaptions: threadCaptions.length > 1 ? threadCaptions : undefined,
    categoryPills: snapshot.categoryPills,
    gifUrl,
    existingImageUrls,
    imageFiles,
    streamVideoUid: rootStreamUid || undefined,
    videoSlot: rootStreamUid
      ? {
          streamVideoUid: rootStreamUid,
          posterUrl: rootPart?.sessionStreamPosterBlobUrl ?? snapshot.sessionStreamPosterBlobUrl ?? null,
          file:
            (rootPart?.videoFile instanceof File ? rootPart.videoFile : null) ||
            (snapshot.videoFile instanceof File ? snapshot.videoFile : null),
        }
      : null,
    threadPartMediaInput: threadPartMediaInput.length > 0 ? threadPartMediaInput : undefined,
  }
}

/** Ordered caption parts for thread compose restore. */
export function loungePostDraftThreadParts(draft) {
  if (!loungePostDraftIsThread(draft)) return []
  return draft.thread_captions.map((t) => String(t ?? '').slice(0, LOUNGE_CAPTION_MAX))
}

export function loungePostDraftHasContent({
  caption = '',
  gifUrl = '',
  imageUrls = [],
  imageFiles = [],
  threadCaptions = [],
  streamVideoUid = '',
  rootVideoSlot = null,
  threadPartMedia = [],
} = {}) {
  const parts = Array.isArray(threadCaptions) ? threadCaptions : []
  if (parts.some((t) => String(t || '').trim().length > 0)) return true
  if (String(streamVideoUid || '').trim()) return true
  if (rootVideoSlot) return true
  if (Array.isArray(threadPartMedia) && threadPartMedia.some((p) => draftPartMediaHasContent(p))) {
    return true
  }
  return (
    String(caption || '').trim().length > 0 ||
    String(gifUrl || '').trim().length > 0 ||
    (Array.isArray(imageUrls) && imageUrls.length > 0) ||
    (Array.isArray(imageFiles) && imageFiles.length > 0)
  )
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @returns {Promise<{ data: LoungePostDraftRow[], error: Error | null }>}
 */
export async function listLoungePostDrafts(supabaseClient) {
  let { data, error } = await supabaseClient
    .from('lounge_post_drafts')
    .select(LOUNGE_POST_DRAFT_SELECT_WITH_THREAD)
    .order('updated_at', { ascending: false })
    .limit(LOUNGE_POST_DRAFTS_MAX)

  if (error && (isThreadCaptionsSchemaError(error) || isDraftMediaSchemaError(error))) {
    ;({ data, error } = await supabaseClient
      .from('lounge_post_drafts')
      .select(LOUNGE_POST_DRAFT_SELECT_BASE)
      .order('updated_at', { ascending: false })
      .limit(LOUNGE_POST_DRAFTS_MAX))
  }

  if (error) return { data: [], error: new Error(error.message || 'Could not load drafts.') }
  return {
    data: (data || []).map(normalizeDraftRow).filter(Boolean),
    error: null,
  }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @returns {Promise<{ count: number, error: Error | null }>}
 */
export async function countLoungePostDrafts(supabaseClient) {
  const { count, error } = await supabaseClient
    .from('lounge_post_drafts')
    .select('id', { count: 'exact', head: true })

  if (error) return { count: 0, error: new Error(error.message || 'Could not count drafts.') }
  return { count: typeof count === 'number' ? count : 0, error: null }
}

async function deleteOrphanStreamUids(supabaseClient, uids) {
  const unique = [...new Set(uids.map((u) => String(u || '').trim()).filter(Boolean))]
  for (const uid of unique) {
    try {
      await deleteCfStreamOrphanAsset(supabaseClient, uid)
    } catch {
      // best-effort cleanup
    }
  }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {string} draftId
 * @param {{ retainStreamAssets?: boolean }} [opts] When true (after successful publish), only delete the draft row - Stream uids now live on feed rows.
 */
export async function deleteLoungePostDraft(supabaseClient, draftId, opts = {}) {
  const id = String(draftId || '').trim()
  if (!id) return { error: new Error('Missing draft id.') }

  const retainStreamAssets = Boolean(opts.retainStreamAssets)

  let existing = null
  if (!retainStreamAssets) {
    const { data } = await supabaseClient
      .from('lounge_post_drafts')
      .select('stream_video_uid, thread_part_media')
      .eq('id', id)
      .maybeSingle()
    existing = data
  }

  const { error } = await supabaseClient.from('lounge_post_drafts').delete().eq('id', id)
  if (error) return { error: new Error(error.message || 'Could not delete draft.') }

  if (existing) {
    await deleteOrphanStreamUids(
      supabaseClient,
      collectLoungePostDraftStreamUids(normalizeDraftRow({ id, ...existing })),
    )
  }
  return { error: null }
}

async function uploadDraftImageFiles(supabaseClient, user, imageFiles, signal, onFileDone) {
  const files = Array.isArray(imageFiles) ? imageFiles.filter((f) => f instanceof File) : []
  const urls = []
  for (let i = 0; i < files.length; i += 1) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    const { file: ready, error: cErr } = await prepareLoungeFeedImageForUpload(files[i])
    if (cErr) throw new Error(cErr.message)
    const { data: upUrl, error: upErr } = await uploadLoungeFeedPostImage({
      supabaseClient,
      user,
      file: ready,
      signal,
    })
    if (upErr) throw new Error(upErr.message || 'Could not upload draft image.')
    if (!upUrl) throw new Error('Could not upload draft image.')
    urls.push(upUrl)
    if (typeof onFileDone === 'function') onFileDone(i + 1, files.length)
  }
  return urls
}

function createDraftSaveProgress(onProgress) {
  if (typeof onProgress !== 'function') {
    return () => {}
  }
  let progress = 0.04
  return (status, detail, delta = 0.08) => {
    progress = Math.min(0.97, progress + delta)
    onProgress({
      progress,
      status: String(status || ''),
      detail: detail ? String(detail) : '',
    })
  }
}

/**
 * @typedef {object} LoungePostDraftPartMediaInput
 * @property {string} [gifUrl]
 * @property {string[]} [existingImageUrls]
 * @property {File[]} [imageFiles]
 * @property {object | null} [videoSlot]
 */

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {{
 *   id?: string | null,
 *   caption?: string,
 *   categoryPills?: string[],
 *   gifUrl?: string,
 *   existingImageUrls?: string[],
 *   imageFiles?: File[],
 *   threadCaptions?: string[],
 *   threadPartMediaInput?: LoungePostDraftPartMediaInput[],
 *   videoSlot?: object | null,
 *   streamVideoUid?: string,
 *   quoteRepostOfPostId?: string | null,
 *   signal?: AbortSignal,
 *   onProgress?: (info: { progress: number, status: string, detail?: string }) => void,
 * }} payload
 * @returns {Promise<{ data: LoungePostDraftRow | null, error: Error | null }>}
 */
export async function upsertLoungePostDraft(supabaseClient, payload = {}) {
  const threadInput = Array.isArray(payload.threadCaptions) ? payload.threadCaptions : null
  const normalizedThread = threadInput
    ? normalizeThreadCaptionsForDraft(threadInput)
    : normalizeThreadCaptionsForDraft([payload.caption ?? ''])
  const caption = normalizedThread.threadCaptions.length > 1
    ? String(normalizedThread.threadCaptions[0] ?? '').slice(0, LOUNGE_CAPTION_MAX)
    : String(payload.caption ?? normalizedThread.caption ?? '')
        .trim()
        .slice(0, LOUNGE_CAPTION_MAX)
  const threadCaptions = normalizedThread.threadCaptions
  const gifUrl = String(payload.gifUrl ?? '').trim().slice(0, 2048)
  const categoryPills = normalizeLoungePostCategoryPills(payload.categoryPills)
  const existingImageUrls = Array.isArray(payload.existingImageUrls)
    ? payload.existingImageUrls.map((u) => String(u ?? '').trim()).filter(Boolean)
    : []
  const quoteRepostOfPostId = payload.quoteRepostOfPostId
    ? String(payload.quoteRepostOfPostId).trim()
    : null

  const draftId = String(payload.id || '').trim()
  let previousDraft = null
  if (draftId) {
    const { data: prev } = await supabaseClient
      .from('lounge_post_drafts')
      .select('stream_video_uid, stream_poster_url, stream_video_width, stream_video_height, thread_part_media')
      .eq('id', draftId)
      .maybeSingle()
    if (prev) previousDraft = normalizeDraftRow({ id: draftId, ...prev })
  }

  const {
    data: { session },
  } = await supabaseClient.auth.getSession()
  if (!session?.user) {
    return { data: null, error: new Error('You must be signed in to save drafts.') }
  }

  const report = createDraftSaveProgress(payload.onProgress)
  report('Saving draft…', '', 0)

  let uploadedRootUrls = []
  try {
    const rootFiles = Array.isArray(payload.imageFiles)
      ? payload.imageFiles.filter((f) => f instanceof File)
      : []
    if (rootFiles.length > 0) report('Uploading images', 'Part 1', 0)
    uploadedRootUrls = await uploadDraftImageFiles(
      supabaseClient,
      session.user,
      payload.imageFiles,
      payload.signal,
      (n, total) => {
        if (total > 1) report('Uploading images', `Part 1 · ${n}/${total}`, 0.04)
      },
    )
  } catch (e) {
    if (e?.name === 'AbortError') throw e
    return { data: null, error: e instanceof Error ? e : new Error('Could not upload draft images.') }
  }

  const imageUrls = [...existingImageUrls, ...uploadedRootUrls].slice(0, LOUNGE_POST_DRAFTS_MAX_IMAGES)

  let rootStream = {
    stream_video_uid: '',
    stream_poster_url: '',
    stream_video_width: null,
    stream_video_height: null,
  }
  const rootSlot = payload.videoSlot ?? null
  const rootUidFromPayload = String(payload.streamVideoUid || rootSlot?.streamVideoUid || '').trim()
  if (rootUidFromPayload && rootSlot) {
    try {
      report('Uploading video preview', 'Part 1', 0)
      rootStream = await resolveDraftVideoPersistFields(
        supabaseClient,
        session.user,
        rootSlot,
        previousDraft || {},
        payload.signal,
      )
    } catch (e) {
      if (e?.name === 'AbortError') throw e
      return { data: null, error: e instanceof Error ? e : new Error('Could not save draft video.') }
    }
  } else if (rootUidFromPayload) {
    rootStream.stream_video_uid = rootUidFromPayload
  }

  /** @type {LoungePostDraftPartMediaRow[]} */
  const threadPartMedia = []
  const partInputs = Array.isArray(payload.threadPartMediaInput) ? payload.threadPartMediaInput : []
  if (threadCaptions.length > 1) {
  for (let i = 0; i < threadCaptions.length - 1; i += 1) {
    const input = partInputs[i] || {}
    const existingPart = previousDraft?.thread_part_media?.[i] || {}
    let partImageUrls = Array.isArray(input.existingImageUrls)
      ? input.existingImageUrls.map((u) => String(u ?? '').trim()).filter(Boolean)
      : []
    const partNum = i + 2
    try {
      const partFiles = Array.isArray(input.imageFiles)
        ? input.imageFiles.filter((f) => f instanceof File)
        : []
      if (partFiles.length > 0) report('Uploading images', `Part ${partNum}`, 0)
      const uploaded = await uploadDraftImageFiles(
        supabaseClient,
        session.user,
        input.imageFiles,
        payload.signal,
        (n, total) => {
          if (total > 1) report('Uploading images', `Part ${partNum} · ${n}/${total}`, 0.04)
        },
      )
      partImageUrls = [...partImageUrls, ...uploaded].slice(0, LOUNGE_POST_DRAFTS_MAX_IMAGES)
    } catch (e) {
      if (e?.name === 'AbortError') throw e
      return { data: null, error: e instanceof Error ? e : new Error('Could not upload draft images.') }
    }
    let partStream = {
      stream_video_uid: '',
      stream_poster_url: '',
      stream_video_width: null,
      stream_video_height: null,
    }
    const slot = input.videoSlot ?? null
    const uid = String(input.streamVideoUid || slot?.streamVideoUid || '').trim()
    if (uid && slot) {
      try {
        report('Uploading video preview', `Part ${partNum}`, 0)
        partStream = await resolveDraftVideoPersistFields(
          supabaseClient,
          session.user,
          slot,
          existingPart,
          payload.signal,
        )
      } catch (e) {
        if (e?.name === 'AbortError') throw e
        return { data: null, error: e instanceof Error ? e : new Error('Could not save draft video.') }
      }
    } else if (uid) {
      partStream.stream_video_uid = uid
    }
    threadPartMedia.push({
      gif_url: String(input.gifUrl ?? '').trim().slice(0, 2048),
      image_urls: partImageUrls,
      ...partStream,
    })
  }
  }

  if (
    !loungePostDraftHasContent({
      caption,
      gifUrl,
      imageUrls,
      imageFiles: [],
      threadCaptions,
      streamVideoUid: rootStream.stream_video_uid,
      threadPartMedia,
    })
  ) {
    return { data: null, error: new Error('Add caption text, a GIF, or at least one image before saving.') }
  }

  const row = {
    caption,
    category_pills: categoryPills,
    gif_url: gifUrl,
    image_urls: imageUrls,
    stream_video_uid: rootStream.stream_video_uid,
    stream_poster_url: rootStream.stream_poster_url,
    stream_video_width: rootStream.stream_video_width,
    stream_video_height: rootStream.stream_video_height,
    thread_captions: threadCaptions,
    thread_part_media: threadPartMedia,
    quote_repost_of_post_id: quoteRepostOfPostId || null,
  }

  async function writeDraft(includeThreadFields, includeMediaFields) {
    const writeRow = { ...row }
    if (!includeThreadFields) {
      delete writeRow.thread_captions
      delete writeRow.thread_part_media
    } else if (!includeMediaFields) {
      delete writeRow.stream_video_uid
      delete writeRow.stream_poster_url
      delete writeRow.stream_video_width
      delete writeRow.stream_video_height
      delete writeRow.thread_part_media
    }
    if (!includeMediaFields && !includeThreadFields) {
      delete writeRow.stream_video_uid
      delete writeRow.stream_poster_url
      delete writeRow.stream_video_width
      delete writeRow.stream_video_height
    }

    const selectCols =
      includeThreadFields && includeMediaFields
        ? LOUNGE_POST_DRAFT_SELECT_WITH_THREAD
        : includeThreadFields
          ? 'id, caption, category_pills, gif_url, image_urls, thread_captions, quote_repost_of_post_id, updated_at, created_at'
          : LOUNGE_POST_DRAFT_SELECT_BASE

    if (draftId) {
      return supabaseClient
        .from('lounge_post_drafts')
        .update(writeRow)
        .eq('id', draftId)
        .select(selectCols)
        .maybeSingle()
    }
    return supabaseClient.from('lounge_post_drafts').insert(writeRow).select(selectCols).single()
  }

  report('Saving draft…', '', 0.05)

  let includeThread = threadCaptions.length > 1
  let includeMedia = true
  let { data, error } = await writeDraft(includeThread, includeMedia)

  if (error && isDraftMediaSchemaError(error)) {
    includeMedia = false
    ;({ data, error } = await writeDraft(includeThread, includeMedia))
    if (!error && includeThread) {
      return {
        data: null,
        error: new Error(
          'Draft media needs the latest Supabase migration (20260608210000_lounge_post_drafts_thread_part_media.sql).',
        ),
      }
    }
  }

  if (error && isThreadCaptionsSchemaError(error)) {
    includeThread = false
    ;({ data, error } = await writeDraft(includeThread, includeMedia))
  }

  if (error) {
    const msg = String(error.message || '')
    if (msg.includes('Draft limit reached')) {
      return { data: null, error: new Error('Draft limit reached (20). Delete an old draft first.') }
    }
    if (includeThread && isThreadCaptionsSchemaError(error)) {
      return {
        data: null,
        error: new Error(
          'Thread drafts need the latest Supabase migration (20260608160000_lounge_post_drafts_thread_captions.sql).',
        ),
      }
    }
    return { data: null, error: new Error(error.message || 'Could not save draft.') }
  }
  if (!data && draftId) return { data: null, error: new Error('Draft not found.') }

  const normalized = normalizeDraftRow(data)
  if (typeof payload.onProgress === 'function') {
    payload.onProgress({ progress: 1, status: 'Draft saved', detail: '' })
  }
  if (previousDraft && normalized) {
    const prevUids = collectLoungePostDraftStreamUids(previousDraft)
    const nextUids = new Set(collectLoungePostDraftStreamUids(normalized))
    const orphans = prevUids.filter((uid) => !nextUids.has(uid))
    if (orphans.length) await deleteOrphanStreamUids(supabaseClient, orphans)
  }

  return { data: normalized, error: null }
}

/** One-line preview for draft list rows. */
export function loungePostDraftPreviewText(draft, maxLen = 120) {
  if (loungePostDraftIsThread(draft)) {
    const first = String(draft.thread_captions[0] || '').trim()
    const suffix = ` · Thread · ${draft.thread_captions.length} parts`
    if (first) {
      const room = Math.max(8, maxLen - suffix.length)
      const oneLine = first.split('\n')[0].trim()
      if (oneLine.length <= room) return `${oneLine}${suffix}`
      return `${oneLine.slice(0, room - 1)}…${suffix}`
    }
    return `Thread · ${draft.thread_captions.length} parts`
  }
  const cap = String(draft?.caption || '').trim()
  if (cap) {
    const oneLine = cap.split('\n')[0].trim()
    if (oneLine.length <= maxLen) return oneLine
    return `${oneLine.slice(0, maxLen - 1)}…`
  }
  if (String(draft?.stream_video_uid || '').trim()) return 'Video draft'
  if (Array.isArray(draft?.image_urls) && draft.image_urls.length > 0) {
    const n = draft.image_urls.length
    return n === 1 ? 'Photo draft' : `${n} photos`
  }
  if (String(draft?.gif_url || '').trim()) return 'GIF draft'
  return 'Empty draft'
}

export function formatLoungePostDraftWhen(iso) {
  if (!iso) return ''
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return ''
  try {
    return new Date(t).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

/** Build threadPartMediaInput from compose state for upsert. */
export function loungePostDraftThreadPartMediaInputFromCompose(partMedia) {
  const media = Array.isArray(partMedia) ? partMedia : [emptyThreadComposePartMedia()]
  if (media.length <= 1) return []
  return media.slice(1).map((part) => {
    const img = composePartImagePayload(part)
    return {
      gifUrl: img.gifUrl,
      existingImageUrls: img.existingImageUrls,
      imageFiles: img.imageFiles,
      videoSlot: part?.videoSlot ?? null,
    }
  })
}
