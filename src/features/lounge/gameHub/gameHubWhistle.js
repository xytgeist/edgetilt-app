/**
 * Referee pea-whistle blast for the Game Hub (kickoff / start of the 2nd half), synthesized with
 * Web Audio so there is no sample to ship. iOS / Safari only start an AudioContext inside a user
 * gesture, so the first tap after this module loads unlocks a shared context.
 */

/** @type {AudioContext | null} */
let sharedCtx = null
let armed = false

const MUTE_KEY = 'edgetilt:gameHubWhistleMuted'

export function isGameHubWhistleMuted() {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(MUTE_KEY) === '1'
  } catch {
    return false
  }
}

export function setGameHubWhistleMuted(muted) {
  try {
    if (muted) localStorage.setItem(MUTE_KEY, '1')
    else localStorage.removeItem(MUTE_KEY)
  } catch {
    /* private mode */
  }
}

function getCtx() {
  if (typeof window === 'undefined') return null
  if (!sharedCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return null
    try {
      sharedCtx = new Ctx()
    } catch {
      return null
    }
  }
  return sharedCtx
}

function unlockFromGesture() {
  const ctx = getCtx()
  if (!ctx) return
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {})
  try {
    const src = ctx.createBufferSource()
    src.buffer = ctx.createBuffer(1, 1, 22050)
    src.connect(ctx.destination)
    src.start(0)
  } catch {
    /* ignore */
  }
  window.removeEventListener('pointerdown', unlockFromGesture, true)
  window.removeEventListener('touchend', unlockFromGesture, true)
  window.removeEventListener('keydown', unlockFromGesture, true)
}

/** Listen for the next tap / key so a later whistle can play. Safe to call repeatedly. */
export function armGameHubWhistle() {
  if (armed || typeof window === 'undefined') return
  armed = true
  window.addEventListener('pointerdown', unlockFromGesture, true)
  window.addEventListener('touchend', unlockFromGesture, true)
  window.addEventListener('keydown', unlockFromGesture, true)
}

/** One long referee blast (~0.9s). No-op when muted, hidden, or audio is locked. */
export function playGameHubWhistle({ force = false } = {}) {
  if (!force && isGameHubWhistleMuted()) return
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
  const ctx = getCtx()
  if (!ctx) return
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {})
  try {
    const t0 = ctx.currentTime + 0.03
    const dur = 0.9
    const end = t0 + dur

    const out = ctx.createGain()
    out.gain.setValueAtTime(0.0001, t0)
    out.gain.exponentialRampToValueAtTime(0.22, t0 + 0.025)
    out.gain.setValueAtTime(0.22, end - 0.1)
    out.gain.exponentialRampToValueAtTime(0.0001, end)
    out.connect(ctx.destination)

    // Pea rattle: fast amplitude warble on top of the envelope.
    const trill = ctx.createGain()
    trill.gain.value = 0.7
    trill.connect(out)
    const ampLfo = ctx.createOscillator()
    ampLfo.frequency.value = 27
    const ampDepth = ctx.createGain()
    ampDepth.gain.value = 0.3
    ampLfo.connect(ampDepth)
    ampDepth.connect(trill.gain)

    // Tone: ~3 kHz with a quick upward scoop, FM-wobbled by the pea.
    const tone = ctx.createOscillator()
    tone.type = 'sine'
    tone.frequency.setValueAtTime(2750, t0)
    tone.frequency.exponentialRampToValueAtTime(3100, t0 + 0.06)
    tone.frequency.setValueAtTime(3100, end - 0.15)
    tone.frequency.exponentialRampToValueAtTime(2900, end)
    const fmLfo = ctx.createOscillator()
    fmLfo.frequency.value = 27
    const fmDepth = ctx.createGain()
    fmDepth.gain.value = 170
    fmLfo.connect(fmDepth)
    fmDepth.connect(tone.frequency)
    tone.connect(trill)

    const overtone = ctx.createOscillator()
    overtone.type = 'sine'
    overtone.frequency.setValueAtTime(5500, t0)
    overtone.frequency.exponentialRampToValueAtTime(6200, t0 + 0.06)
    const overtoneGain = ctx.createGain()
    overtoneGain.gain.value = 0.12
    fmDepth.connect(overtone.frequency)
    overtone.connect(overtoneGain)
    overtoneGain.connect(trill)

    // Breath: band-passed noise under the tone.
    const noiseBuf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * (dur + 0.05)), ctx.sampleRate)
    const data = noiseBuf.getChannelData(0)
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1
    const noise = ctx.createBufferSource()
    noise.buffer = noiseBuf
    const band = ctx.createBiquadFilter()
    band.type = 'bandpass'
    band.frequency.value = 3000
    band.Q.value = 1.4
    const noiseGain = ctx.createGain()
    noiseGain.gain.value = 0.18
    noise.connect(band)
    band.connect(noiseGain)
    noiseGain.connect(out)

    const nodes = [ampLfo, fmLfo, tone, overtone, noise]
    for (const n of nodes) {
      n.start(t0)
      n.stop(end + 0.05)
    }
    tone.onended = () => {
      try {
        out.disconnect()
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* unsupported / locked */
  }
}
