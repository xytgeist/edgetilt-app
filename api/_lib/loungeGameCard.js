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

function finiteNum(v) {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** American odds ("+126" / "-142"). */
function americanOdds(v) {
  const n = finiteNum(v)
  if (n == null || n === 0) return ''
  return n > 0 ? `+${Math.round(n)}` : String(Math.round(n))
}

/** Each side's spread, filling one from the other when only one is posted. */
function sideSpreads(game) {
  const a = finiteNum(game?.away?.spread)
  const h = finiteNum(game?.home?.spread)
  return { away: a ?? (h != null ? -h : null), home: h ?? (a != null ? -a : null) }
}

/** Final games drop the odds strip; pregame and live show the current lines. */
function showOdds(game) {
  if (game?.status === 'post') return false
  const s = sideSpreads(game)
  return s.away != null || finiteNum(game?.away?.ml) != null || finiteNum(game?.home?.ml) != null || finiteNum(game?.total) != null
}

/** "BAL 17, DAL 13 · Halftime" / "BAL @ DAL · Sun 4:25 PM ET · BAL -3.5 · O/U 44.5" */
export function gameOgTitle(game) {
  const a = game.away?.abbrev || game.away?.mascot || 'Away'
  const h = game.home?.abbrev || game.home?.mascot || 'Home'
  const status = gameStatusLabel(game)
  if (game.status === 'pre') {
    const total = finiteNum(game.total)
    return [`${a} @ ${h}`, status, pregameLine(game), total != null ? `O/U ${total}` : ''].filter(Boolean).join(' · ')
  }
  return `${a} ${game.away?.score ?? 0}, ${h} ${game.home?.score ?? 0} · ${status}`
}

/** Changes whenever the card would look different … busts crawler caches keyed on the image URL. */
export function gameCardVersion(game) {
  return [
    game.status,
    game.away?.score,
    game.home?.score,
    gameStatusLabel(game),
    game.away?.spread,
    game.home?.spread,
    game.away?.ml,
    game.home?.ml,
    game.total,
  ]
    .join('|')
    .replace(/[^A-Za-z0-9|:.+-]/g, '')
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

/** Pinstripes + halftone grain over the team washes. */
const CARD_TEXTURE_SVG = `data:image/svg+xml;base64,${Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
  <defs>
    <pattern id="stripe" width="18" height="18" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
      <rect width="2" height="18" fill="#ffffff" fill-opacity="0.045"/>
    </pattern>
    <pattern id="dots" width="7" height="7" patternUnits="userSpaceOnUse">
      <circle cx="1.5" cy="1.5" r="1" fill="#000000" fill-opacity="0.22"/>
      <circle cx="5" cy="5" r="0.7" fill="#ffffff" fill-opacity="0.05"/>
    </pattern>
    <radialGradient id="vig" cx="50%" cy="45%" r="75%">
      <stop offset="55%" stop-color="#000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0.55"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#stripe)"/>
  <rect width="1200" height="630" fill="url(#dots)"/>
  <rect width="1200" height="630" fill="url(#vig)"/>
</svg>`,
).toString('base64')}`

function teamColumn(side, wash, origin) {
  const useLight = nflPillWashLikelyTreatment(wash) === 'light' && side?.logoLight
  const logo = absUrl(origin, useLight ? side.logoLight : side?.logo)
  const rank = Number(side?.rank)
  return el(
    { flexDirection: 'column', alignItems: 'center', width: 300 },
    [
      el({ width: 196, height: 196, alignItems: 'center', justifyContent: 'center' }, logo ? [img(logo, 190)] : []),
      el(
        { marginTop: 8, fontSize: 58, lineHeight: 1.05, color: '#fafafa', letterSpacing: 2, alignItems: 'baseline' },
        [
          ...(Number.isInteger(rank) && rank >= 1 && rank <= 25
            ? [el({ fontSize: 34, color: '#fbbf24', marginRight: 10 }, `#${rank}`)]
            : []),
          el({}, String(side?.abbrev || side?.mascot || '').toUpperCase()),
        ],
      ),
      ...(side?.record ? [el({ fontSize: 28, color: 'rgba(255,255,255,0.62)', fontWeight: 500 }, side.record)] : []),
    ],
  )
}

/** One team's cell in the odds strip: big spread, ML beside it. */
function oddsSideCell(spread, ml, align) {
  const right = align === 'right'
  const spreadText = spread == null ? '' : signed(spread)
  const mlText = americanOdds(ml)
  const spreadBlock = el({ flexDirection: 'column', alignItems: right ? 'flex-end' : 'flex-start' }, [
    el({ fontSize: 20, color: 'rgba(255,255,255,0.55)', letterSpacing: 3, fontWeight: 500 }, 'SPREAD'),
    el({ fontSize: 60, lineHeight: 1, color: '#ffffff' }, spreadText || '-'),
  ])
  const mlBlock = el(
    {
      flexDirection: 'column',
      alignItems: 'center',
      padding: '8px 16px',
      borderRadius: 14,
      background: 'rgba(255,255,255,0.08)',
      border: '2px solid rgba(255,255,255,0.14)',
      [right ? 'marginRight' : 'marginLeft']: 22,
    },
    [
      el({ fontSize: 18, color: 'rgba(255,255,255,0.55)', letterSpacing: 3, fontWeight: 500 }, 'ML'),
      el({ fontSize: 34, lineHeight: 1.05, color: '#fafafa' }, mlText || '-'),
    ],
  )
  return el(
    { width: 330, alignItems: 'flex-end', justifyContent: right ? 'flex-end' : 'flex-start' },
    right ? [mlBlock, spreadBlock] : [spreadBlock, mlBlock],
  )
}

