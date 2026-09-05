/**
 * Minimal LiveKit RoomComposite template (no React).
 * Layout `edge` (or anything without focus:<id>): screen share or first camera large, rest PiPs + brand.
 * Optional later: layout=focus:<userId> pins that identity as main.
 *
 * Log START_RECORDING only after a camera attaches (or an 8s failsafe).
 * A <head> log used to start the MP4 on the empty waiting chrome.
 */
import EgressHelperMod from '@livekit/egress-sdk'
import { Room, RoomEvent, Track } from 'livekit-client'
import {
  MAX_CALL_VIDEO_STREAMS,
  packInsetRows,
  rowPipSlots,
  ROW_PIP_WIDE_AT,
} from '../features/chat/calls/callVideoLayout.js'

const EgressHelper = EgressHelperMod?.default ?? EgressHelperMod

function qp(name) {
  try {
    return new URLSearchParams(window.location.search).get(name) || ''
  } catch {
    return ''
  }
}

function parseFeatured(layout) {
  const raw = String(layout || '').trim()
  if (raw.startsWith('focus:')) return raw.slice('focus:'.length).trim() || null
  return null
}

function showStatus(msg) {
  const waiting = document.getElementById('waiting')
  if (!waiting) return
  waiting.textContent = String(msg || '')
  waiting.style.display = 'grid'
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
  let featured = null
  if (want) {
    featured =
      pubs.find((x) => x.identity === want && x.source === Track.Source.ScreenShare) ||
      pubs.find((x) => x.identity === want && x.source === Track.Source.Camera) ||
      null
  }
  if (!featured) {
    featured =
      pubs.find((x) => x.source === Track.Source.ScreenShare) || pubs[0] || null
  }
  const others = pubs
    .filter((x) => {
      if (x === featured) return false
      // Keep pinned identity out of PiPs even if their main track is briefly missing.
      if (want && x.identity === want) return false
      return true
    })
    .slice(0, Math.max(0, MAX_CALL_VIDEO_STREAMS - 1))

  if (featured) {
    featured.track.attach(mainEl)
    waiting.style.display = 'none'
    mainEl.style.display = 'block'
  } else {
    waiting.style.display = 'grid'
    mainEl.style.display = 'none'
  }

  const total = (featured ? 1 : 0) + others.length
  const slots = rowPipSlots(total)
  const rows = packInsetRows(
    others.map((_, i) => String(i)),
    slots,
    { fillBottom: total >= ROW_PIP_WIDE_AT },
  )

  pipEl.innerHTML = ''
  for (const row of rows) {
    const rowEl = document.createElement('div')
    rowEl.className = 'pip-row'
    for (const key of row) {
      const o = others[Number(key)]
      if (!o) continue
      const wrap = document.createElement('div')
      wrap.className = 'pip-tile'
      const v = document.createElement('video')
      v.autoplay = true
      v.playsInline = true
      v.muted = true
      o.track.attach(v)
      wrap.appendChild(v)
      rowEl.appendChild(wrap)
    }
    pipEl.appendChild(rowEl)
  }

  attachRemoteAudio(room)
}

function signalStart(reason) {
  try {
    EgressHelper.startRecording()
  } catch {
    console.log('START_RECORDING')
  }
  console.log('edge_egress_started', reason || '')
}

async function main() {
  ensureDom()

  // Prefer raw query params — EgressHelper.getLiveKitURL() throws if missing, which
  // previously produced a blank "Template error" frame with only the logo.
  const url = qp('url') || (() => {
    try {
      return EgressHelper.getLiveKitURL()
    } catch {
      return ''
    }
  })()
  const token = qp('token') || (() => {
    try {
      return EgressHelper.getAccessToken()
    } catch {
      return ''
    }
  })()
  let featuredId = parseFeatured(qp('layout') || (() => {
    try {
      return EgressHelper.getLayout()
    } catch {
      return ''
    }
  })())

  if (!url || !token) {
    showStatus(`Missing url/token (qs=${window.location.search.length})`)
    signalStart('missing_params')
    return
  }

  const room = new Room({
    adaptiveStream: false,
    dynacast: false,
  })

  let started = false
  const start = (reason) => {
    if (started) return
    started = true
    signalStart(reason)
  }

  const refresh = () => {
    try {
      render(room, featuredId)
    } catch (err) {
      console.error('render', err)
    }
  }

  const startIfVideo = (reason) => {
    if (videoPubs(room).length === 0) return
    start(reason)
  }

  room.on(RoomEvent.TrackSubscribed, (track) => {
    refresh()
    if (track?.kind === Track.Kind.Video) startIfVideo('video_subscribed')
  })
  room.on(RoomEvent.TrackUnsubscribed, refresh)
  room.on(RoomEvent.TrackMuted, refresh)
  room.on(RoomEvent.TrackUnmuted, refresh)
  room.on(RoomEvent.ParticipantConnected, refresh)
  room.on(RoomEvent.ParticipantDisconnected, refresh)
  room.on(RoomEvent.Connected, () => {
    refresh()
    startIfVideo('connected_has_video')
  })

  try {
    // LiveKit may push layout=speaker via recorder metadata. Keep focus:<id> locked.
    EgressHelper.onLayoutChanged((next) => {
      const nextId = parseFeatured(next)
      if (nextId) {
        featuredId = nextId
        refresh()
      }
    })
  } catch (err) {
    console.warn('onLayoutChanged', err)
  }

  window.setTimeout(() => {
    if (videoPubs(room).length > 0) start('failsafe_video')
    else start('failsafe_empty')
  }, 8000)

  await room.connect(url, token)

  // setRoom after connect — SDK reads localParticipant metadata / disconnect hooks.
  try {
    EgressHelper.setRoom(room)
  } catch (err) {
    console.warn('setRoom', err)
  }

  refresh()
  startIfVideo('existing_video')
}

main().catch((err) => {
  console.error(err)
  const msg = err?.message || String(err || 'template error')
  showStatus(`${msg} (qs=${window.location.search.length})`)
  signalStart('main_catch')
})
