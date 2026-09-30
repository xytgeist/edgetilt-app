/**
 * "Action → Ops" bookmarklet. Ryan clicks it on actionnetwork.com while signed in to PRO:
 * it reads the NFL + CFB public betting boards in his own browser session, opens the Ops
 * desk (Splits tab), and hands the raw games over with postMessage. Ops maps + reviews + saves.
 * Replaces the home-PC pull after Action's WAF blocked it (2026-09-29). No WAF evasion.
 */

export const ACTION_CAPTURE_QUERY_PARAM = 'action_capture'
export const ACTION_CAPTURE_MSG = {
  ready: 'edgetilt:action-capture-ready',
  payload: 'edgetilt:action-capture',
  ack: 'edgetilt:action-capture-ack',
}
export const ACTION_NETWORK_ORIGIN = 'https://www.actionnetwork.com'
export const ACTION_NETWORK_ORIGIN_RE = /^https:\/\/([a-z0-9-]+\.)*actionnetwork\.com$/i

export function isActionCaptureLaunch() {
  if (typeof window === 'undefined') return false
  return new URLSearchParams(window.location.search).get(ACTION_CAPTURE_QUERY_PARAM) === '1'
}

export function actionCaptureOpsUrl() {
  const { origin, pathname } = window.location
  return `${origin}${pathname}?${ACTION_CAPTURE_QUERY_PARAM}=1`
}

/** Runs on actionnetwork.com. Keep ES2017 + self-contained (no imports survive into a bookmark). */
function bookmarkletBody(OPS_URL, OPS_ORIGIN, MSG) {
  if (!/(^|\.)actionnetwork\.com$/.test(location.hostname)) {
    alert('Open actionnetwork.com (signed in to PRO), then click this bookmark.')
    return
  }
  var w = window.open(OPS_URL, 'edgetilt_action_capture')
  if (!w) {
    alert('Popup blocked. Allow popups for actionnetwork.com, then click again.')
    return
  }
  var box = document.createElement('div')
  box.style.cssText =
    'position:fixed;z-index:2147483647;right:16px;bottom:16px;padding:10px 14px;border-radius:10px;' +
    'background:#111;color:#fbbf24;font:600 13px system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.5)'
  box.textContent = 'EdgeTilt: reading Action boards...'
  document.body.appendChild(box)

  function fromPage(sport) {
    return fetch('/' + sport + '/public-betting', { credentials: 'include' })
      .then(function (r) { return r.text() })
      .then(function (html) {
        var el = new DOMParser().parseFromString(html, 'text/html').getElementById('__NEXT_DATA__')
        var j = el ? JSON.parse(el.textContent) : null
        var g = j && j.props && j.props.pageProps && j.props.pageProps.scoreboardResponse
          ? j.props.pageProps.scoreboardResponse.games
          : null
        return { games: Array.isArray(g) ? g : [], via: 'page' }
      })
  }
  function grab(sport) {
    return fetch('https://api.actionnetwork.com/web/v2/scoreboard/publicbetting/' + sport)
      .then(function (r) {
        if (!r.ok) throw new Error('api ' + r.status)
        return r.json()
      })
      .then(function (j) {
        if (!j || !Array.isArray(j.games) || !j.games.length) throw new Error('api empty')
        return { games: j.games, via: 'api' }
      })
      .catch(function () { return fromPage(sport) })
      .catch(function (e) { return { games: [], via: 'error', error: String((e && e.message) || e) } })
  }

  var payload = null
  function send() {
    if (payload && w && !w.closed) w.postMessage(payload, OPS_ORIGIN)
  }
  window.addEventListener('message', function (ev) {
    if (ev.origin !== OPS_ORIGIN || !ev.data) return
    if (ev.data.type === MSG.ready) send()
    if (ev.data.type === MSG.ack) {
      box.textContent = 'EdgeTilt: sent to Ops. Review + Save there.'
      setTimeout(function () { box.remove() }, 5000)
    }
  })
  Promise.all([grab('nfl'), grab('ncaaf')]).then(function (res) {
    payload = {
      type: MSG.payload,
      capturedAt: new Date().toISOString(),
      boards: { nfl: res[0], ncaaf: res[1] },
    }
    box.textContent =
      'EdgeTilt: ' + res[0].games.length + ' NFL + ' + res[1].games.length + ' CFB games. Sending to Ops...'
    send()
  })
}

/** `javascript:` URL for the draggable bookmark (bound to the Ops origin it was dragged from). */
export function buildActionCaptureBookmarklet() {
  const opsUrl = actionCaptureOpsUrl()
  const src =
    `(${bookmarkletBody.toString()})(` +
    `${JSON.stringify(opsUrl)},${JSON.stringify(window.location.origin)},${JSON.stringify(ACTION_CAPTURE_MSG)})`
  return `javascript:${encodeURIComponent(src)}`
}
