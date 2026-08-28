/**
 * Predictive sports betting calls for the Sharp Desk (Scott, Rocco, Chedda, Tank).
 * Supports solo calls and syndicate multi-picker cards.
 * Auto-grades against The Odds API final scores with unit tracking and consolidated card recaps.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import {
  formatAmericanOdds,
  formatOddsCommenceTimeShort,
  shortDisplayName,
  type OddsPick,
} from './loungeBotOddsCaption.ts'
import { publishLoungeBotPost } from './loungeBotPublish.ts'

const ODDS_BASE = 'https://api.the-odds-api.com/v4'

export const SHARP_PICKERS = ['Scott', 'Rocco', 'Chedda', 'Tank'] as const
export type SharpPicker = (typeof SHARP_PICKERS)[number]

export type SinglePickerPick = {
  pickerName: SharpPicker
  pick: OddsPick
}

export type ScoreEvent = {
  id: string
  sport_key: string
  completed: boolean
  home_team?: string
  away_team?: string
  scores?: Array<{ name: string; score: string }>
}

/**
 * Format a single pick line for display.
 * E.g. "Diamondbacks +1.5 (-110)" or "Orioles ML (+125)" or "Over 8.5 (-105)"
 */
export function formatPickLine(pick: OddsPick): string {
  const odds = formatAmericanOdds(pick.pickPrice)
  if (pick.marketKey === 'h2h') {
    return `${shortDisplayName(pick.pickName)} ML (${odds})`
  }
  if (pick.marketKey === 'spreads' && pick.linePoint != null) {
    const pt = pick.linePoint > 0 ? `+${pick.linePoint}` : String(pick.linePoint)
    return `${shortDisplayName(pick.pickName)} ${pt} (${odds})`
  }
  if (pick.marketKey === 'totals' && pick.linePoint != null) {
    const side = /^over$/i.test(pick.pickName) ? 'Over' : /^under$/i.test(pick.pickName) ? 'Under' : pick.pickName
    return `${side} ${pick.linePoint} (${odds})`
  }
  return `${pick.pickName} (${odds})`
}

/**
 * Format a solo predictive pick post.
 *
 * Example:
 * 🎯 Chedda's Pick
 *
 * Cardinals ML (+165)
 * Cardinals vs 49ers (1:05 PM PT)
 */
export function formatSoloPredictiveCaption(pickerName: SharpPicker, pick: OddsPick): string {
  const line = formatPickLine(pick)
  const away = shortDisplayName(pick.awayTeam)
  const home = shortDisplayName(pick.homeTeam)
  const when = formatOddsCommenceTimeShort(pick.commenceTime)
  const matchup = `${away} vs ${home} (${when})`

  return `🎯 ${pickerName}'s Pick\n\n${line}\n${matchup}`
}

/**
 * Format a multi-picker syndicate card post.
 *
 * Example:
 * 🏈 Sunday Syndicate Card
 *
 * 🎯 Scott: Chiefs -3.5 (-110)
 * 🎯 Rocco: Lions -6.5 (-105)
 * 🎯 Chedda: Cardinals ML (+165)
 * 🎯 Tank: Over 47.5 (-110) Bills/Dolphins
 */
export function formatSyndicateCardCaption(title: string, picks: SinglePickerPick[]): string {
  const lines: string[] = [`${title || '🎯 Sharp Syndicate Card'}\n`]
  for (const item of picks) {
    const pLine = formatPickLine(item.pick)
    const away = shortDisplayName(item.pick.awayTeam)
    const home = shortDisplayName(item.pick.homeTeam)
    lines.push(`🎯 ${item.pickerName}: ${pLine} (${away}/${home})`)
  }
  return lines.join('\n')
}

/**
 * Classify a candidate pick to its best-matching Sharp Syndicate persona.
 *
 * Chedda: Moneyline underdog (+115 to +350)
 * Rocco: Spread & Runlines with solid juice
 * Tank: Totals (Over/Under) or primetime heavy spots
 * Scott: High EV / model baseline play
 */
