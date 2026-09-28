import { useCallback, useEffect, useRef, useState } from 'react'
import {
  deleteGameChatMessage,
  fetchGameChatMessage,
  fetchGameChatMessages,
  GAME_CHAT_PAGE,
  sendGameChatMessage,
  subscribeGameChat,
} from './gameHubChatApi.js'
import { readGameHubCache, writeGameHubCache } from './gameHubCache.js'

/**
 * Per-game live chat state. Loads + subscribes as soon as the hub opens a game
 * so the Chat tab is already populated when tapped.
 */
export function useGameHubChat(supabaseClient, eventId) {
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [viewerId, setViewerId] = useState(null)
  const profilesRef = useRef(new Map())
  const eventRef = useRef(eventId)

  const commitMessages = useCallback((update) => {
    setMessages((prev) => {
      const next = typeof update === 'function' ? update(prev) : update
      if (next !== prev) writeGameHubCache(eventRef.current, { chat: next })
      return next
    })
  }, [])

  useEffect(() => {
    if (!supabaseClient) return undefined
    let alive = true
    void supabaseClient.auth.getSession().then(({ data }) => {
      if (alive) setViewerId(data?.session?.user?.id || null)
    })
    return () => {
      alive = false
    }
  }, [supabaseClient])

  const remember = useCallback((row) => {
    if (row?.user_id && row?.profile) profilesRef.current.set(row.user_id, row.profile)
    return row
  }, [])

  const upsert = useCallback(
    (row) => {
      if (!row?.id) return
      remember(row)
      commitMessages((prev) => {
        if (prev.some((m) => m.id === row.id)) return prev
        const next = [...prev, row].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
        return next.length > GAME_CHAT_PAGE * 2 ? next.slice(-GAME_CHAT_PAGE * 2) : next
      })
    },
    [remember, commitMessages],
  )

  useEffect(() => {
    eventRef.current = eventId
    const cached = readGameHubCache(eventId)?.chat
    setMessages(cached || [])
    setError('')
    if (!supabaseClient || !eventId) return undefined
    let alive = true
    setLoading(!cached)
    void fetchGameChatMessages(supabaseClient, eventId)
      .then((rows) => {
        if (!alive) return
        rows.forEach(remember)
        commitMessages(rows)
      })
      .catch((err) => {
        if (alive && !cached) setError(err?.message || 'Could not load chat.')
      })
      .finally(() => {
        if (alive) setLoading(false)
      })

    const unsubscribe = subscribeGameChat(supabaseClient, eventId, {
      onInsert: (row) => {
        if (!alive || !row?.id) return
        const known = profilesRef.current.get(row.user_id)
        if (known) {
          upsert({ ...row, profile: known })
          return
        }
        void fetchGameChatMessage(supabaseClient, row.id)
          .then((full) => {
            if (alive) upsert(full || row)
          })
          .catch(() => {
            if (alive) upsert(row)
          })
      },
      onDelete: (old) => {
        if (!alive || !old?.id) return
        commitMessages((prev) => prev.filter((m) => m.id !== old.id))
      },
    })
    return () => {
      alive = false
      unsubscribe()
    }
  }, [supabaseClient, eventId, remember, upsert, commitMessages])

  const send = useCallback(
    async (body) => {
      if (!supabaseClient || !eventId) return
      const row = await sendGameChatMessage(supabaseClient, eventId, body)
      if (row) upsert(row)
    },
    [supabaseClient, eventId, upsert],
  )

  const remove = useCallback(
    async (id) => {
      if (!supabaseClient || !id) return
      commitMessages((prev) => prev.filter((m) => m.id !== id))
      await deleteGameChatMessage(supabaseClient, id)
    },
    [supabaseClient, commitMessages],
  )

  return { messages, loading, error, viewerId, send, remove }
}
