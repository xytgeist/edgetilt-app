const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const publicKey = Deno.env.get('WEB_PUSH_PUBLIC_KEY')
  if (!publicKey || !publicKey.trim()) {
    return new Response(JSON.stringify({ error: 'WEB_PUSH_PUBLIC_KEY is not set for this project.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({ publicKey: publicKey.trim() }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