export function classifyPickPersona(pick: OddsPick): SharpPicker {
  // Chedda: Plus-money underdogs
  if (pick.marketKey === 'h2h' && pick.pickPrice >= 115 && pick.pickPrice <= 350) {
    return 'Chedda'
  }
  // Tank: Game totals (Over/Under)
  if (pick.marketKey === 'totals') {
    return 'Tank'
  }
  // Rocco: Spreads / runlines
  if (pick.marketKey === 'spreads') {
    return 'Rocco'
  }
  // Scott: Pure model / EV baseline
  return 'Scott'
}

/**
 * Assemble a multi-picker syndicate card from a pool of candidate picks across today's games.
 * Tries to give 1 distinct pick to each persona (Scott, Rocco, Chedda, Tank) without duplicate events.
 */
export function buildSyndicateCard(
  candidates: OddsPick[],
  opts: { cardTitle?: string } = {},
): { cardTitle: string; picks: SinglePickerPick[] } | null {
  if (!candidates || candidates.length === 0) return null

  const usedEventIds = new Set<string>()
  const assignedPicks: SinglePickerPick[] = []

  // 1. Find Chedda (Plus-money dog)
  const cheddaCand = candidates.find(
    (p) => !usedEventIds.has(p.eventId) && p.marketKey === 'h2h' && p.pickPrice >= 115,
  )
  if (cheddaCand) {
    assignedPicks.push({ pickerName: 'Chedda', pick: cheddaCand })
    usedEventIds.add(cheddaCand.eventId)
  }

  // 2. Find Tank (Totals)
  const tankCand = candidates.find(
    (p) => !usedEventIds.has(p.eventId) && p.marketKey === 'totals',
  )
  if (tankCand) {
    assignedPicks.push({ pickerName: 'Tank', pick: tankCand })
    usedEventIds.add(tankCand.eventId)
  }

  // 3. Find Rocco (Spreads)
  const roccoCand = candidates.find(
    (p) => !usedEventIds.has(p.eventId) && p.marketKey === 'spreads',
  )
  if (roccoCand) {
    assignedPicks.push({ pickerName: 'Rocco', pick: roccoCand })
    usedEventIds.add(roccoCand.eventId)
  }

  // 4. Find Scott (Top EV remaining)
  const scottCand = candidates.find(
    (p) => !usedEventIds.has(p.eventId),
  )
  if (scottCand) {
    assignedPicks.push({ pickerName: 'Scott', pick: scottCand })
    usedEventIds.add(scottCand.eventId)
  }

  if (assignedPicks.length < 2) {
    return null // Not enough variety for a syndicate card
  }

  const title = opts.cardTitle || '🎯 Sharp Syndicate Card'
  return { cardTitle: title, picks: assignedPicks }
}

/**
 * Calculate net profit in units for a 1-unit bet based on American odds.
 */
export function calculateNetUnits(price: number, status: 'won' | 'lost' | 'push' | 'cancelled'): number {
  if (status === 'lost') return -1.0
  if (status === 'push' || status === 'cancelled') return 0.0
  if (status === 'won') {
    if (price > 0) return Math.round((price / 100) * 100) / 100
    if (price < 0) return Math.round((100 / Math.abs(price)) * 100) / 100
  }
  return 0.0
}

/**
 * Publish a solo pick or multi-picker syndicate card and record all entries in public.lounge_bot_picks.
 */
