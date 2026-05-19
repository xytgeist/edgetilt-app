import { useCallback, useMemo, useState, useSyncExternalStore, useEffect } from 'react'
import {
  clearLoungeVideoDebugEvents,
  getLoungeVideoDebugEvents,
  getLoungeVideoDebugRevision,
  getLoungeVideoDebugTileSnapshots,
  subscribeLoungeVideoDebug,
} from './loungeFeedVideoDebugRegistry.js'
import {
  getLoungeStreamLightboxOpen,
  subscribeLoungeStreamLightboxOpen,
} from './loungeStreamLightboxRegistry.js'
import {
  readLoungeFeedVideoAutoplayEnabled,
  subscribeLoungeFeedVideoAutoplayEnabled,
} from '../../utils/loungeFeedVideoAutoplayPref.js'

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

/**
 * On-device autoplay coordinator HUD — enable with `?loungeVideoDebug=1` (persists in localStorage).
 * @param {{ store: import('./loungeFeedVideoAutoplayStore.js').createAutoplayStore extends () => infer S ? S : never, scrollRootRef: import('react').RefObject<HTMLElement | null> }} props
 */
export default function LoungeFeedVideoAutoplayDebugHud({ store, scrollRootRef }) {
  const [collapsed, setCollapsed] = useState(false)
  const [copyStatus, setCopyStatus] = useState('')
  const [pollTick, setPollTick] = useState(0)

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

  const anyStreamLightboxOpen = useSyncExternalStore(
    subscribeLoungeStreamLightboxOpen,
    getLoungeStreamLightboxOpen,
    () => false,
  )

  const debugInfo = store.getDebugInfo?.() ?? { registeredEntryCount: 0, registeredIds: [] }
  const tileSnapshots = getLoungeVideoDebugTileSnapshots()
  const debugEvents = getLoungeVideoDebugEvents()

  const scrollRoot = scrollRootRef?.current ?? null
  const scrollTop = scrollRoot?.scrollTop ?? 0
  const scrollHeight = scrollRoot?.scrollHeight ?? 0
  const clientHeight = scrollRoot?.clientHeight ?? 0

  const tileRows = useMemo(() => {
    const ids = new Set([
      ...debugInfo.registeredIds,
      ...Object.keys(tileSnapshots),
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
        registered: debugInfo.registeredIds.includes(id),
      }))
      .sort((a, b) => {
        if (a.isActive !== b.isActive) return a.isActive ? -1 : 1
        if (a.inRing !== b.inRing) return a.inRing ? -1 : 1
        return b.ratio - a.ratio
      })
  }, [coordinatorSnapshot, debugInfo.registeredIds, tileSnapshots, pollTick])

  const buildExportPayload = useCallback(() => {
    return {
      exportedAt: new Date().toISOString(),
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      feedAutoplayEnabled,
      anyStreamLightboxOpen,
      scroll: { scrollTop, scrollHeight, clientHeight },
      coordinator: coordinatorSnapshot,
      store: debugInfo,
      tiles: tileRows.map((row) => ({ id: row.id, ratio: row.ratio, isActive: row.isActive, inRing: row.inRing, ...row.snap })),
      events: debugEvents,
    }
  }, [
    anyStreamLightboxOpen,
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

  if (collapsed) {
    return (
      <button
        type="button"
        className="pointer-events-auto fixed bottom-3 left-3 z-[106] rounded-full border border-amber-400/50 bg-black/85 px-3 py-1.5 font-mono text-[11px] font-semibold text-amber-200 shadow-lg backdrop-blur-sm"
        onClick={() => setCollapsed(false)}
      >
        Video debug
      </button>
    )
  }

  return (
    <div
      className="pointer-events-auto fixed bottom-3 left-3 z-[106] flex max-h-[min(44vh,360px)] w-[min(calc(100vw-1.5rem),26rem)] flex-col overflow-hidden rounded-xl border border-amber-400/40 bg-black/90 font-mono text-[10px] leading-snug text-zinc-100 shadow-2xl backdrop-blur-md"
      data-lounge-video-debug-hud
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-amber-400/25 bg-amber-950/40 px-2 py-1.5">
        <span className="text-[11px] font-semibold text-amber-200">Lounge video debug</span>
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
            autoplay pref: <span className="text-white">{feedAutoplayEnabled ? 'on' : 'off'}</span>
            {' · '}
            lightbox: <span className="text-white">{anyStreamLightboxOpen ? 'open' : 'closed'}</span>
          </div>
          <div>
            active: <span className="text-emerald-300">{shortId(coordinatorSnapshot.activeId) || '—'}</span>
            {' · '}
            ring [{coordinatorSnapshot.ringIds.length}]:{' '}
            {coordinatorSnapshot.ringIds.length
              ? coordinatorSnapshot.ringIds.map((id) => shortId(id)).join(', ')
              : '—'}
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
              if (row.inRing) flags.push('ring')
              if (row.registered) flags.push('reg')
              if (row.snap?.attachStream) flags.push('hls')
              if (v.present && !v.paused) flags.push('playing')
              return (
                <div key={row.id} className="rounded border border-zinc-700/80 bg-zinc-900/70 px-1.5 py-1">
                  <div className="truncate text-[9px] text-zinc-400">{shortId(row.id)}</div>
                  <div className="text-zinc-200">
                    {flags.join(' · ') || '—'}
                    {' · '}
                    ratio {(row.ratio * 100).toFixed(0)}%
                  </div>
                  {row.snap ? (
                    <div className="text-zinc-400">
                      rs={v.readyState ?? '—'} ns={v.networkState ?? '—'} paused={String(v.paused)}
                      {v.errorLabel ? ` · err=${v.errorLabel}` : ''}
                      {row.snap.lastPlayError ? ` · play=${row.snap.lastPlayError}` : ''}
                    </div>
                  ) : null}
                </div>
              )
            })
          )}
        </div>

        <div className="mb-1 text-[9px] uppercase tracking-wide text-amber-300/80">Recent events</div>
        <div className="space-y-1">
          {debugEvents.length === 0 ? (
            <div className="text-zinc-500">No events yet</div>
          ) : (
            debugEvents.slice(0, 12).map((ev, i) => (
              <div key={`${ev.ts}-${i}`} className="rounded bg-zinc-900/60 px-1.5 py-0.5 text-zinc-300">
                <span className="text-zinc-500">{formatTime(ev.ts)}</span>{' '}
                <span className="text-amber-200">{ev.kind}</span>
                {ev.clientId ? ` · ${shortId(ev.clientId)}` : ''}
                {ev.detail ? `: ${ev.detail}` : ''}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
