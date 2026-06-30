import { useLayoutEffect, useRef, useState } from 'react'
import EdgeLogoWithEasterEgg from '../../components/EdgeLogoWithEasterEgg.jsx'
import TitleBarStatusLine from '../../components/TitleBarStatusLine.jsx'
import { LOUNGE_FEED_TITLE_BAR_ROW_CLASS } from '../lounge/loungeFeedAvatar.js'
import { useQuickLinkIds } from '../shell/quickLinksStore.js'
import { edgeLogoTitleBarClassName } from '../shell/titleBarLayout.js'
import ChatComposer from './ChatComposer.jsx'

/**
 * Bare iOS chat layout prototype - fixed Edge title bar + bottom composer only.
 * Separate from ChatConversation so we can iterate on keyboard / viewport behavior.
 *
 * @param {{
 *   onBack: () => void,
 *   titleBarNavSlot?: import('react').ReactNode,
 *   supabaseClient: import('@supabase/supabase-js').SupabaseClient,
 *   viewerUserId?: string,
 *   viewerDisplayName?: string,
 * }} props
 */
export default function ChatIosPrototype({
  onBack,
  titleBarNavSlot = null,
  supabaseClient,
  viewerUserId = '',
  viewerDisplayName = '',
}) {
  const titleBarRef = useRef(null)
  const [titleBarHeight, setTitleBarHeight] = useState(56)
  const quickLinkIds = useQuickLinkIds()
  const logoClassName = edgeLogoTitleBarClassName(quickLinkIds.length)

  useLayoutEffect(() => {
    const bar = titleBarRef.current
    if (!bar || typeof ResizeObserver === 'undefined') return
    const apply = () => {
      const h = Math.ceil(bar.getBoundingClientRect().height)
      if (h > 0) setTitleBarHeight((prev) => (prev === h ? prev : h))
    }
    apply()
    const ro = new ResizeObserver(() => apply())
    ro.observe(bar)
    return () => ro.disconnect()
  }, [])

  return (
    <div
      data-chat-ios-prototype
      className="fixed inset-0 z-[60] mx-auto flex w-full max-w-2xl flex-col overflow-hidden bg-zinc-950"
    >
      {/* Fixed Edge title bar - outside any scroll container */}
      <header
        ref={titleBarRef}
        className="relative z-20 shrink-0 border-b border-zinc-800/95 bg-zinc-950/95 backdrop-blur supports-[backdrop-filter]:bg-zinc-950/85 shadow-[0_1px_0_rgba(0,0,0,0.22)]"
        style={{ paddingTop: 'max(0px, env(safe-area-inset-top))' }}
      >
        <div className={`flex items-center gap-2 ${LOUNGE_FEED_TITLE_BAR_ROW_CLASS}`}>
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to chat"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-zinc-700/60 bg-zinc-900 text-zinc-200 touch-manipulation hover:bg-zinc-800"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <EdgeLogoWithEasterEgg className={logoClassName} />
          <div className="ml-auto flex min-w-0 shrink-0 items-center justify-end gap-2">
            <TitleBarStatusLine />
            {titleBarNavSlot}
          </div>
        </div>
      </header>

      {/* Empty body - keyboard experiments land here later */}
      <div
        className="min-h-0 flex-1 bg-zinc-950"
        style={{ paddingTop: titleBarHeight > 0 ? 0 : undefined }}
        aria-hidden
      />

      {/* Composer pinned to layout bottom (not absolute over scroll) */}
      <footer
        className="relative z-20 shrink-0 bg-zinc-950"
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))' }}
      >
        <ChatComposer
          supabaseClient={supabaseClient}
          viewerUserId={viewerUserId || 'ios-prototype'}
          replyTarget={null}
          onClearReply={() => {}}
          onSend={async () => {}}
          onTyping={() => {}}
          viewerDisplayName={viewerDisplayName}
        />
      </footer>
    </div>
  )
}
