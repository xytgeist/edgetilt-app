function Bar({ className }) {
  return <span className={`edge-skel block rounded-md ${className}`} aria-hidden="true" />
}

function SkeletonSide({ align }) {
  const end = align === 'right'
  return (
    <div className={`min-w-0 px-3 py-3 ${end ? 'flex flex-col items-end' : ''}`}>
      <div className={`flex items-center gap-2 ${end ? 'flex-row-reverse' : ''}`}>
        <span className="edge-skel block h-9 w-9 shrink-0 rounded-full" aria-hidden="true" />
        <div className={`flex min-w-0 flex-col gap-1.5 ${end ? 'items-end' : ''}`}>
          <Bar className="h-3.5 w-24" />
          <Bar className="h-2.5 w-14" />
        </div>
      </div>
      <Bar className="mt-3 h-6 w-16" />
      <Bar className="mt-1.5 h-2 w-8" />
    </div>
  )
}

function SkeletonCard() {
  return (
    <div className="fantasy-card-lift overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900">
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        <SkeletonSide align="left" />
        <div className="flex flex-col items-center justify-center gap-1.5 px-1 py-3">
          <Bar className="h-5 w-14" />
          <Bar className="h-2.5 w-11" />
        </div>
        <SkeletonSide align="right" />
      </div>
      <div className="px-3 pb-2.5">
        <div className="mb-1.5 flex justify-between">
          <Bar className="h-2.5 w-7" />
          <Bar className="h-2.5 w-7" />
        </div>
        <Bar className="h-1.5 w-full rounded-full" />
      </div>
    </div>
  )
}

/** First-load placeholder shaped like the fantasy home matchup cards. */
export default function FantasyHomeSkeleton({ cards = 2 }) {
  const count = Math.min(4, Math.max(1, Number(cards) || 2))
  return (
    <div data-fantasy-skeleton className="space-y-3" role="status" aria-label="Loading fantasy">
      {/* Same inset as the home carousel cards so nothing shifts when they paint. */}
      {Array.from({ length: count }, (_, i) => (
        <section key={i} className="-mx-4 px-7">
          <SkeletonCard />
        </section>
      ))}
    </div>
  )
}
