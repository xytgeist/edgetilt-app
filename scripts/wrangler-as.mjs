#!/usr/bin/env node
/**
 * Run wrangler against Operations or Investigence using gitignored token files.
 *
 *   node scripts/wrangler-as.mjs operations pages project list
 *   node scripts/wrangler-as.mjs investigence pages deploy sites/digiverse-ventures --project-name=digiverse-ventures --commit-dirty=true
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const ACCOUNTS = {
  operations: {
    file: '.env.cloudflare.operations',
    accountId: 'e8b180b08329ff5de73fba3066e9c1ad',
    login: 'Operations@lvslotpro.com',
  },
  investigence: {
    file: '.env.cloudflare.investigence',
    accountId: 'dda7b47930eac57521c13cfa4efba3cd',
    login: 'Investigence@gmail.com',
  },
}

function loadEnvFile(relPath) {
  const full = path.join(root, relPath)
  const out = {}
  if (!fs.existsSync(full)) return out
  for (const line of fs.readFileSync(full, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let val = trimmed.slice(eq + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    out[key] = val
  }
  return out
}

const alias = String(process.argv[2] || '').toLowerCase()
const wranglerArgs = process.argv.slice(3)
const account = ACCOUNTS[alias]
if (!account || wranglerArgs.length === 0) {
  console.error('Usage: node scripts/wrangler-as.mjs operations|investigence <wrangler args...>')
  process.exit(1)
}

const fileEnv = loadEnvFile(account.file)
const token = String(fileEnv.CLOUDFLARE_API_TOKEN || process.env.CLOUDFLARE_API_TOKEN || '').trim()
const accountId = String(fileEnv.CLOUDFLARE_ACCOUNT_ID || account.accountId).trim()
if (!token) {
  console.error(
    `Missing CLOUDFLARE_API_TOKEN for ${alias} (${account.login}).\nCopy .env.cloudflare.example to ${account.file} and paste a Pages-edit account token.`,
  )
  process.exit(1)
}

const child = spawn(
  'npx',
  ['--yes', 'wrangler', ...wranglerArgs],
  {
    cwd: root,
    stdio: 'inherit',
    shell: true,
    env: {
      ...process.env,
      CLOUDFLARE_API_TOKEN: token,
      CLOUDFLARE_ACCOUNT_ID: accountId,
    },
  },
)
child.on('exit', (code) => process.exit(code ?? 1))
