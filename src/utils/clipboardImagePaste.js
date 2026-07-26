/**
 * Clipboard helpers for attaching pasted images (screenshots, copied web images, etc.).
 */

/**
 * @param {ClipboardEvent} e
 * @returns {File[]}
 */
export function imageFilesFromClipboardEvent(e) {
  const items = Array.from(e.clipboardData?.items || [])
  return items
    .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
    .map((item) => item.getAsFile())
    .filter(Boolean)
}

/**
 * @param {ClipboardEvent} e
 * @returns {boolean}
 */
export function clipboardEventHasHtml(e) {
  const items = Array.from(e.clipboardData?.items || [])
  return items.some((i) => i.kind === 'string' && i.type === 'text/html')
}

/**
 * Async fallback when sync clipboard items omit images (permissions / browser quirks).
 * @returns {Promise<File[]>}
 */
export async function imageFilesFromNavigatorClipboardRead() {
  if (!navigator.clipboard?.read) return []
  try {
    const clipItems = await navigator.clipboard.read()
    const files = []
    for (const item of clipItems) {
      for (const type of item.types) {
        if (type.startsWith('image/')) {
          const blob = await item.getType(type)
          const ext = type.split('/')[1]?.replace('jpeg', 'jpg') || 'png'
          files.push(new File([blob], `paste.${ext}`, { type }))
        }
      }
    }
    return files
  } catch {
    return []
  }
}