function oddsStrip(game) {
  const spreads = sideSpreads(game)
  const total = finiteNum(game.total)
  return el(
    {
      margin: '0 40px',
      width: 1120,
      padding: '16px 34px',
      borderRadius: 26,
      background: 'rgba(9,9,11,0.62)',
      border: '2px solid rgba(255,255,255,0.12)',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    [
      oddsSideCell(spreads.away, game.away?.ml, 'left'),
      el({ flexDirection: 'column', alignItems: 'center' }, [
        el({ fontSize: 20, color: 'rgba(255,255,255,0.55)', letterSpacing: 3, fontWeight: 500 }, 'TOTAL'),
        el({ fontSize: 52, lineHeight: 1, color: '#ffffff' }, total != null ? `O/U ${total}` : '-'),
      ]),
      oddsSideCell(spreads.home, game.home?.ml, 'right'),
    ],
  )
}

/** Satori tree for the 1200x630 card. */
export function gameCardTree(game, origin) {
  const { awayWash, homeWash } = resolveNflPillWashes(game.home, game.away)
  const isPre = game.status === 'pre'
  const isLive = game.status === 'in'
  const final = game.status === 'post'
  const odds = showOdds(game)
  const status = gameStatusLabel(game)
  const awayScore = Number(game.away?.score)
  const homeScore = Number(game.home?.score)
  const dimAway = final && awayScore < homeScore
  const dimHome = final && homeScore < awayScore
  const score = (n, dim) =>
    el(
      {
        fontSize: odds ? 150 : 180,
        lineHeight: 1,
        color: dim ? 'rgba(255,255,255,0.45)' : '#ffffff',
        width: 170,
        justifyContent: 'center',
      },
      Number.isFinite(n) ? String(n) : '0',
    )
  const centerLines = [
    el(
      {
        fontSize: isPre ? 54 : 50,
        lineHeight: 1.05,
        color: isLive && status !== 'Halftime' ? '#fda4af' : '#fafafa',
        letterSpacing: 1,
        textAlign: 'center',
        whiteSpace: 'nowrap',
      },
      status,
    ),
  ]
  if (game.broadcast) {
    centerLines.push(
      el(
        {
          marginTop: 16,
          padding: '6px 20px',
          borderRadius: 999,
          border: '2px solid rgba(255,255,255,0.35)',
          background: 'rgba(0,0,0,0.4)',
          fontSize: 28,
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
      el({ position: 'absolute', left: 0, top: 0, width: 600, height: 630, background: `linear-gradient(120deg, ${awayWash} 0%, ${awayWash} 30%, #09090b 95%)` }, []),
      el({ position: 'absolute', left: 600, top: 0, width: 600, height: 630, background: `linear-gradient(240deg, ${homeWash} 0%, ${homeWash} 30%, #09090b 95%)` }, []),
      {
        type: 'img',
        props: { src: CARD_TEXTURE_SVG, width: 1200, height: 630, style: { position: 'absolute', left: 0, top: 0, width: 1200, height: 630 } },
      },
      el({ position: 'absolute', left: 0, top: 0, width: 1200, height: 630, background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.15) 55%, rgba(9,9,11,0.75) 100%)' }, []),
      el(
        { justifyContent: 'space-between', alignItems: 'center', padding: '28px 44px 0 44px', width: 1200 },
        [
          el({ alignItems: 'center' }, [
            el({ fontSize: 34, color: 'rgba(255,255,255,0.88)', letterSpacing: 5 }, String(game.sport_label || 'NFL').toUpperCase()),
            el({ marginLeft: 18, fontSize: 22, color: 'rgba(255,255,255,0.5)', fontWeight: 500, letterSpacing: 1 }, 'Live game hub · edgetilt.com'),
          ]),
          el({ alignItems: 'center' }, [
            el(
              {
                alignItems: 'center',
                fontSize: 26,
                fontWeight: 700,
                color: '#ffffff',
                letterSpacing: 3,
                padding: '8px 20px 8px 18px',
                borderRadius: 999,
                background: isLive ? '#e11d48' : 'rgba(9,9,11,0.7)',
                border: isLive ? '2px solid rgba(255,255,255,0.35)' : '2px solid rgba(255,255,255,0.18)',
              },
              [
                ...(isLive ? [el({ width: 12, height: 12, borderRadius: 6, background: '#ffffff', marginRight: 12 }, [])] : []),
                el({}, isLive ? 'LIVE' : final ? 'FINAL' : 'UPCOMING'),
              ],
            ),
            {
              type: 'img',
              props: {
                src: absUrl(origin, '/edge-lounge-logo-transparent.png'),
                width: 146,
                height: 36,
                style: { width: 146, height: 36, marginLeft: 22 },
              },
            },
          ]),
        ],
      ),
      el(
        { flex: 1, alignItems: 'center', justifyContent: 'center', padding: '0 15px' },
        [
          teamColumn(game.away, awayWash, origin),
          isPre ? el({ width: 70 }, []) : score(awayScore, dimAway),
          el({ flexDirection: 'column', alignItems: 'center', width: isPre ? 400 : 230 }, centerLines),
          isPre ? el({ width: 70 }, []) : score(homeScore, dimHome),
          teamColumn(game.home, homeWash, origin),
        ],
      ),
      ...(odds ? [el({ paddingBottom: 30, width: 1200 }, [oddsStrip(game)])] : [el({ height: 40 }, [])]),
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
