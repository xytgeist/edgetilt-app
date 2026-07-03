import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import * as Sentry from '@sentry/react'
import './index.css'
import App from './App.jsx'
import {
  readLoungeComposerDraftPendingWork,
  shouldShowLoungeColdBootSplash,
} from './utils/loungeColdBootSplash.js'
import {
  importRoute,
  installDeployVersionWatch,
  installStaleChunkReloadListener,
} from './utils/lazyImportWithChunkReload.js'
import { applyTheme, watchSystemTheme, applyPlatformClass } from './utils/theme.js'
import { installAppDebugLog } from './utils/appDebugLog.js'

// Capture console output for in-app debug log (staff only)
installAppDebugLog()

// Apply theme before first paint to prevent flash
applyTheme()
applyPlatformClass()
watchSystemTheme()

installStaleChunkReloadListener()
installDeployVersionWatch()

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN || 'https://8d6b45f5282d2474693cb8b9957f51d9@o4511453426876416.ingest.us.sentry.io/4511453430611968',
  environment: import.meta.env.MODE,
  sendDefaultPii: false,
})

if (shouldShowLoungeColdBootSplash({ tab: 'home', pendingWork: readLoungeComposerDraftPendingWork() })) {
  void importRoute(() => import('./features/lounge/SocialFeed.jsx'))
  // WASM is static-imported in LoungeAppSplash (DotLottie.setWasmUrl); duplicate dynamic import here only triggers INEFFECTIVE_DYNAMIC_IMPORT.
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
