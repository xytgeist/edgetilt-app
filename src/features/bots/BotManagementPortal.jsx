import { useCallback, useEffect, useMemo, useState } from 'react'
import BotCreateWizard from './BotCreateWizard.jsx'
import BotEditorialInbox from './BotEditorialInbox.jsx'
import BotPostRepliesPanel from './BotPostRepliesPanel.jsx'
import BotReplyOnPostPanel from './BotReplyOnPostPanel.jsx'
import BotProfileEditor from './BotProfileEditor.jsx'
import BotSportsCalendarPanel from './BotSportsCalendarPanel.jsx'
import {
  BOT_PIPELINE_LABELS,
  BOT_REVIEW_MODE_LABELS,
  BOT_RUN_STATES,
  DEFAULT_ODDS_ALERT_AUDIENCE,
  ODDS_ALERT_AUDIENCE_ROWS,
  botPollActionLabel,
  botRunStateBadgeClass,
  formatBotPortalWhen,
} from './botPortalConstants.js'
import {
  deleteBotPost,
  addBotXSource,
  fetchSportsBettingCalendarToday,
  publishBotPost,
  invokeLoungeNewsPoll,
  invokeLoungeOddsIngest,
  invokeLoungeOddsPoll,
  invokeLoungeOddsPublishExamples,
  invokeLoungeXIngest,
  saveBotSettings,
  toggleBotNewsSource,
  updateBotPostCaption,
  waitForPgNetRequestResult,
} from './botPortalApi.js'
import { SCOTT_EXAMPLE_POST_COUNT } from './scottExamplePosts.js'
import { LOUNGE_CAPTION_MAX, LOUNGE_CAPTION_SUBSCRIBER_MAX } from '../../utils/loungeCommentLimits.js'
import {
  LOUNGE_POST_CATEGORY_PILL_SLUGS,
  loungePostCategoryPillLabel,
} from '../../utils/loungePostCategoryPills.js'

const X_BOT_VOICE_PLACEHOLDER =
  'Explain each tweet in plain English for a layperson. Keep it accurate, vivid, and on-brand for this bot.'

const SCOTT_ASYNC_TOAST =
  'Still running in the background (up to ~3 min). Refresh this panel for Last poll and new Lounge posts.'

const SCOTT_ASYNC_WORKING_TOAST = 'Scott is working…'

const SCOTT_POLL_ACTION_LABELS = {
  daily_slates: 'Coffee & Covers',
  poll_edges: 'Scan all · edge',
  best_bet_hour: 'Best bet · hour',
  value_bet_radar: 'Value radar',
}

function scheduleBotReload(onReload, delayMs = 45_000) {
  window.setTimeout(() => {
    void onReload()
  }, delayMs)
}

/** Wait for pg_net Edge response after async queue RPC; returns merged outcome or original queued payload. */
async function awaitScottQueueOutcome(supabaseClient, data, setToastMsg) {
  if (!data?.asyncQueued || data.request_id == null) return data
  setToastMsg(SCOTT_ASYNC_WORKING_TOAST)
  const waited = await waitForPgNetRequestResult(supabaseClient, data.request_id)
  if (waited.error) {
    return { ...data, _pollError: waited.error.message }
  }
  if (!waited.ready) {
    return data
  }
  const envelope = waited.result || {}
  const body = envelope.body && typeof envelope.body === 'object' ? envelope.body : {}
  if (envelope.status_code >= 400 || body.error || body.code === 'BOOT_ERROR') {
    const bootMsg = body.code === 'BOOT_ERROR'
      ? 'Scott poll worker failed to start on Edge (BOOT_ERROR). Redeploy lounge-odds-poll or check function logs.'
      : null
    return {
      asyncQueued: false,
      _httpError: String(
        bootMsg || body.error || body.message || envelope.error_msg || `HTTP ${envelope.status_code}`,
      ),
    }
  }
  return { ...body, asyncQueued: false, request_id: data.request_id }
}

