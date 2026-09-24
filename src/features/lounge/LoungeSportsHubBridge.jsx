import { useEffect } from 'react'
import { useLoungeSportsFeed } from './LoungeSportsFeedContext.jsx'

/**
 * Bridge sports hub slate / game open into SocialFeed (provider is a descendant).
 * `closeHubRef` dismisses the whole sports surface (slate + game) for feed/nav teardown.
 */
export default function LoungeSportsHubBridge({
  onHubOpenChange,
  onSlateOpenChange,
  onGameHubOpenChange,
  closeHubRef,
}) {
  const sports = useLoungeSportsFeed()

  useEffect(() => {
    if (!closeHubRef) return undefined
    closeHubRef.current = () => {
      if (sports?.slateOpen) sports.closeSlate?.()
      else sports?.closeHub?.()
    }
    return () => {
      closeHubRef.current = null
    }
  }, [closeHubRef, sports])

  useEffect(() => {
    onHubOpenChange?.(Boolean(sports?.hubGame || sports?.slateOpen))
  }, [onHubOpenChange, sports?.hubGame, sports?.slateOpen])

  useEffect(() => {
    onSlateOpenChange?.(Boolean(sports?.slateOpen))
  }, [onSlateOpenChange, sports?.slateOpen])

  useEffect(() => {
    onGameHubOpenChange?.(Boolean(sports?.hubGame))
  }, [onGameHubOpenChange, sports?.hubGame])

  return null
}
