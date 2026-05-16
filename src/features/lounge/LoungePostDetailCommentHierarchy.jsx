import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { LoungeCommentCard } from './LoungePostCommentThread.jsx'
import { formatLoungePostDetailWhen } from './loungeFormat.js'

const COMMENT_AVATAR_BUTTON_SEL = 'button[aria-label^="Open profile"]'
const END_PAD_PX = 3

function AvatarConnectorLine({ containerRef, topAvatarRef, bottomAvatarRef }) {
  const [line, setLine] = useState(null)

  const updateLine = useCallback(() => {
    const container = containerRef.current
    const topBtn = topAvatarRef?.current
    const bottomBtn = bottomAvatarRef?.current
    if (!container || !topBtn || !bottomBtn) {
      setLine(null)
      return
    }
    const cRect = container.getBoundingClientRect()
    const tr = topBtn.getBoundingClientRect()
    const br = bottomBtn.getBoundingClientRect()
    const cxTop = (tr.left + tr.right) / 2 - cRect.left
    const cxBottom = (br.left + br.right) / 2 - cRect.left
    const x = (cxTop + cxBottom) / 2
    const yStart = tr.bottom - cRect.top + END_PAD_PX
    const yEnd = br.top - cRect.top - END_PAD_PX
    if (yEnd <= yStart) {
      setLine(null)
      return
    }
    setLine({ left: x, top: yStart, height: yEnd - yStart })
  }, [bottomAvatarRef, containerRef, topAvatarRef])

  useLayoutEffect(() => {
    updateLine()
    const container = containerRef.current
    if (!container || typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateLine)
      return () => window.removeEventListener('resize', updateLine)
    }
    const ro = new ResizeObserver(() => updateLine())
    ro.observe(container)
    window.addEventListener('resize', updateLine)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', updateLine)
    }
  }, [containerRef, updateLine])

  if (!line) return null
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute z-0 w-0.5 bg-zinc-500/30"
      style={{
        left: line.left,
        top: line.top,
        height: line.height,
        transform: 'translateX(-50%)',
      }}
    />
  )
}

function HierarchyCommentRow({
  comment,
  isFocus,
  postAvatarRef,
  topAvatarRef,
  avatarRef,
  pathIndex,
  onNavigateToPathIndex,
  cardProps,
  descendantFallback,
}) {
  const rowRef = useRef(null)
  const avatarWrapRef = useRef(null)

  useLayoutEffect(() => {
    const wrap = avatarWrapRef.current
    if (!wrap) {
      avatarRef.current = null
      return
    }
    const btn = wrap.querySelector(COMMENT_AVATAR_BUTTON_SEL)
    avatarRef.current = btn instanceof HTMLElement ? btn : null
  }, [avatarRef, comment.id])

  const canNavigate = !isFocus && typeof onNavigateToPathIndex === 'function'

  const card = (
    <div ref={avatarWrapRef}>
      <LoungeCommentCard
        comment={comment}
        navigable={false}
        descendantFallback={descendantFallback}
        showDetailTimestamp={isFocus}
        detailTimestampLabel={
          isFocus && comment.created_at ? formatLoungePostDetailWhen(comment.created_at) : ''
        }
        {...cardProps}
      />
    </div>
  )

  return (
    <div
      ref={rowRef}
      className={`relative min-w-0 ${pathIndex > 0 ? 'mt-1 border-t border-zinc-800/60 pt-1.5' : 'mt-1'}`}
    >
      <AvatarConnectorLine containerRef={rowRef} topAvatarRef={topAvatarRef} bottomAvatarRef={avatarRef} />
      <div id={isFocus ? 'lounge-detail-focus-comment' : undefined} className="relative z-[1]">
        {canNavigate ? (
          <button
            type="button"
            onClick={() => onNavigateToPathIndex(pathIndex)}
            className="block w-full min-w-0 cursor-pointer rounded-lg px-1 py-1 text-left touch-manipulation outline-none hover:bg-zinc-900/50 [-webkit-tap-highlight-color:transparent] focus-visible:ring-2 focus-visible:ring-violet-500/40"
            aria-label="View this comment in thread"
          >
            {card}
          </button>
        ) : (
          card
        )}
      </div>
    </div>
  )
}

/**
 * OP post → ancestor comments → focused comment, with avatar connector lines (X-style thread).
 */
export default function LoungePostDetailCommentHierarchy({
  pathIds = [],
  comments = [],
  postAvatarRef,
  onNavigateToPathIndex,
  descendantCountByCommentId,
  cardProps = {},
}) {
  const byId = new Map((comments || []).map((c) => [c.id, c]))
  const chain = (pathIds || []).map((id) => byId.get(id)).filter(Boolean)
  const avatarRefs = useRef([])

  if (!chain.length) return null

  avatarRefs.current = chain.map((c, i) => avatarRefs.current[i] || { current: null })

  return (
    <section className="mt-2 border-t border-zinc-800/70 pt-2" aria-label="Comment thread">
      {chain.map((comment, idx) => {
        const isFocus = idx === chain.length - 1
        const topAvatarRef = idx === 0 ? postAvatarRef : avatarRefs.current[idx - 1]
        return (
          <HierarchyCommentRow
            key={comment.id}
            comment={comment}
            isFocus={isFocus}
            postAvatarRef={postAvatarRef}
            topAvatarRef={topAvatarRef}
            avatarRef={avatarRefs.current[idx]}
            pathIndex={idx}
            onNavigateToPathIndex={onNavigateToPathIndex}
            cardProps={cardProps}
            descendantFallback={descendantCountByCommentId?.get(comment.id) ?? 0}
          />
        )
      })}
    </section>
  )
}
