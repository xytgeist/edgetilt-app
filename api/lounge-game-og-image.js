/**
 * Vercel Serverless: 1200x630 PNG scoreboard card for game link previews.
 * GET `/api/lounge-game-og-image?eventId=…&v=…` (`v` only busts crawler caches; the card is always live).
 */
import { ImageResponse } from '@vercel/og'
import {
  GAME_ID_RE,
  fetchGameCard,
  gameCardTree,
  loadGameCardFonts,
  queryParam,
  requestOrigin,
} from './_lib/loungeGameCard.js'

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405
    res.end('Method Not Allowed')
    return
  }
  const eventId = queryParam(req, 'eventId')
  const origin = requestOrigin(req)
  const game = GAME_ID_RE.test(eventId) && origin ? await fetchGameCard(eventId) : null
  if (!game) {
    res.statusCode = 302
    res.setHeader('Location', `${origin}/apple-touch-icon.png`)
    res.setHeader('Cache-Control', 'public, s-maxage=60')
    res.end()
    return
  }
  try {
    const image = new ImageResponse(gameCardTree(game, origin), {
      width: 1200,
      height: 630,
      fonts: await loadGameCardFonts(origin),
    })
    const buf = Buffer.from(await image.arrayBuffer())
    res.statusCode = 200
    res.setHeader('Content-Type', 'image/png')
    res.setHeader(
      'Cache-Control',
      game.status === 'post'
        ? 'public, max-age=3600, s-maxage=86400'
        : 'public, max-age=30, s-maxage=30, stale-while-revalidate=60',
    )
    res.end(req.method === 'HEAD' ? undefined : buf)
  } catch (err) {
    res.statusCode = 500
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.end(`Card render failed: ${err instanceof Error ? err.message : 'unknown'}`)
  }
}
