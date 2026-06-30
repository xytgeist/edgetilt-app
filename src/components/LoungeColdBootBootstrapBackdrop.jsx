/**
 * Full-screen dark backdrop matching LoungeAppSplash - shown during auth bootstrap
 * so "Loading…" never flashes before the Lottie splash on cold boot.
 */
export default function LoungeColdBootBootstrapBackdrop() {
  return (
    <div
      className="fixed inset-0 z-[120] bg-zinc-950"
      style={{
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
      aria-hidden
    />
  )
}
