/**
 * Light-mode only (via CSS): scaled + blurred copy of the image fills letterbox
 * areas behind the sharp foreground image - "ambient background" / blur fill.
 */
export default function MediaLightboxAmbientBackdrop({ src }) {
  if (!src) return null
  return (
    <div className="media-lightbox-ambient-bg pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <img src={src} alt="" className="media-lightbox-ambient-bg__img" draggable={false} decoding="async" />
    </div>
  )
}
