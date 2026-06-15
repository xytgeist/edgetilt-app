/**
 * Batch 0: full resynth luckymon-evolutions from ap-guide-workspace sources.
 * Usage: node scripts/patch-luckymon-evolutions-resynth.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { loadSupabaseEnv, readSupabaseCredentials } from './lib/supabaseEnv.mjs'
import { buildGuideMarkdown } from './lib/slotGuideIngestCore.mjs'
import { findForbiddenSourceRefs, findAiTells } from './lib/apGuideVoiceRules.mjs'

const SLUG = 'luckymon-evolutions'

function replaceSection(md, sectionEmojiTitle, newBody) {
  const header = `## ${sectionEmojiTitle}`
  const start = md.indexOf(header)
  if (start < 0) throw new Error(`Missing ${header}`)
  const bodyStart = md.indexOf('\n', start) + 1
  const rest = md.slice(bodyStart)
  const nextMatch = rest.match(/\n## /)
  const end = nextMatch ? bodyStart + nextMatch.index : md.length
  return md.slice(0, bodyStart) + `${newBody.trim()}\n\n` + md.slice(end).replace(/^\n+/, '')
}

const guideFields = {
  title: 'Luckymon Evolutions',
  published: true,
  card_ev_threshold: 'All three monsters at level 3 (3-3-3) · edge stays thin even then',
  when_to_play: `Most APs treat this as a **skip** or entertainment-only dabble. Even at 3-3-3, edge is **never huge**. High variance + dead bonuses are common.

**Ideal setup:** all **three monsters at level 3** (3-3-3). Names on the rules screen confirm max stage ... Chomp (left/green) has looked strongest in early field reports, but that is still preliminary.

**Aggressive (3-3-2 / 3-2-3):** partial setups can burn **155–255+ bets** before meaningful pay ... higher gamble, not default AP.

**Skip entirely** if any monster is still at stage 1, you cannot read names/stages, or you are not prepared for **500+ unit** variance (see Bankroll).`,
  when_to_stop: `Stop after a **triple pop** that combines all three maxed bonuses.

**Do not** keep feeding a partial setup hoping the small monster catches up ... field examples at 3-3-1 and 3-2-1 burned **155–255 bets** before meaningful pay.

If bonuses are repeatedly **$0 or near-zero**, walk ... that is normal variance on this family, not a sign the machine is "due."`,
  how_to_check: `1. Open the **rules / help** screen ... shows monster art and **names at each of three sizes**.
2. Count stages on the cabinet: left / middle / right monster growth (Triple Pop style build).
3. Confirm edition if labeled (**All That Glitters**, **On a Silver Platter**, etc.) ... mechanics are the same family.
4. Note **Major / Maxi / Mega** jackpot tiers on the glass (values vary by denom/casino).
5. **RTP matters here more than most** ... thin edge means PAR drift can erase any theoretical advantage.`,
  risk_bankroll: `**500 units** for this family.

With edge capped low even at 3-3-3, budget for long dead-spin stretches and **zero-dollar bonuses**.`,
  risk_summary: `**High variance Triple Pop** ... progression can look great visually while paying nothing.

Even fully maxed monsters, advantage stays **modest**. Double/triple pops drive most meaningful wins; base spins can be brutal.

Many APs **skip** or only touch with **free play** / entertainment budget.`,
  risk_bullets: '',
  where_to_find: `### Where to Find Luckymon Evolutions

**In Las Vegas / physical casinos:**
- **2025** Light & Wonder title ... rollout still spreading. Not a floor staple like Buffalo or Dragon Link.
- Check **locals** and **Strip** properties with recent L&W installs; availability shifts quickly.

**Online / free play:**
- Demo exists on some review sites ... monster progression will **not** match live persistence.

---

### Top cities / regions (outside Las Vegas)

1. **Nevada (non-Vegas)** - Low-Medium - Tribal/commercial when L&W catalog refreshed
2. **Oklahoma tribal** - Low-Medium - Occasional new-install pods
3. **Florida tribal** - Low-Medium - Often paired with other L&W progressives
4. **Pennsylvania / Midwest commercial** - Low - Spotty
5. **Atlantic City** - Low - Rare outside test banks`,
  skins_markdown: `**All That Glitters**, **On a Silver Platter**.`,
  gameplay_mechanics: `**Luckymon Evolutions** (Light & Wonder, **2025**) is a **Triple Pop**-style persistent game: three monster mascots each tie to a bonus lane. Monsters **evolve through three sizes**; bigger monsters mean richer bonuses when that lane triggers.

**Core loop:** base spins feed monster growth → features "pop" when thresholds hit → **double** or **triple pop** combinations (especially with all three maxed) produce the session-making pays.

**Jackpots:** install-dependent **Major / Maxi / Mega** tiers ride alongside the feature build.

Progression is the marketing hook; **persistence edge stays thin**. Most value is hunting the rare aligned pop, not grinding mid-build states.`,
}

const machine = {
  slug: SLUG,
  name: 'Luckymon Evolutions',
  manufacturer: 'Light & Wonder',
  type: 'Triple Pop Persistent (Monster Evolution)',
  difficulty: 'Advanced',
  popularity: 'Uncommon',
  nerf_risk: 'High',
  has_calculator: false,
  calculator_slug: null,
  volatility_index: 'High (dead bonuses + thin edge)',
  popularity_summary: 'Uncommon nationally; 2025 rollout still spreading.',
  release_year: 2025,
}

loadSupabaseEnv('test')
const { url, key } = readSupabaseCredentials()
const sb = createClient(url, key, { auth: { persistSession: false } })

const content_markdown = buildGuideMarkdown({
  machine,
  guide: { ...guideFields, risk_bullets: [] },
  diagrams: [],
})

const forbidden = findForbiddenSourceRefs(content_markdown)
if (forbidden.length) throw new Error(`Forbidden source refs in copy: ${forbidden.join(', ')}`)
const aiTells = findAiTells(content_markdown)
if (aiTells.length) throw new Error(`AI tells in copy: ${aiTells.join(', ')}`)

const { error: me } = await sb
  .from('machines')
  .update({
    type: machine.type,
    difficulty: machine.difficulty,
    popularity: machine.popularity,
    nerf_risk: machine.nerf_risk,
    volatility_index: machine.volatility_index,
    popularity_summary: machine.popularity_summary,
    release_year: machine.release_year,
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
