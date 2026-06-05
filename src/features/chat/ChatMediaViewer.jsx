import ChatImageMediaViewer from './ChatImageMediaViewer.jsx'
import ChatVideoLightbox from './ChatVideoLightbox.jsx'

/**
 * Full-screen media viewer for chat messages.
 * Images: vertical scroll-snap viewer. Videos: lounge-style lightbox.
 *
 * @param {{
 *   items: Array<{ type: 'image' | 'video', url?: string, videoUid?: string | null, videoUrl?: string | null, posterUrl?: string }>,
 *   initialIndex?: number,
 *   onClose: () => void,
 * }} props
 */
export default function ChatMediaViewer({ items, initialIndex = 0, onClose }) {
  if (!items?.length) return null

  const idx = Math.max(0, Math.min(initialIndex, items.length - 1))
  const item = items[idx]
  if (!item) return null

  if (item.type === 'video') {
    return (
      <ChatVideoLightbox
        videoUid={item.videoUid}
        videoUrl={item.videoUrl}
        posterUrl={item.posterUrl || item.url || null}
        onClose={onClose}
      />
    )
  }

  const imageUrls = items.filter((i) => i.type === 'image').map((i) => i.url).filter(Boolean)
  if (!imageUrls.length) return null

  let imageInitialIndex = 0
  for (let i = 0; i < idx; i++) {
    if (items[i]?.type === 'image') imageInitialIndex++
  }

  return (
    <ChatImageMediaViewer
      urls={imageUrls}
      initialIndex={imageInitialIndex}
      onClose={onClose}
    />
  )
}
