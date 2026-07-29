import { useState, useRef, useMemo } from 'react'
import { parseCsvImport } from '../../utils/bankrollCsvImport.js'
import { formatCashGameLabel } from './pokerSessionLabels.js'

// Same CSV import UX as slots BankrollImportSheet → poker_bankroll_sessions.

function fmt$(n) {
  if (n == null || isNaN(n)) return '-'
  const abs = Math.abs(n)
  const str =
    abs >= 10000
      ? '$' + Math.round(abs).toLocaleString()
      : abs >= 100
        ? '$' + abs.toFixed(0)
        : '$' + abs.toFixed(2)
  return n < 0 ? '-' + str : str
}

function fmtDate(isoStr) {
  if (!isoStr) return ''
  return new Date(isoStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function Header({ title, onBack, onClose }) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div className="flex items-center gap-2">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="w-8 h-8 flex items-center justify-center rounded-full text-zinc-400 hover:text-white touch-manipulation"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path
                fillRule="evenodd"
                d="M11.78 5.22a.75.75 0 0 1 0 1.06L8.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        )}
        <h2 className="text-white font-bold text-lg">{title}</h2>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="w-8 h-8 flex items-center justify-center rounded-full text-zinc-400 hover:text-white touch-manipulation"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
          <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
        </svg>
      </button>
    </div>
  )
}

function SkipBadge({ count, label }) {
  if (!count) return null
  return (
    <div className="flex items-center gap-2 text-sm text-amber-400">
      <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 shrink-0">
        <path
          fillRule="evenodd"
          d="M6.701 2.25c.577-1 2.02-1 2.598 0l5.196 9a1.5 1.5 0 0 1-1.299 2.25H2.804a1.5 1.5 0 0 1-1.3-2.25l5.197-9ZM8 4a.75.75 0 0 1 .75.75v3a.75.75 0 0 1-1.5 0v-3A.75.75 0 0 1 8 4Zm0 8a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
          clipRule="evenodd"
        />
      </svg>
      <span>
        {count} {label}
      </span>
    </div>
  )
}

