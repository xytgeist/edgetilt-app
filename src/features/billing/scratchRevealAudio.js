/**
 * Scratch noise while rubbing — starts only after confirmed pointer movement.
 */
export class ScratchRevealAudio {
  constructor() {
    /** @type {AudioContext | null} */
    this.ctx = null
    /** @type {AudioBufferSourceNode | null} */
    this.source = null
    /** @type {GainNode | null} */
    this.gain = null
    this.playing = false
  }

  ensureContext() {
    if (typeof window === 'undefined') return null
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext
      if (!Ctx) return null
      this.ctx = new Ctx()
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume()
    }
    return this.ctx
  }

  start() {
    if (this.playing) return
    const ctx = this.ensureContext()
    if (!ctx) return

    const bufferSize = ctx.sampleRate * 0.15
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    let last = 0
    for (let i = 0; i < bufferSize; i += 1) {
      const white = Math.random() * 2 - 1
      last = (last + 0.02 * white) / 1.02
      data[i] = last * 3.5
    }

    this.source = ctx.createBufferSource()
    this.source.buffer = buffer
    this.source.loop = true

    this.gain = ctx.createGain()
    this.gain.gain.value = 0.08

    this.source.connect(this.gain)
    this.gain.connect(ctx.destination)
    this.source.start(0)
    this.playing = true
  }

  stop() {
    if (!this.playing) return
    try {
      this.source?.stop()
    } catch {
      // ignore
    }
    this.source?.disconnect()
    this.gain?.disconnect()
    this.source = null
    this.gain = null
    this.playing = false
  }

  dispose() {
    this.stop()
    void this.ctx?.close()
    this.ctx = null
  }
}
