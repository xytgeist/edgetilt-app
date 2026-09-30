import { useCallback, useState } from 'react'

const MAX_RETRIES = 3

/**
 * Static app asset `<img>` that re-requests (cache-busted) on load error. WKWebView sometimes drops
 * fetches around the post-sign-in reload and otherwise keeps the broken-image box.
 */
export default function RetryingImg({ src, ...rest }) {
  const [attempt, setAttempt] = useState(0)
  const onError = useCallback(() => {
    if (attempt >= MAX_RETRIES) return
    window.setTimeout(() => setAttempt(attempt + 1), 400 * (attempt + 1))
  }, [attempt])
  return <img key={attempt} src={attempt ? `${src}?r=${attempt}` : src} onError={onError} {...rest} />
}
