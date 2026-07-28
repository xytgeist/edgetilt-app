/**
 * Minimal LiveKit RoomComposite template (no React).
 * Featured identity from layout=focus:<userId>; others as bottom PiPs.
 * Fires START_RECORDING early — LiveKit Chrome aborts with no MP4 if it never sees that signal.
 */
import EgressHelper from '@livekit/egress-sdk'
import { ConnectionState, Room, RoomEvent, Track } from 'livekit-client'

function parseFeatured(layout) {
  const raw = String(layout || '').trim()
  if (raw.startsWith('focus:')) return raw.slice('focus:'.length).trim() || null
  return null
}

function ensureDom() {
  let app = document.getElementById('app')
  if (!app) {
    app = document.createElement('div')
    app.id = 'app'
    document.body.appendChild(app)
  }
  app.innerHTML = `
    <div class="main">
      <video id="mainVideo" autoplay playsinline muted></video>
      <div class="waiting" id="waiting">Waiting for video…</div>
      <div class="brand"><img id="logo" alt="" /></div>
      <div class="pip" id="pip"></div>
      <div id="audioRoot" style="display:none"></div>
    </div>
  `
  const logo = /** @type {HTMLImageElement} */ (document.getElementById('logo'))
  logo.src = new URL('edge-lounge-logo-transparent.png', window.location.href).href
  return app
}

function videoPubs(room) {
  /** @type {{ identity: string, track: import('livekit-client').VideoTrack, source: Track.Source }[]} */
  const out = []
  for (const p of room.remoteParticipants.values()) {
    for (const pub of p.trackPublications.values()) {
      if (pub.kind !== Track.Kind.Video || !pub.track || !pub.isSubscribed) continue
      out.push({
        identity: p.identity,
        track: /** @type {import('livekit-client').VideoTrack} */ (pub.track),
        source: pub.source,
      })
    }
  }
  return out
}

function attachRemoteAudio(room) {
  const root = document.getElementById('audioRoot')
  if (!root) return
  root.innerHTML = ''
  for (const p of room.remoteParticipants.values()) {
    for (const pub of p.trackPublications.values()) {
      if (pub.kind !== Track.Kind.Audio || !pub.track || !pub.isSubscribed) continue
      const el = pub.track.attach()
      el.autoplay = true
      root.appendChild(el)
    }
  }
}

function render(room, featuredId) {
  const mainEl = /** @type {HTMLVideoElement} */ (document.getElementById('mainVideo'))
  const pipEl = document.getElementById('pip')
  const waiting = document.getElementById('waiting')
  if (!mainEl || !pipEl || !waiting) return

  const pubs = videoPubs(room)
  const want = String(featuredId || '').trim()
  const screen = want
    ? pubs.find((x) => x.identity === want && x.source === Track.Source.ScreenShare)
    : null
  const cam = want
    ? pubs.find((x) => x.identity === want && x.source === Track.Source.Camera)
    : null
  const featured = screen || cam || pubs[0] || null
  const others = pubs.filter((x) => x !== featured).slice(0, 6)

  if (featured) {
    featured.track.attach(mainEl)
    waiting.style.display = 'none'
    mainEl.style.display = 'block'
  } else {
    waiting.style.display = 'grid'
    mainEl.style.display = 'none'
  }

  pipEl.innerHTML = ''
  for (const o of others) {
    const wrap = document.createElement('div')
    wrap.className = 'pip-tile'
    const v = document.createElement('video')
    v.autoplay = true
    v.playsInline = true
    v.muted = true
    o.track.attach(v)
    wrap.appendChild(v)
    pipEl.appendChild(wrap)
  }

  attachRemoteAudio(room)
}

async function main() {
  ensureDom()
  const url = EgressHelper.getLiveKitURL()
  const token = EgressHelper.getAccessToken()
  let featuredId = parseFeatured(EgressHelper.getLayout())
  if (!url || !token) {
    document.body.innerHTML = '<div class="waiting">Missing LiveKit egress url/token.</div>'
    // Still signal so LiveKit does not hang forever on a dead page.
    try {
      EgressHelper.startRecording()
    } catch {
      console.log('START_RECORDING')
    }
    return
  }

  const room = new Room({
    adaptiveStream: false,
    dynacast: false,
    // Egress is subscribe-only; keep WebRTC simple for headless Chrome.
  })
  EgressHelper.setRoom(room)

  let started = false
  const start = (reason) => {
    if (started) return
    started = true
    try {
      EgressHelper.startRecording()
    } catch {
      console.log('START_RECORDING')
    }
    console.log('edge_egress_started', reason || '')
  }

  const refresh = () => render(room, featuredId)
  room.on(RoomEvent.TrackSubscribed, () => {
    refresh()
    start('track_subscribed')
  })
  room.on(RoomEvent.TrackUnsubscribed, refresh)
  room.on(RoomEvent.TrackMuted, refresh)
  room.on(RoomEvent.TrackUnmuted, refresh)
  room.on(RoomEvent.ParticipantConnected, refresh)
  room.on(RoomEvent.ParticipantDisconnected, refresh)
  room.on(RoomEvent.Connected, () => {
    refresh()
    window.setTimeout(() => start('connected'), 300)
  })

  EgressHelper.onLayoutChanged((next) => {
    featuredId = parseFeatured(next)
    refresh()
  })

  // Absolute failsafe — never leave AwaitStartSignal hanging.
  window.setTimeout(() => start('failsafe'), 2000)

  try {
    await room.connect(url, token)
    refresh()
    // If remote pubs already exist, start immediately (matches LiveKit default template).
    for (const p of room.remoteParticipants.values()) {
      if (p.trackPublications.size > 0) {
        start('existing_pubs')
        break
      }
    }
  } catch (err) {
    console.error(err)
    document.body.innerHTML = `<div class="waiting">${String(err?.message || err || 'connect failed')}</div>`
    start('connect_error')
  }
}

main().catch((err) => {
  console.error(err)
  document.body.textContent = String(err?.message || err || 'egress template error')
  try {
    EgressHelper.startRecording()
  } catch {
    console.log('START_RECORDING')
  }
})
