/**
 * Batch 0: full resynth ainsworth-must-hit-by (no workspace folder — calculator + WOO voice).
 * Usage: node scripts/patch-ainsworth-must-hit-by-resynth.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { loadSupabaseEnv, readSupabaseCredentials } from './lib/supabaseEnv.mjs'
import { buildGuideMarkdown } from './lib/slotGuideIngestCore.mjs'
import { findForbiddenSourceRefs } from './lib/apGuideVoiceRules.mjs'

const SLUG = 'ainsworth-must-hit-by'

const guideFields = {
  title: 'Ainsworth Must Hit By',
  published: true,
  card_ev_threshold: 'Uniform mystery band — use midpoint ON in the MH calculator on this card',
  when_to_play: `**Use the Must Hit By calculator** on this card (**Ainsworth** preset, **midpoint ON**). Ainsworth ladders behave like a **uniform draw inside the reset–cap band** ... not the top-heavy AGS curve. Turning midpoint off will **overstate** how often you get a cheap hit.

**Rough scouting (verify on your ladder):**
- **$500 class:** public target tables often land around **$480–$490** before cap ... plug **your** meter, cap, reset, rise %, and RTP.
- **$5,000 class:** same idea at scale ... taxes and handpay friction matter more here.

Only play when **estimated jackpot value > cost to finish the grind** (coin-in to your take point + base-game bleed). Budget about **20% of total bets** as bleed while pumping.

**Bet discipline:** lowest **qualifying** bet that still increments the meter you are chasing. Read the glass ... some skins only feed the mystery on max line or specific denom.`,
  when_to_stop: `**Assume the meter can run to cap.** Do not start hoping for an early miracle unless the math (and your bankroll) explicitly supports that gamble.

**Stop or skip when:**
- Bankroll cannot survive a **full run to cap** (see Bankroll).
- You cannot confirm **both** ladder tiers, resets, or eligible bet wording.
- Competitive heat near cap is turning the sit into a coin-in war you did not price in.

**After a hit:** re-read resets on the glass ... Ainsworth floors drift by property and marketing refresh.`,
  how_to_check: `1. **Confirm true MHB ladders** on the marquee (minor/major or paired tiers) ... not a fixed progressive with no ceiling.
2. **Photo both meters** plus **minimum qualifying bet** language on the rules screen.
3. **Log meter rise:** a short test at your intended bet ... note **$/coin-in** climb (varies by title and denom).
4. **Reset floors:** capture post-hit reset values ... they change your band width.
5. **RTP / PAR:** if unknown, assume **worse** until you have a source ... thin-edge plays die on bad PAR.
6. **Open Must Hit By → Ainsworth** with live numbers ... **midpoint enabled.**`,
  risk_bankroll: `**Bankroll (conservative):** plan for **~5× the jackpot** you are chasing (**~$2,500** on a **$500** ladder, **~$25,000** on **$5,000**). Min-bet grinds at true take points can run tighter ... but going broke on the floor is still the default failure mode.`,
  risk_summary: `**Uniform-band math:** hits can land anywhere in the band ... unlike AGS, early-looking meters are **not** automatically a trap, but they are still **not** free money until EV clears costs.

**Variance:** long dead stretches at min bet are normal. Max betting a **$500 MHB** can burn thousands fast.

**Install drift:** jurisdictional caps, reset floors, and marketing art **lag** refreshed ladders ... re-verify on every revisit.

**Use your player's card** on long **$5,000** chases ... coin-in is massive.`,
  risk_bullets: [],
  where_to_find: `### Where to Find Ainsworth Must Hit By

**In Las Vegas / physical casinos:**
- **Very common** on locals floors and many Strip / regional properties.
- Look for paired **$500 / $5,000** (or property-specific) ladders on Ainsworth cabinets (**Rumble Rumble**, **Mustang Money**, **Super Charged 7s**, **Stormin' 7s**, etc.).

**Online / free play:**
- Demos rarely mirror live mystery persistence ... do not practice meter math on social clones.

---

### Top cities / regions (outside Las Vegas)

1. **Oklahoma tribal** - High - Ainsworth MHB is a floor staple
2. **California tribal** - High - Dense Ainsworth pods
3. **Florida tribal** - Medium-High - Common on newer banks
4. **Pennsylvania / Midwest commercial** - Medium - Steady but property-specific
5. **Atlantic City** - Medium - Present; denom mix varies`,
  skins_markdown: `**Rumble Rumble**, **Mustang Money**, **Super Charged 7s**, **Stormin' 7s**, **Cash Cave**, **Jungle Rush**.`,
  gameplay_mechanics: `**Ainsworth Must Hit By** games ship **paired mystery progressives** with published **must-hit-by ceilings**. The hidden trigger is uniformly distributed between the **reset floor** and the cap (use **midpoint** math).

**What you are doing:** scout readable ladders → model EV with the MH calculator → grind at qualifying min bet until the meter crosses your take point or hits.

**Not the same as AGS MHB:** do **not** copy AGS take points or disable midpoint on Ainsworth installs.`,
}

const machine = {
  slug: SLUG,
  name: 'Ainsworth Must Hit By',
  manufacturer: 'Ainsworth',
  type: 'Must Hit By',
  difficulty: 'Intermediate',
  popularity: 'Common',
  nerf_risk: 'Medium',
  has_calculator: true,
  calculator_slug: 'mhb',
  volatility_index: 'Medium',
  popularity_summary: 'Common nationally; bread-and-butter locals and tribal MHB hunts.',
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
