/**
 * Lucide-style horseshoe (not in lucide-react). Open end at bottom, nail ticks on the curve.
 *
 * @param {{
 *   size?: number | string,
 *   strokeWidth?: number | string,
 *   className?: string,
 *   'aria-hidden'?: boolean | 'true' | 'false',
 * }} props
 */
export default function HorseshoeIcon({
  size = 24,
  strokeWidth = 2,
  className = '',
  'aria-hidden': ariaHidden = true,
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden={ariaHidden}
    >
      <path d="M7 21V11a5 5 0 0 1 10 0v10" />
      <path d="M7 21h2.75M14.25 21H17" />
      <path d="M8.2 13.2v1.1M12 10.6v1.1M15.8 13.2v1.1" />
    </svg>
  )
}
