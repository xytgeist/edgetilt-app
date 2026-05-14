/**
 * Invoke `lounge-chat` Edge function with the caller's Supabase session JWT.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {Record<string, unknown>} payload Must include `action`.
 */
export async function loungeChatInvoke(supabase, payload) {
  const { data, error } = await supabase.functions.invoke('lounge-chat', { body: payload })
  if (error) {
    throw new Error(error.message || 'Chat request failed.')
  }
  if (data && typeof data === 'object' && 'error' in data && data.error) {
    throw new Error(String(data.error))
  }
  return data
}
