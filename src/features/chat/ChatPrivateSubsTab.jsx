import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  fetchCreatorFanOffer,
  fetchMyCreatorFanSubscriptions,
  listCreatorFanPrivateSubs,
} from '../creatorFanSubs/creatorFanSubsApi.js'
import CreatorFanSubscribeModal from '../creatorFanSubs/CreatorFanSubscribeModal.jsx'
import { buildProvisionalFanRoom } from './chatApi.js'
import {
  profileAvatarInitials,
  profileAvatarToneClass,
} from '../profiles/profileGate.js'

/**
 * @param {{
 *   supabaseClient: import('@supabase/supabase-js').SupabaseClient,
 *   viewerUserId: string,
 *   onOpenRoom: (room: Record<string, unknown>, catalogRow: Record<string, unknown>) => void,
 *   onViewProfile?: ((userId: string) => void) | null,
 * }} props
 */
export default function ChatPrivateSubsTab({
  supabaseClient,
  viewerUserId,
  onOpenRoom,
  onViewProfile = null,
}) {
  const [search, setSearch] = useState('')
  const [rows, setRows] = useState(/** @type {any[]} */ ([]))
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const searchTimerRef = useRef(null)

  const [gateOpen, setGateOpen] = useState(false)
  const [gateOffer, setGateOffer] = useState(/** @type {Record<string, unknown> | null} */ (null))
  const [gateCreatorId, setGateCreatorId] = useState(/** @type {string | null} */ (null))
  const [gateSubscribed, setGateSubscribed] = useState(false)
  const [pendingOpenRow, setPendingOpenRow] = useState(/** @type {Record<string, unknown> | null} */ (null))

  const load = useCallback(async (q) => {
    if (!supabaseClient || !viewerUserId) {
      setRows([])
      setLoading(false)
      return
    }
    setErr('')
    setLoading(true)
    try {
      const data = await listCreatorFanPrivateSubs(supabaseClient, q)
      setRows(data)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not load Private Subs.')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [supabaseClient, viewerUserId])

  useEffect(() => {
    void load('')
  }, [load])

  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(() => {
      void load(search)
    }, 220)
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    }
  }, [search, load])

  useEffect(() => {
    const onBillingReturn = () => {
      void load(search)
      if (pendingOpenRow && gateCreatorId) {
        const row = pendingOpenRow
        setPendingOpenRow(null)
        setGateOpen(false)
        const room = buildProvisionalFanRoom(row, viewerUserId)
        onOpenRoom(room, row)
      }
    }
    window.addEventListener('edge:creator-fan-billing-return', onBillingReturn)
    return () => window.removeEventListener('edge:creator-fan-billing-return', onBillingReturn)
  }, [load, search, pendingOpenRow, gateCreatorId, viewerUserId, onOpenRoom])

  const openRow = useCallback(async (row) => {
    if (row.is_member) {
      const room = buildProvisionalFanRoom(row, viewerUserId)
      onOpenRoom(room, row)
      return
    }
    setGateCreatorId(String(row.creator_user_id))
    setPendingOpenRow(row)
    setGateOffer(null)
    setGateSubscribed(false)
    setGateOpen(true)
    try {
      const [offer, subs] = await Promise.all([
        fetchCreatorFanOffer(supabaseClient, String(row.creator_user_id)),
        fetchMyCreatorFanSubscriptions(supabaseClient),
      ])
      setGateOffer(offer)
      const subscribed = subs.some(
        (s) => s.creatorUserId === String(row.creator_user_id) && s.active,
      )
      setGateSubscribed(subscribed)
      if (subscribed) {
        setGateOpen(false)
        setPendingOpenRow(null)
        await load(search)
        const refreshed = (await listCreatorFanPrivateSubs(supabaseClient, search))
          .find((r) => r.room_id === row.room_id)
        if (refreshed?.is_member) {
          onOpenRoom(buildProvisionalFanRoom(refreshed, viewerUserId), refreshed)
        }
      }
    } catch {
      setGateOffer(null)
    }
  }, [supabaseClient, viewerUserId, onOpenRoom, load, search])

  const sortedRows = useMemo(() => rows, [rows])

  return (
    <div className="px-3 py-3" data-chat-private-subs>
      <p className="mb-3 text-[13px] leading-relaxed text-zinc-500">
        Private group chats with creators you support. Search by name, description, or keywords.
      </p>

      <label className="mb-3 block">
        <span className="sr-only">Search Private Subs</span>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search rooms…"
          className="w-full min-h-11 rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-[16px] text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
          autoComplete="off"
        />
      </label>

      {err ? (
        <div className="mb-3 rounded-xl border border-rose-500/45 bg-rose-950/25 px-3 py-2 text-[13px] text-rose-200">
          {err}
        </div>
      ) : null}

      {loading ? (
        <div className="py-12 text-center text-[14px] text-zinc-500">Loading…</div>
      ) : sortedRows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
          <div className="text-3xl">🔒</div>
          <p className="text-[15px] text-zinc-400">No Private Subs rooms match yet.</p>
        </div>
      ) : (
        <ul className="space-y-2 pb-4">
          {sortedRows.map((row) => {
            const joined = Boolean(row.is_member)
            const pillLabel = row.is_host ? 'Host' : joined ? 'Joined' : null
            const avatar = row.avatar_url || row.creator_avatar_url
            const handle = row.creator_handle ? `@${row.creator_handle}` : ''

            return (
              <li key={row.room_id}>
                <button
                  type="button"
                  onClick={() => void openRow(row)}
                  className={`flex w-full items-start gap-3 rounded-2xl border px-3 py-3 text-left touch-manipulation transition-colors ${
                    joined
                      ? 'border-cyan-500/30 bg-zinc-900/80 hover:bg-zinc-900'
                      : 'border-zinc-800 bg-zinc-900/50 hover:bg-zinc-900/70'
                  }`}
                >
                  <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-zinc-800">
                    {avatar ? (
                      <img src={String(avatar)} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span
                        className={`flex h-full w-full items-center justify-center text-[14px] font-bold ${profileAvatarToneClass(row.creator_user_id)}`}
                      >
                        {profileAvatarInitials(row.creator_display_name, row.creator_handle)}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[15px] font-bold text-zinc-100">
                          {row.title || 'Private Sub'}
                        </div>
                        {handle ? (
                          <div className="truncate text-[12px] text-zinc-500">{handle}</div>
                        ) : null}
                      </div>
                      {pillLabel ? (
                        <span className="chat-private-subs-member-pill shrink-0 rounded-full bg-cyan-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-cyan-300">
                          {pillLabel}
                        </span>
                      ) : null}
                      {joined && row.has_unread ? (
                        <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-cyan-400" aria-label="Unread" />
                      ) : null}
                    </div>
                    {row.description ? (
                      <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-zinc-400">
                        {row.description}
                      </p>
                    ) : null}
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <CreatorFanSubscribeModal
        open={gateOpen}
        onClose={() => {
          setGateOpen(false)
          setPendingOpenRow(null)
        }}
        supabaseClient={supabaseClient}
        offer={gateOffer}
        alreadySubscribed={gateSubscribed}
        postAlertsEnabled={false}
      />
    </div>
  )
}
