/** Stable two-letter fallback while `profiles` row is still loading (avoids me→uuid tone/letter flicker on HMR). */
export function composerStableInitialsFromUid(uid) {
  const h = String(uid || '')
    .replace(/-/g, '')
    .replace(/[^a-f0-9]/gi, '')
  if (h.length >= 2) return h.slice(0, 2).toUpperCase()
  return '··'
}

/** Lounge post detail: `9:46 AM · 5/9/26` (local time + short date). */
export function formatLoungePostDetailWhen(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const t = d.getTime()
  if (!Number.isFinite(t)) return ''
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  const dateShort = `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(-2)}`
  return `${time} · ${dateShort}`
}
