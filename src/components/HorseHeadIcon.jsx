/**
 * Lucide-style horse head profile (not in lucide-react). Faces right; reads at ~18–22px.
 *
 * @param {{
 *   size?: number | string,
 *   strokeWidth?: number | string,
 *   className?: string,
 *   'aria-hidden'?: boolean | 'true' | 'false',
 * }} props
 */
export default function HorseHeadIcon({
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
      {/* Neck → cheek → jaw */}
      <path d="M6.5 20.5c1.2-1.1 2.3-3.4 2.3-6.2 0-3.2 1.7-5.6 4.4-6.1 1-.2 1.8.3 2.7.3" />
      {/* Ear */}
      <path d="M14.8 8.5 15.6 4.8c.12-.45.7-.5.9-.08l1 2.4" />
      {/* Forehead → muzzle */}
      <path d="M16.5 7.1c1.9.7 3.4 2.3 3.7 4.2.2 1.2-.3 2.3-1.4 2.9" />
      {/* Lower muzzle → throat */}
      <path d="M18.8 14.2c.1.9-.4 1.9-1.3 2.5l-2.4 1.4c-1.4 1.1-3.1 1.8-5 1.9" />
      {/* Eye */}
      <circle cx="15.4" cy="11.2" r="0.85" fill="currentColor" stroke="none" />
    </svg>
  )
}
