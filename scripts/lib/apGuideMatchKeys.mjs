import { slugify, slotNameFromUrlPath } from './exportSlotSlug.mjs'

const BOILERPLATE =
  /\b(advantage\s*play(?:ing)?|how\s+to\s+(?:advantage\s*play|beat)|guide|strategy|calculator|slot\s*machine|by\s+[\w\s./]+)$/gi

const MANUFACTURER_PREFIX =
  /^(?:aristocrat(?:\s+gaming)?|igt|gtech|wms|ainsworth|everi|aruze|spielo|apex\s+gaming|gimmie\s+games|colossal\s+gaming)[\u2019's]*\s+/i

/** @param {string} text */
function normalizeText(text) {
  return String(text ?? '')
    .replace(/[\u2018\u2019\u2032]/g, "'")
    .replace(/[""]/g, '"')
    .replace(/[""]/g, '"')
}

/** @param {string} title */
function extractQuotedNames(title) {
  const text = normalizeText(title)
  const names = []
  for (const m of text.matchAll(/"([^"]+)"|'([^']+)'|[\u201c]([^\u201d]+)[\u201d]/g)) {
    const n = (m[1] || m[2] || m[3] || '').trim()
    if (n.length > 2) names.push(n)
  }
  return names
}

/** @param {string} title */
function cleanTitleFragment(title) {
  let t = normalizeText(title)
    .replace(/\s+advantage\s+play\s*$/i, '')
    .replace(BOILERPLATE, '')
    .replace(MANUFACTURER_PREFIX, '')
    .replace(/^the\s+/i, '')
    .trim()
  t = t.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim()
  return t
}

/** @param {string} slug */
function normalizeSlug(slug) {
  let s = String(slug ?? '')
    .toLowerCase()
    .replace(/^\d+-/, '')
    .replace(/-advantage-play$/i, '')
    .replace(/-advantage-play-slot-machine-or-not$/i, '')
    .replace(/-analysis$/i, '')
  s = s.replace(/^the-/, '')
  return s
}

/** @param {string} title */
function splitComboTitle(title) {
  const text = normalizeText(title)
  const parts = text
    .split(/\s*[/&]\s*|\s+and\s+|\s*\+\s*|\s*\|\s*/i)
    .map((p) => cleanTitleFragment(p))
    .filter((p) => p.length > 2)
  return parts.length ? parts : [cleanTitleFragment(title)]
}

/** @param {string} slug */
function splitComboSlug(slug) {
  const s = normalizeSlug(slug)
  const out = new Set([s])

  /** e.g. ocean-magic-4d-ocean-magic-ultra → ocean-magic-4d + ocean-magic-ultra */
  for (let len = 4; len >= 2; len--) {
    for (let i = 0; i <= s.length - len; i++) {
      const phrase = s.slice(i, i + len)
      if (!phrase.includes('-')) continue
      const needle = `-${phrase}-`
      const idx = s.indexOf(needle, 1)
      if (idx > 0) {
        out.add(s.slice(0, idx))
        out.add(s.slice(idx + 1))
      }
    }
  }

  return [...out]
}

/** @param {string} key */
function isWeakKey(key) {
  if (!key || key.length < 3) return true
  const weak = new Set([
    'post',
    'untitled',
    'advantage-play',
    'slot-machine-myths',
    'privacy-policy',
    'dragon-link-family',
  ])
  return weak.has(key)
}

/**
 * Build match aliases for cross-site grouping.
 * @param {{ title: string, url: string, folder: string }} row
 */
