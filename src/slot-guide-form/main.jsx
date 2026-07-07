import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import LoginGate from './LoginGate.jsx'
import SlotGuideFormApp from './SlotGuideFormApp.jsx'
import { installGlobalTapHaptic } from '../utils/tapHaptic.js'

installGlobalTapHaptic()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <LoginGate>
      <SlotGuideFormApp />
    </LoginGate>
  </StrictMode>,
)
