import { createContext, useContext } from 'react'

/** @type {React.Context<{ cancelPendingPublish: (targetId: string) => void | Promise<void> }>} */
const LoungePendingPublishActionsContext = createContext({
  cancelPendingPublish: async () => {},
})

export function LoungePendingPublishActionsProvider({ cancelPendingPublish, children }) {
  return (
    <LoungePendingPublishActionsContext.Provider value={{ cancelPendingPublish }}>
      {children}
    </LoungePendingPublishActionsContext.Provider>
  )
}

export function useLoungePendingPublishActions() {
  return useContext(LoungePendingPublishActionsContext)
}
