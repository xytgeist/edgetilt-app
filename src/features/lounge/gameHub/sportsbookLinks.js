/** Sportsbook homepages for odds-feed book names ("FanDuel", "LowVig.ag", …). No per-bet deep links exist. */
const SPORTSBOOK_HOME_BY_KEY = {
  pinnacle: 'https://www.pinnacle.com',
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

export function bookKey(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/\.(ag|com|eu|lv|us)$/i, '')
    .replace(/[^a-z0-9]/g, '')
}

export function sportsbookHomeUrl(name) {
  return SPORTSBOOK_HOME_BY_KEY[bookKey(name)] || ''
}
