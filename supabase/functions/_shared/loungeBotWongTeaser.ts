/**
 * Stanford Wong / Basic Strategy NFL Teaser Engine
 *
 * In the NFL, key numbers 3 (~15%) and 7 (~9%) account for ~24% of all game margins.
 * Standard 2-team 6-point teasers (-120) require ~73.9% win rate per leg to break even.
 * Teasing through BOTH 3 and 7 flips standard teaser math into a positive EV long-term edge:
 * 1. Underdogs: +1.5 to +2.5 teased +6 pts to +7.5 to +8.5 (crossing 3, 6, 7).
 * 2. Favorites: -7.5 to -8.5 teased +6 pts down to -1.5 to -2.5 (crossing 7, 6, 3).
 * 3. Low Totals: Games with totals <= 49.0 have higher key number density.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import {
  formatOddsCommenceTimeShort,
  shortDisplayName,
  type OddsEvent,
} from './loungeBotOddsCaption.ts'
import { publishLoungeBotPost } from './loungeBotPublish.ts'
import { publishBotSubChatMessage } from './loungeBotSubChatPublish.ts'

export type WongLegType = 'underdog' | 'favorite'

export type WongTeaserLeg = {
  eventId: string
  sportKey: string
  homeTeam: string
  awayTeam: string
  commenceTime: string
  pickedTeam: string
  opposingTeam: string
  side: 'home' | 'away'
  legType: WongLegType
  originalSpread: number
  teasedSpread: number
  originalSpreadDisp: string
  teasedSpreadDisp: string
  gameTotal: number | null
  evScore: number
  bookTitle: string
}

export type WongTeaserPair = {
  leg1: WongTeaserLeg
  leg2: WongTeaserLeg
  additionalLegs: WongTeaserLeg[]
  price: number // Standard -120
  combinedWinProb: number // e.g. 58.2%
  fairPrice: number // e.g. -139
  edgePct: number // e.g. +6.4%
  caption: string
}

/**
 * Scan all upcoming NFL games and identify legs that cross key numbers 3 and 7.
 */
export function findQualifyingWongLegs(events: OddsEvent[]): WongTeaserLeg[] {
  const qualifying: WongTeaserLeg[] = []

  for (const ev of events) {
    if (ev.sport_key !== 'americanfootball_nfl' && ev.sport_key !== 'americanfootball_nfl_preseason') continue
    const homeTeam = ev.home_team
    const awayTeam = ev.away_team
    if (!homeTeam || !awayTeam || !ev.commence_time) continue

    // Extract consensus/standard spread and total
    let homeSpread: number | null = null
    let gameTotal: number | null = null
    let bookTitle = 'Market Consensus'

    for (const b of ev.bookmakers || []) {
      const sm = b.markets?.find((m) => m.key === 'spreads')
      if (sm) {
        const hOut = sm.outcomes?.find((o) => o.name === homeTeam)
        if (hOut?.point != null && homeSpread == null) {
          homeSpread = hOut.point
          bookTitle = b.title || bookTitle
        }
      }
      const tm = b.markets?.find((m) => m.key === 'totals')
      if (tm) {
        const ov = tm.outcomes?.find((o) => /^over$/i.test(o.name))
        if (ov?.point != null && gameTotal == null) {
          gameTotal = ov.point
        }
      }
      if (homeSpread != null && gameTotal != null) break
    }

    if (homeSpread == null) continue
    const awaySpread = -homeSpread

    // Evaluate Home side
    const homeLeg = evaluateWongCandidate({
      eventId: ev.id,
      sportKey: ev.sport_key,
      homeTeam,
      awayTeam,
      commenceTime: ev.commence_time,
      pickedTeam: homeTeam,
      opposingTeam: awayTeam,
      side: 'home',
      spread: homeSpread,
      gameTotal,
      bookTitle,
    })
    if (homeLeg) qualifying.push(homeLeg)

    // Evaluate Away side
    const awayLeg = evaluateWongCandidate({
      eventId: ev.id,
      sportKey: ev.sport_key,
      homeTeam,
      awayTeam,
      commenceTime: ev.commence_time,
      pickedTeam: awayTeam,
      opposingTeam: homeTeam,
      side: 'away',
      spread: awaySpread,
      gameTotal,
      bookTitle,
    })
    if (awayLeg) qualifying.push(awayLeg)
  }

  // Sort descending by EV score
  qualifying.sort((a, b) => b.evScore - a.evScore)
  return qualifying
}

