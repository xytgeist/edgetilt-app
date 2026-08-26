#!/usr/bin/env node
/**
 * Post / list the dual-machine Theo mailbox (test Supabase).
 *
 *   node scripts/theo-channel.mjs list
 *   node scripts/theo-channel.mjs post windows "Mac: APNs tap should load payload url"
 *   node scripts/theo-channel.mjs post mac "Windows: token row is on device, need .p8"
 *
 * Reads .env.supabase.test (service role). Does not need a git pull to *read*
 * after someone posted... the other machine opens https://lvslotpro.com/theo
 */
import { createClient } from '@supabase/supabase-js'
import { loadSupabaseEnv } from './lib/supabaseEnv.mjs'

const AUTHORS = new Set(['windows', 'mac', 'ryan'])

function usage() {
  console.error('Usage:')
  console.error('  node scripts/theo-channel.mjs list')
  console.error('  node scripts/theo-channel.mjs post <windows|mac|ryan> <message>')
  process.exit(1)
}

const [cmd, authorArg, ...rest] = process.argv.slice(2)
if (!cmd || (cmd !== 'list' && cmd !== 'post')) usage()

loadSupabaseEnv('test')
const url = String(process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '')
const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
if (!url || !key) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.supabase.test')
  process.exit(1)
}
if (!url.includes('kcosfvmreeiosdjdzycb')) {
  console.error('Refusing to write theo channel: .env.supabase.test is not the test project.')
  process.exit(1)
}

const sb = createClient(url, key, { auth: { persistSession: false } })

if (cmd === 'list') {
  const { data, error } = await sb
    .from('theo_channel_messages')
    .select('author, body, created_at')
    .order('created_at', { ascending: false })
    .limit(40)
  if (error) {
    console.error(error.message)
    process.exit(1)
  }
  for (const row of data || []) {
    console.log(`--- ${row.author} · ${row.created_at}`)
    console.log(row.body)
    console.log('')
  }
  process.exit(0)
}

const author = String(authorArg || '').trim().toLowerCase()
const body = rest.join(' ').trim()
if (!AUTHORS.has(author) || !body) usage()
if (body.length > 4000) {
  console.error('Message too long (max 4000).')
  process.exit(1)
}

const { data, error } = await sb
  .from('theo_channel_messages')
  .insert({ author, body })
  .select('id, created_at')
  .single()

if (error) {
  console.error(error.message)
  process.exit(1)
}

console.log(`Posted as ${author} (${data?.id || 'ok'}). Read: https://lvslotpro.com/theo`)
