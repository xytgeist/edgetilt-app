import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { LOUNGE_VIDEO_MAX_SECONDS } from '../../utils/loungeVideoUpload'

const MIN_CLIP_SEC = 0.5
const MAX_CLIP_SEC = LOUNGE_VIDEO_MAX_SECONDS

function formatClock(sec) {
  const s = Math.max(0, sec)
  const mm = Math.floor(s / 60)
  const ss = Math.floor(s % 60)
  const frac = Math.floor((s % 1) * 10)
  return `${mm}:${String(ss).padStart(2, '0')}.${frac}`
}

/** Downscale wide frames so poster data URLs stay small. */
const POSTER_MAX_WIDTH = 960

/** Seek preview; if `resumePlay`, continue playback (e.g. user had pressed play on native controls). */
function seekPreviewMaybeResume(video, timeSec, resumePlay) {
  if (!video) return
  try {
    video.currentTime = timeSec
    if (resumePlay) {
      const p = video.play()
      if (p && typeof p.catch === 'function') p.catch(() => {})
    }
  } catch {
    // ignore
  }
}

/**
 * iOS Safari often keeps the first decoded frame black until a muted `play()` runs and a frame is presented.
 * Restores `video.muted` afterward so preview can stay unmuted by default.
 */
async function primeVideoFrameForCanvas(video) {
  if (!video) return
  const prevMuted = video.muted
  video.muted = true
  try {
    try {
      const p = video.play()
      if (p && typeof p.then === 'function') await p
    } catch {
      // ignore — still try canvas
    }
    if (typeof video.requestVideoFrameCallback === 'function') {
      await new Promise((resolve) => {
        let settled = false
        const finish = () => {
          if (settled) return
          settled = true
          resolve(undefined)
        }
        try {
          video.requestVideoFrameCallback(() => finish())
        } catch {
          finish()
        }
        window.setTimeout(finish, 320)
      })
    } else {
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    }
    try {
      video.pause()
    } catch {
      // ignore
    }
  } finally {
    video.muted = prevMuted
  }
}

/**
 * Trim a video to at most 60s: draggable window on the full timeline (cannot widen past 60s).
 *
 * @param {{ file: File, knownDurationSec?: number, onCancel: () => void, onConfirm: (file: File) => void }} props
 * `knownDurationSec` — duration already probed before opening (avoids iOS waiting twice on `loadedmetadata`).
 */
