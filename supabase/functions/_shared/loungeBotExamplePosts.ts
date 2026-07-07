/**
 * Scott Sharpe portal smoke pack: canonical example caption per post kind.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { resolveAlertSubscriberOnly } from './loungeBotAlertAudience.ts'
import { publishLoungeBotPostWithThread } from './loungeBotPublish.ts'

export type ScottExamplePostSpec = {
  postKind: string
  label: string
  caption: string
  threadParts?: string[]
}

/** One feed post per automated Scott alert type (portal preview pack). */
export const SCOTT_EXAMPLE_POST_SPECS: ScottExamplePostSpec[] = [
  {
    postKind: 'edge',
    label: '+EV Edge',
    caption: [
      '⚡ +EV Edge',
      '',
      'World Cup',
      'France vs Paraguay · Sat 2PM PT',
      '',
      'France ML +718 @ MyBookie',
      '+8.8% EV on ML · fair +652 (9 books)',
    ].join('\n'),
  },
  {
    postKind: 'coffee_covers',
    label: 'Coffee & Covers',
    caption: [
      '☕ Coffee & Covers 💵',
      '',
      'No strong covers today - sitting on hands until we see better value.',
      '',
      '- Best ML Spots Right Now -',
      '• World Cup - France vs Paraguay (Sat 2PM PT)',
      'France ML +718 @ MyBookie (+9.6% EV)',
      'France missing key midfielder due to suspension.',
      '• World Cup - Morocco vs Canada (Sat 10AM PT)',
      'Canada ML +490 @ BetUS (+3.1% EV)',
      '',
      '- Dog of the Day -',
      '• World Cup - France vs Paraguay (Sat 2PM PT)',
      'Paraguay ML +718 @ MyBookie',
      '',
      '- 🍺 On Tap Tomorrow -',
      '• Wimbledon - Mochizuki vs Sinner: Mochizuki ML +1600 @ DraftKings (+8.1% EV)',
      '• World Cup - Norway vs Brazil: Norway ML +367 @ FanDuel (+2.8% EV)',
      '',
      'Best lines 👇',
    ].join('\n'),
    threadParts: [
      [
        '⚾ MLB',
        '',
        'Yankees vs Red Sox (Sat 1PM PT)',
        '',
        'Yankees -110 @ FanDuel',
        'Red Sox +105 @ DraftKings',
      ].join('\n'),
    ],
  },
  {
    postKind: 'slate',
    label: 'Slate (legacy)',
    caption: [
      'World Cup slate',
      '',
      'France vs Paraguay · Sat 2PM PT',
      'France +145 @ DraftKings · Draw +652 @ FanDuel · Paraguay +718 @ MyBookie',
      '',
      'Germany vs Portugal · Sat 5PM PT',
      'Germany -110 @ FanDuel · Portugal +105 @ DraftKings',
    ].join('\n'),
  },
  {
    postKind: 'best_bet_hour',
    label: 'Best Bet of the Hour',
    caption: [
      '🔥 Best Bet of the Hour',
      '',
      'MLB',
      'Padres vs Dodgers · Sat 7:11 PM PT',
      '',
      'Padres ML +219 @ lowvig',
      '+7.8% EV',
      '',
      'Dylan Cease confirmed starting for Padres.',
    ].join('\n'),
  },
  {
    postKind: 'value_bet_radar',
    label: 'Value Bet Radar',
    caption: [
      '📡 Value Bet Radar',
      '',
      '• Padres ML +219 @ lowvig (+7.8% EV) · MLB · Sat 7:11 PM PT – Dylan Cease starting',
      '• Canada ML +490 @ BetUS (+3.1% EV) · World Cup · Sat 10AM PT',
      '• Giron ML +900 @ DraftKings (+4.2% EV) · Wimbledon · Sat 6:30 AM PT',
    ].join('\n'),
  },
  {
    postKind: 'arb_watch',
    label: 'Arb Watch',
    caption: [
      '🔒 Arb Watch',
      '',
      'World Cup',
      'France vs Paraguay · Sat 2PM PT',
      '',
      'France ML +102 @ FanDuel',
      'Draw ML +210 @ DraftKings',
      '',
      'Guaranteed +3.4% profit no matter the result.',
      'Stake $51 on France and $49 on Draw ($100 total) for $3.40 profit.',
    ].join('\n'),
  },
  {
    postKind: 'sharp_report',
    label: "Sharpe's Sharp Report",
    caption: [
      '📊 Sharp Report Card',
      '',
      'Chiefs -4 moved from -3 to -4 at multiple sharp books.',
      '',
      'Rashee Rice listed as OUT. Sharp money coming in on KC as the line shortens.',
      '',
      'NFL',
      'Chiefs vs Raiders · Sun 1:25 PM PT',
    ].join('\n'),
  },
  {
    postKind: 'sharp_move',
    label: 'Sharp Money Move',
    caption: [
      '🔥 Sharp Money Move',
      '',
      'World Cup',
      'France vs Paraguay · Sat 2PM PT',
      '',
      'France spread -3 (-110) → -4 (-108)',
      'Books: FanDuel, DraftKings',
      '',
      'Significant move (1 pt) ... sharp action shifting the France spread.',
    ].join('\n'),
  },
  {
    postKind: 'steam',
    label: 'Steam',
    caption: [
      '💨 Steam Coming In',
      '',
      'NFL',
      'Chiefs vs Raiders · Sun 1:25 PM PT',
      '',
      'Chiefs spread -3 (-110) → -4 (-108)',
      'Books: FanDuel, DraftKings',
      '',
      'Fast multi-book steam ... number syncing toward Chiefs right now.',
    ].join('\n'),
  },
  {
    postKind: 'rlm',
    label: 'Reverse Line Movement',
    caption: [
      '📈 Reverse Line Movement',
      '',
      'NBA',
      'Lakers vs Warriors · Sat 7:30 PM PT',
      '',
      'Lakers spread +4.5 (+105) → +3.5 (-110)',
      'Books: DraftKings, FanDuel',
      '',
      'Public side and sharp money diverging ... spread moved one way while ML moved the other.',
    ].join('\n'),
  },
  {
    postKind: 'in_game_edge',
    label: 'In-Game Edge',
    caption: [
      '🔴 LIVE In-Game Edge • 3rd Quarter',
      '',
      'NBA',
      'Lakers 88-82 Warriors',
      '',
      'Lakers -4.5 (+105) @ DraftKings',
      '+5.2% EV vs market consensus on the spread · 9 books',
      '',
      'LeBron James playing through ankle concern.',
    ].join('\n'),
  },
  {
    postKind: 'period_report',
    label: 'Period / Halftime Report',
    caption: [
      '📊 Halftime Report - Chiefs 14-10 Bills',
      '',
      'Best bets for 2nd half:',
      '• Chiefs -2.5 (-108) @ DraftKings (+4.5% EV vs consensus)',
    ].join('\n'),
  },
  {
    postKind: 'starter_spotlight',
    label: 'Starter Spotlight',
    caption: [
      '🔦 Starter Spotlight',
      '',
      'Padres vs Dodgers (Sat 7:11 PM PT)',
      '',
      'Confirmed Starters:',
      '• Padres: Dylan Cease',
      '• Dodgers: TBD',
      '',
      'Padres ML +219 @ lowvig (+7.8% EV)',
    ].join('\n'),
  },
  {
    postKind: 'injury_impact',
    label: 'Injury Impact',
    caption: [
      '⚠️ Injury Impact',
      '',
      'Chiefs vs Raiders (Sun 1:25 PM PT)',
      '',
      'Rashee Rice listed as OUT.',
      '',
      '→ Chiefs -4 now available at -110 (+4.1% EV)',
    ].join('\n'),
  },
  {
    postKind: 'rest_travel_edge',
    label: 'Rest + Travel Advantage',
    caption: [
      '🛫 Rest + Travel Advantage',
      '',
      'Lakers vs Warriors (Sat 7:30 PM PT)',
      '',
      'Lakers on back-to-back + cross-time-zone travel (East to West)',
      'Warriors had 2 days of rest at home',
      '',
      '→ Warriors -4.5 @ DraftKings (+3.9% EV)',
    ].join('\n'),
  },
  {
    postKind: 'confirmed_starters',
    label: 'Confirmed Starters',
    caption: [
      '✅ Confirmed Starters - MLB',
      '',
      '• Padres: Dylan Cease',
      '• Dodgers: TBD',
      '',
      'Padres ML +219 @ lowvig (+7.8% EV)',
    ].join('\n'),
  },
  {
    postKind: 'fade_the_public',
    label: 'Fade the Public',
    caption: [
      '🚫 Fade the Public',
      '',
      'Chiefs vs Raiders',
      '',
      'Line moved toward Chiefs -4 while public betting is heavy on Raiders +4.',
    ].join('\n'),
  },
]

