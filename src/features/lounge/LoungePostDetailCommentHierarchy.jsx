import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { LoungeCommentCard } from './LoungePostCommentThread.jsx'
import { formatLoungePostDetailWhen } from './loungeFormat.js'

const END_PAD_PX = 3

export const LOUNGE_THREAD_PART_NUMBER_BADGE_CLASS =
  'flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-zinc-800 text-[10px] font-bold tabular-nums text-zinc-400 ring-1 ring-zinc-700/90'

/** Final thread part on post detail - red cap on the same gray pill as middle parts. */
export const LOUNGE_THREAD_PART_NUMBER_BADGE_LAST_CLASS =
  'flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-zinc-800 text-[10px] font-bold tabular-nums text-lv-red ring-1 ring-lv-red/85'

function observeConnectorMedia(container, onChange) {
  if (!container || typeof onChange !== 'function') return () => {}
  const cleanups = []

  const watchEl = (el) => {
    if (!el || typeof el.addEventListener !== 'function') return
    const run = () => onChange()
    el.addEventListener('load', run)
    el.addEventListener('error', run)
    el.addEventListener('loadedmetadata', run)
    el.addEventListener('loadeddata', run)
    cleanups.push(() => {
      el.removeEventListener('load', run)
      el.removeEventListener('error', run)
      el.removeEventListener('loadedmetadata', run)
      el.removeEventListener('loadeddata', run)
    })
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(run)
      ro.observe(el)
      cleanups.push(() => ro.disconnect())
    }
  }

  container.querySelectorAll('img, video').forEach(watchEl)

  let mo = null
  if (typeof MutationObserver !== 'undefined') {
    mo = new MutationObserver((records) => {
      for (const rec of records) {
        for (const node of rec.addedNodes || []) {
          if (!(node instanceof Element)) continue
          if (node.matches?.('img, video')) watchEl(node)
          node.querySelectorAll?.('img, video').forEach(watchEl)
        }
      }
      onChange()
    })
    mo.observe(container, { childList: true, subtree: true })
  }

  return () => {
    mo?.disconnect()
    cleanups.forEach((fn) => fn())
  }
}

export function AvatarConnectorLine({
  containerRef,
  topAvatarRef,
  bottomAvatarRef,
  /** Remount/remeasure when overlay omit / nested stack changes (OP media can unhide). */
  layoutKey = null,
}) {
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
    const scaleY = cRect.height / Math.max(container.offsetHeight, 1)
    const scaleX = cRect.width / Math.max(container.offsetWidth, 1)
    const invY = scaleY > 0.01 ? 1 / scaleY : 1
    const invX = scaleX > 0.01 ? 1 / scaleX : 1
    const cxTop = ((tr.left + tr.right) / 2 - cRect.left) * invX
    const cxBottom = ((br.left + br.right) / 2 - cRect.left) * invX
    const x = (cxTop + cxBottom) / 2
    const yStart = (tr.bottom - cRect.top) * invY + END_PAD_PX
    const yEnd = (br.top - cRect.top) * invY - END_PAD_PX
    if (yEnd <= yStart) {
      setLine(null)
      return
    }
    setLine({ left: x, top: yStart, height: yEnd - yStart })
  }, [bottomAvatarRef, containerRef, topAvatarRef])

  useLayoutEffect(() => {
    const container = containerRef.current
    const topBtn = topAvatarRef?.current
    const bottomBtn = bottomAvatarRef?.current
    const run = () => updateLine()
    run()
    const raf1 = requestAnimationFrame(() => {
      run()
      requestAnimationFrame(run)
    })
    const t0 = window.setTimeout(run, 0)
    const t1 = window.setTimeout(run, 80)
    const t2 = window.setTimeout(run, 250)
    const t3 = window.setTimeout(run, 600)

    const observers = []
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(run)
      if (container) ro.observe(container)
      if (topBtn) ro.observe(topBtn)
      if (bottomBtn) ro.observe(bottomBtn)
      observers.push(ro)
    }

    const stopMediaWatch = observeConnectorMedia(container, run)
    window.addEventListener('resize', run)

    return () => {
      cancelAnimationFrame(raf1)
      window.clearTimeout(t0)
      window.clearTimeout(t1)
      window.clearTimeout(t2)
      window.clearTimeout(t3)
      observers.forEach((ro) => ro.disconnect())
      stopMediaWatch()
      window.removeEventListener('resize', run)
    }
  }, [bottomAvatarRef, containerRef, layoutKey, topAvatarRef, updateLine])

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
  topAvatarRef,
  avatarRef,
  pathIndex,
  onNavigateToPathIndex,
  cardProps,
  descendantFallback,
  connectorRootRef,
  isCommentPostDetail,
  focusDetailLayout,
  betweenRowClassName = 'mt-1',
  connectorLayoutKey = null,
}) {
  const rowRef = useRef(null)
  // Prefer the shared thread root so OP media height is in the same coordinate space
  // as segment lines (row-local containers break when the previous avatar sits above).
  const lineContainerRef = connectorRootRef || rowRef
  const useSharedConnectorRoot = Boolean(connectorRootRef)
  const rowGapClass = pathIndex > 0 ? betweenRowClassName : ''

  const canNavigate = !isFocus && typeof onNavigateToPathIndex === 'function'

  return (
    <div
      ref={rowRef}
      className={`min-w-0 ${useSharedConnectorRoot ? '' : 'relative'} ${rowGapClass}`}
    >
      {!isCommentPostDetail ? (
        <AvatarConnectorLine
          containerRef={lineContainerRef}
          topAvatarRef={topAvatarRef}
          bottomAvatarRef={avatarRef}
          layoutKey={connectorLayoutKey}
        />
      ) : null}
      <div id={isFocus ? 'lounge-detail-focus-comment' : undefined} className="relative z-[1]">
        <LoungeCommentCard
          comment={comment}
          avatarButtonRef={avatarRef}
          descendantFallback={descendantFallback}
          showDetailTimestamp={isFocus && focusDetailLayout}
          detailTimestampLabel={
            isFocus && focusDetailLayout && comment.created_at
              ? formatLoungePostDetailWhen(comment.created_at)
              : ''
          }
          {...cardProps}
          detailFocusLayout={isFocus && focusDetailLayout}
          captionColumnMedia={false}
          navigable={canNavigate}
          onOpenCommentThread={
            canNavigate ? () => onNavigateToPathIndex(pathIndex) : undefined
          }
        />
      </div>
    </div>
  )
}

