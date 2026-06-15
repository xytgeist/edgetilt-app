/**
 * Copy buffalo-link guide + machine card fields → lightning-buffalo-link (skin variant).
 * Usage: node scripts/patch-lightning-buffalo-link-from-buffalo-link.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { loadSupabaseEnv, readSupabaseCredentials } from './lib/supabaseEnv.mjs'

const SOURCE_SLUG = 'buffalo-link'
const TARGET_SLUG = 'lightning-buffalo-link'

function adaptMarkdownForLightning(sourceMd) {
  let md = String(sourceMd ?? '')
  md = md.replace(/^#\s+buffalo-link\s*$/im, '# Lightning Buffalo Link')
  md = md.replace(
    /\[Lightning Buffalo Link\]\(guide:lightning-buffalo-link\)/gi,
    '[Buffalo Link](guide:buffalo-link)',
  )
  return md.trimEnd() + '\n'
}

loadSupabaseEnv('test')
const { url, key } = readSupabaseCredentials()
const sb = createClient(url, key, { auth: { persistSession: false } })

const { data: source, error: srcErr } = await sb
  .from('guides')
  .select('card_ev_threshold, content_markdown, machines(*)')
  .eq('slug', SOURCE_SLUG)
  .maybeSingle()
if (srcErr) throw new Error(srcErr.message)
if (!source) throw new Error(`${SOURCE_SLUG} not found`)

const sourceMachine = Array.isArray(source.machines) ? source.machines[0] : source.machines
if (!sourceMachine) throw new Error(`${SOURCE_SLUG} machine row missing`)

const { data: target, error: tgtErr } = await sb
  .from('guides')
  .select('id, slug, title, machines(id, slug, name)')
  .eq('slug', TARGET_SLUG)
  .maybeSingle()
if (tgtErr) throw new Error(tgtErr.message)
if (!target) throw new Error(`${TARGET_SLUG} not found`)

const targetMachine = Array.isArray(target.machines) ? target.machines[0] : target.machines
if (!targetMachine) throw new Error(`${TARGET_SLUG} machine row missing`)

const contentMarkdown = adaptMarkdownForLightning(source.content_markdown)
const nowIso = new Date().toISOString()

const { error: guideErr } = await sb
  .from('guides')
  .update({
    card_ev_threshold: source.card_ev_threshold,
    content_markdown: contentMarkdown,
    updated_at: nowIso,
  })
  .eq('id', target.id)
if (guideErr) throw new Error(guideErr.message)

const { error: machineErr } = await sb
  .from('machines')
  .update({
    type: sourceMachine.type,
    difficulty: sourceMachine.difficulty,
    popularity: sourceMachine.popularity,
    nerf_risk: sourceMachine.nerf_risk,
    volatility_index: sourceMachine.volatility_index,
    popularity_summary: sourceMachine.popularity_summary,
    release_year: sourceMachine.release_year,
    has_calculator: sourceMachine.has_calculator,
    calculator_slug: sourceMachine.calculator_slug,
    updated_at: nowIso,
  })
  .eq('id', targetMachine.id)
if (machineErr) throw new Error(machineErr.message)

console.log(`Patched ${TARGET_SLUG} from ${SOURCE_SLUG}`)
console.log(`  content_markdown: ${contentMarkdown.length} chars`)
console.log(`  card_ev_threshold: ${source.card_ev_threshold}`)
console.log(`  machine.type: ${sourceMachine.type}`)
