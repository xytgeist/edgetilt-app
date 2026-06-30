import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { LOUNGE_VIDEO_MAX_SECONDS } from '../../utils/loungeVideoUpload'
import { maxCropRectForAspect, sanitizeVideoCropPx } from '../../utils/loungeVideoCropMath.js'

const MIN_CLIP_SEC = 0.5
const MAX_CLIP_SEC = LOUNGE_VIDEO_MAX_SECONDS

/** `pointermove` must be non-passive so drag handlers can `preventDefault` and stop scroll / pull-to-refresh underneath. */
const POINTER_MOVE_DRAG = { passive: false }

function formatClock(sec) {
  const s = Math.max(0, sec)
  const mm = Math.floor(s / 60)
  const ss = Math.floor(s % 60)
  const frac = Math.floor((s % 1) * 10)
  return `${mm}:${String(ss).padStart(2, '0')}.${frac}`
}

/** Downscale wide frames so poster data URLs stay small. */
const POSTER_MAX_WIDTH = 960

/** Hidden probe: scan from t=0 for first frame that is not decoder black. */
const POSTER_SCAN_STEP_SEC = 0.13
const POSTER_SCAN_MAX_T = 2.1
const POSTER_SCAN_MAX_STEPS = 18
const POSTER_SEEK_WAIT_MS = 240

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

/** iOS Safari: decoded frames can stay black until a muted `play()` presents a frame. Used only on the hidden poster probe video. */
async function primePosterFrameForCanvas(video) {
  if (!video) return
  video.muted = true
  try {
    try {
      const p = video.play()
      if (p && typeof p.then === 'function') await p
    } catch {
      // ignore - still try canvas
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
  } catch {
    // ignore
  }
}

function waitSeeked(video, targetT, timeoutMs) {
  return new Promise((resolve) => {
    if (!video) {
      resolve()
      return
    }
    const cap =
      Number.isFinite(video.duration) && video.duration > 0 ? Math.max(0, video.duration - 0.02) : 1e9
    const target = Math.min(Math.max(0, targetT), cap)
    let settled = false
    const done = () => {
      if (settled) return
      settled = true
      video.removeEventListener('seeked', onSeeked)
      window.clearTimeout(tm)
      resolve()
    }
    const onSeeked = () => done()
    const tm = window.setTimeout(done, timeoutMs)
    if (Math.abs(video.currentTime - target) < 0.028) {
      done()
      return
    }
    video.addEventListener('seeked', onSeeked)
    try {
      video.currentTime = target
    } catch {
      done()
    }
  })
}

function waitPaintTick(video) {
  if (!video) return Promise.resolve()
  if (typeof video.requestVideoFrameCallback === 'function') {
    return new Promise((resolve) => {
      let done = false
      const finish = () => {
        if (done) return
        done = true
        resolve()
      }
      try {
        video.requestVideoFrameCallback(() => finish())
      } catch {
        finish()
      }
      window.setTimeout(finish, 140)
    })
  }
  return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
}

/** Sample a downscaled frame: mean luma + fraction of near-black pixels. */
function analyzeFrameBlackness(video) {
  const vw = video.videoWidth
  const vh = video.videoHeight
  if (!(vw > 1) || !(vh > 1)) return { mean: 0, darkRatio: 1 }
  const tw = 64
  const th = Math.max(2, Math.round((vh / vw) * tw))
  const c = document.createElement('canvas')
  c.width = tw
  c.height = th
  const ctx = c.getContext('2d', { willReadFrequently: true })
  if (!ctx) return { mean: 0, darkRatio: 1 }
  try {
    ctx.drawImage(video, 0, 0, tw, th)
  } catch {
    return { mean: 0, darkRatio: 1 }
  }
  let id
  try {
    id = ctx.getImageData(0, 0, tw, th)
  } catch {
    return { mean: 0, darkRatio: 1 }
  }
  const d = id.data
  const pixels = tw * th
  let sum = 0
  let dark = 0
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i]
    const g = d[i + 1]
    const b = d[i + 2]
    const y = 0.299 * r + 0.587 * g + 0.114 * b
    sum += y
    if (y < 16) dark += 1
  }
  return { mean: sum / pixels, darkRatio: dark / pixels }
}

