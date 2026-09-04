import { useCallback, useEffect, useState } from 'react'
import {
  fetchBotPicksRecord,
  fetchBotRecentPicks,
  invokeLoungeOddsGradePicks,
  invokeLoungeOddsPredictivePick,
  invokeLoungeOddsSlateCard,
  invokeLoungeOddsWongTeaser,
  invokeLoungeOddsPrimetimeSpotlight,
  invokeLoungeOddsWeeklyRecap,
  invokeLoungeOddsMonthlyScoreboard,
  invokeLoungeOddsHalftimePivot,
  invokeLoungeOddsAnytimeTd,
  invokeLoungeOddsMiddleArb,
  invokeLoungeOddsUfcCard,
} from './botPortalApi.js'
import BotPlayerPvalEditor from './BotPlayerPvalEditor.jsx'
import BotTeamMetricsEditor from './BotTeamMetricsEditor.jsx'
import BotCfbPowerRatingsEditor from './BotCfbPowerRatingsEditor.jsx'
import BotUfcMetricsEditor from './BotUfcMetricsEditor.jsx'
import BotBettingSplitsPaste from './BotBettingSplitsPaste.jsx'
import BotLaneBTicketsPanel from './BotLaneBTicketsPanel.jsx'
import { SyndicateDryRunPreview } from '../../syndicate/SyndicateDryRunPreview.jsx'

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
  Quorum: {
    title: 'Blend Desk',
    badge: 'bg-red-950/70 text-red-300 ring-red-500/30',
  },
  Tank: {
    title: 'Totals & Primetime',
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
  { id: 'scorecard', label: '🎯 Scorecard & Drops', shortLabel: 'Scorecard' },
  { id: 'splits', label: '🧀 Chedda Splits Paste', shortLabel: 'Splits' },
  { id: 'lane_b', label: '📡 Lane B Tickets', shortLabel: 'Lane B' },
  { id: 'pvals', label: '🩹 NFL Injury PVALs', shortLabel: 'NFL PVALs' },
  { id: 'trench_epa', label: '🏈 NFL EPA & Trenches', shortLabel: 'NFL Trenches' },
  { id: 'cfb_power', label: '🎓 CFB Power Index', shortLabel: 'CFB Ratings' },
  { id: 'ufc_metrics', label: '🥊 UFC Fighter Metrics', shortLabel: 'UFC Metrics' },
]

