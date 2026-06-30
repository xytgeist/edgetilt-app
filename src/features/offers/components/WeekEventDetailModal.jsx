export default function WeekEventDetailModal({
  event,
  offerTypeMeta,
  hasVisibleTime,
  sourceImageUrl,
  onClose,
  onEdit,
  onDuplicate,
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
  const singleDateLabel = startDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="week-detail-heading"
      data-event-detail
      className="fixed inset-0 z-[55] flex items-center justify-center bg-black/85 px-4 py-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        data-event-detail-card
        data-offer-type={e.offer_type || 'other'}
        className={`w-full max-w-lg max-h-[min(85dvh,calc(100dvh-6rem))] overflow-y-auto rounded-3xl border border-zinc-700 p-5 shadow-2xl ${meta.card}`}
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0 pr-2">
            <div id="week-detail-heading" className="text-white font-bold text-lg leading-snug">
              {timeLabel ? timeLabel : isMultiDay ? dateRangeLabel : singleDateLabel}
            </div>
            {timeLabel && (
              <div className="text-zinc-400 text-sm mt-0.5">
                {isMultiDay ? dateRangeLabel : singleDateLabel}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-zinc-400 hover:text-zinc-200 touch-manipulation shrink-0 text-base leading-none mt-0.5"
          >
            ✕
          </button>
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${meta.dot}`} />
            <span
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${meta.chip}`}
            >
              {meta.label}
            </span>
          </div>
          <div className="mt-1 text-[1.375rem] font-semibold leading-snug text-zinc-100">{e.title}</div>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
            <span className="font-bold text-zinc-100">{e.casino_name || '-'}</span>
            {e.value_amount !== null && (
              <span className="font-semibold tabular-nums text-emerald-400">
                {e.value_amount !== null ? `$${Number(e.value_amount).toFixed(0)}` : ''}
              </span>
            )}
          </div>
          {e.notes && <div className="mt-3 max-h-32 overflow-y-auto whitespace-pre-wrap break-words text-sm leading-relaxed text-zinc-400">{e.notes}</div>}

          {sourceImageUrl && (
            <a href={sourceImageUrl} target="_blank" rel="noreferrer" className="mt-4 inline-block overflow-hidden rounded-2xl border border-zinc-700/50" title="Open full mailer image">
              <img src={sourceImageUrl} alt="Source mailer" className="block max-h-48 max-w-full" />
            </a>
          )}
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-zinc-700/80 pt-4">
          <button type="button" onClick={() => onDelete(e.id)} className="text-red-400 hover:text-red-300 text-sm font-medium touch-manipulation mr-auto">
            Delete
          </button>
          <button type="button" onClick={() => onEdit(e)} className="text-cyan-300 hover:text-cyan-200 text-sm font-semibold touch-manipulation">
            Edit
          </button>
          <button type="button" onClick={() => onDuplicate(e)} style={{ color: '#97b4db' }} className="text-sm font-semibold touch-manipulation opacity-90 hover:opacity-100">
            Duplicate
          </button>
        </div>
      </div>
    </div>
  )
}
