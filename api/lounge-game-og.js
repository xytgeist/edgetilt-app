/**
 * Vercel Serverless: HTML + Open Graph / Twitter Card meta for game hub share links.
 * Shared URL path: `/lounge/g/:eventId` (rewritten here from `vercel.json`) → people land on
 * `/?tab=home&game=…`; crawlers get a live scoreboard card (`/api/lounge-game-og-image`).
 * Apple Messages often drops `og:description` on large-image cards, so the score + status live in `og:title`.
 *
 * Env (set on Vercel; same as the Vite client): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
 */
import {
  GAME_ID_RE,
  fetchGameCard,
  gameCardVersion,
  gameOgTitle,
  queryParam,
  requestOrigin,
} from './_lib/loungeGameCard.js'

const EDGE_IOS_APP_STORE_ID = '6806401093'

function escapeAttr(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function pageHtml({ origin, canonical, appTarget, title, description, image }) {
  const o = escapeAttr(origin)
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="shortcut icon" href="${o}/favicon.ico" />
  <link rel="apple-touch-icon" sizes="180x180" href="${o}/apple-touch-icon.png?v=7" />
  <meta name="apple-mobile-web-app-title" content="Edge" />
  <meta name="apple-itunes-app" content="${escapeAttr(`app-id=${EDGE_IOS_APP_STORE_ID}, app-argument=${canonical}`)}" />
  <title>${escapeAttr(`${title} · Edge`)}</title>
  <link rel="canonical" href="${escapeAttr(canonical)}" />
  <meta property="og:site_name" content="Edge" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${escapeAttr(title)}" />
  <meta property="og:description" content="${escapeAttr(description)}" />
  <meta property="og:url" content="${escapeAttr(canonical)}" />
  <meta property="og:image" content="${escapeAttr(image)}" />
  <meta property="og:image:type" content="image/png" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeAttr(title)}" />
  <meta name="twitter:description" content="${escapeAttr(description)}" />
  <meta name="twitter:image" content="${escapeAttr(image)}" />
  <meta http-equiv="refresh" content="0;url=${escapeAttr(appTarget)}">
  <script>window.location.replace(${JSON.stringify(appTarget)})</script>
</head>
<body>
  <p><a href="${escapeAttr(appTarget)}">Open this game in Edge</a></p>
</body>
</html>`
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405
    res.end('Method Not Allowed')
    return
  }
  const eventId = queryParam(req, 'eventId')
  const origin = requestOrigin(req) || 'https://edgetilt.com'
  const validId = GAME_ID_RE.test(eventId)
  const appTarget = validId ? `${origin}/?tab=home&game=${encodeURIComponent(eventId)}` : `${origin}/?tab=home`
  const canonical = validId ? `${origin}/lounge/g/${eventId}` : `${origin}/?tab=home`
  const game = validId ? await fetchGameCard(eventId) : null

  const html = game
    ? pageHtml({
      origin,
      canonical,
      appTarget,
      title: gameOgTitle(game),
      description: game.status === 'pre' ? 'Lines, props, and the live game hub on Edge.' : 'Follow it live on Edge.',
      image: `${origin}/api/lounge-game-og-image?eventId=${encodeURIComponent(eventId)}&v=${encodeURIComponent(gameCardVersion(game))}`,
    })
    : pageHtml({
      origin,
      canonical,
      appTarget,
      title: 'Game hub on Edge',
      description: 'Live scores, plays, and lines on Edge.',
      image: `${origin}/apple-touch-icon.png`,
    })

  res.statusCode = 200
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', game?.status === 'post' ? 'public, s-maxage=600' : 'public, s-maxage=20, stale-while-revalidate=60')
  res.end(req.method === 'HEAD' ? undefined : html)
}
