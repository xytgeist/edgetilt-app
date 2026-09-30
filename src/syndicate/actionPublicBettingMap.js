/**
 * Action Network public betting (ticket % / handle %) → syndicate_betting_splits row drafts.
 * Pure mapping only: shared by the home-PC sync (`scripts/lib/actionNetworkPublicBetting.mjs`)
 * and the Ops "Action capture" bookmarklet handoff (`BotBettingSplitsPaste.jsx`).
 */

export const ACTION_SPORTS = {
  nfl: {
    sportKey: 'americanfootball_nfl',
    apiPath: 'nfl',
    pageUrl: 'https://www.actionnetwork.com/nfl/public-betting',
  },
  ncaaf: {
    sportKey: 'americanfootball_ncaaf',
    apiPath: 'ncaaf',
    pageUrl: 'https://www.actionnetwork.com/ncaaf/public-betting',
  },
}

function clampPct(n) {
  const x = Number(n)
  if (!Number.isFinite(x)) return null
  if (x < 0 || x > 100) return null
  return Math.round(x)
}

function teamById(teams, id) {
  return (teams || []).find((t) => Number(t.id) === Number(id)) || null
}

function teamLabel(team) {
  if (!team) return ''
  return String(team.full_name || team.display_name || team.short_name || team.abbr || '').trim()
}

/**
 * Prefer a book whose spread (and optional total) has real ticket+money % on both sides.
 * Consensus numbers often repeat across books.
 */
export function pickBestMarketSides(markets) {
  const bookIds = Object.keys(markets || {})
  // Prefer common consensus-ish books first when present.
  const ordered = [
    ...['15', '30', '75', '68', '69', '71', '49'].filter((id) => bookIds.includes(id)),
    ...bookIds.filter((id) => !['15', '30', '75', '68', '69', '71', '49'].includes(id)),
  ]

  let bestSpread = null
  let bestTotal = null
  let bestBook = null

  for (const bookId of ordered) {
    const event = markets[bookId]?.event || {}
    const spreadRows = Array.isArray(event.spread) ? event.spread : []
    const totalRows = Array.isArray(event.total) ? event.total : []

    const homeSpread = spreadRows.find((r) => String(r.side) === 'home')
    const awaySpread = spreadRows.find((r) => String(r.side) === 'away')
    const homeTicket = clampPct(homeSpread?.bet_info?.tickets?.percent)
    const homeHandle = clampPct(homeSpread?.bet_info?.money?.percent)
    const awayTicket = clampPct(awaySpread?.bet_info?.tickets?.percent)
    const awayHandle = clampPct(awaySpread?.bet_info?.money?.percent)

    const spreadOk =
      homeTicket != null &&
      homeHandle != null &&
      awayTicket != null &&
      awayHandle != null &&
      homeTicket > 0 &&
      awayTicket > 0 &&
      homeHandle > 0 &&
      awayHandle > 0

    if (spreadOk && !bestSpread) {
      bestSpread = {
        home_ticket_pct: homeTicket,
        home_handle_pct: homeHandle,
        away_ticket_pct: awayTicket,
        away_handle_pct: awayHandle,
      }
      bestBook = bookId
    }

    const over = totalRows.find((r) => String(r.side) === 'over')
    const under = totalRows.find((r) => String(r.side) === 'under')
    let overTicket = clampPct(over?.bet_info?.tickets?.percent)
    let overHandle = clampPct(over?.bet_info?.money?.percent)
    if (overTicket == null && under?.bet_info?.tickets?.percent != null) {
      const u = clampPct(under.bet_info.tickets.percent)
      if (u != null) overTicket = 100 - u
    }
    if (overHandle == null && under?.bet_info?.money?.percent != null) {
      const u = clampPct(under.bet_info.money.percent)
      if (u != null) overHandle = 100 - u
    }
    if (
      overTicket != null &&
      overHandle != null &&
      overTicket > 0 &&
      overHandle > 0 &&
      !bestTotal
    ) {
      bestTotal = { over_ticket_pct: overTicket, over_handle_pct: overHandle }
      if (!bestBook) bestBook = bookId
    }

    if (bestSpread && bestTotal) break
  }

  return { spread: bestSpread, total: bestTotal, bookId: bestBook }
}

