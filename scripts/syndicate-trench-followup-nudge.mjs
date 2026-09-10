#!/usr/bin/env node
/**
 * NFL trench follow-up scheduler check.
 *
 *   node scripts/syndicate-trench-followup-nudge.mjs
 *   node scripts/syndicate-trench-followup-nudge.mjs --post-theo
 *   node scripts/syndicate-trench-followup-nudge.mjs --now=2026-09-29
 *
 * Exit 0 = not due or marked done.
 * Exit 2 = due (GHA should fail / nag).
 */
import fs from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
import { loadSupabaseEnv, createSupabaseServiceClient, repoRoot } from './lib/supabaseEnv.mjs'

const SPEC_PATH = path.join(repoRoot, 'data', 'syndicate', 'trench-followup.json')
const NUDGE_TOKEN = 'TRENCH_FOLLOWUP_NUDGE'

function parseArgs(argv) {
  let postTheo = false
  let now = new Date()
  for (const arg of argv.slice(2)) {
    if (arg === '--post-theo') postTheo = true
    else if (arg.startsWith('--now=')) {
      const raw = arg.slice('--now='.length)
      const d = new Date(`${raw}T12:00:00Z`)
      if (Number.isNaN(d.getTime())) throw new Error(`bad --now=${raw}`)
      now = d
    }
  }
  return { postTheo, now }
}

function loadSpec() {
  const spec = JSON.parse(fs.readFileSync(SPEC_PATH, 'utf8'))
  if (!spec?.due_on || !spec?.status) throw new Error(`bad spec: ${SPEC_PATH}`)
  return spec
}

function nudgeBody(spec) {
  const pending = (spec.order || []).filter((s) => !s.done)
  const lines = [
    NUDGE_TOKEN,
    spec.title,
    `Due ${spec.due_on}. Spec: data/syndicate/trench-followup.json`,
    '',
    ...pending.map((s) => `- ${s.id}: ${s.note}`),
    '',
    'Kill: set that JSON status=done and syndicate_trench_followup.status=done on test.',
    'Read: https://lvslotpro.com/theo',
  ]
  return lines.join('\n').slice(0, 4000)
}

function writeGithubOutput(due) {
  const out = process.env.GITHUB_OUTPUT
  if (!out) return
  fs.appendFileSync(out, `due=${due ? 'true' : 'false'}\n`)
}

async function postTheo(body) {
  loadSupabaseEnv('test')
  const supabase = createSupabaseServiceClient(createClient)
  const { data, error } = await supabase
    .from('theo_channel_messages')
    .insert({ author: 'windows', body })
    .select('id')
    .single()
  if (error) throw error
  console.log(`[trench-followup] posted theo ${data?.id || 'ok'}`)
}

async function main() {
  const { postTheo: shouldPost, now } = parseArgs(process.argv)
  const spec = loadSpec()
  const today = now.toISOString().slice(0, 10)
  const due = spec.status !== 'done' && today >= spec.due_on

  console.log(`[trench-followup] status=${spec.status} due_on=${spec.due_on} today=${today} due=${due}`)
  writeGithubOutput(due)

  if (!due) {
    if (spec.status === 'done') console.log('[trench-followup] marked done. no nag.')
    else console.log('[trench-followup] not due yet.')
    return
  }

  console.log(nudgeBody(spec))
  if (shouldPost) await postTheo(nudgeBody(spec))
  process.exitCode = 2
}

main().catch((err) => {
  console.error('[trench-followup] FAILED:', err.message || err)
  process.exit(1)
})