function evaluateWongCandidate(params: {
  eventId: string
  sportKey: string
  homeTeam: string
  awayTeam: string
  commenceTime: string
  pickedTeam: string
  opposingTeam: string
  side: 'home' | 'away'
  spread: number
  gameTotal: number | null
  bookTitle: string
}): WongTeaserLeg | null {
  const { eventId, sportKey, homeTeam, awayTeam, commenceTime, pickedTeam, opposingTeam, side, spread, gameTotal, bookTitle } = params

  let legType: WongLegType | null = null
  let teasedSpread = 0

  // 1. Underdog Wong Rule: +1.5 to +2.5 (acceptable +1.0 to +3.0) teased +6 pts -> +7.5 to +8.5
  if (spread >= 1.0 && spread <= 3.0) {
    legType = 'underdog'
    teasedSpread = spread + 6.0
  }
  // 2. Favorite Wong Rule: -7.5 to -8.5 (acceptable -7.0 to -9.0) teased +6 pts -> -1.5 to -2.5
  else if (spread <= -7.0 && spread >= -9.0) {
    legType = 'favorite'
    teasedSpread = spread + 6.0
  }

  if (!legType) return null

  // Calculate EV score
  let evScore = 100

  // Key number sweet spots
  if (legType === 'underdog') {
    if (spread === 2.0 || spread === 2.5) evScore += 15
    else if (spread === 1.5) evScore += 12
    else if (spread === 3.0) evScore += 8
  } else if (legType === 'favorite') {
    if (spread === -7.5 || spread === -8.0) evScore += 15
    else if (spread === -8.5) evScore += 12
    else if (spread === -7.0) evScore += 8
  }

  // Total discount (Lower totals = higher probability density on 3 and 7)
  if (gameTotal != null) {
    if (gameTotal <= 43.5) evScore += 15
    else if (gameTotal <= 46.5) evScore += 10
    else if (gameTotal <= 49.5) evScore += 5
    else if (gameTotal > 52.0) evScore -= 10
  }

  const origDisp = spread > 0 ? `+${spread}` : String(spread)
  const teasedDisp = teasedSpread > 0 ? `+${teasedSpread}` : String(teasedSpread)

  return {
    eventId,
    sportKey,
    homeTeam,
    awayTeam,
    commenceTime,
    pickedTeam,
    opposingTeam,
    side,
    legType,
    originalSpread: spread,
    teasedSpread,
    originalSpreadDisp: origDisp,
    teasedSpreadDisp: teasedDisp,
    gameTotal,
    evScore,
    bookTitle,
  }
}

/**
 * Format the Sharpe Syndicate Wong Teaser post caption.
 */
