import BackToSlotsHubButton from './BackToSlotsHubButton.jsx'
import QuickLinkPageToggle from './QuickLinkPageToggle.jsx'

/**
 * Top row for slot tool screens: back to Slots hub + optional quick-link toggle + optional trailing actions.
 *
 * @param {{
 *   onBackToSlotsHub?: (() => void) | null,
 *   quickLinkDestinationId?: import('../features/shell/quickLinkDestinations.js').QuickLinkId | null,
 *   center?: React.ReactNode,
 *   trailing?: React.ReactNode,
 *   className?: string,
 * }} props
 */
export default function SlotsToolPageHeader({
  onBackToSlotsHub = null,
  quickLinkDestinationId = null,
  center = null,
  trailing = null,
  className = '',
}) {
  if (!onBackToSlotsHub && !quickLinkDestinationId && !trailing && !center) return null

  const quickLinkOnRight = Boolean((trailing || center) && quickLinkDestinationId)

  if (center) {
    return (
      <div
        className={`relative mb-3 flex min-h-10 w-full items-center ${className}`}
        data-slots-tool-top-bar
      >
        <div className="relative z-10 flex shrink-0 items-center">
          <BackToSlotsHubButton onClick={onBackToSlotsHub} className="mb-0 shrink-0" />
        </div>
        <div className="pointer-events-none absolute inset-x-0 flex justify-center px-1">
          <div className="pointer-events-auto min-w-0 max-w-[min(20rem,calc(100%-8.5rem))]">
            {center}
          </div>
        </div>
        {quickLinkOnRight || trailing ? (
          <div className="relative z-10 ml-auto flex shrink-0 items-center gap-2">
            {quickLinkOnRight ? (
              <QuickLinkPageToggle destinationId={quickLinkDestinationId} className="mb-0 shrink-0" />
            ) : null}
            {trailing}
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div
      className={`mb-3 flex w-full items-center gap-2 ${className}`}
      data-slots-tool-top-bar
    >
      <BackToSlotsHubButton onClick={onBackToSlotsHub} className="mb-0 shrink-0" />
      {quickLinkDestinationId && !quickLinkOnRight ? (
        <QuickLinkPageToggle destinationId={quickLinkDestinationId} className="mb-0 shrink-0" />
      ) : null}
      {quickLinkOnRight || trailing ? (
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {quickLinkOnRight ? (
            <QuickLinkPageToggle destinationId={quickLinkDestinationId} className="mb-0 shrink-0" />
          ) : null}
          {trailing}
        </div>
      ) : null}
    </div>
  )
}
