/**
 * Live game-time weather fetching via Open-Meteo API (free, zero auth, fast).
 * Uses latitude/longitude of sports venues from loungeSportsVenues.ts.
 * Computes wind speed (mph), precipitation probability, and temperature (°F)
 * to factor into Tank's totals (Over/Under) model.
 */
import { resolveGameVenueCoords } from './loungeSportsVenues.ts'

export type GameWeatherSummary = {
  venueName?: string
  city?: string
  tempF?: number
  windSpeedMph?: number
  windGustMph?: number
  precipProbability?: number
  weatherCode?: number
  isDome: boolean
  isHighWind: boolean // wind >= 15 mph
  isExtremeCold: boolean // temp <= 32 F
  isPrecipAlert: boolean // rain/snow probability >= 50%
  summaryLine: string
}

const DOMED_VENUES = new Set([
  'State Farm Stadium',
  'Mercedes-Benz Stadium',
  'AT&T Stadium',
  'Ford Field',
  'NRG Stadium',
  'Lucas Oil Stadium',
  'Allegiant Stadium',
  'SoFi Stadium',
  'U.S. Bank Stadium',
  'Caesars Superdome',
  'Tropicana Field',
  'Globe Life Field',
  'Rogers Centre',
  'Minute Maid Park',
  'American Family Field',
  'Chase Field',
  'loanDepot park',
])

/**
 * Fetch forecast weather for a given venue and kickoff time.
 */
export async function fetchGameWeather(
  sportId: number,
  homeTeam: string,
  commenceTimeIso: string,
): Promise<GameWeatherSummary | null> {
  const venue = resolveGameVenueCoords(sportId, homeTeam, true, homeTeam)
  if (!venue) return null

  const venueName = venue.venueName || ''
  const city = venue.city || ''
  const isDome = DOMED_VENUES.has(venueName)

  if (isDome) {
    return {
      venueName,
      city,
      isDome: true,
      isHighWind: false,
      isExtremeCold: false,
      isPrecipAlert: false,
      summaryLine: `${venueName} (Indoor / Dome)`,
    }
  }

  const commenceDate = new Date(commenceTimeIso)
  if (isNaN(commenceDate.getTime())) return null

  const isoHour = commenceDate.toISOString().slice(0, 13) + ':00'
  const dateStr = commenceDate.toISOString().slice(0, 10)

  try {
    const url = new URL('https://api.open-meteo.com/v1/forecast')
    url.searchParams.set('latitude', String(venue.lat))
    url.searchParams.set('longitude', String(venue.lng))
    url.searchParams.set('hourly', 'temperature_2m,precipitation_probability,wind_speed_10m,wind_gusts_10m,weather_code')
    url.searchParams.set('temperature_unit', 'fahrenheit')
    url.searchParams.set('wind_speed_unit', 'mph')
    url.searchParams.set('start_date', dateStr)
    url.searchParams.set('end_date', dateStr)

    const resp = await fetch(url.toString())
    if (!resp.ok) {
      return null
    }

    const data = await resp.json()
    const hourly = data?.hourly
    if (!hourly?.time || !Array.isArray(hourly.time)) return null

    const idx = hourly.time.findIndex((t: string) => t.startsWith(isoHour.slice(0, 13)))
    const targetIdx = idx >= 0 ? idx : 0

    const tempF = Math.round(Number(hourly.temperature_2m?.[targetIdx]) || 65)
    const windSpeedMph = Math.round(Number(hourly.wind_speed_10m?.[targetIdx]) || 5)
    const windGustMph = Math.round(Number(hourly.wind_gusts_10m?.[targetIdx]) || windSpeedMph)
    const precipProbability = Math.round(Number(hourly.precipitation_probability?.[targetIdx]) || 0)
    const weatherCode = Number(hourly.weather_code?.[targetIdx]) || 0

    const isHighWind = windSpeedMph >= 15
    const isExtremeCold = tempF <= 32
    const isPrecipAlert = precipProbability >= 50

    const parts: string[] = [`${tempF}°F`]
    if (isHighWind) parts.push(`💨 Wind ${windSpeedMph} mph (Gusts ${windGustMph})`)
    else parts.push(`Wind ${windSpeedMph} mph`)
    if (isPrecipAlert) parts.push(`🌧️ ${precipProbability}% Rain/Snow`)

    return {
      venueName,
      city,
      tempF,
      windSpeedMph,
      windGustMph,
      precipProbability,
      weatherCode,
      isDome: false,
      isHighWind,
      isExtremeCold,
      isPrecipAlert,
      summaryLine: `${venueName} · ${parts.join(' · ')}`,
    }
  } catch (_e) {
    return null
  }
}
