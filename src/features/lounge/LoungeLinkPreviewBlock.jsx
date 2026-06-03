import ChatLinkPreviewCard from '../../components/ChatLinkPreviewCard.jsx'

/**
 * Link preview card under a Lounge caption or comment (iMessage-style).
 *
 * @param {{ preview: object | null, className?: string }} props
 */
export default function LoungeLinkPreviewBlock({ preview, className = '' }) {
  if (!preview?.url) return null
  return (
    <ChatLinkPreviewCard
      preview={preview}
      isMine={false}
      className={`max-w-full ${className}`}
    />
  )
}