function RunStateBadge({ runState }) {
  const meta = BOT_RUN_STATES.find((s) => s.id === runState) || BOT_RUN_STATES[2]
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ${botRunStateBadgeClass(meta.tone)}`}>
      {meta.label}
    </span>
  )
}

function NumberField({ label, value, min, max, step, onChange, hint = '', decimal = false }) {
  const inputClassName =
    'mt-1 w-full rounded-xl border border-zinc-700/80 bg-zinc-950/60 px-3 py-2 text-white text-sm tabular-nums focus:border-cyan-500/50 focus:outline-none'

  if (decimal) {
    return (
      <label className="block min-w-0">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{label}</div>
        <input
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(e) => {
            const raw = e.target.value
            if (raw === '' || /^\d*\.?\d*$/.test(raw)) onChange(raw)
          }}
          className={inputClassName}
        />
        {hint ? <div className="text-zinc-600 text-[10px] mt-1">{hint}</div> : null}
      </label>
    )
  }

  return (
    <label className="block min-w-0">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{label}</div>
      <input
        type="number"
        min={min}
        max={max}
        step={step ?? 1}
        value={value === '' ? '' : value}
        onChange={(e) => {
          const raw = e.target.value
          if (raw === '') {
            onChange('')
            return
          }
          const n = Number(raw)
          if (!Number.isNaN(n)) onChange(n)
        }}
        className={inputClassName}
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
          maxLength={LOUNGE_CAPTION_SUBSCRIBER_MAX}
          rows={5}
          onChange={(e) => setCaption(e.target.value)}
          className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-white text-sm leading-relaxed resize-y focus:border-cyan-500/50 focus:outline-none"
        />
        <div className="text-zinc-500 text-[10px] mt-1 tabular-nums">
          {caption.length}/{LOUNGE_CAPTION_SUBSCRIBER_MAX}
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
  const [ingestTweetUrl, setIngestTweetUrl] = useState('')
  const [ingestTweetText, setIngestTweetText] = useState('')
  const [calendarToday, setCalendarToday] = useState([])
  const [selectedCalendarSlug, setSelectedCalendarSlug] = useState('')
  const [composeCaption, setComposeCaption] = useState('')
  const [composePills, setComposePills] = useState([])

  useEffect(() => {
    if (bot?.pipeline !== 'odds_api') {
      setCalendarToday([])
      setSelectedCalendarSlug('')
      return undefined
    }
    let cancelled = false
    void fetchSportsBettingCalendarToday(supabaseClient).then(({ data, error }) => {
      if (cancelled || error) return
      setCalendarToday(Array.isArray(data) ? data : [])
    })
    return () => {
      cancelled = true
    }
  }, [bot?.pipeline, bot?.user_id, supabaseClient])

  useEffect(() => {
    if (bot?.pipeline !== 'odds_api' || !calendarToday.length) {
      setSelectedCalendarSlug('')
      return
    }
    const storageKey = `bot-odds-calendar-${bot.user_id}`
    const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(storageKey) : null
    if (stored && calendarToday.some((row) => row.slug === stored)) {
      setSelectedCalendarSlug(stored)
      return
    }
    setSelectedCalendarSlug(calendarToday[0]?.slug || '')
  }, [bot?.pipeline, bot?.user_id, calendarToday])

  const selectedCalendarEntry = useMemo(
    () => calendarToday.find((row) => row.slug === selectedCalendarSlug) || null,
    [calendarToday, selectedCalendarSlug],
  )
  const selectedSportKey = selectedCalendarEntry?.odds_sport_keys?.[0] || ''

  const handleCalendarChange = (slug) => {
    setSelectedCalendarSlug(slug)
    if (bot?.user_id && typeof localStorage !== 'undefined') {
      localStorage.setItem(`bot-odds-calendar-${bot.user_id}`, slug)
    }
  }

  const refreshCalendarToday = useCallback(() => {
    if (bot?.pipeline !== 'odds_api') return
    void fetchSportsBettingCalendarToday(supabaseClient).then(({ data, error }) => {
      if (error) return
      setCalendarToday(Array.isArray(data) ? data : [])
    })
  }, [bot?.pipeline, supabaseClient])

  useEffect(() => {
    if (!bot) {
      setDraft(null)
      return
    }
    const watchlist = Array.isArray(bot.config?.watchlist_tickers)
      ? bot.config.watchlist_tickers.join(', ')
      : ''
    const defaultVoice = String(bot.config?.voice_prompt || '').trim()
    setDraft({
      maxPostsDay: bot.max_posts_per_day ?? 12,
      maxPostsHour: bot.max_posts_per_hour ?? 4,
      scoreThreshold: Number(bot.publish_score_threshold) || 55,
      minEdgePct: String(bot.odds_config?.min_edge_pct ?? 2),
      alertAudience: {
        ...DEFAULT_ODDS_ALERT_AUDIENCE,
        ...(bot.odds_config?.alert_audience || {}),
      },
      displayName: bot.display_name || '',
      categoryPills: Array.isArray(bot.category_pills_default) ? [...bot.category_pills_default] : [],
      watchlistText: watchlist,
      voicePrompt: defaultVoice,
    })
    setComposeCaption('')
    setComposePills(Array.isArray(bot.category_pills_default) ? [...bot.category_pills_default] : [])
  }, [
    bot?.user_id,
    bot?.max_posts_per_day,
    bot?.max_posts_per_hour,
    bot?.publish_score_threshold,
    bot?.odds_config?.min_edge_pct,
    bot?.odds_config?.alert_audience,
    bot?.display_name,
    bot?.category_pills_default,
    bot?.config,
  ])

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
    if (bot.pipeline === 'odds_api') {
      const minEdgeRaw = String(draft.minEdgePct ?? '').trim()
      if (!minEdgeRaw) {
        setToast('Min +EV % is required (0.5–15).')
        return
      }
      const minEdge = Number(minEdgeRaw)
      if (!Number.isFinite(minEdge) || minEdge < 0.5 || minEdge > 15) {
        setToast('Min +EV % must be between 0.5 and 15.')
        return
      }
    }

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
    }
    if (bot.pipeline === 'market_news') {
      patch.config = { watchlist_tickers: tickers }
    } else if (bot.pipeline === 'x') {
      patch.config = { voice_prompt: String(draft.voicePrompt || '').trim() }
    }
    if (bot.pipeline === 'odds_api') {
      patch.min_edge_pct = Number(String(draft.minEdgePct).trim())
      patch.alert_audience = draft.alertAudience
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
      if (!selectedSportKey) {
        setBusy('')
        setToast(
          calendarToday.length
            ? 'Pick a sporting event from the dropdown first.'
            : 'No major events on the betting calendar today.',
        )
        return
      }
      result = await invokeLoungeOddsIngest(supabaseClient, {
        slug: bot.slug,
        dryRun,
        sportKey: selectedSportKey,
        calendarSlug: selectedCalendarSlug,
        postMode: 'edge_only',
      })
    } else if (bot.pipeline === 'x') {
      result = await invokeLoungeXIngest(supabaseClient, { slug: bot.slug, dryRun })
    } else {
      setBusy('')
      setToast(`${pipelineLabel} pipeline runner not wired yet.`)
      return
    }

    if (result.error) {
      setBusy('')
      setToast(result.error.message || 'Pipeline run failed.')
      return
    }
    let d = result.data || {}
    if (d.asyncQueued) {
      d = await awaitScottQueueOutcome(supabaseClient, d, setToast)
    }
    setBusy('')
    if (d._pollError) {
      setToast(`${SCOTT_ASYNC_TOAST} (${d._pollError})`)
      scheduleBotReload(onReload)
      return
    }
    if (d._httpError) {
      setToast(d._httpError)
      void onReload()
      return
    }
    if (d.asyncQueued) {
      setToast(SCOTT_ASYNC_TOAST)
      scheduleBotReload(onReload)
      return
    }
    if (bot.pipeline === 'odds_api') {
      const skipMsg =
        d.skipped === 'no_calendar_today'
          ? 'No major events on the betting calendar today.'
          : d.skipped === 'sport_not_active'
            ? `${d.categoryLabel || d.sportKey || 'Sport'} is off-season at The Odds API right now.`
            : d.skipped === 'already_posted_or_capped'
              ? `${d.categoryLabel || selectedCalendarEntry?.label_short || 'Sport'}: already posted today or cap reached.`
              : d.skipped === 'no_edge_picks'
                ? `${d.categoryLabel || 'Sport'}: no ⚡ +EV clears the bar.`
                : null
      const label = d.categoryLabel || selectedCalendarEntry?.label_short || 'sport'
      if (dryRun) {
        setToast(
          d.wouldPostKind === 'edge'
            ? `Dry run · would post ⚡ +EV (${label})${d.edgeCandidate?.ev != null ? ` · +${d.edgeCandidate.ev}% EV` : ''}`
            : d.wouldPostKind === 'none'
              ? `Dry run · no ⚡ +EV clears the bar (${label}) · ${d.eventsInWindow ?? 0} games`
              : d.wouldPostKind === 'coffee_covers'
                ? `Dry run · would post Coffee & Covers (${label}) · ${d.coverCount ?? 0} covers, ${d.mlCount ?? 0} ML spots · ${d.eventsInWindow ?? 0} games`
                : `Dry run · would post slate check-in (${label}) · ${d.eventsInWindow ?? 0} games`,
        )
      } else if (d.publishedEdge) {
        setToast(`⚡ +EV alert posted · ${label}${d.evPct != null ? ` (+${d.evPct}% EV)` : ''}`)
      } else {
        setToast(skipMsg || `Done · ${label}`)
      }
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

  const runOddsPoll = async (action, dryRun = false) => {
    const busyKey = action === 'daily_slates'
      ? 'slates'
      : action === 'best_bet_hour'
        ? 'best-hour'
        : action === 'value_bet_radar'
          ? 'value-radar'
          : 'poll-all'
    setBusy(dryRun ? 'poll-dry' : busyKey)
    const result = await invokeLoungeOddsPoll(supabaseClient, {
      slug: bot.slug,
      action,
      dryRun,
      force: (action === 'daily_slates' || action === 'value_bet_radar') && !dryRun,
    })
    if (result.error) {
      setBusy('')
      setToast(result.error.message || 'Odds poll failed.')
      return
    }
    let d = result.data || {}
    if (d.asyncQueued) {
      d = await awaitScottQueueOutcome(supabaseClient, d, setToast)
    }
    setBusy('')
    if (d._pollError) {
      setToast(`${SCOTT_POLL_ACTION_LABELS[action] || action} · ${SCOTT_ASYNC_TOAST} (${d._pollError})`)
      scheduleBotReload(onReload)
      return
    }
    if (d._httpError) {
      setToast(d._httpError)
      void onReload()
      return
    }
    if (d.asyncQueued) {
      setToast(`${SCOTT_POLL_ACTION_LABELS[action] || action} · ${SCOTT_ASYNC_TOAST}`)
      scheduleBotReload(onReload)
      return
    }
    if (d.skipped === 'no_calendar_today') {
      setToast('No major events on the betting calendar today.')
    } else if (d.skipped === 'before_scheduled_time') {
      setToast(`Coffee & Covers fires at ${d.scheduledPt || '?'} PT today (random 6-8am window).`)
    } else if (d.skipped === 'outside_morning_window') {
      setToast('Coffee & Covers only runs between 6am and 8am PT.')
    } else if (action === 'best_bet_hour') {
      const ev = d.pick?.edgePct != null ? `${Math.round(d.pick.edgePct * 10) / 10}%` : null
      if (d.skipped === 'already_posted_this_hour') {
        setToast('Best Bet of the Hour already posted this PT hour.')
      } else if (d.skipped === 'best_bet_hour_disabled') {
        setToast('Best Bet of the Hour is disabled in odds config.')
      } else if (d.skipped === 'no_qualifying_edge') {
        setToast(
          dryRun
            ? `Dry run · no play cleared +${d.minEv ?? 4}% EV (${d.sportsScanned ?? 0} sports scanned)`
            : `No Best Bet posted · nothing cleared +${d.minEv ?? 4}% EV (${d.sportsScanned ?? 0} sports)`,
        )
      } else if (d.published) {
        setToast(`🔥 Best Bet of the Hour posted${ev ? ` · +${ev} EV` : ''}`)
      } else if (d.scheduled) {
        setToast(`🔥 Best Bet queued${ev ? ` · +${ev} EV` : ''} · posts on natural cadence`)
      } else if (dryRun && d.captionPreview) {
        setToast(`Dry run · would post Best Bet${ev ? ` (+${ev} EV)` : ''}: ${d.captionPreview.slice(0, 120)}…`)
      } else {
        setToast(d.skipped ? `Best Bet skipped (${d.skipped})` : 'Best Bet hour poll finished.')
      }
    } else if (action === 'value_bet_radar') {
      const topEv = d.picks?.[0]?.edgePct != null ? `${Math.round(d.picks[0].edgePct * 10) / 10}%` : null
      if (d.skipped === 'already_posted_this_window') {
        setToast('Value Bet Radar already posted this PT half-hour.')
      } else if (d.skipped === 'value_bet_radar_disabled') {
        setToast('Value Bet Radar is disabled in odds config.')
      } else if (d.skipped === 'outside_peak_window') {
        setToast('Value Bet Radar only runs 8am–10pm PT (use manual run with force).')
      } else if (d.skipped === 'no_qualifying_edges') {
        setToast(
          dryRun
            ? `Dry run · fewer than 2 plays cleared +${d.minEv ?? 3.5}% EV (${d.candidatesFound ?? 0} candidates)`
            : `No Radar posted · need 2+ plays at +${d.minEv ?? 3.5}% EV (${d.candidatesFound ?? 0} candidates)`,
        )
      } else if (d.published) {
        setToast(`📡 Value Bet Radar posted · ${d.pickCount ?? 0} plays${topEv ? ` (top +${topEv})` : ''}`)
      } else if (d.scheduled) {
        setToast(`📡 Value Bet Radar queued · ${d.pickCount ?? 0} plays${topEv ? ` (top +${topEv})` : ''}`)
      } else if (dryRun && d.captionPreview) {
        setToast(`Dry run · would post Radar (${d.pickCount ?? 0} plays): ${d.captionPreview.slice(0, 120)}…`)
      } else {
        setToast(d.skipped ? `Value Bet Radar skipped (${d.skipped})` : 'Value Bet Radar poll finished.')
      }
    } else if (action === 'daily_slates') {
      const combined = (d.details || []).find((row) => row?.combinedCoffee)
      const threadParts = combined?.threadPartCount != null
        ? Math.max(0, Number(combined.threadPartCount) - 1)
        : null
      const sportsIncluded = combined?.sportsIncluded ?? d.sportsChecked ?? 0
      setToast(
        dryRun
          ? `Dry run · would post one Coffee & Covers thread (${sportsIncluded} sport${sportsIncluded === 1 ? '' : 's'}${threadParts != null ? ` · ${threadParts} line part${threadParts === 1 ? '' : 's'}` : ''})${d.scheduledPt ? ` · cron opens ${d.scheduledPt} PT` : ''}`
          : combined?.publishedCoffeeCovers
            ? `Coffee & Covers posted · ${combined.coverCount ?? 0} cover${combined.coverCount === 1 ? '' : 's'} · ${threadParts ?? '?'} thread part${threadParts === 1 ? '' : 's'} (${sportsIncluded} sport${sportsIncluded === 1 ? '' : 's'})`
            : combined?.skipped === 'coffee_already_posted'
              ? 'Coffee & Covers already posted today.'
              : `No Coffee & Covers posted (${combined?.skipped || 'no games'}) · ${sportsIncluded} sport${sportsIncluded === 1 ? '' : 's'} checked`,
      )
    } else {
      setToast(
        dryRun
          ? `Dry run · scanned ${d.sportsChecked ?? 0} sports for edge alerts`
          : `⚡ ${d.publishedEdges ?? 0} +EV alert${d.publishedEdges === 1 ? '' : 's'} posted (${d.sportsChecked ?? 0} sports scanned)`,
      )
    }
    void onReload()
  }

  const publishAllExamplePosts = async () => {
    const ok = window.confirm(
      `Post ${SCOTT_EXAMPLE_POST_COUNT} example captions to the Lounge feed as @${bot.handle || bot.slug}? Each post is prefixed with 🧪 Example and uses your Alert audience (All | Subs) settings.`,
    )
    if (!ok) return

    setBusy('examples')
    const result = await invokeLoungeOddsPublishExamples(supabaseClient, { slug: bot.slug })
    if (result.error) {
      setBusy('')
      setToast(result.error.message || 'Example post pack failed.')
      return
    }
    let d = result.data || {}
    if (d.asyncQueued) {
      d = await awaitScottQueueOutcome(supabaseClient, d, setToast)
    }
    setBusy('')
    if (d._pollError) {
      setToast(`Example pack · ${SCOTT_ASYNC_TOAST} (${d._pollError})`)
      scheduleBotReload(onReload)
      return
    }
    if (d._httpError) {
      setToast(d._httpError)
      void onReload()
      return
    }
    if (d.asyncQueued) {
      setToast(`Example pack · ${SCOTT_ASYNC_TOAST}`)
      scheduleBotReload(onReload)
      return
    }
    if (d.failed > 0 && d.published > 0) {
      setToast(`Posted ${d.published}/${SCOTT_EXAMPLE_POST_COUNT} examples · ${d.failed} failed. Check feed.`)
    } else if (d.failed > 0) {
      setToast(`Example pack failed (${d.failed} errors).`)
    } else {
      setToast(`Posted ${d.published ?? SCOTT_EXAMPLE_POST_COUNT} example posts · check Lounge feed.`)
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

  const toggleComposePill = (slug) => {
    setComposePills((cur) => {
      if (cur.includes(slug)) return cur.filter((s) => s !== slug)
      if (cur.length >= 3) return cur
      return [...cur, slug]
    })
  }

  const handlePublishPost = async () => {
    const caption = composeCaption.trim()
    if (!caption) return
    setBusy('compose-post')
    const { error } = await publishBotPost(supabaseClient, {
      botUserId: bot.user_id,
      caption,
      categoryPills: composePills,
    })
    setBusy('')
    if (error) {
      setToast(error.message || 'Could not publish post.')
      return
    }
    setComposeCaption('')
    setToast(`Posted as @${bot.handle || bot.slug}.`)
    void onReload()
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

  const transformTweetUrl = async () => {
    const url = ingestTweetUrl.trim()
    if (!url) return
    setBusy('tweet-url')
    const { data, error } = await invokeLoungeXIngest(supabaseClient, {
      slug: bot.slug,
      tweetUrl: url,
      sourceText: ingestTweetText.trim() || undefined,
    })
    setBusy('')
    if (error) {
      setToast(error.message || 'Could not transform post.')
      return
    }
    if (data?.alreadyQueued) {
      setToast('That post is already in the editorial queue.')
    } else {
      setToast('Draft added to editorial inbox.')
      setIngestTweetUrl('')
      setIngestTweetText('')
    }
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

        {isAutomatic && bot.pipeline === 'odds_api' ? (
          <div className="mt-3 rounded-xl border border-cyan-500/20 bg-cyan-950/20 px-3 py-3">
            <label className="block min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-cyan-300/90">
                Today&apos;s major sporting events
              </div>
              {calendarToday.length ? (
                <>
                  <select
                    value={selectedCalendarSlug}
                    onChange={(e) => handleCalendarChange(e.target.value)}
                    className="mt-1.5 w-full max-w-md rounded-xl border border-zinc-700/80 bg-zinc-950/60 px-3 py-2 text-white text-sm focus:border-cyan-500/50 focus:outline-none"
                  >
                    {calendarToday.map((row) => (
                      <option key={row.slug} value={row.slug}>
                        {row.label_short}
                        {row.title && row.title !== row.label_short ? ` · ${row.title}` : ''}
                      </option>
                    ))}
                  </select>
                  <div className="text-zinc-500 text-[10px] mt-1.5">
                    Calendar rows active today (date window). Fetch odds posts a ⚡ +EV alert for the selected sport only. Coffee &amp; Covers scans every row here but only includes sports with unplayed games on today&apos;s PT slate (Odds API).{' '}
                    <span className="font-mono text-zinc-400">{selectedSportKey || '…'}</span>
                  </div>
                </>
              ) : (
                <div className="text-amber-200/80 text-xs mt-2">
                  No major events on the calendar today. Add or extend rows in{' '}
                  <span className="font-mono text-[10px]">lounge_sports_betting_calendar</span>.
                </div>
              )}
            </label>
            <BotSportsCalendarPanel
              supabaseClient={supabaseClient}
              setToast={setToast}
              busy={busy}
              setBusy={setBusy}
              onCalendarUpdated={refreshCalendarToday}
            />
          </div>
        ) : null}

        {isAutomatic ? (
          <>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={Boolean(busy) || (bot.pipeline === 'odds_api' && !selectedSportKey)}
              onClick={() => void runPipeline(true)}
              className="min-h-8 rounded-lg bg-zinc-800 px-3 text-zinc-200 text-[11px] font-semibold disabled:opacity-50"
            >
              Dry run
            </button>
            <button
              type="button"
              disabled={Boolean(busy) || bot.run_state !== 'running' || (bot.pipeline === 'odds_api' && !selectedSportKey)}
              onClick={() => void runPipeline(false)}
              className="min-h-8 rounded-lg bg-gradient-to-r from-cyan-700 to-violet-700 px-3 text-white text-[11px] font-bold disabled:opacity-50"
            >
              {busy === 'poll' ? 'Running…' : botPollActionLabel(bot.pipeline)}
            </button>
            {bot.pipeline === 'odds_api' ? (
              <>
                <button
                  type="button"
                  disabled={Boolean(busy) || bot.run_state !== 'running'}
                  onClick={() => void runOddsPoll('poll_edges', false)}
                  className="min-h-8 rounded-lg bg-amber-900/80 px-3 text-amber-100 text-[11px] font-semibold disabled:opacity-50"
                >
                  {busy === 'poll-all' ? '…' : 'Scan all · edge'}
                </button>
                <button
                  type="button"
                  disabled={Boolean(busy) || bot.run_state !== 'running'}
                  onClick={() => void runOddsPoll('daily_slates', false)}
                  className="min-h-8 rounded-lg bg-zinc-800 px-3 text-zinc-200 text-[11px] font-semibold disabled:opacity-50"
                >
                  {busy === 'slates' ? '…' : 'Post Coffee & Covers'}
                </button>
                <button
                  type="button"
                  disabled={Boolean(busy) || bot.run_state !== 'running'}
                  onClick={() => void runOddsPoll('best_bet_hour', false)}
                  className="min-h-8 rounded-lg bg-rose-900/70 px-3 text-rose-100 text-[11px] font-semibold disabled:opacity-50"
                >
                  {busy === 'best-hour' ? '…' : 'Best bet · hour'}
                </button>
                <button
                  type="button"
                  disabled={Boolean(busy) || bot.run_state !== 'running'}
                  onClick={() => void runOddsPoll('value_bet_radar', false)}
                  className="min-h-8 rounded-lg bg-cyan-900/70 px-3 text-cyan-100 text-[11px] font-semibold disabled:opacity-50"
                >
                  {busy === 'value-radar' ? '…' : 'Value radar'}
                </button>
              </>
            ) : null}
          </div>
          {bot.pipeline === 'odds_api' ? (
            <div className="mt-3 rounded-xl border border-violet-500/25 bg-violet-950/20 px-3 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-violet-200/90">
                Example post pack
              </div>
              <div className="text-zinc-500 text-[10px] mt-1 mb-2">
                One 🧪 Example feed post per alert type ({SCOTT_EXAMPLE_POST_COUNT} total), including Coffee & Covers thread part.
                Respects Alert audience All | Subs. Works while paused.
              </div>
              <button
                type="button"
                disabled={Boolean(busy)}
                onClick={() => void publishAllExamplePosts()}
                className="min-h-8 rounded-lg bg-violet-800 px-3 text-violet-50 text-[11px] font-bold disabled:opacity-50"
              >
                {busy === 'examples' ? 'Publishing…' : 'Post all examples'}
              </button>
            </div>
          ) : null}
          </>
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
          {isAutomatic && bot.pipeline === 'odds_api' ? (
            <NumberField
              label="Min +EV %"
              decimal
              value={draft.minEdgePct}
              hint="Minimum +EV on a $1 stake to fire ⚡ alerts (h2h devig)"
              onChange={(v) => setDraft((d) => ({ ...d, minEdgePct: v }))}
            />
          ) : null}
          {isAutomatic && bot.pipeline !== 'odds_api' ? (
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

        {isAutomatic && bot.pipeline === 'odds_api' ? (
          <div className="mt-4 rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 mb-1">
              Alert audience
            </div>
            <div className="text-zinc-600 text-[10px] mb-3">
              Choose whether each alert type posts to the public feed (All) or subscribers only (Subs).
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="text-zinc-500 border-b border-zinc-800/80">
                    <th className="py-2 pr-3 font-semibold">Alert type</th>
                    <th className="py-2 px-2 font-semibold text-center w-16">All</th>
                    <th className="py-2 pl-2 font-semibold text-center w-16">Subs</th>
                  </tr>
                </thead>
                <tbody>
                  {ODDS_ALERT_AUDIENCE_ROWS.map((row) => {
                    const value = draft.alertAudience?.[row.key] || DEFAULT_ODDS_ALERT_AUDIENCE[row.key]
                    return (
                      <tr key={row.key} className="border-b border-zinc-800/50 last:border-0">
                        <td className="py-2 pr-3 text-zinc-200">{row.label}</td>
                        <td className="py-2 px-2 text-center">
                          <input
                            type="radio"
                            name={`alert-audience-${row.key}`}
                            checked={value === 'all'}
                            onChange={() => setDraft((d) => ({
                              ...d,
                              alertAudience: { ...d.alertAudience, [row.key]: 'all' },
                            }))}
                            className="accent-cyan-500"
                          />
                        </td>
                        <td className="py-2 pl-2 text-center">
                          <input
                            type="radio"
                            name={`alert-audience-${row.key}`}
                            checked={value === 'subscribers'}
                            onChange={() => setDraft((d) => ({
                              ...d,
                              alertAudience: { ...d.alertAudience, [row.key]: 'subscribers' },
                            }))}
                            className="accent-cyan-500"
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        <div className="mt-4">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 mb-2">
            Default post pills (max 3)
          </div>
          <div className="text-zinc-600 text-[10px] mb-2">
            Tags on automated posts. Profile interest tribes are under Lounge profile → Edit.
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
              Optional ticker boost (comma or space separated)
            </div>
            <div className="text-zinc-600 text-[10px] mt-0.5 mb-1">
              {bot.config?.news_profile === 'crypto' || bot.slug === 'crypto-edge'
                ? 'Crypto Edge publishes on crypto topic tiers (regs, hacks, majors, DeFi). Tickers here are optional — extra company feeds + small score nudge only.'
                : 'Market Edge publishes on topic tiers (macro, earnings, geopolitics, commodities, regs, M&A). Tickers here are optional — extra company feeds + small score nudge only.'}
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

        {bot.pipeline === 'x' ? (
          <label className="block mt-4">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
              LLM voice instructions
            </div>
            <div className="text-zinc-600 text-[10px] mt-0.5 mb-1">
              Ingest runs each top-level tweet through OpenAI with this prompt. Set per bot ... not shared
              across X trackers.
            </div>
            <textarea
              value={draft.voicePrompt}
              rows={5}
              onChange={(e) => setDraft((d) => ({ ...d, voicePrompt: e.target.value }))}
              placeholder={X_BOT_VOICE_PLACEHOLDER}
              className="mt-1 w-full rounded-xl border border-zinc-700/80 bg-zinc-950/60 px-3 py-2 text-white text-sm leading-relaxed resize-y focus:border-violet-500/50 focus:outline-none"
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

      {bot.pipeline === 'x' ? (
        <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/90 p-4">
          <div className="text-white font-bold text-sm mb-1">Transform a post</div>
          <div className="text-zinc-500 text-[11px] mb-3">
            Paste an x.com link to an older tweet. No X API key needed if you paste the tweet text
            below ... otherwise we try public embed fetch. Runs your LLM voice instructions and adds
            a draft to the editorial inbox. Timeline polling still needs{' '}
            <span className="font-mono text-zinc-400">X_API_BEARER_TOKEN</span>.
          </div>
          <div className="flex flex-col gap-2">
            <input
              type="url"
              value={ingestTweetUrl}
              placeholder="https://x.com/handle/status/1234567890"
              onChange={(e) => setIngestTweetUrl(e.target.value)}
              className="w-full min-w-0 rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-white text-sm"
            />
            <textarea
              value={ingestTweetText}
              rows={3}
              placeholder="Tweet text (optional — paste from X if auto-fetch fails or API is not set up)"
              onChange={(e) => setIngestTweetText(e.target.value)}
              className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-white text-sm leading-relaxed resize-y"
            />
            <button
              type="button"
              disabled={busy === 'tweet-url' || !ingestTweetUrl.trim()}
              onClick={() => void transformTweetUrl()}
              className="self-start min-h-9 rounded-xl bg-cyan-800 px-4 text-white text-xs font-bold disabled:opacity-50"
            >
              {busy === 'tweet-url' ? 'Transforming…' : 'Transform → inbox'}
            </button>
          </div>
        </div>
      ) : null}

      <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/90 p-4">
        <div className="text-white font-bold text-sm mb-1">Post as @{bot.handle || bot.slug}</div>
        <div className="text-zinc-500 text-[11px] mb-3">
          Manual feed post from the bot account. Automated odds posts still run separately.
        </div>
        <textarea
          value={composeCaption}
          maxLength={LOUNGE_CAPTION_SUBSCRIBER_MAX}
          rows={5}
          onChange={(e) => setComposeCaption(e.target.value)}
          placeholder="Write a caption…"
          className="w-full rounded-xl border border-zinc-700/80 bg-zinc-950/60 px-3 py-2 text-white text-sm leading-relaxed resize-y focus:border-cyan-500/50 focus:outline-none"
        />
        <div className="text-zinc-500 text-[10px] mt-1 tabular-nums">
          {composeCaption.length}/{LOUNGE_CAPTION_SUBSCRIBER_MAX}
        </div>
        <div className="mt-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 mb-2">
            Category pills (max 3)
          </div>
          <div className="flex flex-wrap gap-2">
            {LOUNGE_POST_CATEGORY_PILL_SLUGS.map((slug) => {
              const selected = composePills.includes(slug)
              return (
                <button
                  key={`compose-${slug}`}
                  type="button"
                  onClick={() => toggleComposePill(slug)}
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
        <button
          type="button"
          disabled={busy === 'compose-post' || !composeCaption.trim()}
          onClick={() => void handlePublishPost()}
          className="mt-4 min-h-10 rounded-xl bg-cyan-700 px-5 text-white text-sm font-bold hover:bg-cyan-600 disabled:opacity-50"
        >
          {busy === 'compose-post' ? 'Publishing…' : 'Publish post'}
        </button>
      </div>

      <BotReplyOnPostPanel
        botUserId={bot.user_id}
        botHandle={bot.handle}
        supabaseClient={supabaseClient}
        setToast={setToast}
        onReload={onReload}
      />

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
                <BotPostRepliesPanel
                  postId={post.post_id}
                  botUserId={bot.user_id}
                  botHandle={bot.handle}
                  commentCount={post.comment_count}
                  supabaseClient={supabaseClient}
                  setToast={setToast}
                  onReload={onReload}
                />
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
            Apply migrations <span className="font-mono">20260704270000</span> through{' '}
            <span className="font-mono">20260704310000</span> (in order, skip any already applied).
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
