/**
 * sports-bet-slip-parse
 *
 * JWT. Heuristic OCR failed or looked weak … OpenAI extracts a sports_bets draft.
 * Accepts OCR `text` and/or slip `imageBase64` (vision when image present).
 *
 * Secrets: OPENAI_API_KEY (same as w2g-vision-extract)
 * Optional: OPENAI_VISION_MODEL / OPENAI_CHAT_MODEL (default gpt-6-luna)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import {
  openaiResponsesReasoningNone,
  resolveOpenAiChatModel,
  resolveOpenAiVisionModel,
} from '../_shared/openaiModelDefaults.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MAX_BYTES = 4_500_000
const MAX_TEXT = 12_000

type SlipLeg = {
  market: string
  side: string
  line: string
  odds: string
  selection_label: string
  player_name: string
  prop_stat: string
  home_team: string
  away_team: string
  event_label: string
  sport_key: string
  sport_label: string
}

type SlipDraft = {
  book: string
  market: string
  side: string
  line: string
  odds: string
  stake_dollars: string
  to_collect_dollars: string
  to_win_dollars: string
  status: string
  selection_label: string
  home_team: string
  away_team: string
  event_label: string
  sport_key: string
  sport_label: string
  commence_time: string
  player_name: string
  prop_stat: string
  notes: string
  legs: SlipLeg[]
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

function textOrEmpty(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value.replace(/\s+/g, ' ').trim()
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

function normalizeOdds(value: unknown): string {
  const raw = textOrEmpty(value)
  if (!raw) return ''
  // Up to 6 digits … fat casino parlays (+52285)
  const m = raw.match(/^([+-]?\d{2,6})$/)
  if (!m) return raw
  const n = Number(m[1])
  if (!Number.isFinite(n) || Math.abs(n) < 100) return raw
  return n > 0 ? `+${n}` : String(n)
}

function normalizeMoney(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return String(value)
  const raw = textOrEmpty(value).replace(/[$,]/g, '')
  if (!raw) return ''
  const n = Number(raw)
  return Number.isFinite(n) && n >= 0 ? String(n) : ''
}

function normalizeMarket(value: unknown): string {
  const m = textOrEmpty(value).toLowerCase()
  if (m === 'spread' || m === 'h2h' || m === 'total' || m === 'prop' || m === 'parlay' || m === 'other') {
    return m
  }
  if (/spread|ats|handicap/i.test(m)) return 'spread'
  if (/money\s*line|\bml\b|h2h|winner/i.test(m)) return 'h2h'
  if (/total|over\/under|\bou\b/i.test(m)) return 'total'
  if (/prop/i.test(m)) return 'prop'
  if (/parlay|sgp/i.test(m)) return 'parlay'
  return 'other'
}

function normalizeSide(value: unknown, market: string): string {
  const s = textOrEmpty(value).toLowerCase()
  if (!s || s === 'n/a' || s === 'na' || s === 'none') return ''
  if (s === 'home' || s === 'away' || s === 'over' || s === 'under' || s === 'draw') return s
  if (market === 'total' || market === 'prop') {
    if (/under/i.test(s)) return 'under'
    if (/over/i.test(s)) return 'over'
  }
  return ''
}

function normalizeSport(key: unknown, label: unknown): { sport_key: string; sport_label: string } {
  const k = textOrEmpty(key).toLowerCase()
  const lab = textOrEmpty(label)
  if (k.includes('nfl') || /^nfl$/i.test(lab)) {
    return { sport_key: 'americanfootball_nfl', sport_label: 'NFL' }
  }
  if (k.includes('ncaaf') || /cfb|ncaaf|college/i.test(lab) || /cfb|ncaaf/i.test(k)) {
    return { sport_key: 'americanfootball_ncaaf', sport_label: 'CFB' }
  }
  if (k.includes('nba') || /^nba$/i.test(lab)) {
    return { sport_key: 'basketball_nba', sport_label: 'NBA' }
  }
  if (k.includes('mlb') || /^mlb$/i.test(lab)) {
    return { sport_key: 'baseball_mlb', sport_label: 'MLB' }
  }
  if (k.includes('nhl') || /^nhl$/i.test(lab)) {
    return { sport_key: 'icehockey_nhl', sport_label: 'NHL' }
  }
  if (k.includes('mma') || /ufc|mma/i.test(lab)) {
    return { sport_key: 'mma_mixed_martial_arts', sport_label: 'UFC' }
  }
  if (k.includes('boxing') || /boxing/i.test(lab)) {
    return { sport_key: 'boxing_boxing', sport_label: 'Boxing' }
  }
  if (k.includes('tabletennis') || k.includes('table_tennis') || /table\s*tennis/i.test(lab)) {
    return { sport_key: 'tabletennis', sport_label: 'Table Tennis' }
  }
  if (k === 'tennis' || k.includes('tennis') || /\btennis\b|\batp\b|\bwta\b/i.test(lab)) {
    // Avoid re-matching table tennis (handled above)
    if (!/table/.test(k) && !/table\s*tennis/i.test(lab)) {
      return { sport_key: 'tennis', sport_label: 'Tennis' }
    }
  }
  if (lab) return { sport_key: k || 'other', sport_label: lab }
  return { sport_key: '', sport_label: '' }
}

function normalizeCommence(value: unknown): string {
  const raw = textOrEmpty(value)
  if (!raw) return ''
  const dt = new Date(raw)
  if (!Number.isNaN(dt.getTime())) return dt.toISOString()
  return ''
}

function normalizeLegs(value: unknown): SlipLeg[] {
  if (!Array.isArray(value)) return []
  const out: SlipLeg[] = []
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue
    const leg = raw as Record<string, unknown>
    const market = normalizeMarket(leg.market) || 'h2h'
    const home = textOrEmpty(leg.home_team ?? leg.homeTeam)
    const away = textOrEmpty(leg.away_team ?? leg.awayTeam)
    const eventLabel = textOrEmpty(leg.event_label ?? leg.eventLabel)
      || (away && home ? `${away} @ ${home}` : '')
    const selection = textOrEmpty(leg.selection_label ?? leg.selectionLabel ?? leg.selection)
    const odds = normalizeOdds(leg.odds)
    if (!selection && !odds) continue
    const sport = normalizeSport(leg.sport_key ?? leg.sportKey, leg.sport_label ?? leg.sportLabel)
    out.push({
      market,
      side: normalizeSide(leg.side, market),
      line: textOrEmpty(leg.line),
      odds,
      selection_label: selection,
      player_name: textOrEmpty(leg.player_name ?? leg.playerName),
      prop_stat: textOrEmpty(leg.prop_stat ?? leg.propStat),
      home_team: home,
      away_team: away,
      event_label: eventLabel,
      sport_key: sport.sport_key,
      sport_label: sport.sport_label,
    })
  }
  return out
}

function normalizeDraft(raw: Record<string, unknown>): SlipDraft {
  const nested =
    raw.draft && typeof raw.draft === 'object'
      ? (raw.draft as Record<string, unknown>)
      : raw
  const market = normalizeMarket(nested.market)
  const sport = normalizeSport(nested.sport_key ?? nested.sportKey, nested.sport_label ?? nested.sportLabel)
  const home = textOrEmpty(nested.home_team ?? nested.homeTeam)
  const away = textOrEmpty(nested.away_team ?? nested.awayTeam)
  const eventLabel = textOrEmpty(nested.event_label ?? nested.eventLabel)
    || (away && home ? `${away} @ ${home}` : '')
  const stake_dollars = normalizeMoney(nested.stake_dollars ?? nested.stakeDollars ?? nested.stake)
  let to_win_dollars = normalizeMoney(nested.to_win_dollars ?? nested.toWinDollars ?? nested.to_win)
  let collect = normalizeMoney(
    nested.to_collect_dollars ?? nested.toCollectDollars ?? nested.to_collect ?? nested.payout_dollars,
  )
  if (!collect && to_win_dollars && stake_dollars) {
    const n = Number(stake_dollars) + Number(to_win_dollars)
    if (Number.isFinite(n) && n > 0) collect = String(n)
  }
  if (!to_win_dollars && collect && stake_dollars) {
    const n = Number(collect) - Number(stake_dollars)
    if (Number.isFinite(n) && n > 0) to_win_dollars = String(n)
  }
  // Only keep printed American totals. Never invent from stake→collect or leg product.
  let odds = normalizeOdds(nested.odds)
  if (odds) {
    // Drop obvious stolen last-leg juices when money fields exist (client also clears these)
    const cur = Number(String(odds).replace(/^\+/, ''))
    if (
      collect && stake_dollars
      && Number.isFinite(cur)
      && Math.abs(cur) < 500
      && Number(collect) > Number(stake_dollars) * 10
    ) {
      odds = ''
    }
  }
  const statusRaw = textOrEmpty(nested.status).toLowerCase()
  const status = ['won', 'lost', 'push', 'void', 'open'].includes(statusRaw)
    ? statusRaw
    : 'open'
  return {
    book: textOrEmpty(nested.book),
    market,
    side: normalizeSide(nested.side, market),
    line: textOrEmpty(nested.line),
    odds,
    stake_dollars,
    to_collect_dollars: collect,
    to_win_dollars,
    status,
    selection_label: textOrEmpty(nested.selection_label ?? nested.selectionLabel ?? nested.selection),
    home_team: home,
    away_team: away,
    event_label: eventLabel,
    sport_key: sport.sport_key,
    sport_label: sport.sport_label,
    commence_time: normalizeCommence(nested.commence_time ?? nested.commenceTime ?? nested.event_date),
    player_name: textOrEmpty(nested.player_name ?? nested.playerName),
    prop_stat: textOrEmpty(nested.prop_stat ?? nested.propStat),
    notes: textOrEmpty(nested.notes),
    legs: normalizeLegs(nested.legs),
  }
}

function draftLooksUsable(d: SlipDraft): boolean {
  const hasMoneyOdds = Boolean(d.stake_dollars && d.to_collect_dollars)
  if (!d.odds && !hasMoneyOdds) return false
  if (d.market === 'parlay') {
    return d.legs.length >= 2 || Boolean(d.selection_label) || Boolean(d.notes)
  }
  if (d.market === 'spread' && !d.line) return false
  if (d.market === 'h2h' || d.market === 'spread' || d.market === 'total') {
    return Boolean(d.home_team && d.away_team) || Boolean(d.selection_label)
  }
  return Boolean(d.selection_label || d.event_label)
}

const SYSTEM = `You extract one sportsbook bet slip into JSON for a bet tracker.
Return ONLY a JSON object with keys:
book, market, side, line, odds, stake_dollars, to_collect_dollars, to_win_dollars, status, selection_label,
home_team, away_team, event_label, sport_key, sport_label, commence_time,
player_name, prop_stat, notes, legs (array), confidence (0-1).

Rules:
- market: spread | h2h | total | prop | parlay | other
- side: home | away | over | under | draw | "" (empty when N/A … distance/method/round props)
- odds: American with sign (+120 / -110) ONLY when the ticket prints a combined / total odds figure. Leave "" if the slip only shows Ticket Cost + To Win / To Collect. NEVER copy a single leg's juice. NEVER invent odds by multiplying leg juices or from stake/payout math.
- Always fill stake_dollars + to_win_dollars + to_collect_dollars when those $ amounts appear (TO WIN / TO COLLECT / YOU WON / Max Payout / TOTAL WAGER / WON ON). These matter more than combined odds on casino tickets.
- stake_dollars: number only (no $). Map TAKE / Wager / Risk / Ticket Cost / TOTAL WAGER → stake (never invent from a default unit size). OCR may glue "$70.00 TOTAL WAGER" or put $ on the line above/below the label … still map it.
- to_collect_dollars: TO COLLECT / YOU WON / WON ON / Max Payout (includes stake). to_win_dollars: TO WIN profit only (or collect − stake). OCR may glue "$207.85 WON ON FANDUEL" or put $ above/below WON ON … do not use the TOTAL WAGER amount as the win.
- status: "won" when WON ON / YOU WON / Total Won / standalone WON badge (DK My Bets). "lost" when LOST / LOST ON / Did not win / $0.00 payout on a settled My Bets receipt (Finished + TOTAL WAGER, no PLACE BET). Otherwise "open". Never mark an open betslip (PLACE BET) as lost.
- DK "Wager: $X Paid: $Y" → stake_dollars=X, to_collect_dollars=Y (Paid includes stake)
- commence_time: ISO 8601 if event date/time known
- sport_label: NFL | CFB | NBA | MLB | NHL | UFC | Boxing | Golf | MLS | Tennis | Table Tennis | Other … fill whenever inferable (filter by sport)
- sport_key when known: americanfootball_nfl, americanfootball_ncaaf, basketball_nba, baseball_mlb, icehockey_nhl, mma_mixed_martial_arts, boxing_boxing, tennis, tabletennis
- Person vs person moneyline parlays with no league printed (common on US books) → Table Tennis unless Tennis/ATP/WTA/UFC/Boxing is explicit
- Point spreads: market=spread, line signed for the picked side (+3.5 or -9), side home/away from the matchup
- Casino codes like PLB before a spread mean point spread
- Ignore ticket barcodes, teller ids, terminal codes (e.g. CGT@MRH is NOT the event)
- Matchup lines like "467 COLTS/468 JAGUARS" → away Colts, home Jaguars (rotation numbers dropped)
- PARLAYS: market=parlay, odds=combined ticket odds, and legs=[...] with one object per leg (market, side, line, odds, selection_label, player_name, prop_stat, home_team, away_team, event_label). Do NOT put legs only in notes.
- If the slip says "Parlay 5 bets", "5-Leg Parlay", "PARLAY (5 TEAMS)", or "N Pick Parlay", legs[] MUST have exactly that many entries. Count every Money Line / pick row on the ticket (including middle legs like Duke between FSU and Kansas). Do not drop a leg.
- "3 Leg Parlay +584" / "4 Pick Parlay +1252" on an open betslip is the COMBINED ticket odds (and leg count), NOT a leg. Put +584 in odds; never as a legs[] selection_label.
- Casino slips with "[101] RAVENS" / "[522] KNICKS": each leg selection_label is the team only (e.g. "Ravens ML"). Never use date lines ("Jan 11 2026 - NFL PLAYOFFS"), rotation brackets in the label, or footer text (TICKET COST / TO WIN / TO COLLECT / YOU WON) as a leg.
- FanDuel settled My Bets alt lines: selection_label is the bold pick above ALTERNATE RUN LINES / ALTERNATE SPREAD / ALTERNATE PUCK LINE (e.g. "Minnesota Twins +3.5"). Never use opponent names, period/inning scores, "Finished", or digit runs ("26 25 31 23 105") as a leg. Count every ALTERNATE market row.
- FanDuel settled SGP props: player name above "TO HIT A HOME RUN" / "TO RECORD A STOLEN BASE" / "TO RECORD 2+ RBIS" / "TO SCORE N+ TOUCHDOWNS", plus team MONEYLINE rows. "Same Game Parlay +3134" is combined odds. "$5.00 $156.70" then "TOTAL WAGER WON ON FANDUEL" → stake + to_collect.
- If the image/OCR stacks two My Bets tickets (two BET ID lines), extract ONLY the first/top ticket. Do not mix legs or odds from the card below.
- Golf Top N Live Betting (e.g. "Justin Thomas -115" + "Top 10 Live Betting"): market=other, selection like "Justin Thomas Top 10", sport Golf. Dead Heat Paid can be less than Wager … still status=won, to_collect=Paid, to_win may be negative. Do not set sport=NBA because of the words Dead Heat.
- Collapsed "9 PICKS PARLAY" with only a few expanded legs: fill Wager/Paid/odds/status/sport + the visible legs (e.g. Anytime TD Scorer). Put the comma player list in notes as "Parlay picks (9): …". Do NOT invent the missing legs from that name list.
- "TOTAL WAGER CASHED OUT" with dual $ above → stake + to_collect, status=won (same as WON ON). Fully collapsed "19 leg parlay +odds" with only a name list: fill money/odds/notes, legs[] may be empty.
- BetMGM "Multi Bet • N picks LOST" with pipe name list ("T. Schoolkate | M. Purcell | …") and "Stake / Total odds / Payout -": market=parlay, status=lost, stake + printed total odds, to_win/to_collect=0, sport Tennis when Initial. Surname pipes (no team leagues), notes="Parlay picks (N): …", legs[] may be empty. Do not invent legs from the name list.
- DK SGPx "4 PICKS PARLAY +odds WON" with nested "2 PICKS SGP +4500" headers: those headers are NOT legs. Hydrate "2+ / Player Alternate RBIs" (and similar Alt props). Wager/Paid → stake + to_collect, status=won. notes="Parlay picks (N): …" from visible players when the crop cuts later legs. Do not invent missing SGP legs.
- DK "2 PICKS PARLAY +odds LOST" with fighter "Winner" markets (Mario Barrios / Canelo Alvarez): status=lost, sport Boxing (not UFC unless UFC/MMA printed), legs like "Mario Barrios Winner". Wager only + no Paid → to_win/to_collect=0.
- FanDuel "FIRST TOUCHDOWN SCORER" under player name (multi-game 4-leg etc.): market=prop, selection "Player First TD", sport NFL. "$100 TOTAL WAGER" + "$… WON ON FANDUEL" → stake + to_collect, status=won. Zip bunched per-leg juices when printed.
- FanDuel "TOTAL WAGER RETURNED" with "$stake $0.00" above → status=lost (not void), stake=non-zero $, to_win/to_collect=0. Collapsed "Same Game Parlay +odds" name list → notes="Parlay picks (N): …", legs[] may be empty. Extract ONLY the top ticket when stacked My Bets cards follow.
- FanDuel "St. Louis Cardinals Void" + MONEYLINE (or any "Team Void" + MONEYLINE): selection_label="St. Louis Cardinals ML", leg status=void (do not put Void in the label). Parent WON ON FANDUEL still status=won; other legs won.
- FanDuel "Uruguay" + "MONEYLINE (3-WAY)" (or any national + 3-way): selection_label="Uruguay ML (3-way)". MLB club + soccer 3-way/national in one parlay → leave sport blank. "2 leg parlay +391" is combined odds. Extract ONLY the top ticket when a second WON ON card follows.
- FanDuel dual "$5.00 $3.14" + "TOTAL WAGER CASHED OUT": left=stake, right=cashout (even when cashout < stake). status=won, to_win may be negative. ANY TIME TOUCHDOWN SCORER legs → ATD + NFL; Notes for declared N when crop is short.
- Fanatics My Bets "Wager Payout FCash" then "$65.00 $4,899.35 $4.35": left=stake, middle=to_collect (ignore FCash and Cash out $). "Team ±odds" + "Group K Winner" / FIFA World Cup → legs like "Portugal Group K Winner", sport Soccer. Collapsed 11-leg: visible Group Winner legs + notes="Parlay picks (11): …"; do not invent missing groups.
- Fliff/ESPN "Parlay: 3 Legs" + "Bout Betting" under fighter vs matchups: market=parlay, sport UFC (not Table Tennis). "ODDS PRICE BET AMOUNT TOTAL PAYOUT" then "+481 $25.00 $145.16" → odds/stake/to_collect, status=won. Legs like "Reinier De Ridder ML" from "@ Pick Won" rows.
- Open SGPx "4 Pick Parlay | +2872 +5745" + "Wager: $25 | To Pay: $1,461.25": odds=boosted (+5745), stake + to_collect from To Pay, status=open (ignore "If the bet is cashed out the boost…" disclaimer). Nested "2 Pick SGP | +odds" headers are NOT legs. Hydrate Anytime TD Scorer + Moneyline legs (Parkinson ATD, Rams ML, …).
- Fliff/ESPN "Parlay: 5 Legs" + "Money Line" under team "@ Pick Won" rows: market=parlay, sport MLB when clubs match. "ODDS PRICE BET AMOUNT TOTAL PAYOUT" then "+1376 $25.00 $455.02" → odds/stake/to_collect, status=won. Legs like "Tampa Bay Rays ML" (strip Won/@ OCR junk). Stop before a Straight SLIP ID below. Ignore PROMOTION/BONUS chrome.
- Fliff/ESPN Active Bets "Parlay: 3 Legs" + "Over 0.5 Open" + "Bryce Harper - Home Runs": market=parlay, sport MLB, legs like "Bryce Harper Over 0.5 Home Runs" (zip [ +340 ] when printed). "ODDS PRICE BET AMOUNT MAX WIN" then "+6588 $25 $1,647" → odds/stake/to_collect. Ignore PROMOTION/BONUS chrome.
- Player props like "Over 0.5 (Matt Olson) / MATT OLSON HOME RUNS / +360" → leg market=prop, side=over, line=0.5, player_name, prop_stat=Home Runs, odds=+360
- If unsure, still fill best effort; use market=other and side="" rather than inventing a fighter/team side`

async function callOpenAi(opts: {
  apiKey: string
  text: string
  imageBase64: string
  mimeType: string
}): Promise<{ draft: SlipDraft; confidence: number | null; model: string; engine: string }> {
  const useVision = Boolean(opts.imageBase64)
  const model = useVision ? resolveOpenAiVisionModel() : resolveOpenAiChatModel()
  const userContent: Array<Record<string, unknown>> = []
  if (opts.text) {
    userContent.push({
      type: 'input_text',
      text: `OCR / slip text:\n${opts.text.slice(0, MAX_TEXT)}`,
    })
  } else {
    userContent.push({ type: 'input_text', text: 'Extract the bet from this slip image.' })
  }
  if (useVision) {
    userContent.push({
      type: 'input_image',
      image_url: `data:${opts.mimeType};base64,${opts.imageBase64}`,
    })
  }

  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      ...openaiResponsesReasoningNone(),
      input: [
        { role: 'system', content: [{ type: 'input_text', text: SYSTEM }] },
        { role: 'user', content: userContent },
      ],
    }),
  })
  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`OpenAI HTTP ${res.status}${errText ? `: ${errText.slice(0, 200)}` : ''}`)
  }
  const payload = await res.json()
  const outputText = outputTextFromResponsesApi(payload)
  if (!outputText) throw new Error('OpenAI returned no text output.')
  const parsed = extractJsonObject(outputText)
  if (!parsed) throw new Error('Could not parse JSON from OpenAI output.')
  const draft = normalizeDraft(parsed)
  const confidence =
    typeof parsed.confidence === 'number' && Number.isFinite(parsed.confidence)
      ? parsed.confidence
      : null
  return {
    draft,
    confidence,
    model,
    engine: useVision ? 'openai-vision' : 'openai-text',
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json(405, { error: 'POST required.' })

  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) {
    return json(401, { error: 'Sign in required.', code: 'auth_required' })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const openaiApiKey = Deno.env.get('OPENAI_API_KEY') ?? ''
  if (!supabaseUrl || !supabaseAnonKey) {
    return json(500, { error: 'Supabase env not configured.' })
  }
  if (!openaiApiKey) {
    return json(500, { error: 'OPENAI_API_KEY not set.', code: 'missing_openai' })
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData?.user?.id) {
    return json(401, { error: 'Sign in required.', code: 'auth_required' })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json(400, { error: 'Invalid JSON body.' })
  }

  const text = textOrEmpty(body.text || body.ocrText || body.ocr_text).slice(0, MAX_TEXT)
  const imageBase64 = textOrEmpty(body.imageBase64 || body.image_base64).replace(/^data:[^;]+;base64,/, '')
  if (!text && !imageBase64) {
    return json(400, { error: 'text or imageBase64 required.' })
  }
  if (imageBase64 && imageBase64.length > Math.floor(MAX_BYTES * 1.4)) {
    return json(413, { error: 'Image too large. Re-scan at a lower resolution.' })
  }
  const mimeTypeRaw = textOrEmpty(body.mimeType || body.mime_type || 'image/jpeg').toLowerCase()
  const mimeType =
    mimeTypeRaw === 'image/png' || mimeTypeRaw === 'image/webp' || mimeTypeRaw === 'image/jpeg'
      ? mimeTypeRaw
      : 'image/jpeg'

  try {
    const result = await callOpenAi({
      apiKey: openaiApiKey,
      text,
      imageBase64,
      mimeType,
    })
    if (!draftLooksUsable(result.draft)) {
      return json(422, {
        error: 'AI could not extract a usable bet.',
        code: 'unusable_draft',
        draft: result.draft,
        confidence: result.confidence,
        engine: result.engine,
        model: result.model,
      })
    }
    return json(200, {
      draft: result.draft,
      confidence: result.confidence,
      engine: result.engine,
      model: result.model,
    })
  } catch (err) {
    return json(502, {
      error: err instanceof Error ? err.message : 'Slip parse failed.',
      code: 'llm_failed',
    })
  }
})
