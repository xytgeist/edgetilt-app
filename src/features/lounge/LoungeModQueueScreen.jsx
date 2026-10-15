import ScrollLinkedEdgeTitleBarShell from '../../components/ScrollLinkedEdgeTitleBarShell.jsx'
import LoungeModQueuePanel from './LoungeModQueuePanel.jsx'

export default function LoungeModQueueScreen({ supabaseClient, titleBarNavSlot, titleBarCenterSlot }) {
  return (
    <ScrollLinkedEdgeTitleBarShell
      titleBarNavSlot={titleBarNavSlot}
      titleBarCenterSlot={titleBarCenterSlot}
      fullWidth
      stableLayoutViewport
      contentClassName="px-3 py-4 pb-[calc(6rem+max(env(safe-area-inset-bottom,0px),var(--edge-sab,0px)))] max-w-3xl mx-auto"
    >
      <LoungeModQueuePanel supabaseClient={supabaseClient} />
    </ScrollLinkedEdgeTitleBarShell>
  )
}
