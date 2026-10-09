import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import * as Sentry from '@sentry/react'
import './index.css'
import App from './App.jsx'
import {
  installStaleChunkReloadListener,
  isCanceledModuleImport,
} from './utils/lazyImportWithChunkReload.js'
import { installHtmlBootSplashRelease } from './utils/htmlBootSplash.js'
import BootCrashFallback from './components/BootCrashFallback.jsx'
import { applyTheme, watchSystemTheme, applyPlatformClass } from './utils/theme.js'
import { installAppDebugLog } from './utils/appDebugLog.js'
import { installGlobalTapHaptic } from './utils/tapHaptic.js'
import { initGoogleAnalytics } from './utils/googleAnalytics.js'
import { installChatCallPushProbeListener } from './utils/chatCallPushProbeListener.js'
import { installEdgeAppVisibilityBeacon } from './utils/edgeAppVisibilityBeacon.js'
import { installWebkitImageResumeRepair } from './utils/webkitImageResumeRepair.js'
import {
  installFfmpegWasmRejectionGuard,
  isFfmpegWasmLoadRejection,
} from './utils/ffmpegWasmRejectionGuard.js'

// Capture console output for in-app debug log (staff only)
installAppDebugLog()

// SW call-push suppress: Cache visibility beacon + MessageChannel probe.
installEdgeAppVisibilityBeacon()
installWebkitImageResumeRepair()
installChatCallPushProbeListener()

// Apply theme before first paint to prevent flash
applyTheme()
applyPlatformClass()
watchSystemTheme()

installStaleChunkReloadListener()
installFfmpegWasmRejectionGuard()
installGlobalTapHaptic()
initGoogleAnalytics()

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN || 'https://8d6b45f5282d2474693cb8b9957f51d9@o4511453426876416.ingest.us.sentry.io/4511453430611968',
  environment: import.meta.env.MODE,
  sendDefaultPii: false,
  // Safari/WebKit + mid-deploy chunk misses. Recover via installStaleChunkReloadListener.
  ignoreErrors: [
    'Load failed',
    'Failed to fetch',
    'NetworkError when attempting to fetch resource',
    'Importing a module script failed',
    'Importing a module script is canceled',
    'Importing a module script was canceled',
    'Failed to load module script',
    'Network request failed',
    /Non-Error promise rejection captured with value:.*Load failed/i,
    /Non-Error promise rejection captured with value:.*module script is cancel/i,
    // Lounge @ffmpeg/core on browsers without Wasm SIMD (s128).
    /experimental-wasm-simd/i,
    /invalid value type ['"]?s128/i,
    /WebAssembly\.instantiate/i,
    /Non-Error promise rejection captured with value:.*CompileError/i,
    /Non-Error promise rejection captured with value:.*RuntimeError: Aborted/i,
  ],
  beforeSend(event, hint) {
    if (isCanceledModuleImport(hint?.originalException)) return null
    if (isFfmpegWasmLoadRejection(hint?.originalException)) return null
    const value = event?.exception?.values?.[0]?.value || event?.message || ''
    if (isCanceledModuleImport(value)) return null
    if (isFfmpegWasmLoadRejection(value)) return null
    return event
  },
})

installHtmlBootSplashRelease()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Sentry.ErrorBoundary fallback={({ error }) => <BootCrashFallback error={error} />}>
      <App />
    </Sentry.ErrorBoundary>
  </StrictMode>,
)
