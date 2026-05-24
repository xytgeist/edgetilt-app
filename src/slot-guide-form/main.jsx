import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import SlotGuideFormApp from './SlotGuideFormApp.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <SlotGuideFormApp />
  </StrictMode>,
)
