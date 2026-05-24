export function slugify(raw) {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
}

export function diagramFilename(name, slug) {
  const base = slugify(name.replace(/\.[^.]+$/, '')) || `${slug}-diagram`
  return base.endsWith('.webp') ? base : `${base}.webp`
}
