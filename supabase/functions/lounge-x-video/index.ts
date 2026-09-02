const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, range',
  'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges, Content-Type',
}

function isAllowedVideoHost(hostname: string): boolean {
  const host = String(hostname || '').toLowerCase()
  return host === 'video.twimg.com'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders })
  }

  const requestUrl = new URL(req.url)
  const raw = String(requestUrl.searchParams.get('u') || '').trim()
  if (!raw) {
    return new Response('Missing u query param.', { status: 400, headers: corsHeaders })
  }

  let source: URL
  try {
    source = new URL(raw)
  } catch {
    return new Response('Invalid video URL.', { status: 400, headers: corsHeaders })
  }
  if (source.protocol !== 'https:' || !isAllowedVideoHost(source.hostname)) {
    return new Response('Video host not allowed.', { status: 403, headers: corsHeaders })
  }

  const upstreamHeaders: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (compatible; EdgeTilt/1.0; +https://edgetilt.com)',
    Referer: 'https://x.com/',
  }
  const range = req.headers.get('Range')
  if (range) upstreamHeaders.Range = range

  const upstream = await fetch(source.href, {
    method: req.method,
    headers: upstreamHeaders,
  })

  const outHeaders = new Headers(corsHeaders)
  const contentType = upstream.headers.get('Content-Type')
  if (contentType) outHeaders.set('Content-Type', contentType)
  const contentLength = upstream.headers.get('Content-Length')
  if (contentLength) outHeaders.set('Content-Length', contentLength)
  const contentRange = upstream.headers.get('Content-Range')
  if (contentRange) outHeaders.set('Content-Range', contentRange)
  const acceptRanges = upstream.headers.get('Accept-Ranges')
  if (acceptRanges) outHeaders.set('Accept-Ranges', acceptRanges)
  outHeaders.set('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800')

  return new Response(req.method === 'HEAD' ? null : upstream.body, {
    status: upstream.status,
    headers: outHeaders,
  })
})
