import { Icon } from 'lucide-react'

/**
 * Render a Lucide Lab iconNode with the same prop surface as lucide-react icons.
 *
 * @param {{
 *   iconNode: import('lucide-react').IconNode,
 *   size?: number | string,
 *   strokeWidth?: number | string,
 *   className?: string,
 *   'aria-hidden'?: boolean | 'true' | 'false',
 * }} props
 */
export default function LucideLabIcon({
  iconNode,
  size = 24,
  strokeWidth = 2,
  className = '',
  'aria-hidden': ariaHidden = true,
}) {
  return (
    <Icon
      iconNode={iconNode}
      size={size}
      strokeWidth={strokeWidth}
      className={className}
      aria-hidden={ariaHidden}
    />
  )
}
