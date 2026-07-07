import { useCallback, useEffect, useState } from 'react'
import { formatBotPortalWhen } from './botPortalConstants.js'
import {
  fetchEditorialInbox,
  invokeLoungeBotPublishDue,
  invokeLoungeXIngest,
  updateEditorialQueueRow,
} from './botPortalApi.js'
import { LOUNGE_CAPTION_MAX } from '../../utils/loungeCommentLimits.js'

function scheduleIsoMinutesFromNow(minutes) {
  return new Date(Date.now() + minutes * 60_000).toISOString()
}

export default function BotEditorialInbox({ supabaseClient, bots, onReload, setToast }) {
  const [status, setStatus] = useState('pending_review')
  const [botFilter, setBotFilter] = useState('')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [editId, setEditId] = useState('')
  const [editCaption, setEditCaption] = useState('')
  const [ingestTweetUrl, setIngestTweetUrl] = useState('')
  const [ingestTweetText, setIngestTweetText] = useState('')

  const xBots = (bots || []).filter((b) => b.pipeline === 'x' || b.review_mode === 'editorial')
  const filteredBot = botFilter ? bots.find((b) => b.user_id === botFilter) : null

  const load = useCallback(async () => {
    if (!supabaseClient) return
    setLoading(true)
    const { data, error } = await fetchEditorialInbox(
      supabaseClient,
      status,
      botFilter || null,
    )
    setLoading(false)
    if (error) {
      setToast?.(error.message || 'Inbox load failed.')
      setRows([])
      return
    }
    setRows(Array.isArray(data) ? data : [])
  }, [supabaseClient, status, botFilter, setToast])

  useEffect(() => {
    void load()
  }, [load])

  const saveDraft = async (id, caption) => {
    setBusy(`save-${id}`)
    const { error } = await updateEditorialQueueRow(supabaseClient, id, { draft_caption: caption })
    setBusy('')
    if (error) {
      setToast?.(error.message || 'Save failed.')
      return
    }
    setEditId('')
    setToast?.('Draft saved.')
    void load()
  }

  const skipRow = async (id) => {
    setBusy(`skip-${id}`)
    const { error } = await updateEditorialQueueRow(supabaseClient, id, {
      status: 'skipped',
      skip_reason: 'Skipped from portal',
    })
    setBusy('')
    if (error) {
      setToast?.(error.message || 'Skip failed.')
      return
    }
    setToast?.('Skipped.')
    void load()
    void onReload?.()
  }

  const scheduleRow = async (id, minutes = 30) => {
    setBusy(`sched-${id}`)
    const { error } = await updateEditorialQueueRow(supabaseClient, id, {
      status: 'scheduled',
      scheduled_at: scheduleIsoMinutesFromNow(minutes),
    })
    setBusy('')
    if (error) {
      setToast?.(error.message || 'Schedule failed.')
      return
    }
    setToast?.(`Scheduled ~${minutes}m from now.`)
    void load()
    void onReload?.()
  }

  const publishNow = async (id) => {
    setBusy(`pub-${id}`)
    const { error } = await invokeLoungeBotPublishDue(supabaseClient, { queueId: id })
    setBusy('')
    if (error) {
      setToast?.(error.message || 'Publish failed.')
      return
    }
    setToast?.('Published.')
    void load()
    void onReload?.()
  }

  const runXIngest = async (slug) => {
    setBusy('x-ingest')
    const { data, error } = await invokeLoungeXIngest(supabaseClient, { slug })
    setBusy('')
    if (error) {
      setToast?.(error.message || 'X ingest failed.')
      return
    }
    setToast?.(`X ingest: ${data?.ingested ?? 0} new drafts.`)
    void load()
  }

  const transformTweetUrl = async () => {
    const slug = filteredBot?.slug
    const url = ingestTweetUrl.trim()
    if (!slug || !url) return
    setBusy('tweet-url')
    const { data, error } = await invokeLoungeXIngest(supabaseClient, {
      slug,
      tweetUrl: url,
      sourceText: ingestTweetText.trim() || undefined,
    })
    setBusy('')
    if (error) {
      setToast?.(error.message || 'Could not transform post.')
      return
    }
    if (data?.alreadyQueued) {
      setToast?.('That post is already in the editorial queue.')
    } else {
      setToast?.('Draft added to inbox.')
      setIngestTweetUrl('')
      setIngestTweetText('')
    }
    setStatus('pending_review')
    void load()
    void onReload?.()
  }

  const publishAllDue = async () => {
    setBusy('due')
    const { data, error } = await invokeLoungeBotPublishDue(supabaseClient, { publishDue: true })
    setBusy('')
    if (error) {
      setToast?.(error.message || 'Publish due failed.')
      return
    }
    setToast?.(`Published ${data?.published ?? 0} due posts.`)
    void load()
    void onReload?.()
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/90 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div>
            <div className="text-white font-bold text-sm">X editorial inbox</div>
            <div className="text-zinc-500 text-xs mt-0.5">Review, edit, schedule, or publish X-tracker drafts</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={() => void publishAllDue()}
              className="min-h-8 rounded-lg bg-zinc-800 px-3 text-zinc-200 text-[11px] font-semibold disabled:opacity-50"
            >
              Publish due
            </button>
            {xBots[0] ? (
              <button
                type="button"
                disabled={Boolean(busy)}
                onClick={() =>
                  void runXIngest(
                    botFilter ? bots.find((b) => b.user_id === botFilter)?.slug : xBots[0].slug,
                  )
                }
                className="min-h-8 rounded-lg bg-violet-800 px-3 text-white text-[11px] font-bold disabled:opacity-50"
              >
                Ingest X now
              </button>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-3">
          {[
            { id: 'pending_review', label: 'Pending' },
            { id: 'scheduled', label: 'Scheduled' },
            { id: 'published', label: 'Published' },
            { id: 'skipped', label: 'Skipped' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatus(tab.id)}
              className={`rounded-lg px-3 py-1 text-[11px] font-semibold ring-1 ${
                status === tab.id
                  ? 'bg-cyan-950/50 text-cyan-200 ring-cyan-500/35'
                  : 'bg-zinc-950 text-zinc-400 ring-zinc-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
          <select
            value={botFilter}
            onChange={(e) => setBotFilter(e.target.value)}
            className="rounded-lg bg-zinc-950 border border-zinc-700 text-zinc-300 text-[11px] px-2 py-1"
          >
            <option value="">All X bots</option>
            {xBots.map((b) => (
              <option key={b.user_id} value={b.user_id}>
                {b.display_name || b.slug}
              </option>
            ))}
          </select>
        </div>

        {filteredBot?.pipeline === 'x' ? (
          <div className="flex flex-col gap-2 mb-3">
            <input
              type="url"
              value={ingestTweetUrl}
              placeholder={`https://x.com/handle/status/… (${filteredBot.display_name || filteredBot.slug})`}
              onChange={(e) => setIngestTweetUrl(e.target.value)}
              className="w-full min-w-0 rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-white text-sm"
            />
            <textarea
              value={ingestTweetText}
              rows={2}
              placeholder="Tweet text (optional — paste from X if API not configured)"
              onChange={(e) => setIngestTweetText(e.target.value)}
              className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-white text-sm leading-relaxed resize-y"
            />
            <button
              type="button"
              disabled={busy === 'tweet-url' || !ingestTweetUrl.trim()}
              onClick={() => void transformTweetUrl()}
              className="self-start min-h-9 rounded-xl bg-cyan-800 px-4 text-white text-[11px] font-bold disabled:opacity-50"
            >
              {busy === 'tweet-url' ? '…' : 'Transform post'}
            </button>
          </div>
        ) : null}

        {loading ? (
          <div className="edge-monitor-shimmer h-20 rounded-xl bg-zinc-800/60" />
        ) : rows.length === 0 ? (
          <div className="text-zinc-500 text-xs py-6 text-center">No items in this inbox view.</div>
        ) : (
          <ul className="space-y-3">
            {rows.map((row) => (
              <li key={row.id} className="rounded-xl border border-zinc-800/70 bg-zinc-950/50 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <div className="text-zinc-200 text-xs font-semibold">
                      {row.bot_display_name || row.bot_slug}
                      {row.x_handle ? ` · @${row.x_handle}` : ''}
                    </div>
                    <div className="text-zinc-600 text-[10px]">
                      {formatBotPortalWhen(row.created_at)}
                      {row.scheduled_at ? ` · scheduled ${formatBotPortalWhen(row.scheduled_at)}` : ''}
                    </div>
                  </div>
                  {status === 'pending_review' ? (
                    <div className="flex flex-wrap gap-2 shrink-0">
                      <button
                        type="button"
                        disabled={Boolean(busy)}
                        onClick={() => {
                          setEditId(row.id)
                          setEditCaption(row.draft_caption || '')
                        }}
                        className="text-cyan-400 text-[11px] font-semibold"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={Boolean(busy)}
                        onClick={() => void publishNow(row.id)}
                        className="text-emerald-400 text-[11px] font-semibold"
                      >
                        Publish now
                      </button>
                      <button
                        type="button"
                        disabled={Boolean(busy)}
                        onClick={() => void scheduleRow(row.id, 30)}
                        className="text-violet-300 text-[11px] font-semibold"
                      >
                        +30m
                      </button>
                      <button
                        type="button"
                        disabled={Boolean(busy)}
                        onClick={() => void scheduleRow(row.id, 120)}
                        className="text-violet-300 text-[11px] font-semibold"
                      >
                        +2h
                      </button>
                      <button
                        type="button"
                        disabled={Boolean(busy)}
                        onClick={() => void skipRow(row.id)}
                        className="text-red-400 text-[11px] font-semibold"
                      >
                        Skip
                      </button>
                    </div>
                  ) : null}
                </div>

                {row.source_text ? (
                  <div className="text-zinc-500 text-[11px] mb-2 line-clamp-3 border-l-2 border-zinc-700 pl-2">
                    Source: {row.source_text}
                    {row.source_url ? (
                      <>
                        {' '}
                        <a
                          href={row.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-cyan-500/90 hover:underline"
                        >
                          View on X
                        </a>
                      </>
                    ) : null}
                  </div>
                ) : null}

                {editId === row.id ? (
                  <div className="space-y-2">
                    <textarea
                      value={editCaption}
                      maxLength={LOUNGE_CAPTION_MAX}
                      rows={4}
                      onChange={(e) => setEditCaption(e.target.value)}
                      className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-white text-sm"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={busy === `save-${row.id}`}
                        onClick={() => void saveDraft(row.id, editCaption)}
                        className="min-h-8 rounded-lg bg-cyan-700 px-3 text-white text-[11px] font-bold"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditId('')}
                        className="min-h-8 rounded-lg bg-zinc-800 px-3 text-zinc-300 text-[11px]"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-zinc-300 text-sm leading-relaxed whitespace-pre-wrap">
                    {row.draft_caption}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
