import { useCallback, useMemo, useState, useSyncExternalStore, useEffect } from 'react'
import { createPortal } from 'react-dom'
import {
  clearLoungeVideoDebugEvents,
  getLoungeVideoDebugEvents,
  getLoungeVideoDebugRevision,
  getLoungeVideoDebugTileSnapshots,
  subscribeLoungeVideoDebug,
} from './loungeFeedVideoDebugRegistry.js'
import {
  clearLoungeBadgeTipDebugEvents,
  getLoungeBadgeTipDebugEvents,
  getLoungeBadgeTipDebugRevision,
  getLoungeBadgeTipDebugSnapshot,
  subscribeLoungeBadgeTipDebug,
} from './loungeBadgeTipDebugRegistry.js'
import {
  getLoungeStreamLightboxOpen,
  subscribeLoungeStreamLightboxOpen,
} from './loungeStreamLightboxRegistry.js'
import {
  readLoungeFeedVideoAutoplayEnabled,
  subscribeLoungeFeedVideoAutoplayEnabled,
} from '../../utils/loungeFeedVideoAutoplayPref.js'
import { APP_BUILD_SHA } from '../../utils/appBuildInfo.js'

function shortId(id) {
  const s = String(id || '')
  if (s.length <= 28) return s
  return `${s.slice(0, 12)}…${s.slice(-10)}`
}

function formatTime(ts) {
  try {
    return new Date(ts).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
  } catch {
    return ''
  }
}

function eventKindClass(kind) {
  switch (kind) {
    case 'open':
      return 'text-emerald-300'
    case 'anim':
      return 'text-cyan-300'
    case 'exit':
      return 'text-rose-300'
    case 'hover':
      return 'text-violet-300'
    case 'layout':
      return 'text-orange-300'
    case 'pos':
      return 'text-zinc-400'
    case 'coord':
      return 'text-cyan-300'
    case 'active':
      return 'text-emerald-300'
    case 'fade':
      return 'text-violet-300'
    case 'attach':
      return 'text-orange-300'
    case 'play':
      return 'text-lime-300'
    case 'hls':
      return 'text-rose-300'
    case 'hero':
      return 'text-amber-200'
    default:
      return 'text-amber-200'
  }
}

/**
 * On-device autoplay coordinator HUD - Settings → Video debug HUD, or `?loungeVideoDebug=1`.
 * @param {{ store: import('./loungeFeedVideoAutoplayStore.js').createAutoplayStore extends () => infer S ? S : never, scrollRootRef: import('react').RefObject<HTMLElement | null> }} props
 */
