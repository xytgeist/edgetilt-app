/**
 * AP guide workspace batch queue: skip logic, HTML extract, progress I/O.
 */
import fs from 'fs'
import fsp from 'fs/promises'
import path from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { createClient } from '@supabase/supabase-js'
import { guideMatchKeys, pickTitle } from './apGuideMatchKeys.mjs'
import { slugify } from './exportSlotSlug.mjs'
import { AP_GUIDE_VOICE_RULES } from './apGuideVoiceRules.mjs'
import { loadSupabaseEnv, readSupabaseCredentials, repoRoot } from './supabaseEnv.mjs'

export const WORKSPACE_ROOT = path.join(repoRoot, 'ap-guide-workspace')
export const PROGRESS_PATH = path.join(WORKSPACE_ROOT, '_batch-progress.json')
export const DONE_DIR_NAME = '___DONE'
export const BATCH_SIZE = 10

/** Existing cards to full-resynth (batch 0). Guide slug → workspace folder name. */
export const UPDATE_GUIDE_MAP = {
  'ainsworth-must-hit-by': 'ainsworth-must-hit-by',
  'igt-must-hit-by': 'igt-must-hit-by',
  'luckymon-evolutions': 'luckymon-evolutions-all-that-glitters-on-a-silver-platter',
}

export const UPDATE_GUIDE_SLUGS = Object.keys(UPDATE_GUIDE_MAP)

/** @param {string} html */
export function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

/** @param {string} folderSlug */
export function workspaceFolderPath(folderSlug) {
  return path.join(WORKSPACE_ROOT, folderSlug)
}

export function doneDirPath() {
  return path.join(WORKSPACE_ROOT, DONE_DIR_NAME)
}

/** Top-level dirs scanned for the create queue (excludes ___DONE and _* meta). */
export function isActiveWorkspaceFolder(name) {
  if (!name || name === DONE_DIR_NAME) return false
  if (name.startsWith('_')) return false
  return true
}

const execFileAsync = promisify(execFile)

/**
 * OneDrive on Windows often blocks fs.rename (EPERM). robocopy /MOVE works.
 * @param {string} src
 * @param {string} dest
 */
async function moveFolderRobocopy(src, dest) {
  await execFileAsync(
    'robocopy',
    [src, dest, '/E', '/MOVE', '/NFL', '/NDL', '/NJH', '/NJS', '/nc', '/ns', '/np'],
    { windowsHide: true },
  ).catch((err) => {
    const code = err.code
    if (typeof code === 'number' && code <= 7) return
    throw err
  })
  if (fs.existsSync(src)) {
    await fsp.rm(src, { recursive: true, force: true })
  }
  if (!fs.existsSync(dest)) {
    throw new Error(`robocopy finished but dest missing: ${dest}`)
  }
}

/**
 * Move a completed workspace folder into ap-guide-workspace/___DONE/.
 * @param {string} folderSlug
 * @returns {Promise<{ moved: boolean, from?: string, to?: string, reason?: string, method?: string }>}
 */
export async function moveWorkspaceFolderToDone(folderSlug) {
  if (!folderSlug) return { moved: false, reason: 'empty-slug' }

  const src = workspaceFolderPath(folderSlug)
  const dest = path.join(doneDirPath(), folderSlug)

  if (!fs.existsSync(src)) {
    if (fs.existsSync(dest)) return { moved: false, reason: 'already-in-done', to: dest }
    return { moved: false, reason: 'source-missing', from: src }
  }

  await fsp.mkdir(doneDirPath(), { recursive: true })
  if (fs.existsSync(dest)) {
    throw new Error(`Cannot move ${folderSlug} to ${DONE_DIR_NAME}: already exists at ${dest}`)
  }

  try {
    await fsp.rename(src, dest)
    return { moved: true, from: src, to: dest, method: 'rename' }
  } catch (err) {
    const code = /** @type {NodeJS.ErrnoException} */ (err).code
    if (process.platform === 'win32' && (code === 'EPERM' || code === 'EXDEV')) {
      await moveFolderRobocopy(src, dest)
      return { moved: true, from: src, to: dest, method: 'robocopy' }
    }
    throw err
  }
}

