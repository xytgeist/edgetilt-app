/**
 * Full-screen Edge logo splash (CSS animation). Shown during Lounge cold boot / long resume.
 * @param {{ dismissing?: boolean }} props
 */
export default function LoungeAppSplash({ dismissing = false }) {
  return (
    <div
      className={`lounge-cold-boot-splash fixed inset-0 z-[120] flex flex-col items-center justify-center bg-zinc-950 ${
        dismissing ? 'lounge-cold-boot-splash--out' : ''
      }`}
      role="status"
      aria-live="polite"
      aria-label="Loading Lounge"
    >
      <div className="lounge-cold-boot-splash__glow pointer-events-none absolute inset-0" aria-hidden />
      <div className="lounge-cold-boot-splash__logo-wrap relative flex items-center justify-center">
        <img
          src="/edge-lounge-logo-transparent.png"
          alt=""
          className="lounge-cold-boot-splash__logo h-[4.5rem] w-auto max-w-[min(72vw,16rem)] sm:h-[5.25rem]"
          draggable={false}
          decoding="async"
        />
      </div>
    </div>
  )
}
