/** Matches ChatBubble sent/received message column cap. */
export const CHAT_MESSAGE_COLUMN_WIDTH_CLASS = 'w-[78%] max-w-[78%]'

/** WhatsApp-style media grid floor - same as ChatMediaGrid. */
export const CHAT_MEDIA_TILE_MIN_WIDTH_PX = 160

/** Phone portrait clips before metadata arrives (encode box is 1280×720 max). */
export const CHAT_VIDEO_DEFAULT_ASPECT_RATIO = 9 / 16

/**
 * @param {number | null | undefined} width
 * @param {number | null | undefined} height
 */
export function chatVideoTileAspectRatio(width, height) {
  const w = Number(width)
  const h = Number(height)
  if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) return w / h
  return CHAT_VIDEO_DEFAULT_ASPECT_RATIO
}

/**
 * Inline style for a single chat video tile (prep bubble + delivered bubble).
 *
 * @param {{ width?: number | null, height?: number | null }} [dims]
 */
export function chatVideoTileStyle(dims = {}) {
  return {
    width: '100%',
    minWidth: CHAT_MEDIA_TILE_MIN_WIDTH_PX,
    aspectRatio: chatVideoTileAspectRatio(dims.width, dims.height),
  }
}
