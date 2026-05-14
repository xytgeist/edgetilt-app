import { useState, useEffect, useCallback } from 'react'

export default function LocalIntel({ supabaseClient }) {
  const [intelView, setIntelView] = useState({ screen: 'home', cityId: null, casinoId: null })

  const [cities, setCities] = useState([])
  const [casinos, setCasinos] = useState([])
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [draft, setDraft] = useState({ postType: 'conditions', title: '', body: '' })
  const [isPosting, setIsPosting] = useState(false)
  const [follows, setFollows] = useState({ city: new Set(), casino: new Set() })

  const loadFollows = useCallback(async () => {
    const { data, error: e } = await supabaseClient
      .from('follows')
      .select('target_type,target_id')
      .limit(500)
    if (e) throw e
    const citySet = new Set()
    const casinoSet = new Set()
    ;(data || []).forEach((r) => {
      if (r.target_type === 'city') citySet.add(r.target_id)
      if (r.target_type === 'casino') casinoSet.add(r.target_id)
    })
    setFollows({ city: citySet, casino: casinoSet })
  }, [supabaseClient])

  const loadCities = useCallback(async () => {
    const { data, error: e } = await supabaseClient.from('cities').select('id,name,region').order('name')
    if (e) throw e
    setCities(data || [])
  }, [supabaseClient])

  const loadCasinosForCity = useCallback(async (cityId) => {
    const { data, error: e } = await supabaseClient
      .from('casinos')
      .select('id,name,city_id')
      .eq('city_id', cityId)
      .order('name')
    if (e) throw e
    setCasinos(data || [])
  }, [supabaseClient])

  const loadPosts = useCallback(async ({ targetType, targetId }) => {
    const { data, error: e } = await supabaseClient
      .from('intel_posts')
      .select('id,target_type,target_id,post_type,title,body,created_at')
      .eq('target_type', targetType)
      .eq('target_id', targetId)
      .order('created_at', { ascending: false })
      .limit(50)
    if (e) throw e
    setPosts(data || [])
  }, [supabaseClient])

  const toggleFollow = async ({ targetType, targetId }) => {
    const isFollowing = (targetType === 'city' ? follows.city : follows.casino).has(targetId)
    if (isFollowing) {
      const { error: e } = await supabaseClient
        .from('follows')
        .delete()
        .eq('target_type', targetType)
        .eq('target_id', targetId)
      if (e) throw e
    } else {
      const { error: e } = await supabaseClient
        .from('follows')
        .insert({ target_type: targetType, target_id: targetId })
      if (e) throw e
    }
    await loadFollows()
  }

  const submitPost = async () => {
    setIsPosting(true)
    setError('')
    try {
      const { screen, cityId, casinoId } = intelView
      const targetType = screen === 'casino' ? 'casino' : 'city'
      const targetId = screen === 'casino' ? casinoId : cityId
      if (!targetId) throw new Error('Select a city/casino first.')
      if (!draft.title.trim()) throw new Error('Add a title.')
      if (!draft.body.trim()) throw new Error('Add details.')

      const { error: e } = await supabaseClient.from('intel_posts').insert({
        target_type: targetType,
        target_id: targetId,
        post_type: draft.postType,
        title: draft.title.trim(),
        body: draft.body.trim()
      })
      if (e) throw e
      setDraft({ postType: 'conditions', title: '', body: '' })
      await loadPosts({ targetType, targetId })
    } catch (e) {
      setError(e?.message || 'Failed to post.')
    } finally {
      setIsPosting(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      setLoading(true)
      setError('')
      try {
        await Promise.all([loadCities(), loadFollows()])
      } catch (e) {
        if (!cancelled) setError(e?.message || 'Failed to load Local Intel.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [loadCities, loadFollows])

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      setError('')
      try {
        if (intelView.screen === 'city' && intelView.cityId) {
          await Promise.all([
            loadCasinosForCity(intelView.cityId),
            loadPosts({ targetType: 'city', targetId: intelView.cityId })
          ])
        }
        if (intelView.screen === 'casino' && intelView.casinoId) {
          await loadPosts({ targetType: 'casino', targetId: intelView.casinoId })
        }
      } catch (e) {
        if (!cancelled) setError(e?.message || 'Failed to load Intel.')
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [intelView.screen, intelView.cityId, intelView.casinoId, loadCasinosForCity, loadPosts])

  const Header = ({ title, subtitle, onBack, right }) => (
    <div className="flex items-start justify-between gap-3 mb-5">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="text-3xl leading-none text-zinc-300 hover:text-white -mt-0.5 mr-1 touch-manipulation"
              aria-label="Back"
            >
              ‹
            </button>
          )}
          <div className="text-white text-2xl font-black tracking-tight truncate">{title}</div>
        </div>
        {subtitle && <div className="text-zinc-400 text-sm mt-0.5">{subtitle}</div>}
      </div>
      {right}
    </div>
  )

  const SetupHint = () => (
    <div className="bg-amber-900/30 border border-amber-500/40 rounded-3xl p-5 mb-4">
      <div className="text-amber-200 font-bold">Local Intel setup</div>
      <div className="text-amber-200/80 text-sm leading-relaxed mt-1">
        If you see errors like “relation does not exist”, you need to create the Supabase tables first. I added a SQL
        script you can paste into Supabase.
      </div>
    </div>
  )

  if (intelView.screen === 'home') {
    return (
      <div className="mx-auto w-full max-w-2xl px-3 py-6 pt-[max(0px,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <Header title="Local Intel" subtitle="City + casino updates (skeleton)" />

        <SetupHint />

        {error && (
          <div className="mb-4 p-4 rounded-3xl bg-red-900/40 border border-red-500/40 text-red-200 text-sm leading-relaxed">
            {error}
          </div>
        )}

        <div className="bg-zinc-900 rounded-3xl p-5 mb-4">
          <div className="text-white font-bold mb-2">Browse cities</div>
          {loading ? (
            <div className="text-zinc-400 text-sm">Loading…</div>
          ) : (
            <div className="space-y-2">
              {cities.slice(0, 30).map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setIntelView({ screen: 'city', cityId: c.id, casinoId: null })}
                  className="w-full text-left rounded-2xl bg-zinc-800/60 hover:bg-zinc-800 px-4 py-3 touch-manipulation"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-zinc-200 font-semibold truncate">{c.name}</div>
                      {c.region && <div className="text-zinc-500 text-xs mt-0.5 truncate">{c.region}</div>}
                    </div>
                    <div className="text-zinc-500 text-sm">→</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  if (intelView.screen === 'city') {
    const city = cities.find((c) => c.id === intelView.cityId)
    const isFollowing = intelView.cityId ? follows.city.has(intelView.cityId) : false
    return (
      <div className="mx-auto w-full max-w-2xl px-3 py-6 pt-[max(0px,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <Header
          title={city?.name || 'City'}
          subtitle="City feed + casinos"
          onBack={() => setIntelView({ screen: 'home', cityId: null, casinoId: null })}
          right={
            intelView.cityId ? (
              <button
                type="button"
                onClick={() => toggleFollow({ targetType: 'city', targetId: intelView.cityId })}
                className={`min-h-10 px-4 rounded-2xl text-sm font-bold touch-manipulation ${
                  isFollowing ? 'bg-zinc-800 text-zinc-200' : 'bg-emerald-600 text-white'
                }`}
              >
                {isFollowing ? 'Following' : 'Follow'}
              </button>
            ) : null
          }
        />

        {error && (
          <div className="mb-4 p-4 rounded-3xl bg-red-900/40 border border-red-500/40 text-red-200 text-sm leading-relaxed">
            {error}
          </div>
        )}

        <div className="bg-zinc-900 rounded-3xl p-5 mb-4">
          <div className="text-white font-bold mb-3">Post an update</div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-zinc-400 text-xs mb-1">Type</label>
              <select
                value={draft.postType}
                onChange={(e) => setDraft((d) => ({ ...d, postType: e.target.value }))}
                className="w-full h-12 bg-zinc-800 rounded-2xl px-3 text-zinc-100 font-semibold text-sm outline-none focus:ring-2 focus:ring-emerald-500/30"
              >
                <option value="conditions">Conditions</option>
                <option value="new_install">New install</option>
                <option value="paytable">Paytable</option>
                <option value="reset">Reset</option>
                <option value="question">Question</option>
                <option value="trip_report">Trip report</option>
              </select>
            </div>
            <div className="flex items-end">
              <button
                type="button"
                onClick={submitPost}
                disabled={isPosting}
                className="w-full h-12 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold disabled:opacity-60 disabled:cursor-not-allowed touch-manipulation"
              >
                {isPosting ? 'Posting…' : 'Post'}
              </button>
            </div>
          </div>
          <div className="mt-3">
            <label className="block text-zinc-400 text-xs mb-1">Title</label>
            <input
              value={draft.title}
              onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
              className="w-full h-12 bg-zinc-800 rounded-2xl px-4 text-zinc-100 font-semibold outline-none focus:ring-2 focus:ring-emerald-500/30"
              placeholder="Short summary"
            />
          </div>
          <div className="mt-3">
            <label className="block text-zinc-400 text-xs mb-1">Details</label>
            <textarea
              value={draft.body}
              onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
              className="w-full min-h-24 bg-zinc-800 rounded-2xl px-4 py-3 text-zinc-100 outline-none focus:ring-2 focus:ring-emerald-500/30"
              placeholder="What changed? Where on the floor? Any notes?"
            />
          </div>
        </div>

        <div className="bg-zinc-900 rounded-3xl p-5 mb-4">
          <div className="text-white font-bold mb-2">Casinos</div>
          {casinos.length === 0 ? (
            <div className="text-zinc-500 text-sm">No casinos loaded for this city yet.</div>
          ) : (
            <div className="space-y-2">
              {casinos.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setIntelView({ screen: 'casino', cityId: intelView.cityId, casinoId: c.id })}
                  className="w-full text-left rounded-2xl bg-zinc-800/60 hover:bg-zinc-800 px-4 py-3 touch-manipulation"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-zinc-200 font-semibold truncate">{c.name}</div>
                    <div className="text-zinc-500 text-sm">→</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="bg-zinc-900 rounded-3xl p-5">
          <div className="text-white font-bold mb-2">Latest updates</div>
          {posts.length === 0 ? (
            <div className="text-zinc-500 text-sm">No posts yet.</div>
          ) : (
            <div className="space-y-3">
              {posts.map((p) => (
                <div key={p.id} className="rounded-2xl bg-zinc-800/70 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-zinc-200 font-semibold truncate">{p.title}</div>
                    <div className="text-[11px] text-zinc-500 shrink-0">{new Date(p.created_at).toLocaleDateString()}</div>
                  </div>
                  <div className="text-zinc-500 text-[11px] mt-1 uppercase tracking-wide">{p.post_type}</div>
                  <div className="text-zinc-300 text-sm mt-2 leading-relaxed whitespace-pre-wrap">{p.body}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  if (intelView.screen === 'casino') {
    const casino = casinos.find((c) => c.id === intelView.casinoId)
    const isFollowing = intelView.casinoId ? follows.casino.has(intelView.casinoId) : false
    return (
      <div className="mx-auto w-full max-w-2xl px-3 py-6 pt-[max(0px,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <Header
          title={casino?.name || 'Casino'}
          subtitle="Casino-specific updates"
          onBack={() => setIntelView({ screen: 'city', cityId: intelView.cityId, casinoId: null })}
          right={
            intelView.casinoId ? (
              <button
                type="button"
                onClick={() => toggleFollow({ targetType: 'casino', targetId: intelView.casinoId })}
                className={`min-h-10 px-4 rounded-2xl text-sm font-bold touch-manipulation ${
                  isFollowing ? 'bg-zinc-800 text-zinc-200' : 'bg-emerald-600 text-white'
                }`}
              >
                {isFollowing ? 'Following' : 'Follow'}
              </button>
            ) : null
          }
        />

        {error && (
          <div className="mb-4 p-4 rounded-3xl bg-red-900/40 border border-red-500/40 text-red-200 text-sm leading-relaxed">
            {error}
          </div>
        )}

        <div className="bg-zinc-900 rounded-3xl p-5 mb-4">
          <div className="text-white font-bold mb-3">Post an update</div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-zinc-400 text-xs mb-1">Type</label>
              <select
                value={draft.postType}
                onChange={(e) => setDraft((d) => ({ ...d, postType: e.target.value }))}
                className="w-full h-12 bg-zinc-800 rounded-2xl px-3 text-zinc-100 font-semibold text-sm outline-none focus:ring-2 focus:ring-emerald-500/30"
              >
                <option value="conditions">Conditions</option>
                <option value="new_install">New install</option>
                <option value="paytable">Paytable</option>
                <option value="reset">Reset</option>
                <option value="question">Question</option>
                <option value="trip_report">Trip report</option>
              </select>
            </div>
            <div className="flex items-end">
              <button
                type="button"
                onClick={submitPost}
                disabled={isPosting}
                className="w-full h-12 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold disabled:opacity-60 disabled:cursor-not-allowed touch-manipulation"
              >
                {isPosting ? 'Posting…' : 'Post'}
              </button>
            </div>
          </div>
          <div className="mt-3">
            <label className="block text-zinc-400 text-xs mb-1">Title</label>
            <input
              value={draft.title}
              onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
              className="w-full h-12 bg-zinc-800 rounded-2xl px-4 text-zinc-100 font-semibold outline-none focus:ring-2 focus:ring-emerald-500/30"
              placeholder="Short summary"
            />
          </div>
          <div className="mt-3">
            <label className="block text-zinc-400 text-xs mb-1">Details</label>
            <textarea
              value={draft.body}
              onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
              className="w-full min-h-24 bg-zinc-800 rounded-2xl px-4 py-3 text-zinc-100 outline-none focus:ring-2 focus:ring-emerald-500/30"
              placeholder="What changed? Bank location? Any notes?"
            />
          </div>
        </div>

        <div className="bg-zinc-900 rounded-3xl p-5">
          <div className="text-white font-bold mb-2">Latest updates</div>
          {posts.length === 0 ? (
            <div className="text-zinc-500 text-sm">No posts yet.</div>
          ) : (
            <div className="space-y-3">
              {posts.map((p) => (
                <div key={p.id} className="rounded-2xl bg-zinc-800/70 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-zinc-200 font-semibold truncate">{p.title}</div>
                    <div className="text-[11px] text-zinc-500 shrink-0">{new Date(p.created_at).toLocaleDateString()}</div>
                  </div>
                  <div className="text-zinc-500 text-[11px] mt-1 uppercase tracking-wide">{p.post_type}</div>
                  <div className="text-zinc-300 text-sm mt-2 leading-relaxed whitespace-pre-wrap">{p.body}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  return null
}