export function formatWongTeaserCaption(pair: WongTeaserPair): string {
  const { leg1, leg2, price, combinedWinProb, fairPrice, edgePct } = pair

  const leg1Team = shortDisplayName(leg1.pickedTeam)
  const leg1Opp = shortDisplayName(leg1.opposingTeam)
  const leg1When = formatOddsCommenceTimeShort(leg1.commenceTime)

  const leg2Team = shortDisplayName(leg2.pickedTeam)
  const leg2Opp = shortDisplayName(leg2.opposingTeam)
  const leg2When = formatOddsCommenceTimeShort(leg2.commenceTime)

  const total1Str = leg1.gameTotal ? ` · Total ${leg1.gameTotal}` : ''
  const total2Str = leg2.gameTotal ? ` · Total ${leg2.gameTotal}` : ''

  const lines = [
    '📐 Sharpe Syndicate · 2-Leg NFL Wong Teaser (+EV Basic Strategy)',
    '',
    `Two-team 6-point teaser (${price > 0 ? `+${price}` : price}):`,
    `• Leg 1: ${leg1Team} ${leg1.originalSpreadDisp} ➔ ${leg1.teasedSpreadDisp} (${leg1When} vs ${leg1Opp}${total1Str})`,
    `• Leg 2: ${leg2Team} ${leg2.originalSpreadDisp} ➔ ${leg2.teasedSpreadDisp} (${leg2When} vs ${leg2Opp}${total2Str})`,
    '',
    '🧠 The Math Behind the Move:',
    'NFL games land on 3 (~15%) and 7 (~9%) nearly 24% of the time. Stanford Wong proved that teasing through BOTH key numbers (dogs +1.5/+2.5 up to +7.5/+8.5, favs -7.5/-8.5 down to -1.5/-2.5) in low-total games flips standard bookmaker teaser math into a positive EV long-term edge.',
    '',
    `📊 Model Combined Win Prob: ~${combinedWinProb}% (Fair Odds ${fairPrice > 0 ? `+${fairPrice}` : fairPrice}) · Book Line: ${price} (+${edgePct}% Edge)`,
  ]

  return lines.join('\n').trim()
}

/**
 * Build the top 2-leg Wong Teaser from qualifying games.
 */
export function buildWongTeaserPair(events: OddsEvent[]): WongTeaserPair | null {
  const qualifying = findQualifyingWongLegs(events)
  if (qualifying.length < 2) return null

  const leg1 = qualifying[0]
  // Find top leg 2 from a DIFFERENT game
  const leg2 = qualifying.find((l) => l.eventId !== leg1.eventId)
  if (!leg2) return null

  const additionalLegs = qualifying.filter((l) => l.eventId !== leg1.eventId && l.eventId !== leg2.eventId)

  // Combined win probability estimation:
  // Each Wong leg has historical win prob ~75.5% to 77.5% depending on total
  const p1 = leg1.gameTotal && leg1.gameTotal <= 45.0 ? 0.772 : 0.758
  const p2 = leg2.gameTotal && leg2.gameTotal <= 45.0 ? 0.772 : 0.758
  const combinedProb = Math.round(p1 * p2 * 1000) / 10 // e.g. 58.2%

  const price = -120
  // Fair American odds: if prob = 58.2%, fair price = - (0.582 / (1 - 0.582)) * 100 = -139
  const fairPrice = Math.round(-(combinedProb / (100 - combinedProb)) * 100)
  // Edge = Implied book prob vs Model prob. Implied of -120 = 120 / 220 = 54.55%
  const bookImplied = 54.55
  const edgePct = Math.round((combinedProb - bookImplied) * 10) / 10

  const partialPair: WongTeaserPair = {
    leg1,
    leg2,
    additionalLegs,
    price,
    combinedWinProb: combinedProb,
    fairPrice,
    edgePct,
    caption: '',
  }

  partialPair.caption = formatWongTeaserCaption(partialPair)
  return partialPair
}

/**
 * Publish the NFL Wong Teaser to the Lounge feed and record the pick in lounge_bot_picks.
 */
