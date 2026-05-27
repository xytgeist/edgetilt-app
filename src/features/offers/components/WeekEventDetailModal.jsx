export default function WeekEventDetailModal({
  event,
  offerTypeMeta,
  hasVisibleTime,
  onClose,
  onEdit,
  onDelete
}) {
  if (!event) return null

  const e = event
  const meta = offerTypeMeta[e.offer_type] || offerTypeMeta.other
  const startDate = new Date(e.start_at)
  const endDate = e.end_at ? new Date(e.end_at) : null
  const showTime = hasVisibleTime(e.start_at) || (e.end_at ? hasVisibleTime(e.end_at) : false)
  const isMultiDay =
    !!endDate &&
    new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate()).getTime() !==
      new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate()).getTime()
  const dateRangeLabel = isMultiDay
    ? `${startDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} - ${endDate.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric'
      })}`
    : ''
  const timeLabel = showTime ? new Date(e.start_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''
  const dayLabel = startDate.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase()
  const dayNum = startDate.getDate()
  const monthLabel = startDate.toLocaleDateString(undefined, { month: 'short' }).toUpperCase()

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="week-detail-heading"
      data-event-detail
      className="fixed inset-0 z-[55] flex items-center justify-center bg-black/75 px-4 py-6 backdrop-blur-[1px]"
      onClick={onClose}
    >
      <div
        data-event-detail-card
        data-offer-type={e.offer_type || 'other'}
        className={`w-full max-w-lg max-h-[min(85dvh,calc(100dvh-6rem))] overflow-y-auto rounded-3xl border border-zinc-700 p-5 shadow-2xl ${meta.card}`}
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <div id="week-detail-heading" className="text-white font-bold text-lg">
            Event details
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-200 text-sm font-semibold touch-manipulation"
          >
            Close
          </button>
        </div>
        <div className="flex items-start gap-3">
          <div className="w-12 shrink-0 text-center">
            <div className="text-zinc-500 text-[10px] font-semibold tracking-wide">{dayLabel}</div>
            <div className="text-zinc-100 text-2xl font-black leading-tight">{dayNum}</div>
            <div className="text-[10px] font-bold tracking-wider" style={{ color: 'var(--ot-color)' }}>{monthLabel}</div>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${meta.dot}`} />
              <span
                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${meta.chip}`}
              >
                {meta.label}
              </span>
            </div>
            <div className="mt-1 text-lg font-semibold leading-snug text-zinc-100">
              {timeLabel ? `${timeLabel} ` : ''}
              {e.title}
            </div>
            {dateRangeLabel && <div className="mt-1 text-sm text-zinc-300">{dateRangeLabel}</div>}
            <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
              <span className="font-bold text-zinc-100">{e.casino_name || '—'}</span>
              {e.value_amount !== null && (
                <span className="font-semibold tabular-nums text-emerald-400">
                  {e.value_amount !== null ? `$${Number(e.value_amount).toFixed(0)}` : ''}
                </span>
              )}
            </div>
            {e.notes && <div className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-zinc-400">{e.notes}</div>}
          </div>
        </div>
        <div className="mt-5 flex flex-wrap justify-end gap-3 border-t border-zinc-700/80 pt-4">
          <button type="button" onClick={() => onEdit(e)} className="text-cyan-300 hover:text-cyan-200 text-sm font-semibold touch-manipulation">
            Edit
          </button>
          <button type="button" onClick={() => onDelete(e.id)} className="text-red-300 hover:text-red-200 text-sm font-semibold touch-manipulation">
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}
