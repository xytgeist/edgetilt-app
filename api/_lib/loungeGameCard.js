/**
 * Game link previews: data + labels + satori tree shared by `/api/lounge-game-og` (HTML meta) and
 * `/api/lounge-game-og-image` (1200x630 PNG). Data comes from the public Edge `lounge-game-card`.
 */
import {
  enrichLoungeSportsGame,
  nflPillWashLikelyTreatment,
  resolveNflPillWashes,
} from '../../src/features/lounge/loungeSportsMatch.js'

export const GAME_ID_RE = /^[A-Za-z0-9_-]{6,80}$/

export function requestOrigin(req) {
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim()
  const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim()
  return host ? `${proto}://${host}` : ''
}

export function queryParam(req, name) {
  const direct = typeof req.query?.[name] === 'string' ? req.query[name] : ''
  if (direct) return decodeURIComponent(direct).trim()
  try {
    return String(new URL(req.url, 'http://localhost').searchParams.get(name) || '').trim()
  } catch {
    return ''
  }
}

/** Game card from the public Edge function, enriched with catalog colors + local logos (same as the app). */
export async function fetchGameCard(eventId) {
  const supabaseUrl = String(process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
  const anonKey = String(process.env.VITE_SUPABASE_ANON_KEY || '').trim()
  if (!supabaseUrl || !anonKey || !GAME_ID_RE.test(eventId)) return null
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/lounge-game-card?event_id=${encodeURIComponent(eventId)}`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, Accept: 'application/json' },
    })
    if (!res.ok) return null
    const data = await res.json()
    return data?.ok && data.game ? enrichLoungeSportsGame(data.game) : null
  } catch {
    return null
  }
}

function ordinal(n) {
  const v = Number(n)
  if (!Number.isFinite(v) || v <= 0) return ''
  if (v > 4) return v === 5 ? 'OT' : `${v - 4}OT`
  return ['1st', '2nd', '3rd', '4th'][v - 1]
}

/** "Sun 4:25 PM ET" … posts and previews use Eastern. */
export function kickoffLabelEt(iso) {
  const t = Date.parse(String(iso || ''))
  if (!Number.isFinite(t)) return ''
  const d = new Date(t)
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short' }).format(d)
  const time = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: '2-digit',
  }).format(d)
  return `${weekday} ${time.replace(':00 ', ' ')} ET`
}

/** Scoreboard status in the app's voice: "3rd 10:33", "Halftime", "Final", "Sun 4:25 PM ET". */
export function gameStatusLabel(game) {
  if (!game) return ''
  if (game.status === 'pre') return kickoffLabelEt(game.commence_time) || 'Upcoming'
  const label = String(game.status_label || '').trim()
  if (game.status === 'post') return /ot/i.test(label) ? 'Final/OT' : 'Final'
  const detail = String(game.live?.status_detail || '').trim()
  if (/halftime/i.test(label) || /halftime/i.test(detail) || /HALFTIME/i.test(String(game.live?.status_name || ''))) {
    return 'Halftime'
  }
  if (/^end of/i.test(detail)) return detail.replace(/\s+quarter$/i, '')
  const q = /^Q(\d)\s+(\d{1,2}:\d{2})$/i.exec(label)
  if (q) return `${ordinal(q[1])} ${q[2]}`
  const period = ordinal(game.live?.period)
  const clock = String(game.live?.clock || '').trim()
  if (period && clock) return `${period} ${clock}`
  return label || 'Live'
}

function signed(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return ''
  return v > 0 ? `+${v}` : v === 0 ? 'PK' : String(v)
}

/** Favorite's spread for pregame ("BAL -3.5"). */
export function pregameLine(game) {
  const a = Number(game?.away?.spread)
  const h = Number(game?.home?.spread)
  if (Number.isFinite(a) && (!Number.isFinite(h) || a <= h)) return `${game.away.abbrev} ${signed(a)}`
  if (Number.isFinite(h)) return `${game.home.abbrev} ${signed(h)}`
  return ''
}

/** "BAL 17, DAL 13 · Halftime" / "BAL @ DAL · Sun 4:25 PM ET · BAL -3.5" */
export function gameOgTitle(game) {
  const a = game.away?.abbrev || game.away?.mascot || 'Away'
  const h = game.home?.abbrev || game.home?.mascot || 'Home'
  const status = gameStatusLabel(game)
  if (game.status === 'pre') return [`${a} @ ${h}`, status, pregameLine(game)].filter(Boolean).join(' · ')
  return `${a} ${game.away?.score ?? 0}, ${h} ${game.home?.score ?? 0} · ${status}`
}

/** Changes whenever the card would look different … busts crawler caches keyed on the image URL. */
export function gameCardVersion(game) {
  return [game.status, game.away?.score, game.home?.score, gameStatusLabel(game)]
    .join('|')
    .replace(/[^A-Za-z0-9|:]/g, '')
}

function absUrl(origin, u) {
  const s = String(u || '')
  if (!s) return ''
  return /^https?:\/\//i.test(s) ? s : `${origin}${s.startsWith('/') ? '' : '/'}${s}`
}

/** Flex div for satori (every multi-child node must be `display: flex`). */
function el(style, children) {
  return { type: 'div', props: { style: { display: 'flex', ...style }, children } }
}

function img(src, size) {
  return { type: 'img', props: { src, width: size, height: size, style: { width: size, height: size, objectFit: 'contain' } } }
}

function teamColumn(side, wash, origin) {
  const useLight = nflPillWashLikelyTreatment(wash) === 'light' && side?.logoLight
  const logo = absUrl(origin, useLight ? side.logoLight : side?.logo)
  const rank = Number(side?.rank)
  return el(
    { flexDirection: 'column', alignItems: 'center', width: 250 },
    [
      el({ width: 210, height: 210, alignItems: 'center', justifyContent: 'center' }, logo ? [img(logo, 200)] : []),
      el(
        { marginTop: 10, fontSize: 44, color: '#fafafa', letterSpacing: 2, alignItems: 'baseline' },
        [
          ...(Number.isInteger(rank) && rank >= 1 && rank <= 25
            ? [el({ fontSize: 28, color: '#fbbf24', marginRight: 8 }, `#${rank}`)]
            : []),
          el({}, String(side?.abbrev || side?.mascot || '').toUpperCase()),
        ],
      ),
      ...(side?.record ? [el({ fontSize: 26, color: 'rgba(255,255,255,0.6)', fontWeight: 500 }, side.record)] : []),
    ],
  )
}

