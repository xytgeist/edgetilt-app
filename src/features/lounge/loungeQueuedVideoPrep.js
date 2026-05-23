import { loungeSubmissionSnapshotIncludesVideo } from './loungePostSubmitJob.js'
import {
  runComposerStreamVideoPrepWithRetries,
  uploadEncodedVideoToCfStreamWithRetries,
} from './loungeComposerVideoPrep.js'

/**
 * @typedef {{ encodedFile: File | null, streamVideoUid: string }} LoungeVideoPrepOutcome
 */

/**
 * @typedef {object} LoungeQueuedVideoPrepSlot
 * @property {AbortController} abort
 * @property {'running' | 'done' | 'failed'} status
 * @property {LoungeVideoPrepOutcome | null} result
 * @property {unknown} error
 * @property {Promise<LoungeVideoPrepOutcome> | null} promise
 */

/** True when a queued snapshot still needs encode/upload before insert. */
export function snapshotNeedsBackgroundVideoPrep(snapshot) {
  if (!loungeSubmissionSnapshotIncludesVideo(snapshot)) return false
  if (String(snapshot?.streamVideoUid || '').trim()) return false
  return Boolean(
    snapshot?.videoPrepSpec ||
      snapshot?.videoFile instanceof File ||
      snapshot?.awaitingComposerVideoPrepJobId != null ||
      snapshot?.awaitingDetailCommentVideoPrepJobId != null ||
      snapshot?.awaitingDetailEditVideoPrepJobId != null ||
      snapshot?.awaitingDetailCommentEditVideoPrepJobId != null,
  )
}

/**
 * Resolve Stream video prep for a captured submit snapshot (queue-safe; no shared composer refs).
 *
 * @param {object} opts
 * @param {object} opts.snapshot
 * @param {import('@supabase/supabase-js').SupabaseClient} opts.supabaseClient
 * @param {AbortSignal} opts.signal
 * @param {(info: { progress: number, status: string, detail?: string, attempt: number }) => void} [opts.onProgress]
 * @param {(detail: string) => void} [opts.onUploadDiagnostic]
 * @returns {Promise<LoungeVideoPrepOutcome>}
 */
export async function resolveLoungeSubmissionVideoPrep({
  snapshot,
  supabaseClient,
  signal,
  onProgress,
  onUploadDiagnostic,
}) {
  const uid0 = String(snapshot?.streamVideoUid || '').trim()
  if (uid0) {
    return {
      encodedFile: snapshot?.videoFile instanceof File ? snapshot.videoFile : null,
      streamVideoUid: uid0,
    }
  }

  const runFromSpec = async (spec) => {
    if (!spec) throw new Error('Video preparation was interrupted.')
    return runComposerStreamVideoPrepWithRetries({
      supabaseClient,
      signal,
      spec,
      onProgress,
      onUploadDiagnostic,
    })
  }

  const runFromFile = async (file) => {
    if (!(file instanceof File)) throw new Error('Video preparation was interrupted.')
    const { streamVideoUid } = await uploadEncodedVideoToCfStreamWithRetries({
      supabaseClient,
      signal,
      uploadFile: file,
      onProgress,
      onUploadDiagnostic,
    })
    return { encodedFile: file, streamVideoUid }
  }

  const awaitingComposer = snapshot?.awaitingComposerVideoPrepJobId
  const awaitingComment = snapshot?.awaitingDetailCommentVideoPrepJobId
  const awaitingEdit = snapshot?.awaitingDetailEditVideoPrepJobId
  const awaitingCommentEdit = snapshot?.awaitingDetailCommentEditVideoPrepJobId
  const awaitingId = awaitingComposer ?? awaitingComment ?? awaitingEdit ?? awaitingCommentEdit
  const handoff = snapshot?._capturedPrepHandoff
  if (awaitingId != null && handoff && handoff.jobId === awaitingId) {
    try {
      return await handoff.promise
    } catch (e) {
      if (e?.name === 'AbortError') throw e
      if (snapshot?.videoPrepSpec) return runFromSpec(snapshot.videoPrepSpec)
      if (snapshot?.videoFile instanceof File) return runFromFile(snapshot.videoFile)
      throw e
    }
  }
  if (snapshot?.videoPrepSpec) return runFromSpec(snapshot.videoPrepSpec)
  if (snapshot?.videoFile instanceof File) return runFromFile(snapshot.videoFile)
  throw new Error('Video preparation was interrupted.')
}

/**
 * Start encode/upload for a queued job while another video job owns the upload bar.
 *
 * @param {{ id: string, snapshot: object, videoPrep?: LoungeQueuedVideoPrepSlot }} job
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @returns {Promise<LoungeVideoPrepOutcome> | null}
 */
export function startParallelQueuedVideoPrep(job, supabaseClient) {
  if (!job || !snapshotNeedsBackgroundVideoPrep(job.snapshot)) return null
  if (job.videoPrep?.promise) return job.videoPrep.promise
  if (job.videoPrep?.result) {
    return Promise.resolve(job.videoPrep.result)
  }

  const ac = new AbortController()
  /** @type {LoungeQueuedVideoPrepSlot} */
  const slot = {
    abort: ac,
    status: 'running',
    result: null,
    error: null,
    promise: null,
  }
  job.videoPrep = slot

  slot.promise = (async () => {
    try {
      const out = await resolveLoungeSubmissionVideoPrep({
        snapshot: job.snapshot,
        supabaseClient,
        signal: ac.signal,
      })
      slot.status = 'done'
      slot.result = out
      job.snapshot = {
        ...job.snapshot,
        videoFile: out.encodedFile,
        streamVideoUid: out.streamVideoUid,
        awaitingComposerVideoPrepJobId: null,
        awaitingDetailCommentVideoPrepJobId: null,
        awaitingDetailEditVideoPrepJobId: null,
        awaitingDetailCommentEditVideoPrepJobId: null,
      }
      return out
    } catch (e) {
      slot.status = 'failed'
      slot.error = e
      throw e
    }
  })()

  return slot.promise
}

/**
 * @param {{ snapshot: object, videoPrep?: LoungeQueuedVideoPrepSlot }} job
 * @returns {Promise<LoungeVideoPrepOutcome | null>}
 */
export async function awaitQueuedVideoPrepForJob(job) {
  if (!job) return null
  const uid = String(job.snapshot?.streamVideoUid || '').trim()
  if (uid) {
    return {
      encodedFile: job.snapshot?.videoFile instanceof File ? job.snapshot.videoFile : null,
      streamVideoUid: uid,
    }
  }
  if (job.videoPrep?.result) return job.videoPrep.result
  if (job.videoPrep?.promise) return job.videoPrep.promise
  return null
}

/** Kick parallel prep for every video job waiting behind the active head. */
export function startParallelQueuedVideoPrepForWaitingJobs(queue, supabaseClient) {
  if (!Array.isArray(queue) || queue.length < 2) return
  for (let i = 1; i < queue.length; i += 1) {
    startParallelQueuedVideoPrep(queue[i], supabaseClient)
  }
}
