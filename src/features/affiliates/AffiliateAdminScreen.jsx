import AffiliateAdminPortal from './AffiliateAdminPortal.jsx'
import { useAffiliateAdmin } from './useAffiliateAdmin.js'
import ScrollLinkedEdgeTitleBarShell from '../../components/ScrollLinkedEdgeTitleBarShell.jsx'

export default function AffiliateAdminScreen({ supabaseClient, titleBarNavSlot, onBack }) {
  const { snapshot, loading, error, reload } = useAffiliateAdmin(supabaseClient)

  return (
    <ScrollLinkedEdgeTitleBarShell
      titleBarNavSlot={titleBarNavSlot}
      fullWidth
      contentClassName="px-3 py-4 pb-[calc(6rem+max(env(safe-area-inset-bottom,0px),var(--edge-sab,0px)))] max-w-6xl mx-auto"
    >
      <AffiliateAdminPortal
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