/** @param {string} folderSlug */
export function listHtmlSources(folderSlug) {
  const base = workspaceFolderPath(folderSlug)
  if (!fs.existsSync(base)) return []

  /** @type {Array<{ subdir: string, title: string, url: string, text: string, textLen: number }>} */
  const out = []

  const scanDir = (relDir) => {
    const dir = path.join(base, relDir)
    const htmlPath = path.join(dir, 'index.html')
    if (!fs.existsSync(htmlPath)) return
    let title = folderSlug
    let url = ''
    const metaPath = path.join(dir, 'meta.json')
    if (fs.existsSync(metaPath)) {
      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'))
        if (meta.title) title = meta.title
        if (meta.url) url = meta.url
      } catch {
        /* ignore */
      }
    }
    const text = stripHtml(fs.readFileSync(htmlPath, 'utf8'))
    if (text.length < 80) return
    out.push({ subdir: relDir || '.', title, url, text, textLen: text.length })
  }

  if (fs.existsSync(path.join(base, 'index.html'))) scanDir('.')

  for (const ent of fs.readdirSync(base, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue
    scanDir(ent.name)
  }

  return out.sort((a, b) => b.textLen - a.textLen)
}

/** @param {string} folderSlug @param {ReturnType<typeof listHtmlSources>} sources */
export function displayTitleForFolder(folderSlug, sources) {
  const titles = sources.map((s) => s.title).filter(Boolean)
  if (titles.length) return pickTitle(titles[0], titles.slice(1).join(' / '))
  return folderSlug
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

/** @param {string} folderSlug @param {ReturnType<typeof listHtmlSources>} sources */
export function folderMatchKeys(folderSlug, sources) {
  const keys = new Set(guideMatchKeys({ title: displayTitleForFolder(folderSlug, sources), url: '', folder: folderSlug }))
  for (const s of sources) {
    for (const k of guideMatchKeys({ title: s.title, url: s.url || '', folder: folderSlug })) {
      keys.add(k)
    }
  }
  return keys
}

/** @param {Array<{ slug: string, title: string, keys: Set<string> }>} existingGuides @param {Set<string>} folderKeys @param {string} folderSlug */
export function findExistingGuideMatch(existingGuides, folderKeys, folderSlug) {
  const exact = existingGuides.find((g) => g.slug === folderSlug)
  if (exact) return exact

  for (const g of existingGuides) {
    for (const k of folderKeys) {
      if (g.keys.has(k)) return g
    }
  }
  return null
}

/** @returns {Promise<Array<{ slug: string, title: string, keys: Set<string> }>>} */
export async function loadExistingGuideIndex() {
  loadSupabaseEnv('test')
  const { url, key } = readSupabaseCredentials()
  const sb = createClient(url, key, { auth: { persistSession: false } })
  const { data, error } = await sb.from('guides').select('slug, title, machines(name, slug)')
  if (error) throw new Error(error.message)

  return (data ?? []).map((row) => {
    const m = Array.isArray(row.machines) ? row.machines[0] : row.machines
    const title = row.title || m?.name || row.slug
    const keys = new Set(
      guideMatchKeys({ title, url: '', folder: row.slug || m?.slug || '' }),
    )
    if (m?.slug) keys.add(slugify(m.slug))
    return { slug: row.slug, title, keys }
  })
}

/** @param {string} folderSlug @param {Awaited<ReturnType<typeof loadExistingGuideIndex>>} existingGuides */
export function classifyWorkspaceFolder(folderSlug, existingGuides) {
  const sources = listHtmlSources(folderSlug)
  if (!sources.length) {
    return { folderSlug, action: 'skip', reason: 'no-html', sources, displayTitle: folderSlug }
  }

  const folderKeys = folderMatchKeys(folderSlug, sources)
  const displayTitle = displayTitleForFolder(folderSlug, sources)

  const updateSlug = UPDATE_GUIDE_SLUGS.find((s) => {
    if (UPDATE_GUIDE_MAP[s] === folderSlug) return true
    return s === folderSlug
  })

  if (updateSlug) {
    return { folderSlug, action: 'update', updateSlug, sources, displayTitle, folderKeys }
  }

  const match = findExistingGuideMatch(existingGuides, folderKeys, folderSlug)
  if (match) {
    return {
      folderSlug,
      action: 'skip',
      reason: 'existing-game',
      matchSlug: match.slug,
      sources,
      displayTitle,
      folderKeys,
    }
  }

  return { folderSlug, action: 'create', cardSlug: folderSlug, sources, displayTitle, folderKeys }
}

/** @param {Awaited<ReturnType<typeof loadExistingGuideIndex>>} existingGuides */
export function buildFullQueue(existingGuides) {
  if (!fs.existsSync(WORKSPACE_ROOT)) throw new Error(`Missing ${WORKSPACE_ROOT}`)

  const folders = fs
    .readdirSync(WORKSPACE_ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory() && isActiveWorkspaceFolder(d.name))
    .map((d) => d.name)
    .sort((a, b) => a.localeCompare(b))

  /** @type {ReturnType<classifyWorkspaceFolder>[]} */
  const classified = folders.map((f) => classifyWorkspaceFolder(f, existingGuides))

  /** Batch 0: updates by guide slug order */
  const batch0Items = UPDATE_GUIDE_SLUGS.map((guideSlug) => {
    const wsFolder = UPDATE_GUIDE_MAP[guideSlug]
    const hit = classified.find((c) => c.folderSlug === wsFolder)
    if (hit?.sources?.length) {
      return { guideSlug, workspaceFolder: wsFolder, status: 'pending', displayTitle: hit.displayTitle }
    }
    return {
      guideSlug,
      workspaceFolder: wsFolder,
      status: 'pending',
      displayTitle: guideSlug,
      note: hit ? 'no-html-in-workspace' : 'workspace-folder-missing',
    }
  })

  const creates = classified.filter((c) => c.action === 'create')
  const skipped = classified.filter((c) => c.action === 'skip')

  /** @type {Array<{ batch: number, folders: string[] }>} */
  const createBatches = []
  for (let i = 0; i < creates.length; i += BATCH_SIZE) {
    const slice = creates.slice(i, i + BATCH_SIZE)
    createBatches.push({
      batch: Math.floor(i / BATCH_SIZE) + 1,
      folders: slice.map((c) => c.folderSlug),
    })
  }

  return { batch0Items, creates, skipped, createBatches, totalFolders: folders.length }
}

/** @param {Awaited<ReturnType<typeof buildFullQueue>>} queue */
export function buildProgressDocument(queue) {
  const now = new Date().toISOString()
  return {
    version: 1,
    batchSize: BATCH_SIZE,
    updatedAt: now,
    rules: {
      source: AP_GUIDE_VOICE_RULES.sourceFolder,
      cardSlug: 'top-level folder name',
      skipExistingGame: true,
      heroes: AP_GUIDE_VOICE_RULES.heroes,
      published: AP_GUIDE_VOICE_RULES.published,
      completedFolders: `move to ${DONE_DIR_NAME}/ after ingest`,
      voice: AP_GUIDE_VOICE_RULES.voice,
      noSourceAttribution:
        'Never name or link MP, AP, Slot Farmers, Advantage Play, or other scrape sources in guide copy',
      whereToFindBatchSynth:
        'Omit where_to_find in batch payloads — Ryan fills via slot-guide-form after ingest (see AP_GUIDE_VOICE_RULES)',
      concise:
        'Primary play first in When to play; Bankroll leads with **N units**; sparse "I want" (contrast-only)',
    },
    stats: {
      totalWorkspaceFolders: queue.totalFolders,
      toCreate: queue.creates.length,
      skippedExisting: queue.skipped.filter((s) => s.reason === 'existing-game').length,
      skippedNoHtml: queue.skipped.filter((s) => s.reason === 'no-html').length,
      createBatchCount: queue.createBatches.length,
      batch0UpdateCount: queue.batch0Items.length,
    },
    batch0: {
      label: 'resynth-updates',
      status: 'pending',
      items: queue.batch0Items.map((item) => ({ ...item, status: 'pending' })),
      completed: [],
      failed: [],
    },
    batches: queue.createBatches.map((b) => ({
      batch: b.batch,
      status: 'pending',
      planned: b.folders,
      completed: [],
      skipped: [],
      failed: [],
    })),
    skipLog: queue.skipped
      .filter((s) => s.reason === 'existing-game')
      .map((s) => ({
        folder: s.folderSlug,
        reason: s.reason,
        existingGuideSlug: s.matchSlug,
        displayTitle: s.displayTitle,
      })),
    next: { phase: 'batch0', batch: 0 },
  }
}

export async function initBatchProgress({ force = false } = {}) {
  if (fs.existsSync(PROGRESS_PATH) && !force) {
    throw new Error(`Progress file exists: ${PROGRESS_PATH} (pass force=true to rebuild)`)
  }
  const existingGuides = await loadExistingGuideIndex()
  const queue = buildFullQueue(existingGuides)
  const doc = buildProgressDocument(queue)
  await fsp.mkdir(WORKSPACE_ROOT, { recursive: true })
  await fsp.writeFile(PROGRESS_PATH, JSON.stringify(doc, null, 2), 'utf8')
  return { doc, queue }
}

export async function readBatchProgress() {
  const raw = await fsp.readFile(PROGRESS_PATH, 'utf8')
  return JSON.parse(raw)
}

/** @param {Record<string, unknown>} doc */
export async function writeBatchProgress(doc) {
  doc.updatedAt = new Date().toISOString()
  await fsp.writeFile(PROGRESS_PATH, JSON.stringify(doc, null, 2), 'utf8')
}
