import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import * as Sentry from '@sentry/react'
import './index.css'
import App from './App.jsx'
import {
  readLoungeComposerDraftPendingWork,
  shouldShowLoungeColdBootSplash,
} from './utils/loungeColdBootSplash.js'

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN || 'https://8d6b45f5282d2474693cb8b9957f51d9@o4511453430611968.ingest.us.sentry.io/4511453430611968',
  environment: import.meta.env.MODE,
  sendDefaultPii: false,
})

if (shouldShowLoungeColdBootSplash({ tab: 'home', pendingWork: readLoungeComposerDraftPendingWork() })) {
  void import('./features/lounge/SocialFeed.jsx')
  void import('@lottiefiles/dotlottie-web/dotlottie-player.wasm?url')
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
