#!/usr/bin/env node
/**
 * Fetch scarekrow/ufc-data for UFC backtest.
 *
 * Tries (in order):
 *   1. kagglehub via Python (if installed) — matches Kaggle UI snippet
 *   2. Kaggle REST API v1 from Node (Bearer token or legacy basic auth)
 *
 * Usage:
 *   npm run fetch:ufc-data
 *   npm run fetch:ufc-data -- --force
 *
 * Auth: KAGGLE_API_TOKEN, ~/.kaggle/access_token, kaggle auth login, or ~/.kaggle/kaggle.json
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { kaggleAuthHeaders, kaggleAuthHelpText, loadKaggleAuth } from './lib/ufcKaggleAuth.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATASET = 'scarekrow/ufc-data'
const OUT_DIR = path.join(process.cwd(), 'data', 'ufc')
const OUT_FILE = path.join(OUT_DIR, 'UFC_full_data_silver_v2.csv')
const PREFERRED_NAMES = ['UFC_full_data_silver_v2.csv', 'ufc_full_data_silver_v2.csv']

function hasFlag(flag) {
  return process.argv.includes(flag)
}

function tryPythonKagglehub(force) {
  const pyScript = path.join(__dirname, 'fetch-ufc-kaggle-data.py')
  for (const py of [process.env.PYTHON, process.env.PYTHON3, 'python3', 'python', 'py'].filter(Boolean)) {
    const probe = spawnSync(py, ['-c', 'import kagglehub'], { encoding: 'utf8', stdio: 'pipe' })
    if (probe.status !== 0) continue
    const args = [pyScript]
    if (force) args.push('--force')
    const run = spawnSync(py, args, { stdio: 'inherit' })
    if (run.status === 0) return true
    process.exit(run.status ?? 1)
  }
  return false
}

function findCsv(root) {
  for (const name of PREFERRED_NAMES) {
    const hit = path.join(root, name)
    if (fs.existsSync(hit)) return hit
  }
  /** @type {string[]} */
  const csvs = []
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name.toLowerCase().endsWith('.csv')) csvs.push(full)
    }
  }
  walk(root)
  const silver = csvs.filter((p) => {
    const n = path.basename(p).toLowerCase()
    return n.includes('silver') && n.includes('v2')
  })
  if (silver.length) {
    return silver.sort((a, b) => fs.statSync(b).size - fs.statSync(a).size)[0]
  }
  if (csvs.length === 1) return csvs[0]
  if (csvs.length) return csvs.sort((a, b) => fs.statSync(b).size - fs.statSync(a).size)[0]
  return null
}

function unzipArchive(zipPath, destDir) {
  fs.mkdirSync(destDir, { recursive: true })
  if (process.platform === 'win32') {
    const ps = spawnSync(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`,
      ],
      { stdio: 'inherit' },
    )
    if (ps.status !== 0) throw new Error('Expand-Archive failed')
    return
  }
  const unzip = spawnSync('unzip', ['-o', zipPath, '-d', destDir], { stdio: 'inherit' })
  if (unzip.status !== 0) throw new Error('unzip failed')
}

async function downloadDatasetZip(auth, tmpDir) {
  const url = `https://www.kaggle.com/api/v1/datasets/download/${DATASET}`
  const res = await fetch(url, { headers: kaggleAuthHeaders(auth) })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Kaggle download ${res.status}: ${body.slice(0, 200)}`)
  }
  const zipPath = path.join(tmpDir, 'ufc-data.zip')
  fs.mkdirSync(tmpDir, { recursive: true })
  fs.writeFileSync(zipPath, Buffer.from(await res.arrayBuffer()))
  return zipPath
}

async function fetchViaNodeApi(force) {
  if (fs.existsSync(OUT_FILE) && !force) {
    const sizeMb = fs.statSync(OUT_FILE).size / (1024 * 1024)
    console.log(`Already staged: ${OUT_FILE} (${sizeMb.toFixed(1)} MB)`)
    console.log('Use --force to re-download from Kaggle.')
    return
  }

  const auth = loadKaggleAuth()
  if (!auth) {
    console.error('No Kaggle credentials found.\n')
    console.error(kaggleAuthHelpText())
    process.exit(1)
  }

  const tmpDir = path.join(os.tmpdir(), `lvslotpro-ufc-kaggle-${Date.now()}`)
  try {
    console.log(`Downloading ${DATASET} via Kaggle API...`)
    const zipPath = await downloadDatasetZip(auth, tmpDir)
    const extractDir = path.join(tmpDir, 'extract')
    unzipArchive(zipPath, extractDir)

    const csvSrc = findCsv(extractDir)
    if (!csvSrc) throw new Error(`No CSV found in downloaded ${DATASET} archive`)

    fs.mkdirSync(OUT_DIR, { recursive: true })
    fs.copyFileSync(csvSrc, OUT_FILE)
    const sizeMb = fs.statSync(OUT_FILE).size / (1024 * 1024)
    console.log(`Staged for backtest: ${OUT_FILE} (${sizeMb.toFixed(1)} MB, source: ${path.basename(csvSrc)})`)
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
}

async function main() {
  const force = hasFlag('--force')
  if (tryPythonKagglehub(force)) return
  await fetchViaNodeApi(force)
}

main().catch((err) => {
  console.error(err.message || err)
  process.exit(1)
})