/**
 * OP post → ancestor comments → focused comment, with avatar connector lines (X-style thread).
 * Ancestor rows (not the focus) are tappable - opens that comment as the Reply focus + its replies.
 */
export default function LoungePostDetailCommentHierarchy({
  pathIds = [],
  comments = [],
  postAvatarRef,
  connectorRootRef = null,
  onNavigateToPathIndex,
  descendantCountByCommentId,
  cardProps = {},
  isCommentPostDetail = true,
  /** Focus row uses post-detail full-width caption (detail screens). Off for profile Replies. */
  focusDetailLayout = true,
  /** Skip the default non-detail top rule (profile already spaces the hierarchy). */
  hideSectionRule = false,
  betweenRowClassName = 'mt-1',
  connectorLayoutKey = null,
}) {
  const byId = new Map((comments || []).map((c) => [String(c.id), c]))
  const chain = (pathIds || []).map((id) => byId.get(String(id))).filter(Boolean)
  const avatarRefs = useRef([])

  if (!chain.length) return null

  avatarRefs.current = chain.map((c, i) => avatarRefs.current[i] || { current: null })
  const focusAvatarRef = avatarRefs.current[chain.length - 1]
  const focusCommentId = chain[chain.length - 1]?.id

  const sectionClass = isCommentPostDetail
    ? 'mt-0'
    : hideSectionRule
      ? 'mt-0'
      : 'mt-2 border-t border-zinc-800/70 pt-2'

  return (
    <section className={sectionClass} aria-label="Comment thread">
      {chain.map((comment, idx) => {
        const isFocus = idx === chain.length - 1
        const topAvatarRef = idx === 0 ? postAvatarRef : avatarRefs.current[idx - 1]
        return (
          <HierarchyCommentRow
            key={comment.id}
            comment={comment}
            isFocus={isFocus}
            topAvatarRef={topAvatarRef}
            avatarRef={avatarRefs.current[idx]}
            pathIndex={idx}
            onNavigateToPathIndex={onNavigateToPathIndex}
            cardProps={cardProps}
            descendantFallback={descendantCountByCommentId?.get(comment.id) ?? 0}
            connectorRootRef={connectorRootRef}
            isCommentPostDetail={isCommentPostDetail}
            focusDetailLayout={focusDetailLayout}
            betweenRowClassName={betweenRowClassName}
            connectorLayoutKey={connectorLayoutKey}
          />
        )
      })}
      {isCommentPostDetail && connectorRootRef && focusCommentId ? (
        <AvatarConnectorLine
          key={focusCommentId}
          containerRef={connectorRootRef}
          topAvatarRef={postAvatarRef}
          bottomAvatarRef={focusAvatarRef}
          layoutKey={connectorLayoutKey}
        />
      ) : null}
    </section>
  )
}