export async function publishAndRecordPicks(
  admin: SupabaseClient,
  input: {
    botUserId: string
    picks: SinglePickerPick[]
    cardTitle?: string
    categoryPills?: string[]
  },
): Promise<{ success: boolean; postId?: string; pickIds: string[]; error?: string }> {
  if (!input.picks.length) {
    return { success: false, pickIds: [], error: 'At least one pick required.' }
  }

  const isSolo = input.picks.length === 1
  const caption = isSolo
    ? formatSoloPredictiveCaption(input.picks[0].pickerName, input.picks[0].pick)
    : formatSyndicateCardCaption(input.cardTitle || '🎯 Sharp Syndicate Card', input.picks)

  const categoryPills = input.categoryPills || ['sports']

  const postRes = await publishLoungeBotPost(admin, {
    botUserId: input.botUserId,
    caption,
    categoryPills,
  })

  if (postRes.error || !postRes.postId) {
    return { success: false, pickIds: [], error: postRes.error || 'Failed to publish post' }
  }

  const rowsToInsert = input.picks.map((item) => ({
    bot_user_id: input.botUserId,
    picker_name: item.pickerName,
    post_id: postRes.postId,
    event_id: item.pick.eventId,
    sport_key: item.pick.sportKey,
    home_team: item.pick.homeTeam,
    away_team: item.pick.awayTeam,
    commence_time: item.pick.commenceTime,
    market_key: item.pick.marketKey,
    pick_name: item.pick.pickName,
    pick_line: item.pick.linePoint ?? null,
    pick_price: item.pick.pickPrice,
    book_title: item.pick.bookTitle || null,
    status: 'pending',
  }))

  const { data: insertedRows, error: pickErr } = await admin
    .from('lounge_bot_picks')
    .insert(rowsToInsert)
    .select('id')

  const pickIds = (insertedRows || []).map((r) => r.id)

  if (pickErr) {
    return {
      success: true,
      postId: postRes.postId,
      pickIds: [],
      error: `Published post, but ledger insert failed: ${pickErr.message}`,
    }
  }

  return { success: true, postId: postRes.postId, pickIds }
}

/**
 * Match a team string against home or away names.
 */
function isTeamMatch(targetName: string, candidateName: string): boolean {
  const t = targetName.trim().toLowerCase()
  const c = candidateName.trim().toLowerCase()
  if (t === c) return true
  if (t.includes(c) || c.includes(t)) return true
  const tLast = t.split(' ').pop() || ''
  const cLast = c.split(' ').pop() || ''
  return Boolean(tLast && cLast && tLast === cLast)
}

/**
 * Grade a single pick against final game scores.
 */
