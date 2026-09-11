import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { APP_MODAL_OVERLAY_CLASS, APP_MODAL_SHEET_PANEL_CLASS } from '../../constants/appZIndex.js'
import { LOUNGE_REPORT_REASONS } from './loungeReportReasons.js'

/**
 * Member report sheet for a Lounge post, comment, or profile.
 */
export default function LoungeReportSheet({
  open,
  targetLabel = 'this',
  busy = false,
  error = '',
  onClose,
  onSubmit,
  onOpenGuidelines,
}) {
  const [reason, setReason] = useState('')
  const [details, setDetails] = useState('')
  const [alsoBlock, setAlsoBlock] = useState(true)

  useEffect(() => {
    if (!open) return undefined
    setReason('')
    setDetails('')
    setAlsoBlock(true)
    const onKey = (event) => {
      if (event.key === 'Escape' && !busy) onClose?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose, open])

  if (!open || typeof document === 'undefined') return null

  const submit = (event) => {
    event.preventDefault()
    if (!reason || busy) return
    void onSubmit?.({ reason, details: details.trim(), alsoBlock })
  }

  return createPortal(
    <div
      data-lounge-report-sheet=""
      className={APP_MODAL_OVERLAY_CLASS}
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onClose?.()
      }}
    >
      <form className={APP_MODAL_SHEET_PANEL_CLASS} onSubmit={submit}>
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-zinc-700" aria-hidden />
        <h2 className="text-lg font-semibold text-white">Report {targetLabel}</h2>
        <p className="mt-1 text-sm text-zinc-400">
          We review every report. Fake or retaliatory reports can get your account restricted.
        </p>
        <fieldset className="mt-4 space-y-2" disabled={busy}>
          <legend className="sr-only">Reason</legend>
          {LOUNGE_REPORT_REASONS.map((row) => (
            <label
              key={row.id}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 ${
                reason === row.id
                  ? 'border-cyan-500/60 bg-cyan-950/40'
                  : 'border-zinc-800 bg-zinc-950/60'
              }`}
            >
              <input
                type="radio"
                name="lounge-report-reason"
                value={row.id}
                checked={reason === row.id}
                onChange={() => setReason(row.id)}
                className="mt-1"
              />
              <span>
                <span className="block text-sm font-medium text-zinc-100">{row.label}</span>
                <span className="block text-xs text-zinc-500">{row.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <label className="mt-4 block text-sm text-zinc-300">
          More detail {reason === 'other' ? '(required)' : '(optional)'}
          <textarea
            value={details}
            onChange={(event) => setDetails(event.target.value)}
            maxLength={1000}
            rows={3}
            disabled={busy}
            className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500/60"
            placeholder="What happened?"
          />
        </label>
        <label className="mt-3 flex items-center gap-2 text-sm text-zinc-200">
          <input
            type="checkbox"
            checked={alsoBlock}
            onChange={(event) => setAlsoBlock(event.target.checked)}
            disabled={busy}
          />
          Also block this member
        </label>
        {typeof onOpenGuidelines === 'function' ? (
          <button
            type="button"
            className="mt-3 text-sm font-medium text-cyan-300"
            onClick={onOpenGuidelines}
          >
            Community Guidelines
          </button>
        ) : null}
        {error ? <p className="mt-3 text-sm text-rose-300">{error}</p> : null}
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            className="min-h-11 flex-1 rounded-xl bg-zinc-800 text-sm font-semibold text-zinc-100 disabled:opacity-50"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="min-h-11 flex-1 rounded-xl bg-cyan-500 text-sm font-semibold text-zinc-950 disabled:opacity-50"
            disabled={busy || !reason || (reason === 'other' && !details.trim())}
          >
            {busy ? 'Sending…' : 'Submit report'}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  )
}
