/**
 * Derive a short folder slug (slot name only) from a guide title + source URL.
 */
export function slugify(text) {
  return String(text ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\u2018\u2019\u2032''""`]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'post'
}

function normalizeText(text) {
  return String(text ?? '')
    .replace(/[\u2018\u2019\u2032]/g, "'")
    .replace(/[""]/g, '"')
    .replace(/[""]/g, '"')
}

/** @param {string} title */
function extractQuotedSlotName(title) {
  const text = normalizeText(title)
  const matches = [
    ...text.matchAll(/"([^"]+)"|'([^']+)'|[\u201c]([^\u201d]+)[\u201d]/g),
  ]
  const names = matches.map((m) => (m[1] || m[2] || m[3] || '').trim()).filter(Boolean)
  const skip = new Set(['beat'])
  const good = names.filter((n) => !skip.has(n.toLowerCase()) && n.length > 3)
  if (good.length) return good[good.length - 1]
  return ''
}

/** @param {string} url */
export function slotNameFromUrlPath(url) {
  let seg
  try {
    seg = new URL(url).pathname.split('/').filter(Boolean).pop() || 'post'
  } catch {
    seg = String(url).split('/').filter(Boolean).pop() || 'post'
  }

  const prefixes = [
    'advantage-playing-the-super-powerful-',
    'advantage-playing-another-oldie-',
    'advantage-playing-',
    'how-to-advantage-play-beat-',
    'how-to-advantage-play-',
    'more-treasure-tokens-advantage-playing-',
    'and-another-clone-advantage-play-',
    'the-zombies-are-coming-how-to-advantage-play-',
    'youve-made-it-to-the-top-how-to-advantage-play-',
    'yes-it-still-exists-how-to-beat-',
    'the-best-advantage-play-slot-machine-youve-never-heard-of-',
    'have-some-fun-but-dont-expect-to-make-to-make-a-fortune-on-',
    'looking-for-a-more-advanced-analysis-of-',
    'scarab-clone-alert-',
    'searching-for-treasure-on-',
  ]
  for (const p of prefixes) {
    if (seg.startsWith(p)) {
      seg = seg.slice(p.length)
      break
    }
  }

  seg = seg.replace(/-advantage-play$/i, '')

  const suffixes = [
    '-by-gtech-igt',
    '-by-apex-gaming',
    '-by-colossal-gaming-a-not-so-common-advantage-slot-machine-of-the-past',
    '-advantage-play-slot-machine-or-not',
    '-the-og-of-advantage-play-machines',
    '-a-simple-strategy-to-beat-both-machines',
    '-a-unique-low-volatility-advantage-play-slot-machine',
    '-how-being-a-slot-hustler-might-make-you-instantly-wealthy',
    '-i-know-an-advantage-slot-machine-when-i-see-it',
    '-now-with-giant-bubbles',
    '-looks-familiar-doesnt-it',
  ]

  let changed = true
  while (changed) {
    changed = false
    for (const s of suffixes) {
      if (seg.endsWith(s)) {
        seg = seg.slice(0, -s.length)
        changed = true
        break
      }
    }
  }

  changed = true
  while (changed) {
    changed = false
    for (const p of [
      'aristocrat-gamings-',
      'aristocrats-',
      'igts-',
      'everis-',
      'spielos-',
      'aruzes-',
      'ballys-',
      'spielo-gtechs-',
    ]) {
      if (seg.startsWith(p)) {
        seg = seg.slice(p.length)
        changed = true
        break
      }
    }
  }

  changed = true
  while (changed) {
    changed = false
    for (const s of ['-by-igt', '-by-wms', '-by-aruze', '-by-spielo', '-by-ainsworth', '-by-gimmie-games']) {
      if (seg.endsWith(s)) {
        seg = seg.slice(0, -s.length)
        changed = true
        break
      }
    }
  }

  seg = seg.replace(/^the-/, '')

  return slugify(seg) || 'post'
}

/**
 * @param {string} title
 * @param {string} url
 */
export function slotNameSlug(title, url) {
  void title
  if (/privacy-policy/i.test(url)) return 'privacy-policy'
  if (/dispelling-common-slot-machine-myths/i.test(url)) return 'slot-machine-myths'
  if (/can-you-beat-dragon-link/i.test(url)) return 'dragon-link-family'
  if (/looking-for-a-more-advanced-analysis/i.test(url)) {
    return `${slotNameFromUrlPath(url)}-analysis`
  }
  if (/madonna-mighty-cash/i.test(url)) return 'madonna'

  return slotNameFromUrlPath(url)
}

/** @param {string} url */
export function slotFarmersSlotNameFromUrl(url) {
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean)
    if (parts[0] === 'advantage-play' && parts[1]) return slugify(parts[1])
  } catch {
    /* fall through */
  }
  return 'post'
}

/**
 * @param {string} title
 * @param {string} url
 */
export function slotFarmersSlotNameSlug(title, url) {
  void title
  return slotFarmersSlotNameFromUrl(url)
}

/** Machine Pro lesson URLs: /…/{id}-{slot-slug} */
export function machineProSlotNameFromUrl(url) {
  let seg
  try {
    seg = new URL(url).pathname.split('/').filter(Boolean).pop() || 'post'
  } catch {
    seg = String(url).split('/').filter(Boolean).pop() || 'post'
  }
  return slugify(seg.replace(/^\d+-/, '')) || 'post'
}

/**
 * @param {string} title
 * @param {string} url
 */
export function machineProSlotNameSlug(title, url) {
  void title
  return machineProSlotNameFromUrl(url)
}

/** @param {{ title: string, url: string }[]} rows */
export function allocateMachineProSlugs(rows) {
  /** @type {Map<string, number>} */
  const counts = new Map()
  return rows.map(({ title, url }) => {
    const base = machineProSlotNameSlug(title, url)
    const n = counts.get(base) ?? 0
    counts.set(base, n + 1)
    return n === 0 ? base : `${base}-${n + 1}`
  })
}

/** Resolve duplicate slugs across a batch. @param {{ title: string, url: string }[]} rows */
export function allocateSlotSlugs(rows) {
  /** @type {Map<string, number>} */
  const counts = new Map()
  return rows.map(({ title, url }) => {
    const base = slotNameSlug(title, url)
    const n = counts.get(base) ?? 0
    counts.set(base, n + 1)
    return n === 0 ? base : `${base}-${n + 1}`
  })
}
