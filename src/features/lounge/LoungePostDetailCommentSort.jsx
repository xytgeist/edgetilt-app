import {
  LOUNGE_DETAIL_COMMENT_SORT,
  writeLoungeDetailCommentSort,
} from '../../utils/loungeFeedCommentSort.js'

const OPTIONS = [
  { value: LOUNGE_DETAIL_COMMENT_SORT.RANKED, label: 'Recommended' },
  { value: LOUNGE_DETAIL_COMMENT_SORT.POPULAR, label: 'Popular' },
  { value: LOUNGE_DETAIL_COMMENT_SORT.CHRONOLOGICAL, label: 'Oldest first' },
  { value: LOUNGE_DETAIL_COMMENT_SORT.LIKES, label: 'Most liked' },
]

/**
 * Post detail: sort first-level comments only (replies use thread drill-down order).
 */
export default function LoungePostDetailCommentSort({ value, onChange, disabled = false }) {
  return (
    <div className="mb-2 flex items-center justify-end gap-2">
      <label htmlFor="lounge-detail-comment-sort" className="text-[13px] font-medium text-zinc-500">
        Sort
      </label>
      <select
        id="lounge-detail-comment-sort"
        value={value}
        disabled={disabled}
        onChange={(e) => {
          const next = e.target.value
          writeLoungeDetailCommentSort(next)
          onChange?.(next)
        }}
        className="max-w-[11rem] rounded-lg border border-zinc-700/80 bg-zinc-900/90 px-2.5 py-1.5 text-[13px] font-medium text-zinc-100 outline-none focus-visible:border-cyan-600/70 focus-visible:ring-1 focus-visible:ring-cyan-600/40 disabled:opacity-50"
      >
        {OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  )
}
