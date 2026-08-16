/**
 * Member-facing copy for a failed Lounge feed load.
 *
 * Raw PostgREST / fetch text and repo-specific fix-it steps are staff-only ... members get a
 * plain reason plus Retry. Airplane mode / dropped wifi surfaces as `TypeError: Load failed`,
 * which is why offline is checked before the message is inspected.
 */

const NETWORK_ERROR_RE =
  /load failed|failed to fetch|fetch failed|networkerror|network request failed|network error|timed? ?out|err_internet_disconnected|err_network|err_connection|connection (?:closed|refused|reset|lost)|socket hang up/i

export const LOUNGE_FEED_LOAD_ERROR_KIND = {
  OFFLINE: 'offline',
  NETWORK: 'network',
  SERVER: 'server',
}

/** @param {string} message */
export function loungeFeedLoadErrorIsNetworkish(message) {
  return NETWORK_ERROR_RE.test(String(message || ''))
}

/**
 * @param {string} message Raw error text from the feed query.
 * @param {{ online?: boolean }} [opts]
 * @returns {{ kind: string, title: string, body: string }}
 */
export function classifyLoungeFeedLoadError(message, { online = true } = {}) {
  if (!online) {
    return {
      kind: LOUNGE_FEED_LOAD_ERROR_KIND.OFFLINE,
      title: "You're offline",
      body: 'The lounge will load as soon as you reconnect.',
    }
  }
  if (loungeFeedLoadErrorIsNetworkish(message)) {
    return {
      kind: LOUNGE_FEED_LOAD_ERROR_KIND.NETWORK,
      title: "Couldn't reach the lounge",
      body: 'Your connection dropped before the feed finished loading.',
    }
  }
  return {
    kind: LOUNGE_FEED_LOAD_ERROR_KIND.SERVER,
    title: "The lounge didn't load",
    body: 'Something went wrong on our end. Give it a moment and try again.',
  }
}