/**
 * Normalize one Action game object (v2 API or __NEXT_DATA__ games[]) into a split row draft.
 * @param {object} game
 * @param {string} sportKey
 * @param {{ via?: string }} [opts] provenance label written into `notes`
 * @returns {object | null}
 */
export function gameToSplitRow(game, sportKey, opts = {}) {
  if (!game) return null
  const status = String(game.status || '').toLowerCase()
  if (status === 'complete' || status === 'postponed' || status === 'canceled' || status === 'cancelled') {
    return null
  }

  const home = teamById(game.teams, game.home_team_id)
  const away = teamById(game.teams, game.away_team_id)
  const homeTeam = teamLabel(home)
  const awayTeam = teamLabel(away)
  if (!homeTeam || !awayTeam) return null

  const markets = game.markets || {}
  // HTML __NEXT_DATA__ sometimes nests the same shape; also accept legacy odds[] public fields.
  let picked = pickBestMarketSides(markets)

  if (!picked.spread && Array.isArray(game.odds)) {
    for (const o of game.odds) {
      const homeTicket = clampPct(o.spread_home_public)
      const awayTicket = clampPct(o.spread_away_public)
      const homeHandle = clampPct(o.spread_home_money)
      const awayHandle = clampPct(o.spread_away_money)
      if (homeTicket != null && awayTicket != null && homeHandle != null && awayHandle != null) {
        picked = {
          spread: {
            home_ticket_pct: homeTicket,
            home_handle_pct: homeHandle,
            away_ticket_pct: awayTicket,
            away_handle_pct: awayHandle,
          },
          total:
            clampPct(o.total_over_public) != null && clampPct(o.total_over_money) != null
              ? {
                  over_ticket_pct: clampPct(o.total_over_public),
                  over_handle_pct: clampPct(o.total_over_money),
                }
              : null,
          bookId: o.book_id != null ? String(o.book_id) : null,
        }
        break
      }
    }
  }

  if (!picked.spread) return null

  const commence =
    game.start_time != null && String(game.start_time).trim()
      ? new Date(game.start_time).toISOString()
      : null

  const via = opts.via || 'auto · actionnetwork v2'
  return {
    sport_key: sportKey,
    event_id: null,
    home_team: homeTeam,
    away_team: awayTeam,
    commence_time: commence,
    home_ticket_pct: picked.spread.home_ticket_pct,
    home_handle_pct: picked.spread.home_handle_pct,
    away_ticket_pct: picked.spread.away_ticket_pct,
    away_handle_pct: picked.spread.away_handle_pct,
    over_ticket_pct: picked.total?.over_ticket_pct ?? null,
    over_handle_pct: picked.total?.over_handle_pct ?? null,
    source: 'action_pro',
    notes: `${via} · id=${game.id}${picked.bookId ? ` · book=${picked.bookId}` : ''}`,
    active: true,
    action_game_id: game.id,
    action_status: status,
  }
}

export function parseGamesPayload(json) {
  if (!json || typeof json !== 'object') return []
  if (Array.isArray(json.games)) return json.games
  const nested = json?.props?.pageProps?.scoreboardResponse?.games
  if (Array.isArray(nested)) return nested
  return []
}

export function extractNextDataGames(html) {
  const marker = 'id="__NEXT_DATA__"'
  const i = String(html || '').indexOf(marker)
  if (i < 0) return []
  const start = html.indexOf('>', i) + 1
  const end = html.indexOf('</script>', start)
  if (start <= 0 || end < 0) return []
  try {
    const data = JSON.parse(html.slice(start, end))
    return parseGamesPayload(data)
  } catch {
    return []
  }
}
