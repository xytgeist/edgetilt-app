import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchBotPostComments, postBotComment } from './botPortalApi.js'
import { formatBotPortalWhen } from './botPortalConstants.js'
import { LOUNGE_CAPTION_SUBSCRIBER_MAX } from '../../utils/loungeCommentLimits.js'

async function hydrateCommentsWithProfiles(supabaseClient, rows) {
  const list = rows || []
  const authorIds = [...new Set(list.map((r) => String(r.user_id || '')).filter(Boolean))]
  let profileBy = {}
  if (authorIds.length > 0) {
    const { data, error } = await supabaseClient
      .from('profiles')
      .select('user_id, handle, display_name, avatar_url, is_bot')
      .in('user_id', authorIds)
    if (!error && data) {
      profileBy = Object.fromEntries(data.map((p) => [p.user_id, p]))
    }
  }
  return list.map((r) => ({ ...r, author_profile: profileBy[r.user_id] || null }))
}

function commentAuthorLabel(comment) {
  const p = comment?.author_profile
  if (p?.handle) return `@${p.handle}`
  if (p?.display_name) return p.display_name
  return 'user'
}

export default function BotPostRepliesPanel({
  postId,
  botUserId,
  botHandle,
  commentCount = 0,
  supabaseClient,
  setToast,
  onReload,
  defaultOpen = false,
}) {
  const [open, setOpen] = useState(defaultOpen)
  const [loading, setLoading] = useState(false)
  const [comments, setComments] = useState([])
  const [replyBody, setReplyBody] = useState('')
  const [replyParentId, setReplyParentId] = useState(null)
  const [busy, setBusy] = useState(false)

  const commentById = useMemo(
    () => new Map(comments.map((c) => [String(c.id), c])),
    [comments],
  )

  const load = useCallback(async () => {
    if (!supabaseClient || !postId) return
    setLoading(true)
    const { data, error } = await fetchBotPostComments(supabaseClient, postId)
    if (error) {
      setLoading(false)
      setToast?.(error.message || 'Could not load replies.')
      setComments([])
      return
    }
    const hydrated = await hydrateCommentsWithProfiles(supabaseClient, data || [])
    setComments(hydrated)
    setLoading(false)
  }, [postId, supabaseClient, setToast])

  useEffect(() => {
    if (!open) return undefined
    void load()
    return undefined
  }, [open, load])

  const submitReply = async () => {
    const body = replyBody.trim()
    if (!body) return
    setBusy(true)
    const { error } = await postBotComment(supabaseClient, {
      botUserId,
      postId,
      body,
      parentId: replyParentId,
    })
    setBusy(false)
    if (error) {
      setToast?.(error.message || 'Reply failed.')
      return
    }
    setReplyBody('')
    setReplyParentId(null)
    setToast?.(`Posted as @${botHandle || 'bot'}.`)
    void load()
    void onReload?.()
  }

  const replyTarget = replyParentId ? commentById.get(String(replyParentId)) : null

  return (
    <div className="mt-2 border-t border-zinc-800/70 pt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-cyan-400 text-[11px] font-semibold hover:text-cyan-300"
      >
        {open ? 'Hide replies' : `Replies (${commentCount ?? comments.length ?? 0})`}
      </button>

      {open ? (
        <div className="mt-2 space-y-2">
          {loading ? (
            <div className="text-zinc-500 text-[11px]">Loading replies…</div>
          ) : comments.length === 0 ? (
            <div className="text-zinc-600 text-[11px]">No replies yet.</div>
          ) : (
            <ul className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {comments.map((comment) => {
                const isBot = String(comment.user_id) === String(botUserId)
                const isReply = Boolean(comment.parent_id)
                const parent = comment.parent_id
                  ? commentById.get(String(comment.parent_id))
                  : null
                return (
                  <li
                    key={comment.id}
                    className={`rounded-lg border px-2.5 py-2 ${
                      isReply
                        ? 'ml-4 border-zinc-800/50 bg-zinc-950/30'
                        : 'border-zinc-800/70 bg-zinc-950/50'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-[10px] text-zinc-500">
                        <span className={isBot ? 'text-cyan-300 font-semibold' : 'text-zinc-300 font-semibold'}>
                          {commentAuthorLabel(comment)}
                        </span>
                        <span className="mx-1">·</span>
                        {formatBotPortalWhen(comment.created_at)}
                        {parent ? (
                          <span className="text-zinc-600 ml-1">
                            replying to {commentAuthorLabel(parent)}
                          </span>
                        ) : null}
                      </div>
                      <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            setReplyParentId(comment.id)
                            setReplyBody('')
                          }}
                          className="text-cyan-400 text-[10px] font-semibold hover:text-cyan-300 disabled:opacity-50"
                        >
                          Reply as bot
                        </button>
                    </div>
                    <div className="text-zinc-300 text-xs mt-1 leading-relaxed whitespace-pre-wrap">
                      {comment.body}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}

          <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/60 p-2.5">
            {replyTarget ? (
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <div className="text-[10px] text-zinc-500">
                  Replying to {commentAuthorLabel(replyTarget)}
                </div>
                <button
                  type="button"
                  onClick={() => setReplyParentId(null)}
                  className="text-zinc-400 text-[10px] font-semibold hover:text-zinc-200"
                >
                  Cancel reply target
                </button>
              </div>
            ) : (
              <div className="text-[10px] text-zinc-500 mb-2">
                Post as @{botHandle || 'bot'}
              </div>
            )}
            <textarea
              value={replyBody}
              maxLength={LOUNGE_CAPTION_SUBSCRIBER_MAX}
              rows={3}
              onChange={(e) => setReplyBody(e.target.value)}
              placeholder="Write a reply…"
              className="w-full rounded-lg border border-zinc-700/80 bg-zinc-950 px-2.5 py-2 text-white text-xs leading-relaxed resize-y focus:border-cyan-500/50 focus:outline-none"
            />
            <div className="mt-2 flex items-center justify-between gap-2">
              <div className="text-zinc-600 text-[10px] tabular-nums">
                {replyBody.length}/{LOUNGE_CAPTION_SUBSCRIBER_MAX}
              </div>
              <button
                type="button"
                disabled={busy || !replyBody.trim()}
                onClick={() => void submitReply()}
                className="min-h-8 rounded-lg bg-cyan-700 px-3 text-white text-[11px] font-bold disabled:opacity-50"
              >
                {busy ? 'Posting…' : 'Post reply'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
