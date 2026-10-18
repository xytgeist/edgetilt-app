function Bar({ className }) {
  return <span className={`edge-skel block rounded-md ${className}`} aria-hidden="true" />
}

function SkeletonSide({ align }) {
  const end = align === 'right'
  return (
    <div className={`flex min-w-0 flex-1 items-center gap-2.5 ${end ? 'flex-row-reverse' : ''}`}>
      <span className="edge-skel block h-10 w-10 shrink-0 rounded-full" aria-hidden="true" />
      <div className={`flex min-w-0 flex-col gap-1.5 ${end ? 'items-end' : ''}`}>
        <Bar className="h-3.5 w-10" />
        <Bar className="h-2.5 w-7" />
      </div>
      <Bar className={`h-6 w-7 ${end ? 'mr-auto' : 'ml-auto'}`} />
    </div>
  )
}

function SkeletonGame() {
  return (
    <div className="flex min-h-[5.625rem] items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-900 px-3">
      <SkeletonSide align="left" />
      <div className="flex shrink-0 flex-col items-center gap-1.5">
        <Bar className="h-2.5 w-12" />
        <Bar className="h-2 w-8" />
      </div>
      <SkeletonSide align="right" />
    </div>
  )
}

/** Sports Hub slate placeholder while league pills and logos preload. */
export default function LoungeSportsHubSlateSkeleton({ rows = 6, grid = false }) {
  return (
    <div data-edge-skeleton className="py-2" role="status" aria-label="Loading slate">
      <ul className={grid ? 'grid grid-cols-2 gap-2' : 'space-y-2'}>
        {Array.from({ length: rows }, (_, i) => (
          <li key={i}>
            <SkeletonGame />
          </li>
        ))}
      </ul>
    </div>
  )
}
