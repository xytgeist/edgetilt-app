/**
 * Pretty URLs for public SEO pages.
 * Production: matching rewrites in vercel.json, ahead of the SPA catch-all.
 * Dev and vite preview: this plugin rewrites the same paths.
 * Exact paths only so /sports/nfl/* assets and /fantasy-yahoo-return.html stay put.
 */

export const SEO_PUBLIC_PAGES = [
  {
    path: '/sports/bet-tracker',
    rewrite: '/sports-bet-tracker.html',
    file: 'public/sports-bet-tracker.html',
    kind: 'landing',
  },
  {
    path: '/fantasy',
    rewrite: '/fantasy.html',
    file: 'public/fantasy.html',
    kind: 'landing',
  },
  {
    path: '/slots/w2g',
    rewrite: '/slots-w2g.html',
    file: 'public/slots-w2g.html',
    kind: 'landing',
  },
  {
    path: '/calculators/kelly',
    rewrite: '/seo/calculators/kelly.html',
    file: 'seo/calculators/kelly.html',
    entry: 'src/seo/calculators/kelly.js',
    kind: 'calculator',
  },
  {
    path: '/calculators/no-vig',
    rewrite: '/seo/calculators/no-vig.html',
    file: 'seo/calculators/no-vig.html',
    entry: 'src/seo/calculators/no-vig.js',
    kind: 'calculator',
  },
  {
    path: '/calculators/odds-converter',
    rewrite: '/seo/calculators/odds-converter.html',
    file: 'seo/calculators/odds-converter.html',
    entry: 'src/seo/calculators/odds-converter.js',
    kind: 'calculator',
  },
  {
    path: '/calculators/arbitrage',
    rewrite: '/seo/calculators/arbitrage.html',
    file: 'seo/calculators/arbitrage.html',
    entry: 'src/seo/calculators/arbitrage.js',
    kind: 'calculator',
  },
  {
    path: '/calculators/clv',
    rewrite: '/seo/calculators/clv.html',
    file: 'seo/calculators/clv.html',
    entry: 'src/seo/calculators/clv.js',
    kind: 'calculator',
  },
]

export function viteSeoPublicRoutesPlugin() {
  const attach = (server) => {
    server.middlewares.use((req, _res, next) => {
      const raw = String(req.url || '/')
      const q = raw.indexOf('?')
      const path = q === -1 ? raw : raw.slice(0, q)
      const search = q === -1 ? '' : raw.slice(q)
      const normalized = path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path
      const page = SEO_PUBLIC_PAGES.find((row) => row.path === normalized)
      if (page) req.url = page.rewrite + search
      next()
    })
  }
  return {
    name: 'seo-public-routes',
    configureServer: attach,
    configurePreviewServer: attach,
  }
}
