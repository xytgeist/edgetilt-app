import { loungePostDraftPreviewText, formatLoungePostDraftWhen } from '../../utils/loungePostDraftApi.js'

/**
 * Full-screen sheet listing saved Lounge post drafts.
 *
 * @param {{
 *   open: boolean,
 *   onClose: () => void,
 *   drafts: import('../../utils/loungePostDraftApi.js').LoungePostDraftRow[],
 *   loading?: boolean,
 *   busyId?: string | null,
 *   onOpenDraft: (draft: object) => void,
 *   onDeleteDraft: (draftId: string) => void,
 *   onRefresh?: () => void,
 * }} props
 */
export default function LoungePostDraftsSheet({
  open,
  onClose,
  drafts = [],
  loading = false,
  busyId = null,
  onOpenDraft,
  onDeleteDraft,
  onRefresh,
}) {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[96] flex flex-col bg-zinc-950/98 pt-[max(0px,max(env(safe-area-inset-top, 0px), var(--edge-sat, 0px)))] pb-[max(0px,max(env(safe-area-inset-bottom, 0px), var(--edge-sab, 0px)))]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="lounge-drafts-sheet-title"
    >
      <header className="flex shrink-0 items-center gap-3 border-b border-zinc-800/90 px-4 py-3">
        <button
          type="button"
          onClick={onClose}
          className="flex h-10 w-10 shrink-0 touch-manipulation items-center justify-center rounded-full text-zinc-300 hover:bg-zinc-800 hover:text-white [-webkit-tap-highlight-color:transparent]"
          aria-label="Close drafts"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h2 id="lounge-drafts-sheet-title" className="min-w-0 flex-1 text-[18px] font-bold text-white">
          Drafts
        </h2>
        {typeof onRefresh === 'function' ? (
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="shrink-0 rounded-lg px-3 py-1.5 text-[14px] font-semibold text-cyan-400 hover:bg-zinc-800 disabled:opacity-50 touch-manipulation"
          >
            Refresh
          </button>
        ) : null}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">
        {loading && drafts.length === 0 ? (
          <p className="py-8 text-center text-[15px] text-zinc-500">Loading drafts…</p>
        ) : drafts.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-[16px] font-medium text-zinc-300">No saved drafts</p>
            <p className="mt-2 text-[14px] leading-snug text-zinc-500">
              Use <span className="text-zinc-400">Save draft</span> in the composer to keep a post for later.
              Video must be re-added after restore.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {drafts.map((draft) => {
              const preview = loungePostDraftPreviewText(draft)
              const when = formatLoungePostDraftWhen(draft.updated_at || draft.created_at)
              const hasMedia =
                (Array.isArray(draft.image_urls) && draft.image_urls.length > 0) ||
                String(draft.gif_url || '').trim().length > 0
              const isBusy = busyId === draft.id
              return (
                <li key={draft.id}>
                  <div className="flex items-stretch gap-2 rounded-2xl border border-zinc-800/90 bg-zinc-900/60 overflow-hidden">
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => onOpenDraft(draft)}
                      className="min-w-0 flex-1 px-4 py-3 text-left touch-manipulation hover:bg-zinc-800/50 disabled:opacity-60"
                    >
                      <div className="line-clamp-2 text-[15px] font-medium leading-snug text-zinc-100">{preview}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-zinc-500">
                        {when ? <span>{when}</span> : null}
                        {hasMedia ? (
                          <span>
                            {draft.image_urls?.length
                              ? `${draft.image_urls.length} photo${draft.image_urls.length === 1 ? '' : 's'}`
                              : 'GIF'}
                          </span>
                        ) : null}
                        {Array.isArray(draft.category_pills) && draft.category_pills.length > 0 ? (
                          <span>
                            {draft.category_pills.length} tribe{draft.category_pills.length === 1 ? '' : 's'}
                          </span>
                        ) : null}
                      </div>
                    </button>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => onDeleteDraft(draft.id)}
                      className="shrink-0 border-l border-zinc-800/90 px-4 text-[13px] font-semibold text-rose-400 hover:bg-rose-950/30 disabled:opacity-60 touch-manipulation"
                      aria-label={`Delete draft: ${preview}`}
                    >
                      {isBusy ? '…' : 'Delete'}
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
