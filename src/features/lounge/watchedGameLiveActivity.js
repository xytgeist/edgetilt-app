import { syncEdgeLiveSportsActivity } from '../../utils/edgeNative.js'
import {
  formatLoungeSportsMoneyline,
  formatLoungeSportsSpread,
  formatLoungeSportsTotal,
} from './LoungeGameScorePill.jsx'

/** Absolute HTTPS logo URL for the native Live Activity download. */
function absoluteLogoUrl(logo) {
  const raw = String(logo || '').trim()
  if (!raw) return ''
  if (/^https?:\/\//i.test(raw)) return raw
  if (raw.startsWith('//')) return `https:${raw}`
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? String(window.location.origin).replace(/\/$/, '')
      : ''
  if (!origin) return raw
  return `${origin}${raw.startsWith('/') ? raw : `/${raw}`}`
}

/**
 * Center clock line for the Island / Lock Screen (Prime-style `1st 4:21`).
 * Prefer a rich status_label when present; otherwise period + clock.
 */
function liveClockFields(game, live) {
  const statusLabel = String(game?.status_label || '').trim()
  const periodRaw = String(live?.period_label || live?.period || '').trim()
  const clockRaw = String(live?.clock || '').trim()

  // "Q3 10:33" / "1st 4:21" / "Halftime" … ready for the center column.
  if (statusLabel && !/^live$/i.test(statusLabel)) {
    return { clock: statusLabel, period: '' }
  }
  return { clock: clockRaw, period: periodRaw }
}

function possessionSide(live) {
  const p = String(live?.possession || '').trim().toLowerCase()
  return p === 'home' || p === 'away' ? p : ''
}

/**
 * Build the Island payload for a board/detail game, or null to end.
 * @param {object | null | undefined} game
 * @param {{ watching?: boolean }} [opts]
 */
export function watchedGameLiveActivityPayload(game, opts = {}) {
  if (!game?.id) return { watching: false }
  const status = String(game.status || '').toLowerCase()
  if (opts.watching === false || status === 'post' || status === 'final') {
    return { watching: false, gameId: String(game.id) }
  }
  if (status !== 'in') return null

  const live = game.live || {}
  const { clock, period } = liveClockFields(game, live)
  const downDistance = String(live.down_distance || live.downDistance || '').trim()

  return {
    watching: true,
    gameId: String(game.id),
    sportKey: String(game.sport_key || ''),
    status: 'in',
    clock,
    period,
    downDistance,
    possession: possessionSide(live),
    totalLine: formatLoungeSportsTotal(game.total) || '',
    away: {
      abbrev: String(game.away?.abbrev || ''),
      score: Number(game.away?.score) || 0,
      logo: absoluteLogoUrl(game.away?.logo),
      spread: formatLoungeSportsSpread(game.away?.spread) || '',
      ml: formatLoungeSportsMoneyline(game.away?.ml) || '',
    },
    home: {
      abbrev: String(game.home?.abbrev || ''),
      score: Number(game.home?.score) || 0,
      logo: absoluteLogoUrl(game.home?.logo),
      spread: formatLoungeSportsSpread(game.home?.spread) || '',
      ml: formatLoungeSportsMoneyline(game.home?.ml) || '',
    },
  }
}

/** Fire-and-forget sync to the iOS shell. No-op outside EdgeiOS. */
export function pushWatchedGameLiveActivity(game, opts = {}) {
  const payload = watchedGameLiveActivityPayload(game, opts)
  if (payload == null) return
  void syncEdgeLiveSportsActivity(payload)
}
