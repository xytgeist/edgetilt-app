import { useMemo, useState } from 'react'
import { createBotAccount } from './botPortalApi.js'
import { LOUNGE_POST_CATEGORY_PILL_SLUGS, loungePostCategoryPillLabel } from '../../utils/loungePostCategoryPills.js'

const PIPELINE_OPTIONS = [
  {
    id: 'market_news',
    label: 'Financial wire',
    hint: 'Self-contained · Finnhub allowlist · auto-publish',
    defaultSlug: 'financial-wire',
    defaultPills: ['stocks', 'trading'],
    maxDay: 12,
  },
  {
    id: 'odds_api',
    label: 'Sports odds',
    hint: 'Self-contained · The Odds API · ~2 posts/day',
    defaultSlug: 'sports-odds',
    defaultPills: ['sports'],
    maxDay: 2,
  },
  {
    id: 'x',
    label: 'X tracker',
    hint: 'Editorial inbox · human-imitating · you approve posts',
    defaultSlug: 'x-crypto',
    defaultPills: ['crypto'],
    maxDay: 6,
  },
]

function slugify(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function handleFromSlug(slug) {
  return String(slug || '').replace(/-/g, '_').slice(0, 30)
}

export default function BotCreateWizard({ supabaseClient, open, onClose, onCreated }) {
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [pipeline, setPipeline] = useState('market_news')
  const [slug, setSlug] = useState('financial-wire')
  const [handle, setHandle] = useState('financial_wire')
  const [displayName, setDisplayName] = useState('')
  const [bio, setBio] = useState('')
  const [maxDay, setMaxDay] = useState(12)
  const [maxHour, setMaxHour] = useState(4)
  const [scoreMin, setScoreMin] = useState(55)
  const [pills, setPills] = useState(['stocks', 'trading'])
  const [xHandles, setXHandles] = useState('')
  const [watchlist, setWatchlist] = useState('AAPL, NVDA, SPY, QQQ, TSLA')

  const pipelineMeta = useMemo(
    () => PIPELINE_OPTIONS.find((p) => p.id === pipeline) || PIPELINE_OPTIONS[0],
    [pipeline],
  )

  if (!open) return null

  const pickPipeline = (id) => {
    const meta = PIPELINE_OPTIONS.find((p) => p.id === id) || PIPELINE_OPTIONS[0]
    setPipeline(id)
    setSlug(meta.defaultSlug)
    setHandle(handleFromSlug(meta.defaultSlug))
    setPills([...meta.defaultPills])
    setMaxDay(meta.maxDay)
    setMaxHour(id === 'odds_api' ? 1 : 4)
  }

  const submit = async () => {
    setErr('')
    setBusy(true)
    const xList = pipeline === 'x'
      ? xHandles.split(/[,\s]+/).map((h) => h.replace(/^@/, '').trim()).filter(Boolean)
      : []

    const payload = {
      slug: slugify(slug),
      pipeline,
      handle: handleFromSlug(handle || slug),
      display_name: displayName.trim() || slug,
      bio: bio.trim(),
      max_posts_per_day: maxDay,
      max_posts_per_hour: maxHour,
      publish_score_threshold: scoreMin,
      category_pills_default: pills,
      run_state: 'stopped',
      x_handles: xList,
      config: pipeline === 'market_news'
        ? {
            watchlist_tickers: watchlist.split(/[,\s]+/).map((t) => t.replace(/^\$/, '').toUpperCase()).filter(Boolean),
          }
        : {},
    }

    const { data, error } = await createBotAccount(supabaseClient, payload)
    setBusy(false)
    if (error) {
      setErr(error.message || 'Create failed.')
      return
    }
    onCreated?.(data)
    onClose?.()
    setStep(0)
  }

  return (
    <div className="fixed inset-0 z-[130] flex items-end sm:items-center justify-center p-3 bg-black/75">
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-zinc-700 bg-zinc-900 p-4 shadow-2xl">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <div className="text-white font-bold text-lg">Create bot</div>
            <div className="text-zinc-500 text-xs mt-0.5">Step {step + 1} of 3</div>
          </div>
          <button type="button" onClick={onClose} className="text-zinc-400 text-sm hover:text-white">
            Close
          </button>
        </div>

        {err ? (
          <div className="mb-3 rounded-xl border border-red-500/30 bg-red-950/40 px-3 py-2 text-red-100 text-xs">
            {err}
          </div>
        ) : null}

        {step === 0 ? (
          <div className="space-y-2">
            <div className="text-zinc-400 text-xs mb-2">Pick pipeline</div>
            {PIPELINE_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => pickPipeline(opt.id)}
                className={`w-full text-left rounded-xl border px-3 py-3 ${
                  pipeline === opt.id
                    ? 'border-cyan-500/40 bg-cyan-950/30'
                    : 'border-zinc-700 bg-zinc-950/40 hover:border-zinc-600'
                }`}
              >
                <div className="text-white font-semibold text-sm">{opt.label}</div>
                <div className="text-zinc-500 text-[11px] mt-0.5">{opt.hint}</div>
              </button>
            ))}
          </div>
        ) : null}

        {step === 1 ? (
          <div className="space-y-3">
            <label className="block">
              <div className="text-[11px] font-semibold uppercase text-zinc-500">Slug (internal)</div>
              <input
                value={slug}
                onChange={(e) => {
                  setSlug(e.target.value)
                  setHandle(handleFromSlug(e.target.value))
                }}
                className="mt-1 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-white text-sm"
              />
            </label>
            <label className="block">
              <div className="text-[11px] font-semibold uppercase text-zinc-500">Handle</div>
              <input
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                className="mt-1 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-white text-sm font-mono"
              />
            </label>
            <label className="block">
              <div className="text-[11px] font-semibold uppercase text-zinc-500">Display name</div>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={pipelineMeta.label}
                className="mt-1 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-white text-sm"
              />
            </label>
            <label className="block">
              <div className="text-[11px] font-semibold uppercase text-zinc-500">Bio</div>
              <textarea
                value={bio}
                rows={2}
                maxLength={160}
                onChange={(e) => setBio(e.target.value)}
                className="mt-1 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-white text-sm resize-none"
              />
            </label>
            {pipeline === 'x' ? (
              <label className="block">
                <div className="text-[11px] font-semibold uppercase text-zinc-500">X handles to track</div>
                <textarea
                  value={xHandles}
                  rows={2}
                  placeholder="@handle1, handle2"
                  onChange={(e) => setXHandles(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-white text-sm"
                />
              </label>
            ) : null}
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <div className="text-[11px] font-semibold uppercase text-zinc-500">Max / day</div>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={maxDay}
                  onChange={(e) => setMaxDay(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-white text-sm"
                />
              </label>
              <label className="block">
                <div className="text-[11px] font-semibold uppercase text-zinc-500">Max / hour</div>
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={maxHour}
                  onChange={(e) => setMaxHour(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-white text-sm"
                />
              </label>
            </div>
            {pipeline !== 'x' ? (
              <label className="block">
                <div className="text-[11px] font-semibold uppercase text-zinc-500">Score threshold</div>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={scoreMin}
                  onChange={(e) => setScoreMin(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-white text-sm"
                />
              </label>
            ) : null}
            {pipeline === 'market_news' ? (
              <label className="block">
                <div className="text-[11px] font-semibold uppercase text-zinc-500">Watchlist tickers</div>
                <textarea
                  value={watchlist}
                  rows={2}
                  onChange={(e) => setWatchlist(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-white text-sm font-mono"
                />
              </label>
            ) : null}
            <div>
              <div className="text-[11px] font-semibold uppercase text-zinc-500 mb-2">Category pills</div>
              <div className="flex flex-wrap gap-2">
                {LOUNGE_POST_CATEGORY_PILL_SLUGS.map((s) => {
                  const on = pills.includes(s)
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() =>
                        setPills((cur) =>
                          on ? cur.filter((x) => x !== s) : cur.length >= 3 ? cur : [...cur, s],
                        )
                      }
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${
                        on ? 'bg-cyan-950/60 text-cyan-200 ring-cyan-500/40' : 'text-zinc-400 ring-zinc-700'
                      }`}
                    >
                      {loungePostCategoryPillLabel(s)}
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="rounded-xl bg-zinc-950/60 border border-zinc-800 px-3 py-2 text-zinc-400 text-xs">
              Bot starts <span className="text-zinc-200">Stopped</span>. Set Running from the portal when ready.
            </div>
          </div>
        ) : null}

        <div className="mt-4 flex justify-between gap-2">
          <button
            type="button"
            disabled={step === 0 || busy}
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            className="min-h-9 rounded-xl bg-zinc-800 px-4 text-zinc-200 text-xs font-semibold disabled:opacity-40"
          >
            Back
          </button>
          {step < 2 ? (
            <button
              type="button"
              onClick={() => setStep((s) => s + 1)}
              className="min-h-9 rounded-xl bg-cyan-700 px-4 text-white text-xs font-bold"
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => void submit()}
              className="min-h-9 rounded-xl bg-gradient-to-r from-cyan-600 to-violet-600 px-4 text-white text-xs font-bold disabled:opacity-50"
            >
              {busy ? 'Creating…' : 'Create bot'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