export default function LoungeFeedVideoAutoplayDebugHud({ store, scrollRootRef }) {
  const [collapsed, setCollapsed] = useState(false)
  const [copyStatus, setCopyStatus] = useState('')
  const [pollTick, setPollTick] = useState(0)
  const [portalReady, setPortalReady] = useState(false)

  useEffect(() => {
    setPortalReady(true)
  }, [])

  useEffect(() => {
    const id = window.setInterval(() => setPollTick((t) => t + 1), 450)
    return () => window.clearInterval(id)
  }, [])

  const feedAutoplayEnabled = useSyncExternalStore(
    subscribeLoungeFeedVideoAutoplayEnabled,
    readLoungeFeedVideoAutoplayEnabled,
    () => true,
  )

  const coordinatorSnapshot = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  )

  useSyncExternalStore(subscribeLoungeVideoDebug, getLoungeVideoDebugRevision, getLoungeVideoDebugRevision)
  useSyncExternalStore(subscribeLoungeBadgeTipDebug, getLoungeBadgeTipDebugRevision, getLoungeBadgeTipDebugRevision)

  const anyStreamLightboxOpen = useSyncExternalStore(
    subscribeLoungeStreamLightboxOpen,
    getLoungeStreamLightboxOpen,
    () => false,
  )

  const debugInfo = store.getDebugInfo?.() ?? { registeredEntryCount: 0, registeredIds: [] }
  const tileSnapshots = getLoungeVideoDebugTileSnapshots()
  const debugEvents = getLoungeVideoDebugEvents()
  const badgeTipEvents = getLoungeBadgeTipDebugEvents()
  const badgeTipSnapshot = getLoungeBadgeTipDebugSnapshot()

  const scrollRoot = scrollRootRef?.current ?? null
  const scrollTop = scrollRoot?.scrollTop ?? 0
  const scrollHeight = scrollRoot?.scrollHeight ?? 0
  const clientHeight = scrollRoot?.clientHeight ?? 0

  const tileRows = useMemo(() => {
    const ids = new Set([
      ...debugInfo.registeredIds,
      ...Object.keys(tileSnapshots),
      ...coordinatorSnapshot.domBudgetIds ?? [],
      ...coordinatorSnapshot.ringIds,
      coordinatorSnapshot.activeId,
    ].filter(Boolean))
    return [...ids]
      .map((id) => ({
        id,
        snap: tileSnapshots[id] ?? null,
        ratio: Number(coordinatorSnapshot.tileRatios[id] ?? 0),
        isActive: coordinatorSnapshot.activeId === id,
        inRing: coordinatorSnapshot.ringIds.includes(id),
        inDomBudget: (coordinatorSnapshot.domBudgetIds ?? []).includes(id),
        registered: debugInfo.registeredIds.includes(id),
      }))
      .sort((a, b) => {
        if (a.isActive !== b.isActive) return a.isActive ? -1 : 1
        if (a.inRing !== b.inRing) return a.inRing ? -1 : 1
        if (a.inDomBudget !== b.inDomBudget) return a.inDomBudget ? -1 : 1
        return b.ratio - a.ratio
      })
  }, [coordinatorSnapshot, debugInfo.registeredIds, tileSnapshots, pollTick])

  const buildExportPayload = useCallback(() => {
    return {
      exportedAt: new Date().toISOString(),
      build: { sha: APP_BUILD_SHA },
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      feedAutoplayEnabled,
      anyStreamLightboxOpen,
      scroll: { scrollTop, scrollHeight, clientHeight },
      coordinator: coordinatorSnapshot,
      store: debugInfo,
      tiles: tileRows.map((row) => ({
        id: row.id,
        ratio: row.ratio,
        isActive: row.isActive,
        inRing: row.inRing,
        inDomBudget: row.inDomBudget,
        ...row.snap,
      })),
      events: debugEvents,
      badgeTips: {
        live: badgeTipSnapshot,
        events: badgeTipEvents,
      },
    }
  }, [
    anyStreamLightboxOpen,
    badgeTipEvents,
    badgeTipSnapshot,
    coordinatorSnapshot,
    debugEvents,
    debugInfo,
    feedAutoplayEnabled,
    scrollTop,
    scrollHeight,
    clientHeight,
    tileRows,
  ])

  const onCopy = useCallback(async () => {
    const text = JSON.stringify(buildExportPayload(), null, 2)
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
      } else {
        const ta = document.createElement('textarea')
        ta.value = text
        ta.setAttribute('readonly', '')
        ta.style.position = 'fixed'
        ta.style.left = '-9999px'
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
      }
      setCopyStatus('Copied')
    } catch (err) {
      setCopyStatus(err instanceof Error ? err.message : 'Copy failed')
    }
    window.setTimeout(() => setCopyStatus(''), 1800)
  }, [buildExportPayload])

  const hudBottomStyle = {
    bottom: 'max(0.75rem, env(safe-area-inset-bottom))',
  }

  if (!portalReady || typeof document === 'undefined') return null

  const hud = collapsed ? (
    <button
      type="button"
      style={hudBottomStyle}
      className="pointer-events-auto fixed left-3 z-[115] rounded-full border border-amber-400/50 bg-black/90 px-3 py-1.5 font-mono text-[11px] font-semibold text-amber-200 shadow-lg backdrop-blur-sm"
      onClick={() => setCollapsed(false)}
    >
      Video debug · {APP_BUILD_SHA}
    </button>
  ) : (
    <div
      style={hudBottomStyle}
      className="pointer-events-auto fixed left-3 z-[115] flex max-h-[min(44vh,360px)] w-[min(calc(100vw-1.5rem),26rem)] flex-col overflow-hidden rounded-xl border border-amber-400/40 bg-black/92 font-mono text-[10px] leading-snug text-zinc-100 shadow-2xl backdrop-blur-md"
      data-lounge-video-debug-hud
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-amber-400/25 bg-amber-950/40 px-2 py-1.5">
        <span className="text-[11px] font-semibold text-amber-200">
          Lounge video debug · <span className="font-mono text-amber-100">{APP_BUILD_SHA}</span>
        </span>
        <div className="flex items-center gap-1">
          {copyStatus ? <span className="text-[9px] text-emerald-300">{copyStatus}</span> : null}
          <button type="button" className="rounded px-1.5 py-0.5 text-amber-100 hover:bg-amber-900/50" onClick={onCopy}>
            Copy
          </button>
          <button
            type="button"
            className="rounded px-1.5 py-0.5 text-amber-100 hover:bg-amber-900/50"
            onClick={() => {
              clearLoungeVideoDebugEvents()
              clearLoungeBadgeTipDebugEvents()
            }}
          >
            Clear log
          </button>
          <button type="button" className="rounded px-1.5 py-0.5 text-amber-100 hover:bg-amber-900/50" onClick={() => setCollapsed(true)}>
            Hide
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-1.5">
        <div className="mb-2 space-y-0.5 text-zinc-300">
          <div>
            build: <span className="font-mono text-white">{APP_BUILD_SHA}</span>
            {' · '}
            autoplay pref: <span className="text-white">{feedAutoplayEnabled ? 'on' : 'off'}</span>
            {' · '}
            lightbox: <span className="text-white">{anyStreamLightboxOpen ? 'open' : 'closed'}</span>
          </div>
          <div>
            active: <span className="text-emerald-300">{shortId(coordinatorSnapshot.activeId) || '-'}</span>
            {' · '}
            ring [{coordinatorSnapshot.ringIds.length}]:{' '}
            {coordinatorSnapshot.ringIds.length
              ? coordinatorSnapshot.ringIds.map((id) => shortId(id)).join(', ')
              : '-'}
          </div>
          <div>
            dom [{(coordinatorSnapshot.domBudgetIds ?? []).length}]:{' '}
            {(coordinatorSnapshot.domBudgetIds ?? []).length
              ? coordinatorSnapshot.domBudgetIds.map((id) => shortId(id)).join(', ')
              : '-'}
            {' · '}
            softReset #{coordinatorSnapshot.softResetEpoch ?? 0}
          </div>
          <div>
            flinger: <span className="text-white">{coordinatorSnapshot.flingerMode ? 'yes' : 'no'}</span>
            {' · '}
            hero: <span className="text-white">{coordinatorSnapshot.heroLocked ? shortId(coordinatorSnapshot.heroClientId) : 'no'}</span>
            {' · '}
            suspended: <span className="text-white">{coordinatorSnapshot.coordinatorSuspended ? 'yes' : 'no'}</span>
          </div>
          <div>
            entries: <span className="text-white">{debugInfo.registeredEntryCount}</span>
            {' · '}
            scroll: <span className="text-white">{Math.round(scrollTop)}/{Math.round(scrollHeight)}</span>
            {' · '}
            viewport: <span className="text-white">{Math.round(clientHeight)}px</span>
          </div>
        </div>

        <div className="mb-2 text-[9px] uppercase tracking-wide text-amber-300/80">Tiles</div>
        <div className="mb-2 space-y-1">
          {tileRows.length === 0 ? (
            <div className="text-zinc-500">No registered tiles</div>
          ) : (
            tileRows.slice(0, 14).map((row) => {
              const v = row.snap?.video ?? {}
              const flags = []
              if (row.isActive) flags.push('ACTIVE')
              if (row.inRing) flags.push('hls')
              if (row.inDomBudget) flags.push('dom')
              if (row.registered) flags.push('reg')
              if (row.snap?.attachStream) flags.push('attach')
              if (row.snap?.streamFadeShowVideo) flags.push('fade')
              if (v.present && !v.paused) flags.push('playing')
              return (
                <div key={row.id} className="rounded border border-zinc-700/80 bg-zinc-900/70 px-1.5 py-1">
                  <div className="truncate text-[9px] text-zinc-400">{shortId(row.id)}</div>
                  <div className="text-zinc-200">
                    {flags.join(' · ') || '-'}
                    {' · '}
                    ratio {(row.ratio * 100).toFixed(0)}%
                  </div>
                  {row.snap ? (
                    <div className="text-zinc-400">
                      rs={v.readyState ?? '-'} ns={v.networkState ?? '-'} paused={String(v.paused)}
                      {v.errorLabel ? ` · err=${v.errorLabel}` : ''}
                      {row.snap.lastPlayError ? ` · play=${row.snap.lastPlayError}` : ''}
                    </div>
                  ) : null}
                </div>
              )
            })
          )}
        </div>

        <div className="mb-2 text-[9px] uppercase tracking-wide text-amber-300/80">Badge tips</div>
        <div className="mb-2 rounded border border-violet-500/30 bg-violet-950/20 px-1.5 py-1 text-zinc-300">
          {badgeTipSnapshot ? (
            <>
              <div>
                live: <span className="text-white">{badgeTipSnapshot.tip || '-'}</span>
                {' · '}
                gen <span className="text-white">{badgeTipSnapshot.gen ?? '-'}</span>
                {' · '}
                mounted <span className="text-white">{String(badgeTipSnapshot.mounted)}</span>
                {' · '}
                animIn <span className="text-white">{String(badgeTipSnapshot.animInReady)}</span>
                {' · '}
                exiting <span className="text-white">{String(badgeTipSnapshot.exiting)}</span>
              </div>
              {badgeTipSnapshot.dom ? (
                <div className="truncate text-zinc-400">
                  cls=
                  {String(badgeTipSnapshot.dom.className || '').includes('tip-out')
                    ? 'out'
                    : String(badgeTipSnapshot.dom.className || '').includes('tip-in')
                      ? 'in'
                      : '?'}
                  {' · '}
                  paused={String(badgeTipSnapshot.tipEnterPaused ?? false)}
                  {' · '}
                  play={String(badgeTipSnapshot.dom.animationPlayState)}
                  {' · '}
                  op={String(badgeTipSnapshot.dom.opacity)}
                  {' · '}
                  anim={String(badgeTipSnapshot.dom.animationName)}
                </div>
              ) : (
                <div className="text-zinc-500">no live tip DOM</div>
              )}
            </>
          ) : (
            <div className="text-zinc-500">Tap Admin / Mod / OG badge to capture</div>
          )}
        </div>
        <div className="mb-2 space-y-1">
          {badgeTipEvents.length === 0 ? (
            <div className="text-zinc-500">No badge tip events yet</div>
          ) : (
            badgeTipEvents.slice(0, 16).map((ev, i) => (
              <div key={`badge-${ev.ts}-${i}`} className="rounded bg-violet-950/30 px-1.5 py-0.5 text-zinc-300">
                <span className="text-zinc-500">{formatTime(ev.ts)}</span>{' '}
                <span className={eventKindClass(ev.kind)}>{ev.kind}</span>
                {ev.tip ? ` · ${ev.tip}` : ''}
                {ev.gen != null ? ` · g${ev.gen}` : ''}
                {ev.detail ? `: ${ev.detail}` : ''}
              </div>
            ))
          )}
        </div>

        <div className="mb-1 text-[9px] uppercase tracking-wide text-amber-300/80">Recent events</div>
        <div className="space-y-1">
          {debugEvents.length === 0 ? (
            <div className="text-zinc-500">No events yet</div>
          ) : (
            debugEvents.slice(0, 20).map((ev, i) => (
              <div key={`${ev.ts}-${i}`} className="rounded bg-zinc-900/60 px-1.5 py-0.5 text-zinc-300">
                <span className="text-zinc-500">{formatTime(ev.ts)}</span>{' '}
                <span className={eventKindClass(ev.kind)}>{ev.kind}</span>
                {ev.clientId ? ` · ${shortId(ev.clientId)}` : ''}
                {ev.detail ? `: ${ev.detail}` : ''}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )

  return createPortal(hud, document.body)
}
