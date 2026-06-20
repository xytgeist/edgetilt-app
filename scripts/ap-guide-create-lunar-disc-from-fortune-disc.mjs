/**
 * Create lunar-disc guide from live fortune-disc (Ryan-edited on test).
 * Usage: node scripts/ap-guide-create-lunar-disc-from-fortune-disc.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { parseGuideMarkdown } from '../src/slot-guide-form/formUtils.js'
import { runSlotGuideIngest } from './lib/runSlotGuideIngest.mjs'
import { loadSupabaseEnv, readSupabaseCredentials } from './lib/supabaseEnv.mjs'

const SOURCE_SLUG = 'fortune-disc'
const TARGET_SLUG = 'lunar-disc'

/** @param {string} text */
function stripFortuneDiscImages(text) {
  return String(text ?? '')
    .replace(/!\[[^\]]*\]\([^)]*fortune-disc[^)]*\)\s*/gi, '')
    .trim()
}

/** @param {string} text */
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

/** @param {string} text */
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

const { data: existing } = await sb.from('guides').select('slug').eq('slug', TARGET_SLUG).maybeSingle()
if (existing) {
  console.error(`${TARGET_SLUG} already exists — aborting`)
  process.exit(1)
}

const { data: source, error: srcErr } = await sb
  .from('guides')
  .select('title, card_ev_threshold, content_markdown, published, machines(*)')
  .eq('slug', SOURCE_SLUG)
  .maybeSingle()
if (srcErr) throw new Error(srcErr.message)
if (!source) throw new Error(`${SOURCE_SLUG} not found on test`)

const sourceMachine = Array.isArray(source.machines) ? source.machines[0] : source.machines
if (!sourceMachine) throw new Error(`${SOURCE_SLUG} machine row missing`)

const sections = parseGuideMarkdown(source.content_markdown)

const payload = {
  machine: {
    slug: TARGET_SLUG,
    name: 'Lunar Disc',
    manufacturer: sourceMachine.manufacturer ?? 'IGT',
    type: sourceMachine.type,
    difficulty: sourceMachine.difficulty,
    popularity: sourceMachine.popularity,
    nerf_risk: sourceMachine.nerf_risk,
    has_calculator: sourceMachine.has_calculator ?? false,
    calculator_slug: sourceMachine.calculator_slug ?? null,
    volatility_index: sourceMachine.volatility_index,
    popularity_summary: 'IGT Disc family; ring count scout (Lunar skin).',
    release_year: sourceMachine.release_year ?? null,
  },
  guide: {
    title: 'Lunar Disc',
    published: source.published !== false,
    card_ev_threshold: source.card_ev_threshold,
    when_to_play: sections.when_to_play,
    when_to_stop: sections.when_to_stop,
    how_to_check: stripFortuneDiscImages(sections.how_to_check),
    risk_bankroll: sections.risk_bankroll,
    risk_summary: sections.risk_summary,
    risk_bullets: sections.risk_bullets
      ? sections.risk_bullets.split('\n').filter(Boolean)
      : [],
    where_to_find: adaptTextForLunarDisc(sections.where_to_find),
    skins_markdown: `[Fortune Disc](guide:fortune-disc)`,
    gameplay_mechanics: adaptGameplayForLunarDisc(sections.gameplay_mechanics),
  },
}

const out = await runSlotGuideIngest({
  payload,
  target: 'test',
  writeRepo: false,
  syncSupabase: true,
})

if (!out.ok) {
  console.error('Ingest failed:', out.errors)
  process.exit(1)
}

// Cross-link Fortune Disc → Lunar Disc in skins (Ryan had plain text only).
const fortuneSkins = `[Lunar Disc](guide:${TARGET_SLUG})`
const patchedFortuneMd = source.content_markdown.replace(
  /## 🎭 Skins[^\n]*\n[\s\S]*?(?=\n## |\s*$)/i,
  `## 🎭 Skins (same game different theme/art)\n\n${fortuneSkins}\n\n`,
)

const { error: patchErr } = await sb
  .from('guides')
  .update({
    content_markdown: patchedFortuneMd,
    updated_at: new Date().toISOString(),
  })
  .eq('slug', SOURCE_SLUG)
if (patchErr) console.warn(`Fortune Disc skins link patch skipped: ${patchErr.message}`)
else console.log(`Patched ${SOURCE_SLUG} skins → [Lunar Disc](guide:${TARGET_SLUG})`)

console.log(`Created ${TARGET_SLUG} from ${SOURCE_SLUG}`)
console.log(JSON.stringify(out.result, null, 2))
