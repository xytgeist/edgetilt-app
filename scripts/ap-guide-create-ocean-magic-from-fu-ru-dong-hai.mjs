/**
 * Create ocean-magic guide from live fu-ru-dong-hai (Ryan-edited on test).
 * Usage: node scripts/ap-guide-create-ocean-magic-from-fu-ru-dong-hai.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { parseGuideMarkdown } from '../src/slot-guide-form/formUtils.js'
import { runSlotGuideIngest } from './lib/runSlotGuideIngest.mjs'
import { loadSupabaseEnv, readSupabaseCredentials } from './lib/supabaseEnv.mjs'

const SOURCE_SLUG = 'fu-ru-dong-hai'
const TARGET_SLUG = 'ocean-magic'

/** @param {string} text */
function stripSourceImages(text) {
  return String(text ?? '')
    .replace(/!\[[^\]]*\]\([^)]*fu-ru-dong-hai[^)]*\)\s*/gi, '')
    .trim()
}

/** @param {string} text */
function adaptWhenToPlay(text) {
  let out = String(text ?? '').trim()
  out = out.replace(
    /^Reskin of \*\*Ocean Magic\*\*[^\n]*\n\n/i,
    '**Fu Ru Dong Hai** is the Asian reskin ... same bubble map on **Ocean Magic**.\n\n',
  )
  return out
}

/** @param {string} text */
function adaptRiskSummary(text) {
  return String(text ?? '')
    .replace(
      /Less common than \*\*Ocean Magic\*\*/i,
      'More common on floors than **Fu Ru Dong Hai**',
    )
    .trim()
}

/** @param {string} text */
function adaptWhereToFind(_text) {
  return `**Ocean Magic** is an **IGT** slot machine with **wild bubbles** and expanding features. It has been on casino floors for many years and is still a well-known advantage-play title.

**Las Vegas** - Still rotates widely on locals-oriented floors:
- **Station Casinos properties** (Red Rock, Green Valley Ranch, Palace Station, Sunset Station, etc.) ... common in the IGT bubble / locals mix.
- **The Orleans and South Point** ... older catalog IGT titles including bubble games.
- Many regional and tribal properties that keep persistent-state IGT inventory.

**Nationwide** (last year):
- **Golden Nugget** and other regional commercial properties still list Ocean Magic-family bubble games.
- Tribal casinos in California, Oregon, Washington, and other markets that keep IGT AP titles.

**Note** - Slot floors change frequently. **Ocean Magic** is easier to find than the **Fu Ru Dong Hai** reskin, but always call ahead or use the casino slot search if you are hunting a specific bank.`
}

/** @param {string} text */
function adaptGameplay(text) {
  return String(text ?? '')
    .replace(
      /\*\*Fu Ru Dong Hai\*\* \(IGT\) is an \*\*Ocean Magic\*\* theme clone:/i,
      '**Ocean Magic** (IGT) runs the original bubble engine:',
    )
    .trim()
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
    name: 'Ocean Magic',
    manufacturer: sourceMachine.manufacturer ?? 'IGT',
    type: sourceMachine.type,
    difficulty: sourceMachine.difficulty,
    popularity: sourceMachine.popularity,
    nerf_risk: sourceMachine.nerf_risk,
    has_calculator: sourceMachine.has_calculator ?? false,
    calculator_slug: sourceMachine.calculator_slug ?? null,
    volatility_index: sourceMachine.volatility_index,
    popularity_summary: 'IGT bubble classic; sunrise wild bubbles.',
    release_year: sourceMachine.release_year ?? null,
  },
  guide: {
    title: 'Ocean Magic',
    published: source.published !== false,
    card_ev_threshold: source.card_ev_threshold,
    when_to_play: adaptWhenToPlay(sections.when_to_play),
    when_to_stop: sections.when_to_stop,
    how_to_check: stripSourceImages(sections.how_to_check),
    risk_bankroll: sections.risk_bankroll,
    risk_summary: adaptRiskSummary(sections.risk_summary),
    risk_bullets: sections.risk_bullets
      ? sections.risk_bullets.split('\n').filter(Boolean)
      : [],
    where_to_find: adaptWhereToFind(sections.where_to_find),
    skins_markdown: `[Fu Ru Dong Hai](guide:${SOURCE_SLUG})`,
    gameplay_mechanics: adaptGameplay(sections.gameplay_mechanics),
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

const sourceSkins = `[Ocean Magic](guide:${TARGET_SLUG})`
const patchedSourceMd = source.content_markdown.replace(
  /## 🎭 Skins[^\n]*\n[\s\S]*?(?=\n## |\s*$)/i,
  `## 🎭 Skins (same game different theme/art)\n\n${sourceSkins}\n\n`,
)

const { error: patchErr } = await sb
  .from('guides')
  .update({
    content_markdown: patchedSourceMd,
    updated_at: new Date().toISOString(),
  })
  .eq('slug', SOURCE_SLUG)
if (patchErr) console.warn(`${SOURCE_SLUG} skins link patch skipped: ${patchErr.message}`)
else console.log(`Patched ${SOURCE_SLUG} skins → [Ocean Magic](guide:${TARGET_SLUG})`)

console.log(`Created ${TARGET_SLUG} from ${SOURCE_SLUG}`)
console.log(JSON.stringify(out.result, null, 2))
