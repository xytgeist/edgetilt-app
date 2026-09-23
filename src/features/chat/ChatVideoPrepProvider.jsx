import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react'
import { chatSendMessage } from './chatApi.js'
import {
  canSkipLoungeVideoWasmEncode,
  captureVideoFilePosterObjectUrl,
  currentChatVideoLimits,
  nativeEdgeVideoProgressStep,
  loungeVideoDurationWithinCap,
  loungeVideoFileTooLargeReason,
  loungeVideoTooLongMessage,
  probeVideoFileDisplaySize,
  probeVideoFileDurationSeconds,
} from '../../utils/loungeVideoUpload.js'
import { uploadChatPosterToR2, uploadChatVideoToR2, uploadNativeChatVideoToR2 } from '../../utils/chatVideoR2Upload.js'
import { cancelEdgeVideo, exportEdgeVideo } from '../../utils/edgeNative.js'

const ChatVideoPrepContext = createContext(null)

function newChatVideoPrepJobId() {
  try {
    return crypto.randomUUID()
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`
  }
}

/**
 * Keep-alive host for chat video encode/upload jobs (lives under ChatTab).
 * Survives room leave, room switch, and iOS resume remounts of ChatConversation.
 *
 * @param {{
 *   children: import('react').ReactNode,
 *   supabaseClient: import('@supabase/supabase-js').SupabaseClient,
 * }} props
 */
export function ChatVideoPrepProvider({ children, supabaseClient }) {
  const jobsRef = useRef(/** @type {any[]} */ ([]))
  const [jobs, _setJobs] = useState(/** @type {any[]} */ ([]))
  const setJobs = useCallback((updater) => {
    _setJobs((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      jobsRef.current = next
      return next
    })
  }, [])

  /** Serial encode lock across all rooms. */
  const encodeQueueRef = useRef(Promise.resolve())
  /** @type {React.MutableRefObject<Map<string, Set<(payload: object) => void>>>} */
  const sentListenersRef = useRef(new Map())

  const updateJob = useCallback(
    (jobId, patch) => {
      setJobs((prev) => prev.map((j) => (j.jobId === jobId ? { ...j, ...patch } : j)))
    },
    [setJobs],
  )

  const removeJob = useCallback(
    (jobId) => {
      setJobs((prev) => {
        const job = prev.find((j) => j.jobId === jobId)
        if (job?.posterUrl?.startsWith('blob:')) {
          try {
            URL.revokeObjectURL(job.posterUrl)
          } catch {
            // ignore
          }
        }
        return prev.filter((j) => j.jobId !== jobId)
      })
    },
    [setJobs],
  )

  const notifySent = useCallback((roomId, payload) => {
    const id = String(roomId || '').trim()
    if (!id) return
    const set = sentListenersRef.current.get(id)
    if (!set) return
    for (const fn of set) {
      try {
        fn(payload)
      } catch {
        // ignore
      }
    }
  }, [])

  const registerSentListener = useCallback((roomId, listener) => {
    const id = String(roomId || '').trim()
    if (!id || typeof listener !== 'function') return () => {}
    let set = sentListenersRef.current.get(id)
    if (!set) {
      set = new Set()
      sentListenersRef.current.set(id, set)
    }
    set.add(listener)
    return () => {
      set.delete(listener)
      if (set.size === 0) sentListenersRef.current.delete(id)
    }
  }, [])

  const uploadAndSendJob = useCallback(
    async (jobId, encodedFile, posterMetaPromise = null, nativeUrls = null) => {
      if (jobsRef.current.find((j) => j.jobId === jobId)?.abortCtrl?.signal?.aborted) {
        removeJob(jobId)
        return
      }
      updateJob(jobId, { status: 'uploading', progress: 0.78 })
      try {
        const job = jobsRef.current.find((j) => j.jobId === jobId)
        const abortSignal = job?.abortCtrl?.signal
        const roomId = String(job?.roomId || '').trim()
        const viewerUserId = String(job?.viewerUserId || '').trim()

        if (posterMetaPromise) {
          await posterMetaPromise.catch(() => null)
        }
        if (abortSignal?.aborted) {
          removeJob(jobId)
          return
        }

        let localPoster = jobsRef.current.find((j) => j.jobId === jobId)?.posterUrl ?? null
        if (!localPoster && encodedFile instanceof File) {
          localPoster = await captureVideoFilePosterObjectUrl(encodedFile, { signal: abortSignal }).catch(
            () => null,
          )
          if (localPoster) updateJob(jobId, { posterUrl: localPoster })
        }

        const [videoUrl, posterPublicUrl] = nativeUrls?.videoUrl
          ? [nativeUrls.videoUrl, nativeUrls.posterPublicUrl || null]
          : await Promise.all([
              uploadChatVideoToR2(supabaseClient, encodedFile, { signal: abortSignal }),
              localPoster
                ? uploadChatPosterToR2(supabaseClient, localPoster).catch(() => null)
                : Promise.resolve(null),
            ])

        if (abortSignal?.aborted) {
          removeJob(jobId)
          return
        }

        updateJob(jobId, { status: 'sending', progress: 0.98 })

        const currentJob = jobsRef.current.find((j) => j.jobId === jobId)
        const pickCreatedAt = currentJob?.createdAt || null
        const res = await chatSendMessage(supabaseClient, {
          roomId,
          body: '',
          videoUrl,
          streamPosterUrl: posterPublicUrl || null,
          streamVideoWidth: currentJob?.width ?? null,
          streamVideoHeight: currentJob?.height ?? null,
          idempotencyKey: jobId,
          clientCreatedAt: pickCreatedAt,
        })

        const messageId = res?.message_id
        removeJob(jobId)

        if (messageId && pickCreatedAt) {
          notifySent(roomId, {
            jobId,
            message: {
              id: messageId,
              _key: jobId,
              body: '',
              image_urls: [],
              video_url: videoUrl,
              stream_video_uid: null,
              stream_poster_url: posterPublicUrl || null,
              stream_video_width: currentJob?.width ?? null,
              stream_video_height: currentJob?.height ?? null,
              sender_id: viewerUserId,
              created_at: pickCreatedAt,
              deleted_at: null,
              reply_to_message_id: null,
              reply_to_preview: null,
              reply_to_sender_id: null,
            },
          })
        }
      } catch (e) {
        if (e?.name === 'AbortError') {
          removeJob(jobId)
          return
        }
        updateJob(jobId, { status: 'error', errorMessage: e?.message || 'Upload failed.' })
      }
    },
    [supabaseClient, updateJob, removeJob, notifySent],
  )

  const enqueueVideoPrep = useCallback(
    ({ roomId, viewerUserId, spec }) => {
      const rid = String(roomId || '').trim()
      const uid = String(viewerUserId || '').trim()
      if (!rid || !uid || !spec || !supabaseClient) return null

      const jobId = newChatVideoPrepJobId()
      const abortCtrl = new AbortController()
      const isTrimJob = spec?.type === 'composerTrimJob'
      const hasNativePoster = Boolean(spec?.nativeAssetId)

      setJobs((prev) => [
        ...prev,
        {
          jobId,
          roomId: rid,
          viewerUserId: uid,
          createdAt: new Date().toISOString(),
          status: 'pending',
          progress: 0,
          posterUrl: isTrimJob || hasNativePoster ? (spec.posterUrl ?? null) : null,
          width: isTrimJob || hasNativePoster ? (spec.intrinsicWidth ?? null) : null,
          height: isTrimJob || hasNativePoster ? (spec.intrinsicHeight ?? null) : null,
          errorMessage: null,
          spec,
          abortCtrl,
        },
      ])

      encodeQueueRef.current = encodeQueueRef.current
        .then(async () => {
          if (abortCtrl.signal.aborted) {
            removeJob(jobId)
            return
          }
          try {
            if (spec?.nativeAssetId) {
              updateJob(jobId, {
                status: 'checking',
                progress: 0.05,
                posterUrl: spec.posterUrl ?? null,
                width: spec.intrinsicWidth ?? null,
                height: spec.intrinsicHeight ?? null,
              })
              const watched = new Set([String(spec.nativeAssetId)])
              const onNativeProgress = (event) => {
                const detail = event?.detail || {}
                const id = String(detail.assetId || '')
                if (id && !watched.has(id)) return
                const step = nativeEdgeVideoProgressStep(detail)
                if (step.step === 'uploading') {
                  updateJob(jobId, { status: 'uploading', progress: 0.72 + step.progress * 0.24 })
                } else if (step.step === 'encoding') {
                  updateJob(jobId, { status: 'encoding', progress: 0.08 + step.progress * 0.62 })
                } else {
                  updateJob(jobId, { status: 'checking', progress: 0.05 })
                }
              }
              window.addEventListener('edge-native-video-progress', onNativeProgress)
              let cancelId = String(spec.nativeAssetId)
              const onAbort = () => {
                void cancelEdgeVideo(cancelId)
              }
              abortCtrl.signal.addEventListener('abort', onAbort)
              const cleanupNative = () => {
                window.removeEventListener('edge-native-video-progress', onNativeProgress)
                abortCtrl.signal.removeEventListener('abort', onAbort)
              }
              try {
                const limits = currentChatVideoLimits()
                const exported = await exportEdgeVideo({
                  assetId: spec.nativeAssetId,
                  startSec: spec.startSec,
                  endSec: spec.endSec,
                  cropPx: spec.cropPx || null,
                  intrinsicWidth: spec.intrinsicWidth,
                  intrinsicHeight: spec.intrinsicHeight,
                  maxClipSeconds: limits.maxSeconds + limits.slackSeconds,
                  maxUploadBytes: limits.maxBytes,
                })
                if (abortCtrl.signal.aborted) {
                  cleanupNative()
                  removeJob(jobId)
                  return
                }
                if (!exported?.ok || !exported.assetId) {
                  cleanupNative()
                  throw new Error(exported?.error || 'Could not prepare that video.')
                }
                watched.add(String(exported.assetId))
                cancelId = String(exported.assetId)
                updateJob(jobId, { status: 'uploading', progress: 0.72 })
                void (async () => {
                  try {
                    const videoUrl = await uploadNativeChatVideoToR2(
                      supabaseClient,
                      exported.assetId,
                      Number(exported.byteSize) || 0,
                      { signal: abortCtrl.signal },
                    )
                    const posterPublicUrl = spec.posterUrl
                      ? await uploadChatPosterToR2(supabaseClient, spec.posterUrl).catch(() => null)
                      : null
                    if (abortCtrl.signal.aborted) {
                      removeJob(jobId)
                      return
                    }
                    await uploadAndSendJob(jobId, null, null, { videoUrl, posterPublicUrl })
                  } catch (e) {
                    if (e?.name === 'AbortError' || /cancelled/i.test(String(e?.message || ''))) {
                      removeJob(jobId)
                      return
                    }
                    updateJob(jobId, {
                      status: 'error',
                      errorMessage: e?.message || 'Could not send that video.',
                    })
                  } finally {
                    cleanupNative()
                  }
                })()
              } catch (e) {
                cleanupNative()
                throw e
              }
              return
            }

            const { trimVideoFileToMp4, encodeVideoForChat } = await import(
              '../../utils/loungeVideoFfmpegTrim.js'
            )

            let readyFile
            if (isTrimJob) {
              updateJob(jobId, { status: 'trimming', progress: 0.02 })
              readyFile = await trimVideoFileToMp4(spec.sourceFile, spec.startSec, spec.endSec, {
                cropIn: spec.cropPx,
                iw: spec.intrinsicWidth,
                ih: spec.intrinsicHeight,
                onProgress: (r) => updateJob(jobId, { progress: 0.02 + r * 0.75 }),
                signal: abortCtrl.signal,
              })
            } else {
              const limits = currentChatVideoLimits()
              const sourceDur = await probeVideoFileDurationSeconds(spec)
              if (!loungeVideoDurationWithinCap(sourceDur, limits)) {
                throw new Error(loungeVideoTooLongMessage(limits.maxSeconds))
              }
              const skipEncode = canSkipLoungeVideoWasmEncode(spec, sourceDur, 'direct', limits)
              const posterMetaPromise = Promise.all([
                probeVideoFileDisplaySize(spec).catch(() => null),
                captureVideoFilePosterObjectUrl(spec, { signal: abortCtrl.signal }).catch(() => null),
              ]).then(([dims, poster]) => {
                if (abortCtrl.signal.aborted) return
                updateJob(jobId, {
                  posterUrl: poster ?? null,
                  width: dims?.width ?? null,
                  height: dims?.height ?? null,
                })
              })
              if (skipEncode) {
                updateJob(jobId, { status: 'uploading', progress: 0.4 })
                readyFile = spec
              } else {
                updateJob(jobId, { status: 'encoding', progress: 0.02 })
                readyFile = await encodeVideoForChat(spec, {
                  signal: abortCtrl.signal,
                  onProgress: (r) => updateJob(jobId, { progress: 0.02 + r * 0.75 }),
                })
              }
              const tooLarge = loungeVideoFileTooLargeReason(readyFile, limits)
              if (tooLarge) throw new Error(tooLarge)

              if (abortCtrl.signal.aborted) {
                removeJob(jobId)
                return
              }

              void uploadAndSendJob(jobId, readyFile, posterMetaPromise)
              return
            }

            if (abortCtrl.signal.aborted) {
              removeJob(jobId)
              return
            }

            const trimTooLarge = loungeVideoFileTooLargeReason(readyFile, currentChatVideoLimits())
            if (trimTooLarge) throw new Error(trimTooLarge)

            void uploadAndSendJob(jobId, readyFile)
          } catch (e) {
            if (e?.name === 'AbortError') {
              removeJob(jobId)
              return
            }
            updateJob(jobId, {
              status: 'error',
              errorMessage: e?.message || 'Could not send that video.',
            })
          }
        })
        .catch(() => {
          // Keep the encode queue alive after a failed job.
        })

      return jobId
    },
    [supabaseClient, setJobs, updateJob, removeJob, uploadAndSendJob],
  )

  const cancelVideoPrepJob = useCallback(
    (jobId) => {
      const job = jobsRef.current.find((j) => j.jobId === jobId)
      job?.abortCtrl?.abort()
      removeJob(jobId)
    },
    [removeJob],
  )

  const retryVideoPrepJob = useCallback(
    (jobId) => {
      const job = jobsRef.current.find((j) => j.jobId === jobId)
      if (!job) return
      const { roomId, viewerUserId, spec } = job
      job.abortCtrl?.abort()
      removeJob(jobId)
      enqueueVideoPrep({ roomId, viewerUserId, spec })
    },
    [removeJob, enqueueVideoPrep],
  )

  const jobsForRoom = useCallback(
    (roomId) => {
      const id = String(roomId || '').trim()
      if (!id) return []
      return jobs.filter((j) => String(j.roomId || '') === id)
    },
    [jobs],
  )

  const value = useMemo(
    () => ({
      jobs,
      jobsForRoom,
      enqueueVideoPrep,
      cancelVideoPrepJob,
      retryVideoPrepJob,
      dismissVideoPrepJob: removeJob,
      registerSentListener,
    }),
    [jobs, jobsForRoom, enqueueVideoPrep, cancelVideoPrepJob, retryVideoPrepJob, removeJob, registerSentListener],
  )

  return <ChatVideoPrepContext.Provider value={value}>{children}</ChatVideoPrepContext.Provider>
}

export function useChatVideoPrep() {
  const ctx = useContext(ChatVideoPrepContext)
  if (!ctx) {
    throw new Error('useChatVideoPrep must be used within ChatVideoPrepProvider')
  }
  return ctx
}
