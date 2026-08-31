import { useLayoutEffect, useState } from 'react'
import LoungeComposerCharRing from './LoungeComposerCharRing.jsx'

/**
 * Char ring + Post button for the feed composer.
 * Owns live caption meta so SocialFeed does not setState on every keystroke.
 */
export default function LoungeFeedComposerPostChrome({
  apiRef,
  maxLen,
  draftCount = 0,
  onOpenDrafts,
  onPost,
  postBusy = false,
  postBlocked = false,
  hasNonCaptionContent = false,
}) {
  const [len, setLen] = useState(0)
  const [hasText, setHasText] = useState(false)

  useLayoutEffect(() => {
    if (!apiRef) return undefined
    apiRef.current = {
      setCaptionMeta: (nextLen, nextHasText) => {
        setLen(Number(nextLen) || 0)
        setHasText(Boolean(nextHasText))
      },
    }
    return () => {
      if (apiRef.current) apiRef.current = null
    }
  }, [apiRef])

  return (
    <div className="inline-flex shrink-0 items-center gap-1.5">
      <button
        type="button"
        onClick={onOpenDrafts}
        className="shrink-0 touch-manipulation rounded-md px-1 py-0.5 text-[12px] font-semibold text-zinc-400 hover:text-zinc-200 [-webkit-tap-highlight-color:transparent]"
      >
        Drafts{draftCount > 0 ? ` (${draftCount})` : ''}
      </button>
      <LoungeComposerCharRing len={len} max={maxLen} aria-live="polite" />
      <button
        type="button"
        onClick={onPost}
        disabled={postBusy || postBlocked || (!hasText && !hasNonCaptionContent)}
        className="lounge-composer-post-btn min-h-7 shrink-0 touch-manipulation rounded-md px-2 py-0.5 text-[13px] font-bold leading-tight disabled:cursor-not-allowed disabled:opacity-40"
      >
        <span className="text-white text-inherit font-inherit">
          {postBusy ? 'Posting…' : 'Post'}
        </span>
      </button>
    </div>
  )
}
