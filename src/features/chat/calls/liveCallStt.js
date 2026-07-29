/**
 * Browser Deepgram live listen for one local mic track (voice-call transcripts).
 * Uses a short-lived grant JWT from Edge; never embeds DEEPGRAM_API_KEY in the client.
 */

const DG_LISTEN_URL = 'wss://api.deepgram.com/v1/listen'
const KEEP_ALIVE_MS = 8_000
const TARGET_RATE = 16_000

/**
 * @param {Float32Array} input
 * @param {number} inputRate
 * @returns {Int16Array}
 */
function downsampleToPcm16(input, inputRate) {
  if (!input?.length) return new Int16Array(0)
  if (inputRate === TARGET_RATE) {
    const out = new Int16Array(input.length)
    for (let i = 0; i < input.length; i += 1) {
      const s = Math.max(-1, Math.min(1, input[i]))
      out[i] = s < 0 ? s * 0x8000 : s * 0x7fff
    }
    return out
  }
  const ratio = inputRate / TARGET_RATE
  const newLen = Math.max(0, Math.floor(input.length / ratio))
  const out = new Int16Array(newLen)
  for (let i = 0; i < newLen; i += 1) {
    const s = Math.max(-1, Math.min(1, input[Math.floor(i * ratio)] || 0))
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return out
}

/**
 * @param {{
 *   getAccessToken: () => Promise<string>,
 *   getMediaStreamTrack: () => MediaStreamTrack | null | undefined,
 *   onFinalUtterance: (u: { id: string, start_ms: number, end_ms: number, text: string }) => void,
 *   onError?: (msg: string) => void,
 * }} opts
 */
export function createLiveCallSttSession(opts) {
  const { getAccessToken, getMediaStreamTrack, onFinalUtterance, onError } = opts

  let closed = false
  /** @type {WebSocket | null} */
  let ws = null
  /** @type {AudioContext | null} */
  let audioCtx = null
  /** @type {ScriptProcessorNode | null} */
  let processor = null
  /** @type {MediaStreamAudioSourceNode | null} */
  let source = null
  /** @type {MediaStreamAudioDestinationNode | null} */
  let silentDest = null
  /** @type {HTMLAudioElement | null} */
  let pullEl = null
  /** @type {ReturnType<typeof setInterval> | null} */
  let keepAliveTimer = null
  /** @type {MediaStreamTrack | null} */
  let boundTrack = null
  let utteranceSeq = 0

  function clearPipeline() {
    try {
      processor?.disconnect()
    } catch {
      /* ignore */
    }
    try {
      source?.disconnect()
    } catch {
      /* ignore */
    }
    try {
      silentDest?.disconnect()
    } catch {
      /* ignore */
    }
    if (pullEl) {
      try {
        pullEl.pause()
        pullEl.srcObject = null
        pullEl.remove()
      } catch {
        /* ignore */
      }
      pullEl = null
    }
    processor = null
    source = null
    silentDest = null
    if (audioCtx) {
      void audioCtx.close().catch(() => {})
      audioCtx = null
    }
    boundTrack = null
  }

  function stopKeepAlive() {
    if (keepAliveTimer != null) {
      clearInterval(keepAliveTimer)
      keepAliveTimer = null
    }
  }

  function startKeepAlive() {
    stopKeepAlive()
    keepAliveTimer = setInterval(() => {
      if (ws?.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify({ type: 'KeepAlive' }))
        } catch {
          /* ignore */
        }
      }
    }, KEEP_ALIVE_MS)
  }

  function attachTrack(track) {
    if (!track || closed || ws?.readyState !== WebSocket.OPEN) return
    if (boundTrack === track && processor) return
    clearPipeline()
    boundTrack = track

    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) {
      onError?.('AudioContext unavailable for live transcript.')
      return
    }
    audioCtx = new AC()
    const inputRate = audioCtx.sampleRate || 48_000
    const stream = new MediaStream([track])
    source = audioCtx.createMediaStreamSource(stream)
    // ScriptProcessor is deprecated but avoids a separate worklet asset for v1.
    processor = audioCtx.createScriptProcessor(4096, 1, 1)
    // Never connect to audioCtx.destination... that fights iPhone call playback
    // and can thrash the OS audio session. MediaStreamDestination keeps the
    // processor graph alive without speaker output.
    silentDest = audioCtx.createMediaStreamDestination()

    processor.onaudioprocess = (event) => {
      if (closed || ws?.readyState !== WebSocket.OPEN) return
      if (track.muted || track.enabled === false || track.readyState !== 'live') return
      const input = event.inputBuffer.getChannelData(0)
      const pcm = downsampleToPcm16(input, inputRate)
      if (!pcm.length) return
      try {
        ws.send(pcm.buffer)
      } catch {
        /* ignore */
      }
    }

    source.connect(processor)
    processor.connect(silentDest)
    // Keep the processor graph alive without audible output:
    // 1) muted <audio> pulling MediaStreamDestination
    // 2) zero-gain tap to destination (Chrome often needs a destination path)
    try {
      pullEl = new Audio()
      pullEl.muted = true
      pullEl.volume = 0
      pullEl.playsInline = true
      pullEl.setAttribute('playsinline', 'true')
      pullEl.srcObject = silentDest.stream
      void pullEl.play().catch(() => {})
    } catch {
      pullEl = null
    }
    try {
      const gain = audioCtx.createGain()
      gain.gain.value = 0
      processor.connect(gain)
      gain.connect(audioCtx.destination)
    } catch {
      /* ignore */
    }
    if (audioCtx.state === 'suspended') {
      void audioCtx.resume().catch(() => {})
    }
  }

  function handleMessage(raw) {
    let msg
    try {
      msg = JSON.parse(String(raw || ''))
    } catch {
      return
    }
    if (!msg || msg.type !== 'Results') return
    const alt = msg.channel?.alternatives?.[0]
    const text = String(alt?.transcript || '').trim()
    if (!text) return
    const isFinal = Boolean(msg.is_final || msg.speech_final)
    if (!isFinal) return

    const startSec = Number(msg.start)
    const durationSec = Number(msg.duration)
    const startMs = Number.isFinite(startSec) ? Math.max(0, Math.round(startSec * 1000)) : 0
    const endMs = Number.isFinite(durationSec)
      ? Math.max(startMs, Math.round((startSec + durationSec) * 1000))
      : startMs
    utteranceSeq += 1
    onFinalUtterance?.({
      id: `live:${startMs}:${endMs}:${utteranceSeq}`,
      start_ms: startMs,
      end_ms: endMs,
      text,
    })
  }

  async function connect() {
    if (closed) return
    const token = String((await getAccessToken()) || '').trim()
    if (!token) throw new Error('Missing live STT token.')

    const params = new URLSearchParams({
      model: 'nova-3',
      smart_format: 'true',
      punctuate: 'true',
      interim_results: 'true',
      encoding: 'linear16',
      sample_rate: String(TARGET_RATE),
      channels: '1',
    })

    await new Promise((resolve, reject) => {
      let settled = false
      // Deepgram browser auth: two subprotocols. Temporary JWTs use lowercase
      // `bearer` (SDK 4.5+); API keys use `token`. See deepgram-js-sdk #392.
      const socket = new WebSocket(`${DG_LISTEN_URL}?${params.toString()}`, ['bearer', token])
      ws = socket
      socket.binaryType = 'arraybuffer'

      const fail = (err) => {
        if (settled) return
        settled = true
        reject(err instanceof Error ? err : new Error(String(err || 'Deepgram WS failed')))
      }

      socket.onopen = () => {
        if (settled) return
        settled = true
        startKeepAlive()
        attachTrack(getMediaStreamTrack?.() || null)
        resolve(undefined)
      }
      socket.onerror = () => fail(new Error('Deepgram live socket error'))
      socket.onclose = () => {
        stopKeepAlive()
        if (!settled) fail(new Error('Deepgram live socket closed before open'))
      }
      socket.onmessage = (event) => handleMessage(event.data)
    })
  }

  function syncTrack() {
    if (closed || ws?.readyState !== WebSocket.OPEN) return
    attachTrack(getMediaStreamTrack?.() || null)
  }

  async function stop() {
    closed = true
    stopKeepAlive()
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({ type: 'CloseStream' }))
      } catch {
        /* ignore */
      }
      try {
        ws.close()
      } catch {
        /* ignore */
      }
    }
    ws = null
    clearPipeline()
  }

  return {
    connect,
    syncTrack,
    stop,
  }
}
