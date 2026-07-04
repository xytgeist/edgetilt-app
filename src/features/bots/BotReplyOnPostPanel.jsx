import { useState } from 'react'
import BotPostRepliesPanel from './BotPostRepliesPanel.jsx'
import { fetchPostForBotReply } from './botPortalApi.js'
import { parsePostIdFromPortalInput } from './botPortalPostId.js'
import { formatBotPortalWhen } from './botPortalConstants.js'

function postAuthorLabel(post) {
  const p = post?.author_profile
  if (p?.handle) return `@${p.handle}`
  if (p?.display_name) return p.display_name
  return 'member'
}

export default function BotReplyOnPostPanel({
  botUserId,
  botHandle,
  supabaseClient,
  setToast,
  onReload,
}) {
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadedPost, setLoadedPost] = useState(null)

  const loadPost = async () => {
    const postId = parsePostIdFromPortalInput(input)
    if (!postId) {
      setToast?.('Paste a valid post UUID or Lounge link (?post=…).')
      return
    }
    setLoading(true)
    const { data, error } = await fetchPostForBotReply(supabaseClient, postId)
    setLoading(false)
    if (error || !data) {
      setLoadedPost(null)
      setToast?.(error?.message || 'Post not found.')
      return
    }
    setLoadedPost(data)
    setInput(postId)
  }

  const clearLoaded = () => {
    setLoadedPost(null)
    setInput('')
  }

  return (
    <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/90 p-4">
      <div className="text-white font-bold text-sm mb-1">Reply on any post</div>
      <div className="text-zinc-500 text-[11px] mb-3 leading-relaxed">
        Paste a Lounge share link or post UUID, load the thread, then reply as @{botHandle || 'bot'}.
        Works on member posts and Scott&apos;s posts.
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Post UUID or https://…?post=…"
          className="min-w-0 flex-1 rounded-xl border border-zinc-700/80 bg-zinc-950/60 px-3 py-2 text-white text-xs focus:border-cyan-500/50 focus:outline-none"
        />
        <button
          type="button"
          disabled={loading || !input.trim()}
          onClick={() => void loadPost()}
          className="shrink-0 min-h-9 rounded-xl bg-zinc-800 px-4 text-white text-xs font-bold hover:bg-zinc-700 disabled:opacity-50"
        >
          {loading ? 'Loading…' : 'Load post'}
        </button>
        {loadedPost ? (
          <button
            type="button"
            onClick={clearLoaded}
            className="shrink-0 min-h-9 rounded-xl border border-zinc-700 px-4 text-zinc-300 text-xs font-semibold hover:text-white"
          >
            Clear
          </button>
        ) : null}
      </div>

      {loadedPost ? (
        <div className="mt-4 rounded-xl border border-cyan-900/40 bg-zinc-950/50 px-3 py-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-[10px] text-zinc-500">
              <span className="text-zinc-300 font-semibold">{postAuthorLabel(loadedPost)}</span>
              <span className="mx-1">·</span>
              {formatBotPortalWhen(loadedPost.created_at)}
              <span className="mx-1">·</span>
              <span className="font-mono text-zinc-600">{loadedPost.id}</span>
            </div>
          </div>
          <div className="text-zinc-300 text-xs mt-2 leading-relaxed whitespace-pre-wrap line-clamp-6">
            {loadedPost.caption || '(no caption)'}
          </div>
          <BotPostRepliesPanel
            key={loadedPost.id}
            postId={loadedPost.id}
            botUserId={botUserId}
            botHandle={botHandle}
            commentCount={loadedPost.comment_count}
            supabaseClient={supabaseClient}
            setToast={setToast}
            onReload={onReload}
            defaultOpen
          />
        </div>
      ) : null}
    </div>
  )
}