export type PublishExamplePostsResult = {
  published: number
  failed: number
  postIds: string[]
  details: { postKind: string; label: string; postId?: string; error?: string }[]
}

export async function publishScottExamplePosts(
  admin: SupabaseClient,
  bot: { user_id: string; category_pills_default?: string[] | null },
  alertAudience?: Record<string, unknown> | null,
): Promise<PublishExamplePostsResult> {
  const pills = bot.category_pills_default?.length ? bot.category_pills_default : ['sports']
  const packId = Date.now()
  const postIds: string[] = []
  const details: PublishExamplePostsResult['details'] = []
  let published = 0
  let failed = 0

  for (const spec of SCOTT_EXAMPLE_POST_SPECS) {
    const subscriberOnly = resolveAlertSubscriberOnly(spec.postKind, alertAudience)
    const dedupeKey = `example_pack:${spec.postKind}:${packId}`

    const result = await publishLoungeBotPostWithThread(admin, {
      botUserId: bot.user_id,
      caption: spec.caption,
      categoryPills: pills,
      subscriberOnly,
      threadParts: spec.threadParts?.map((body) => ({ body })),
    })

    if (!result.postId) {
      failed += 1
      details.push({ postKind: spec.postKind, label: spec.label, error: result.error || 'publish failed' })
      await admin.from('lounge_bot_publish_log').insert({
        bot_user_id: bot.user_id,
        caption: spec.caption.slice(0, 2000),
        status: 'failed',
        post_kind: spec.postKind,
        dedupe_key: dedupeKey,
        error_message: (result.error || 'publish failed').slice(0, 400),
      })
      continue
    }

    published += 1
    postIds.push(result.postId)
    details.push({ postKind: spec.postKind, label: spec.label, postId: result.postId })

    await admin.from('lounge_bot_publish_log').insert({
      bot_user_id: bot.user_id,
      post_id: result.postId,
      caption: spec.caption.slice(0, 2000),
      status: 'published',
      post_kind: spec.postKind,
      dedupe_key: dedupeKey,
    })
  }

  if (published > 0) {
    await admin.from('lounge_bot_accounts').update({
      last_publish_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('user_id', bot.user_id)
  }

  return { published, failed, postIds, details }
}

