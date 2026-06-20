/**
 * Fix lunar-disc Where to find / Gameplay after sister-card text adapt.
 * Usage: node scripts/ap-guide-patch-lunar-disc-from-fortune-disc.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { parseGuideMarkdown } from '../src/slot-guide-form/formUtils.js'
import { buildGuideMarkdown } from './lib/slotGuideIngestCore.mjs'
import { loadSupabaseEnv, readSupabaseCredentials } from './lib/supabaseEnv.mjs'

const SOURCE_SLUG = 'fortune-disc'
const TARGET_SLUG = 'lunar-disc'

function stripFortuneDiscImages(text) {
  return String(text ?? '')
    .replace(/!\[[^\]]*\]\([^)]*fortune-disc[^)]*\)\s*/gi, '')
    .trim()
}

function adaptTextForLunarDisc(text) {
  let out = String(text ?? '')
  out = out.replace(
    /\*\*Fortune Disc\*\* \(often paired with \*\*Lunar Disc\*\*\)/gi,
    '**Lunar Disc** (often paired with __FORTUNE_SKIN__)',
  )
  out = out.replace(/\bFortune Disc\b/g, 'Lunar Disc')
  out = out.replace(/__FORTUNE_SKIN__/g, '**Fortune Disc**')
  out = out.replace(/Lunar Disc \/ Lunar Disc/g, 'Lunar Disc / Fortune Disc')
  out = out.replace(/\(Lunar Disc often travels with it\)/gi, '(Fortune Disc often travels with it)')
  return out.trim()
}

function adaptGameplayForLunarDisc(text) {
  let out = adaptTextForLunarDisc(text)
  out = out.replace(
    /Related to \*\*Solar Disc\*\* \/ \*\*Lunar Disc\*\* mechanics\./i,
    'Related to **Solar Disc** / **Fortune Disc** mechanics.',
  )
  return out.trim()
}

loadSupabaseEnv('test')
const { url, key } = readSupabaseCredentials()
const sb = createClient(url, key, { auth: { persistSession: false } })

const { data: source, error: srcErr } = await sb
  .from('guides')
  .select('card_ev_threshold, content_markdown, published, machines(*)')
  .eq('slug', SOURCE_SLUG)
  .maybeSingle()
if (srcErr) throw new Error(srcErr.message)
if (!source) throw new Error(`${SOURCE_SLUG} not found`)

const sourceMachine = Array.isArray(source.machines) ? source.machines[0] : source.machines
const sections = parseGuideMarkdown(source.content_markdown)

const contentMarkdown = buildGuideMarkdown({
  machine: { slug: TARGET_SLUG, name: 'Lunar Disc', manufacturer: sourceMachine?.manufacturer ?? 'IGT' },
  guide: {
    title: 'Lunar Disc',
    card_ev_threshold: source.card_ev_threshold,
    when_to_play: sections.when_to_play,
    when_to_stop: sections.when_to_stop,
    how_to_check: stripFortuneDiscImages(sections.how_to_check),
    risk_bankroll: sections.risk_bankroll,
    risk_summary: sections.risk_summary,
    risk_bullets: sections.risk_bullets ? sections.risk_bullets.split('\n').filter(Boolean) : [],
    where_to_find: adaptTextForLunarDisc(sections.where_to_find),
    skins_markdown: `[Fortune Disc](guide:${SOURCE_SLUG})`,
    gameplay_mechanics: adaptGameplayForLunarDisc(sections.gameplay_mechanics),
  },
  diagrams: [],
})

const { error: updErr } = await sb
  .from('guides')
  .update({ content_markdown: contentMarkdown, updated_at: new Date().toISOString() })
  .eq('slug', TARGET_SLUG)
if (updErr) throw new Error(updErr.message)

console.log(`Patched ${TARGET_SLUG} content_markdown (${contentMarkdown.length} chars)`)
