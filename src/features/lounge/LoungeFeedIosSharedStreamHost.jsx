import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { cfStreamManifestUrl } from '../../utils/loungeVideoUpload'
import { appleWebKitBlocksFeedSoundHandoff } from '../../utils/loungeAppleWebKit.js'
import { useLoungeStreamHlsAttachment } from './useLoungeStreamHlsAttachment.js'
import {
  getIosSharedStreamHostSnapshot,
  subscribeIosSharedStreamHosts,
} from './loungeFeedIosSharedStreamRegistry.js'

/**
 * iOS feed-wide sound: one shared `<video>` reparents to the active tile flyout so Tap-for-sound
 * permission persists across handoffs (WebKit silences new elements when the gesture ends).
 */
export default function LoungeFeedIosSharedStreamHost({
  store,
  feedInlineSoundUnmuted,
  feedInlineSoundExplicitlyMuted,
}) {
  const enabled =
    appleWebKitBlocksFeedSoundHandoff() &&
    feedInlineSoundUnmuted &&
    !feedInlineSoundExplicitlyMuted

  const snapshot = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  )
  const activeId = enabled ? snapshot.activeId : null

  const hostMap = useSyncExternalStore(
    subscribeIosSharedStreamHosts,
    getIosSharedStreamHostSnapshot,
    getIosSharedStreamHostSnapshot,
  )

  const hostSpec = activeId ? hostMap.get(activeId) : null
  const streamUid = hostSpec?.streamUid ? String(hostSpec.streamUid).trim() : ''
  const src = streamUid ? cfStreamManifestUrl(streamUid) : ''

  const poolRef = useRef(/** @type {HTMLDivElement | null} */ (null))
  const videoRef = useRef(/** @type {HTMLVideoElement | null} */ (null))
  const savedTimesRef = useRef(/** @type {Record<string, number>} */ ({}))
  const attachKeyRef = useRef(0)
  const [attachKey, setAttachKey] = useState(0)
  const prevUidRef = useRef('')

  const savedTimeProxy = useMemo(
    () => ({
      get current() {
        return savedTimesRef.current[streamUid] ?? 0
      },
      set current(t) {
        if (streamUid) savedTimesRef.current[streamUid] = t
      },
    }),
    [streamUid],
  )

  useEffect(() => {
    if (!streamUid || streamUid === prevUidRef.current) return
    prevUidRef.current = streamUid
    attachKeyRef.current += 1
    setAttachKey(attachKeyRef.current)
  }, [streamUid])

  useLayoutEffect(() => {
    const video = videoRef.current
    if (!video) return
    const slot = enabled && hostSpec ? hostSpec.getSlotEl?.() : null
    const parent = slot || poolRef.current
    if (!parent) return
    if (video.parentElement !== parent) parent.appendChild(video)
  }, [enabled, hostSpec, activeId, attachKey])

  useLoungeStreamHlsAttachment(videoRef, src, attachKey, {
    enabled: enabled && Boolean(src),
    feedStyleAbr: true,
    preferMseHls: true,
    savedTimeRef: savedTimeProxy,
  })

  const playShared = useCallback(() => {
    const v = videoRef.current
    if (!v || !enabled || !activeId) return
    try {
      v.muted = true
      const p = v.play()
      const unmute = () => {
        try {
          v.muted = false
        } catch {
          // ignore
        }
      }
      if (p && typeof p.then === 'function') {
        p.then(unmute).catch(() => {})
      } else if (!v.paused) {
        unmute()
      }
    } catch {
      // ignore
    }
  }, [activeId, enabled])

  useEffect(() => {
    if (!enabled || !activeId || !src) return undefined
    let cancelled = false
    const kick = () => {
      if (cancelled) return
      const v = videoRef.current
      if (!v) return
      if (v.readyState >= HTMLMediaElement.HAVE_METADATA) {
        playShared()
        return
      }
      v.addEventListener('loadeddata', playShared, { once: true })
      v.addEventListener('canplay', playShared, { once: true })
    }
    kick()
    const tid = window.setTimeout(kick, 120)
    return () => {
      cancelled = true
      window.clearTimeout(tid)
      const v = videoRef.current
      if (v) {
        v.removeEventListener('loadeddata', playShared)
        v.removeEventListener('canplay', playShared)
      }
    }
  }, [activeId, attachKey, enabled, playShared, src])

  useEffect(() => {
    if (!enabled) return undefined
    return store.registerIosSharedStreamController?.({
      unmuteInGesture: () => {
        const v = videoRef.current
        if (!v) return
        try {
          v.muted = true
          const p = v.play()
          if (p && typeof p.then === 'function') {
            p.then(() => {
              try {
                v.muted = false
              } catch {
                // ignore
              }
            }).catch(() => {})
          } else {
            try {
              v.muted = false
            } catch {
              // ignore
            }
          }
        } catch {
          // ignore
        }
      },
      getVideo: () => videoRef.current,
    })
  }, [enabled, store])

  if (!enabled) return null

  return (
    <>
      <div ref={poolRef} className="hidden" aria-hidden data-lounge-ios-shared-stream-pool />
      <video
        ref={videoRef}
        className="pointer-events-none absolute inset-0 z-[2] h-full w-full object-contain opacity-100"
        controls={false}
        controlsList="nodownload"
        defaultMuted
        loop
        playsInline
        preload="auto"
        aria-hidden
      />
    </>
  )
}
