#!/usr/bin/env node
/**
 * Apply a SQL migration file statement-by-statement (Supabase CLI rejects multi-statement -f).
 * Usage: node scripts/apply-sql-statements.mjs --target=test path/to.sql
 */
import fs from 'fs'
import os from 'os'
import path from 'path'
import { runSupabaseDbQuery } from './lib/supabaseDbCli.mjs'

function splitSql(text) {
  /** @type {string[]} */
  const out = []
  let buf = ''
  /** @type {string | null} */
  let dollarTag = null
  let inSingle = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]

    if (dollarTag === null && !inSingle && ch === '-' && text[i + 1] === '-') {
      while (i < text.length && text[i] !== '\n') i++
      continue
    }

    if (!dollarTag && ch === "'") {
      inSingle = !inSingle
      buf += ch
      continue
    }

    if (!inSingle && ch === '$') {
      const rest = text.slice(i)
      const open = rest.match(/^\$([a-zA-Z0-9_]*)\$/)
      if (open) {
        const tag = open[1]
        if (dollarTag === null) {
          dollarTag = tag
          buf += open[0]
          i += open[0].length - 1
          continue
        }
        if (tag === dollarTag) {
          buf += open[0]
          i += open[0].length - 1
          dollarTag = null
          continue
        }
      }
    }

    if (dollarTag === null && !inSingle && ch === ';') {
      const stmt = buf.trim()
      if (stmt) out.push(stmt)
      buf = ''
      continue
    }

    buf += ch
  }

  const tail = buf.trim()
  if (tail) out.push(tail)
  return out
}

function parseArgs(argv) {
  let target = 'test'
  let file = argv[0]
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--target' || argv[i] === '-t') target = argv[++i]
    if (argv[i] === '--file' || argv[i] === '-f') file = argv[++i]
  }
  if (!file) {
    console.error('Usage: node scripts/apply-sql-statements.mjs [--target=test] -f path.sql')
    process.exit(1)
  }
  if (target !== 'test' && target !== 'production') {
    console.error('--target must be test or production')
    process.exit(1)
  }
  return { target, file }
}

const { target, file } = parseArgs(process.argv.slice(2))
const dryRun = process.argv.includes('--dry-run')
const sql = fs.readFileSync(file, 'utf8')
const stmts = splitSql(sql)
console.log(`[apply-sql-statements] ${file} → ${stmts.length} statements on ${target}`)
if (dryRun) {
  stmts.forEach((s, i) => console.log(`--- ${i + 1} (${s.length} chars) ---\n${s.slice(0, 120)}…`))
  process.exit(0)
}

for (let i = 0; i < stmts.length; i++) {
  process.stdout.write(`  ${i + 1}/${stmts.length}…\n`)
  const tmp = path.join(os.tmpdir(), `lvslotpro-sql-${Date.now()}-${i}.sql`)
  fs.writeFileSync(tmp, `${stmts[i]};\n`, 'utf8')
  try {
    await runSupabaseDbQuery({ target, file: tmp, output: 'json' })
  } finally {
    try {
      fs.unlinkSync(tmp)
    } catch {
      /* ignore */
    }
  }
}

console.log('Done.')
