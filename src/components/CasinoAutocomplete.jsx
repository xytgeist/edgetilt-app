/**
 * CasinoAutocomplete
 *
 * Typeahead for casino / location names.
 *
 * On focus:
 *   - If nearbyCasinos are available, shows "📍 Near you" section (top 5 by distance)
 *   - User can tap one or start typing to search
 *
 * On type (2+ chars):
 *   - Searches our casinos table (trigram fuzzy, instant & free)
 *   - If < 3 local results, shows "Search online…" → Google Places proxy
 *   - Selecting a Places result saves it to casinos table with lat/lng
 *
 * Props:
 *   value          - controlled string value
 *   onChange       - fn(name: string)
 *   supabaseClient - authenticated Supabase client
 *   nearbyCasinos  - [{ id, name, city, state, country, distanceMi }]
 *   gpsLoading     - bool: true while GPS + casino fetch is in progress
 *   placeholder    - optional
 *   className      - extra classes on the wrapper
 */

import { useState, useEffect, useRef, useCallback } from 'react'

const DEBOUNCE_MS = 280
const MIN_CHARS = 2
const LOCAL_LIMIT = 20

function fmtMiles(mi) {
  return mi < 10 ? `${mi.toFixed(1)} mi` : `${Math.round(mi)} mi`
}

