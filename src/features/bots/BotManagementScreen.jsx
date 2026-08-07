import BotManagementPortal from './BotManagementPortal.jsx'
import { useBotPortal } from './useBotPortal.js'
import ScrollLinkedEdgeTitleBarShell from '../../components/ScrollLinkedEdgeTitleBarShell.jsx'

export default function BotManagementScreen({ supabaseClient, titleBarNavSlot, onBack }) {
  const { snapshot, loading, error, reload } = useBotPortal(supabaseClient)

  return (
    <ScrollLinkedEdgeTitleBarShell
      titleBarNavSlot={titleBarNavSlot}
      fullWidth
      contentClassName="px-3 py-4 pb-[calc(6rem+env(safe-area-inset-bottom,0px))] max-w-6xl mx-auto"
    >
      <BotManagementPortal
        supabaseClient={supabaseClient}
        snapshot={snapshot}
        loading={loading}
        error={error}
        onReload={reload}
        onBack={onBack}
      />
    </ScrollLinkedEdgeTitleBarShell>
  )
}
