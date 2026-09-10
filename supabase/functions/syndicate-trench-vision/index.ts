/**
 * syndicate-trench-vision
 *
 * Admin pastes ESPN Analytics team win-rate screenshot; OpenAI vision returns
 * PBWR / PRWR / RBWR / RSWR per NFL team. No scrape … human screenshot only.
 *
 * Secrets: OPENAI_API_KEY
 * Optional: OPENAI_VISION_MODEL (default gpt-4o-mini)
 */
import { requireAdminUser, adminOpsCorsHeaders, adminOpsJson } from '../_shared/adminAuth.ts'

const OPENAI_MODEL = Deno.env.get('OPENAI_VISION_MODEL') ?? 'gpt-4o-mini'
const MAX_BYTES = 4_500_000

type TrenchTeam = {
  team_abbr: string
  team_name: string
  prwr: number
  rswr: number
  pbwr: number
  rbwr: number
}

const TEAM_ROWS: Array<{ abbr: string; name: string; aliases: string[] }> = [
  { abbr: 'ARI', name: 'Arizona Cardinals', aliases: ['arizona', 'cardinals', 'ari'] },
  { abbr: 'ATL', name: 'Atlanta Falcons', aliases: ['atlanta', 'falcons', 'atl'] },
  { abbr: 'BAL', name: 'Baltimore Ravens', aliases: ['baltimore', 'ravens', 'bal'] },
  { abbr: 'BUF', name: 'Buffalo Bills', aliases: ['buffalo', 'bills', 'buf'] },
  { abbr: 'CAR', name: 'Carolina Panthers', aliases: ['carolina', 'panthers', 'car'] },
  { abbr: 'CHI', name: 'Chicago Bears', aliases: ['chicago', 'bears', 'chi'] },
  { abbr: 'CIN', name: 'Cincinnati Bengals', aliases: ['cincinnati', 'bengals', 'cin'] },
  { abbr: 'CLE', name: 'Cleveland Browns', aliases: ['cleveland', 'browns', 'cle'] },
  { abbr: 'DAL', name: 'Dallas Cowboys', aliases: ['dallas', 'cowboys', 'dal'] },
  { abbr: 'DEN', name: 'Denver Broncos', aliases: ['denver', 'broncos', 'den'] },
  { abbr: 'DET', name: 'Detroit Lions', aliases: ['detroit', 'lions', 'det'] },
  { abbr: 'GB', name: 'Green Bay Packers', aliases: ['green bay', 'packers', 'gb'] },
  { abbr: 'HOU', name: 'Houston Texans', aliases: ['houston', 'texans', 'hou'] },
  { abbr: 'IND', name: 'Indianapolis Colts', aliases: ['indianapolis', 'colts', 'ind'] },
  { abbr: 'JAX', name: 'Jacksonville Jaguars', aliases: ['jacksonville', 'jaguars', 'jax', 'jac'] },
  { abbr: 'KC', name: 'Kansas City Chiefs', aliases: ['kansas city', 'chiefs', 'kc'] },
  { abbr: 'LAC', name: 'Los Angeles Chargers', aliases: ['chargers', 'la chargers', 'lac', 'san diego'] },
  { abbr: 'LAR', name: 'Los Angeles Rams', aliases: ['rams', 'la rams', 'lar', 'st. louis rams'] },
  { abbr: 'LV', name: 'Las Vegas Raiders', aliases: ['las vegas', 'raiders', 'lv', 'lvr', 'oakland'] },
  { abbr: 'MIA', name: 'Miami Dolphins', aliases: ['miami', 'dolphins', 'mia'] },
  { abbr: 'MIN', name: 'Minnesota Vikings', aliases: ['minnesota', 'vikings', 'min'] },
  { abbr: 'NE', name: 'New England Patriots', aliases: ['new england', 'patriots', 'ne', 'nwe'] },
  { abbr: 'NO', name: 'New Orleans Saints', aliases: ['new orleans', 'saints', 'no', 'nor'] },
  { abbr: 'NYG', name: 'New York Giants', aliases: ['giants', 'ny giants', 'nyg'] },
  { abbr: 'NYJ', name: 'New York Jets', aliases: ['jets', 'ny jets', 'nyj'] },
  { abbr: 'PHI', name: 'Philadelphia Eagles', aliases: ['philadelphia', 'eagles', 'phi'] },
  { abbr: 'PIT', name: 'Pittsburgh Steelers', aliases: ['pittsburgh', 'steelers', 'pit'] },
  { abbr: 'SEA', name: 'Seattle Seahawks', aliases: ['seattle', 'seahawks', 'sea'] },
  { abbr: 'SF', name: 'San Francisco 49ers', aliases: ['san francisco', '49ers', 'niners', 'sf', 'sfo'] },
  { abbr: 'TB', name: 'Tampa Bay Buccaneers', aliases: ['tampa bay', 'buccaneers', 'bucs', 'tb', 'tam'] },
  { abbr: 'TEN', name: 'Tennessee Titans', aliases: ['tennessee', 'titans', 'ten'] },
  { abbr: 'WAS', name: 'Washington Commanders', aliases: ['washington', 'commanders', 'was', 'wsh', 'football team'] },
]

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

