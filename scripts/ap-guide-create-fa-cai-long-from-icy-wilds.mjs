/**
 * Create fa-cai-long guide from live icy-wilds-icy-wilds-deluxe-fa-cai-long (test).
 * Sister split: same AP math, separate theme card for search.
 *
 * Usage: npm run ap-guide:backup  (recommended first)
 *        node scripts/ap-guide-create-fa-cai-long-from-icy-wilds.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { parseGuideMarkdown } from '../src/slot-guide-form/formUtils.js'
import { runSlotGuideIngest } from './lib/runSlotGuideIngest.mjs'
import { loadSupabaseEnv, readSupabaseCredentials } from './lib/supabaseEnv.mjs'

const SOURCE_SLUG = 'icy-wilds-icy-wilds-deluxe-fa-cai-long'
const TARGET_SLUG = 'fa-cai-long'

const SOURCE_TITLE = 'Icy Wilds / Icy Wilds Deluxe'
const TARGET_TITLE = 'Fa Cai Long'

/** @param {string} text */
function stripSourceImages(text) {
  return String(text ?? '')
    .replace(/!\[[^\]]*\]\([^)]*icy-wilds[^)]*\)\s*/gi, '')
    .trim()
}

/** @param {string} md */
function patchSourceMarkdown(md) {
  let out = String(md ?? '')
  out = out.replace(
    /^#\s+Icy Wilds \/ Icy Wilds Deluxe \/ Fa Cai Long\s*$/m,
    `# ${SOURCE_TITLE}`,
  )
  out = out.replace(
    /## 🎭 Skins[^\n]*\n[\s\S]*?(?=\n## |\n---|\s*$)/i,
    `## 🎭 Skins (same game different theme/art)\n\n[${TARGET_TITLE}](guide:${TARGET_SLUG})\n\n`,
  )
  return out.trimEnd() + '\n'
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
    name: TARGET_TITLE,
    manufacturer: sourceMachine.manufacturer ?? 'IGT',
    type: sourceMachine.type,
    difficulty: sourceMachine.difficulty,
    popularity: sourceMachine.popularity,
    nerf_risk: sourceMachine.nerf_risk,
    has_calculator: sourceMachine.has_calculator ?? false,
    calculator_slug: sourceMachine.calculator_slug ?? null,
    volatility_index: sourceMachine.volatility_index,
    popularity_summary: 'Asian Icy Wilds clone; same one-spin wild reel AP.',
    release_year: sourceMachine.release_year ?? 2016,
  },
  guide: {
    title: TARGET_TITLE,
    published: source.published !== false,
    card_ev_threshold: source.card_ev_threshold,
    when_to_play: sections.when_to_play,
    when_to_stop: sections.when_to_stop,
    how_to_check: stripSourceImages(sections.how_to_check),
    risk_bankroll: sections.risk_bankroll,
    risk_summary: sections.risk_summary,
    risk_bullets: sections.risk_bullets
      ? sections.risk_bullets.split('\n').filter(Boolean)
      : [],
    where_to_find: sections.where_to_find || '',
    skins_markdown: `[${SOURCE_TITLE}](guide:${SOURCE_SLUG})`,
    gameplay_mechanics: `**Fa Cai Long** (IGT) is the Asian theme clone of **Icy Wilds** ... same **one-spin wild reel** AP after premium stacks land.`,
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

const patchedSourceMd = patchSourceMarkdown(source.content_markdown)

const { error: guidePatchErr } = await sb
  .from('guides')
  .update({
    title: SOURCE_TITLE,
    content_markdown: patchedSourceMd,
    updated_at: new Date().toISOString(),
  })
  .eq('slug', SOURCE_SLUG)
if (guidePatchErr) console.warn(`${SOURCE_SLUG} guide patch skipped: ${guidePatchErr.message}`)
else console.log(`Patched ${SOURCE_SLUG} title + skins → [${TARGET_TITLE}](guide:${TARGET_SLUG})`)

const { error: machinePatchErr } = await sb
  .from('machines')
  .update({ name: SOURCE_TITLE })
  .eq('slug', SOURCE_SLUG)
if (machinePatchErr) console.warn(`${SOURCE_SLUG} machine name patch skipped: ${machinePatchErr.message}`)

console.log(`Created ${TARGET_SLUG} from ${SOURCE_SLUG}`)
console.log(JSON.stringify(out.result, null, 2))