function isNearlyBlack(a) {
  if (a.mean >= 18) return false
  if (a.mean <= 6) return true
  return a.darkRatio > 0.88 && a.mean < 15
}

const CROP_PRESET_ROWS = [
  ['original', 'Original'],
  ['1:1', '1:1'],
  ['4:5', '4:5'],
  ['16:9', '16:9'],
  ['9:16', '9:16'],
]

/** Crop width / height (displayed region in source pixels). */
const CROP_ASPECT_PRESETS = {
  '1:1': 1,
  '4:5': 4 / 5,
  '16:9': 16 / 9,
  '9:16': 9 / 16,
}

/** @returns {{ vw: number, vh: number, scale: number, left: number, top: number, dw: number, dh: number, bw: number, bh: number } | null} */
function getVideoStageLayout(videoEl, stageEl) {
  if (!videoEl || !stageEl || !videoEl.videoWidth) return null
  const vw = videoEl.videoWidth
  const vh = videoEl.videoHeight
  const br = stageEl.getBoundingClientRect()
  const bw = br.width
  const bh = br.height
  if (!(bw > 0) || !(bh > 0)) return null
  const scale = Math.min(bw / vw, bh / vh)
  const dw = vw * scale
  const dh = vh * scale
  const left = (bw - dw) / 2
  const top = (bh - dh) / 2
  return { vw, vh, scale, left, top, dw, dh, bw, bh }
}

/** Percents of stage box for dim strips + crop window (object-contain letterboxing aware). */
function cropOverlayPercents(layout, cropPx) {
  if (!layout || !cropPx) return null
  const { vw, vh, left, top, dw, dh, bw, bh } = layout
  const L = (left / bw) * 100
  const T = (top / bh) * 100
  const RW = (dw / bw) * 100
  const RH = (dh / bh) * 100
  const cl = L + RW * (cropPx.x / vw)
  const ct = T + RH * (cropPx.y / vh)
  const cw = RW * (cropPx.w / vw)
  const ch = RH * (cropPx.h / vh)
  return { cl, ct, cw, ch }
}

/**
 * Trim and optionally crop a video to at most 60s: draggable window on the full timeline (cannot widen past 60s).
 *
 * @param {{ file: File, knownDurationSec?: number, intent?: 'composer' | 'detail', onCancel: () => void, onConfirm: (result: File | { type: 'composerTrimJob', sourceFile: File, startSec: number, endSec: number, cropPx: { x: number, y: number, w: number, h: number } | null, intrinsicWidth: number, intrinsicHeight: number, posterUrl: string }) => void }} props
 * `intent` - `composer` returns a trim payload for background encode/upload; `detail` keeps synchronous encode and passes a `File`.
 */
