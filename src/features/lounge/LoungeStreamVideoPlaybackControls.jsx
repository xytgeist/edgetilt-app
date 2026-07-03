import { useCallback, useEffect, useRef, useState } from 'react'

function formatRemaining(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '-0:00'
  const s = Math.ceil(seconds)
  const m = Math.floor(s / 60)
  const r = s % 60
  return `-${m}:${String(r).padStart(2, '0')}`
}

const SEEK_EPSILON_SEC = 0.035

/**
 * Minimal hero lightbox transport: play/pause + scrubber (video paints behind overlay chrome).
 * Live scrub sets currentTime directly (fastSeek breaks HLS on iOS); coalesce to one seek per frame while dragging.
 * @param {{ current: HTMLVideoElement | null }} videoRef
 */
export default function LoungeStreamVideoPlaybackControls({
  videoRef,
  visible = true,
  onUserActivity,
  onScrubbingChange,
}) {
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [scrubbing, setScrubbing] = useState(false)
  const [scrubPreview, setScrubPreview] = useState(0)
  const scrubbingRef = useRef(false)
  const wasPlayingBeforeScrubRef = useRef(false)
  const scrubSeekRafRef = useRef(0)
  const pendingScrubTimeRef = useRef(/** @type {number | null} */ (null))
  const rafRef = useRef(0)

  const syncDuration = useCallback((v) => {
    setDuration(Number.isFinite(v?.duration) ? v.duration : 0)
  }, [])

  const clampScrubTime = useCallback((v, next) => {
    if (!Number.isFinite(next)) return 0
    const cap = Number.isFinite(v?.duration) && v.duration > 0 ? v.duration : null
    if (cap != null) return Math.min(Math.max(0, next), cap)
    return Math.max(0, next)
  }, [])

  const applyVideoSeek = useCallback(
    (next) => {
      const v = videoRef?.current
      const t = clampScrubTime(v, next)
      setScrubPreview(t)
      setCurrentTime(t)
      if (!v) return t
      if (Math.abs(v.currentTime - t) <= SEEK_EPSILON_SEC) return t
      try {
        v.currentTime = t
      } catch {
        // ignore
      }
      return t
    },
    [videoRef, clampScrubTime],
  )

  const scheduleLiveScrubSeek = useCallback(
    (next) => {
      pendingScrubTimeRef.current = next
      if (scrubSeekRafRef.current) return
      scrubSeekRafRef.current = requestAnimationFrame(() => {
        scrubSeekRafRef.current = 0
        const target = pendingScrubTimeRef.current
        pendingScrubTimeRef.current = null
        if (target == null) return
        applyVideoSeek(target)
      })
    },
    [applyVideoSeek],
  )

  const seekVideoThen = useCallback((v, t, onDone) => {
    if (!v) {
      onDone?.()
      return
    }
    const clamped = clampScrubTime(v, t)
    setScrubPreview(clamped)
    setCurrentTime(clamped)
    if (Math.abs(v.currentTime - clamped) <= SEEK_EPSILON_SEC) {
      onDone?.()
      return
    }
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      v.removeEventListener('seeked', onSeeked)
      window.clearTimeout(timeoutId)
      onDone?.()
    }
    const onSeeked = () => finish()
    const timeoutId = window.setTimeout(finish, 450)
    v.addEventListener('seeked', onSeeked)
    try {
      v.currentTime = clamped
    } catch {
      finish()
    }
  }, [clampScrubTime])

  useEffect(() => {
    scrubbingRef.current = scrubbing
    onScrubbingChange?.(scrubbing)
  }, [scrubbing, onScrubbingChange])

  useEffect(
    () => () => {
      if (scrubSeekRafRef.current) cancelAnimationFrame(scrubSeekRafRef.current)
      pendingScrubTimeRef.current = null
    },
    [],
  )

  useEffect(() => {
    const v = videoRef?.current
    if (!v) return undefined

    const syncPlayState = () => {
      setPlaying(!v.paused && !v.ended)
    }
    syncPlayState()
    syncDuration(v)
    if (!scrubbingRef.current) {
      setCurrentTime(v.currentTime || 0)
      setScrubPreview(v.currentTime || 0)
    }

    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    const onDurationChange = () => syncDuration(v)
    const onLoadedMetadata = () => syncDuration(v)

    v.addEventListener('play', onPlay)
    v.addEventListener('pause', onPause)
    v.addEventListener('durationchange', onDurationChange)
    v.addEventListener('loadedmetadata', onLoadedMetadata)
    return () => {
      v.removeEventListener('play', onPlay)
      v.removeEventListener('pause', onPause)
      v.removeEventListener('durationchange', onDurationChange)
      v.removeEventListener('loadedmetadata', onLoadedMetadata)
    }
  }, [videoRef, syncDuration])

  useEffect(() => {
    const v = videoRef?.current
    if (!v || !visible) return undefined

    const tick = () => {
      if (!scrubbingRef.current) {
        const t = v.currentTime || 0
        setCurrentTime(t)
        setScrubPreview(t)
      }
      if (!v.paused && !v.ended) {
        rafRef.current = requestAnimationFrame(tick)
      }
    }

    if (!v.paused && !v.ended) {
      rafRef.current = requestAnimationFrame(tick)
    }

    const onPlay = () => {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(tick)
    }
    const onPause = () => cancelAnimationFrame(rafRef.current)
    const onEnded = () => cancelAnimationFrame(rafRef.current)

    v.addEventListener('play', onPlay)
    v.addEventListener('pause', onPause)
    v.addEventListener('ended', onEnded)
    return () => {
      cancelAnimationFrame(rafRef.current)
      v.removeEventListener('play', onPlay)
      v.removeEventListener('pause', onPause)
      v.removeEventListener('ended', onEnded)
    }
  }, [videoRef, visible, playing])

  const togglePlay = useCallback(
    (e) => {
      e.stopPropagation()
      onUserActivity?.()
      const v = videoRef?.current
      if (!v) return
      try {
        if (v.paused) {
          const p = v.play()
          if (p && typeof p.catch === 'function') p.catch(() => {})
        } else {
          v.pause()
        }
      } catch {
        // ignore
      }
    },
    [videoRef, onUserActivity],
  )

  const beginScrub = useCallback(
    (e) => {
      e.stopPropagation()
      onUserActivity?.()
      const v = videoRef?.current
      wasPlayingBeforeScrubRef.current = Boolean(v && !v.paused && !v.ended)
      if (v && wasPlayingBeforeScrubRef.current) {
        try {
          v.pause()
        } catch {
          // ignore
        }
        setPlaying(false)
      }
      pendingScrubTimeRef.current = null
      setScrubbing(true)
      const t = v?.currentTime || currentTime
      setScrubPreview(t)
    },
    [videoRef, currentTime, onUserActivity],
  )

  const onScrubInput = useCallback(
    (e) => {
      e.stopPropagation()
      const next = Number(e.target.value)
      if (!Number.isFinite(next)) return
      setScrubPreview(clampScrubTime(videoRef?.current, next))
      scheduleLiveScrubSeek(next)
    },
    [videoRef, clampScrubTime, scheduleLiveScrubSeek],
  )

  const finishScrub = useCallback(
    (e) => {
      e?.stopPropagation?.()
      if (scrubSeekRafRef.current) {
        cancelAnimationFrame(scrubSeekRafRef.current)
        scrubSeekRafRef.current = 0
      }
      const fromInput = Number(e?.currentTarget?.value)
      const next = Number.isFinite(fromInput) ? fromInput : scrubPreview
      const resume = wasPlayingBeforeScrubRef.current
      wasPlayingBeforeScrubRef.current = false
      setScrubbing(false)
      pendingScrubTimeRef.current = null

      const v = videoRef?.current
      seekVideoThen(v, next, () => {
        if (v && resume) {
          try {
            const p = v.play()
            if (p && typeof p.catch === 'function') p.catch(() => {})
          } catch {
            // ignore
          }
        }
        onUserActivity?.()
      })
    },
    [videoRef, scrubPreview, seekVideoThen, onUserActivity],
  )

  const max = duration > 0 ? duration : 1
  const displayTime = scrubbing ? scrubPreview : currentTime
  const remaining = duration > 0 ? duration - displayTime : 0
  const scrubProgressPct = max > 0 ? Math.min(100, Math.max(0, (displayTime / max) * 100)) : 0

  return (
    <div
      className={`flex w-full items-center gap-3 px-1 pt-1 ${visible ? 'pointer-events-auto' : 'pointer-events-none'}`}
      data-lounge-lightbox-no-swipe
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={togglePlay}
        aria-label={playing ? 'Pause' : 'Play'}
        className="inline-flex h-10 w-10 shrink-0 touch-manipulation items-center justify-center rounded-full text-white hover:bg-white/10 [-webkit-tap-highlight-color:transparent]"
      >
        {playing ? (
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M6 5h4v14H6V5zm8 0h4v14h-4V5z" />
          </svg>
        ) : (
          <svg className="ml-0.5 h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M8 5.14v13.72L19 12 8 5.14z" />
          </svg>
        )}
      </button>
      <input
        type="range"
        min={0}
        max={max}
        step="any"
        value={Math.min(Math.max(displayTime, 0), max)}
        onChange={onScrubInput}
        onInput={onScrubInput}
        onPointerDown={beginScrub}
        onPointerUp={finishScrub}
        onPointerCancel={finishScrub}
        aria-label="Video progress"
        className="lounge-video-scrubber range-touch-target min-w-0 flex-1"
        style={{
          touchAction: 'none',
          ['--lounge-scrub-progress']: `${scrubProgressPct}%`,
        }}
      />
      <span className="w-10 shrink-0 text-right text-[12px] tabular-nums text-white/90">
        {formatRemaining(remaining)}
      </span>
    </div>
  )
}
