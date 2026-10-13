#!/usr/bin/env node
/**
 * Logical Supabase dump → private Cloudflare R2 (offsite backup).
 *
 * Usage:
 *   node scripts/db-dump-to-r2.mjs --target=production
 *   node scripts/db-dump-to-r2.mjs --target=production --tag=pre-migrate
 *   node scripts/db-dump-to-r2.mjs --target=production --dry-run
 *   node scripts/db-dump-to-r2.mjs --target=production --prune-only
 *
 * Prod-only by design. Test sandbox keeps Supabase included daily backups …
 * `--target=test` remains for rare manual use, not the Windows cron.
 *
 * Requires: pg_dump on PATH, SUPABASE_DB_PASSWORD (or SUPABASE_DB_URL) for the
 * target, and DB_BACKUP_R2_* for a private R2 bucket. See docs/db-r2-backups.md.
 *
 * Default cadence (Windows task): daily prod. Do not move to 4×/day until a dump
 * size printout shows Supabase egress stays comfortable (~under 2 GB compressed).
 */
import { spawnSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  dbBackupR2PrunePrefix,
  dbBackupR2PutFile,
  readDbBackupR2Config,
} from './lib/dbBackupR2.mjs'
import { loadSupabaseEnv, repoRoot } from './lib/supabaseEnv.mjs'
import { PROJECT_REFS, resolveSupabaseDbUrl } from './lib/supabaseDbCli.mjs'

const RETAIN_DAYS = 14
const EGRESS_INCLUDED_GB = 250
const EGRESS_OVERAGE_PER_GB = 0.09

function parseArgs(argv) {
  const out = {
    target: 'production',
    tag: '',
    dryRun: false,
    pruneOnly: false,
    skipPrune: false,
    keepLocal: false,
  }
  for (const arg of argv) {
    if (arg === '--dry-run') out.dryRun = true
    else if (arg === '--prune-only') out.pruneOnly = true
    else if (arg === '--skip-prune') out.skipPrune = true
    else if (arg === '--keep-local') out.keepLocal = true
    else if (arg.startsWith('--target=')) out.target = arg.slice('--target='.length)
    else if (arg.startsWith('--tag=')) out.tag = arg.slice('--tag='.length).trim()
    else if (arg === '--help' || arg === '-h') {
      console.log(`Usage:
  node scripts/db-dump-to-r2.mjs [--target=production] [options]

Options:
  --target=production   Default. Offsite R2 dump for edgetilt.com prod.
  --target=test         Rare manual only … test uses Supabase daily backups.
  --target=both         Explicit dual dump (not used by the Windows task).
  --tag=NAME            On-demand label (object under .../ondemand/)
  --dry-run             Resolve config + db url; do not dump or upload
  --prune-only          Only prune objects older than ${RETAIN_DAYS} days
  --skip-prune          Upload without pruning
  --keep-local          Keep the local .dump file under scripts/.db-dumps/

Docs: docs/db-r2-backups.md`)
      process.exit(0)
    }
  }
  if (!['test', 'production', 'both'].includes(out.target)) {
    throw new Error('--target must be test, production, or both')
  }
  if (out.tag && !/^[a-zA-Z0-9._-]{1,48}$/.test(out.tag)) {
    throw new Error('--tag must be 1–48 chars: letters, digits, . _ -')
  }
  return out
}

function findPgDump() {
  const hit = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['pg_dump'], {
    encoding: 'utf8',
    shell: process.platform === 'win32',
  })
  const line = (hit.stdout || '').split(/\r?\n/).map((s) => s.trim()).find(Boolean)
  if (hit.status === 0 && line) return line
  return null
}

function utcStamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`
}

function objectKey(target, tag, stamp) {
  const kind = tag ? 'ondemand' : 'cron'
  const base = tag
    ? `edgetilt-${target}-${tag}-${stamp}.dump`
    : `edgetilt-${target}-${stamp}.dump`
  return `db-backups/${target}/${kind}/${base}`
}

function formatBytes(n) {
  if (n < 1024) return `${n} B`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KiB`
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(2)} MiB`
  return `${(n / 1024 ** 3).toFixed(2)} GiB`
}

function printEgressEstimate(bytes, label) {
  const gb = bytes / 1024 ** 3
  const daily1x = gb
  const daily4x = gb * 4
  const monthly1x = daily1x * 30
  const monthly4x = daily4x * 30
  const overage = (monthly) => Math.max(0, monthly - EGRESS_INCLUDED_GB) * EGRESS_OVERAGE_PER_GB
  console.log(`[egress-estimate] ${label} compressed=${formatBytes(bytes)} (${gb.toFixed(3)} GiB)`)
  console.log(
    `[egress-estimate]   daily cron → ~${monthly1x.toFixed(1)} GiB/mo egress` +
      (overage(monthly1x) > 0
        ? ` (≈$${overage(monthly1x).toFixed(2)} over Pro 250 GiB @ $${EGRESS_OVERAGE_PER_GB}/GiB)`
        : ' (inside Pro 250 GiB included, assuming this project alone)'),
  )
  console.log(
    `[egress-estimate]   4×/day → ~${monthly4x.toFixed(1)} GiB/mo egress` +
      (overage(monthly4x) > 0
        ? ` (≈$${overage(monthly4x).toFixed(2)} overage) … only bump cadence if dump stays ≲2 GiB`
        : ' (still inside 250 GiB)'),
  )
}

function runPgDump(pgDumpPath, dbUrl, outFile) {
  const result = spawnSync(
    pgDumpPath,
    [
      `--dbname=${dbUrl}`,
      '--format=custom',
      '--no-owner',
      '--no-acl',
      `--file=${outFile}`,
    ],
    {
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024,
      env: process.env,
    },
  )
  if (result.status !== 0) {
    const errText = `${result.stderr || ''}\n${result.stdout || ''}`.trim()
    throw new Error(errText || `pg_dump exited ${result.status}`)
  }
}

async function dumpOne(target, opts, cfg) {
  const ref = PROJECT_REFS[target]
  console.log(`\n=== ${target} (${ref}) ===`)

  const prefix = `db-backups/${target}/`
  const stamp = utcStamp()
  const key = objectKey(target, opts.tag, stamp)
  const localDir = path.join(repoRoot, 'scripts', '.db-dumps')
  const localFile = path.join(localDir, path.basename(key))

  if (opts.dryRun) {
    console.log(`[dry-run] would pg_dump → ${localFile}`)
    console.log(`[dry-run] would upload → r2://${cfg.bucket}/${key}`)
    console.log(`[dry-run] would prune ${prefix} older than ${RETAIN_DAYS}d (unless --skip-prune)`)
    try {
      loadSupabaseEnv(target)
      const dbUrl = resolveSupabaseDbUrl(target)
      if (dbUrl && dbUrl.includes(ref)) console.log(`[dry-run] db url ok (ref ${ref})`)
      else console.log(`[dry-run] db url missing … set SUPABASE_DB_PASSWORD for ${target} before a real run`)
    } catch (err) {
      console.log(`[dry-run] db env: ${err?.message || err}`)
    }
    return
  }

  loadSupabaseEnv(target)
  const dbUrl = resolveSupabaseDbUrl(target)
  if (!dbUrl) {
    throw new Error(
      `No DB URL for ${target}. Set SUPABASE_DB_PASSWORD (or SUPABASE_DB_URL with this project ref) in .env.supabase.${target} / .env.master.`,
    )
  }
  if (!dbUrl.includes(ref)) {
    throw new Error(`Resolved DB URL does not contain project ref ${ref}. Refusing to dump.`)
  }

  if (opts.pruneOnly) {
    const pruned = await dbBackupR2PrunePrefix(cfg, prefix, RETAIN_DAYS)
    console.log(`pruned=${pruned.deleted.length} kept=${pruned.kept}`)
    return
  }

  fs.mkdirSync(localDir, { recursive: true })

  const pgDumpPath = findPgDump()
  if (!pgDumpPath) {
    throw new Error(
      'pg_dump not found on PATH. Install PostgreSQL client tools (Windows: https://www.postgresql.org/download/windows/ … Linux: sudo apt-get install -y postgresql-client).',
    )
  }

  console.log(`pg_dump → ${localFile}`)
  const t0 = Date.now()
  runPgDump(pgDumpPath, dbUrl, localFile)
  const bytes = fs.statSync(localFile).size
  const dumpMs = Date.now() - t0
  console.log(`dump ok size=${formatBytes(bytes)} elapsed=${(dumpMs / 1000).toFixed(1)}s`)
  printEgressEstimate(bytes, target)

  console.log(`upload → r2://${cfg.bucket}/${key}`)
  const uploaded = await dbBackupR2PutFile(cfg, key, localFile, 'application/octet-stream')
  console.log(`upload ok bytes=${uploaded}`)

  if (!opts.skipPrune) {
    const pruned = await dbBackupR2PrunePrefix(cfg, prefix, RETAIN_DAYS)
    console.log(`prune older than ${RETAIN_DAYS}d: deleted=${pruned.deleted.length} kept=${pruned.kept}`)
    if (pruned.deleted.length) {
      for (const k of pruned.deleted.slice(0, 8)) console.log(`  - ${k}`)
      if (pruned.deleted.length > 8) console.log(`  … +${pruned.deleted.length - 8} more`)
    }
  }

  if (!opts.keepLocal) {
    try {
      fs.unlinkSync(localFile)
    } catch {
      /* ignore */
    }
  } else {
    console.log(`kept local ${localFile}`)
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  const targets = opts.target === 'both' ? ['test', 'production'] : [opts.target]

  let cfg = null
  try {
    cfg = readDbBackupR2Config()
  } catch (err) {
    if (opts.dryRun) {
      console.log(`[dry-run] R2 config: ${err.message}`)
      cfg = {
        accountId: '0'.repeat(32),
        accessKeyId: 'dry',
        secretAccessKey: 'dry',
        bucket: 'dry-run-bucket',
      }
    } else {
      throw err
    }
  }

  console.log(
    `db-dump-to-r2  targets=${targets.join(',')}  bucket=${cfg.bucket}  retain=${RETAIN_DAYS}d` +
      (opts.tag ? `  tag=${opts.tag}` : '') +
      (opts.dryRun ? '  DRY-RUN' : ''),
  )
  console.log(`host=${os.hostname()}  node=${process.version}`)

  for (const target of targets) {
    await dumpOne(target, opts, cfg)
  }
  console.log('\nDone.')
}

main().catch((err) => {
  console.error(err?.message || err)
  process.exit(1)
})
