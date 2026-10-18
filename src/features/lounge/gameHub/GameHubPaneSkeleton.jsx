function Bar({ className }) {
  return <span className={`edge-skel block rounded-md ${className}`} aria-hidden="true" />
}

function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <span className="edge-skel block h-9 w-9 shrink-0 rounded-full" aria-hidden="true" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <Bar className="h-3.5 w-32" />
        <Bar className="h-2.5 w-20" />
      </div>
      <div className="flex flex-col items-end gap-1.5">
        <Bar className="h-3.5 w-9" />
        <Bar className="h-2 w-6" />
      </div>
    </div>
  )
}

/** Game hub tab body while the first detail / roster load is still in flight. */
export default function GameHubPaneSkeleton({ rows = 6 }) {
  return (
    <div data-edge-skeleton className="space-y-3 py-3" role="status" aria-label="Loading game">
      <div className="flex items-center justify-between px-1">
        <Bar className="h-2.5 w-24" />
        <Bar className="h-2.5 w-14" />
      </div>
      <div className="divide-y divide-zinc-800 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
        {Array.from({ length: rows }, (_, i) => (
          <SkeletonRow key={i} />
        ))}
      </div>
    </div>
  )
}
