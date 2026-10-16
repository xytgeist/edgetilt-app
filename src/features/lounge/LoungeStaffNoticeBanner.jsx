import { useEffect, useState } from 'react'
import { fetchUnreadLoungeStaffNotices, markLoungeStaffNoticeRead } from './loungeReportsApi.js'

export default function LoungeStaffNoticeBanner({ supabaseClient, enabled }) {
  const [notices, setNotices] = useState([])

  useEffect(() => {
    if (!enabled || !supabaseClient) return undefined
    let cancelled = false
    void fetchUnreadLoungeStaffNotices(supabaseClient).then((rows) => {
      if (!cancelled) setNotices(rows)
    })
    return () => {
      cancelled = true
    }
  }, [enabled, supabaseClient])

  if (!enabled || !notices.length) return null
  const notice = notices[0]

  return (
    <div
      role="status"
      data-lounge-staff-notice=""
      className="border-b border-amber-900/50 bg-amber-950/80 px-3 py-2 text-sm text-amber-100"
    >
      <div className="mx-auto flex max-w-3xl items-start justify-between gap-3">
        <p className="min-w-0">{notice.body}</p>
        <button
          type="button"
          className="shrink-0 text-xs font-semibold text-amber-200 underline"
          onClick={() => {
            void markLoungeStaffNoticeRead(supabaseClient, notice.id)
            setNotices((cur) => cur.filter((row) => row.id !== notice.id))
          }}
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}
