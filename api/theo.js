/**
 * Dual-machine Theo mailbox.
 * GET  https://lvslotpro.com/theo           HTML (SSR, so Cursor WebFetch sees messages)
 * GET  https://lvslotpro.com/theo?format=json
 * POST https://lvslotpro.com/theo           JSON { author, body, secret? } (optional; agents use the script)
 *
 * Test host only. 404 on edgetilt.com. Table lives on test Supabase.
 */

const TEST_SUPABASE_URL = 'https://kcosfvmreeiosdjdzycb.supabase.co'
const AUTHORS = new Set(['windows', 'mac', 'ryan'])

function hostOf(req) {
  const raw =
    req.headers['x-forwarded-host'] ||
    req.headers['host'] ||
    ''
  return String(raw).split(',')[0].trim().split(':')[0].toLowerCase()
}

function isAllowedHost(host) {
  if (host === 'lvslotpro.com' || host === 'www.lvslotpro.com') return true
  if (host === 'localhost' || host === '127.0.0.1') return true
  if (host.endsWith('.vercel.app')) return true
  return false
}

function supabaseUrl() {
  const fromEnv = String(
    process.env.SUPABASE_URL_TEST ||
      process.env.VITE_SUPABASE_URL ||
      process.env.SUPABASE_URL ||
      '',
  )
    .trim()
    .replace(/\/+$/, '')
  if (fromEnv.includes('kcosfvmreeiosdjdzycb')) return fromEnv
  return TEST_SUPABASE_URL
}

function anonKey() {
  return String(process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY_TEST || '').trim()
}

function serviceRoleKey() {
  return String(
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_SERVICE_ROLE_KEY_TEST ||
      '',
  ).trim()
}

function postSecret() {
  return String(process.env.THEO_CHANNEL_SECRET || '').trim()
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatWhen(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso || '')
  return d.toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC')
}

async function fetchMessages() {
  const url = `${supabaseUrl()}/rest/v1/theo_channel_messages?select=id,author,body,created_at&order=created_at.desc&limit=40`
  const key = anonKey()
  if (!key) {
    throw new Error('Missing VITE_SUPABASE_ANON_KEY on this deploy.')
  }
  const res = await fetch(url, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`Load failed (${res.status}): ${text.slice(0, 200)}`)
  }
  const rows = JSON.parse(text)
  return Array.isArray(rows) ? rows : []
}

function renderHtml(messages, error) {
  const articles = (messages || [])
    .map((row) => {
      const author = escapeHtml(row.author)
      const when = escapeHtml(formatWhen(row.created_at))
      const body = escapeHtml(row.body).replace(/\n/g, '<br />')
      return `<article>
  <h2>${author} · ${when}</h2>
  <p>${body}</p>
</article>`
    })
    .join('\n')

  const empty = !error && (!messages || messages.length === 0)
    ? '<p class="muted">No messages yet. Agents post with <code>node scripts/theo-channel.mjs post windows "…"</code></p>'
    : ''
  const err = error ? `<p class="err">${escapeHtml(error)}</p>` : ''

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex, nofollow" />
  <title>Theo channel</title>
  <style>
    :root { color-scheme: dark; --bg:#09090b; --fg:#fafafa; --muted:#a1a1aa; --line:#27272a; }
    @media (prefers-color-scheme: light) {
      :root { color-scheme: light; --bg:#fafafa; --fg:#18181b; --muted:#52525b; --line:#e4e4e7; }
    }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--bg); color: var(--fg); font: 16px/1.45 ui-sans-serif, system-ui, sans-serif; padding: 1.5rem; max-width: 44rem; }
    h1 { font-size: 1.15rem; margin: 0 0 0.35rem; }
    .muted { color: var(--muted); font-size: 0.92rem; }
    .err { color: #f87171; }
    article { border-top: 1px solid var(--line); padding: 1rem 0; }
    article h2 { font-size: 0.85rem; margin: 0 0 0.4rem; color: var(--muted); font-weight: 650; }
    article p { margin: 0; white-space: pre-wrap; }
    code { font-size: 0.85em; }
  </style>
</head>
<body>
  <h1>Theo channel</h1>
  <p class="muted">Windows / Mac agent handoff. Test only. Do not put secrets, tokens, or .p8 keys here.</p>
  ${err}
  ${empty}
  ${articles}
</body>
</html>`
}

function send(res, status, headers, body) {
  res.statusCode = status
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v)
  res.end(body)
}

export default async function handler(req, res) {
  const noIndex = { 'X-Robots-Tag': 'noindex, nofollow' }
  if (!isAllowedHost(hostOf(req))) {
    send(res, 404, { 'Content-Type': 'text/plain; charset=utf-8', ...noIndex }, 'Not found')
    return
  }

  if (req.method === 'GET' || req.method === 'HEAD') {
    try {
      const messages = await fetchMessages()
      const url = new URL(req.url || '/', 'https://lvslotpro.com')
      if (url.searchParams.get('format') === 'json') {
        send(
          res,
          200,
          { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...noIndex },
          JSON.stringify({ messages }),
        )
        return
      }
      send(
        res,
        200,
        { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', ...noIndex },
        renderHtml(messages),
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Load failed'
      send(
        res,
        500,
        { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', ...noIndex },
        renderHtml([], msg),
      )
    }
    return
  }

  if (req.method !== 'POST') {
    send(res, 405, { Allow: 'GET, POST', ...noIndex }, 'Method not allowed')
    return
  }

  const expected = postSecret()
  const roleKey = serviceRoleKey()
  if (!expected || !roleKey) {
    send(
      res,
      501,
      { 'Content-Type': 'application/json; charset=utf-8', ...noIndex },
      JSON.stringify({
        error: 'HTTP post is not configured on this deploy. Use node scripts/theo-channel.mjs',
      }),
    )
    return
  }

  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  let payload = {}
  try {
    payload = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
  } catch {
    payload = {}
  }

  const headerSecret = String(req.headers['x-theo-channel-secret'] || '').trim()
  const secret = headerSecret || String(payload.secret || '').trim()
  if (secret !== expected) {
    send(res, 401, { 'Content-Type': 'application/json; charset=utf-8', ...noIndex }, JSON.stringify({ error: 'Unauthorized' }))
    return
  }

  const author = String(payload.author || '').trim().toLowerCase()
  const body = String(payload.body || '').trim()
  if (!AUTHORS.has(author) || !body || body.length > 4000) {
    send(
      res,
      400,
      { 'Content-Type': 'application/json; charset=utf-8', ...noIndex },
      JSON.stringify({ error: 'Need author windows|mac|ryan and body (1-4000 chars).' }),
    )
    return
  }

  const insertUrl = `${supabaseUrl()}/rest/v1/theo_channel_messages`
  const insertRes = await fetch(insertUrl, {
    method: 'POST',
    headers: {
      apikey: roleKey,
      Authorization: `Bearer ${roleKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({ author, body }),
  })
  const insertText = await insertRes.text()
  if (!insertRes.ok) {
    send(
      res,
      500,
      { 'Content-Type': 'application/json; charset=utf-8', ...noIndex },
      JSON.stringify({ error: `Insert failed (${insertRes.status})` }),
    )
    return
  }

  send(
    res,
    200,
    { 'Content-Type': 'application/json; charset=utf-8', ...noIndex },
    insertText || '{"ok":true}',
  )
}
