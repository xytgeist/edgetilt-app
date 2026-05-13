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
  const [trimProgress, setTrimProgress] = useState(0)
  const trimAbortRef = useRef(null)

  useEffect(() => {
    clipRef.current = { start: clipStart, end: clipEnd }
  }, [clipStart, clipEnd])

  useEffect(() => {
    durationRef.current = duration
  }, [duration])

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
    setTrimProgress(0)
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

  const startLeftDrag = useCallback(
    (e) => {
      e.preventDefault()
      e.stopPropagation()
      const end0 = clipRef.current.end
      dragRef.current = { kind: 'left', end0 }
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
        setClipStart(ns)
        setClipEnd(ne)
      }
      const up = () => cleanupDrag()
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
      const start0 = clipRef.current.start
      dragRef.current = { kind: 'right', start0 }
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
        setClipStart(ns)
        setClipEnd(ne)
      }
      const up = () => cleanupDrag()
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
      const { start: s0, end: e0 } = clipRef.current
      const t0 = timeFromClientX(e.clientX)
      dragRef.current = { kind: 'move', start0: s0, end0: e0, grabT: t0 - s0 }
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
        setClipStart(ns)
        setClipEnd(ne)
      }
      const up = () => cleanupDrag()
      listenersRef.current = { move, up }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
      window.addEventListener('pointercancel', up)
    },
    [cleanupDrag, timeFromClientX],
  )

  const playSelection = useCallback(() => {
    const v = videoRef.current
    const { start, end } = clipRef.current
    if (!v) return
    try {
      v.pause()
      v.currentTime = start
      void v.play()
      const onTime = () => {
        if (v.currentTime >= end - 0.04) {
          v.pause()
          v.removeEventListener('timeupdate', onTime)
        }
      }
      v.addEventListener('timeupdate', onTime)
    } catch {
      // ignore
    }
  }, [])

  const cancelTrim = useCallback(() => {
    try {
      trimAbortRef.current?.abort()
    } catch {
      // ignore
    }
    trimAbortRef.current = null
    setPhase('idle')
    setTrimProgress(0)
  }, [])

  const confirmTrim = useCallback(async () => {
    setTrimErr('')
    setPhase('trimming')
    setTrimProgress(0)
    const ac = new AbortController()
    trimAbortRef.current = ac
    const { start, end } = clipRef.current
    try {
      const { trimVideoFileToMp4 } = await import('../../utils/loungeVideoFfmpegTrim')
      const out = await trimVideoFileToMp4(file, start, end, {
        signal: ac.signal,
        onProgress: (p) => setTrimProgress(p),
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
      <button type="button" className="absolute inset-0 cursor-default bg-transparent" aria-label="Close" onClick={busy ? undefined : onCancel} disabled={busy} />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-zinc-700/85 bg-zinc-950/96 p-4 shadow-2xl backdrop-blur-md">
        <h2 className="text-[17px] font-bold text-white">Trim video (max {MAX_CLIP_SEC}s)</h2>
        <p className="mt-1 text-[13px] leading-snug text-zinc-400">
          Drag the handles to shorten the clip (never wider than {MAX_CLIP_SEC}s). Drag the highlighted range to move it along your video.
        </p>

        <div className="mt-3 overflow-hidden rounded-xl border border-zinc-700/80 bg-black">
          <video
            ref={videoRef}
            src={urlRef.current || undefined}
            className="max-h-[40vh] w-full object-contain"
            controls={!busy}
            playsInline
            preload="metadata"
            onLoadedMetadata={onMetaLoaded}
            onLoadedData={onMetaLoaded}
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
            <button
              type="button"
              onClick={playSelection}
              disabled={busy}
              className="mt-2 text-[13px] font-semibold text-cyan-400 hover:text-cyan-300 disabled:opacity-40"
            >
              Play selection
            </button>
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

        {busy ? (
          <div className="mt-3">
            <div className="text-[13px] text-zinc-300">Encoding clip… first run may download the encoder.</div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-zinc-800">
              <div
                className="h-full rounded-full bg-cyan-500 transition-[width] duration-200"
                style={{ width: `${Math.round(trimProgress * 100)}%` }}
              />
            </div>
            <button
              type="button"
              onClick={cancelTrim}
              className="mt-2 text-[13px] font-semibold text-zinc-400 underline hover:text-zinc-200"
            >
              Cancel encoding
            </button>
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy || duration <= 0}
            onClick={() => void confirmTrim()}
            className="min-h-11 flex-1 rounded-xl bg-cyan-600 px-4 text-[15px] font-semibold text-white hover:bg-cyan-500 disabled:opacity-40 touch-manipulation"
          >
            Use this clip
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="min-h-11 flex-1 rounded-xl border border-zinc-600 px-4 text-[15px] font-semibold text-zinc-200 hover:bg-zinc-800 disabled:opacity-40 touch-manipulation"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
