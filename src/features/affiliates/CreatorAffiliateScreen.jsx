import { useEffect, useState } from 'react'
import CreatorAffiliatePortal from './CreatorAffiliatePortal.jsx'
import { useCreatorAffiliatePortal } from './useCreatorAffiliatePortal.js'
import ScrollLinkedEdgeTitleBarShell from '../../components/ScrollLinkedEdgeTitleBarShell.jsx'

export default function CreatorAffiliateScreen({
  supabaseClient,
  titleBarNavSlot,
  onBack,
}) {
  const { portal, loading, error, reload } = useCreatorAffiliatePortal(supabaseClient)
  const [userId, setUserId] = useState(null)
  const [accountEmail, setAccountEmail] = useState('')

  useEffect(() => {
    if (!supabaseClient) return
    let cancelled = false
    void supabaseClient.auth.getSession().then(({ data }) => {
      if (cancelled) return
      setUserId(data?.session?.user?.id || null)
      setAccountEmail(String(data?.session?.user?.email || '').trim())
    })
    return () => {
      cancelled = true
    }
  }, [supabaseClient])

  return (
    <ScrollLinkedEdgeTitleBarShell
      titleBarNavSlot={titleBarNavSlot}
      contentClassName="px-3 py-4 pb-[calc(6rem+env(safe-area-inset-bottom,0px))] max-w-3xl mx-auto"
    >
      <CreatorAffiliatePortal
        supabaseClient={supabaseClient}
        userId={userId}
        accountEmail={accountEmail}
        portal={portal}
        loading={loading}
        error={error}
        onReload={reload}
        onBack={onBack}
      />
    </ScrollLinkedEdgeTitleBarShell>
  )
}
