/**
 * syndicate-splits-vision
 *
 * Admin uploads Action PRO / VSiN board screenshot; OpenAI vision returns
 * ticket% vs handle% rows for Chedda paste. No scraping … human screenshot only.
 *
 * Secrets: OPENAI_API_KEY
 * Optional: OPENAI_VISION_MODEL (default gpt-4o-mini)
 */
import { requireAdminUser, adminOpsCorsHeaders, adminOpsJson } from '../_shared/adminAuth.ts'

const OPENAI_MODEL = Deno.env.get('OPENAI_VISION_MODEL') ?? 'gpt-4o-mini'
const MAX_BYTES = 4_500_000

type SplitGame = {
  away_team: string
  home_team: string
  away_ticket_pct: number
  away_handle_pct: number
  home_ticket_pct: number
  home_handle_pct: number
  commence_hint?: string | null
}

function extractJsonObject(rawText: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(rawText)
    if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>
  } catch {
    /* fall through */
  }
  const match = rawText.match(/\{[\s\S]*\}/)
  if (!match) return null
  try {
    const parsed = JSON.parse(match[0])
    if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>
  } catch {
    return null
  }
  return null
}

function outputTextFromResponsesApi(payload: any): string {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) return payload.output_text
  const output = Array.isArray(payload?.output) ? payload.output : []
  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : []
    for (const part of content) {
      if (typeof part?.text === 'string' && part.text.trim()) return part.text
    }
  }
  return ''
}

function clampPct(n: unknown): number | null {
  const v = typeof n === 'number' ? n : Number(String(n ?? '').replace('%', '').trim())
  if (!Number.isFinite(v)) return null
  return Math.max(0, Math.min(100, Math.round(v * 10) / 10))
}

function normalizeGames(raw: Record<string, unknown>): { sport_key: string | null; games: SplitGame[]; confidence: number | null } {
  const sportRaw = String(raw.sport_key || raw.sport || raw.league || '').toLowerCase()
  let sport_key: string | null = null
  if (sportRaw.includes('ncaaf') || sportRaw.includes('cfb') || sportRaw.includes('college')) {
    sport_key = 'americanfootball_ncaaf'
  } else if (sportRaw.includes('nfl') || sportRaw.includes('pro')) {
    sport_key = 'americanfootball_nfl'
  }

  const list = Array.isArray(raw.games) ? raw.games : []
  const games: SplitGame[] = []
  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const g = item as Record<string, unknown>
    const away = String(g.away_team || g.away || '').trim()
    const home = String(g.home_team || g.home || '').trim()
    if (!away || !home) continue

    let awayTicket = clampPct(g.away_ticket_pct ?? g.away_bets_pct ?? g.away_bet_pct)
    let awayHandle = clampPct(g.away_handle_pct ?? g.away_money_pct)
    let homeTicket = clampPct(g.home_ticket_pct ?? g.home_bets_pct ?? g.home_bet_pct)
    let homeHandle = clampPct(g.home_handle_pct ?? g.home_money_pct)

    // If only one side present, fill the other to 100
    if (homeTicket != null && awayTicket == null) awayTicket = clampPct(100 - homeTicket)
    if (awayTicket != null && homeTicket == null) homeTicket = clampPct(100 - awayTicket)
    if (homeHandle != null && awayHandle == null) awayHandle = clampPct(100 - homeHandle)
    if (awayHandle != null && homeHandle == null) homeHandle = clampPct(100 - awayHandle)

    if (awayTicket == null || awayHandle == null || homeTicket == null || homeHandle == null) continue

    games.push({
      away_team: away,
      home_team: home,
      away_ticket_pct: awayTicket,
      away_handle_pct: awayHandle,
      home_ticket_pct: homeTicket,
      home_handle_pct: homeHandle,
      commence_hint: g.commence_hint ? String(g.commence_hint) : null,
    })
  }

  const confidence =
    typeof raw.confidence === 'number' && Number.isFinite(raw.confidence) ? raw.confidence : null

  return { sport_key, games, confidence }
}

