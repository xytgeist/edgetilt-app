/**
 * Split jade-monkey-diamond-devils into two sister cards (same AP copy).
 *
 * Usage: npm run ap-guide:backup  (recommended first)
 *        node scripts/ap-guide-split-jade-monkey-diamond-devils.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { parseGuideMarkdown } from '../src/slot-guide-form/formUtils.js'
import { runSlotGuideIngest } from './lib/runSlotGuideIngest.mjs'
import { loadSupabaseEnv, readSupabaseCredentials } from './lib/supabaseEnv.mjs'

const COMBINED_SLUG = 'jade-monkey-diamond-devils'

/** @type {Array<{ slug: string, title: string, name: string, gameplayLead: string }>} */
const SISTERS = [
  {
    slug: 'jade-monkey-deluxe',
    title: 'Jade Monkey Deluxe',
    name: 'Jade Monkey Deluxe',
    gameplayLead:
      '**Jade Monkey Deluxe** (Light & Wonder) parks persistent prizes above reels; **3 diamonds** awards the prize. Devil/monkey removes a diamond or resets the reel.',
  },
  {
    slug: 'diamonds-devils-deluxe',
    title: 'Diamonds & Devils Deluxe',
    name: 'Diamonds & Devils Deluxe',
    gameplayLead:
      '**Diamonds & Devils Deluxe** (Light & Wonder) parks persistent prizes above reels; **3 diamonds** awards the prize. Devil/monkey removes a diamond or resets the reel.',
  },
]

/** @param {string} text */
function stripCombinedImages(text) {
  return String(text ?? '')
    .replace(/!\[[^\]]*\]\([^)]*jade-monkey[^)]*\)\s*/gi, '')
    .trim()
}

loadSupabaseEnv('test')
const { url, key } = readSupabaseCredentials()
const sb = createClient(url, key, { auth: { persistSession: false } })

const { data: source, error: srcErr } = await sb
  .from('guides')
  .select('title, card_ev_threshold, content_markdown, published, machines(*)')
  .eq('slug', COMBINED_SLUG)
  .maybeSingle()
if (srcErr) throw new Error(srcErr.message)
if (!source) throw new Error(`${COMBINED_SLUG} not found on test — already split?`)

const sourceMachine = Array.isArray(source.machines) ? source.machines[0] : source.machines
if (!sourceMachine) throw new Error(`${COMBINED_SLUG} machine row missing`)

const sections = parseGuideMarkdown(source.content_markdown)

/** @type {string[]} */
const created = []

for (const sister of SISTERS) {
  const other = SISTERS.find((s) => s.slug !== sister.slug)
  if (!other) throw new Error('missing sister pair')

  const { data: existing } = await sb.from('guides').select('slug').eq('slug', sister.slug).maybeSingle()
  if (existing) {
    console.log(`– ${sister.slug} already exists`)
    continue
  }

  const payload = {
    machine: {
      slug: sister.slug,
      name: sister.name,
      manufacturer: sourceMachine.manufacturer ?? 'Light & Wonder',
      type: sourceMachine.type,
      difficulty: sourceMachine.difficulty,
      popularity: sourceMachine.popularity,
      nerf_risk: sourceMachine.nerf_risk,
      has_calculator: sourceMachine.has_calculator ?? false,
      calculator_slug: sourceMachine.calculator_slug ?? null,
      volatility_index: sourceMachine.volatility_index,
      popularity_summary: String(sourceMachine.popularity_summary ?? 'FG + diamond meters above reels.'),
      release_year: sourceMachine.release_year ?? 2019,
    },
    guide: {
      title: sister.title,
      published: source.published !== false,
      card_ev_threshold: source.card_ev_threshold,
      when_to_play: sections.when_to_play,
      when_to_stop: sections.when_to_stop,
      how_to_check: stripCombinedImages(sections.how_to_check),
      risk_bankroll: sections.risk_bankroll,
      risk_summary: sections.risk_summary,
      risk_bullets: sections.risk_bullets
        ? sections.risk_bullets.split('\n').filter(Boolean)
        : [],
      where_to_find: sections.where_to_find || '',
      skins_markdown: `[${other.title}](guide:${other.slug})`,
      gameplay_mechanics: sister.gameplayLead,
    },
  }

  const out = await runSlotGuideIngest({
    payload,
    target: 'test',
    writeRepo: false,
    syncSupabase: true,
  })
  if (!out.ok) {
    console.error(`Ingest failed for ${sister.slug}:`, out.errors)
    process.exit(1)
  }
  created.push(sister.slug)
  console.log(`✓ ${sister.slug}`)
}

if (created.length) {
  const { error: delGuideErr } = await sb.from('guides').delete().eq('slug', COMBINED_SLUG)
  if (delGuideErr) console.warn(`Delete ${COMBINED_SLUG} guide: ${delGuideErr.message}`)
  else console.log(`Removed combined guide ${COMBINED_SLUG}`)

  const { error: delMachineErr } = await sb.from('machines').delete().eq('slug', COMBINED_SLUG)
  if (delMachineErr) console.warn(`Delete ${COMBINED_SLUG} machine: ${delMachineErr.message}`)
  else console.log(`Removed combined machine ${COMBINED_SLUG}`)
}

console.log(`Split complete: ${created.join(', ') || 'no new cards (already split?)'}`)
