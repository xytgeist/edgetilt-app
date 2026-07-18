import { isProbablyImageFile, prepareLoungeFeedImageForUpload } from '../../utils/compressImageForUpload'
import { uploadLoungeFeedPostImage } from '../../utils/communityFeedPost'

export const BOT_COMPOSE_MAX_IMAGES = 6

export function newBotComposeImageId() {
  return `bci-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

/** @param {Array<{ id: string, file: File, preview: string }>} prevItems */
export function mergeBotComposeImageItems(prevItems, fileList) {
  const next = [...prevItems]
  const cap = BOT_COMPOSE_MAX_IMAGES
  let room = Math.max(0, cap - next.length)
  let limitDialog = ''
  if (room === 0) {
    limitDialog = `You can attach up to ${cap} images.`
    return { next, limitDialog }
  }
  let skipped = 0
  for (const file of fileList) {
    if (!isProbablyImageFile(file)) continue
    if (room <= 0) {
      skipped += 1
      continue
    }
    next.push({ id: newBotComposeImageId(), file, preview: URL.createObjectURL(file) })
    room -= 1
  }
  if (skipped > 0) {
    limitDialog = `You can attach up to ${cap} images. Extra files were not added.`
  }
  return { next, limitDialog }
}

/** @param {Array<{ preview?: string }>} items */
export function revokeBotComposeImagePreviews(items) {
  for (const item of items || []) {
    if (item?.preview?.startsWith?.('blob:')) {
      try {
        URL.revokeObjectURL(item.preview)
      } catch {
        // ignore
      }
    }
  }
}

/** @param {string[]} urls */
export function botComposeItemsFromUrls(urls) {
  return (Array.isArray(urls) ? urls : [])
    .map((url) => String(url || '').trim())
    .filter(Boolean)
    .slice(0, BOT_COMPOSE_MAX_IMAGES)
    .map((url, index) => ({
      id: `url-${index}-${url.slice(-24)}`,
      url,
      preview: url,
    }))
}

/**
 * Upload new files; keep already-hosted URLs from saved draft items.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {string} botUserId
 * @param {Array<{ id: string, file?: File, url?: string, preview?: string }>} items
 */
export async function uploadBotComposeImageItems(supabaseClient, botUserId, items) {
  const urls = []
  for (const item of items || []) {
    if (item?.file) {
      const { file: prepared, error: prepErr } = await prepareLoungeFeedImageForUpload(item.file)
      if (prepErr || !prepared) {
        return { urls: [], error: prepErr || new Error('Could not prepare image.') }
      }
      const { data: upUrl, error: upErr } = await uploadLoungeFeedPostImage({
        supabaseClient,
        user: { id: botUserId },
        file: prepared,
      })
      if (upErr || !upUrl) {
        return { urls: [], error: upErr || new Error('Could not upload image.') }
      }
      urls.push(upUrl)
      continue
    }
    const saved = String(item?.url || item?.preview || '').trim()
    if (saved && !saved.startsWith('blob:')) urls.push(saved)
  }
  return { urls: urls.slice(0, BOT_COMPOSE_MAX_IMAGES), error: null }
}

export function normalizeDraftImageUrls(raw) {
  if (Array.isArray(raw)) {
    return raw.map((url) => String(url || '').trim()).filter(Boolean).slice(0, BOT_COMPOSE_MAX_IMAGES)
  }
  return []
}
