/** Parse X API v2 error bodies into a short operator-facing message. */
export function formatXApiFailure(status: number, rawText: string): string {
  let detail = String(rawText || '').trim().slice(0, 300)
  try {
    const j = JSON.parse(rawText)
    const errs = Array.isArray(j?.errors) ? j.errors : []
    const first = errs[0]
    if (first?.detail) detail = String(first.detail)
    else if (first?.title) detail = String(first.title)
    else if (j?.detail) detail = String(j.detail)
    else if (j?.title) detail = String(j.title)
  } catch {
    // keep raw slice
  }

  if (status === 401) {
    return (
      `X API unauthorized (401). Use the App-only Bearer Token from the X Developer Portal ` +
      `(not consumer key/secret) and set it as X_API_BEARER_TOKEN in Supabase Edge secrets. ${detail}`
    )
  }
  if (status === 402 || status === 403) {
    return (
      `X API access denied (${status}). Tweet read lookup usually requires a paid X API plan ` +
      `(Basic or higher) with Read permissions on the app. ${detail}`
    )
  }
  if (status === 429) {
    return `X API rate limited (429). Wait and retry. ${detail}`
  }
  return `X API ${status}: ${detail || 'request failed'}`
}

export async function readXApiError(res: Response): Promise<string> {
  const text = await res.text().catch(() => '')
  return formatXApiFailure(res.status, text)
}
