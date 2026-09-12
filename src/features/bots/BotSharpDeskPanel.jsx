import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  fetchBotPicksRecord,
  fetchBotRecentPicks,
  invokeLoungeOddsGradePicks,
  invokeLoungeOddsPredictivePick,
  invokeLoungeOddsSlateCard,
  invokeLoungeOddsWongTeaser,
  invokeLoungeOddsPrimetimeSpotlight,
  invokeLoungeOddsPrimetimeLock,
  invokeLoungeOddsSatSteam,
  invokeLoungeOddsSundayWindowLock,
  invokeLoungeOddsWeeklyRecap,
  invokeLoungeOddsMonthlyScoreboard,
  invokeLoungeOddsHalftimePivot,
  invokeLoungeOddsAnytimeTd,
  invokeLoungeOddsMiddleArb,
  invokeLoungeOddsUfcCard,
} from './botPortalApi.js'
import {
  destKindForDrop,
  dropById,
  dropsForSport,
  firstDropIdForSport,
  OPS_SPORTS,
  sportLabel,
} from '../../syndicate/syndicateOpsDrops.js'
import {
  formatTodayPicksResult,
  runTodayPicksForSport,
  todayPicksPlan,
} from '../../syndicate/syndicateTodayPicks.js'
import BotPlayerPvalEditor from './BotPlayerPvalEditor.jsx'
import BotTeamMetricsEditor from './BotTeamMetricsEditor.jsx'
import BotCfbPowerRatingsEditor from './BotCfbPowerRatingsEditor.jsx'
import BotUfcMetricsEditor from './BotUfcMetricsEditor.jsx'
import BotBettingSplitsPaste from './BotBettingSplitsPaste.jsx'
import { SyndicateDryRunPreview } from '../../syndicate/SyndicateDryRunPreview.jsx'
import { SyndicateDeskEvalBoard } from '../../syndicate/SyndicateDeskEvalBoard.jsx'
import { SyndicateOpsDropInfo } from '../../syndicate/SyndicateOpsDropInfo.jsx'
import { SyndicateOpsWeekCalendar } from '../../syndicate/SyndicateOpsWeekCalendar.jsx'
import { SyndicateWeeklyPullsPanel } from '../../syndicate/SyndicateWeeklyPullsPanel.jsx'
import { SyndicateDeskMathPanel } from '../../syndicate/SyndicateDeskMathPanel.jsx'
import {
  deskEvalsFor,
  deskMeta,
  isNamedOpsDesk,
  OPS_DESK_HOUSE,
  OPS_DESKS,
} from '../../syndicate/syndicateOpsDesks.js'

const PICKER_METAS = {
  Scott: {
    title: 'The Model',
    badge: 'bg-emerald-950/70 text-emerald-300 ring-emerald-500/30',
  },
  Rocco: {
    title: 'Vegas Spreads',
    badge: 'bg-blue-950/70 text-blue-300 ring-blue-500/30',
  },
  Chedda: {
    title: 'Moneyline & Dogs',
    badge: 'bg-amber-950/70 text-amber-300 ring-amber-500/30',
  },
  Tank: {
    title: 'Totals & Spots',
    badge: 'bg-purple-950/70 text-purple-300 ring-purple-500/30',
  },
}

const TIMEFRAME_OPTIONS = [
  { id: 'all_time', label: 'All-Time' },
  { id: 'season', label: 'Season' },
  { id: 'month', label: 'Month' },
  { id: 'week', label: 'Week' },
]

const DESK_TABS = [
  { id: 'pulls', label: '📡 Weekly Pulls', shortLabel: 'Pulls' },
  { id: 'math', label: '🧮 Desk Math', shortLabel: 'Math' },
  { id: 'scorecard', label: '🎯 Scorecard & Drops', shortLabel: 'Scorecard' },
  { id: 'splits', label: '🧀 Splits Paste', shortLabel: 'Splits' },
  { id: 'pvals', label: '🩹 NFL Injury PVALs', shortLabel: 'NFL PVALs' },
  { id: 'trench_epa', label: '🏈 NFL EPA & Trenches', shortLabel: 'NFL Trenches' },
  { id: 'cfb_power', label: '🎓 CFB Power Index', shortLabel: 'CFB Ratings' },
  { id: 'ufc_metrics', label: '🥊 UFC Fighter Metrics', shortLabel: 'UFC Metrics' },
]

const SEND_TO_KEYS = [
  { key: 'loungePublic', label: 'Lounge public' },
  { key: 'loungeFanOnly', label: 'Lounge fan-only' },
  { key: 'vipChat', label: 'VIP chat' },
  { key: 'x', label: 'X @sharpesyndicate' },
]

const SEND_TO_BAR_DEFAULT = {
  loungePublic: true,
  loungeFanOnly: true,
  vipChat: true,
  x: true,
}

const VIP_ONLY_DROP_KINDS = new Set(['halftime', 'middle'])
const FAN_ONLY_DROP_KINDS = new Set(['slate', 'ufc'])
const NO_VIP_DROP_KINDS = new Set(['solo'])

function defaultDestForKind(kind) {
  if (kind === 'ufc') {
    return { loungePublic: true, loungeFanOnly: true, vipChat: true, x: false }
  }
  if (VIP_ONLY_DROP_KINDS.has(kind)) {
    return { loungePublic: false, loungeFanOnly: false, vipChat: true, x: false }
  }
  return {
    loungePublic: true,
    loungeFanOnly: FAN_ONLY_DROP_KINDS.has(kind),
    vipChat: !NO_VIP_DROP_KINDS.has(kind),
    x: true,
  }
}

function anySendTo(d) {
  return Boolean(d?.loungePublic || d?.loungeFanOnly || d?.vipChat || d?.x)
}

function destForPublish(kind, sendTo, destDirty) {
  if (!destDirty) return defaultDestForKind(kind)
  return {
    loungePublic: sendTo.loungePublic === true,
    loungeFanOnly: FAN_ONLY_DROP_KINDS.has(kind) && sendTo.loungeFanOnly === true,
    vipChat: sendTo.vipChat === true,
    x: sendTo.x === true,
  }
}

function toastWithDestWarnings(base, data) {
  const extra = [data?.xWarning, data?.fanOnlyWarning, data?.vipChatWarning].filter(Boolean)
  return extra.length ? `${base} ${extra.join(' ')}` : base
}

