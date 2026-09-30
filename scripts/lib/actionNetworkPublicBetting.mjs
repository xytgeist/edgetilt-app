/**
 * Action Network public betting (ticket % / handle %) for NFL + NCAAF.
 *
 * Preferred: api.actionnetwork.com v2 JSON (works from residential + many cloud IPs).
 * Fallback: HTML __NEXT_DATA__ on www.actionnetwork.com (needs Chrome UA; CloudFront
 * WAF may challenge datacenter egress … same home-PC pattern as MTTDB).
 *
 * Maps into syndicate_betting_splits rows (source=action_pro) for Chedda / Tank / hub.
 * Mapping lives in `src/syndicate/actionPublicBettingMap.js` (shared with the Ops capture).
 */

import {
  ACTION_SPORTS,
  extractNextDataGames,
  gameToSplitRow,
  parseGamesPayload,
} from '../../src/syndicate/actionPublicBettingMap.js'

export {
  ACTION_SPORTS,
  extractNextDataGames,
  gameToSplitRow,
  parseGamesPayload,
  pickBestMarketSides,
} from '../../src/syndicate/actionPublicBettingMap.js'

export const ACTION_PUBLIC_BETTING_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

const FETCH_HEADERS = {
  'User-Agent': ACTION_PUBLIC_BETTING_UA,
  Accept: 'application/json,text/html;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  Origin: 'https://www.actionnetwork.com',
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache',
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: {
      ...FETCH_HEADERS,
      Accept: 'application/json',
      Referer: 'https://www.actionnetwork.com/',
    },
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}: ${text.slice(0, 160)}`)
  }
  return JSON.parse(text)
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      ...FETCH_HEADERS,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      Referer: 'https://www.actionnetwork.com/',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
    },
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}: ${text.slice(0, 160)}`)
  }
  if (/x-amzn-waf-action|just a moment|cf-browser-verification/i.test(text) || res.status === 202) {
    throw new Error(`WAF/challenge for ${url}`)
  }
  return text
}

/**
 * Pull NFL or NCAAF public betting games and return split row drafts.
 * @param {'nfl' | 'ncaaf'} sport
 * @param {{ preferHtml?: boolean }} [opts]
 */
export async function fetchActionPublicBettingRows(sport, opts = {}) {
  const cfg = ACTION_SPORTS[sport]
  if (!cfg) throw new Error(`Unknown sport: ${sport}`)

  /** @type {any[]} */
  let games = []
  let source = 'api_v2'

  if (!opts.preferHtml) {
    try {
      const apiUrl = `https://api.actionnetwork.com/web/v2/scoreboard/publicbetting/${cfg.apiPath}`
      const json = await fetchJson(apiUrl)
      games = parseGamesPayload(json)
    } catch (err) {
      console.warn(`[action-splits] ${sport} API failed: ${err.message || err}`)
      games = []
    }
  }

  if (!games.length) {
    source = 'html_next_data'
    const html = await fetchHtml(cfg.pageUrl)
    games = extractNextDataGames(html)
  }

  const rows = []
  for (const game of games) {
    const row = gameToSplitRow(game, cfg.sportKey)
    if (row) rows.push(row)
  }

  return { sport, sportKey: cfg.sportKey, source, gameCount: games.length, rows }
}
