import { runComposerStreamVideoPrepWithRetries } from './loungeComposerVideoPrep.js'

/** @typedef {'queued' | 'preparing' | 'ready' | 'failed'} ThreadComposeVideoPrepStatus */

/**
 * @typedef {object} ThreadComposeVideoSlot
 * @property {number | null} [prepJobId]
 * @property {File | null} [file]
 * @property {string | null} [posterUrl]
 * @property {string | null} [preview]
 * @property {string | null} [streamVideoUid]
 * @property {ThreadComposeVideoPrepStatus} [prepStatus]
 * @property {string} [prepError]
 */

/**
 * @typedef {object} ThreadComposeVideoPrepHud
 * @property {number} progress
 * @property {string} status
 * @property {string} detail
 */

/**
 * @typedef {object} ThreadComposePartVideoPrepMeta
 * @property {number} prepJobId
 * @property {AbortController} abort
 * @property {object | null} spec
 * @property {object | null} handoff
 * @property {File | null} lastEncodedFile
 */

export const LOUNGE_THREAD_COMPOSE_VIDEO_CROP_MODE = 'threadCompose'

/** @param {ThreadComposeVideoSlot | null | undefined} slot */
export function threadComposePartHasVideo(slot) {
  return slot != null
}

/** @param {ThreadComposeVideoSlot | null | undefined} slot */
export function threadComposeVideoSlotBlocksPost(slot) {
  return slot?.prepStatus === 'failed'
}

/**
 * Build snapshot fragment for one thread part's video (compose → submit).
 *
 * @param {ThreadComposeVideoSlot | null | undefined} slot
 * @param {ThreadComposePartVideoPrepMeta | null | undefined} prepMeta
 */
/**
 * Build a compose video slot from a captured thread-part snapshot (failure / cancel restore).
 * Does not start prep - caller should enqueue when `videoPrepSpec` is set and no `streamVideoUid`.
 *
 * @param {object | null | undefined} part
 * @returns {ThreadComposeVideoSlot | null}
 */
export function threadPartVideoSlotFromSnapshot(part) {
  if (!part || typeof part !== 'object') return null
  const uid = String(part.streamVideoUid ?? '').trim() || null
  const vf = part.videoFile instanceof File ? part.videoFile : null
  const blobPoster =
    typeof part.sessionStreamPosterBlobUrl === 'string' &&
    part.sessionStreamPosterBlobUrl.startsWith('blob:')
      ? part.sessionStreamPosterBlobUrl
      : null

  if (uid) {
    let preview = blobPoster
    if (vf) {
      try {
        preview = URL.createObjectURL(vf)
      } catch {
        preview = blobPoster
      }
    }
    return {
      prepJobId: 0,
      file: vf,
      posterUrl: blobPoster,
      preview,
      streamVideoUid: uid,
      prepStatus: 'ready',
      prepError: '',
    }
  }

  if (part.videoPrepSpec) {
    const restore = part.videoPrepSlotRestore
    if (part.videoPrepSpec.kind === 'direct' && part.videoPrepSpec.file instanceof File) {
      const f = part.videoPrepSpec.file
      return {
        prepJobId: null,
        file: f,
        posterUrl: null,
        preview: URL.createObjectURL(f),
        streamVideoUid: null,
        prepStatus: 'queued',
        prepError: '',
      }
    }
    if (restore && part.videoPrepSpec.kind === 'trim') {
      return {
        prepJobId: null,
        file: null,
        posterUrl: restore.posterUrl ?? null,
        preview: restore.preview ?? restore.posterUrl ?? null,
        streamVideoUid: null,
        prepStatus: 'queued',
        prepError: '',
      }
    }
  }

  if (vf) {
    return {
      prepJobId: 0,
      file: vf,
      posterUrl: blobPoster,
      preview: URL.createObjectURL(vf),
      streamVideoUid: null,
      prepStatus: 'ready',
      prepError: '',
    }
  }

  return null
}

