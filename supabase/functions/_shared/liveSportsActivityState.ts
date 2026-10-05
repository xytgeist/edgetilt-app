import { resolvePublicAppOrigin } from './publicAppOrigin.ts'
import type { LoungeSportsGame } from './loungeSportsScoreboard.ts'

/** Codable keys for `LiveSportsAttributes.ContentState` (Swift). */
export type LiveSportsContentState = {
  gameId: string
  sportKey: string
  awayAbbrev: string
  homeAbbrev: string
  awayScore: number
  homeScore: number
  status: string
  clock: string
  period: string
  detail: string
  awayLogoUrl: string
  homeLogoUrl: string
  possession: string
  awaySpread: string
  homeSpread: string
  awayMl: string
  homeMl: string
  totalLine: string
}

function str(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return ''
}

function absLogo(raw: string, origin: string): string {
  const s = str(raw)
  if (!s) return ''
  if (/^https?:\/\//i.test(s)) return s
  if (s.startsWith('//')) return `https:${s}`
  if (s.startsWith('/')) return `${origin}${s}`
  return s
}

function formatSpread(value: unknown): string {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n) || n === 0) return ''
  const mag = Math.abs(n)
  const body = mag === Math.floor(mag) ? String(mag) : String(mag)
  return n > 0 ? `+${body}` : `-${body}`
}

function formatMoneyline(value: unknown): string {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n) || n === 0) return ''
  const i = Math.round(n)
  return i > 0 ? `+${i}` : `${i}`
}

function formatTotal(value: unknown): string {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n) || n === 0) return ''
  const body = n === Math.floor(n) ? String(n) : String(n)
  return `O/U ${body}`
}

function downDistance(live: Record<string, unknown> | null | undefined): string {
  if (!live) return ''
  const ready = str(live.down_distance || live.downDistance)
  if (ready) return ready
  const down = Number(live.down)
  const dist = Number(live.distance)
  if (!Number.isInteger(down) || down < 1 || !Number.isFinite(dist)) return ''
  const ordinal = down === 1 ? '1st' : down === 2 ? '2nd' : down === 3 ? '3rd' : down === 4 ? '4th' : String(down)
  return `${ordinal} & ${dist}`
}

function clockFields(game: LoungeSportsGame, live: Record<string, unknown>): { clock: string; period: string } {
  const statusLabel = str(game.status_label)
  if (statusLabel && statusLabel.toLowerCase() !== 'live') {
    return { clock: statusLabel, period: '' }
  }
  const periodRaw = str(live.period_label || live.period)
  return { clock: str(live.clock), period: periodRaw }
}

export function fingerprintLiveSportsState(state: LiveSportsContentState): string {
  return [
    state.gameId,
    state.status,
    state.awayScore,
    state.homeScore,
    state.clock,
    state.period,
    state.detail,
    state.possession,
    state.awaySpread,
    state.homeSpread,
    state.totalLine,
  ].join('|')
}

export function liveSportsContentStateFromGame(
  game: LoungeSportsGame,
  previous: LiveSportsContentState | null,
): LiveSportsContentState {
  const origin = resolvePublicAppOrigin()
  const live = (game.live || {}) as Record<string, unknown>
  const { clock, period } = clockFields(game, live)
  const poss = str(live.possession).toLowerCase()
  const possession = poss === 'home' || poss === 'away' ? poss : (previous?.possession || '')
  const next: LiveSportsContentState = {
    gameId: str(game.id) || previous?.gameId || '',
    sportKey: str(game.sport_key) || previous?.sportKey || '',
    awayAbbrev: str(game.away?.abbrev).toUpperCase() || previous?.awayAbbrev || '',
    homeAbbrev: str(game.home?.abbrev).toUpperCase() || previous?.homeAbbrev || '',
    awayScore: Number(game.away?.score) || 0,
    homeScore: Number(game.home?.score) || 0,
    status: str(game.status) || 'in',
    clock: clock || previous?.clock || '',
    period,
    detail: downDistance(live) || previous?.detail || '',
    awayLogoUrl: absLogo(str(game.away?.logo), origin) || previous?.awayLogoUrl || '',
    homeLogoUrl: absLogo(str(game.home?.logo), origin) || previous?.homeLogoUrl || '',
    possession,
    awaySpread: formatSpread(game.away?.spread) || previous?.awaySpread || '',
    homeSpread: formatSpread(game.home?.spread) || previous?.homeSpread || '',
    awayMl: formatMoneyline(game.away?.ml) || previous?.awayMl || '',
    homeMl: formatMoneyline(game.home?.ml) || previous?.homeMl || '',
    totalLine: formatTotal(game.total) || previous?.totalLine || '',
  }
  return next
}