export function BotSharpDeskPanel({
  supabaseClient,
  botUserId,
  botSlug,
  setToast,
  busy,
  setBusy,
  selectedSportKey,
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
    const hasAnyCaption = Boolean(caption || vipCaption || (threadParts && threadParts.length))
    const err =
      data?.ok === false
        ? String(data.message || data.error || fallbackError || 'No preview.')
        : data?.skipped
          ? String(data.note || data.skipped)
          : !hasAnyCaption
            ? fallbackError || 'No caption returned for this dry run.'
            : null
    setDropPreview({
      sportLabel: title,
      dayKey: data?.dayKey || data?.sportKey || null,
      previewCaption: caption || null,
      vipPreviewCaption: vipCaption || null,
      subscriberThreadParts: threadParts,
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
    setToast?.(hasAnyCaption ? 'Full post preview ready below.' : err || 'Preview ready below.')
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
    setDropping(true)
    if (setBusy) setBusy(true)
    try {
      const { data, error } = await invokeLoungeOddsPredictivePick(supabaseClient, {
        slug: botSlug,
        cardMode,
        pickerName: selectedPicker !== 'auto' ? selectedPicker : undefined,
        sportKey: selectedSportKey || undefined,
        dryRun,
      })
      if (error) {
        setToast?.(`Drop failed: ${error.message}`)
      } else if (data?.dryRun) {
        showDropDryRunPreview('Solo / Spot Drop', data)
      } else if (data?.ok) {
        const msg = data.isSyndicate
          ? `Published Syndicate Card (${data.pickIds?.length || 0} picks)`
          : `Published Solo Pick for ${data.pickerName}`
        setToast?.(msg)
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
    setDropping(true)
    if (setBusy) setBusy(true)
    const sportName = sportKey === 'americanfootball_ncaaf' ? 'CFB' : 'NFL'
    try {
      const { data, error } = await invokeLoungeOddsSlateCard(supabaseClient, {
        slug: botSlug,
        sportKey,
        dryRun,
      })
      if (error) {
        setToast?.(`${sportName} Slate Card failed: ${error.message}`)
      } else if (data?.dryRun) {
        showDropDryRunPreview(`${sportName} Slate`, data)
      } else if (data?.ok) {
        setToast?.(`Published ${sportName} Slate Card: ${data.totalGames || 0} games (${data.hammersCount || 0} Hammers, ${data.consensusCount || 0} Consensus).`)
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
    setDropping(true)
    if (setBusy) setBusy(true)
    try {
      const { data, error } = await invokeLoungeOddsWongTeaser(supabaseClient, {
        slug: botSlug,
        dryRun,
      })
      if (error) {
        setToast?.(`Wong Teaser drop failed: ${error.message}`)
      } else if (data?.dryRun) {
        showDropDryRunPreview('Wong Teaser', data)
      } else if (data?.ok) {
        setToast?.(`Published 2-Leg Wong Teaser of the Week!`)
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
    setDropping(true)
    if (setBusy) setBusy(true)
    const label = primetimeType || 'Primetime'
    try {
      const { data, error } = await invokeLoungeOddsPrimetimeSpotlight(supabaseClient, {
        slug: botSlug,
        primetimeType,
        dryRun,
      })
      if (error) {
        setToast?.(`${label} Spotlight failed: ${error.message}`)
      } else if (data?.dryRun) {
        showDropDryRunPreview(`${label} Spotlight`, data)
      } else if (data?.ok) {
        const sp = data?.spotlight
        setToast?.(`Published ${sp?.primetimeLabel || label} Spotlight: ${sp?.awayTeam} @ ${sp?.homeTeam}`)
        await loadData()
      } else if (dryRun) {
        showDropDryRunPreview(`${label} Spotlight`, data, data?.message || `No eligible ${label} game found on active board.`)
      } else {
        setToast?.(data?.message || `No eligible ${label} game found on active board.`)
      }
    } catch (err) {
      setToast?.(`${label} Spotlight error: ${err.message}`)
    } finally {
      setDropping(false)
      if (setBusy) setBusy(false)
    }
  }

  const handleDropWeeklyRecap = async (dryRun = false) => {
    setDropping(true)
    if (setBusy) setBusy(true)
    try {
      const { data, error } = await invokeLoungeOddsWeeklyRecap(supabaseClient, {
        slug: botSlug,
        dryRun,
      })
      if (error) {
        setToast?.(`Weekly Recap failed: ${error.message}`)
      } else if (data?.dryRun) {
        showDropDryRunPreview('Weekly Recap', data)
      } else if (data?.ok) {
        setToast?.('Published Tuesday Weekly Syndicate Ledger & Post-Mortem!')
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
    setDropping(true)
    if (setBusy) setBusy(true)
    try {
      const { data, error } = await invokeLoungeOddsHalftimePivot(supabaseClient, {
        slug: botSlug,
        dryRun,
      })
      if (error) {
        setToast?.(`Halftime Pivot failed: ${error.message}`)
      } else if (data?.dryRun) {
        showDropDryRunPreview('Halftime Pivot', data)
      } else if (data?.ok) {
        setToast?.(`Published Halftime Pivot to Sharpe VIP chat!`)
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
    setDropping(true)
    if (setBusy) setBusy(true)
    try {
      const { data, error } = await invokeLoungeOddsAnytimeTd(supabaseClient, {
        slug: botSlug,
        dryRun,
      })
      if (error) {
        setToast?.(`Anytime TD drop failed: ${error.message}`)
      } else if (data?.dryRun) {
        showDropDryRunPreview('Anytime TD', data)
      } else if (data?.ok) {
        setToast?.(`Published Chedda's TD of the Week & VIP 3-player slate!`)
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
    setDropping(true)
    if (setBusy) setBusy(true)
    try {
      const { data, error } = await invokeLoungeOddsMiddleArb(supabaseClient, {
        slug: botSlug,
        dryRun,
      })
      if (error) {
        setToast?.(`Middle & Arb Scanner failed: ${error.message}`)
      } else if (data?.dryRun) {
        showDropDryRunPreview('Middle & Arb', data)
      } else if (data?.ok) {
        setToast?.(`Published Live Middle / Arb Alert to Sharpe VIP chat!`)
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
    setDropping(true)
    if (setBusy) setBusy(true)
    try {
      const { data, error } = await invokeLoungeOddsUfcCard(supabaseClient, {
        slug: botSlug,
        dryRun,
        cardTitle: 'UFC Main Card',
      })
      if (error) {
        setToast?.(`UFC Slate Card failed: ${error.message}`)
      } else if (data?.dryRun) {
        showDropDryRunPreview('UFC Slate', data)
      } else if (data?.ok) {
        setToast?.(`Published UFC Syndicate Card (${data?.totalPicksRecorded || 0} picks recorded)!`)
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

  const overall = recordData?.overall || { wins: 0, losses: 0, pushes: 0, pending: 0, win_rate_pct: 0, units_net: 0 }
  const pickers = recordData?.pickers || {}

  return (
    <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-950/15 p-3 sm:p-4 text-white">
      {/* Panel Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800/80 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-base">🎯</span>
            <span className="font-bold text-sm text-zinc-100">Sharp Syndicate Desk</span>
            <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/40">
              4-Man Crew
            </span>
          </div>
          <div className="text-[11px] text-zinc-400 mt-0.5">
            Scott, Rocco, Chedda & Tank predictive betting tally ... auto-graded against final scores.
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

      {/* Tab 1: Scorecard & Syndicate Drops */}
      {activeTab === 'scorecard' && (
        <div className="space-y-3 pt-2">
          <SyndicateDryRunPreview preview={dropPreview} onDismiss={() => setDropPreview(null)} />
          {/* Manual Drop & Specialty Engine Controls */}
          <div className="rounded-lg bg-zinc-950/60 border border-zinc-800/80 p-3 space-y-2.5">
            {/* Row 1: Solo & General Syndicate Drops */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800/60 pb-2.5">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-zinc-400 font-medium text-[11px]">Solo / Spot:</span>
                <select
                  value={cardMode}
                  onChange={(e) => setCardMode(e.target.value)}
                  className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-white focus:outline-none"
                >
                  <option value="auto">Auto Mode (Slate/Density)</option>
                  <option value="solo">Solo Pick</option>
                  <option value="syndicate">Syndicate Card (Multi-Picker)</option>
                </select>

                {cardMode !== 'syndicate' && (
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
                )}
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={busy || dropping || loading}
                  onClick={() => handleDropPick(true)}
                  className="rounded bg-zinc-800 hover:bg-zinc-700 px-2.5 py-1 text-[11px] font-medium text-zinc-300 transition disabled:opacity-50"
                >
                  Preview
                </button>
                <button
                  type="button"
                  disabled={busy || dropping || loading}
                  onClick={() => handleDropPick(false)}
                  className="rounded bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 px-3 py-1 text-[11px] font-bold text-white shadow-sm transition disabled:opacity-50"
                >
                  {dropping ? 'Publishing…' : 'Publish Pick'}
                </button>
              </div>
            </div>

            {/* Row 2: Specialty Engine Triggers (NFL/CFB Slate Cards & Wong Teasers) */}
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="text-zinc-400 font-medium text-[11px]">Specialty Drops:</span>
              <div className="flex flex-wrap items-center gap-2">
                {/* NFL Slate Card */}
                <div className="flex items-center gap-1 rounded bg-zinc-900 border border-zinc-800 px-2 py-1">
                  <span className="font-semibold text-zinc-200 text-[11px]">🏈 NFL Slate:</span>
                  <button
                    type="button"
                    disabled={busy || dropping || loading}
                    onClick={() => handleDropSlateCard('americanfootball_nfl', true)}
                    className="rounded bg-zinc-800 hover:bg-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-300 transition disabled:opacity-50"
                  >
                    Preview
                  </button>
                  <button
                    type="button"
                    disabled={busy || dropping || loading}
                    onClick={() => handleDropSlateCard('americanfootball_nfl', false)}
                    className="rounded bg-blue-600/80 hover:bg-blue-500 px-2 py-0.5 text-[10px] font-bold text-white transition disabled:opacity-50"
                  >
                    Publish
                  </button>
                </div>

                {/* CFB Slate Card */}
                <div className="flex items-center gap-1 rounded bg-zinc-900 border border-zinc-800 px-2 py-1">
                  <span className="font-semibold text-zinc-200 text-[11px]">🎓 CFB Slate:</span>
                  <button
                    type="button"
                    disabled={busy || dropping || loading}
                    onClick={() => handleDropSlateCard('americanfootball_ncaaf', true)}
                    className="rounded bg-zinc-800 hover:bg-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-300 transition disabled:opacity-50"
                  >
                    Preview
                  </button>
                  <button
                    type="button"
                    disabled={busy || dropping || loading}
                    onClick={() => handleDropSlateCard('americanfootball_ncaaf', false)}
                    className="rounded bg-purple-600/80 hover:bg-purple-500 px-2 py-0.5 text-[10px] font-bold text-white transition disabled:opacity-50"
                  >
                    Publish
                  </button>
                </div>

                {/* Wong Teaser */}
                <div className="flex items-center gap-1 rounded bg-zinc-900 border border-zinc-800 px-2 py-1">
                  <span className="font-semibold text-zinc-200 text-[11px]">⚡ Wong Teaser:</span>
                  <button
                    type="button"
                    disabled={busy || dropping || loading}
                    onClick={() => handleDropWongTeaser(true)}
                    className="rounded bg-zinc-800 hover:bg-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-300 transition disabled:opacity-50"
                  >
                    Preview
                  </button>
                  <button
                    type="button"
                    disabled={busy || dropping || loading}
                    onClick={() => handleDropWongTeaser(false)}
                    className="rounded bg-emerald-600/80 hover:bg-emerald-500 px-2 py-0.5 text-[10px] font-bold text-white transition disabled:opacity-50"
                  >
                    Publish
                  </button>
                </div>

                {/* Primetime Spotlights (TNF/SNF/MNF) */}
                <div className="flex items-center gap-1 rounded bg-zinc-900 border border-zinc-800 px-2 py-1">
                  <span className="font-semibold text-amber-300 text-[11px]">📺 Primetime:</span>
                  <button
                    type="button"
                    disabled={busy || dropping || loading}
                    onClick={() => handleDropPrimetimeSpotlight(undefined, true)}
                    className="rounded bg-zinc-800 hover:bg-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-300 transition disabled:opacity-50"
                  >
                    Preview
                  </button>
                  <button
                    type="button"
                    disabled={busy || dropping || loading}
                    onClick={() => handleDropPrimetimeSpotlight(undefined, false)}
                    className="rounded bg-gradient-to-r from-amber-600 to-rose-600 hover:from-amber-500 hover:to-rose-500 px-2 py-0.5 text-[10px] font-bold text-white transition disabled:opacity-50"
                  >
                    Publish
                  </button>
                </div>

                {/* Tuesday Ledger & Recap */}
                <div className="flex items-center gap-1 rounded bg-zinc-900 border border-zinc-800 px-2 py-1">
                  <span className="font-semibold text-emerald-300 text-[11px]">📊 Weekly Recap:</span>
                  <button
                    type="button"
                    disabled={busy || dropping || loading}
                    onClick={() => handleDropWeeklyRecap(true)}
                    className="rounded bg-zinc-800 hover:bg-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-300 transition disabled:opacity-50"
                  >
                    Preview
                  </button>
                  <button
                    type="button"
                    disabled={busy || dropping || loading}
                    onClick={() => handleDropWeeklyRecap(false)}
                    className="rounded bg-emerald-600/80 hover:bg-emerald-500 px-2 py-0.5 text-[10px] font-bold text-white transition disabled:opacity-50"
                  >
                    Publish
                  </button>
                </div>

                {/* Monthly ATS + CLV scoreboard (ops only) */}
                <div className="flex items-center gap-1 rounded bg-zinc-900 border border-zinc-800 px-2 py-1">
                  <span className="font-semibold text-violet-300 text-[11px]">📋 Monthly Board:</span>
                  <button
                    type="button"
                    disabled={busy || dropping || loading}
                    onClick={() => handleMonthlyScoreboard(1)}
                    className="rounded bg-violet-700/80 hover:bg-violet-600 px-2 py-0.5 text-[10px] font-bold text-white transition disabled:opacity-50"
                  >
                    This month
                  </button>
                  <button
                    type="button"
                    disabled={busy || dropping || loading}
                    onClick={() => handleMonthlyScoreboard(3)}
                    className="rounded bg-zinc-800 hover:bg-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-300 transition disabled:opacity-50"
                  >
                    3 mo
                  </button>
                </div>

                {/* Halftime Pivot (VIP Sub-Chat) */}
                <div className="flex items-center gap-1 rounded bg-zinc-900 border border-zinc-800 px-2 py-1">
                  <span className="font-semibold text-cyan-300 text-[11px]">⚡ Halftime Pivot:</span>
                  <button
                    type="button"
                    disabled={busy || dropping || loading}
                    onClick={() => handleDropHalftimePivot(true)}
                    className="rounded bg-zinc-800 hover:bg-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-300 transition disabled:opacity-50"
                  >
                    Preview
                  </button>
                  <button
                    type="button"
                    disabled={busy || dropping || loading}
                    onClick={() => handleDropHalftimePivot(false)}
                    className="rounded bg-cyan-600/80 hover:bg-cyan-500 px-2 py-0.5 text-[10px] font-bold text-white transition disabled:opacity-50"
                  >
                    Publish
                  </button>
                </div>

                {/* Anytime TD / Player Props */}
                <div className="flex items-center gap-1 rounded bg-zinc-900 border border-zinc-800 px-2 py-1">
                  <span className="font-semibold text-rose-300 text-[11px]">🏈 Anytime TD:</span>
                  <button
                    type="button"
                    disabled={busy || dropping || loading}
                    onClick={() => handleDropAnytimeTd(true)}
                    className="rounded bg-zinc-800 hover:bg-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-300 transition disabled:opacity-50"
                  >
                    Preview
                  </button>
                  <button
                    type="button"
                    disabled={busy || dropping || loading}
                    onClick={() => handleDropAnytimeTd(false)}
                    className="rounded bg-rose-600/80 hover:bg-rose-500 px-2 py-0.5 text-[10px] font-bold text-white transition disabled:opacity-50"
                  >
                    Publish
                  </button>
                </div>

                {/* Middle & Arbitrage Scanner (VIP Sub-Chat) */}
                <div className="flex items-center gap-1 rounded bg-zinc-900 border border-zinc-800 px-2 py-1">
                  <span className="font-semibold text-purple-300 text-[11px]">🎯 Middle & Arb:</span>
                  <button
                    type="button"
                    disabled={busy || dropping || loading}
                    onClick={() => handleDropMiddleArb(true)}
                    className="rounded bg-zinc-800 hover:bg-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-300 transition disabled:opacity-50"
                  >
                    Preview
                  </button>
                  <button
                    type="button"
                    disabled={busy || dropping || loading}
                    onClick={() => handleDropMiddleArb(false)}
                    className="rounded bg-purple-600/80 hover:bg-purple-500 px-2 py-0.5 text-[10px] font-bold text-white transition disabled:opacity-50"
                  >
                    Publish
                  </button>
                </div>

                {/* UFC Slate Card */}
                <div className="flex items-center gap-1 rounded bg-zinc-900 border border-zinc-800 px-2 py-1">
                  <span className="font-semibold text-red-300 text-[11px]">🥊 UFC Slate:</span>
                  <button
                    type="button"
                    disabled={busy || dropping || loading}
                    onClick={() => handleDropUfcCard(true)}
                    className="rounded bg-zinc-800 hover:bg-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-300 transition disabled:opacity-50"
                  >
                    Preview
                  </button>
                  <button
                    type="button"
                    disabled={busy || dropping || loading}
                    onClick={() => handleDropUfcCard(false)}
                    className="rounded bg-red-600/80 hover:bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white transition disabled:opacity-50"
                  >
                    Publish
                  </button>
                </div>
              </div>
            </div>
          </div>

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
          />
        </div>
      )}

      {activeTab === 'lane_b' && (
        <div className="pt-2">
          <BotLaneBTicketsPanel
            supabaseClient={supabaseClient}
            setToast={setToast}
            selectedSportKey={selectedSportKey || portalSportKey}
            botSlug={botSlug}
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
