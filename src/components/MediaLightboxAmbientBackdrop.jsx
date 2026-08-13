/**
 * Light-mode only (via CSS): scaled + blurred copy of the image fills letterbox
 * areas behind the sharp foreground image - "ambient background" / blur fill.
 * @param {{ src?: string, className?: string, style?: import('react').CSSProperties }} props
 */
export default function MediaLightboxAmbientBackdrop({ src, className = '', style }) {
  if (!src) return null
  return (
    <div
      className={`media-lightbox-ambient-bg pointer-events-none absolute inset-0 z-0 overflow-hidden ${className}`.trim()}
      style={style}
      aria-hidden
    >
      <img src={src} alt="" className="media-lightbox-ambient-bg__img" draggable={false} decoding="async" />
    </div>
  )
}
