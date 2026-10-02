/** Sportsbook homepages for odds-feed book names ("FanDuel", "LowVig.ag", …). No per-bet deep links exist. */
const SPORTSBOOK_HOME_BY_KEY = {
  pinnacle: 'https://www.pinnacle.com',
  circasports: 'https://www.circasports.com',
  circa: 'https://www.circasports.com',
  lowvig: 'https://www.lowvig.ag',
  fanduel: 'https://sportsbook.fanduel.com',
  draftkings: 'https://sportsbook.draftkings.com',
  betmgm: 'https://sports.betmgm.com',
  fanatics: 'https://sportsbook.fanatics.com',
  caesars: 'https://www.caesars.com/sportsbook-and-casino',
  williamhill: 'https://www.caesars.com/sportsbook-and-casino',
  williamhillus: 'https://www.caesars.com/sportsbook-and-casino',
  rebet: 'https://www.rebet.app',
  betus: 'https://www.betus.com.pa',
  bovada: 'https://www.bovada.lv',
  betrivers: 'https://www.betrivers.com',
  espnbet: 'https://espnbet.com',
  hardrock: 'https://www.hardrock.bet',
  hardrockbet: 'https://www.hardrock.bet',
  betonline: 'https://www.betonline.ag',
  mybookie: 'https://www.mybookie.ag',
  bet365: 'https://www.bet365.com',
  fliff: 'https://www.getfliff.com',
  bookmaker: 'https://www.bookmaker.eu',
  ballybet: 'https://play.ballybet.com',
}

/** Hard Rock Bet App Store (iOS). Web hardrock.bet is a download interstitial. */
export const HARD_ROCK_APP_STORE_URL = 'https://apps.apple.com/app/id1572525917'

/** Custom scheme candidates … verified order: try app, then App Store. */
export const HARD_ROCK_APP_SCHEMES = ['hardrockbet://']

export function bookKey(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/\.(ag|com|eu|lv|us)$/i, '')
    .replace(/[^a-z0-9]/g, '')
}

export function isHardRockBook(nameOrKey) {
  const k = bookKey(nameOrKey)
  return k === 'hardrock' || k === 'hardrockbet'
}

export function isHardRockUrl(url) {
  try {
    const host = new URL(String(url || '').trim()).hostname.toLowerCase()
    return host === 'hardrock.bet' || host.endsWith('.hardrock.bet') || host.includes('hardrockbet')
  } catch {
    return false
  }
}

/** True when the URL is just the Hard Rock marketing / download site (not a betslip deep link). */
export function isHardRockHomepageUrl(url) {
  try {
    const u = new URL(String(url || '').trim())
    const host = u.hostname.toLowerCase()
    if (!(host === 'hardrock.bet' || host.endsWith('.hardrock.bet'))) return false
    const path = (u.pathname || '/').replace(/\/+$/, '') || '/'
    return path === '/' || path === '/download' || path === '/app'
  } catch {
    return false
  }
}

export function sportsbookHomeUrl(name) {
  return SPORTSBOOK_HOME_BY_KEY[bookKey(name)] || ''
}