function clampWinRate(n: unknown): number | null {
  const v = typeof n === 'number' ? n : Number(String(n ?? '').replace('%', '').replace(/\(.*\)/, '').trim())
  if (!Number.isFinite(v)) return null
  return Math.max(0, Math.min(100, Math.round(v)))
}

function resolveAbbr(raw: string): { abbr: string; name: string } | null {
  const norm = String(raw || '').toLowerCase().replace(/[^a-z0-9\s.]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!norm) return null
  for (const row of TEAM_ROWS) {
    if (norm === row.abbr.toLowerCase() || norm === row.name.toLowerCase()) {
      return { abbr: row.abbr, name: row.name }
    }
  }
  // Prefer longer aliases so "la rams" beats a bare "la" we never added.
  const scored: Array<{ abbr: string; name: string; len: number }> = []
  for (const row of TEAM_ROWS) {
    for (const alias of [row.name.toLowerCase(), ...row.aliases]) {
      if (norm === alias || norm.includes(alias) || alias.includes(norm)) {
        scored.push({ abbr: row.abbr, name: row.name, len: alias.length })
      }
    }
  }
  if (!scored.length) return null
  scored.sort((a, b) => b.len - a.len)
  return { abbr: scored[0].abbr, name: scored[0].name }
}

function normalizeTeams(raw: Record<string, unknown>): {
  through: string | null
  teams: TrenchTeam[]
  unmatched: string[]
  confidence: number | null
} {
  const through = raw.through != null ? String(raw.through).trim() || null : null
  const list = Array.isArray(raw.teams) ? raw.teams : []
  const byAbbr = new Map<string, TrenchTeam>()
  const unmatched: string[] = []

  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const g = item as Record<string, unknown>
    const label = String(g.team_name || g.team || g.name || g.team_abbr || '').trim()
    const resolved = resolveAbbr(String(g.team_abbr || '')) || resolveAbbr(label)
    const prwr = clampWinRate(g.prwr ?? g.pass_rush_win_rate)
    const rswr = clampWinRate(g.rswr ?? g.run_stop_win_rate)
    const pbwr = clampWinRate(g.pbwr ?? g.pass_block_win_rate)
    const rbwr = clampWinRate(g.rbwr ?? g.run_block_win_rate)
    if (!resolved || prwr == null || rswr == null || pbwr == null || rbwr == null) {
      if (label) unmatched.push(label)
      continue
    }
    byAbbr.set(resolved.abbr, {
      team_abbr: resolved.abbr,
      team_name: resolved.name,
      prwr,
      rswr,
      pbwr,
      rbwr,
    })
  }

  const confidence =
    typeof raw.confidence === 'number' && Number.isFinite(raw.confidence) ? raw.confidence : null

  return {
    through,
    teams: [...byAbbr.values()].sort((a, b) => a.team_abbr.localeCompare(b.team_abbr)),
    unmatched,
    confidence,
  }
}

async function extractWithOpenAi(
  openaiApiKey: string,
  mimeType: string,
  base64: string,
): Promise<ReturnType<typeof normalizeTeams>> {
  const prompt = `
You are reading an ESPN Analytics NFL team win-rate rankings screenshot.
Extract ONLY the team table (not player / edge / DT / OT / IOL leaderboards).
Return strict JSON only (no markdown):
{
  "confidence": 0.0-1.0,
  "through": "Week N or date text if visible, else null",
  "teams": [
    {
      "team_name": "Arizona Cardinals",
      "team_abbr": "ARI",
      "prwr": 39,
      "rswr": 30,
      "pbwr": 63,
      "rbwr": 71
    }
  ]
}

Column order on ESPN is usually: team, PRWR, RSWR, PBWR, RBWR.
Cells look like "39% (13)" … return the percent only (39), ignore the rank in parens.

Rules:
- Read printed numbers only. Do not invent teams.
- Include every readable NFL team row (up to 32).
- Ignore player tables even if they appear in the same screenshot.
- Percents may be 39 or 39%. Return integers 0-100.
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
  return normalizeTeams(parsed)
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
      through: result.through,
      confidence: result.confidence,
      teams: result.teams,
      unmatched: result.unmatched,
      count: result.teams.length,
    })
  } catch (err) {
    return adminOpsJson(500, {
      error: err instanceof Error ? err.message : String(err),
      code: 'vision_failed',
    })
  }
})