export function BotSharpDeskPanel({
  supabaseClient,
  botUserId,
  botSlug,
  setToast,
  busy,
  setBusy,
}) {
  const [activeTab, setActiveTab] = useState('scorecard')
  const [recordData, setRecordData] = useState(null)
  const [recentPicks, setRecentPicks] = useState([])
  const [loading, setLoading] = useState(false)
  const [grading, setGrading] = useState(false)
  const [dropping, setDropping] = useState(false)
  const [selectedPicker, setSelectedPicker] = useState('auto')
  const [cardMode, setCardMode] = useState('auto')
  const [timeframe, setTimeframe] = useState('all_time')
  const [portalSportKey, setPortalSportKey] = useState('all')
  const [monthlyBoard, setMonthlyBoard] = useState(null)
  /** @type {[null | Record<string, unknown>, Function]} */
  const [dropPreview, setDropPreview] = useState(null)
  const [sendTo, setSendTo] = useState(SEND_TO_BAR_DEFAULT)
  const [destDirty, setDestDirty] = useState(false)
  const [splitsRows, setSplitsRows] = useState([])
  const [selectedSportKey, setSelectedSportKey] = useState('americanfootball_nfl')
  const [selectedDropId, setSelectedDropId] = useState('today')
  const [dropInfoOpen, setDropInfoOpen] = useState(false)
  const [selectedOpsDesk, setSelectedOpsDesk] = useState(OPS_DESK_HOUSE)

  const sportDrops = useMemo(() => dropsForSport(selectedSportKey), [selectedSportKey])
  const activeDrop = dropById(selectedDropId)
  const activeDestKind = destKindForDrop(selectedDropId, selectedSportKey)
  const todayHint = todayPicksPlan(selectedSportKey).summary
  const dropHint = selectedDropId === 'today' ? todayHint : activeDrop?.hint || ''

  useEffect(() => {
    if (!sportDrops.some((d) => d.id === selectedDropId)) {
      setSelectedDropId(firstDropIdForSport(selectedSportKey))
    }
  }, [selectedSportKey, selectedDropId, sportDrops])

  useEffect(() => {
    if (!supabaseClient) return undefined
    let cancelled = false
    const load = async () => {
      const { data } = await supabaseClient
        .from('syndicate_betting_splits')
        .select(
          'sport_key,active,updated_at,created_at,home_ticket_pct,home_handle_pct,over_ticket_pct,over_handle_pct',
        )
        .eq('active', true)
        .limit(200)
      if (!cancelled) setSplitsRows(data || [])
    }
    void load()
    const t = window.setInterval(() => void load(), 60_000)
    return () => {
      cancelled = true
      window.clearInterval(t)
    }
  }, [supabaseClient, activeTab])

  /**
   * @param {string} title
   * @param {Record<string, unknown> | null | undefined} data
   * @param {string | null} [fallbackError]
   */
  const showDropDryRunPreview = (title, data, fallbackError = null) => {
    const vipCaption = String(data?.vipPreviewCaption || '').trim()
    const hasExplicitPublic = Object.prototype.hasOwnProperty.call(data || {}, 'previewCaption')
    const caption = hasExplicitPublic
      ? String(data?.previewCaption || '').trim()
      : String(data?.previewCaption || data?.captionPreview || data?.summary || '').trim()
    const threadParts = Array.isArray(data?.subscriberThreadParts)
      ? data.subscriberThreadParts
      : null
    const destPreviews = data?.destPreviews && typeof data.destPreviews === 'object'
      ? data.destPreviews
      : null
    const deskEvals = data?.deskEvals && typeof data.deskEvals === 'object' ? data.deskEvals : null
    const hasDeskEvals = Boolean(
      deskEvals
        && ['Scott', 'Rocco', 'Chedda', 'Tank'].some((k) => Array.isArray(deskEvals[k]) && deskEvals[k].length),
    )
    const hasAnyCaption = Boolean(
      caption
        || vipCaption
        || (threadParts && threadParts.length)
        || destPreviews?.public?.caption
        || destPreviews?.private?.caption
        || destPreviews?.chat?.caption
        || destPreviews?.x?.caption,
    )
    const err =
      data?.ok === false
        ? String(data.message || data.error || fallbackError || 'No preview.')
        : data?.skipped
          ? String(data.note || data.skipped)
          : !hasAnyCaption && !hasDeskEvals
            ? fallbackError || 'No caption returned for this dry run.'
            : null
    setDropPreview({
      sportLabel: title,
      dayKey: data?.dayKey || data?.sportKey || null,
      previewCaption: caption || null,
      vipPreviewCaption: vipCaption || null,
      subscriberThreadParts: threadParts,
      destPreviews,
      deskEvals,
      gamesSummary: data?.gamesSummary || null,
      gamesToday: data?.gamesToday ?? data?.totalGames ?? data?.totalFights ?? null,
      totalGames: data?.totalGames ?? data?.totalFights ?? null,
      hammersCount: data?.hammersCount ?? null,
      consensusCount: data?.consensusCount ?? null,
      splitsCount: data?.splitsCount ?? null,
      solosCount: data?.solosCount ?? null,
      majoritySplitsCount: data?.majoritySplitsCount ?? null,
      passOnlyCount: data?.passOnlyCount ?? null,
      error: err,
    })
    setToast?.(
      hasDeskEvals
        ? 'Desk evals ready below. Open a desk to read the vote and why.'
        : hasAnyCaption
          ? 'Full post preview ready below.'
          : err || 'Preview ready below.',
    )
  }

  const loadData = useCallback(async () => {
    if (!supabaseClient || !botUserId) return
    setLoading(true)
    try {
      const [recRes, picksRes] = await Promise.all([
        fetchBotPicksRecord(supabaseClient, botUserId, {
          timeframe,
          sportKey: portalSportKey,
        }),
        fetchBotRecentPicks(supabaseClient, botUserId, 25),
      ])
      if (recRes.data) setRecordData(recRes.data)
      if (picksRes.data) setRecentPicks(picksRes.data)
    } catch (e) {
      console.error('Failed to load sharp desk data:', e)
    } finally {
      setLoading(false)
    }
  }, [supabaseClient, botUserId, timeframe, portalSportKey])

  useEffect(() => {
    loadData()
  }, [loadData])

  const toggleSendTo = (key) => {
    setDestDirty(true)
    setSendTo((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const requireDestinations = (kind) => {
    const destinations = destForPublish(kind, sendTo, destDirty)
    if (!anySendTo(destinations)) {
      setToast?.('Pick at least one Send to destination.')
      return null
    }
    return destinations
  }

  const handleGradePicks = async () => {
    setGrading(true)
    if (setBusy) setBusy(true)
    try {
      const { data, error } = await invokeLoungeOddsGradePicks(supabaseClient, { slug: botSlug })
      if (error) {
        setToast?.(`Grading failed: ${error.message}`)
      } else {
        const count = data?.resolved ?? 0
        setToast?.(`Graded ${count} pending pick${count === 1 ? '' : 's'}.`)
        await loadData()
      }
    } catch (err) {
      setToast?.(`Grading error: ${err.message}`)
    } finally {
      setGrading(false)
      if (setBusy) setBusy(false)
    }
  }

  const handleDropPick = async (dryRun = false) => {
    const destinations = dryRun ? undefined : requireDestinations('solo')
    if (!dryRun && !destinations) return
    setDropping(true)
    if (setBusy) setBusy(true)
    try {
      const { data, error } = await invokeLoungeOddsPredictivePick(supabaseClient, {
        slug: botSlug,
        cardMode,
        pickerName: selectedPicker !== 'auto' ? selectedPicker : undefined,
        sportKey: selectedSportKey || undefined,
        dryRun,
        destinations,
      })
      if (error) {
        setToast?.(`Drop failed: ${error.message}`)
      } else if (data?.dryRun) {
        showDropDryRunPreview('Solo / Spot Drop', data)
      } else if (data?.ok) {
        const msg = data.isSyndicate
          ? `Published Syndicate Card (${data.pickIds?.length || 0} picks)`
          : `Published Solo Pick for ${data.pickerName}`
        setToast?.(toastWithDestWarnings(msg, data))
        await loadData()
      } else if (dryRun) {
        showDropDryRunPreview('Solo / Spot Drop', data, data?.message || 'No picks available.')
      } else {
        setToast?.(data?.message || 'No picks published.')
      }
    } catch (err) {
      setToast?.(`Drop error: ${err.message}`)
    } finally {
      setDropping(false)
      if (setBusy) setBusy(false)
    }
  }

  const handleDropSlateCard = async (sportKey = 'americanfootball_nfl', dryRun = false) => {
    const destinations = dryRun ? undefined : requireDestinations('slate')
    if (!dryRun && !destinations) return
    setDropping(true)
    if (setBusy) setBusy(true)
    const sportName = sportKey === 'americanfootball_ncaaf' ? 'CFB' : 'NFL'
    try {
      const { data, error } = await invokeLoungeOddsSlateCard(supabaseClient, {
        slug: botSlug,
        sportKey,
        dryRun,
        destinations,
      })
      if (error) {
        setToast?.(`${sportName} Slate Card failed: ${error.message}`)
      } else if (data?.dryRun) {
        showDropDryRunPreview(`${sportName} Slate`, data)
      } else if (data?.ok) {
        setToast?.(toastWithDestWarnings(
          `Published ${sportName} Slate Card: ${data.totalGames || 0} games (${data.hammersCount || 0} Hammers, ${data.consensusCount || 0} Consensus).`,
          data,
        ))
        await loadData()
      } else if (dryRun) {
        showDropDryRunPreview(`${sportName} Slate`, data, data?.message || `No ${sportName} slate card candidates found.`)
      } else {
        setToast?.(data?.message || `No ${sportName} slate card candidates found.`)
      }
    } catch (err) {
      setToast?.(`${sportName} Slate Card error: ${err.message}`)
    } finally {
      setDropping(false)
      if (setBusy) setBusy(false)
    }
  }

  const handleDropWongTeaser = async (dryRun = false) => {
    const destinations = dryRun ? undefined : requireDestinations('wong')
    if (!dryRun && !destinations) return
    setDropping(true)
    if (setBusy) setBusy(true)
    try {
      const { data, error } = await invokeLoungeOddsWongTeaser(supabaseClient, {
        slug: botSlug,
        dryRun,
        destinations,
      })
      if (error) {
        setToast?.(`Wong Teaser drop failed: ${error.message}`)
      } else if (data?.dryRun) {
        showDropDryRunPreview('Wong Teaser', data)
      } else if (data?.ok) {
        setToast?.(toastWithDestWarnings('Published 2-Leg Wong Teaser of the Week!', data))
        await loadData()
      } else if (dryRun) {
        showDropDryRunPreview('Wong Teaser', data, data?.message || 'No qualifying Wong teaser legs found on current lines.')
      } else {
        setToast?.(data?.message || 'No qualifying Wong teaser legs found on current lines.')
      }
    } catch (err) {
      setToast?.(`Wong Teaser error: ${err.message}`)
    } finally {
      setDropping(false)
      if (setBusy) setBusy(false)
    }
  }

  const handleDropPrimetimeSpotlight = async (primetimeType, dryRun = false) => {
    const destinations = dryRun ? undefined : requireDestinations('primetime')
    if (!dryRun && !destinations) return
    setDropping(true)
    if (setBusy) setBusy(true)
    const label = primetimeType || 'Primetime'
    try {
      const { data, error } = await invokeLoungeOddsPrimetimeSpotlight(supabaseClient, {
        slug: botSlug,
        primetimeType,
        dryRun,
        destinations,
      })
      if (error) {
        setToast?.(`${label} Spotlight failed: ${error.message}`)
      } else if (data?.dryRun) {
        showDropDryRunPreview(`${label} Spotlight`, data)
      } else if (data?.ok) {
        const sp = data?.spotlight
        const extras = [
          data?.fanOnlyWarning && `Fan-only Lounge failed: ${data.fanOnlyWarning}`,
          data?.vipChatWarning && `VIP chat failed: ${data.vipChatWarning}`,
        ].filter(Boolean)
        const dest = extras.length
          ? `public: ${sp?.awayTeam} @ ${sp?.homeTeam}. ${extras.join(' ')}`
          : `${sp?.awayTeam} @ ${sp?.homeTeam}${data?.privatePostId ? ' (public + fan-only)' : ''}`
        setToast?.(toastWithDestWarnings(`Published ${sp?.primetimeLabel || label} Spotlight ${dest}`, data))
        await loadData()
      } else if (dryRun) {
        showDropDryRunPreview(`${label} Spotlight`, data, data?.message || `No eligible ${label} game found on active board.`)
      } else {
        const sp = data?.spotlight
        setToast?.(
          data?.message
            || (sp?.awayTeam && sp?.homeTeam
              ? `Found ${sp.awayTeam} @ ${sp.homeTeam} but publish failed.`
              : `No eligible ${label} game found on active board.`),
        )
      }
    } catch (err) {
      setToast?.(`${label} Spotlight error: ${err.message}`)
    } finally {
      setDropping(false)
      if (setBusy) setBusy(false)
    }
  }

  const handleDropPrimetimeLock = async (dryRun = false) => {
    const destinations = dryRun ? undefined : requireDestinations('primetime')
    if (!dryRun && !destinations) return
    setDropping(true)
    if (setBusy) setBusy(true)
    try {
      const { data, error } = await invokeLoungeOddsPrimetimeLock(supabaseClient, {
        slug: botSlug,
        dryRun,
        destinations,
      })
      if (error) {
        setToast?.(`Primetime lock failed: ${error.message}`)
      } else if (data?.dryRun) {
        showDropDryRunPreview('Primetime Lock', data, data?.message || data?.skipped || 'No lock candidate.')
      } else if (data?.ok && !data?.skipped) {
        const verdict = data?.verdict === 'kill' ? 'KILL' : 'LOCK'
        setToast?.(toastWithDestWarnings(`Published primetime ${verdict}`, data))
        await loadData()
      } else {
        setToast?.(data?.message || data?.skipped || 'Primetime lock skipped.')
      }
    } catch (err) {
      setToast?.(`Primetime lock error: ${err.message}`)
    } finally {
      setDropping(false)
      if (setBusy) setBusy(false)
    }
  }

  const handleDropSatSteam = async (dryRun = false) => {
    const destinations = dryRun ? undefined : requireDestinations('wong')
    if (!dryRun && !destinations) return
    setDropping(true)
    if (setBusy) setBusy(true)
    try {
      const { data, error } = await invokeLoungeOddsSatSteam(supabaseClient, {
        slug: botSlug,
        dryRun,
        destinations,
      })
      if (error) {
        setToast?.(`Saturday steam failed: ${error.message}`)
      } else if (data?.dryRun) {
        showDropDryRunPreview('Saturday Steam', data, data?.message || data?.skipped)
      } else if (data?.ok && !data?.skipped) {
        setToast?.(toastWithDestWarnings(`Published Saturday steam · ${data?.standCount || 0} stand / ${data?.killCount || 0} kill`, data))
        await loadData()
      } else {
        setToast?.(data?.message || data?.skipped || 'Saturday steam skipped.')
      }
    } catch (err) {
      setToast?.(`Saturday steam error: ${err.message}`)
    } finally {
      setDropping(false)
      if (setBusy) setBusy(false)
    }
  }

  const handleDropSundayLock = async (window, dryRun = false) => {
    const destinations = dryRun ? undefined : requireDestinations('wong')
    if (!dryRun && !destinations) return
    const label = window === 'late' ? 'Sunday Late Lock' : 'Sunday Early Lock'
    setDropping(true)
    if (setBusy) setBusy(true)
    try {
      const { data, error } = await invokeLoungeOddsSundayWindowLock(supabaseClient, {
        slug: botSlug,
        window,
        dryRun,
        destinations,
      })
      if (error) {
        setToast?.(`${label} failed: ${error.message}`)
      } else if (data?.dryRun) {
        showDropDryRunPreview(label, data, data?.message || data?.skipped)
      } else if (data?.ok && !data?.skipped) {
        setToast?.(toastWithDestWarnings(`Published ${label}`, data))
        await loadData()
      } else {
        setToast?.(data?.message || data?.skipped || `${label} skipped.`)
      }
    } catch (err) {
      setToast?.(`${label} error: ${err.message}`)
    } finally {
      setDropping(false)
      if (setBusy) setBusy(false)
    }
  }

  const handleDropWeeklyRecap = async (dryRun = false) => {
    const destinations = dryRun ? undefined : requireDestinations('weekly')
    if (!dryRun && !destinations) return
    setDropping(true)
    if (setBusy) setBusy(true)
    try {
      const { data, error } = await invokeLoungeOddsWeeklyRecap(supabaseClient, {
        slug: botSlug,
        dryRun,
        destinations,
      })
      if (error) {
        setToast?.(`Weekly Recap failed: ${error.message}`)
      } else if (data?.dryRun) {
        showDropDryRunPreview('Weekly Recap', data)
      } else if (data?.ok) {
        setToast?.(toastWithDestWarnings('Published Tuesday Weekly Syndicate Ledger & Post-Mortem!', data))
        await loadData()
      } else if (dryRun) {
        showDropDryRunPreview('Weekly Recap', data, data?.message || 'No graded picks over last 7 days.')
      } else {
        setToast?.(data?.message || 'No graded picks over last 7 days.')
      }
    } catch (err) {
      setToast?.(`Weekly Recap error: ${err.message}`)
    } finally {
      setDropping(false)
      if (setBusy) setBusy(false)
    }
  }

  const handleMonthlyScoreboard = async (monthsBack = 1) => {
    setDropping(true)
    if (setBusy) setBusy(true)
    try {
      const { data, error } = await invokeLoungeOddsMonthlyScoreboard(supabaseClient, {
        slug: botSlug,
        monthsBack,
      })
      if (error) {
        setToast?.(`Monthly scoreboard failed: ${error.message}`)
        setMonthlyBoard(null)
      } else if (data?.ok) {
        setMonthlyBoard(data.scoreboard || null)
        showDropDryRunPreview(monthsBack > 1 ? 'Monthly Board · 3 mo' : 'Monthly Board · This month', data)
      } else {
        setToast?.(data?.message || 'No scoreboard rows.')
        setMonthlyBoard(null)
        showDropDryRunPreview(
          monthsBack > 1 ? 'Monthly Board · 3 mo' : 'Monthly Board · This month',
          data,
          data?.message || 'No scoreboard rows.',
        )
      }
    } catch (err) {
      setToast?.(`Monthly scoreboard error: ${err.message}`)
      setMonthlyBoard(null)
    } finally {
      setDropping(false)
      if (setBusy) setBusy(false)
    }
  }

  const handleDropHalftimePivot = async (dryRun = false) => {
    const destinations = dryRun ? undefined : requireDestinations('halftime')
    if (!dryRun && !destinations) return
    setDropping(true)
    if (setBusy) setBusy(true)
    try {
      const { data, error } = await invokeLoungeOddsHalftimePivot(supabaseClient, {
        slug: botSlug,
        dryRun,
        destinations,
      })
      if (error) {
        setToast?.(`Halftime Pivot failed: ${error.message}`)
      } else if (data?.dryRun) {
        showDropDryRunPreview('Halftime Pivot', data)
      } else if (data?.ok) {
        setToast?.(toastWithDestWarnings('Published Halftime Pivot to Sharpe VIP chat!', data))
        await loadData()
      } else if (dryRun) {
        showDropDryRunPreview('Halftime Pivot', data, data?.message || 'No live NFL game currently at halftime.')
      } else {
        setToast?.(data?.message || 'No live NFL game currently at halftime.')
      }
    } catch (err) {
      setToast?.(`Halftime Pivot error: ${err.message}`)
    } finally {
      setDropping(false)
      if (setBusy) setBusy(false)
    }
  }

  const handleDropAnytimeTd = async (dryRun = false) => {
    const destinations = dryRun ? undefined : requireDestinations('anytime')
    if (!dryRun && !destinations) return
    setDropping(true)
    if (setBusy) setBusy(true)
    try {
      const { data, error } = await invokeLoungeOddsAnytimeTd(supabaseClient, {
        slug: botSlug,
        dryRun,
        destinations,
      })
      if (error) {
        setToast?.(`Anytime TD drop failed: ${error.message}`)
      } else if (data?.dryRun) {
        showDropDryRunPreview('Anytime TD', data)
      } else if (data?.ok) {
        setToast?.(toastWithDestWarnings("Published Chedda's TD of the Week & VIP 3-player slate!", data))
        await loadData()
      } else if (dryRun) {
        showDropDryRunPreview('Anytime TD', data, data?.message || 'No active NFL games with Anytime TD candidates.')
      } else {
        setToast?.(data?.message || 'No active NFL games with Anytime TD candidates.')
      }
    } catch (err) {
      setToast?.(`Anytime TD error: ${err.message}`)
    } finally {
      setDropping(false)
      if (setBusy) setBusy(false)
    }
  }

  const handleDropMiddleArb = async (dryRun = false) => {
    const destinations = dryRun ? undefined : requireDestinations('middle')
    if (!dryRun && !destinations) return
    setDropping(true)
    if (setBusy) setBusy(true)
    try {
      const { data, error } = await invokeLoungeOddsMiddleArb(supabaseClient, {
        slug: botSlug,
        dryRun,
        destinations,
      })
      if (error) {
        setToast?.(`Middle & Arb Scanner failed: ${error.message}`)
      } else if (data?.dryRun) {
        showDropDryRunPreview('Middle & Arb', data)
      } else if (data?.ok) {
        setToast?.(toastWithDestWarnings('Published Live Middle / Arb Alert to Sharpe VIP chat!', data))
        await loadData()
      } else if (dryRun) {
        showDropDryRunPreview('Middle & Arb', data, data?.message || 'No qualifying Middle or Arb opportunities found on active boards.')
      } else {
        setToast?.(data?.message || 'No qualifying Middle or Arb opportunities found on active boards.')
      }
    } catch (err) {
      setToast?.(`Middle & Arb error: ${err.message}`)
    } finally {
      setDropping(false)
      if (setBusy) setBusy(false)
    }
  }

  const handleDropUfcCard = async (dryRun = false) => {
    const destinations = dryRun ? undefined : requireDestinations('ufc')
    if (!dryRun && !destinations) return
    setDropping(true)
    if (setBusy) setBusy(true)
    try {
      const { data, error } = await invokeLoungeOddsUfcCard(supabaseClient, {
        slug: botSlug,
        dryRun,
        cardTitle: 'UFC Main Card',
        destinations,
      })
      if (error) {
        setToast?.(`UFC Slate Card failed: ${error.message}`)
      } else if (data?.dryRun) {
        showDropDryRunPreview('UFC Slate', data)
      } else if (data?.ok) {
        setToast?.(toastWithDestWarnings(
          `Published UFC Syndicate Card (${data?.totalPicksRecorded || 0} picks recorded)!`,
          data,
        ))
        await loadData()
      } else if (dryRun) {
        showDropDryRunPreview('UFC Slate', data, data?.message || 'No active UFC fight lines found on active boards.')
      } else {
        setToast?.(data?.message || 'No active UFC fight lines found on active boards.')
      }
    } catch (err) {
      setToast?.(`UFC Card error: ${err.message}`)
    } finally {
      setDropping(false)
      if (setBusy) setBusy(false)
    }
  }

  const handleDropToday = async (dryRun = false) => {
    const destKind = destKindForDrop('today', selectedSportKey)
    const destinations = dryRun ? undefined : requireDestinations(destKind)
    if (!dryRun && !destinations) return
    setDropping(true)
    if (setBusy) setBusy(true)
    const sportName = sportLabel(selectedSportKey)
    try {
      const { data, error } = await runTodayPicksForSport(supabaseClient, {
        slug: botSlug,
        sportKey: selectedSportKey,
        dryRun,
        destinations,
      })
      if (error) {
        setToast?.(error.message || 'Picks for today failed.')
      } else if (dryRun || data?.dryRun) {
        showDropDryRunPreview(`${sportName} · today`, data)
      } else {
        setToast?.(toastWithDestWarnings(formatTodayPicksResult(data, false), data))
        await loadData()
      }
    } catch (err) {
      setToast?.(`Picks for today error: ${err.message}`)
    } finally {
      setDropping(false)
      if (setBusy) setBusy(false)
    }
  }

  const handleRunSelectedDrop = async (dryRun = false) => {
    switch (selectedDropId) {
      case 'today':
        return handleDropToday(dryRun)
      case 'slate':
        return handleDropSlateCard(selectedSportKey, dryRun)
      case 'ufc_slate':
        return handleDropUfcCard(dryRun)
      case 'solo':
        return handleDropPick(dryRun)
      case 'primetime':
        return handleDropPrimetimeSpotlight(undefined, dryRun)
      case 'primetime_lock':
        return handleDropPrimetimeLock(dryRun)
      case 'sat_steam':
        return handleDropSatSteam(dryRun)
      case 'sunday_early_lock':
        return handleDropSundayLock('early', dryRun)
      case 'sunday_late_lock':
        return handleDropSundayLock('late', dryRun)
      case 'wong':
        return handleDropWongTeaser(dryRun)
      case 'weekly':
        return handleDropWeeklyRecap(dryRun)
      case 'anytime':
        return handleDropAnytimeTd(dryRun)
      case 'halftime':
        return handleDropHalftimePivot(dryRun)
      case 'middle':
        return handleDropMiddleArb(dryRun)
      default:
        setToast?.('Pick a drop type.')
    }
  }

  const overall = recordData?.overall || { wins: 0, losses: 0, pushes: 0, pending: 0, win_rate_pct: 0, units_net: 0 }
  const pickers = recordData?.pickers || {}
  const activeDeskMeta = deskMeta(selectedOpsDesk)
  const inspectingDesk = isNamedOpsDesk(selectedOpsDesk)
  const activeDeskRows = deskEvalsFor(dropPreview, selectedOpsDesk)

  return (
    <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-950/15 p-3 sm:p-4 text-white">
      <div className="flex flex-wrap items-center gap-1.5 pb-3">
        <button
          type="button"
          onClick={() => setSelectedOpsDesk(OPS_DESK_HOUSE)}
          className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold border transition ${
            selectedOpsDesk === OPS_DESK_HOUSE
              ? 'bg-amber-500 text-black border-amber-400'
              : 'bg-zinc-900 text-zinc-300 border-zinc-700 hover:bg-zinc-800'
          }`}
        >
          House
        </button>
        {OPS_DESKS.map((desk) => {
          const on = selectedOpsDesk === desk.id
          return (
            <button
              key={desk.id}
              type="button"
              onClick={() => {
                setSelectedOpsDesk(desk.id)
                if (activeTab !== 'math') setActiveTab('scorecard')
              }}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold border transition ${
                on ? desk.chipOn : `${desk.chipOff} hover:bg-zinc-800`
              }`}
            >
              {desk.icon} {desk.id}
            </button>
          )
        })}
      </div>

      {/* Panel Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800/80 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-base">{inspectingDesk ? activeDeskMeta?.icon || '🎯' : '🎯'}</span>
            <span className="font-bold text-sm text-zinc-100">
              {inspectingDesk ? `${selectedOpsDesk} desk` : 'Sharp Syndicate Desk'}
            </span>
            <span className={`text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full ring-1 ${
              inspectingDesk
                ? activeDeskMeta?.badge || 'bg-amber-500/20 text-amber-300 ring-amber-500/40'
                : 'bg-amber-500/20 text-amber-300 ring-amber-500/40'
            }`}>
              {inspectingDesk ? activeDeskMeta?.title || 'Desk' : '4-Man Crew'}
            </span>
          </div>
          <div className="text-[11px] text-zinc-400 mt-0.5">
            {inspectingDesk
              ? `${activeDeskMeta?.lane || ''} Desk Math shows every equation. Preview still lists the vote and why.`
              : 'Scott, Rocco, Chedda & Tank. Desk Math shows the equations. Open a desk to inspect one vote board.'}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={busy || grading || loading}
            onClick={handleGradePicks}
            className="rounded-lg bg-emerald-600/80 hover:bg-emerald-500 px-2.5 py-1 text-xs font-semibold text-white shadow-sm transition disabled:opacity-50"
          >
            {grading ? 'Grading…' : 'Grade Pending'}
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={loadData}
            className="rounded-lg bg-zinc-800 hover:bg-zinc-700 px-2.5 py-1 text-xs text-zinc-300 transition disabled:opacity-50"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="mt-3">
        <SyndicateOpsWeekCalendar
          rows={splitsRows}
          supabaseClient={supabaseClient}
          botUserId={botUserId}
          onOpenTab={(tab) => setActiveTab(tab)}
        />
      </div>

      {/* Sub-Tab Navigation Bar */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5 border-b border-zinc-800/80 pb-2.5">
        {DESK_TABS.map((tab) => {
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                isActive
                  ? 'bg-amber-500 text-black shadow-sm'
                  : 'bg-zinc-900/80 text-zinc-400 hover:bg-zinc-800 hover:text-white border border-zinc-800/70'
              }`}
            >
              <span className="hidden sm:inline">{tab.label}</span>
              <span className="sm:hidden">{tab.shortLabel}</span>
            </button>
          )
        })}
      </div>

      {activeTab === 'pulls' && (
        <SyndicateWeeklyPullsPanel
          supabaseClient={supabaseClient}
          onOpenTab={(tab) => setActiveTab(tab)}
        />
      )}

      {activeTab === 'math' && (
        <SyndicateDeskMathPanel
          supabaseClient={supabaseClient}
          botSlug={botSlug}
          selectedDesk={selectedOpsDesk}
        />
      )}

      {/* Tab 1: Scorecard & Syndicate Drops */}
      {activeTab === 'scorecard' && (
        <div className="space-y-3 pt-2">
          <div className="rounded-lg bg-zinc-950/60 border border-zinc-800/80 p-3 space-y-2.5" data-syndicate-ops-composer>
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1 text-[11px] text-zinc-400 min-w-[7.5rem]">
                Sport
                <select
                  value={selectedSportKey}
                  onChange={(e) => setSelectedSportKey(e.target.value)}
                  disabled={busy || dropping}
                  className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-white focus:outline-none disabled:opacity-50"
                >
                  {OPS_SPORTS.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex flex-col gap-1 text-[11px] text-zinc-400 min-w-[11rem] flex-1">
                <div className="flex items-center gap-1">
                  <span>Drop</span>
                  <button
                    type="button"
                    onClick={() => setDropInfoOpen((open) => !open)}
                    aria-expanded={dropInfoOpen}
                    aria-controls="syndicate-ops-drop-info"
                    aria-label={dropInfoOpen ? 'Hide drop type explanations' : 'What each drop type is'}
                    className={`inline-flex h-5 w-5 items-center justify-center rounded-full border transition ${
                      dropInfoOpen
                        ? 'border-amber-500/50 bg-amber-500/15 text-amber-300'
                        : 'border-zinc-600 text-zinc-400 hover:border-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-3 w-3"
                      aria-hidden
                    >
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="16" x2="12" y2="12" />
                      <line x1="12" y1="8" x2="12.01" y2="8" />
                    </svg>
                  </button>
                </div>
                <select
                  value={selectedDropId}
                  onChange={(e) => setSelectedDropId(e.target.value)}
                  disabled={busy || dropping}
                  className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-white focus:outline-none disabled:opacity-50"
                >
                  {sportDrops.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {dropInfoOpen ? (
              <div id="syndicate-ops-drop-info">
                <SyndicateOpsDropInfo
                  drops={sportDrops}
                  selectedDropId={selectedDropId}
                  onSelectDrop={setSelectedDropId}
                />
              </div>
            ) : dropHint ? (
              <p className="text-[10px] text-zinc-500 leading-snug">{dropHint}</p>
            ) : null}

            {selectedDropId === 'solo' ? (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <select
                  value={cardMode}
                  onChange={(e) => setCardMode(e.target.value)}
                  className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-white focus:outline-none"
                >
                  <option value="auto">Auto Mode (Slate/Density)</option>
                  <option value="solo">Solo Pick</option>
                  <option value="syndicate">Syndicate Card (Multi-Picker)</option>
                </select>
                {cardMode !== 'syndicate' ? (
                  <select
                    value={selectedPicker}
                    onChange={(e) => setSelectedPicker(e.target.value)}
                    className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-white focus:outline-none"
                  >
                    <option value="auto">Auto Persona Match</option>
                    <option value="Scott">Scott (The Model / EV)</option>
                    <option value="Rocco">Rocco (Vegas Spreads)</option>
                    <option value="Chedda">Chedda (ML & Dogs)</option>
                    <option value="Tank">Tank (Totals / O/U)</option>
                  </select>
                ) : null}
              </div>
            ) : null}

            {selectedDropId !== 'monthly' && activeDestKind ? (
              <div className="rounded-md border border-zinc-800 bg-zinc-950/80 px-2.5 py-2 space-y-1.5">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <span className="text-zinc-400 font-medium text-[11px]">Send to:</span>
                  {SEND_TO_KEYS.filter(
                    ({ key }) => key !== 'loungeFanOnly' || FAN_ONLY_DROP_KINDS.has(activeDestKind),
                  ).map(({ key, label }) => (
                    <label key={key} className="inline-flex items-center gap-1.5 text-[11px] text-zinc-200 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean(sendTo[key])}
                        onChange={() => toggleSendTo(key)}
                        className="rounded border-zinc-600 bg-zinc-900 text-amber-500 focus:ring-amber-500/40"
                      />
                      {label}
                    </label>
                  ))}
                </div>
                <p className="text-[10px] text-zinc-500 leading-snug">
                  Applies to Publish for the drop above, including Picks for today. Leave the bar alone for normal defaults
                  ... public drops include X; primetime is public Lounge + VIP chat + X (same 4-desk card, no fan-only
                  Lounge); VIP-only (halftime, middle, UFC) stay VIP unless you check Public Lounge or X. Preview
                  ignores destinations.
                </p>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-1.5">
              {selectedDropId === 'monthly' ? (
                <>
                  <button
                    type="button"
                    disabled={busy || dropping || loading}
                    onClick={() => handleMonthlyScoreboard(1)}
                    className="rounded bg-violet-700/80 hover:bg-violet-600 px-3 py-1 text-[11px] font-bold text-white transition disabled:opacity-50"
                  >
                    This month
                  </button>
                  <button
                    type="button"
                    disabled={busy || dropping || loading}
                    onClick={() => handleMonthlyScoreboard(3)}
                    className="rounded bg-zinc-800 hover:bg-zinc-700 px-2.5 py-1 text-[11px] font-medium text-zinc-300 transition disabled:opacity-50"
                  >
                    3 mo
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={busy || dropping || loading}
                    onClick={() => void handleRunSelectedDrop(true)}
                    className="rounded bg-zinc-800 hover:bg-zinc-700 px-2.5 py-1 text-[11px] font-medium text-zinc-300 transition disabled:opacity-50"
                  >
                    Preview
                  </button>
                  <button
                    type="button"
                    disabled={busy || dropping || loading}
                    onClick={() => void handleRunSelectedDrop(false)}
                    className="rounded bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 px-3 py-1 text-[11px] font-bold text-white shadow-sm transition disabled:opacity-50"
                  >
                    {dropping ? 'Publishing…' : 'Publish'}
                  </button>
                </>
              )}
            </div>
            {inspectingDesk && selectedDropId !== 'monthly' ? (
              <p className="text-[10px] text-zinc-500 leading-snug">
                Preview on this desk shows {selectedOpsDesk}&apos;s vote and why. Publish still sends the house card, not a
                solo {selectedOpsDesk} post.
              </p>
            ) : null}
          </div>

          {inspectingDesk ? (
            <SyndicateDeskEvalBoard
              deskId={selectedOpsDesk}
              rows={activeDeskRows}
              sportLabel={dropPreview?.sportLabel || sportLabel(selectedSportKey)}
              emptyHint={
                dropPreview
                  ? 'This drop did not return desk votes. Use Picks for today, Slate, Primetime, or UFC.'
                  : `Pick ${sportLabel(selectedSportKey)} + a drop, then Preview. ${selectedOpsDesk} will list every game and why.`
              }
            />
          ) : null}
          {inspectingDesk && dropPreview ? (
            <details className="rounded-lg border border-zinc-800 bg-zinc-950/40">
              <summary className="cursor-pointer px-3 py-2 text-[11px] font-semibold text-zinc-400 hover:text-zinc-200">
                House post preview (what Publish would send)
              </summary>
              <div className="px-1 pb-2">
                <SyndicateDryRunPreview preview={dropPreview} onDismiss={() => setDropPreview(null)} />
              </div>
            </details>
          ) : (
            <SyndicateDryRunPreview preview={dropPreview} onDismiss={() => setDropPreview(null)} />
          )}

          {monthlyBoard && (
            <div className="rounded-lg bg-zinc-950/60 border border-violet-900/50 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-semibold text-violet-300">
                  Monthly scoreboard · {monthlyBoard.period?.label}
                </div>
                <button
                  type="button"
                  onClick={() => setMonthlyBoard(null)}
                  className="text-[10px] text-zinc-500 hover:text-zinc-300"
                >
                  Clear
                </button>
              </div>
              <p className="text-[10px] text-zinc-500">
                Bucket × desk is the truth. CLV = your side vs locked close (not opener).
                Trust floor n≥{monthlyBoard.trust_min_n || 25} before crowning. Do not average Hammer + Consensus into shop ATS.
              </p>
              {monthlyBoard.rows?.length > 0 && (
                <div className="overflow-x-auto">
                  <div className="text-[10px] text-violet-400/80 mb-1 font-medium">By bucket × desk</div>
                  <table className="w-full text-[11px] text-left">
                    <thead className="text-zinc-500 border-b border-zinc-800">
                      <tr>
                        <th className="py-1 pr-2 font-medium">Bucket</th>
                        <th className="py-1 pr-2 font-medium">Desk</th>
                        <th className="py-1 pr-2 font-medium">n</th>
                        <th className="py-1 pr-2 font-medium">ATS</th>
                        <th className="py-1 pr-2 font-medium">CLV avg</th>
                        <th className="py-1 font-medium">Trust</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthlyBoard.rows.map((r) => (
                        <tr key={`${r.bucket}-${r.desk}`} className="border-b border-zinc-900 text-zinc-200">
                          <td className="py-1 pr-2">{r.bucket}</td>
                          <td className="py-1 pr-2 font-semibold">{r.desk}</td>
                          <td className="py-1 pr-2 tabular-nums">{r.n}</td>
                          <td className="py-1 pr-2 tabular-nums">
                            {r.bucket === 'pass' ? 'pass' : `${r.wins}-${r.losses}`}
                          </td>
                          <td className="py-1 pr-2 tabular-nums">
                            {r.clv_avg_pts != null ? `${r.clv_avg_pts > 0 ? '+' : ''}${r.clv_avg_pts}` : 'n/a'}
                            {r.clv_n ? <span className="text-zinc-500"> (n={r.clv_n})</span> : null}
                          </td>
                          <td className="py-1 text-[10px]">
                            {r.bucket === 'pass'
                              ? 'n only'
                              : r.trusted
                                ? <span className="text-emerald-400">ok</span>
                                : <span className="text-amber-400/90">thin</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {monthlyBoard.by_desk?.length > 0 && (
                <div className="overflow-x-auto pt-1">
                  <div className="text-[10px] text-zinc-500 mb-1">
                    Desk rollup (mixed buckets ... informal only, never crown from this)
                  </div>
                  <table className="w-full text-[10px] text-left">
                    <thead className="text-zinc-500 border-b border-zinc-800">
                      <tr>
                        <th className="py-1 pr-2">Desk</th>
                        <th className="py-1 pr-2">Lane</th>
                        <th className="py-1 pr-2">n</th>
                        <th className="py-1 pr-2">ATS</th>
                        <th className="py-1">CLV avg</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthlyBoard.by_desk.map((d) => (
                        <tr key={d.desk} className="border-b border-zinc-900 text-zinc-400">
                          <td className="py-0.5 pr-2">{d.desk}</td>
                          <td className="py-0.5 pr-2">{d.lane}</td>
                          <td className="py-0.5 pr-2 tabular-nums">{d.n}</td>
                          <td className="py-0.5 pr-2 tabular-nums">{d.wins}-{d.losses}</td>
                          <td className="py-0.5 tabular-nums">
                            {d.clv_avg_pts != null ? `${d.clv_avg_pts > 0 ? '+' : ''}${d.clv_avg_pts}` : 'n/a'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {(!monthlyBoard.rows || monthlyBoard.rows.length === 0) && (
                <p className="text-[11px] text-zinc-500">No graded / pass rows in this window yet.</p>
              )}
            </div>
          )}

          {/* Overall syndicate banner with Timeframe & Sport Controls */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-zinc-900/90 border border-zinc-800 px-3 py-2 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-zinc-400 font-medium">
                Syndicate Record:
                <span className="ml-1.5 font-bold text-white tabular-nums">
                  {overall.wins}-{overall.losses}{overall.pushes > 0 ? `-${overall.pushes}` : ''}
                </span>
                <span className="ml-2 text-zinc-500">({overall.win_rate_pct}% win)</span>
              </div>

              {/* Timeframe pill selector */}
              <div className="flex items-center gap-1 rounded bg-zinc-950 px-1 py-0.5 text-[10px] ring-1 ring-zinc-800">
                {TIMEFRAME_OPTIONS.map((tf) => (
                  <button
                    key={tf.id}
                    type="button"
                    onClick={() => setTimeframe(tf.id)}
                    className={`rounded px-1.5 py-0.5 font-semibold transition ${
                      timeframe === tf.id ? 'bg-amber-500 text-black' : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    {tf.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-zinc-400">
                Units Net:{' '}
                <span className={`font-bold tabular-nums ${Number(overall.units_net) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {Number(overall.units_net) > 0 ? `+${overall.units_net}` : overall.units_net}u
                </span>
              </span>
              {overall.pending > 0 && (
                <span className="text-amber-400 font-medium tabular-nums">
                  {overall.pending} pending
                </span>
              )}
            </div>
          </div>

          {/* Sport filter tabs if multiple sports logged */}
          {recordData?.sports?.length > 0 && (
            <div className="flex flex-wrap items-center gap-1 text-[11px]">
              <span className="text-zinc-500 font-medium text-[10px]">Sport:</span>
              <button
                type="button"
                onClick={() => setPortalSportKey('all')}
                className={`rounded px-2 py-0.5 font-medium transition ring-1 ${
                  portalSportKey === 'all'
                    ? 'bg-zinc-200 text-black ring-white'
                    : 'bg-zinc-900 text-zinc-400 ring-zinc-800 hover:text-white'
                }`}
              >
                All
              </button>
              {recordData.sports.map((sp) => {
                const active = portalSportKey === sp.sport_key
                const spUnits = Number(sp.units_net) || 0
                return (
                  <button
                    key={sp.sport_key}
                    type="button"
                    onClick={() => setPortalSportKey(sp.sport_key)}
                    className={`rounded px-2 py-0.5 font-medium transition ring-1 ${
                      active
                        ? 'bg-amber-500 text-black ring-amber-400'
                        : 'bg-zinc-900 text-zinc-300 ring-zinc-800 hover:text-white'
                    }`}
                  >
                    {sp.sport_label} ({spUnits > 0 ? `+${spUnits}u` : `${spUnits}u`})
                  </button>
                )
              })}
            </div>
          )}

          {/* Profile Bio Live Preview */}
          {recordData?.highlight_text && (
            <div className="flex items-center justify-between gap-2 rounded bg-zinc-950/80 border border-zinc-800/80 px-2.5 py-1 text-[11px]">
              <div className="flex items-center gap-1.5 truncate text-zinc-300">
                <span className="text-xs">💬</span>
                <span className="font-semibold text-zinc-400">Bio Highlight:</span>
                <span className="truncate text-amber-200/90 font-mono text-[10.5px]">
                  {recordData.highlight_text}
                </span>
              </div>
              <span className="text-[10px] text-emerald-400/90 font-medium whitespace-nowrap">
                Auto-Synced
              </span>
            </div>
          )}

          {/* 4 Pickers Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {['Scott', 'Rocco', 'Chedda', 'Tank'].map((name) => {
              const stats = pickers[name] || { wins: 0, losses: 0, pushes: 0, win_rate_pct: 0, units_net: 0 }
              const meta = PICKER_METAS[name] || { title: 'Picker', badge: 'bg-zinc-800 text-zinc-200' }
              const unitsNum = Number(stats.units_net) || 0

              return (
                <div
                  key={name}
                  className="rounded-xl bg-zinc-950/60 border border-zinc-800/80 p-2.5 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm text-white">{name}</span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ring-1 ${meta.badge}`}>
                        {meta.title}
                      </span>
                    </div>
                    <div className="mt-2 text-xs font-semibold text-zinc-200 tabular-nums">
                      {stats.wins}-{stats.losses}{stats.pushes > 0 ? `-${stats.pushes}` : ''}
                      <span className="text-[10px] text-zinc-400 font-normal ml-1">
                        ({stats.win_rate_pct}%)
                      </span>
                    </div>
                  </div>
                  <div className="mt-2 pt-1.5 border-t border-zinc-800/60 flex items-center justify-between text-[11px]">
                    <span className="text-zinc-500 text-[10px]">Net</span>
                    <span className={`font-bold tabular-nums ${unitsNum >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {unitsNum > 0 ? `+${unitsNum.toFixed(2)}` : unitsNum.toFixed(2)}u
                    </span>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Recent Picks Table */}
          {recentPicks.length > 0 && (
            <div className="border-t border-zinc-800/70 pt-3">
              <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                Recent Syndicate Picks
              </div>
              <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                {recentPicks.map((pick) => {
                  const meta = PICKER_METAS[pick.picker_name]
                  const isWon = pick.status === 'won'
                  const isLost = pick.status === 'lost'
                  const isPending = pick.status === 'pending'
                  const isPush = pick.status === 'push'

                  const statusBadge = isWon
                    ? 'bg-emerald-950/80 text-emerald-300 ring-emerald-500/40'
                    : isLost
                      ? 'bg-rose-950/80 text-rose-300 ring-rose-500/40'
                      : isPush
                        ? 'bg-zinc-800 text-zinc-300 ring-zinc-600/40'
                        : 'bg-amber-950/80 text-amber-300 ring-amber-500/40'

                  const lineStr = pick.pick_line != null
                    ? `${pick.pick_name} ${Number(pick.pick_line) > 0 ? `+${pick.pick_line}` : pick.pick_line}`
                    : pick.pick_name

                  return (
                    <div
                      key={pick.id}
                      className="flex flex-wrap items-center justify-between gap-1.5 rounded-lg bg-zinc-900/60 border border-zinc-800/60 px-2.5 py-1.5 text-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ring-1 ${meta?.badge || 'bg-zinc-800 text-zinc-200'}`}>
                          {pick.picker_name}
                        </span>
                        <span className="font-semibold text-white truncate">{lineStr}</span>
                        <span className="text-[11px] text-zinc-400 truncate">
                          ({pick.away_team} @ {pick.home_team})
                        </span>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {pick.home_score != null && pick.away_score != null && (
                          <span className="text-[10px] text-zinc-400 tabular-nums">
                            {pick.away_score}-{pick.home_score}
                          </span>
                        )}
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ring-1 uppercase tabular-nums ${statusBadge}`}>
                          {isPending
                            ? 'Pending'
                            : isWon
                              ? `Won +${pick.units_net}u`
                              : isLost
                                ? `Lost ${pick.units_net}u`
                                : 'Push'}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab: Chedda splits paste (Action / VSiN) */}
      {activeTab === 'splits' && (
        <div className="pt-2">
          <BotBettingSplitsPaste
            supabaseClient={supabaseClient}
            setToast={setToast}
            scheduleRows={splitsRows}
          />
        </div>
      )}

      {/* Tab 2: NFL Injury PVALs */}
      {activeTab === 'pvals' && (
        <div className="pt-2">
          <BotPlayerPvalEditor
            supabaseClient={supabaseClient}
            setToast={setToast}
          />
        </div>
      )}

      {/* Tab 3: NFL EPA & Trenches */}
      {activeTab === 'trench_epa' && (
        <div className="pt-2">
          <BotTeamMetricsEditor
            supabaseClient={supabaseClient}
            setToast={setToast}
          />
        </div>
      )}

      {/* Tab 4: CFB Power Index */}
      {activeTab === 'cfb_power' && (
        <div className="pt-2">
          <BotCfbPowerRatingsEditor
            supabaseClient={supabaseClient}
            setToast={setToast}
          />
        </div>
      )}

      {/* Tab 5: UFC Fighter Metrics */}
      {activeTab === 'ufc_metrics' && (
        <div className="pt-2">
          <BotUfcMetricsEditor
            supabaseClient={supabaseClient}
            setToast={setToast}
          />
        </div>
      )}
    </div>
  )
}