export default function LoungeVideoCropModal({ file, knownDurationSec, onCancel, onConfirm }) {
  const videoRef = useRef(null)
  const trackRef = useRef(null)
  const urlRef = useRef('')
  const dragRef = useRef(null)
  const durationRef = useRef(0)
  const clipRef = useRef({ start: 0, end: MAX_CLIP_SEC })
  const listenersRef = useRef({ move: null, up: null })

  const [duration, setDuration] = useState(0)
  const [clipStart, setClipStart] = useState(0)
  const [clipEnd, setClipEnd] = useState(MAX_CLIP_SEC)
  const [phase, setPhase] = useState('idle')
  const [trimErr, setTrimErr] = useState('')
  const [posterUrl, setPosterUrl] = useState('')
  /** When false, show `<img>` over the video so a decoded black frame at clip start does not hide the poster. */
  const [previewThumbDismissed, setPreviewThumbDismissed] = useState(false)
  const trimAbortRef = useRef(null)
  const trimBusyRef = useRef(false)
  const posterCapturedRef = useRef(false)
  const posterObjectUrlRef = useRef('')
  const posterSeekScheduledRef = useRef(false)
  const capturePosterOnceRef = useRef(() => {})

  useEffect(() => {
    clipRef.current = { start: clipStart, end: clipEnd }
  }, [clipStart, clipEnd])

  useEffect(() => {
    durationRef.current = duration
  }, [duration])

  useEffect(() => {
    trimBusyRef.current = phase === 'trimming'
  }, [phase])

  /** While preview is playing, keep playback inside the trim range (loop at end). */
  useEffect(() => {
    if (!file || duration <= 0) return undefined
    const v = videoRef.current
    if (!v) return undefined
    const onTime = () => {
      if (trimBusyRef.current) return
      const { start, end } = clipRef.current
      if (!Number.isFinite(end) || end <= start) return
      if (v.paused) return
      if (v.currentTime < start - 0.02) {
        seekPreviewMaybeResume(v, start, true)
        return
      }
      if (v.currentTime >= end - 0.05) {
        seekPreviewMaybeResume(v, start, true)
      }
    }
    v.addEventListener('timeupdate', onTime)
    return () => v.removeEventListener('timeupdate', onTime)
  }, [file, duration])

  useEffect(() => {
    void import('../../utils/loungeVideoFfmpegTrim')
      .then((m) => m.prefetchFfmpegCore())
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!file) return undefined
    const u = URL.createObjectURL(file)
    urlRef.current = u
    setTrimErr('')
    posterCapturedRef.current = false
    posterSeekScheduledRef.current = false
    setPosterUrl('')
    setPreviewThumbDismissed(false)
    if (posterObjectUrlRef.current) {
      try {
        URL.revokeObjectURL(posterObjectUrlRef.current)
      } catch {
        // ignore
      }
      posterObjectUrlRef.current = ''
    }
    setPhase('idle')
    const probed =
      typeof knownDurationSec === 'number' &&
      Number.isFinite(knownDurationSec) &&
      knownDurationSec > 0
    if (probed) {
      const d0 = knownDurationSec
      durationRef.current = d0
      setDuration(d0)
      const span = Math.min(MAX_CLIP_SEC, d0)
      setClipStart(0)
      setClipEnd(span)
      clipRef.current = { start: 0, end: span }
    } else {
      durationRef.current = 0
      setDuration(0)
      setClipStart(0)
      setClipEnd(MAX_CLIP_SEC)
      clipRef.current = { start: 0, end: MAX_CLIP_SEC }
    }
    return () => {
      try {
        URL.revokeObjectURL(u)
      } catch {
        // ignore
      }
      urlRef.current = ''
      if (posterObjectUrlRef.current) {
        try {
          URL.revokeObjectURL(posterObjectUrlRef.current)
        } catch {
          // ignore
        }
        posterObjectUrlRef.current = ''
      }
    }
  }, [file, knownDurationSec])

  const cleanupDrag = useCallback(() => {
    const { move, up } = listenersRef.current
    if (move) window.removeEventListener('pointermove', move)
    if (up) {
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
    listenersRef.current = { move: null, up: null }
    dragRef.current = null
  }, [])

  const timeFromClientX = useCallback((clientX) => {
    const el = trackRef.current
    const dur = durationRef.current
    if (!el || dur <= 0) return 0
    const r = el.getBoundingClientRect()
    const p = Math.min(1, Math.max(0, (clientX - r.left) / Math.max(1, r.width)))
    return p * dur
  }, [])

  const onMetaLoaded = useCallback(() => {
    const v = videoRef.current
    const d = v?.duration
    if (!Number.isFinite(d) || d <= 0) return
    durationRef.current = d
    setDuration(d)
    let ns = clipRef.current.start
    let ne = clipRef.current.end
    if (ne > d) ne = d
    if (ne - ns > MAX_CLIP_SEC) ns = Math.max(0, ne - MAX_CLIP_SEC)
    if (ns < 0) ns = 0
    if (ne - ns < MIN_CLIP_SEC) ne = Math.min(d, ns + MIN_CLIP_SEC)
    clipRef.current = { start: ns, end: ne }
    setClipStart(ns)
    setClipEnd(ne)
  }, [])

  const capturePosterOnce = useCallback(() => {
    if (posterCapturedRef.current) return
    const v = videoRef.current
    if (!v || v.videoWidth < 2 || v.videoHeight < 2) return
    try {
      const w0 = v.videoWidth
      const h0 = v.videoHeight
      const scale = w0 > POSTER_MAX_WIDTH ? POSTER_MAX_WIDTH / w0 : 1
      const c = document.createElement('canvas')
      c.width = Math.round(w0 * scale)
      c.height = Math.round(h0 * scale)
      const ctx = c.getContext('2d')
      if (!ctx) return
      ctx.drawImage(v, 0, 0, c.width, c.height)
      c.toBlob(
        (blob) => {
          if (!blob) return
          posterCapturedRef.current = true
          if (posterObjectUrlRef.current) {
            try {
              URL.revokeObjectURL(posterObjectUrlRef.current)
            } catch {
              // ignore
            }
          }
          const u = URL.createObjectURL(blob)
          posterObjectUrlRef.current = u
          setPosterUrl(u)
        },
        'image/jpeg',
        0.78,
      )
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    capturePosterOnceRef.current = capturePosterOnce
  }, [capturePosterOnce])

  const finishPosterSeek = useCallback(async () => {
    try {
      try {
        const v = videoRef.current
        if (v && v.videoWidth >= 2) {
          await primeVideoFrameForCanvas(v)
        }
        capturePosterOnce()
        try {
          const v2 = videoRef.current
          if (v2) v2.currentTime = clipRef.current.start
        } catch {
          // ignore
        }
      } catch {
        // ignore
      }
    } finally {
      posterSeekScheduledRef.current = false
    }
  }, [capturePosterOnce])

  const requestPosterFrame = useCallback(() => {
    if (posterCapturedRef.current || posterSeekScheduledRef.current) return
    const v = videoRef.current
    if (!v || v.readyState < 1 || v.videoWidth < 2) return
    posterSeekScheduledRef.current = true
    const dur = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : 0
    const cs = clipRef.current.start
    const seekTo = dur > 0 ? Math.min(Math.max(cs + 0.06, 0.05), dur - 0.02) : 0.12

    let finished = false
    const done = () => {
      if (finished) return
      finished = true
      void finishPosterSeek()
    }

    let fallbackTimer = 0
    const onSeeked = () => {
      v.removeEventListener('seeked', onSeeked)
      window.clearTimeout(fallbackTimer)
      done()
    }
    fallbackTimer = window.setTimeout(() => {
      v.removeEventListener('seeked', onSeeked)
      done()
    }, 400)

    v.addEventListener('seeked', onSeeked)
    try {
      const before = v.currentTime
      if (Math.abs(before - seekTo) < 0.03) {
        v.removeEventListener('seeked', onSeeked)
        window.clearTimeout(fallbackTimer)
        done()
        return
      }
      v.currentTime = seekTo
    } catch {
      v.removeEventListener('seeked', onSeeked)
      window.clearTimeout(fallbackTimer)
      done()
    }
  }, [finishPosterSeek])

  const startLeftDrag = useCallback(
    (e) => {
      e.preventDefault()
      e.stopPropagation()
      setPreviewThumbDismissed(true)
      const end0 = clipRef.current.end
      dragRef.current = { kind: 'left', end0 }
      let lastStartSec = clipRef.current.start
      const v0 = videoRef.current
      const resumePlay = Boolean(v0 && !v0.paused)
      seekPreviewMaybeResume(v0, lastStartSec, resumePlay)
      const move = (ev) => {
        const drag = dragRef.current
        const dur = durationRef.current
        if (!drag || dur <= 0) return
        const t = timeFromClientX(ev.clientX)
        let ns = Math.min(t, drag.end0 - MIN_CLIP_SEC)
        ns = Math.max(0, ns)
        let ne = drag.end0
        if (ne - ns > MAX_CLIP_SEC) ne = ns + MAX_CLIP_SEC
        if (ne > dur) {
          ne = dur
          ns = Math.max(0, ne - MAX_CLIP_SEC)
        }
        lastStartSec = ns
        clipRef.current = { start: ns, end: ne }
        setClipStart(ns)
        setClipEnd(ne)
        seekPreviewMaybeResume(videoRef.current, ns, resumePlay)
      }
      const up = () => {
        cleanupDrag()
        seekPreviewMaybeResume(videoRef.current, lastStartSec, resumePlay)
      }
      listenersRef.current = { move, up }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
      window.addEventListener('pointercancel', up)
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {
        // ignore
      }
    },
    [cleanupDrag, timeFromClientX],
  )

  const startRightDrag = useCallback(
    (e) => {
      e.preventDefault()
      e.stopPropagation()
      setPreviewThumbDismissed(true)
      const start0 = clipRef.current.start
      dragRef.current = { kind: 'right', start0 }
      let lastEndSec = clipRef.current.end
      const v0 = videoRef.current
      const resumePlay = Boolean(v0 && !v0.paused)
      seekPreviewMaybeResume(v0, lastEndSec, resumePlay)
      const move = (ev) => {
        const drag = dragRef.current
        const dur = durationRef.current
        if (!drag || dur <= 0) return
        const t = timeFromClientX(ev.clientX)
        let ne = Math.max(t, drag.start0 + MIN_CLIP_SEC)
        ne = Math.min(dur, ne)
        let ns = drag.start0
        if (ne - ns > MAX_CLIP_SEC) ns = ne - MAX_CLIP_SEC
        if (ns < 0) {
          ns = 0
          ne = Math.min(dur, ns + MAX_CLIP_SEC)
        }
        lastEndSec = ne
        clipRef.current = { start: ns, end: ne }
        setClipStart(ns)
        setClipEnd(ne)
        seekPreviewMaybeResume(videoRef.current, ne, resumePlay)
      }
      const up = () => {
        cleanupDrag()
        seekPreviewMaybeResume(videoRef.current, lastEndSec, resumePlay)
      }
      listenersRef.current = { move, up }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
      window.addEventListener('pointercancel', up)
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {
        // ignore
      }
    },
    [cleanupDrag, timeFromClientX],
  )

  const startMoveDrag = useCallback(
    (e) => {
      e.preventDefault()
      setPreviewThumbDismissed(true)
      const { start: s0, end: e0 } = clipRef.current
      const t0 = timeFromClientX(e.clientX)
      dragRef.current = { kind: 'move', start0: s0, end0: e0, grabT: t0 - s0 }
      let lastStartSec = s0
      const v0 = videoRef.current
      const resumePlay = Boolean(v0 && !v0.paused)
      seekPreviewMaybeResume(v0, lastStartSec, resumePlay)
      const move = (ev) => {
        const drag = dragRef.current
        const dur = durationRef.current
        if (!drag || dur <= 0) return
        const t = timeFromClientX(ev.clientX)
        const span = drag.end0 - drag.start0
        let ns = t - drag.grabT
        let ne = ns + span
        if (ns < 0) {
          ns = 0
          ne = span
        }
        if (ne > dur) {
          ne = dur
          ns = dur - span
        }
        if (ns < 0) ns = 0
        lastStartSec = ns
        clipRef.current = { start: ns, end: ne }
        setClipStart(ns)
        setClipEnd(ne)
        seekPreviewMaybeResume(videoRef.current, ns, resumePlay)
      }
      const up = () => {
        cleanupDrag()
        seekPreviewMaybeResume(videoRef.current, lastStartSec, resumePlay)
      }
      listenersRef.current = { move, up }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
      window.addEventListener('pointercancel', up)
    },
    [cleanupDrag, timeFromClientX],
  )

  const cancelTrim = useCallback(() => {
    try {
      trimAbortRef.current?.abort()
    } catch {
      // ignore
    }
    trimAbortRef.current = null
    setPhase('idle')
  }, [])

  const confirmTrim = useCallback(async () => {
    setTrimErr('')
    setPhase('trimming')
    const ac = new AbortController()
    trimAbortRef.current = ac
    const { start, end } = clipRef.current
    try {
      const { trimVideoFileToMp4 } = await import('../../utils/loungeVideoFfmpegTrim')
      const out = await trimVideoFileToMp4(file, start, end, {
        signal: ac.signal,
      })
      onConfirm(out)
    } catch (err) {
      if (err?.name === 'AbortError') {
        setPhase('idle')
        return
      }
      setTrimErr(err instanceof Error ? err.message : 'Could not trim video.')
      setPhase('idle')
    } finally {
      trimAbortRef.current = null
    }
  }, [file, onConfirm])

  useEffect(() => () => cleanupDrag(), [cleanupDrag])

  if (!file) return null

  const pct = (t) => (duration > 0 ? (t / duration) * 100 : 0)
  const span = clipEnd - clipStart
  const busy = phase === 'trimming'

  return createPortal(
    <div
      className="fixed inset-0 z-[96] flex items-end justify-center bg-black/55 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-10 backdrop-blur-[2px] sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Trim video"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-transparent"
        aria-label="Close"
        onClick={() => {
          if (busy) cancelTrim()
          else onCancel()
        }}
      />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-zinc-700/85 bg-zinc-950/96 p-4 shadow-2xl backdrop-blur-md">
        <h2 className="text-[17px] font-bold text-white">Trim video (max {MAX_CLIP_SEC}s)</h2>
        <p className="mt-1 text-[13px] leading-snug text-zinc-400">
          Press play on the video once to preview. Drag the handles or the highlighted range to scrub; playback stays inside your selection and loops at the end. The clip is never wider than {MAX_CLIP_SEC}s.
        </p>

        <div className="relative mt-3 overflow-hidden rounded-xl border border-zinc-700/80 bg-black">
          {posterUrl && !previewThumbDismissed ? (
            <img
              src={posterUrl}
              alt=""
              draggable={false}
              className="pointer-events-none absolute inset-0 z-[2] mx-auto max-h-[40vh] w-full object-contain"
            />
          ) : null}
          <video
            key={`${file.name}-${file.size}-${file.lastModified}`}
            ref={videoRef}
            src={urlRef.current || undefined}
            poster={posterUrl || undefined}
            className="relative z-[1] max-h-[40vh] w-full object-contain"
            controls={!busy}
            playsInline
            preload="auto"
            onPlay={() => {
              requestAnimationFrame(() => {
                if (!posterCapturedRef.current) {
                  capturePosterOnceRef.current()
                }
                setPreviewThumbDismissed(true)
              })
            }}
            onLoadedMetadata={() => {
              onMetaLoaded()
              requestAnimationFrame(() => {
                requestAnimationFrame(() => requestPosterFrame())
              })
            }}
            onLoadedData={() => {
              onMetaLoaded()
              requestPosterFrame()
            }}
            onCanPlay={() => requestPosterFrame()}
            onDurationChange={onMetaLoaded}
          />
        </div>

        {duration > 0 ? (
          <div className="mt-4">
            <div className="flex justify-between text-[12px] tabular-nums text-zinc-400">
              <span>
                Start {formatClock(clipStart)} · End {formatClock(clipEnd)}
              </span>
              <span>
                Length {formatClock(span)} / max {MAX_CLIP_SEC}s
              </span>
            </div>
            <div ref={trackRef} className="relative mt-2 h-11 select-none touch-none">
              <div className="absolute left-0 right-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-zinc-800" />
              <button
                type="button"
                aria-label="Move clip range"
                className="absolute top-1/2 h-4 -translate-y-1/2 cursor-grab rounded-md bg-cyan-500/35 active:cursor-grabbing"
                style={{
                  left: `${pct(clipStart)}%`,
                  width: `${Math.max(0.5, pct(clipEnd) - pct(clipStart))}%`,
                }}
                onPointerDown={startMoveDrag}
              />
              <button
                type="button"
                aria-label="Trim start"
                className="absolute top-1/2 z-[1] h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-cyan-400 bg-zinc-900 shadow-md touch-manipulation"
                style={{ left: `${pct(clipStart)}%` }}
                onPointerDown={startLeftDrag}
              />
              <button
                type="button"
                aria-label="Trim end"
                className="absolute top-1/2 z-[1] h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-cyan-400 bg-zinc-900 shadow-md touch-manipulation"
                style={{ left: `${pct(clipEnd)}%` }}
                onPointerDown={startRightDrag}
              />
            </div>
          </div>
        ) : (
          <p className="mt-3 text-[13px] text-zinc-500">
            Reading video…{' '}
            <span className="text-zinc-600">If this hangs, try exporting as MP4 in Photos or a shorter clip.</span>
          </p>
        )}

        {trimErr ? (
          <div className="mt-3 rounded-lg border border-rose-500/40 bg-rose-950/30 px-2 py-1.5 text-[13px] text-rose-200">{trimErr}</div>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              if (busy) cancelTrim()
              else onCancel()
            }}
            className="min-h-11 flex-1 rounded-xl border border-zinc-600 px-4 text-[15px] font-semibold text-zinc-200 hover:bg-zinc-800 touch-manipulation"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || duration <= 0}
            onClick={() => void confirmTrim()}
            className="min-h-11 flex-1 rounded-xl bg-cyan-600 px-4 text-[15px] font-semibold text-white hover:bg-cyan-500 disabled:opacity-40 touch-manipulation"
          >
            Use this clip
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
