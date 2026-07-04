import { useEffect, useMemo, useState } from 'react'
import BotCreateWizard from './BotCreateWizard.jsx'
import BotEditorialInbox from './BotEditorialInbox.jsx'
import BotProfileEditor from './BotProfileEditor.jsx'
import {
  BOT_PIPELINE_LABELS,
  BOT_REVIEW_MODE_LABELS,
  BOT_RUN_STATES,
  botPollActionLabel,
  botRunStateBadgeClass,
  formatBotPortalWhen,
} from './botPortalConstants.js'
import {
  deleteBotPost,
  addBotXSource,
  invokeLoungeNewsPoll,
  invokeLoungeOddsIngest,
  invokeLoungeXIngest,
  saveBotSettings,
  toggleBotNewsSource,
  updateBotPostCaption,
} from './botPortalApi.js'
import { LOUNGE_CAPTION_MAX } from '../../utils/loungeCommentLimits.js'
import {
  LOUNGE_POST_CATEGORY_PILL_SLUGS,
  loungePostCategoryPillLabel,
} from '../../utils/loungePostCategoryPills.js'

function RunStateBadge({ runState }) {
  const meta = BOT_RUN_STATES.find((s) => s.id === runState) || BOT_RUN_STATES[2]
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ${botRunStateBadgeClass(meta.tone)}`}>
      {meta.label}
    </span>
  )
}

function NumberField({ label, value, min, max, onChange, hint = '' }) {
  return (
    <label className="block min-w-0">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{label}</div>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full rounded-xl border border-zinc-700/80 bg-zinc-950/60 px-3 py-2 text-white text-sm tabular-nums focus:border-cyan-500/50 focus:outline-none"
      />
      {hint ? <div className="text-zinc-600 text-[10px] mt-1">{hint}</div> : null}
    </label>
  )
}

function EditPostModal({ post, onClose, onSave, busy }) {
  const [caption, setCaption] = useState(post?.caption || '')
  useEffect(() => {
    setCaption(post?.caption || '')
  }, [post?.post_id, post?.caption])

  if (!post) return null
  return (
    <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-3 bg-black/70">
      <div className="w-full max-w-lg rounded-2xl border border-zinc-700 bg-zinc-900 p-4 shadow-2xl">
        <div className="text-white font-bold text-sm mb-2">Edit bot post</div>
        <textarea
          value={caption}
          maxLength={LOUNGE_CAPTION_MAX}
          rows={5}
          onChange={(e) => setCaption(e.target.value)}
          className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-white text-sm leading-relaxed resize-y focus:border-cyan-500/50 focus:outline-none"
        />
        <div className="text-zinc-500 text-[10px] mt-1 tabular-nums">
          {caption.length}/{LOUNGE_CAPTION_MAX}
        </div>
        <div className="mt-4 flex gap-2 justify-end">
          <button
            type="button"
            onClick={onClose}
            className="min-h-9 rounded-xl bg-zinc-800 px-4 text-zinc-200 text-xs font-semibold"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || !caption.trim()}
            onClick={() => onSave(caption.trim())}
            className="min-h-9 rounded-xl bg-cyan-700 px-4 text-white text-xs font-bold disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Save caption'}
          </button>
        </div>
      </div>
    </div>
  )
}

function BotDetailPanel({ bot, supabaseClient, onReload, toast, setToast }) {
  const [busy, setBusy] = useState('')
  const [editPost, setEditPost] = useState(null)
  const [draft, setDraft] = useState(null)
  const [newXHandle, setNewXHandle] = useState('')

  useEffect(() => {
    if (!bot) {
      setDraft(null)
      return
    }
    const watchlist = Array.isArray(bot.config?.watchlist_tickers)
      ? bot.config.watchlist_tickers.join(', ')
      : ''
    setDraft({
      maxPostsDay: bot.max_posts_per_day ?? 12,
      maxPostsHour: bot.max_posts_per_hour ?? 4,
      scoreThreshold: Number(bot.publish_score_threshold) || 55,
      displayName: bot.display_name || '',
      categoryPills: Array.isArray(bot.category_pills_default) ? [...bot.category_pills_default] : [],
      watchlistText: watchlist,
    })
  }, [bot?.user_id, bot?.max_posts_per_day, bot?.max_posts_per_hour, bot?.publish_score_threshold, bot?.display_name, bot?.category_pills_default, bot?.config])

  if (!bot || !draft) {
    return (
      <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/50 p-6 text-zinc-500 text-sm">
        Select a bot to manage settings, posts, and automation.
      </div>
    )
  }

  const pipelineLabel = BOT_PIPELINE_LABELS[bot.pipeline] || bot.pipeline
  const reviewLabel = BOT_REVIEW_MODE_LABELS[bot.review_mode] || bot.review_mode
  const isAutomatic = bot.review_mode === 'automatic'

  const setRunState = async (runState) => {
    setBusy(`run-${runState}`)
    const { error } = await saveBotSettings(supabaseClient, bot.user_id, { run_state: runState })
    setBusy('')
    if (error) {
      setToast(error.message || 'Could not update run state.')
      return
    }
    setToast(`Set ${bot.slug} → ${runState}`)
    void onReload()
  }

  const saveSettings = async () => {
    setBusy('save')
    const tickers = draft.watchlistText
      .split(/[,\s]+/)
      .map((t) => t.replace(/^\$/, '').trim().toUpperCase())
      .filter(Boolean)
    const patch = {
      display_name: draft.displayName.trim() || null,
      max_posts_per_day: draft.maxPostsDay,
      max_posts_per_hour: draft.maxPostsHour,
      publish_score_threshold: draft.scoreThreshold,
      category_pills_default: draft.categoryPills,
      config: { watchlist_tickers: tickers },
    }
    const { error } = await saveBotSettings(supabaseClient, bot.user_id, patch)
    setBusy('')
    if (error) {
      setToast(error.message || 'Save failed.')
      return
    }
    setToast('Settings saved.')
    void onReload()
  }

  const runPipeline = async (dryRun = false) => {
    setBusy(dryRun ? 'dry' : 'poll')
    let result = { data: null, error: null }

    if (bot.pipeline === 'market_news') {
      result = await invokeLoungeNewsPoll(supabaseClient, {
        slug: bot.slug,
        dryRun,
        force: true,
      })
    } else if (bot.pipeline === 'odds_api') {
      result = await invokeLoungeOddsIngest(supabaseClient, { slug: bot.slug, dryRun })
    } else if (bot.pipeline === 'x') {
      result = await invokeLoungeXIngest(supabaseClient, { slug: bot.slug, dryRun })
    } else {
      setBusy('')
      setToast(`${pipelineLabel} pipeline runner not wired yet.`)
      return
    }

    setBusy('')
    if (result.error) {
      setToast(result.error.message || 'Pipeline run failed.')
      return
    }
    const d = result.data || {}
    if (bot.pipeline === 'odds_api') {
      setToast(
        dryRun
          ? `Dry run: ${d.candidateCount ?? 0} candidates`
          : `Published ${d.published ?? 0} picks`,
      )
    } else if (bot.pipeline === 'x') {
      setToast(dryRun ? `Dry run: ${d.ingested ?? 0} drafts` : `Ingested ${d.ingested ?? 0} to inbox`)
    } else {
      setToast(
        dryRun
          ? `Dry run: ${d.candidateCount ?? 0} candidates`
          : `Published ${d.published ?? 0} · ingested ${d.ingested ?? 0}`,
      )
    }
    void onReload()
  }

  const togglePill = (slug) => {
    setDraft((d) => {
      const cur = d.categoryPills || []
      if (cur.includes(slug)) return { ...d, categoryPills: cur.filter((s) => s !== slug) }
      if (cur.length >= 3) return d
      return { ...d, categoryPills: [...cur, slug] }
    })
  }

  const handleSavePost = async (caption) => {
    setBusy('edit-post')
    const { error } = await updateBotPostCaption(supabaseClient, editPost.post_id, caption)
    setBusy('')
    if (error) {
      setToast(error.message || 'Could not update post.')
      return
    }
    setEditPost(null)
    setToast('Post updated.')
    void onReload()
  }

  const handleDeletePost = async (postId) => {
    if (!window.confirm('Delete this bot post from the feed?')) return
    setBusy(`del-${postId}`)
    const { error } = await deleteBotPost(supabaseClient, postId)
    setBusy('')
    if (error) {
      setToast(error.message || 'Delete failed.')
      return
    }
    setToast('Post deleted.')
    void onReload()
  }

  const toggleSource = async (sourceId, enabled) => {
    setBusy(`src-${sourceId}`)
    const { error } = await toggleBotNewsSource(supabaseClient, sourceId, enabled)
    setBusy('')
    if (error) {
      setToast(error.message || 'Source toggle failed.')
      return
    }
    void onReload()
  }

  const addXHandle = async () => {
    const handle = newXHandle.replace(/^@/, '').trim()
    if (!handle) return
    setBusy('add-x')
    const { error } = await addBotXSource(supabaseClient, bot.user_id, handle)
    setBusy('')
    if (error) {
      setToast(error.message || 'Could not add X handle.')
      return
    }
    setNewXHandle('')
    setToast(`Added @${handle}`)
    void onReload()
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/90 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-white font-bold text-lg truncate">
                {bot.display_name || bot.slug}
              </div>
              <RunStateBadge runState={bot.run_state} />
            </div>
            <div className="text-zinc-500 text-xs mt-1">
              @{bot.handle || 'no-handle'} · {pipelineLabel} · {reviewLabel}
            </div>
            <div className="text-zinc-600 text-[10px] mt-1 font-mono truncate">{bot.user_id}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            {BOT_RUN_STATES.map((state) => (
              <button
                key={state.id}
                type="button"
                disabled={Boolean(busy) || bot.run_state === state.id}
                onClick={() => void setRunState(state.id)}
                title={state.hint}
                className={`min-h-8 rounded-lg px-3 text-[11px] font-semibold ring-1 disabled:opacity-40 ${
                  bot.run_state === state.id
                    ? botRunStateBadgeClass(state.tone)
                    : 'bg-zinc-800/80 text-zinc-300 ring-zinc-600/50 hover:bg-zinc-700'
                }`}
              >
                {state.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { label: 'Posts today', value: bot.posts_today },
            { label: 'Posts / hour', value: bot.posts_last_hour },
            { label: 'Last poll', value: formatBotPortalWhen(bot.last_poll_at) },
            { label: 'Last publish', value: formatBotPortalWhen(bot.last_publish_at) },
          ].map((item) => (
            <div key={item.label} className="rounded-xl bg-zinc-950/50 border border-zinc-800/70 px-3 py-2">
              <div className="text-[10px] uppercase text-zinc-500">{item.label}</div>
              <div className="text-white text-sm font-bold mt-0.5 tabular-nums truncate">{item.value ?? '—'}</div>
            </div>
          ))}
        </div>

        {isAutomatic ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={() => void runPipeline(true)}
              className="min-h-8 rounded-lg bg-zinc-800 px-3 text-zinc-200 text-[11px] font-semibold disabled:opacity-50"
            >
              Dry run
            </button>
            <button
              type="button"
              disabled={Boolean(busy) || bot.run_state !== 'running'}
              onClick={() => void runPipeline(false)}
              className="min-h-8 rounded-lg bg-gradient-to-r from-cyan-700 to-violet-700 px-3 text-white text-[11px] font-bold disabled:opacity-50"
            >
              {busy === 'poll' ? 'Running…' : botPollActionLabel(bot.pipeline)}
            </button>
          </div>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={Boolean(busy) || bot.run_state !== 'running'}
              onClick={() => void runPipeline(false)}
              className="min-h-8 rounded-lg bg-violet-800 px-3 text-white text-[11px] font-bold disabled:opacity-50"
            >
              {busy ? '…' : 'Ingest X → inbox'}
            </button>
            <span className="text-zinc-500 text-xs self-center">
              Review drafts in the Editorial tab
              {(bot.pending_review ?? 0) > 0 ? ` (${bot.pending_review} pending)` : ''}
            </span>
          </div>
        )}
      </div>

      <BotProfileEditor
        bot={bot}
        supabaseClient={supabaseClient}
        onReload={onReload}
        setToast={setToast}
        busy={busy}
        setBusy={setBusy}
      />

      <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/90 p-4">
        <div className="text-white font-bold text-sm mb-3">Settings</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <label className="block sm:col-span-2 lg:col-span-1">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Display name</div>
            <input
              type="text"
              value={draft.displayName}
              onChange={(e) => setDraft((d) => ({ ...d, displayName: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-zinc-700/80 bg-zinc-950/60 px-3 py-2 text-white text-sm focus:border-cyan-500/50 focus:outline-none"
            />
          </label>
          <NumberField
            label="Max posts / day"
            value={draft.maxPostsDay}
            min={1}
            max={100}
            onChange={(v) => setDraft((d) => ({ ...d, maxPostsDay: v }))}
          />
          <NumberField
            label="Max posts / hour"
            value={draft.maxPostsHour}
            min={1}
            max={30}
            onChange={(v) => setDraft((d) => ({ ...d, maxPostsHour: v }))}
          />
          {isAutomatic ? (
            <NumberField
              label="Publish score min"
              value={draft.scoreThreshold}
              min={0}
              max={100}
              hint="Headlines below this score are skipped"
              onChange={(v) => setDraft((d) => ({ ...d, scoreThreshold: v }))}
            />
          ) : null}
        </div>

        <div className="mt-4">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 mb-2">
            Default category pills (max 3)
          </div>
          <div className="flex flex-wrap gap-2">
            {LOUNGE_POST_CATEGORY_PILL_SLUGS.map((slug) => {
              const selected = draft.categoryPills.includes(slug)
              return (
                <button
                  key={slug}
                  type="button"
                  onClick={() => togglePill(slug)}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${
                    selected
                      ? 'bg-cyan-950/60 text-cyan-200 ring-cyan-500/40'
                      : 'bg-zinc-950/50 text-zinc-400 ring-zinc-700 hover:text-zinc-200'
                  }`}
                >
                  {loungePostCategoryPillLabel(slug) || slug}
                </button>
              )
            })}
          </div>
        </div>

        {bot.pipeline === 'market_news' ? (
          <label className="block mt-4">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
              Watchlist tickers (comma or space separated)
            </div>
            <textarea
              value={draft.watchlistText}
              rows={2}
              onChange={(e) => setDraft((d) => ({ ...d, watchlistText: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-zinc-700/80 bg-zinc-950/60 px-3 py-2 text-white text-sm font-mono focus:border-cyan-500/50 focus:outline-none"
              placeholder="AAPL, NVDA, SPY, QQQ"
            />
          </label>
        ) : null}

        <button
          type="button"
          disabled={busy === 'save'}
          onClick={() => void saveSettings()}
          className="mt-4 min-h-10 rounded-xl bg-cyan-700 px-5 text-white text-sm font-bold hover:bg-cyan-600 disabled:opacity-50"
        >
          {busy === 'save' ? 'Saving…' : 'Save settings'}
        </button>
      </div>

      {Array.isArray(bot.sources) && bot.sources.length > 0 ? (
        <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/90 p-4">
          <div className="text-white font-bold text-sm mb-3">News sources</div>
          <ul className="space-y-2">
            {bot.sources.map((src) => (
              <li
                key={src.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-800/70 bg-zinc-950/40 px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="text-zinc-200 text-xs font-semibold">{src.name}</div>
                  <div className="text-zinc-600 text-[10px]">
                    {src.kind} · every {src.poll_interval_sec}s · last {formatBotPortalWhen(src.last_polled_at)}
                  </div>
                  {src.last_error ? (
                    <div className="text-amber-400/90 text-[10px] mt-0.5 truncate">{src.last_error}</div>
                  ) : null}
                </div>
                <button
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={() => void toggleSource(src.id, !src.enabled)}
                  className={`shrink-0 rounded-lg px-2.5 py-1 text-[10px] font-bold ring-1 ${
                    src.enabled
                      ? 'bg-emerald-950/50 text-emerald-200 ring-emerald-500/35'
                      : 'bg-zinc-800 text-zinc-400 ring-zinc-600/50'
                  }`}
                >
                  {src.enabled ? 'On' : 'Off'}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {bot.pipeline === 'x' ? (
        <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/90 p-4">
          <div className="text-white font-bold text-sm mb-3">X handles</div>
          {Array.isArray(bot.x_sources) && bot.x_sources.length > 0 ? (
            <ul className="space-y-2 mb-3">
              {bot.x_sources.map((src) => (
                <li
                  key={src.id}
                  className="rounded-xl border border-zinc-800/70 bg-zinc-950/40 px-3 py-2 text-xs"
                >
                  <span className="text-zinc-200 font-semibold">@{src.x_handle}</span>
                  <span className="text-zinc-600 ml-2">
                    last {formatBotPortalWhen(src.last_polled_at)}
                  </span>
                  {src.last_error ? (
                    <div className="text-amber-400/90 text-[10px] mt-0.5 truncate">{src.last_error}</div>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-zinc-500 text-xs mb-3">No handles yet.</div>
          )}
          <div className="flex gap-2">
            <input
              type="text"
              value={newXHandle}
              placeholder="@handle"
              onChange={(e) => setNewXHandle(e.target.value)}
              className="flex-1 min-w-0 rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-white text-sm"
            />
            <button
              type="button"
              disabled={busy === 'add-x' || !newXHandle.trim()}
              onClick={() => void addXHandle()}
              className="shrink-0 min-h-9 rounded-xl bg-violet-800 px-4 text-white text-xs font-bold disabled:opacity-50"
            >
              Add
            </button>
          </div>
        </div>
      ) : null}

      <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/90 p-4">
        <div className="text-white font-bold text-sm mb-3">Feed posts</div>
        {Array.isArray(bot.recent_posts) && bot.recent_posts.length > 0 ? (
          <ul className="space-y-2">
            {bot.recent_posts.map((post) => (
              <li
                key={post.post_id}
                className="rounded-xl border border-zinc-800/70 bg-zinc-950/40 px-3 py-2"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="text-zinc-500 text-[10px]">
                    {formatBotPortalWhen(post.created_at)}
                    {post.edited_at ? ' · edited' : ''}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setEditPost(post)}
                      className="text-cyan-400 text-[11px] font-semibold hover:text-cyan-300"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      disabled={busy === `del-${post.post_id}`}
                      onClick={() => void handleDeletePost(post.post_id)}
                      className="text-red-400 text-[11px] font-semibold hover:text-red-300 disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </div>
                </div>
                <div className="text-zinc-300 text-xs mt-1 leading-relaxed whitespace-pre-wrap">{post.caption}</div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-zinc-500 text-xs">No posts yet.</div>
        )}
      </div>

      <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/90 p-4">
        <div className="text-white font-bold text-sm mb-3">Automation log</div>
        {Array.isArray(bot.recent_log) && bot.recent_log.length > 0 ? (
          <ul className="space-y-1.5 max-h-64 overflow-y-auto">
            {bot.recent_log.map((row) => (
              <li key={row.id} className="text-[11px] text-zinc-400 font-mono leading-snug">
                <span className="text-zinc-600">{formatBotPortalWhen(row.created_at)}</span>{' '}
                <span
                  className={
                    row.status === 'published'
                      ? 'text-emerald-400'
                      : row.status === 'failed'
                        ? 'text-red-400'
                        : 'text-zinc-500'
                  }
                >
                  {row.status}
                </span>{' '}
                {row.score != null ? `score ${row.score} · ` : ''}
                {row.caption || row.error_message || ''}
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-zinc-500 text-xs">No log entries.</div>
        )}
      </div>

      <EditPostModal
        post={editPost}
        onClose={() => setEditPost(null)}
        onSave={handleSavePost}
        busy={busy === 'edit-post'}
      />
    </div>
  )
}

/**
 * Admin bot management portal — all Lounge bots.
 */
export default function BotManagementPortal({
  supabaseClient,
  snapshot,
  loading,
  error,
  onReload,
  onBack,
}) {
  const bots = useMemo(() => (Array.isArray(snapshot?.bots) ? snapshot.bots : []), [snapshot])
  const [portalTab, setPortalTab] = useState('manage')
  const [wizardOpen, setWizardOpen] = useState(false)
  const [selectedId, setSelectedId] = useState('')
  const [toast, setToast] = useState('')

  const pendingTotal = snapshot?.editorial_pending ?? 0

  useEffect(() => {
    if (!bots.length) {
      setSelectedId('')
      return
    }
    if (!selectedId || !bots.some((b) => b.user_id === selectedId)) {
      setSelectedId(bots[0].user_id)
    }
  }, [bots, selectedId])

  const selectedBot = bots.find((b) => b.user_id === selectedId) || null

  useEffect(() => {
    if (!toast) return undefined
    const id = window.setTimeout(() => setToast(''), 4000)
    return () => window.clearTimeout(id)
  }, [toast])

  return (
    <div data-bot-portal className="min-h-0">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-white text-2xl font-black tracking-tight">Bot Portal</div>
          <div className="text-zinc-400 text-sm mt-0.5">
            Run, pause, tune caps, edit posts — all Lounge bots
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="min-h-9 rounded-xl bg-zinc-800/80 px-3 text-zinc-200 text-xs font-semibold"
            >
              ← Back
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setWizardOpen(true)}
            className="min-h-9 rounded-xl bg-gradient-to-r from-cyan-700 to-violet-700 px-4 text-white text-xs font-bold"
          >
            + Create bot
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => void onReload?.()}
            className="min-h-9 rounded-xl bg-zinc-800/80 px-3 text-zinc-200 text-xs font-semibold disabled:opacity-50"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="mb-4 flex gap-2">
        <button
          type="button"
          onClick={() => setPortalTab('manage')}
          className={`min-h-9 rounded-xl px-4 text-xs font-bold ring-1 ${
            portalTab === 'manage'
              ? 'bg-cyan-950/50 text-cyan-200 ring-cyan-500/35'
              : 'bg-zinc-900 text-zinc-400 ring-zinc-700'
          }`}
        >
          Manage bots
        </button>
        <button
          type="button"
          onClick={() => setPortalTab('editorial')}
          className={`min-h-9 rounded-xl px-4 text-xs font-bold ring-1 ${
            portalTab === 'editorial'
              ? 'bg-violet-950/50 text-violet-200 ring-violet-500/35'
              : 'bg-zinc-900 text-zinc-400 ring-zinc-700'
          }`}
        >
          Editorial inbox
          {pendingTotal > 0 ? ` (${pendingTotal})` : ''}
        </button>
      </div>

      {error ? (
        <div className="mb-4 rounded-2xl border border-amber-500/30 bg-amber-950/30 px-4 py-3 text-amber-100 text-sm">
          {error}
          <div className="text-amber-200/70 text-xs mt-1">
            Apply migrations <span className="font-mono">20260703140000</span> through{' '}
            <span className="font-mono">20260703160000</span>.
          </div>
        </div>
      ) : null}

      {toast ? (
        <div className="mb-4 rounded-xl bg-cyan-950/40 border border-cyan-500/30 px-3 py-2 text-cyan-100 text-xs">
          {toast}
        </div>
      ) : null}

      {!loading && bots.length === 0 && portalTab === 'manage' ? (
        <div className="rounded-2xl border border-zinc-700/80 bg-zinc-900/50 p-5 text-zinc-400 text-sm leading-relaxed">
          No bots yet. Tap <span className="text-white font-semibold">+ Create bot</span> to launch the wizard.
        </div>
      ) : null}

      {portalTab === 'editorial' ? (
        <BotEditorialInbox
          supabaseClient={supabaseClient}
          bots={bots}
          onReload={onReload}
          setToast={setToast}
        />
      ) : null}

      {portalTab === 'manage' && bots.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)] gap-4">
          <aside className="rounded-2xl border border-zinc-800/80 bg-zinc-900/90 p-2 lg:sticky lg:top-4 lg:self-start">
            <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-zinc-500">Bots</div>
            <ul className="space-y-1">
              {bots.map((bot) => {
                const active = bot.user_id === selectedId
                return (
                  <li key={bot.user_id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(bot.user_id)}
                      className={`w-full text-left rounded-xl px-3 py-2.5 transition-colors ${
                        active ? 'bg-cyan-950/50 ring-1 ring-cyan-500/30' : 'hover:bg-zinc-800/60'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-white text-sm font-semibold truncate">
                          {bot.display_name || bot.slug}
                        </span>
                        <RunStateBadge runState={bot.run_state} />
                      </div>
                      <div className="text-zinc-500 text-[10px] mt-0.5 truncate">
                        {BOT_PIPELINE_LABELS[bot.pipeline] || bot.pipeline}
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          </aside>

          <BotDetailPanel
            bot={selectedBot}
            supabaseClient={supabaseClient}
            onReload={onReload}
            toast={toast}
            setToast={setToast}
          />
        </div>
      ) : null}

      <BotCreateWizard
        supabaseClient={supabaseClient}
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onCreated={() => {
          setToast('Bot created. Set Running when ready.')
          void onReload?.()
        }}
      />
    </div>
  )
}
