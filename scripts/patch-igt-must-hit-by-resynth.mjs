/**
 * Batch 0: full resynth igt-must-hit-by (no workspace folder — calculator + WOO voice).
 * Usage: node scripts/patch-igt-must-hit-by-resynth.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { loadSupabaseEnv, readSupabaseCredentials } from './lib/supabaseEnv.mjs'
import { buildGuideMarkdown } from './lib/slotGuideIngestCore.mjs'
import { findForbiddenSourceRefs } from './lib/apGuideVoiceRules.mjs'

const SLUG = 'igt-must-hit-by'

const guideFields = {
  title: 'IGT Must Hit By',
  published: true,
  card_ev_threshold: 'Classic IGT MH ladder — denom & eligible bet first, then uniform-band take point',
  when_to_play: `**Use the Must Hit By calculator** on this card (**IGT** preset). Classic **IGT / legacy WMS-style** mystery ladders use a **uniform band** between reset and cap ... same family as Ainsworth for math purposes, but **denom and bet eligibility** trip more APs on IGT than anything else.

**Before EV math:**
- Confirm **which ladder** you are chasing (minor vs major, or paired tiers on the glass).
- Confirm **qualifying bet** ... many IGT titles only increment on specific line counts or denom.

**Rough scouting:** plug live meter, cap, reset, rise %, and RTP into **Must Hit By → IGT** on this card ... always re-verify on the floor.

Only play when **estimated jackpot value > cost to finish the grind** (coin-in to take point + base bleed). Budget ~**20% of total bets** as bleed while pumping.

**Bet discipline:** lowest bet that **still feeds the meter you are hunting**.`,
  when_to_stop: `**Assume the meter can run to cap.** IGT marketing loves "must hit by" language ... treat it as **must-go-to** for bankroll planning.

**Stop or skip when:**
- You cannot prove **eligible bet** increments the target ladder.
- Bankroll cannot survive a **full run to cap**.
- Ladder captions/marketing art disagree with live marquee values (refresh photos, do not guess).

**After a hit:** note new reset floors ... IGT installs vary by state and property.`,
  how_to_check: `1. **Read the marquee** — capture **both** tiers if present, with **denom context** in the photo.
2. **Rules screen:** eligible bet / line requirements for mystery increment.
3. **Meter rise test:** short spin session at intended bet ... log **$/coin-in** climb.
4. **Bonus vs base:** some titles split increment between base and feature ... know which you are buying.
5. **RTP / PAR:** enter conservative RTP if unknown.
6. **Open Must Hit By → IGT** with live numbers before you commit.`,
  risk_bankroll: `**Bankroll (conservative):** plan for **~5× the jackpot** you are chasing (**~$2,500** on **$500** class, **~$25,000** on **$5,000** class). Handpays and W-2G friction on larger hits eat edge ... price that in on **$5,000** chases.

**Do not** paste IGT assumptions onto **AGS** meters ... separate model, separate take points.`,
  risk_summary: `**Denom traps:** chasing the wrong bet size is the #1 IGT MHB failure mode ... EV can look fine on paper while your spins never move the meter.

**Uniform band:** early meters are not automatically fake ... still need full cost-to-cap math.

**Variance:** long grinds at min bet; max bet turns thin edge into gambling.

**Marketing lag:** cabinet art and help screens can show stale caps ... trust the live marquee.

**Use your player's card** on long chases.`,
  risk_bullets: [],
  where_to_find: `### Where to Find IGT Must Hit By

**In Las Vegas / physical casinos:**
- **Common** on Strip, locals, and regional Nevada floors.
- Hunt paired ladders on **IGT** and legacy **WMS-style** titles (**Coyote Moon**, **Money Storm**, **Lucky Larry's Lobstermania** MH variants, etc.).

**Online / free play:**
- Social demos do not replicate live mystery persistence.

---

### Top cities / regions (outside Las Vegas)

1. **Oklahoma tribal** - High - IGT MHB banks are standard
2. **California tribal** - Medium-High - Common
3. **Florida tribal** - Medium-High - Steady IGT footprint
4. **Pennsylvania / Midwest commercial** - Medium - Property-specific ladder configs
5. **Atlantic City** - Medium - Present on main floors and locals-style rooms`,
  skins_markdown: `**Coyote Moon**, **Money Storm**, **Lucky Larry's Lobstermania**.`,
  gameplay_mechanics: `**IGT Must Hit By** (including many legacy **WMS** mystery installs) uses published **ceilings** with triggers uniformly distributed between **reset** and **cap**.

**AP workflow:** photograph ladders with denom → confirm increment bet → model EV in the MH calculator → grind at qualifying min bet.

**Separate from AGS:** AGS meters are **top-weighted** ... do not reuse IGT take points on dragon/wolf AGS titles.`,
}

const machine = {
  slug: SLUG,
  name: 'IGT Must Hit By',
  manufacturer: 'IGT',
  type: 'Must Hit By',
  difficulty: 'Intermediate',
  popularity: 'Common',
  nerf_risk: 'Medium',
  has_calculator: true,
  calculator_slug: 'mhb',
  volatility_index: 'Medium',
  popularity_summary: 'Common nationally; watch denom and eligible bet on every title.',
  release_year: null,
}

loadSupabaseEnv('test')
const { url, key } = readSupabaseCredentials()
const sb = createClient(url, key, { auth: { persistSession: false } })

const content_markdown = buildGuideMarkdown({ machine, guide: guideFields, diagrams: [] })

const forbidden = findForbiddenSourceRefs(content_markdown)
if (forbidden.length) throw new Error(`Forbidden source refs in copy: ${forbidden.join(', ')}`)

const { error: me } = await sb
  .from('machines')
  .update({
    type: machine.type,
    difficulty: machine.difficulty,
    popularity: machine.popularity,
    nerf_risk: machine.nerf_risk,
    volatility_index: machine.volatility_index,
    popularity_summary: machine.popularity_summary,
    updated_at: new Date().toISOString(),
  })
  .eq('slug', SLUG)
if (me) throw new Error(me.message)

const { error: ge } = await sb
  .from('guides')
  .update({
    title: guideFields.title,
    card_ev_threshold: guideFields.card_ev_threshold,
    content_markdown,
    published: true,
    updated_at: new Date().toISOString(),
  })
  .eq('slug', SLUG)
if (ge) throw new Error(ge.message)

console.log(`Resynced ${SLUG} (${content_markdown.length} chars)`)