export function gradePickOutcome(
  pick: {
    picker_name?: string
    market_key: string
    pick_name: string
    pick_line: number | null
    pick_price: number
    home_team: string
    away_team: string
  },
  homeScore: number,
  awayScore: number,
): { status: 'won' | 'lost' | 'push'; unitsNet: number; summary: string; lineDisplay: string } {
  const { picker_name, market_key, pick_name, pick_line, pick_price, home_team, away_team } = pick
  const home = shortDisplayName(home_team)
  const away = shortDisplayName(away_team)
  const scoreSummary = `${away} ${awayScore}, ${home} ${homeScore}`
  const pName = picker_name ? `${picker_name}: ` : ''

  if (market_key === 'h2h') {
    const isHome = isTeamMatch(pick_name, home_team)
    const won = isHome ? homeScore > awayScore : awayScore > homeScore
    const push = homeScore === awayScore
    const status: 'won' | 'lost' | 'push' = push ? 'push' : won ? 'won' : 'lost'
    const unitsNet = calculateNetUnits(pick_price, status)
    const lineDisplay = `${shortDisplayName(pick_name)} ML`
    const summary = status === 'won'
      ? `✅ WIN: ${pName}${lineDisplay} cashes (${scoreSummary})`
      : status === 'lost'
        ? `❌ LOSS: ${pName}${scoreSummary}`
        : `🔄 PUSH: ${pName}${scoreSummary}`
    return { status, unitsNet, summary, lineDisplay }
  }

  if (market_key === 'spreads') {
    const isHome = isTeamMatch(pick_name, home_team)
    const line = Number(pick_line) || 0
    const diff = isHome ? (homeScore + line) - awayScore : (awayScore + line) - homeScore
    const status: 'won' | 'lost' | 'push' = diff > 0 ? 'won' : diff < 0 ? 'lost' : 'push'
    const unitsNet = calculateNetUnits(pick_price, status)
    const lineStr = line > 0 ? `+${line}` : String(line)
    const lineDisplay = `${shortDisplayName(pick_name)} ${lineStr}`
    const summary = status === 'won'
      ? `✅ WIN: ${pName}${lineDisplay} cashes (${scoreSummary})`
      : status === 'lost'
        ? `❌ LOSS: ${pName}${scoreSummary}`
        : `🔄 PUSH: ${pName}${lineDisplay} (${scoreSummary})`
    return { status, unitsNet, summary, lineDisplay }
  }

  if (market_key === 'totals') {
    const line = Number(pick_line) || 0
    const total = homeScore + awayScore
    const isOver = /^over/i.test(pick_name)
    const status: 'won' | 'lost' | 'push' = total === line
      ? 'push'
      : (isOver ? total > line : total < line)
        ? 'won'
        : 'lost'
    const unitsNet = calculateNetUnits(pick_price, status)
    const side = isOver ? 'Over' : 'Under'
    const lineDisplay = `${side} ${line}`
    const summary = status === 'won'
      ? `✅ WIN: ${pName}${lineDisplay} cashes (${total} pts · ${scoreSummary})`
      : status === 'lost'
        ? `❌ LOSS: ${pName}${total} pts (${scoreSummary})`
        : `🔄 PUSH: ${pName}Exactly ${line} pts (${scoreSummary})`
    return { status, unitsNet, summary, lineDisplay }
  }

  return { status: 'push', unitsNet: 0, summary: scoreSummary, lineDisplay: pick_name }
}

/**
 * Poll The Odds API scores endpoint for all sports with pending picks,
 * resolve game outcomes, grade each pick, record units, and post auto-reply comments.
 */