export function threadComposePartVideoSnapshotFields(slot, prepMeta) {
  if (!slot) {
    return {
      videoFile: null,
      streamVideoUid: null,
      awaitingThreadPartVideoPrepJobId: null,
      videoPrepSpec: null,
      videoPrepSlotRestore: null,
      sessionStreamPosterBlobUrl: null,
      _capturedPrepHandoff: null,
    }
  }
  const uid = String(slot.streamVideoUid || '').trim() || null
  const spec = !uid && prepMeta?.spec ? prepMeta.spec : null
  const handoff = prepMeta?.handoff ?? null
  const awaiting =
    !uid && slot.prepStatus === 'preparing' && typeof slot.prepJobId === 'number'
      ? slot.prepJobId
      : !uid && handoff && typeof handoff.jobId === 'number'
        ? handoff.jobId
        : null
  const trimRestore =
    (awaiting != null || slot.prepStatus === 'queued') && spec?.kind === 'trim'
      ? { posterUrl: slot.posterUrl, preview: slot.preview }
      : null
  const sessionPosterBlob =
    slot.posterUrl && String(slot.posterUrl).startsWith('blob:') ? String(slot.posterUrl) : null
  return {
    videoFile: slot.file instanceof File ? slot.file : null,
    streamVideoUid: uid,
    awaitingThreadPartVideoPrepJobId: awaiting,
    videoPrepSpec: spec,
    videoPrepSlotRestore: trimRestore,
    sessionStreamPosterBlobUrl: sessionPosterBlob,
    _capturedPrepHandoff: handoff,
  }
}

/**
 * Sequential encode/upload queue for thread compose (one active prep at a time).
 *
 * @param {object} opts
 * @param {import('@supabase/supabase-js').SupabaseClient} opts.supabaseClient
 * @param {(partIdx: number, updater: (slot: ThreadComposeVideoSlot | null) => ThreadComposeVideoSlot | null) => void} opts.updatePartVideoSlot
 * @param {(partIdx: number, hud: ThreadComposeVideoPrepHud | null) => void} opts.updatePartPrepHud
 * @param {() => boolean} opts.isBackgroundSubmitBusy
 * @param {(partIdx: number) => ThreadComposePartVideoPrepMeta | null} opts.getPrepMeta
 * @param {(partIdx: number, meta: ThreadComposePartVideoPrepMeta | null) => void} opts.setPrepMeta
 * @param {() => number} opts.nextJobId
 * @param {(detail: string) => string} [opts.uploadBarGoblinDetail]
 */
