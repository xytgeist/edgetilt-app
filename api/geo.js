/**
 * Visitor IP geo from Vercel's edge headers: `{ country, region }` (region = ISO 3166-2 subdivision, e.g. "NV").
 * Drives the game hub's Nevada-books mode; the client caches it and lets the viewer override.
 * Local `vite` has no `/api` … the client treats a failed fetch as "not Nevada".
 */
export default function handler(req, res) {
  const header = (key) =>
    String(req.headers[key] || '')
      .trim()
      .toUpperCase()
      .slice(0, 8) || null
  res.setHeader('Cache-Control', 'private, no-store')
  res.status(200).json({
    country: header('x-vercel-ip-country'),
    region: header('x-vercel-ip-country-region'),
  })
}
