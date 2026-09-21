import { useEffect } from 'react'
import { useLoungeSportsFeed } from './LoungeSportsFeedContext.jsx'

/**
 * Bridge sports hub open/close into SocialFeed (provider is a descendant).
 */
export default function LoungeSportsHubBridge({ onHubOpenChange, closeHubRef }) {
  const sports = useLoungeSportsFeed()

  useEffect(() => {
    if (!closeHubRef) return undefined
    closeHubRef.current = sports?.closeHub ?? null
    return () => {
      closeHubRef.current = null
    }
  }, [closeHubRef, sports?.closeHub])

  useEffect(() => {
    onHubOpenChange?.(Boolean(sports?.hubGame))
  }, [onHubOpenChange, sports?.hubGame])

  return null
}