/** Satori tree for the 1200x630 card. */
export function gameCardTree(game, origin) {
  const { awayWash, homeWash } = resolveNflPillWashes(game.home, game.away)
  const isPre = game.status === 'pre'
  const isLive = game.status === 'in'
  const status = gameStatusLabel(game)
  const awayScore = Number(game.away?.score)
  const homeScore = Number(game.home?.score)
  const final = game.status === 'post'
  const dimAway = final && awayScore < homeScore
  const dimHome = final && homeScore < awayScore
  const score = (n, dim) =>
    el(
      { fontSize: 170, lineHeight: 1, color: dim ? 'rgba(255,255,255,0.45)' : '#ffffff', width: 190, justifyContent: 'center' },
      Number.isFinite(n) ? String(n) : '0',
    )
  const centerLines = [
    el({ fontSize: isPre ? 40 : 46, color: isLive && status !== 'Halftime' ? '#fda4af' : '#fafafa', letterSpacing: 1 }, status),
  ]
  if (isPre) {
    const line = pregameLine(game)
    if (line) centerLines.push(el({ marginTop: 10, fontSize: 34, color: 'rgba(255,255,255,0.85)' }, line))
  }
  if (game.broadcast) {
    centerLines.push(
      el(
        {
          marginTop: 16,
          padding: '6px 18px',
          borderRadius: 999,
          border: '2px solid rgba(255,255,255,0.35)',
          background: 'rgba(0,0,0,0.35)',
          fontSize: 26,
          color: '#e4e4e7',
          letterSpacing: 2,
        },
        String(game.broadcast).toUpperCase(),
      ),
    )
  }

  return el(
    {
      width: 1200,
      height: 630,
      flexDirection: 'column',
      background: '#09090b',
      fontFamily: 'Oswald',
      fontWeight: 700,
      position: 'relative',
    },
    [
      el({ position: 'absolute', left: 0, top: 0, width: 600, height: 630, background: `linear-gradient(120deg, ${awayWash} 0%, ${awayWash} 25%, #09090b 92%)` }, []),
      el({ position: 'absolute', left: 600, top: 0, width: 600, height: 630, background: `linear-gradient(240deg, ${homeWash} 0%, ${homeWash} 25%, #09090b 92%)` }, []),
      el({ position: 'absolute', left: 0, top: 0, width: 1200, height: 630, background: 'linear-gradient(180deg, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.25) 55%, rgba(9,9,11,0.9) 100%)' }, []),
      el(
        { justifyContent: 'space-between', alignItems: 'center', padding: '34px 48px 0 48px', width: 1200 },
        [
          el({ fontSize: 30, color: 'rgba(255,255,255,0.8)', letterSpacing: 4 }, String(game.sport_label || 'NFL').toUpperCase()),
          el(
            { alignItems: 'center', fontSize: 26, color: isLive ? '#fda4af' : 'rgba(255,255,255,0.6)', letterSpacing: 3 },
            [
              ...(isLive ? [el({ width: 14, height: 14, borderRadius: 7, background: '#f43f5e', marginRight: 10 }, [])] : []),
              el({}, isLive ? 'LIVE' : final ? 'FINAL' : 'UPCOMING'),
            ],
          ),
        ],
      ),
      el(
        { flex: 1, alignItems: 'center', justifyContent: 'center', padding: '0 30px' },
        [
          teamColumn(game.away, awayWash, origin),
          isPre ? el({ width: 190 }, []) : score(awayScore, dimAway),
          el({ flexDirection: 'column', alignItems: 'center', width: 300 }, centerLines),
          isPre ? el({ width: 190 }, []) : score(homeScore, dimHome),
          teamColumn(game.home, homeWash, origin),
        ],
      ),
      el(
        { justifyContent: 'space-between', alignItems: 'center', padding: '0 48px 34px 48px', width: 1200 },
        [
          el({ fontSize: 26, color: 'rgba(255,255,255,0.6)', fontWeight: 500, letterSpacing: 1 }, 'Live game hub · edgetilt.com'),
          {
            type: 'img',
            props: {
              src: absUrl(origin, '/edge-lounge-logo-transparent.png'),
              width: 154,
              height: 38,
              style: { width: 154, height: 38 },
            },
          },
        ],
      ),
    ],
  )
}

let fontCache = null
/** Oswald from our own origin (`public/fonts`) … fetched once per warm function. */
export async function loadGameCardFonts(origin) {
  if (fontCache) return fontCache
  const load = async (file) => {
    const res = await fetch(absUrl(origin, `/fonts/${file}`))
    if (!res.ok) throw new Error(`font ${file} ${res.status}`)
    return res.arrayBuffer()
  }
  const [bold, medium] = await Promise.all([load('Oswald-Bold.ttf'), load('Oswald-Medium.ttf')])
  fontCache = [
    { name: 'Oswald', data: bold, weight: 700, style: 'normal' },
    { name: 'Oswald', data: medium, weight: 500, style: 'normal' },
  ]
  return fontCache
}
