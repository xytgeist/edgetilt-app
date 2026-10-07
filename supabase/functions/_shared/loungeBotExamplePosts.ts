/**
 * Scott Sharpe portal smoke pack: canonical example caption per post kind.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { resolveAlertRoute } from './loungeBotAlertAudience.ts'
import { publishRoutedBotThreadPost } from './loungeBotPublishSchedule.ts'

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
      'France vs Paraguay · Sat 5PM ET',
      '',
      'France ML +718 @ MyBookie',
      '+8.8% EV · Fair +652 (9 books)',
    ].join('\n'),
  },
  {
    postKind: 'coffee_covers',
    label: 'Coffee & Covers',
    caption: [
      '☕ Coffee & Covers 💵',
      '',
      '🎯 Best cover on the board today:',
      'MLB',
      'Pirates vs Cubs · Sat 4PM ET',
      'Pirates -1.5 (+172) @ FanDuel',
      '',
      '👀 Other spots on my radar:',
      '• World Cup · France vs Paraguay · Sat 5PM ET · Actis ML +1400 @ DraftKings (+8.1% EV)',
      '• World Cup · Mexico vs Brazil · Sat 1PM ET · Meza ML +600 @ BetUS (+5.2% EV)',
      '• MLB · Rockies vs Padres · Sat 7PM ET · Rockies +210 @ FanDuel (+4.4% EV)',
      '',
      '🐕 Dog of the Day:',
      'World Cup',
      'France vs Paraguay · Sat 5PM ET',
      'Diaz ML +2000 @ MyBookie',
      '',
      'Full board breakdown by sport below 👇',
    ].join('\n'),
    threadParts: [
      [
        '⚾ MLB',
        '',
        'Yankees vs Red Sox (Sat 4PM ET)',
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
      'France vs Paraguay · Sat 5PM ET',
      'France +145 @ DraftKings · Draw +652 @ FanDuel · Paraguay +718 @ MyBookie',
      '',
      'Germany vs Portugal · Sat 8PM ET',
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
      'Padres vs Dodgers · Sat 10:11 PM ET',
      '',
      'Padres ML +219 @ lowvig',
      '+7.8% EV · Fair +185 (11 books)',
      '',
      'Dylan Cease confirmed starting for Padres.',
    ].join('\n'),
  },
  {
    postKind: 'value_bet_radar',
    label: 'Value Bet Radar',
    caption: [
      '📡 Value Bet Radar · one look',
      '',
      'MLB',
      'Padres vs Dodgers · Sat 10:11 PM ET',
      '',
      'Padres ML +219 @ lowvig',
      '+7.8% EV · Fair +185 (11 books)',
      '',
      'Dylan Cease starting',
    ].join('\n'),
  },
  {
    postKind: 'arb_watch',
    label: 'Arb Watch',
    caption: [
      '🔒 Arb Watch',
      '',
      'World Cup',
      'France vs Paraguay · Sat 5PM ET',
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
      'NFL',
      'Chiefs vs Raiders · Sun 4:25 PM ET',
      '',
      'Chiefs -4 moved from -3 to -4 at multiple sharp books.',
      '',
      'Rashee Rice listed as OUT. Sharp money coming in on KC as the line shortens.',
    ].join('\n'),
  },
  {
    postKind: 'sharp_move',
    label: 'Sharp Money Move',
    caption: [
      '🔥 Sharp Money Move',
      '',
      'Boxing',
      'August vs Bank · Sat 2PM ET',
      '',
      'Bank ML -1500 → -2500',
      'August ML +800 → +1000',
      'Books: LowVig, BetOnline, BetUS',
      '',
      'Favorite shortening hard — sharp money on Bank.',
    ].join('\n'),
  },
  {
    postKind: 'steam',
    label: 'Steam',
    caption: [
      '💨 Steam Coming In',
      '',
      'NFL',
      'Chiefs vs Raiders · Sun 4:25 PM ET',
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
      'Lakers vs Warriors · Sat 10:30 PM ET',
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
      'Lakers vs Warriors · Sat 7:30 PM ET',
      'Lakers 88-82 Warriors',
      '',
      'Lakers -4.5 (+105) @ DraftKings',
      '+5.2% EV · Fair -108 (9 books)',
      '',
      'LeBron James playing through ankle concern.',
    ].join('\n'),
  },
  {
    postKind: 'period_report',
    label: 'Period / Halftime Report',
    caption: [
      '📊 Halftime Report',
      '',
      'NFL',
      'Chiefs vs Bills · Sun 4:25 PM ET',
      'Chiefs 14-10 Bills',
      '',
      'Best bets for 2nd half:',
      '• Chiefs -2.5 (-108) @ DraftKings (+4.5% EV · Fair -112 (8 books))',
    ].join('\n'),
  },
  {
    postKind: 'starter_spotlight',
    label: 'Starter Spotlight',
    caption: [
      '🔦 Starter Spotlight',
      '',
      'MLB',
      'Padres vs Dodgers · Sat 10:11 PM ET',
      '',
      'Confirmed Starters:',
      '• Padres: Dylan Cease',
      '• Dodgers: TBD',
    ].join('\n'),
  },
  {
    postKind: 'injury_impact',
    label: 'Situational Lean',
    caption: [
      '📐 Situational Lean',
      '',
      'NFL',
      'Chiefs vs Raiders · Sun 4:25 PM ET',
      '',
      'Chiefs -4 (-110) @ DraftKings',
      '',
      'Rashee Rice has been ruled out and the market hasn\'t fully adjusted.',
      'Still see value on Chiefs.',
    ].join('\n'),
  },
  {
    postKind: 'rest_travel_edge',
    label: 'Situational Lean',
    caption: [
      '📐 Situational Lean',
      '',
      'NBA',
      'Lakers vs Warriors · Sat 7:30 PM ET',
      '',
      'Warriors -4.5 (-110) @ DraftKings',
      '',
      'Lakers on the 2nd night of a back-to-back after cross-time-zone travel (East to West).',
      'Prefer the rested home side here.',
    ].join('\n'),
  },
  {
    postKind: 'confirmed_starters',
    label: 'Confirmed Starters',
    caption: [
      '✅ Confirmed Starters',
      '',
      'MLB',
      'Padres vs Dodgers · Sat 10:11 PM ET',
      '',
      '• Padres: Dylan Cease',
      '• Dodgers: TBD',
    ].join('\n'),
  },
  {
    postKind: 'fade_the_public',
    label: 'Fade the Public',
    caption: [
      '🚫 Fade the Public',
      '',
      'NFL',
      'Chiefs vs Raiders · Sun 4:25 PM ET',
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
    const alertRoute = resolveAlertRoute(spec.postKind, alertAudience)
    const dedupeKey = `example_pack:${spec.postKind}:${packId}`

    const result = await publishRoutedBotThreadPost(admin, {
      botUserId: bot.user_id,
      caption: spec.caption,
      categoryPills: pills,
      alertRoute,
      threadParts: spec.threadParts?.map((body) => ({ body })),
    })

    if (!result.postId && !result.subChatPublished) {
      failed += 1
      details.push({ postKind: spec.postKind, label: spec.label, error: result.error || 'publish failed' })
      await admin.from('lounge_bot_publish_log').insert({
        bot_user_id: bot.user_id,
        caption: spec.caption.slice(0, 10000),
        status: 'failed',
        post_kind: spec.postKind,
        dedupe_key: dedupeKey,
        error_message: (result.error || 'publish failed').slice(0, 400),
      })
      continue
    }

    published += 1
    if (result.postId) postIds.push(result.postId)
    details.push({ postKind: spec.postKind, label: spec.label, postId: result.postId || undefined })

    await admin.from('lounge_bot_publish_log').insert({
      bot_user_id: bot.user_id,
      post_id: result.postId,
      caption: spec.caption.slice(0, 10000),
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

