import LoungeModQueuePanel from './LoungeModQueuePanel.jsx'

export default function EdgeMonitorLoungeReportsPanel({ supabaseClient }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <p className="text-xs text-zinc-500">Full staff inbox is also at Mod in the hamburger, or /?tab=mod.</p>
        <a
          href="/?tab=mod"
          className="text-xs font-semibold text-cyan-300 underline"
        >
          Open Mod hub
        </a>
      </div>
      <LoungeModQueuePanel supabaseClient={supabaseClient} compact />
    </div>
  )
}