export async function gradePendingPicks(
  admin: SupabaseClient,
  apiKey: string,
  botUserId?: string,
): Promise<{ resolved: number; errors: string[] }> {
  const errors: string[] = []
  let resolvedCount = 0

  let query = admin
    .from('lounge_bot_picks')
    .select('*')
    .eq('status', 'pending')
    .lte('commence_time', new Date(Date.now() - 90 * 60 * 1000).toISOString()) // started >90m ago

  if (botUserId) {
    query = query.eq('bot_user_id', botUserId)
  }

  const { data: pendingPicks, error: fetchErr } = await query
  if (fetchErr || !pendingPicks || pendingPicks.length === 0) {
    return { resolved: 0, errors: fetchErr ? [fetchErr.message] : [] }
  }

  // Group pending picks by sport_key
  const bySport = new Map<string, typeof pendingPicks>()
  for (const p of pendingPicks) {
    const list = bySport.get(p.sport_key) || []
    list.push(p)
    bySport.set(p.sport_key, list)
  }

  const updatedPickIds = new Set<string>()

  for (const [sportKey, picks] of bySport.entries()) {
    try {
      const url = `${ODDS_BASE}/sports/${encodeURIComponent(sportKey)}/scores/?apiKey=${encodeURIComponent(apiKey)}&daysFrom=3`
      const res = await fetch(url, { headers: { Accept: 'application/json' } })
      if (!res.ok) {
        errors.push(`Scores API ${sportKey}: HTTP ${res.status}`)
        continue
      }
      const scoreEvents: ScoreEvent[] = await res.json()
      const eventById = new Map<string, ScoreEvent>()
      for (const ev of scoreEvents) {
        if (ev.id) eventById.set(ev.id, ev)
      }

      for (const pick of picks) {
        const ev = eventById.get(pick.event_id)
        if (!ev || !ev.completed || !Array.isArray(ev.scores) || ev.scores.length < 2) {
          continue
        }

        // Parse scores
        const s1 = ev.scores[0]
        const s2 = ev.scores[1]
        const score1 = parseInt(s1.score, 10)
        const score2 = parseInt(s2.score, 10)
        if (isNaN(score1) || isNaN(score2)) continue

        let homeScore = 0
        let awayScore = 0
        if (isTeamMatch(s1.name, pick.home_team)) {
          homeScore = score1
          awayScore = score2
        } else {
          homeScore = score2
          awayScore = score1
        }

        const grade = gradePickOutcome(pick, homeScore, awayScore)

        // Update pick row
        await admin
          .from('lounge_bot_picks')
          .update({
            status: grade.status,
            home_score: homeScore,
            away_score: awayScore,
            units_net: grade.unitsNet,
            resolved_at: new Date().toISOString(),
          })
          .eq('id', pick.id)

        updatedPickIds.add(pick.id)
        resolvedCount++
      }
    } catch (err: unknown) {
      errors.push(`Error grading ${sportKey}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // Now handle comment replies for posts where all picks are now resolved
  if (updatedPickIds.size > 0) {
    // Find unique posts affected
    const affectedPostIds = new Set<string>()
    for (const p of pendingPicks) {
      if (updatedPickIds.has(p.id) && p.post_id) {
        affectedPostIds.add(p.post_id)
      }
    }

    for (const postId of affectedPostIds) {
      // Check if ALL picks for this post are now resolved
      const { data: postPicks } = await admin
        .from('lounge_bot_picks')
        .select('*')
        .eq('post_id', postId)

      if (!postPicks || postPicks.length === 0) continue
      const hasPending = postPicks.some((p) => p.status === 'pending')
      if (hasPending) continue // wait until all picks in the card are finished

      // Check if we already posted a comment
      const alreadyCommented = postPicks.some((p) => p.comment_id != null)
      if (alreadyCommented) continue

      let commentText = ''
      const botUserId = postPicks[0].bot_user_id

      if (postPicks.length === 1) {
        // Solo pick comment
        const p = postPicks[0]
        const grade = gradePickOutcome(p, p.home_score ?? 0, p.away_score ?? 0)
        commentText = grade.summary
      } else {
        // Syndicate multi-picker card comment recap
        let cardWins = 0
        let cardLosses = 0
        let cardPushes = 0
        let cardUnits = 0

        const lines: string[] = ['📊 Final Card Results:\n']
        for (const p of postPicks) {
          const icon = p.status === 'won' ? '✅' : p.status === 'lost' ? '❌' : '🔄'
          const unitsStr = Number(p.units_net) > 0 ? `+${p.units_net}u` : `${p.units_net}u`
          const grade = gradePickOutcome(p, p.home_score ?? 0, p.away_score ?? 0)
          lines.push(`${icon} ${p.picker_name}: ${grade.lineDisplay} (${unitsStr})`)

          if (p.status === 'won') cardWins++
          else if (p.status === 'lost') cardLosses++
          else if (p.status === 'push') cardPushes++
          cardUnits += Number(p.units_net) || 0
        }

        const pushNote = cardPushes > 0 ? `-${cardPushes}` : ''
        const unitsFormatted = cardUnits > 0 ? `+${cardUnits.toFixed(2)}` : cardUnits.toFixed(2)
        lines.push(`\nCard Total: ${cardWins}-${cardLosses}${pushNote} (${unitsFormatted}u)`)
        commentText = lines.join('\n')
      }

      // Post the comment
      const { data: commentRow } = await admin
        .from('feed_comments')
        .insert({
          post_id: postId,
          user_id: botUserId,
          comment_text: commentText,
        })
        .select('id')
        .single()

      if (commentRow?.id) {
        await admin
          .from('lounge_bot_picks')
          .update({ comment_id: commentRow.id })
          .eq('post_id', postId)
      }
    }
  }

  return { resolved: resolvedCount, errors }
}
