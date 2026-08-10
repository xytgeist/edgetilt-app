import fs from 'fs'
import path from 'path'
import { runSupabaseDbQuery } from './lib/supabaseDbCli.mjs'

const MIGRATION = '20260810200000'
const FILE = path.join(
  'supabase',
  'migrations',
  `${MIGRATION}_poker_stable_seed_foundation_gap.sql`,
)

const raw = fs.readFileSync(FILE, 'utf8').replace(/^--.*$/gm, '').trim()

function nextStatementEnd(sqlText, start) {
  let i = start
  let inSingle = false
  while (i < sqlText.length) {
    const ch = sqlText[i]
    if (inSingle) {
      if (ch === "'") {
        if (sqlText[i + 1] === "'") {
          i += 2
          continue
        }
        inSingle = false
        i++
        continue
      }
      i++
      continue
    }
    if (ch === "'") {
      inSingle = true
      i++
      continue
    }
    if (sqlText.slice(i, i + 2) === '$$') {
      const close = sqlText.indexOf('$$', i + 2)
      if (close === -1) throw new Error('Unclosed $$')
      i = close + 2
      continue
    }
    if (ch === ';') return i
    i++
  }
  return -1
}

function extractStatements(sqlText) {
  const statements = []
  let i = 0
  while (i < sqlText.length) {
    while (i < sqlText.length && /\s/.test(sqlText[i])) i++
    if (i >= sqlText.length) break
    const end = nextStatementEnd(sqlText, i)
    if (end === -1) throw new Error('Unclosed statement')
    statements.push(sqlText.slice(i, end + 1).trim())
    i = end + 1
  }
  return statements.filter(Boolean)
}

const statements = extractStatements(raw).filter(
  (s) => !/^begin\b/i.test(s) && !/^commit\b/i.test(s),
)
console.log(`Migration ${MIGRATION}: ${statements.length} statements`)

async function apply(target) {
  const tmpDir = path.join('scripts', '.tmp-migration-apply')
  fs.mkdirSync(tmpDir, { recursive: true })

  for (let n = 0; n < statements.length; n++) {
    const file = path.join(tmpDir, `${MIGRATION}-${target}-${n + 1}.sql`)
    fs.writeFileSync(file, `${statements[n]}\n`, 'utf8')
    process.stderr.write(`[${target}] ${n + 1}/${statements.length}\n`)
    await runSupabaseDbQuery({ target, file, output: 'json' })
  }

  console.log(`Applied ${MIGRATION} to ${target}`)
}

const target = process.argv[2] === 'production' ? 'production' : 'test'
await apply(target)
