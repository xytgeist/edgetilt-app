import { useCallback, useEffect, useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { format, parseISO } from 'date-fns'
import {
  BUFFALO_LINK_DEMO_SLUG,
  buffaloLinkCardBullets,
  buffaloLinkGuideMarkdown,
} from './buffaloLinkGuideDemo'

function formatGuideDate(iso) {
  if (!iso) return '—'
  try {
    return format(typeof iso === 'string' ? parseISO(iso) : iso, 'MMM d, yyyy')
  } catch {
    return '—'
  }
}

/** Map DB \`machines.calculator_slug\` / slug → AppShell \`openCalculator\` keys. */
function resolveCalculatorKey(machine) {
  if (!machine) return null
  const { slug, calculator_slug: calc, has_calculator: has } = machine
  if (slug === 'buffalo-link' || calc === 'buffalo') return 'buffalo'
  if (slug === 'stack-up-pays' || calc === 'stack-up-pays') return 'stackup'
  if (slug === 'phoenix-link' || calc === 'phoenix-link') return 'phoenix'
  if (slug === 'cash-machine-lock' || calc === 'cash-machine-lock') return null
  if (has && calc === 'mhb') return 'mhb'
  if (has && calc && ['buffalo', 'stackup', 'phoenix', 'mhb'].includes(calc)) return calc
  return null
}

function mergeDemoBuffalo(rows) {
  const hasBuffalo = (rows || []).some((r) => r.machines?.slug === BUFFALO_LINK_DEMO_SLUG)
  if (hasBuffalo) return rows || []

  return [
    {
      id: 'local-demo-buffalo-link',
      slug: 'buffalo-link',
      title: 'Buffalo Link',
      content_markdown: buffaloLinkGuideMarkdown,
      last_updated: null,
      created_at: null,
      updated_at: null,
      thumbnail_url: null,
      published: true,
      machines: {
        id: null,
        slug: BUFFALO_LINK_DEMO_SLUG,
        name: 'Buffalo Link',
        manufacturer: 'Aristocrat',
        type: 'Persistent State',
        difficulty: 'Intermediate',
        vegas_availability: 'Very Common',
        nerf_risk: 'High',
        has_calculator: false,
        calculator_slug: null,
        thumbnail_url: null,
        created_at: null,
        updated_at: null,
      },
    },
    ...(rows || []),
  ]
}

function cardBulletsForRow(row) {
  if (row.machines?.slug === BUFFALO_LINK_DEMO_SLUG) return buffaloLinkCardBullets
  const first = (row.content_markdown || '').split(/\n##/)[0].trim()
  if (first.length > 400) return [first.slice(0, 360).trim() + '…']
  if (first) return [first]
  return ['Open the full guide for play notes and +EV context.']
}

const guideMarkdownComponents = {
  h2: ({ children }) => <h2 className="text-lg font-black text-amber-100 mt-6 first:mt-0 mb-2">{children}</h2>,
  h3: ({ children }) => <h3 className="text-base font-bold text-zinc-100 mt-4 mb-1.5">{children}</h3>,
  p: ({ children }) => <p className="text-zinc-300 leading-relaxed mb-3 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="list-disc pl-5 space-y-1.5 text-zinc-300 mb-3">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-5 space-y-1.5 text-zinc-300 mb-3">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  strong: ({ children }) => <strong className="text-white font-semibold">{children}</strong>,
  a: ({ href, children }) => (
    <a href={href} className="text-cyan-400 underline font-medium hover:text-cyan-300">
      {children}
    </a>
  ),
}

function volatilityLabel(row) {
  const m = row.machines
  if (!m) return '—'
  if (m.volatility_index) return m.volatility_index
  if (m.nerf_risk && m.difficulty) return `${m.difficulty} play / ${m.nerf_risk} nerf risk`
  return m.difficulty || m.nerf_risk || '—'
}

function popularityLabel(row) {
  const m = row.machines
  if (!m) return '—'
  if (m.popularity_summary) return m.popularity_summary
  return m.vegas_availability || '—'
}

function heroImage(row) {
  return row.thumbnail_url || row.machines?.thumbnail_url || '/buffalo-icon.png'
}

function AskCommunityModal({ open, onClose, guideRow, supabaseClient, onPosted }) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const gameTitle = guideRow?.machines?.name || guideRow?.title || 'Game'
  const gameSlug = guideRow?.machines?.slug || guideRow?.slug || ''

  useEffect(() => {
    if (open) {
      setTitle('')
      setBody('')
      setErr('')
    }
  }, [open, guideRow?.id])

  if (!open || !guideRow) return null

  const submit = async (e) => {
    e.preventDefault()
    setErr('')
    if (!body.trim()) {
      setErr('Write your question in the details box.')
      return
    }
    setBusy(true)
    try {
      const {
        data: { session },
      } = await supabaseClient.auth.getSession()
      if (!session?.user) {
        setErr('You must be signed in to post to the feed.')
        setBusy(false)
        return
      }

      const header = `Guide: **${gameTitle}** (${gameSlug || 'no slug'})\nManufacturer: ${guideRow.machines?.manufacturer || '—'}\n`
      const postTitle = (title.trim() || `Question · ${gameTitle}`).slice(0, 200)
      const postBody = `${header}\n---\n\n${body.trim()}`

      const { error } = await supabaseClient.from('community_feed_posts').insert({
        game_slug: gameSlug || null,
        game_title: gameTitle,
        title: postTitle,
        body: postBody,
      })

      if (error) {
        if (error.message?.includes('relation') || error.code === '42P01') {
          setErr(
            'Home feed table is not set up yet. Run `supabase/community_feed_posts.sql` in the Supabase SQL editor, then try again.'
          )
        } else {
          setErr(error.message || 'Could not post.')
        }
        setBusy(false)
        return
      }

      onPosted?.()
      onClose()
    } catch (ex) {
      setErr(ex?.message || 'Could not post.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center p-4 bg-black/60" role="dialog" aria-modal>
      <button type="button" className="absolute inset-0 z-0 cursor-default" aria-label="Close" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-3xl bg-zinc-900 border border-zinc-700 shadow-2xl max-h-[90dvh] overflow-hidden flex flex-col">
        <div className="p-5 border-b border-zinc-800 shrink-0">
          <div className="text-white font-bold text-lg">Ask the community</div>
          <div className="text-zinc-400 text-sm mt-1">
            Posts to the <span className="text-cyan-300 font-semibold">Home</span> feed with this game tagged.
          </div>
          <div className="mt-3 rounded-2xl bg-zinc-800/80 px-3 py-2 text-sm text-amber-100 font-semibold">{gameTitle}</div>
        </div>
        <form onSubmit={submit} className="p-5 flex flex-col gap-3 min-h-0 flex-1 overflow-y-auto">
          <label className="block">
            <span className="text-zinc-400 text-xs font-semibold uppercase tracking-wide">Subject (optional)</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full min-h-12 rounded-2xl bg-zinc-950 border border-zinc-700 px-4 py-3 text-white text-base focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
              placeholder={`e.g. Denom on ${gameTitle} majors`}
            />
          </label>
          <label className="block flex-1 min-h-[8rem]">
            <span className="text-zinc-400 text-xs font-semibold uppercase tracking-wide">Your question</span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={6}
              className="mt-1 w-full rounded-2xl bg-zinc-950 border border-zinc-700 px-4 py-3 text-white text-base focus:outline-none focus:ring-2 focus:ring-cyan-500/40 resize-y min-h-[10rem]"
              required
              placeholder="Context, casino, photos you saw on the glass, what you need verified…"
            />
          </label>
          {err ? <div className="text-red-300 text-sm leading-relaxed">{err}</div> : null}
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 min-h-12 rounded-2xl bg-zinc-800 text-zinc-100 font-bold touch-manipulation"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="flex-1 min-h-12 rounded-2xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-bold touch-manipulation"
            >
              {busy ? 'Posting…' : 'Post to Home'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function GuidesScreen({ supabaseClient, onOpenCalculator, onNavigateHome, onCommunityPosted }) {
  const [query, setQuery] = useState('')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState('')
  const [expandedSlug, setExpandedSlug] = useState(null)
  const [askFor, setAskFor] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadErr('')
    try {
      const { data, error } = await supabaseClient.from('guides').select(`
          id,
          slug,
          title,
          content_markdown,
          last_updated,
          created_at,
          updated_at,
          thumbnail_url,
          published,
          machines (
            id,
            slug,
            name,
            manufacturer,
            type,
            difficulty,
            vegas_availability,
            nerf_risk,
            has_calculator,
            calculator_slug,
            thumbnail_url,
            created_at,
            updated_at,
            volatility_index,
            popularity_summary
          )
        `)
        .eq('published', true)
        .order('title')

      if (error) {
        const missingVol =
          error.message?.includes('volatility_index') || error.message?.includes('popularity_summary')
        if (missingVol) {
          const { data: d2, error: e2 } = await supabaseClient
            .from('guides')
            .select(
              `
              id,
              slug,
              title,
              content_markdown,
              last_updated,
              created_at,
              updated_at,
              thumbnail_url,
              published,
              machines (
                id,
                slug,
                name,
                manufacturer,
                type,
                difficulty,
                vegas_availability,
                nerf_risk,
                has_calculator,
                calculator_slug,
                thumbnail_url,
                created_at,
                updated_at
              )
            `
            )
            .eq('published', true)
            .order('title')
          if (e2) throw e2
          setRows(mergeDemoBuffalo(d2 || []))
        } else {
          throw error
        }
      } else {
        setRows(mergeDemoBuffalo(data || []))
      }
    } catch (e) {
      setLoadErr(e?.message || 'Could not load guides.')
      setRows(mergeDemoBuffalo([]))
    } finally {
      setLoading(false)
    }
  }, [supabaseClient])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) => {
      const name = (r.machines?.name || '').toLowerCase()
      const title = (r.title || '').toLowerCase()
      const slug = (r.slug || '').toLowerCase()
      const manu = (r.machines?.manufacturer || '').toLowerCase()
      return name.includes(q) || title.includes(q) || slug.includes(q) || manu.includes(q)
    })
  }, [rows, query])

  return (
    <div className="max-w-lg mx-auto px-4 py-6 pt-[max(0.5rem,env(safe-area-inset-top))] pb-24">
      <div className="mb-5">
        <div className="text-white text-2xl font-black tracking-tight">Guides</div>
        <div className="text-zinc-400 text-sm mt-0.5">+EV quick read · expand for full playbook</div>
      </div>

      <label className="block mb-5">
        <span className="sr-only">Search guides</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search slot name…"
          className="w-full min-h-12 rounded-2xl bg-zinc-900 border border-zinc-700 px-4 py-3 text-white text-base placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
          enterKeyHint="search"
        />
      </label>

      {loadErr ? (
        <div className="mb-4 rounded-2xl border border-amber-700/50 bg-amber-950/30 px-4 py-3 text-amber-100 text-sm">{loadErr}</div>
      ) : null}

      {loading ? (
        <div className="text-zinc-500 text-sm py-8 text-center">Loading guides…</div>
      ) : filtered.length === 0 ? (
        <div className="text-zinc-500 text-sm py-8 text-center">No guides match that search.</div>
      ) : (
        <ul className="space-y-5 list-none p-0 m-0">
          {filtered.map((row) => {
            const slug = row.machines?.slug || row.slug
            const expanded = expandedSlug === slug
            const calcKey = resolveCalculatorKey(row.machines)
            const bullets = cardBulletsForRow(row)

            return (
              <li key={row.id || row.slug}>
                <article
                  className={`rounded-3xl border overflow-hidden transition-shadow bg-zinc-900 ${
                    expanded ? 'border-amber-500/50 shadow-lg shadow-amber-900/20' : 'border-zinc-800'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setExpandedSlug((s) => (s === slug ? null : slug))}
                    className="w-full text-left touch-manipulation focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60"
                    aria-expanded={expanded}
                  >
                    <div className="relative h-36 w-full bg-gradient-to-br from-amber-900/40 to-zinc-950">
                      <img
                        src={heroImage(row)}
                        alt=""
                        className="h-full w-full object-cover opacity-95"
                        onError={(e) => {
                          e.currentTarget.src = '/buffalo-icon.png'
                        }}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/20 to-transparent" />
                      <div className="absolute bottom-3 left-4 right-4">
                        <h2 className="text-white font-black text-xl tracking-tight drop-shadow-md">{row.machines?.name || row.title}</h2>
                        <div className="text-amber-200/90 text-xs font-semibold mt-0.5">{row.machines?.manufacturer || '—'}</div>
                      </div>
                    </div>

                    <div className="p-4 space-y-3">
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="rounded-xl bg-zinc-950/80 px-3 py-2 border border-zinc-800">
                          <div className="text-zinc-500 font-semibold uppercase tracking-wide">Volatility</div>
                          <div className="text-zinc-100 font-bold mt-0.5">{volatilityLabel(row)}</div>
                        </div>
                        <div className="rounded-xl bg-zinc-950/80 px-3 py-2 border border-zinc-800">
                          <div className="text-zinc-500 font-semibold uppercase tracking-wide">Popularity</div>
                          <div className="text-zinc-100 font-bold mt-0.5 leading-snug">{popularityLabel(row)}</div>
                        </div>
                        <div className="rounded-xl bg-zinc-950/80 px-3 py-2 border border-zinc-800 col-span-2">
                          <div className="text-zinc-500 font-semibold uppercase tracking-wide">Type</div>
                          <div className="text-zinc-200 font-semibold mt-0.5">{row.machines?.type || '—'}</div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        {bullets.map((b, i) => (
                          <div key={i} className="text-sm text-zinc-300 leading-relaxed flex gap-2">
                            <span className="text-amber-500 shrink-0 font-bold">▸</span>
                            <span>
                              <ReactMarkdown
                                components={{
                                  p: ({ children }) => <span className="inline">{children}</span>,
                                  strong: ({ children }) => <strong className="text-amber-100 font-bold">{children}</strong>,
                                }}
                              >
                                {b}
                              </ReactMarkdown>
                            </span>
                          </div>
                        ))}
                      </div>

                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-zinc-500 pt-1 border-t border-zinc-800/80">
                        <span>
                          Added <span className="text-zinc-400">{formatGuideDate(row.created_at || row.machines?.created_at)}</span>
                        </span>
                        <span>
                          Updated <span className="text-zinc-400">{formatGuideDate(row.updated_at || row.last_updated)}</span>
                        </span>
                      </div>

                      <div className="text-zinc-500 text-xs font-medium">{expanded ? 'Tap to collapse' : 'Tap for full guide'}</div>
                    </div>
                  </button>

                  <div className="px-4 pb-4 flex flex-col gap-2 border-t border-zinc-800/80 pt-3 -mt-px">
                    <div className="flex gap-2">
                      {calcKey ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            onOpenCalculator(calcKey)
                          }}
                          className="flex-1 min-h-11 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold touch-manipulation"
                        >
                          Open calculator
                        </button>
                      ) : (
                        <div className="flex-1 min-h-11 rounded-2xl bg-zinc-800 text-zinc-500 text-sm font-bold flex items-center justify-center">
                          No calc yet
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setAskFor(row)
                        }}
                        className="flex-1 min-h-11 rounded-2xl bg-cyan-700 hover:bg-cyan-600 text-white text-sm font-bold touch-manipulation"
                      >
                        Ask community
                      </button>
                    </div>
                  </div>

                  {expanded ? (
                    <div className="border-t border-zinc-800 px-4 py-5 bg-zinc-950/90 text-sm max-w-none">
                      <ReactMarkdown components={guideMarkdownComponents}>{row.content_markdown || ''}</ReactMarkdown>
                    </div>
                  ) : null}
                </article>
              </li>
            )
          })}
        </ul>
      )}

      <AskCommunityModal
        open={!!askFor}
        guideRow={askFor}
        onClose={() => setAskFor(null)}
        supabaseClient={supabaseClient}
        onPosted={() => {
          onCommunityPosted?.()
          onNavigateHome?.()
        }}
      />
    </div>
  )
}
