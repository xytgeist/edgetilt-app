/**
 * Full-screen dark backdrop matching LoungeAppSplash - shown during auth bootstrap
 * so "Loading…" never flashes before the Lottie splash on cold boot.
 */
export default function LoungeColdBootBootstrapBackdrop() {
  return (
    <div
      className="fixed inset-0 z-[120] bg-zinc-950"
      style={{
        paddingTop: 'max(env(safe-area-inset-top,0px),var(--edge-sat,0px))',
        paddingBottom: 'max(env(safe-area-inset-bottom,0px),var(--edge-sab,0px))',
      }}
      aria-hidden
    />
  )
}