export default function CasinoAutocomplete({
  value,
  onChange,
  supabaseClient,
  nearbyCasinos = [],
  gpsLoading = false,
  placeholder = 'e.g. Bellagio',
  className = '',
}) {
  const [query, setQuery] = useState(value ?? '')
  const [localResults, setLocalResults] = useState([])
  const [onlineResults, setOnlineResults] = useState([])
  const [onlineLoading, setOnlineLoading] = useState(false)
  const [showOnline, setShowOnline] = useState(false)
  const [focused, setFocused] = useState(false)
  const [userTyped, setUserTyped] = useState(false)
  const debounceRef = useRef(null)
  const wrapperRef = useRef(null)
  const touchStartYRef = useRef(null)

  // Keep internal query in sync when parent resets value
  useEffect(() => { setQuery(value ?? '') }, [value])

  // Close on outside click
  useEffect(() => {
    function handler(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setFocused(false)
        setShowOnline(false)
        setOnlineResults([])
        setLocalResults([])
      }
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('touchstart', handler)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('touchstart', handler)
    }
  }, [])

  // Debounced local DB search
  const searchLocal = useCallback((q) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (q.length < MIN_CHARS) { setLocalResults([]); return }
    debounceRef.current = setTimeout(async () => {
      const { data } = await supabaseClient
        .from('casinos')
        .select('id, name, city, state, country')
        .ilike('name', `%${q}%`)
        .order('name')
        .limit(LOCAL_LIMIT)
      setLocalResults(data ?? [])
      setShowOnline(false)
      setOnlineResults([])
    }, DEBOUNCE_MS)
  }, [supabaseClient])

  const handleInput = (e) => {
    const q = e.target.value
    setQuery(q)
    onChange(q)
    setUserTyped(true)
    searchLocal(q)
  }

  const pickLocal = (casino) => {
    setQuery(casino.name)
    onChange(casino.name)
    setFocused(false)
    setShowOnline(false)
    setOnlineResults([])
    setLocalResults([])
  }

  const pickNearby = (casino) => {
    setQuery(casino.name)
    onChange(casino.name)
    setFocused(false)
    setLocalResults([])
  }

  const searchOnline = async () => {
    if (query.length < MIN_CHARS) return
    setOnlineLoading(true)
    setShowOnline(true)
    try {
      const { data: { session } } = await supabaseClient.auth.getSession()
      const token = session?.access_token
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/casino-places-search?q=${encodeURIComponent(query)}`,
        { headers: { Authorization: `Bearer ${token}`, apikey: import.meta.env.VITE_SUPABASE_ANON_KEY } }
      )
      const json = await res.json()
      setOnlineResults(json.results ?? [])
    } catch {
      setOnlineResults([])
    } finally {
      setOnlineLoading(false)
    }
  }

  const pickOnline = async (place) => {
    if (place.lat != null && place.lng != null) {
      const parts = (place.formatted_address ?? '').split(',').map(s => s.trim())
      const city = parts[0] ?? ''
      const state = parts[1] ?? ''
      const country = parts[parts.length - 1] ?? ''
      await supabaseClient.from('casinos').upsert(
        { name: place.name, city, state, country, lat: place.lat, lng: place.lng, source: 'user_confirmed' },
        { onConflict: 'name', ignoreDuplicates: false }
      ).select()
    }
    setQuery(place.name)
    onChange(place.name)
    setFocused(false)
    setShowOnline(false)
    setOnlineResults([])
    setLocalResults([])
  }

  // Nearby shows whenever focused + not yet typed (even if field is pre-filled)
  // Search shows only once user has actively typed
  const showNearby = focused && !userTyped && nearbyCasinos.length > 0
  const showSearch = focused && userTyped && query.length >= MIN_CHARS
  const showSearchOnlineOption = showSearch && !showOnline && localResults.length < 3
  const hasDropdown = showNearby || (showSearch && (localResults.length > 0 || showSearchOnlineOption || showOnline))

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={handleInput}
          onFocus={() => { setFocused(true); setUserTyped(false) }}
          placeholder={gpsLoading ? 'Detecting location…' : placeholder}
          autoComplete="off"
          className="w-full min-h-12 rounded-2xl bg-zinc-800 px-4 text-white outline-none focus:ring-2 focus:ring-cyan-500/40 pr-10"
        />
        {/* GPS indicator */}
        {gpsLoading && (
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-cyan-400 text-xs animate-pulse">
            📍
          </span>
        )}
        {!gpsLoading && nearbyCasinos.length > 0 && !focused && (
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-cyan-400 text-xs">
            📍
          </span>
        )}
      </div>

      {hasDropdown && (
        <div className="absolute z-50 mt-1.5 w-full rounded-2xl bg-zinc-800 border border-zinc-700/60 shadow-xl overflow-hidden max-h-72 overflow-y-auto">

          {/* ── Nearby section ── */}
          {showNearby && (
            <>
              <div className="px-4 pt-3 pb-1.5 flex items-center gap-1.5">
                <span className="text-xs">📍</span>
                <span className="text-zinc-400 text-xs font-semibold uppercase tracking-wide">Near you</span>
              </div>
              {nearbyCasinos.map((casino, i) => (
                <button
                  key={casino.id}
                  type="button"
                  onMouseDown={e => { e.preventDefault(); pickNearby(casino) }}
                  onTouchStart={e => { touchStartYRef.current = e.touches[0].clientY }}
                  onTouchEnd={e => {
                    const delta = Math.abs(e.changedTouches[0].clientY - (touchStartYRef.current ?? 0))
                    if (delta < 8) { e.preventDefault(); pickNearby(casino) }
                  }}
                  className={`w-full text-left px-4 py-3 flex items-center justify-between hover:bg-zinc-700/60 active:bg-zinc-700 border-b border-zinc-700/40 last:border-0 ${i === 0 ? 'bg-zinc-700/30' : ''}`}
                >
                  <div>
                    <div className={`text-sm font-semibold leading-tight ${i === 0 ? 'text-white' : 'text-zinc-200'}`}>
                      {casino.name}
                    </div>
                    {(casino.city || casino.country) && (
                      <div className="text-zinc-400 text-xs mt-0.5">
                        {[casino.city, casino.state, casino.country].filter(Boolean).join(', ')}
                      </div>
                    )}
                  </div>
                  <span className={`text-xs font-semibold ml-3 shrink-0 ${i === 0 ? 'text-cyan-400' : 'text-zinc-500'}`}>
                    {fmtMiles(casino.distanceMi)}
                  </span>
                </button>
              ))}
              <button
                type="button"
                onMouseDown={e => { e.preventDefault(); setUserTyped(true); setLocalResults([]) }}
                onTouchStart={e => { touchStartYRef.current = e.touches[0].clientY }}
                onTouchEnd={e => {
                  const delta = Math.abs(e.changedTouches[0].clientY - (touchStartYRef.current ?? 0))
                  if (delta < 8) { e.preventDefault(); setUserTyped(true); setLocalResults([]) }
                }}
                className="w-full text-left px-4 py-3 text-cyan-400 text-sm font-semibold hover:bg-zinc-700/60 active:bg-zinc-700 border-t border-zinc-700/40"
              >
                🔍 Search all casinos…
              </button>
            </>
          )}

          {/* ── Search results section ── */}
          {showSearch && (
            <>
              {localResults.map(casino => (
                <button
                  key={casino.id}
                  type="button"
                  onMouseDown={e => { e.preventDefault(); pickLocal(casino) }}
                  onTouchStart={e => { touchStartYRef.current = e.touches[0].clientY }}
                  onTouchEnd={e => {
                    const delta = Math.abs(e.changedTouches[0].clientY - (touchStartYRef.current ?? 0))
                    if (delta < 8) { e.preventDefault(); pickLocal(casino) }
                  }}
                  className="w-full text-left px-4 py-3 hover:bg-zinc-700/60 active:bg-zinc-700 border-b border-zinc-700/40 last:border-0"
                >
                  <div className="text-white text-sm font-semibold leading-tight">{casino.name}</div>
                  {(casino.city || casino.country) && (
                    <div className="text-zinc-400 text-xs mt-0.5">
                      {[casino.city, casino.state, casino.country].filter(Boolean).join(', ')}
                    </div>
                  )}
                </button>
              ))}

              {showSearchOnlineOption && (
                <button
                  type="button"
                  onMouseDown={e => { e.preventDefault(); searchOnline() }}
                  onTouchStart={e => { touchStartYRef.current = e.touches[0].clientY }}
                  onTouchEnd={e => {
                    const delta = Math.abs(e.changedTouches[0].clientY - (touchStartYRef.current ?? 0))
                    if (delta < 8) { e.preventDefault(); searchOnline() }
                  }}
                  className="w-full text-left px-4 py-3 flex items-center gap-2 text-cyan-400 text-sm font-semibold hover:bg-zinc-700/60 active:bg-zinc-700 border-t border-zinc-700/40"
                >
                  <span>🔍</span>
                  <span>Search online for "{query}"</span>
                </button>
              )}

              {showOnline && (
                onlineLoading ? (
                  <div className="px-4 py-3 text-zinc-400 text-sm">Searching…</div>
                ) : onlineResults.length === 0 ? (
                  <div className="px-4 py-3 text-zinc-400 text-sm">No results found.</div>
                ) : (
                  onlineResults.map(place => (
                    <button
                      key={place.place_id}
                      type="button"
                      onMouseDown={e => { e.preventDefault(); pickOnline(place) }}
                      onTouchStart={e => { touchStartYRef.current = e.touches[0].clientY }}
                      onTouchEnd={e => {
                        const delta = Math.abs(e.changedTouches[0].clientY - (touchStartYRef.current ?? 0))
                        if (delta < 8) { e.preventDefault(); pickOnline(place) }
                      }}
                      className="w-full text-left px-4 py-3 hover:bg-zinc-700/60 active:bg-zinc-700 border-b border-zinc-700/40 last:border-0"
                    >
                      <div className="text-white text-sm font-semibold leading-tight">{place.name}</div>
                      {place.formatted_address && (
                        <div className="text-zinc-400 text-xs mt-0.5 truncate">{place.formatted_address}</div>
                      )}
                    </button>
                  ))
                )
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