export default function LoungeVideoCropModal({
  file,
  knownDurationSec,
  intent = 'composer',
  shellClassName = 'z-[105]',
  onCancel,
  onConfirm,
}) {
  const videoRef = useRef(null)
  /** Hidden clone: poster frame is captured here so the visible preview is never seek-snapped for posters. */
  const posterVideoRef = useRef(null)
  const videoStageRef = useRef(null)
  const trackRef = useRef(null)
  const cropListenersRef = useRef({ move: null, up: null })
  const cropRef = useRef(null)
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
  /** Separate blob URL for the hidden probe so WebKit decodes it independently of the main preview. */
  const [probeBlobUrl, setProbeBlobUrl] = useState('')
  const [intrinsicSize, setIntrinsicSize] = useState({ w: 0, h: 0 })
  const [cropAspectKey, setCropAspectKey] = useState('original')
  const [cropPx, setCropPx] = useState(null)
  const [layoutRev, bumpLayout] = useReducer((n) => n + 1, 0)
  const trimAbortRef = useRef(null)
  const trimBusyRef = useRef(false)
  const posterCapturedRef = useRef(false)
  const posterObjectUrlRef = useRef('')
  const posterSeekScheduledRef = useRef(false)
  /** Incremented when `file` changes so an in-flight poster scan cannot commit after swap. */
  const posterScanGenRef = useRef(0)

  useEffect(() => {
    clipRef.current = { start: clipStart, end: clipEnd }
  }, [clipStart, clipEnd])

  useEffect(() => {
    cropRef.current = cropPx
  }, [cropPx])

  useEffect(() => {
    durationRef.current = duration
  }, [duration])

  useEffect(() => {
    trimBusyRef.current = phase === 'trimming' || phase === 'capturing'
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

  /** Prevent the lounge feed (scroll + pull-to-refresh) from moving while this modal is open. */
  useEffect(() => {
    if (!file) return undefined
    const html = document.documentElement
    const prevHtml = html.style.overflow
    const prevBody = document.body.style.overflow
    html.style.overflow = 'hidden'
    document.body.style.overflow = 'hidden'
    return () => {
      html.style.overflow = prevHtml
      document.body.style.overflow = prevBody
    }
  }, [file])

  useEffect(() => {
    if (!file) return undefined
    posterScanGenRef.current += 1
    const u = URL.createObjectURL(file)
    const uProbe = URL.createObjectURL(file)
    urlRef.current = u
    setProbeBlobUrl(uProbe)
    setTrimErr('')
    posterCapturedRef.current = false
    posterSeekScheduledRef.current = false
    setPosterUrl('')
    if (posterObjectUrlRef.current) {
      try {
        URL.revokeObjectURL(posterObjectUrlRef.current)
      } catch {
        // ignore
      }
      posterObjectUrlRef.current = ''
    }
    setPhase('idle')
    setIntrinsicSize({ w: 0, h: 0 })
    setCropAspectKey('original')
    setCropPx(null)
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
      try {
        URL.revokeObjectURL(uProbe)
      } catch {
        // ignore
      }
      urlRef.current = ''
      setProbeBlobUrl('')
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

  useEffect(() => {
    const vw = intrinsicSize.w
    const vh = intrinsicSize.h
    if (cropAspectKey === 'original' || !(vw > 0) || !(vh > 0)) {
      setCropPx(null)
      return
    }
    const ar = CROP_ASPECT_PRESETS[cropAspectKey]
    if (typeof ar !== 'number') {
      setCropPx(null)
      return
    }
    setCropPx(maxCropRectForAspect(vw, vh, ar))
  }, [cropAspectKey, intrinsicSize.w, intrinsicSize.h])

  useEffect(() => {
    const el = videoStageRef.current
    if (!el) return undefined
    const ro = new ResizeObserver(() => bumpLayout())
    ro.observe(el)
    return () => ro.disconnect()
  }, [file])

  useEffect(() => {
    bumpLayout()
  }, [intrinsicSize.w, intrinsicSize.h])

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

  const cleanupCropDrag = useCallback(() => {
    const { move, up } = cropListenersRef.current
    if (move) window.removeEventListener('pointermove', move)
    if (up) {
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
    cropListenersRef.current = { move: null, up: null }
  }, [])

  const startCropPan = useCallback(
    (e) => {
      e.preventDefault()
      e.stopPropagation()
      const layout = getVideoStageLayout(videoRef.current, videoStageRef.current)
      const cur = cropRef.current
      if (!layout || !cur) return
      const startUx = e.clientX
      const startUy = e.clientY
      const startCx = cur.x
      const startCy = cur.y
      const { vw, vh, scale } = layout
      const move = (ev) => {
        if (ev.cancelable) ev.preventDefault()
        const c = cropRef.current
        if (!c) return
        const dx = (ev.clientX - startUx) / scale
        const dy = (ev.clientY - startUy) / scale
        const nx = Math.max(0, Math.min(startCx + dx, vw - c.w))
        const ny = Math.max(0, Math.min(startCy + dy, vh - c.h))
        setCropPx({ ...c, x: nx, y: ny })
      }
      const up = () => {
        cleanupCropDrag()
      }
      cropListenersRef.current = { move, up }
      window.addEventListener('pointermove', move, POINTER_MOVE_DRAG)
      window.addEventListener('pointerup', up)
      window.addEventListener('pointercancel', up)
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {
        // ignore
      }
    },
    [cleanupCropDrag],
  )

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
    const vw = v?.videoWidth
    const vh = v?.videoHeight
    if (Number.isFinite(vw) && Number.isFinite(vh) && vw > 0 && vh > 0) {
      setIntrinsicSize({ w: vw, h: vh })
    }
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

  const capturePosterFromVideo = useCallback((v) => {
    if (posterCapturedRef.current) return
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

  const scheduleProbePosterScan = useCallback(() => {
    if (posterCapturedRef.current || posterSeekScheduledRef.current) return
    const probe = posterVideoRef.current
    if (!probe || probe.readyState < 1 || probe.videoWidth < 2) return
    const dur = probe.duration
    if (!Number.isFinite(dur) || dur <= 0) return

    posterSeekScheduledRef.current = true
    const gen = posterScanGenRef.current

    void (async () => {
      try {
        let v = posterVideoRef.current
        if (!v || gen !== posterScanGenRef.current) return
        await primePosterFrameForCanvas(v)
        v = posterVideoRef.current
        if (!v || gen !== posterScanGenRef.current) return

        const maxT = Math.min(Math.max(0, dur - 0.02), POSTER_SCAN_MAX_T)
        let chosenT = Math.min(0.04, maxT)

        for (let i = 0; i < POSTER_SCAN_MAX_STEPS; i += 1) {
          if (gen !== posterScanGenRef.current) return
          const at = Math.min(i * POSTER_SCAN_STEP_SEC, maxT)
          await waitSeeked(v, at, POSTER_SEEK_WAIT_MS)
          v = posterVideoRef.current
          if (!v || gen !== posterScanGenRef.current) return
          await waitPaintTick(v)
          if (gen !== posterScanGenRef.current) return
          const sample = analyzeFrameBlackness(v)
          chosenT = Math.min(v.currentTime, maxT)
          if (!isNearlyBlack(sample)) {
            break
          }
        }

        if (gen !== posterScanGenRef.current) return
        v = posterVideoRef.current
        if (!v) return
        await waitSeeked(v, chosenT, POSTER_SEEK_WAIT_MS)
        await waitPaintTick(v)
        if (gen !== posterScanGenRef.current) return
        capturePosterFromVideo(posterVideoRef.current ?? v)
      } finally {
        posterSeekScheduledRef.current = false
      }
    })()
  }, [capturePosterFromVideo])

  const startLeftDrag = useCallback(
    (e) => {
      e.preventDefault()
      e.stopPropagation()
      const end0 = clipRef.current.end
      dragRef.current = { kind: 'left', end0 }
      let lastStartSec = clipRef.current.start
      const v0 = videoRef.current
      const resumePlay = Boolean(v0 && !v0.paused)
      seekPreviewMaybeResume(v0, lastStartSec, resumePlay)
      const move = (ev) => {
        if (ev.cancelable) ev.preventDefault()
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
      window.addEventListener('pointermove', move, POINTER_MOVE_DRAG)
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
      let lastEndSec = clipRef.current.end
      const v0 = videoRef.current
      const resumePlay = Boolean(v0 && !v0.paused)
      seekPreviewMaybeResume(v0, lastEndSec, resumePlay)
      const move = (ev) => {
        if (ev.cancelable) ev.preventDefault()
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
      window.addEventListener('pointermove', move, POINTER_MOVE_DRAG)
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
      let lastStartSec = s0
      const v0 = videoRef.current
      const resumePlay = Boolean(v0 && !v0.paused)
      seekPreviewMaybeResume(v0, lastStartSec, resumePlay)
      const move = (ev) => {
        if (ev.cancelable) ev.preventDefault()
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
      window.addEventListener('pointermove', move, POINTER_MOVE_DRAG)
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
    const { start, end } = clipRef.current

    if (intent === 'detail') {
      setPhase('trimming')
      const ac = new AbortController()
      trimAbortRef.current = ac
      try {
        const { trimVideoFileToMp4 } = await import('../../utils/loungeVideoFfmpegTrim')
        const v = videoRef.current
        const iw = Number(v?.videoWidth) || intrinsicSize.w
        const ih = Number(v?.videoHeight) || intrinsicSize.h
        const rawCrop = cropAspectKey !== 'original' ? cropRef.current : null
        const out = await trimVideoFileToMp4(file, start, end, {
          signal: ac.signal,
          crop: rawCrop && iw > 0 && ih > 0 ? rawCrop : null,
          intrinsicWidth: iw,
          intrinsicHeight: ih,
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
      return
    }

    setPhase('capturing')
    const v = videoRef.current
    try {
      if (!v || durationRef.current <= 0) {
        throw new Error('Video is not ready yet.')
      }
      const iw = Number(v.videoWidth) || intrinsicSize.w
      const ih = Number(v.videoHeight) || intrinsicSize.h
      if (!(iw > 1) || !(ih > 1)) {
        throw new Error('Could not read video dimensions.')
      }
      await waitSeeked(v, start, 1400)
      await waitPaintTick(v)
      await primePosterFrameForCanvas(v)

      const rawCrop = cropAspectKey !== 'original' ? cropRef.current : null
      const cropSan =
        rawCrop && iw > 0 && ih > 0 ? sanitizeVideoCropPx(iw, ih, rawCrop) : null

      const posterUrl = await new Promise((resolve, reject) => {
        try {
          const cnv = document.createElement('canvas')
          const ctx = cnv.getContext('2d')
          if (!ctx) {
            reject(new Error('Could not capture poster.'))
            return
          }
          if (cropSan) {
            const scale = cropSan.w > POSTER_MAX_WIDTH ? POSTER_MAX_WIDTH / cropSan.w : 1
            cnv.width = Math.round(cropSan.w * scale)
            cnv.height = Math.round(cropSan.h * scale)
            ctx.drawImage(v, cropSan.x, cropSan.y, cropSan.w, cropSan.h, 0, 0, cnv.width, cnv.height)
          } else {
            const w0 = v.videoWidth
            const h0 = v.videoHeight
            const scale = w0 > POSTER_MAX_WIDTH ? POSTER_MAX_WIDTH / w0 : 1
            cnv.width = Math.round(w0 * scale)
            cnv.height = Math.round(h0 * scale)
            ctx.drawImage(v, 0, 0, w0, h0, 0, 0, cnv.width, cnv.height)
          }
          cnv.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error('Could not capture poster.'))
                return
              }
              resolve(URL.createObjectURL(blob))
            },
            'image/jpeg',
            0.82,
          )
        } catch (err) {
          reject(err instanceof Error ? err : new Error(String(err)))
        }
      })

      onConfirm({
        type: 'composerTrimJob',
        sourceFile: file,
        startSec: start,
        endSec: end,
        cropPx: cropSan,
        intrinsicWidth: iw,
        intrinsicHeight: ih,
        posterUrl,
      })
      setPhase('idle')
    } catch (err) {
      setTrimErr(err instanceof Error ? err.message : 'Could not prepare clip.')
      setPhase('idle')
    }
  }, [file, onConfirm, cropAspectKey, intrinsicSize.w, intrinsicSize.h, intent])

  useEffect(
    () => () => {
      cleanupDrag()
      cleanupCropDrag()
    },
    [cleanupDrag, cleanupCropDrag],
  )

  if (!file) return null

  const pct = (t) => (duration > 0 ? (t / duration) * 100 : 0)
  const span = clipEnd - clipStart
  const busy = phase === 'trimming' || phase === 'capturing'
  void layoutRev
  const stageLayout = getVideoStageLayout(videoRef.current, videoStageRef.current)
  const cropPc = cropAspectKey !== 'original' ? cropOverlayPercents(stageLayout, cropPx) : null

  return createPortal(
    <div
      className={`fixed inset-0 ${shellClassName} flex items-end justify-center overscroll-none bg-black/55 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-10 backdrop-blur-[2px] sm:items-center sm:p-6`}
      role="dialog"
      aria-modal="true"
      aria-label="Trim and crop video"
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
        <h2 className="text-[17px] font-bold text-white">Trim &amp; crop (max {MAX_CLIP_SEC}s)</h2>
        <p className="mt-1 text-[13px] leading-snug text-zinc-400">
          Max length allowed is {MAX_CLIP_SEC} seconds. Press play to preview and trim with the timeline below. Playback stays inside your selection and loops at the end. Optional crop: pick an aspect, then drag the highlighted region to frame your shot.
        </p>

        <div ref={videoStageRef} className="relative mt-3 min-h-[min(40vh,220px)] overflow-hidden rounded-xl border border-zinc-700/80 bg-zinc-900">
          <video
            ref={videoRef}
            src={urlRef.current || undefined}
            poster={posterUrl || undefined}
            className="relative z-[1] max-h-[40vh] w-full object-contain"
            controls={!busy}
            playsInline
            preload="metadata"
            onLoadedMetadata={onMetaLoaded}
            onLoadedData={() => {
              onMetaLoaded()
            }}
            onDurationChange={onMetaLoaded}
          />
          <video
            ref={posterVideoRef}
            key={probeBlobUrl || 'probe'}
            src={probeBlobUrl || undefined}
            muted
            playsInline
            preload="auto"
            aria-hidden
            tabIndex={-1}
            className="pointer-events-none fixed left-[-9999px] top-0 z-0 h-16 w-16 overflow-hidden opacity-0"
            onLoadedData={scheduleProbePosterScan}
            onLoadedMetadata={() => {
              requestAnimationFrame(() => scheduleProbePosterScan())
            }}
            onCanPlay={scheduleProbePosterScan}
          />
          {cropPc ? (
            <div key={layoutRev} className="absolute inset-0 z-[5] select-none touch-none">
              <div
                className="pointer-events-none absolute inset-x-0 top-0 bg-black/60"
                style={{ height: `${cropPc.ct}%` }}
                aria-hidden
              />
              <div
                className="pointer-events-none absolute inset-x-0 bg-black/60"
                style={{ top: `${cropPc.ct + cropPc.ch}%`, bottom: 0 }}
                aria-hidden
              />
              <div
                className="pointer-events-none absolute left-0 bg-black/60"
                style={{ top: `${cropPc.ct}%`, width: `${cropPc.cl}%`, height: `${cropPc.ch}%` }}
                aria-hidden
              />
              <div
                className="pointer-events-none absolute right-0 bg-black/60"
                style={{ top: `${cropPc.ct}%`, left: `${cropPc.cl + cropPc.cw}%`, height: `${cropPc.ch}%` }}
                aria-hidden
              />
              <button
                type="button"
                aria-label="Drag to move crop region"
                className="pointer-events-auto absolute cursor-move touch-none border-2 border-cyan-400 bg-transparent"
                style={{
                  left: `${cropPc.cl}%`,
                  top: `${cropPc.ct}%`,
                  width: `${cropPc.cw}%`,
                  height: `${cropPc.ch}%`,
                }}
                onPointerDown={startCropPan}
              />
            </div>
          ) : null}
        </div>

        {intrinsicSize.w > 0 ? (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-[12px] text-zinc-500">Crop</span>
            {CROP_PRESET_ROWS.map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={cropAspectKey === key}
                onClick={() => setCropAspectKey(key)}
                className={`rounded-lg px-2.5 py-1 text-[12px] font-semibold touch-manipulation ${
                  cropAspectKey === key
                    ? 'bg-cyan-600 text-white'
                    : 'border border-zinc-600 bg-zinc-900 text-zinc-300 hover:bg-zinc-800'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        ) : null}

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
            {busy ? (intent === 'detail' ? 'Trimming…' : 'Preparing…') : 'Use this clip'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
