import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type KlipyItemOut = { id: string; title: string; gifUrl: string; previewUrl: string }

const GIF_OR_WEBP = /\.(gif|webp)(\?|#|$)/i
const JPG_OR_PNG = /\.(jpe?g|png)(\?|#|$)/i

function getNested(obj: unknown, path: string[]): unknown {
  let cur: unknown = obj
  for (const key of path) {
    if (cur == null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[key]
  }
  return cur
}

/** Klipy payloads vary: `file`, `files` as object or array, or URLs nested under unknown keys — scan for media URLs. */
function collectUrlsMatching(root: unknown, re: RegExp, maxDepth: number, bucket: Set<string>) {
  if (maxDepth < 0 || root == null) return
  if (typeof root === 'string') {
    const t = root.trim()
    if (t.startsWith('http') && re.test(t)) bucket.add(t)
    return
  }
  if (Array.isArray(root)) {
    for (const x of root) collectUrlsMatching(x, re, maxDepth - 1, bucket)
    return
  }
  if (typeof root === 'object') {
    const o = root as Record<string, unknown>
    for (const k of Object.keys(o)) {
      collectUrlsMatching(o[k], re, maxDepth - 1, bucket)
    }
  }
}

function mediaRoots(item: Record<string, unknown>): unknown[] {
  const out: unknown[] = []
  if (item.file != null) out.push(item.file)
  if (Array.isArray(item.files)) {
    for (const x of item.files) out.push(x)
  } else if (item.files != null) {
    out.push(item.files)
  }
  if (item.media != null) out.push(item.media)
  if (out.length === 0) out.push(item)
  return out
}

/** Higher = better for full-size insert (prefer HD / original GIF). */
function scoreInsertUrl(u: string): number {
  const L = u.toLowerCase()
  let s = 0
  if (/\.gif(\?|#|$)/i.test(u)) s += 40
  if (/\.webp(\?|#|$)/i.test(u)) s += 25
  if (/\b(hd|original|source|full)\b/i.test(L)) s += 50
  if (/\b(md|lg)\b/i.test(L)) s += 20
  if (/\b(sm)\b/i.test(L)) s += 10
  if (/\b(xs)\b/i.test(L)) s += 5
  return s + Math.min(30, Math.floor(u.length / 80))
}

/** Higher = better for grid cell (prefer small animated asset over HD). */
function scorePreviewUrl(u: string): number {
  const L = u.toLowerCase()
  let s = 0
  if (/\.gif(\?|#|$)/i.test(u)) s += 45
  if (/\.webp(\?|#|$)/i.test(u)) s += 40
  if (/\bxs\b|\/xs[./_-]|[._-]xs[._-]/i.test(L)) s += 35
  if (/\bsm\b|\/sm[./_-]|[._-]sm[._-]/i.test(L)) s += 28
  if (/\bmd\b|\/md[./_-]|[._-]md[._-]/i.test(L)) s += 18
  if (/\b(hd|original|source|full)\b/i.test(L)) s -= 25
  return s
}

function scorePreviewStill(u: string): number {
  const L = u.toLowerCase()
  let s = 0
  if (/\bxs\b|\/xs[./_-]|[._-]xs[._-]/i.test(L)) s += 20
  if (/\bsm\b|\/sm[./_-]/i.test(L)) s += 15
  if (/\bmd\b|\/md[./_-]/i.test(L)) s += 10
  return s
}

function bestByScore(urls: string[], score: (u: string) => number): string {
  if (urls.length === 0) return ''
  return urls.reduce((a, b) => (score(a) >= score(b) ? a : b))
}

function pickFromItem(item: Record<string, unknown>): KlipyItemOut | null {
  const animated = new Set<string>()
  const stills = new Set<string>()
  for (const root of mediaRoots(item)) {
    collectUrlsMatching(root, GIF_OR_WEBP, 16, animated)
    collectUrlsMatching(root, JPG_OR_PNG, 16, stills)
  }

  // Legacy nested shape (hd.gif.url etc.)
  const bag = (item.file ?? item.files) as Record<string, unknown> | undefined
  if (bag && typeof bag === 'object' && !Array.isArray(bag)) {
    const legacyGif = String(
      getNested(bag, ['hd', 'gif', 'url']) ??
        getNested(bag, ['gif', 'gif', 'url']) ??
        getNested(bag, ['original', 'gif', 'url']) ??
        getNested(bag, ['gif', 'url']) ??
        '',
    ).trim()
    if (legacyGif) animated.add(legacyGif)
    for (const path of [
      ['xs', 'gif', 'url'],
      ['sm', 'gif', 'url'],
      ['md', 'gif', 'url'],
      ['xs', 'webp', 'url'],
      ['sm', 'webp', 'url'],
    ] as const) {
      const u = String(getNested(bag, [...path]) ?? '').trim()
      if (u) animated.add(u)
    }
    for (const path of [
      ['xs', 'jpg', 'url'],
      ['sm', 'jpg', 'url'],
      ['md', 'jpg', 'url'],
    ] as const) {
      const u = String(getNested(bag, [...path]) ?? '').trim()
      if (u) stills.add(u)
    }
  }

  const gifs = [...animated]
  const jpgs = [...stills]

  const gifUrl = bestByScore(gifs, scoreInsertUrl)
  if (!gifUrl) return null

  const previewAnimated = bestByScore(gifs, scorePreviewUrl)
  const previewStill = bestByScore(jpgs, scorePreviewStill)
  // Prefer a smaller animated URL for the grid; only fall back to JPEG if Klipy gave no separate smaller GIF/WebP.
  const previewUrl = (previewAnimated && previewAnimated !== gifUrl ? previewAnimated : '') ||
    gifUrl ||
    previewStill

  const id = String(item.slug ?? item.id ?? item.uuid ?? Math.random().toString(36).slice(2)).slice(0, 200)
  const title = String(item.title ?? item.content_description ?? '').trim().slice(0, 240)

  return { id, title, gifUrl, previewUrl: previewUrl || gifUrl }
}

function unwrapGifList(payload: unknown): unknown[] {
  if (!payload || typeof payload !== 'object') return []
  const root = payload as Record<string, unknown>

  if (root.result === true && root.data != null && typeof root.data === 'object') {
    const inner = root.data as Record<string, unknown>
    if (Array.isArray(inner.data)) return inner.data
  }

  const d = root.data
  if (Array.isArray(d)) return d
  if (d && typeof d === 'object' && Array.isArray((d as Record<string, unknown>).data)) {
    return (d as Record<string, unknown>).data as unknown[]
  }
  return []
}

function unwrapHasNext(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return false
  const root = payload as Record<string, unknown>
  if (root.result === true && root.data != null && typeof root.data === 'object') {
    const inner = root.data as Record<string, unknown>
    if (typeof inner.has_next === 'boolean') return inner.has_next
    if (typeof inner.hasNext === 'boolean') return inner.hasNext
  }
  const d = root.data
  if (d && typeof d === 'object') {
    const o = d as Record<string, unknown>
    if (typeof o.has_next === 'boolean') return o.has_next
    if (typeof o.hasNext === 'boolean') return o.hasNext
  }
  return false
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const klipyKey = Deno.env.get('KLIPY_API_KEY')?.trim()
    if (!supabaseUrl || !anonKey) {
      return new Response(JSON.stringify({ error: 'Server is missing Supabase env.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (!klipyKey) {
      return new Response(JSON.stringify({ error: 'KLIPY_API_KEY is not configured for this project.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.toLowerCase().startsWith('bearer ')) {
      return new Response(JSON.stringify({ error: 'Sign in to search GIFs.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const {
      data: { user },
      error: userErr,
    } = await userClient.auth.getUser()
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: 'Sign in to search GIFs.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let body: Record<string, unknown>
    try {
      body = (await req.json()) as Record<string, unknown>
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const kind = String(body.kind || body.type || '').toLowerCase()
    const page = Math.max(1, Math.min(500, Number(body.page) || 1))
    const perPage = Math.max(8, Math.min(50, Number(body.per_page) || 24))

    const encKey = encodeURIComponent(klipyKey)
    let upstreamUrl: string
    if (kind === 'trending') {
      upstreamUrl = `https://api.klipy.com/api/v1/${encKey}/gifs/trending?page=${page}&per_page=${perPage}`
    } else if (kind === 'search') {
      const q = String(body.q || '').trim().slice(0, 120)
      if (!q) {
        return new Response(JSON.stringify({ error: 'Search query is required.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const locale = String(body.locale || '').trim().slice(0, 12)
      const rating = String(body.rating || 'g').trim().slice(0, 8)
      const loc = locale ? `&locale=${encodeURIComponent(locale)}` : ''
      upstreamUrl = `https://api.klipy.com/api/v1/${encKey}/gifs/search?q=${encodeURIComponent(q)}&page=${page}&per_page=${perPage}&rating=${encodeURIComponent(rating)}${loc}`
    } else {
      return new Response(JSON.stringify({ error: 'Unknown kind. Use "search" or "trending".' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const ua = req.headers.get('user-agent') || 'Edge-KlipyProxy/1'
    const klipyRes = await fetch(upstreamUrl, {
      headers: {
        Accept: 'application/json',
        'User-Agent': ua.slice(0, 400),
      },
    })

    const rawText = await klipyRes.text()
    if (!klipyRes.ok) {
      return new Response(
        JSON.stringify({
          error: `Klipy request failed (${klipyRes.status}).`,
        }),
        {
          status: 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(rawText)
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid response from Klipy.' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const rawList = unwrapGifList(parsed)
    const items: KlipyItemOut[] = []
    for (const row of rawList) {
      if (!row || typeof row !== 'object') continue
      const picked = pickFromItem(row as Record<string, unknown>)
      if (picked) items.push(picked)
    }

    return new Response(
      JSON.stringify({
        items,
        hasNext: unwrapHasNext(parsed),
        page,
        perPage,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return new Response(JSON.stringify({ error: msg || 'Unexpected error.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