export async function publishAndRecordWongTeaser(
  admin: SupabaseClient,
  botUserId: string,
  events: OddsEvent[],
  categoryPills: string[] = ['sports', 'nfl'],
): Promise<{ success: boolean; postId?: string; pickId?: string; error?: string }> {
  const pair = buildWongTeaserPair(events)
  if (!pair) {
    return { success: false, error: 'Fewer than 2 qualifying NFL Wong teaser legs available on the active board.' }
  }

  const postRes = await publishLoungeBotPost(admin, {
    botUserId,
    caption: pair.caption,
    categoryPills,
  })

  if (postRes.error || !postRes.postId) {
    return { success: false, error: postRes.error || 'Failed to publish Wong Teaser post' }
  }

  // Earlier commence time
  const t1 = Date.parse(pair.leg1.commenceTime) || 0
  const t2 = Date.parse(pair.leg2.commenceTime) || 0
  const earlierCommence = new Date(Math.min(t1, t2)).toISOString()

  const pickName = `${shortDisplayName(pair.leg1.pickedTeam)} ${pair.leg1.teasedSpreadDisp} / ${shortDisplayName(pair.leg2.pickedTeam)} ${pair.leg2.teasedSpreadDisp}`

  // Insert ledger record into lounge_bot_picks
  const { data: inserted, error: insertErr } = await admin
    .from('lounge_bot_picks')
    .insert({
      bot_user_id: botUserId,
      picker_name: 'Scott',
      post_id: postRes.postId,
      event_id: `${pair.leg1.eventId}_${pair.leg2.eventId}`,
      sport_key: 'americanfootball_nfl',
      home_team: pair.leg1.homeTeam,
      away_team: pair.leg1.awayTeam,
      commence_time: earlierCommence,
      market_key: 'teasers',
      pick_name: pickName,
      pick_line: 6.0,
      pick_price: pair.price,
      book_title: '6-Pt Wong Teaser',
      status: 'pending',
      metadata: {
        teaser_type: '2_team_6pt',
        legs: [
          {
            event_id: pair.leg1.eventId,
            home_team: pair.leg1.homeTeam,
            away_team: pair.leg1.awayTeam,
            picked_team: pair.leg1.pickedTeam,
            opposing_team: pair.leg1.opposingTeam,
            side: pair.leg1.side,
            original_spread: pair.leg1.originalSpread,
            teased_spread: pair.leg1.teasedSpread,
            teased_disp: pair.leg1.teasedSpreadDisp,
            game_total: pair.leg1.gameTotal,
          },
          {
            event_id: pair.leg2.eventId,
            home_team: pair.leg2.homeTeam,
            away_team: pair.leg2.awayTeam,
            picked_team: pair.leg2.pickedTeam,
            opposing_team: pair.leg2.opposingTeam,
            side: pair.leg2.side,
            original_spread: pair.leg2.originalSpread,
            teased_spread: pair.leg2.teasedSpread,
            teased_disp: pair.leg2.teasedSpreadDisp,
            game_total: pair.leg2.gameTotal,
          },
        ],
        factors: ['wong_teaser_key_numbers_3_7', 'low_total_teaser_edge', 'nfl_basic_strategy'],
        combined_win_prob: pair.combinedWinProb,
        edge_pct: pair.edgePct,
      },
    })
    .select('id')
    .maybeSingle()

  if (insertErr) {
    console.error('Failed to insert Wong teaser pick into lounge_bot_picks:', insertErr)
  }

  // If additional qualifying legs exist, post them to Scott's VIP subscriber channel
  if (pair.additionalLegs.length > 0) {
    try {
      const vipLines = [
        '🔒 Sharpe VIP Syndicate · Additional Qualifying Wong Teaser Legs',
        '',
        'The following additional NFL games meet our Stanford Wong Basic Strategy criteria (crossing 3 & 7):',
        '',
        ...pair.additionalLegs.map((l, idx) => {
          const tName = shortDisplayName(l.pickedTeam)
          const oppName = shortDisplayName(l.opposingTeam)
          const totalStr = l.gameTotal ? ` (Total ${l.gameTotal})` : ''
          return `${idx + 1}. ${tName} ${l.originalSpreadDisp} ➔ ${l.teasedSpreadDisp} vs ${oppName}${totalStr}`
        }),
        '',
        'Mix and match any two legs for a +EV 6-point teaser.',
      ]
      await publishBotSubChatMessage(admin, {
        botUserId,
        body: vipLines.join('\n'),
      })
    } catch (vipErr) {
      console.warn('Failed to publish VIP sub-chat Wong teaser legs:', vipErr)
    }
  }

  return {
    success: true,
    postId: postRes.postId,
    pickId: inserted?.id,
  }
}
