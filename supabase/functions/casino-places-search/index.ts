/**
 * casino-places-search
 *
 * Proxies a Google Places Text Search for casinos so the API key
 * stays server-side. Returns a slim array of candidates.
 *
 * GET /functions/v1/casino-places-search?q=bellagio
 *
 * Requires Supabase secret: GOOGLE_MAPS_API_KEY
 * Requires signed-in user (JWT) to reduce anon scraping of Places quota.
 *
 * Response: { results: [{ name, formatted_address, lat, lng, place_id }] }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Sign in required for online casino search.' }), {
      status: 401,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  if (!supabaseUrl || !supabaseAnonKey) {
    return new Response(JSON.stringify({ error: 'Supabase env not configured' }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData?.user) {
    return new Response(JSON.stringify({ error: 'Sign in required for online casino search.' }), {
      status: 401,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }

  const url = new URL(req.url)
  const q = (url.searchParams.get('q') ?? '').trim()

  if (q.length < 2) {
    return new Response(JSON.stringify({ results: [] }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }

  const apiKey = Deno.env.get('GOOGLE_MAPS_API_KEY')
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'GOOGLE_MAPS_API_KEY not set' }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }

  const placesUrl =
    `https://maps.googleapis.com/maps/api/place/textsearch/json` +
    `?query=${encodeURIComponent(q + ' casino')}` +
    `&type=casino` +
    `&key=${apiKey}`

  const placesRes = await fetch(placesUrl)
  const placesJson = await placesRes.json()

  if (placesJson.status !== 'OK' && placesJson.status !== 'ZERO_RESULTS') {
    return new Response(
      JSON.stringify({ error: placesJson.status, results: [] }),
      { status: 502, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  }

  const results = (placesJson.results ?? []).slice(0, 8).map((p: any) => ({
    name: p.name,
    formatted_address: p.formatted_address,
    lat: p.geometry?.location?.lat ?? null,
    lng: p.geometry?.location?.lng ?? null,
    place_id: p.place_id,
  }))

  return new Response(JSON.stringify({ results }), {
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
})
