/** Market Edge bot slug (financial news aggregator). */
export const DEFAULT_MARKET_EDGE_SLUG = 'market-edge'

export type MarketNewsSourceSeed = {
  name: string
  kind: string
  poll_url?: string | null
  api_config?: Record<string, unknown>
  poll_interval_sec: number
}

/** Default allowlisted sources — topic-wide ingest, no ticker blend. */
export const DEFAULT_MARKET_NEWS_SOURCES: MarketNewsSourceSeed[] = [
  // Finnhub categories
  { name: 'Finnhub general market', kind: 'finnhub_general', api_config: { category: 'general' }, poll_interval_sec: 180 },
  { name: 'Finnhub M&A', kind: 'finnhub_category', api_config: { category: 'merger' }, poll_interval_sec: 300 },
  { name: 'Finnhub forex / macro', kind: 'finnhub_category', api_config: { category: 'forex' }, poll_interval_sec: 300 },
  { name: 'Finnhub crypto', kind: 'finnhub_category', api_config: { category: 'crypto' }, poll_interval_sec: 300 },

  // SEC EDGAR (official; User-Agent required) — 8-K disabled (routine filing noise)
  { name: 'SEC EDGAR 10-Q', kind: 'edgar', api_config: { filing_type: '10-Q', count: 30 }, poll_interval_sec: 600 },
  { name: 'SEC EDGAR 10-K', kind: 'edgar', api_config: { filing_type: '10-K', count: 30 }, poll_interval_sec: 900 },

  // US government / regulator RSS (public; headline + link)
  {
    name: 'SEC press releases',
    kind: 'rss',
    poll_url: 'https://www.sec.gov/news/pressreleases.rss',
    api_config: { source_label: 'SEC' },
    poll_interval_sec: 300,
  },
  {
    name: 'Federal Reserve press',
    kind: 'rss',
    poll_url: 'https://www.federalreserve.gov/feeds/press_all.xml',
    api_config: { source_label: 'Federal Reserve' },
    poll_interval_sec: 300,
  },
  {
    name: 'US Treasury press',
    kind: 'rss',
    poll_url: 'https://home.treasury.gov/system/files/136/TreasuryPressReleases.xml',
    api_config: { source_label: 'US Treasury' },
    poll_interval_sec: 420,
  },
  {
    name: 'CFTC press releases',
    kind: 'rss',
    poll_url: 'https://www.cftc.gov/PressRoom/PressReleases/rss.xml',
    api_config: { source_label: 'CFTC' },
    poll_interval_sec: 420,
  },
  {
    name: 'EIA Today in Energy',
    kind: 'rss',
    poll_url: 'https://www.eia.gov/rss/todayinenergy.xml',
    api_config: { source_label: 'EIA' },
    poll_interval_sec: 600,
  },

  // Publisher RSS — headline rewrite + link only (no full-body republish)
  {
    name: 'BBC Business',
    kind: 'rss',
    poll_url: 'https://feeds.bbci.co.uk/news/business/rss.xml',
    api_config: { source_label: 'BBC Business' },
    poll_interval_sec: 300,
  },
  {
    name: 'NPR Business',
    kind: 'rss',
    poll_url: 'https://feeds.npr.org/1001/rss.xml',
    api_config: { source_label: 'NPR Business' },
    poll_interval_sec: 420,
  },
]

/**
 * Optional portal watchlist — empty by default.
 * Topic-tier scoring drives what publishes; tickers here only add company feeds + a small score nudge.
 */
export const DEFAULT_MARKET_EDGE_WATCHLIST: readonly string[] = []
