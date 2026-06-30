import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import {
  clearAppDebugLines,
  getAppDebugLines,
  subscribeAppDebugLog,
  unsubscribeAppDebugLog,
} from '../utils/appDebugLog.js'
import { APP_BUILD_SHA } from '../utils/appBuildInfo.js'

function lineClass(line) {
  if (line.includes(' ERR ')) return 'text-rose-300'
  if (line.includes(' WARN ')) return 'text-amber-300'
  if (line.includes('[coingeckoUsage]')) return 'text-emerald-300'
  return 'text-zinc-400'
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }
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

/** Floating console capture - Settings → Admin utils → Console log HUD. */
export default function AppConsoleLogDebugHud() {
  const [collapsed, setCollapsed] = useState(false)
  const [copyStatus, setCopyStatus] = useState('')
  const [lines, setLines] = useState(() => getAppDebugLines())
  const [portalReady, setPortalReady] = useState(false)

  useEffect(() => {
    setPortalReady(true)
  }, [])

  useEffect(() => {
    const refresh = () => setLines(getAppDebugLines())
    subscribeAppDebugLog(refresh)
    return () => unsubscribeAppDebugLog(refresh)
  }, [])

  const onCopyAll = useCallback(async () => {
    try {
      await copyText(lines.join('\n'))
      setCopyStatus('Copied')
    } catch (err) {
      setCopyStatus(err instanceof Error ? err.message : 'Copy failed')
    }
    window.setTimeout(() => setCopyStatus(''), 1800)
  }, [lines])

  const onCopyLine = useCallback(async (line) => {
    try {
      await copyText(line)
      setCopyStatus('Copied line')
    } catch {
      setCopyStatus('Copy failed')
    }
    window.setTimeout(() => setCopyStatus(''), 1200)
  }, [])

  const onClear = useCallback(() => {
    clearAppDebugLines()
    setLines([])
  }, [])

  const hudBottomStyle = {
    bottom: 'max(0.75rem, env(safe-area-inset-bottom))',
  }

  if (!portalReady || typeof document === 'undefined') return null

  const hud = collapsed ? (
    <button
      type="button"
      style={hudBottomStyle}
      className="pointer-events-auto fixed right-3 z-[115] rounded-full border border-cyan-400/50 bg-black/90 px-3 py-1.5 font-mono text-[11px] font-semibold text-cyan-200 shadow-lg backdrop-blur-sm"
      onClick={() => setCollapsed(false)}
    >
      Console · {lines.length}
    </button>
  ) : (
    <div
      style={hudBottomStyle}
      className="pointer-events-auto fixed right-3 z-[115] flex max-h-[min(44vh,360px)] w-[min(calc(100vw-1.5rem),26rem)] flex-col overflow-hidden rounded-xl border border-cyan-400/40 bg-black/92 font-mono text-[10px] leading-snug text-zinc-100 shadow-2xl backdrop-blur-md"
      data-app-console-log-hud
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-cyan-400/25 bg-cyan-950/40 px-2 py-1.5">
        <span className="text-[11px] font-semibold text-cyan-200">
          Console log · <span className="font-mono text-cyan-100">{APP_BUILD_SHA}</span>
        </span>
        <div className="flex items-center gap-1">
          {copyStatus ? <span className="text-[9px] text-emerald-300">{copyStatus}</span> : null}
          <button type="button" className="rounded px-1.5 py-0.5 text-cyan-100 hover:bg-cyan-900/50" onClick={() => void onCopyAll()}>
            Copy
          </button>
          <button type="button" className="rounded px-1.5 py-0.5 text-cyan-100 hover:bg-cyan-900/50" onClick={onClear}>
            Clear
          </button>
          <button type="button" className="rounded px-1.5 py-0.5 text-cyan-100 hover:bg-cyan-900/50" onClick={() => setCollapsed(true)}>
            Hide
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2 space-y-0.5">
        {lines.length === 0 ? (
          <p className="py-4 text-center text-[11px] text-zinc-600">No logs yet - reproduce the issue while this HUD is open.</p>
        ) : (
          [...lines].reverse().map((line, i) => (
            <button
              key={`${lines.length - i}-${line.slice(0, 24)}`}
              type="button"
              onClick={() => void onCopyLine(line)}
              className={`block w-full rounded px-1 py-0.5 text-left break-all touch-manipulation active:bg-zinc-800/80 ${lineClass(line)}`}
            >
              {line}
            </button>
          ))
        )}
      </div>
    </div>
  )

  return createPortal(hud, document.body)
}