function SessionTypePill({ value, active, onClick, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-1.5 rounded-full text-sm font-semibold touch-manipulation transition-colors ${
        active ? 'bg-emerald-600 text-white' : 'bg-zinc-800 text-zinc-400 active:bg-zinc-700'
      }`}
    >
      {label}
    </button>
  )
}

function detectVenueKindFallback(casinoName) {
  const n = String(casinoName || '').toLowerCase()
  if (
    n.includes('pokerstars') ||
    n.includes('ggpoker') ||
    n.includes('clubwpt') ||
    n.includes('acr') ||
    n.includes('partypoker') ||
    n.includes('888poker') ||
    n.includes('wsop.com') ||
    n.includes('ignition') ||
    n.includes('bovada') ||
    n.includes('online')
  ) {
    return 'online'
  }
  if (n.includes('clubgg') || n.includes('pppoker') || n.includes('pokerbros') || n.includes('club')) {
    return 'club'
  }
  return 'live'
}

function liveGamePickFromLabel(gameRaw) {
  const g = String(gameRaw || '').toLowerCase()
  if (g.includes('omaha 5') || g.includes('5-card omaha') || g.includes('plo5')) return 'omaha5'
  if (g.includes('omaha 6') || g.includes('6-card omaha') || g.includes('plo6')) return 'omaha6'
  if (g.includes('omaha') || g.includes('plo')) return 'omaha'
  if (g.includes('short')) return 'short_deck'
  if (g.includes('stud')) return 'stud'
  if (g.includes('draw')) return 'draw'
  if (g.includes('mix')) return 'mixed'
  if (g.includes('ofc') || g.includes('pine')) return 'ofc'
  return 'holdem'
}

function tourneyGameVariantFromLabel(gameRaw, limitType) {
  const g = String(gameRaw || '').toLowerCase().trim()
  if (g === 'plo8' || g.includes('plo8') || g.includes('omaha 8') || g.includes('omaha hi')) {
    return 'plo8'
  }
  if (g === 'plo5' || g.includes('plo5') || g.includes('5-card') || g.includes('five card')) {
    return 'plo5'
  }
  if (g === 'plo' || g.includes('omaha') || g.includes('plo')) return 'plo'
  if (g === 'horse' || g.includes('h.o.r.s.e') || g === 'mixed' || g.includes('mix')) {
    return 'mixed'
  }
  if (g === 'nlh' || g === 'nlhe') return 'nlh'
  if (limitType === 'limit' || g.includes('limit hold')) return 'limit_holdem'
  return 'nlh'
}

function resolveGameVariant(session, sessionType) {
  const limitType = session.limit_type || 'no_limit'
  if (sessionType === 'tournament') {
    return tourneyGameVariantFromLabel(session.game_label, limitType)
  }
  if (session.small_blind != null && session.big_blind != null) {
    const label = formatCashGameLabel({
      live_game_name_pick: liveGamePickFromLabel(session.game_label),
      limit_type: limitType,
      venue_kind: session.venue_kind || 'live',
      small_blind: session.small_blind,
      big_blind: session.big_blind,
      third_blind: session.third_blind,
    })
    if (label) return label
  }
  return String(session.game_label || '').trim() || 'custom'
}

function sessionProfit(s) {
  const invested =
    (Number(s.buy_in) || 0) + (Number(s.rebuy_amount) || 0) + (Number(s.addon_amount) || 0)
  const out = (Number(s.end_amount) || 0) + (Number(s.bounty_winnings) || 0)
  return out - invested
}

const STEPS = { INPUT: 'input', PREVIEW: 'preview', IMPORTING: 'importing', DONE: 'done' }
const PREVIEW_LIMIT = 6

export default function PokerBankrollImportSheet({
  supabaseClient,
  userId,
  /** When set, imported rows go to this On Stake deal. */
  dealId = null,
  completedSessions,
  onClose,
  onImported,
}) {
  const [step, setStep] = useState(STEPS.INPUT)
  const [pasteText, setPasteText] = useState('')
  const [fileName, setFileName] = useState(null)
  const [parseResult, setParseResult] = useState(null)
  const [parseError, setParseError] = useState(null)
  /** @type {'auto' | 'cash' | 'tournament'} */
  const [sessionTypeOverride, setSessionTypeOverride] = useState('auto')
  const [pokerOnly, setPokerOnly] = useState(true)
  const [importError, setImportError] = useState(null)
  const [importedCount, setImportedCount] = useState(0)
  const fileInputRef = useRef(null)

  const existingStartTimes = useMemo(
    () => new Set((completedSessions || []).map((s) => s.start_at)),
    [completedSessions],
  )

  function processText(text) {
    setParseError(null)
    const result = parseCsvImport(text)
    if (result.error) {
      setParseError(result.error)
      return
    }
    setParseResult(result)
    setStep(STEPS.PREVIEW)
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setParseError(null)
    const reader = new FileReader()
    reader.onload = (ev) => processText(ev.target.result)
    reader.readAsText(file)
    e.target.value = ''
  }

  function handlePasteProcess() {
    if (!pasteText.trim()) return
    processText(pasteText)
  }

  const filteredSessions = useMemo(() => {
    if (!parseResult) return []
    if (pokerOnly && parseResult.hasGameColumn) {
      return parseResult.sessions.filter(
        (s) => s.detectedGameType === 'tables' || s.detectedGameType == null,
      )
    }
    return parseResult.sessions
  }, [parseResult, pokerOnly])

  const duplicates = useMemo(
    () => filteredSessions.filter((s) => existingStartTimes.has(s.start_at)),
    [filteredSessions, existingStartTimes],
  )

  const toImport = useMemo(
    () => filteredSessions.filter((s) => !existingStartTimes.has(s.start_at)),
    [filteredSessions, existingStartTimes],
  )

  async function handleImport() {
    if (!toImport.length) return
    setStep(STEPS.IMPORTING)
    setImportError(null)

    const rows = toImport.map((s) => {
      const sessionType =
        sessionTypeOverride === 'auto'
          ? s.session_type === 'tournament'
            ? 'tournament'
            : 'cash'
          : sessionTypeOverride
      const venueKind = s.venue_kind || detectVenueKindFallback(s.casino_name)
      return {
        user_id: userId,
        deal_id: dealId || null,
        start_at: s.start_at,
        end_at: s.end_at ?? null,
        buy_in: s.buy_in ?? s.start_amount,
        cash_out: s.end_amount,
        rebuy_amount: Number(s.rebuy_amount) || 0,
        addon_amount: Number(s.addon_amount) || 0,
        venue_name: s.casino_name ?? null,
        venue_kind: venueKind,
        currency: s.currency || 'USD',
        notes: s.notes ?? null,
        session_type: sessionType,
        status: 'completed',
        game_variant: resolveGameVariant(s, sessionType),
        limit_type: s.limit_type || null,
        table_size: s.table_size || null,
        small_blind: s.small_blind != null && s.small_blind > 0 ? s.small_blind : null,
        big_blind: s.big_blind != null && s.big_blind > 0 ? s.big_blind : null,
        third_blind: s.third_blind != null && s.third_blind > 0 ? s.third_blind : null,
        ante: s.ante != null && s.ante > 0 ? s.ante : null,
        tournament_name: sessionType === 'tournament' ? s.tournament_name : null,
        field_size: sessionType === 'tournament' ? s.field_size : null,
        start_stack: sessionType === 'tournament' ? s.start_stack : null,
        finish_place: sessionType === 'tournament' ? s.finish_place : null,
        bounty_winnings:
          sessionType === 'tournament' && s.bounty_winnings != null
            ? s.bounty_winnings
            : null,
        reentries: s.reentries != null ? s.reentries : null,
      }
    })

    try {
      const BATCH = 200
      for (let i = 0; i < rows.length; i += BATCH) {
        const { error } = await supabaseClient
          .from('poker_bankroll_sessions')
          .insert(rows.slice(i, i + BATCH))
        if (error) throw error
      }
      setImportedCount(rows.length)
      setStep(STEPS.DONE)
      onImported?.()
    } catch (err) {
      setImportError(err.message || 'Import failed. Please try again.')
      setStep(STEPS.PREVIEW)
    }
  }

  return (
    <div className="fixed inset-0 z-[95] bg-zinc-950 flex flex-col">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-lg mx-auto px-5 pt-6 pb-16">
          {step === STEPS.INPUT && (
            <>
              <Header title="Import Sessions" onClose={onClose} />

              <p className="text-zinc-400 text-sm leading-relaxed mb-6">
                Import from Poker Income, PBT, Hendon Mob cashes (Date / Event / Place / Prize / Buy-in / Game Type),
                or any CSV with recognizable columns. Names are detected automatically.
              </p>

              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.txt"
                className="hidden"
                onChange={handleFileChange}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-2.5 rounded-2xl border-2 border-dashed border-zinc-700 py-5 text-zinc-300 font-semibold text-sm touch-manipulation active:border-emerald-600 active:text-emerald-400 transition-colors mb-2"
              >
                <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 shrink-0 text-zinc-500">
                  <path d="M9.25 13.25a.75.75 0 0 0 1.5 0V4.636l2.955 3.129a.75.75 0 0 0 1.09-1.03l-4.25-4.5a.75.75 0 0 0-1.09 0l-4.25 4.5a.75.75 0 1 0 1.09 1.03L9.25 4.636v8.614Z" />
                  <path d="M3.5 12.75a.75.75 0 0 0-1.5 0v2.5A2.75 2.75 0 0 0 4.75 18h10.5A2.75 2.75 0 0 0 18 15.25v-2.5a.75.75 0 0 0-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5Z" />
                </svg>
                {fileName ? fileName : 'Choose a .csv file'}
              </button>

              <div className="flex items-center gap-3 my-5">
                <div className="flex-1 h-px bg-zinc-800" />
                <span className="text-zinc-600 text-xs font-semibold">or paste CSV data</span>
                <div className="flex-1 h-px bg-zinc-800" />
              </div>

              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder={
                  'Paste your exported CSV here…\n\nPoker Income: Setup → Export (requires email app) → copy CSV from email.\n\nPoker Bankroll Tracker: Account → Export to CSV → copy CSV from email.\n\nHendon Mob: Date, Event, Place, Prize, Buy-in, Game Type.'
                }
                rows={8}
                className="w-full rounded-2xl bg-zinc-900 border border-zinc-800 text-zinc-200 text-sm px-4 py-3 resize-none font-mono placeholder:text-zinc-600 placeholder:font-sans focus:outline-none focus:border-zinc-600 mb-3"
              />

              {parseError && (
                <div className="rounded-xl bg-red-950 border border-red-800 p-3 mb-4 text-red-200 text-sm leading-relaxed">
                  {parseError}
                </div>
              )}

              <button
                type="button"
                onClick={handlePasteProcess}
                disabled={!pasteText.trim()}
                className="w-full min-h-12 rounded-2xl bg-emerald-600 text-white font-bold text-sm touch-manipulation active:bg-emerald-700 disabled:opacity-30 disabled:pointer-events-none transition-opacity"
              >
                Process Data
              </button>
            </>
          )}

          {step === STEPS.PREVIEW && parseResult && (
            <>
              <Header title="Preview Import" onBack={() => setStep(STEPS.INPUT)} onClose={onClose} />

              <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 mb-5 space-y-2">
                <div className="flex items-center gap-2 text-sm text-emerald-400">
                  <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 shrink-0">
                    <path
                      fillRule="evenodd"
                      d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span>
                    <strong>{toImport.length}</strong> session
                    {toImport.length !== 1 ? 's' : ''} ready to import
                  </span>
                </div>
                {parseResult.skipped.length > 0 && (
                  <SkipBadge
                    count={parseResult.skipped.length}
                    label={`skipped (${
                      parseResult.skipped.filter((s) => s.reason === 'incomplete').length > 0
                        ? 'incomplete or '
                        : ''
                    }missing data)`}
                  />
                )}
                {duplicates.length > 0 && (
                  <SkipBadge count={duplicates.length} label="already exist - will be skipped" />
                )}
              </div>

              <div className="mb-5">
                <div className="text-zinc-400 text-xs font-semibold uppercase tracking-wide mb-2">
                  Session type
                </div>
                <div className="flex flex-wrap gap-2">
                  <SessionTypePill
                    value="auto"
                    label="Auto-detect"
                    active={sessionTypeOverride === 'auto'}
                    onClick={() => setSessionTypeOverride('auto')}
                  />
                  <SessionTypePill
                    value="cash"
                    label="Force Cash"
                    active={sessionTypeOverride === 'cash'}
                    onClick={() => setSessionTypeOverride('cash')}
                  />
                  <SessionTypePill
                    value="tournament"
                    label="Force Tourney"
                    active={sessionTypeOverride === 'tournament'}
                    onClick={() => setSessionTypeOverride('tournament')}
                  />
                </div>
                <p className="text-zinc-600 text-xs mt-2 leading-relaxed">
                  Auto uses PBT variant / Poker Income Cash vs Tourneys sections when present.
                </p>
              </div>

              {parseResult.hasGameColumn && parseResult.hasMixedGames && (
                <button
                  type="button"
                  onClick={() => setPokerOnly((v) => !v)}
                  className="flex items-center gap-2.5 mb-5 touch-manipulation"
                >
                  <div
                    className={`w-5 h-5 rounded flex items-center justify-center border transition-colors ${
                      pokerOnly
                        ? 'bg-emerald-600 border-emerald-600'
                        : 'border-zinc-600 bg-zinc-800'
                    }`}
                  >
                    {pokerOnly && (
                      <svg viewBox="0 0 12 12" fill="white" className="w-3 h-3">
                        <path
                          d="M10 3L5 8.5 2 5.5"
                          stroke="white"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          fill="none"
                        />
                      </svg>
                    )}
                  </div>
                  <span className="text-zinc-300 text-sm">
                    Poker sessions only - skip slots
                    {pokerOnly &&
                      parseResult.sessions.filter((s) => s.detectedGameType === 'slots').length >
                        0 && (
                        <span className="text-zinc-500 ml-1.5">
                          (
                          {
                            parseResult.sessions.filter((s) => s.detectedGameType === 'slots')
                              .length
                          }{' '}
                          skipped)
                        </span>
                      )}
                  </span>
                </button>
              )}

              {toImport.length > 0 && (
                <div className="mb-6">
                  <div className="text-zinc-500 text-xs font-semibold uppercase tracking-wide mb-2">
                    Preview
                  </div>
                  <div className="space-y-1.5">
                    {toImport.slice(0, PREVIEW_LIMIT).map((s, i) => {
                      const wl = sessionProfit(s)
                      const typeLabel =
                        sessionTypeOverride === 'auto'
                          ? s.session_type === 'tournament'
                            ? 'Tourney'
                            : 'Cash'
                          : sessionTypeOverride === 'tournament'
                            ? 'Tourney'
                            : 'Cash'
                      return (
                        <div
                          key={i}
                          className="flex items-center justify-between gap-3 rounded-xl bg-zinc-900 border border-zinc-800/60 px-4 py-2.5"
                        >
                          <div className="min-w-0">
                            <span className="text-white text-sm font-medium truncate block">
                              {s.casino_name || 'Unknown location'}
                              {s.tournament_name ? ` · ${s.tournament_name}` : ''}
                            </span>
                            <span className="text-zinc-500 text-xs">
                              {fmtDate(s.start_at)} · {typeLabel}
                              {s.game_label ? ` · ${s.game_label}` : ''}
                            </span>
                          </div>
                          <span
                            className={`shrink-0 font-bold text-sm tabular-nums ${
                              wl >= 0 ? 'text-emerald-400' : 'text-red-400'
                            }`}
                          >
                            {wl >= 0 ? '+' : ''}
                            {fmt$(wl)}
                          </span>
                        </div>
                      )
                    })}
                    {toImport.length > PREVIEW_LIMIT && (
                      <div className="text-zinc-600 text-xs text-center pt-1">
                        …and {toImport.length - PREVIEW_LIMIT} more
                      </div>
                    )}
                  </div>
                </div>
              )}

              {importError && (
                <div className="rounded-xl bg-red-950 border border-red-800 p-3 mb-4 text-red-200 text-sm leading-relaxed">
                  {importError}
                </div>
              )}

              <button
                type="button"
                onClick={() => void handleImport()}
                disabled={toImport.length === 0}
                className="w-full min-h-13 rounded-2xl bg-emerald-600 text-white font-bold touch-manipulation active:bg-emerald-700 disabled:opacity-30 disabled:pointer-events-none py-3.5"
              >
                Import {toImport.length} Session{toImport.length !== 1 ? 's' : ''}
              </button>

              {toImport.length === 0 && (
                <p className="text-zinc-600 text-xs text-center mt-2">
                  All sessions in this file already exist in your history.
                </p>
              )}
            </>
          )}

          {step === STEPS.IMPORTING && (
            <div className="flex flex-col items-center justify-center pt-24 gap-5">
              <svg className="w-8 h-8 text-emerald-500 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="3"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                />
              </svg>
              <p className="text-zinc-400 text-sm">Importing sessions…</p>
            </div>
          )}

          {step === STEPS.DONE && (
            <>
              <div className="flex flex-col items-center text-center pt-16 pb-8 gap-4">
                <div className="w-16 h-16 rounded-full bg-emerald-900/60 border border-emerald-500/30 flex items-center justify-center">
                  <svg viewBox="0 0 20 20" fill="currentColor" className="w-9 h-9 text-emerald-400">
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <div>
                  <div className="text-white font-black text-2xl mb-1">
                    {importedCount} Session{importedCount !== 1 ? 's' : ''} Imported
                  </div>
                  <div className="text-zinc-500 text-sm">Your history is ready</div>
                </div>
              </div>

              <div className="rounded-2xl bg-amber-950/40 border border-amber-800/40 p-4 mb-8">
                <div className="flex gap-3">
                  <svg
                    viewBox="0 0 16 16"
                    fill="currentColor"
                    className="w-4 h-4 shrink-0 text-amber-400 mt-0.5"
                  >
                    <path
                      fillRule="evenodd"
                      d="M6.701 2.25c.577-1 2.02-1 2.598 0l5.196 9a1.5 1.5 0 0 1-1.299 2.25H2.804a1.5 1.5 0 0 1-1.3-2.25l5.197-9ZM8 4a.75.75 0 0 1 .75.75v3a.75.75 0 0 1-1.5 0v-3A.75.75 0 0 1 8 4Zm0 8a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <p className="text-amber-200/80 text-sm leading-relaxed">
                    Your poker bankroll balance won't automatically update to match these sessions.
                    Tap your bankroll on the main screen to set today's current balance (if
                    necessary).
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="w-full min-h-12 rounded-2xl font-bold touch-manipulation"
                style={{ backgroundColor: '#3f3f46', color: '#ffffff' }}
              >
                Done
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
