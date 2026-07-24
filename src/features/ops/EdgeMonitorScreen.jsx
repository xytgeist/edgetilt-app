import ScrollLinkedEdgeTitleBarShell from '../../components/ScrollLinkedEdgeTitleBarShell.jsx'
import EdgeMonitorDashboard from './EdgeMonitorDashboard.jsx'

/** In-app admin monitor tab (mobile-first, max-w-2xl shell). */
export default function EdgeMonitorScreen({
  supabaseClient,
  titleBarNavSlot = null,
  onBack,
  onOpenBotPortal,
}) {
  return (
    <ScrollLinkedEdgeTitleBarShell
      titleBarNavSlot={titleBarNavSlot}
      contentClassName="px-3 py-6 pb-[calc(8.5rem+env(safe-area-inset-bottom,0px))]"
    >
      <EdgeMonitorDashboard
        supabaseClient={supabaseClient}
        layout="mobile"
        onBack={onBack}
        onOpenBotPortal={onOpenBotPortal}
      />
    </ScrollLinkedEdgeTitleBarShell>
  )
}