export function createThreadComposeVideoPrepController({
  supabaseClient,
  updatePartVideoSlot,
  updatePartPrepHud,
  isBackgroundSubmitBusy,
  getPrepMeta,
  setPrepMeta,
  nextJobId,
  uploadBarGoblinDetail = 'The goblins are on it…',
}) {
  /** @type {Array<{ partIdx: number, spec: object, slotBase: ThreadComposeVideoSlot }>} */
  const queue = []
  let running = false

  const clearHud = (partIdx) => updatePartPrepHud(partIdx, null)

  const setHud = (partIdx, hud) => updatePartPrepHud(partIdx, hud)

  const runNext = () => {
    if (running || queue.length === 0) return
    const item = queue.shift()
    if (!item) return
    running = true
    void runPrep(item.partIdx, item.spec, item.slotBase).finally(() => {
      running = false
      runNext()
    })
  }

  const runPrep = async (partIdx, spec, slotBase) => {
    if (isBackgroundSubmitBusy()) {
      updatePartVideoSlot(partIdx, () => ({
        ...slotBase,
        prepJobId: null,
        prepStatus: 'queued',
        prepError: '',
      }))
      setHud(partIdx, { progress: 0, status: 'Queued', detail: 'Waiting to upload…' })
      setPrepMeta(partIdx, {
        prepJobId: null,
        abort: null,
        spec,
        handoff: null,
        lastEncodedFile: null,
      })
      return
    }

    const prevMeta = getPrepMeta(partIdx)
    if (prevMeta?.handoff && !prevMeta.handoff.settled) {
      try {
        prevMeta.handoff.reject(new DOMException('Aborted', 'AbortError'))
      } catch {
        // ignore
      }
    }
    try {
      prevMeta?.abort?.abort()
    } catch {
      // ignore
    }

    const jobId = nextJobId()
    const ac = new AbortController()
    let resHandoff = /** @type {((v: { encodedFile: File, streamVideoUid: string }) => void) | null} */ (null)
    let rejHandoff = /** @type {((e: unknown) => void) | null} */ (null)
    const prepPromise = new Promise((res, rej) => {
      resHandoff = res
      rejHandoff = rej
    })
    const handoff = {
      jobId,
      settled: false,
      promise: prepPromise,
      resolve: (v) => {
        if (handoff.settled) return
        handoff.settled = true
        resHandoff?.(v)
      },
      reject: (e) => {
        if (handoff.settled) return
        handoff.settled = true
        rejHandoff?.(e)
      },
    }

    /** @type {ThreadComposePartVideoPrepMeta} */
    const meta = {
      prepJobId: jobId,
      abort: ac,
      spec,
      handoff,
      lastEncodedFile: null,
    }
    setPrepMeta(partIdx, meta)

    updatePartVideoSlot(partIdx, () => ({
      ...slotBase,
      prepJobId: jobId,
      prepStatus: 'preparing',
      prepError: '',
    }))
    setHud(partIdx, { progress: 0.02, status: 'Starting…', detail: '' })

    try {
      const result = await runComposerStreamVideoPrepWithRetries({
        supabaseClient,
        signal: ac.signal,
        spec,
        onEncodedFileReady: (f) => {
          meta.lastEncodedFile = f
        },
        onProgress: (info) => {
          const cur = getPrepMeta(partIdx)
          if (!cur || cur.prepJobId !== jobId) return
          const d = String(info.detail || '').trim()
          setHud(partIdx, {
            progress: typeof info.progress === 'number' ? info.progress : 0,
            status: String(info.status || ''),
            detail: d,
          })
        },
        onUploadDiagnostic: () => {
          const cur = getPrepMeta(partIdx)
          if (!cur || cur.prepJobId !== jobId) return
          setHud(partIdx, {
            progress: 0,
            status: 'Retrying',
            detail: uploadBarGoblinDetail,
          })
        },
      })

      if (ac.signal.aborted) {
        if (!handoff.settled) handoff.reject(new DOMException('Aborted', 'AbortError'))
        return
      }

      // Always settle the handoff when prep succeeded - compose may have closed and cleared
      // prepMeta while a background submit still awaits this promise.
      handoff.resolve(result)
      meta.lastEncodedFile = null

      const curMeta = getPrepMeta(partIdx)
      if (curMeta?.prepJobId !== jobId) {
        return
      }

      const { encodedFile, streamVideoUid } = result
      updatePartVideoSlot(partIdx, (prev) => {
        if (!prev || prev.prepJobId !== jobId) return prev
        const oldPreview = prev.preview
        const oldPoster = prev.posterUrl
        const vidUrl = URL.createObjectURL(encodedFile)
        const posterToKeep =
          typeof oldPoster === 'string' && oldPoster && oldPoster !== vidUrl
            ? oldPoster
            : typeof oldPreview === 'string' && oldPreview && oldPreview !== vidUrl
              ? oldPreview
              : null
        if (oldPreview && oldPreview !== posterToKeep) {
          try {
            URL.revokeObjectURL(oldPreview)
          } catch {
            // ignore
          }
        }
        if (oldPoster && oldPoster !== posterToKeep) {
          try {
            URL.revokeObjectURL(oldPoster)
          } catch {
            // ignore
          }
        }
        return {
          ...prev,
          file: encodedFile,
          streamVideoUid,
          preview: vidUrl,
          posterUrl: posterToKeep,
          prepStatus: 'ready',
          prepError: '',
        }
      })
      clearHud(partIdx)
    } catch (e) {
      if (!handoff.settled) {
        handoff.reject(e instanceof Error ? e : new Error(String(e)))
      }
      if (e?.name === 'AbortError') {
        clearHud(partIdx)
        return
      }
      const msg =
        (e instanceof Error ? e.message : String(e || '')).trim() ||
        'Video upload failed after multiple attempts.'
      updatePartVideoSlot(partIdx, (prev) =>
        prev?.prepJobId === jobId ? { ...prev, prepStatus: 'failed', prepError: msg } : prev,
      )
      setHud(partIdx, { progress: 0, status: 'Failed', detail: msg })
    }
  }

  return {
    /** @param {number} partIdx @param {object} spec @param {ThreadComposeVideoSlot} slotBase */
    enqueue(partIdx, spec, slotBase) {
      if (running) {
        updatePartVideoSlot(partIdx, () => ({
          ...slotBase,
          prepJobId: null,
          prepStatus: 'queued',
          prepError: '',
        }))
        setHud(partIdx, { progress: 0, status: 'Queued', detail: 'Waiting for previous video…' })
        setPrepMeta(partIdx, {
          prepJobId: null,
          abort: null,
          spec,
          handoff: null,
          lastEncodedFile: null,
        })
        queue.push({ partIdx, spec, slotBase })
        return
      }
      running = true
      void runPrep(partIdx, spec, slotBase).finally(() => {
        running = false
        runNext()
      })
    },
    /** @param {number} partIdx */
    cancel(partIdx) {
      const meta = getPrepMeta(partIdx)
      if (meta?.handoff && !meta.handoff.settled) {
        try {
          meta.handoff.reject(new DOMException('Aborted', 'AbortError'))
        } catch {
          // ignore
        }
      }
      try {
        meta?.abort?.abort()
      } catch {
        // ignore
      }
      setPrepMeta(partIdx, null)
      clearHud(partIdx)
      const qIdx = queue.findIndex((q) => q.partIdx === partIdx)
      if (qIdx >= 0) queue.splice(qIdx, 1)
    },
    reset() {
      queue.length = 0
      running = false
    },
  }
}