export function guideMatchKeys({ title, url, folder }) {
  /** @type {Set<string>} */
  const keys = new Set()

  try {
    keys.add(normalizeSlug(slotNameFromUrlPath(url)))
  } catch {
    /* ignore */
  }

  keys.add(normalizeSlug(folder))

  const folderSlug = normalizeSlug(folder)

  for (const quoted of extractQuotedNames(title)) {
    keys.add(slugify(cleanTitleFragment(quoted)))
    for (const part of splitComboTitle(quoted)) {
      keys.add(slugify(part))
    }
  }

  if (title.includes('/') || title.includes('|')) {
    keys.add(slugify(cleanTitleFragment(title.replace(/[/|]/g, ' '))))
    if (folderSlug) keys.add(folderSlug)
    for (const part of splitComboTitle(title)) {
      const partSlug = slugify(part)
      if (!folderSlug) {
        keys.add(partSlug)
        continue
      }
      if (partSlug === folderSlug || folderSlug.startsWith(`${partSlug}-`) || partSlug.startsWith(`${folderSlug}-`)) {
        continue
      }
      /** Combo lesson: folder is first game; keep distinct second-game slugs only */
      if (partSlug.length > folderSlug.length + 3) keys.add(partSlug)
    }
  } else {
    for (const part of splitComboTitle(title)) {
      keys.add(slugify(part))
    }
  }

  for (const part of splitComboSlug(folder)) {
    keys.add(normalizeSlug(part))
    keys.add(slugify(part.replace(/-/g, ' ')))
  }

  return [...keys].filter((k) => !isWeakKey(k))
}

/**
 * Union-find clustering: entries sharing any alias merge.
 * @param {{ title: string, url: string, folder: string, source: string, label: string }[]} entries
 */
export function clusterGuideEntries(entries) {
  /** @type {Map<string, number>} */
  const aliasToIdx = new Map()
  /** @type {{ title: string, aliases: Set<string>, sites: Map<string, { url: string, folder: string, title: string }> }[]} */
  const groups = []

  function mergeInto(targetIdx, sourceIdx) {
    if (targetIdx === sourceIdx) return targetIdx
    const target = groups[targetIdx]
    const source = groups[sourceIdx]
    for (const a of source.aliases) {
      target.aliases.add(a)
      aliasToIdx.set(a, targetIdx)
    }
    for (const [site, info] of source.sites) {
      if (!target.sites.has(site)) target.sites.set(site, info)
      else target.title = pickTitle(target.title, info.title)
    }
    groups[sourceIdx] = null
    return targetIdx
  }

  for (const row of entries) {
    const aliases = guideMatchKeys(row)
    const aliasSet = new Set(aliases)

    /** @type {Set<number>} */
    const hits = new Set()
    for (const a of aliasSet) {
      if (aliasToIdx.has(a)) hits.add(aliasToIdx.get(a))
    }

    let idx
    if (hits.size === 0) {
      idx = groups.length
      groups.push({
        title: row.title,
        aliases: aliasSet,
        sites: new Map([[row.source, { url: row.url, folder: row.folder, title: row.title }]]),
      })
    } else {
      idx = [...hits].sort((a, b) => a - b)[0]
      for (const h of hits) {
        if (h !== idx) idx = mergeInto(idx, h)
      }
      const g = groups[idx]
      if (g) {
        for (const a of aliasSet) g.aliases.add(a)
        g.title = pickTitle(g.title, row.title)
        if (!g.sites.has(row.source)) {
          g.sites.set(row.source, { url: row.url, folder: row.folder, title: row.title })
        }
      }
    }

    for (const a of aliasSet) aliasToIdx.set(a, idx)
  }

  return groups.filter(Boolean)
}

/** @param {string} current @param {string} next */
function pickTitle(current, next) {
  const clean = (t) => cleanTitleFragment(t).replace(/\s+advantage\s+play\s*$/i, '').trim()
  const a = clean(current)
  const b = clean(next)
  if (!a) return next
  if (!b) return current
  if (/untitled/i.test(a)) return next
  if (/untitled/i.test(b)) return current
  /** Prefer shorter readable name without editorial prefix */
  if (a.length <= b.length && !/^how to/i.test(a)) return current
  if (!/^how to/i.test(b) && b.length < a.length) return next
  return current.length <= b.length ? current : next
}

export { cleanTitleFragment, normalizeSlug, pickTitle }
