/**
 * Scott Sharpe portal smoke pack: canonical example caption per post kind.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { resolveAlertSubscriberOnly } from './loungeBotAlertAudience.ts'
import { publishLoungeBotPostWithThread } from './loungeBotPublish.ts'

const EXAMPLE_PREFIX = '🧪 Example'

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
      `${EXAMPLE_PREFIX} · +EV Edge`,
      '',
      '⚡ World Cup: France vs Paraguay (Sat 2PM PT)',
      '',
      'France ML +718 at MyBookie',
      'Fair +652 (9 books)',
      '+8.8% edge on ML',
    ].join('\n'),
  },
  {
    postKind: 'coffee_covers',
    label: 'Coffee & Covers',
    caption: [
      `${EXAMPLE_PREFIX} · Coffee & Covers`,
      '',
      '☕ Coffee & Covers 💵',
      'No strong covers today - sitting on hands until we see better value.',
      '- Best ML Spots Right Now -',
      '• World Cup - France vs Paraguay (Sat 2PM PT)',
      'Draw ML +718 @ MyBookie (+9.6% EV)',
      '• World Cup - Morocco vs Canada (Sat 10AM PT)',
      'Canada ML +490 @ BetUS (+3.1% EV)',
      '- Dog of the Day -',
      '• World Cup - France vs Paraguay (Sat 2PM PT)',
      'Paraguay ML +718 @ MyBookie (+9.6% EV)',
      'Plus money ahead of fair +652 (9 books).',
      '- 🍺 On Tap Tomorrow -',
      '• Wimbledon - Mochizuki vs Sinner: Mochizuki +1600 (+8.1% EV)',
      '• World Cup - Norway vs Brazil: Norway +367 (+2.8% EV)',
      'Best lines 👇',
    ].join('\n'),
    threadParts: [
      [
        '⚾ MLB',
        '',
        'Yankees vs Red Sox (Sat 1PM PT)',
        'Yankees -110 (FanDuel), Red Sox +105 (DraftKings)',
      ].join('\n'),
    ],
  },
  {
    postKind: 'slate',
    label: 'Slate (legacy)',
    caption: [
      `${EXAMPLE_PREFIX} · Slate check-in`,
      '',
      'World Cup slate',
      '',
      'France vs Paraguay (Sat 2PM PT)',
      'France +145 (DraftKings), Draw +652 (FanDuel), Paraguay +718 (MyBookie)',
      '',
      'Germany vs Portugal (Sat 5PM PT)',
      'Germany -110 (FanDuel), Portugal +105 (DraftKings)',
    ].join('\n'),
  },
  {
    postKind: 'best_bet_hour',
    label: 'Best Bet of the Hour',
    caption: [
      `${EXAMPLE_PREFIX} · Best Bet of the Hour`,
      '',
      '🔥 Best Bet of the Hour',
      'Padres ML +219 @ lowvig',
      'Padres vs Dodgers (Sat 7:11 PM PT)',
      '+7.8% EV',
      'Market consensus implies ~42% chance Padres win, but they are available at +219. This is currently the sharpest edge on the board.',
    ].join('\n'),
  },
  {
    postKind: 'value_bet_radar',
    label: 'Value Bet Radar',
    caption: [
      `${EXAMPLE_PREFIX} · Value Bet Radar`,
      '',
      '📡 Value Bet Radar',
      'Here are the strongest edges right now:',
      '',
      'Padres ML +219 @ lowvig (+7.8% EV)',
      'vs Dodgers – Sat 7:11 PM PT',
      'Canada ML +490 @ BetUS (+3.1% EV)',
      'World Cup – Sat 10AM PT',
      'Giron ML +900 @ DraftKings (+4.2% EV)',
      'Wimbledon – Sat 6:30 AM PT',
      '',
      'Quick hits. Bet responsibly.',
    ].join('\n'),
  },
  {
    postKind: 'arb_watch',
    label: 'Arb Watch',
    caption: [
      `${EXAMPLE_PREFIX} · Arb Watch`,
      '',
      '🔒 Arb Watch',
      'Risk-Free Opportunity',
      '',
      'France vs Paraguay (Sat 2PM PT)',
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
      `${EXAMPLE_PREFIX} · Sharp Report Card`,
      '',
      '📊 Sharp Report Card',
      '',
      'Chiefs -4 moved from -3 to -4 at multiple sharp books.',
      '',
      'Sharp money appears to be coming in on Kansas City as the number shortens across books. Line has steamed over the last ~15 minutes.',
      'NFL: Chiefs vs Raiders (Sun 1:25 PM PT). This is one to watch closely.',
    ].join('\n'),
  },
  {
    postKind: 'line_movement',
    label: 'Line Movement',
    caption: [
      `${EXAMPLE_PREFIX} · Line Movement`,
      '',
      '📈 Line Movement',
      'World Cup: France vs Paraguay (Sat 2PM PT)',
      '',
      'France spread -3 (-110) → -4 (-108)',
      'Books leading move: FanDuel, DraftKings',
      'Sharp action shifting the France spread.',
      '',
      'Updated 6:45 PM PT',
    ].join('\n'),
  },
  {
    postKind: 'sharp_move',
    label: 'Sharp Move Alert',
    caption: [
      `${EXAMPLE_PREFIX} · Sharp Move`,
      '',
      '🔥 Sharp Move Alert',
      'World Cup: France vs Paraguay (Sat 2PM PT)',
      '',
      'France spread -3 (-110) → -4 (-108)',
      'Books leading move: FanDuel, DraftKings',
      'Sharp action shifting the France spread.',
      '',
      'Updated 6:45 PM PT',
    ].join('\n'),
  },
  {
    postKind: 'steam',
    label: 'Steam',
    caption: [
      `${EXAMPLE_PREFIX} · Steam`,
      '',
      '🔥 Steam Coming In',
      'NFL: Chiefs vs Raiders (Sun 1:25 PM PT)',
      '',
      'Chiefs spread -3 (-110) → -4 (-108)',
      'Books leading move: FanDuel, DraftKings',
      'Line steaming toward Kansas City.',
      '',
      'Updated 6:45 PM PT',
    ].join('\n'),
  },
  {
    postKind: 'rlm',
    label: 'Reverse Line Movement',
    caption: [
      `${EXAMPLE_PREFIX} · Reverse Line Movement`,
      '',
      '📈 Reverse Line Movement',
      'NBA: Lakers vs Warriors (Sat 7:30 PM PT)',
      '',
      'Lakers spread +4.5 (+105) → +3.5 (-110)',
      'Books leading move: DraftKings, FanDuel',
      'Number shortening against public side.',
      '',
      'Updated 6:45 PM PT',
    ].join('\n'),
  },
  {
    postKind: 'in_game_edge',
    label: 'In-Game Edge',
    caption: [
      `${EXAMPLE_PREFIX} · In-Game Edge`,
      '',
      '🔴 LIVE In-Game Edge · 3rd quarter',
      '',
      'NBA: Lakers 88 - 82 Warriors',
      '',
      'Lakers -4.5 (+105) at DraftKings',
      'Fair -108 (7 books)',
      '+5.2% EV on spread',
    ].join('\n'),
  },
  {
    postKind: 'period_report',
    label: 'Period / Halftime Report',
    caption: [
      `${EXAMPLE_PREFIX} · Halftime Report`,
      '',
      '📊 Halftime Report',
      '',
      'NFL: Chiefs 14 - 10 Bills',
      '',
      'Best bets for the rest of the game:',
      '• Chiefs -2.5 (-108) at DraftKings (+4.5% EV)',
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
