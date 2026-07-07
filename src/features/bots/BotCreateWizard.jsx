import { useMemo, useState } from 'react'
import { createBotAccount } from './botPortalApi.js'
import { LOUNGE_POST_CATEGORY_PILL_SLUGS, loungePostCategoryPillLabel } from '../../utils/loungePostCategoryPills.js'

const X_BOT_VOICE_PLACEHOLDER =
  'Explain each tweet in plain English for a layperson. Keep it accurate, vivid, and on-brand for this bot.'

const DEFAULT_WATCHLIST_TEXT = ''

const PIPELINE_OPTIONS = [
  {
    id: 'market_news',
    pipelineId: 'market_news',
    newsProfile: 'market',
    label: 'Market Edge (financial wire)',
    hint: 'Self-contained · Finnhub + EDGAR + gov RSS · auto-publish',
    defaultSlug: 'market-edge',
    defaultHandle: 'marketedge',
    defaultDisplayName: 'Market Edge',
    defaultBio: '24/7 Breaking News headlines for professional day traders.',
    defaultPills: ['stocks', 'trading'],
    maxDay: 12,
  },
  {
    id: 'market_news_crypto',
    pipelineId: 'market_news',
    newsProfile: 'crypto',
    label: 'Crypto Edge (crypto wire)',
    hint: 'Self-contained · CoinDesk + Block + Finnhub crypto · auto-publish',
    defaultSlug: 'crypto-edge',
    defaultHandle: 'cryptoedge',
    defaultDisplayName: 'Crypto Edge',
    defaultBio: '24/7 crypto wire ... regs, hacks, liquidations, and the occasional dry degen take.',
    defaultPills: ['crypto', 'trading'],
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

function isMarketNewsWire(meta) {
  return meta?.pipelineId === 'market_news'
}

export default function BotCreateWizard({ supabaseClient, open, onClose, onCreated }) {
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [pipelineChoice, setPipelineChoice] = useState('market_news')
  const [slug, setSlug] = useState('market-edge')
  const [handle, setHandle] = useState('marketedge')
  const [displayName, setDisplayName] = useState('Market Edge')
  const [bio, setBio] = useState('24/7 Breaking News headlines for professional day traders.')
  const [maxDay, setMaxDay] = useState(12)
  const [maxHour, setMaxHour] = useState(4)
  const [scoreMin, setScoreMin] = useState(55)
  const [pills, setPills] = useState(['stocks', 'trading'])
  const [xHandles, setXHandles] = useState('')
  const [xVoicePrompt, setXVoicePrompt] = useState('')
  const [watchlist, setWatchlist] = useState(DEFAULT_WATCHLIST_TEXT)

  const pipelineMeta = useMemo(
    () => PIPELINE_OPTIONS.find((p) => p.id === pipelineChoice) || PIPELINE_OPTIONS[0],
    [pipelineChoice],
  )
  const pipeline = pipelineMeta.pipelineId || pipelineMeta.id

  if (!open) return null

  const pickPipeline = (id) => {
    const meta = PIPELINE_OPTIONS.find((p) => p.id === id) || PIPELINE_OPTIONS[0]
    setPipelineChoice(id)
    setSlug(meta.defaultSlug)
    setHandle(meta.defaultHandle || handleFromSlug(meta.defaultSlug))
    setDisplayName(meta.defaultDisplayName || '')
    setBio(meta.defaultBio || '')
    setPills([...meta.defaultPills])
    setMaxDay(meta.maxDay)
    setMaxHour(id === 'odds_api' ? 1 : 4)
    if (isMarketNewsWire(meta)) setWatchlist(DEFAULT_WATCHLIST_TEXT)
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
      config: isMarketNewsWire(pipelineMeta)
        ? {
            news_profile: pipelineMeta.newsProfile || 'market',
            watchlist_tickers: watchlist.split(/[,\s]+/).map((t) => t.replace(/^\$/, '').toUpperCase()).filter(Boolean),
          }
        : pipeline === 'x' && xVoicePrompt.trim()
          ? { voice_prompt: xVoicePrompt.trim() }
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
                  pipelineChoice === opt.id
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
              <>
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
                <label className="block">
                  <div className="text-[11px] font-semibold uppercase text-zinc-500">LLM voice instructions</div>
                  <div className="text-zinc-600 text-[10px] mt-0.5 mb-1">
                    Top-level tweets only. Ingest sends each through OpenAI with this prompt before the editorial inbox.
                  </div>
                  <textarea
                    value={xVoicePrompt}
                    rows={4}
                    placeholder={X_BOT_VOICE_PLACEHOLDER}
                    onChange={(e) => setXVoicePrompt(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-white text-sm leading-relaxed resize-y"
                  />
                </label>
              </>
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
            {isMarketNewsWire(pipelineMeta) ? (
              <label className="block">
                <div className="text-[11px] font-semibold uppercase text-zinc-500">Optional ticker boost</div>
                <div className="text-zinc-600 text-[10px] mt-0.5 mb-1">
                  {pipelineMeta.newsProfile === 'crypto'
                    ? 'Leave blank for topic-only mode (regs, hacks, majors, DeFi). Add tickers only for extra feeds and a small score nudge.'
                    : 'Leave blank for topic-only mode (macro, earnings, geopolitics, commodities, etc.). Add tickers only if you want extra company feeds and a small score nudge.'}
                </div>
                <textarea
                  value={watchlist}
                  rows={2}
                  onChange={(e) => setWatchlist(e.target.value)}
                  placeholder={pipelineMeta.newsProfile === 'crypto' ? 'Optional — e.g. BTC, ETH, COIN' : 'Optional — e.g. NVDA, BTC'}
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
