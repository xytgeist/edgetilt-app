/**
 * Locked creator fan-only post: subscribe card (feed + profile rows).
 *
 * @param {{
 *   creatorHandle?: string | null,
 *   onSubscribe: () => void,
 *   busy?: boolean,
 * }} props
 */
export default function LoungeFanOnlySubscribeCta({ creatorHandle, onSubscribe, busy = false }) {
  const raw = creatorHandle ? String(creatorHandle).replace(/^@/, '').trim() : ''
  const handleLabel = raw ? `@${raw}` : 'this creator'

  return (
    <div
      className="mt-2 rounded-2xl border border-cyan-500/30 bg-cyan-950/40 px-3 py-3"
      data-lounge-fan-only-cta
    >
      <button
        type="button"
        disabled={busy}
        onClick={(e) => {
          e.stopPropagation()
          onSubscribe()
        }}
        className="flex w-full min-h-11 items-center justify-center rounded-xl bg-cyan-400 px-4 text-[15px] font-semibold text-zinc-950 touch-manipulation hover:bg-cyan-300 active:bg-cyan-500 disabled:opacity-50 [-webkit-tap-highlight-color:transparent]"
      >
        {busy ? (
          'Loading…'
        ) : (
          <span className="inline-flex max-w-full min-w-0 items-center justify-center">
            <span className="shrink-0">Subscribe to&nbsp;</span>
            <span className="truncate">{handleLabel}</span>
          </span>
        )}
      </button>
    </div>
  )
}