async function extractWithOpenAi(
  openaiApiKey: string,
  mimeType: string,
  base64: string,
): Promise<{ sport_key: string | null; games: SplitGame[]; confidence: number | null }> {
  const prompt = `
You are reading a sports betting splits board screenshot (Action Network PRO, VSiN, or similar).
Extract EVERY game row you can read. Return strict JSON only (no markdown):
{
  "confidence": 0.0-1.0,
  "sport_key": "americanfootball_nfl" or "americanfootball_ncaaf" or null,
  "games": [
    {
      "away_team": "full or short team name as shown",
      "home_team": "full or short team name as shown",
      "away_ticket_pct": 0-100,
      "away_handle_pct": 0-100,
      "home_ticket_pct": 0-100,
      "home_handle_pct": 0-100,
      "commence_hint": "date/time text if visible, else null"
    }
  ]
}

Column mapping:
- "% OF BETS" / "Bets %" / "Tickets" → ticket_pct
- "% OF MONEY" / "Money %" / "Handle" → handle_pct
- Action schedule column usually lists AWAY team first, HOME team second (visitor @ home).

Rules:
- Read printed numbers only. Do not invent games.
- Percents may appear as 55 or 55%. Return numbers 0-100.
- Away ticket + home ticket should be ~100; same for handle. If only one side is readable, still return both by filling 100 - other.
- Ignore OPEN, BEST ODDS, DIFF, and BETS count columns for the output (DIFF is derived).
- If league dropdown says NFL or NCAAF/CFB, set sport_key accordingly.
- If a row is unreadable, skip it and lower confidence.
`.trim()

  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openaiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      input: [
        {
          role: 'user',
          content: [
            { type: 'input_text', text: prompt },
            {
              type: 'input_image',
              image_url: `data:${mimeType};base64,${base64}`,
            },
          ],
        },
      ],
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`OpenAI error (${res.status}): ${errText.slice(0, 300)}`)
  }

  const payload = await res.json()
  const outputText = outputTextFromResponsesApi(payload)
  if (!outputText) throw new Error('OpenAI returned no text output.')
  const parsed = extractJsonObject(outputText)
  if (!parsed) throw new Error('Could not parse JSON from OpenAI output.')
  return normalizeGames(parsed)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: adminOpsCorsHeaders })
  if (req.method !== 'POST') return adminOpsJson(405, { error: 'POST required.' })

  try {
    await requireAdminUser(req)
  } catch (err) {
    if (err instanceof Response) return err
    return adminOpsJson(500, { error: err instanceof Error ? err.message : String(err) })
  }

  const openaiApiKey = Deno.env.get('OPENAI_API_KEY') ?? ''
  if (!openaiApiKey) {
    return adminOpsJson(500, { error: 'OPENAI_API_KEY not set.', code: 'missing_openai' })
  }

  let body: { imageBase64?: string; mimeType?: string }
  try {
    body = await req.json()
  } catch {
    return adminOpsJson(400, { error: 'Invalid JSON body.' })
  }

  const imageBase64 = String(body?.imageBase64 || '').replace(/^data:[^;]+;base64,/, '').trim()
  const mimeType = String(body?.mimeType || 'image/jpeg').trim() || 'image/jpeg'
  if (!imageBase64) return adminOpsJson(400, { error: 'imageBase64 required.' })

  const approxBytes = Math.floor((imageBase64.length * 3) / 4)
  if (approxBytes > MAX_BYTES) {
    return adminOpsJson(413, { error: `Image too large (max ~${Math.round(MAX_BYTES / 1e6)}MB).` })
  }

  try {
    const result = await extractWithOpenAi(openaiApiKey, mimeType, imageBase64)
    return adminOpsJson(200, {
      ok: true,
      engine: 'openai-vision',
      model: OPENAI_MODEL,
      sport_key: result.sport_key,
      confidence: result.confidence,
      games: result.games,
      count: result.games.length,
    })
  } catch (err) {
    return adminOpsJson(500, {
      error: err instanceof Error ? err.message : String(err),
      code: 'vision_failed',
    })
  }
})
