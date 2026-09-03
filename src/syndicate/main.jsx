import React from 'react'
import ReactDOM from 'react-dom/client'
import { SyndicateApp } from './SyndicateApp.jsx'
import { isSyndicateOpsRoute } from './syndicateOpsRoute.js'
import { SyndicateOpsLoginGate } from './SyndicateOpsLoginGate.jsx'
import { SyndicateOpsShell } from './SyndicateOpsShell.jsx'
import './syndicate.css'

function Root() {
  if (isSyndicateOpsRoute()) {
    return (
      <SyndicateOpsLoginGate>
        {({ supabaseClient, userEmail, onSignOut }) => (
          <SyndicateOpsShell
            supabaseClient={supabaseClient}
            userEmail={userEmail}
            onSignOut={onSignOut}
          />
        )}
      </SyndicateOpsLoginGate>
    )
  }
  return <SyndicateApp />
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
)
