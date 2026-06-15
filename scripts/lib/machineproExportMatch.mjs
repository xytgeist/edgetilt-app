/**
 * Match Machine Pro lesson / export titles to canonical alphabetical index lines.
 */
import fs from 'fs'
import path from 'path'
import { loadCanonicalIndexTitles, normalizeIndexTitle } from './machineproDiscover.mjs'

/** @param {string} text */
export function stripNewPrefix(text) {
  return String(text ?? '').replace(/^new\s+/i, '').trim()
}

/** @param {string} title */
export function exportPartsFromTitle(title) {
  return stripNewPrefix(title)
    .split(/\s*[,/]\s*/)
    .flatMap((part) => {
      const bits = [part.trim()]
      if (part.includes(':')) bits.push(part.split(':').slice(1).join(':').trim())
      return bits
    })
    .map((p) => normalizeIndexTitle(p))
    .filter(Boolean)
}

/** @param {string} exportTitle @param {string} canonicalTitle */
export function exportCoversCanonical(exportTitle, canonicalTitle) {
  const expNorm = normalizeIndexTitle(stripNewPrefix(exportTitle))
  const canNorm = normalizeIndexTitle(stripNewPrefix(canonicalTitle))
  if (!canNorm) return false
  if (expNorm === canNorm) return true

  const expParts = exportPartsFromTitle(exportTitle)
  if (expParts.includes(canNorm)) return true

  const canSlashParts = stripNewPrefix(canonicalTitle)
    .split(/\s*\/\s*/)
    .map((p) => normalizeIndexTitle(p))
    .filter(Boolean)
  if (canSlashParts.length > 1 && canSlashParts.every((p) => expParts.includes(p))) return true

  const colonIdx = stripNewPrefix(canonicalTitle).indexOf(':')
  if (colonIdx !== -1) {
    const head = normalizeIndexTitle(stripNewPrefix(canonicalTitle).slice(0, colonIdx))
    const tail = stripNewPrefix(canonicalTitle).slice(colonIdx + 1)
    const tailParts = tail.split(/\s*\/\s*/).map((p) => normalizeIndexTitle(p)).filter(Boolean)
    if (head && expParts.includes(head)) return true
    if (tailParts.length > 1 && tailParts.every((p) => expParts.includes(p))) return true
    if (tailParts.length === 1 && expParts.includes(tailParts[0])) return true
  }

  return false
}

/** @param {string} manifestPath */
export function loadHtmlExportsFromManifest(manifestPath) {
  if (!fs.existsSync(manifestPath)) return []
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  /** @type {Map<string, { title: string, url: string, slug: string }>} */
  const bySlug = new Map()
  for (const row of manifest.exported ?? []) {
    if (row.format !== 'html' || !row.slug) continue
    bySlug.set(row.slug, {
      title: row.title || '',
      url: row.url || '',
      slug: row.slug,
    })
  }
  return [...bySlug.values()]
}

/**
 * Canonical index lines with no HTML export in an archive manifest.
 * @param {string} archiveDir  folder containing manifest.json (e.g. machinepro-export-2026-06-08)
 * @param {string[]} [canonicalTitles]
 */
export function missingCanonicalTitlesFromArchive(archiveDir, canonicalTitles = loadCanonicalIndexTitles()) {
  const manifestPath = path.join(archiveDir, 'manifest.json')
  const exports = loadHtmlExportsFromManifest(manifestPath)
  return canonicalTitles.filter(
    (title) => !exports.some((e) => exportCoversCanonical(e.title, title)),
  )
}

/**
 * Map missing canonical titles → unique discovered lessons (by URL).
 * @param {Array<{ title: string, url: string }>} lessons
 * @param {string[]} missingTitles
 * @param {Array<{ title: string, url: string }> | null} [canonicalLinks]
 */
export function filterLessonsForMissingCanonical(lessons, missingTitles, canonicalLinks = null) {
  /** @type {Map<string, { title: string, url: string }>} */
  const byUrl = new Map()
  /** @type {string[]} */
  const unresolved = []

  for (const title of missingTitles) {
    const fromIndex = canonicalLinks?.find((l) => l.title === title)
    const hit =
      fromIndex ??
      lessons.find((l) => exportCoversCanonical(l.title, title))
    if (hit) byUrl.set(hit.url, { title, url: hit.url })
    else unresolved.push(title)
  }

  return { lessons: [...byUrl.values()], unresolved }
}
