import { useCallback, useState } from 'react'

const DARK_SRC = '/edge-lounge-logo-transparent.png'
const LIGHT_SRC = '/edge-lounge-logo-light.png'
const MAX_RETRIES = 3

/** WKWebView sometimes drops the logo fetch (e.g. around the post-sign-in reload) and keeps the broken icon. */
function RetryingImg({ src, ...rest }) {
  const [attempt, setAttempt] = useState(0)
  const onError = useCallback(() => {
    if (attempt >= MAX_RETRIES) return
    window.setTimeout(() => setAttempt(attempt + 1), 400 * (attempt + 1))
  }, [attempt])
  return <img key={attempt} src={attempt ? `${src}?r=${attempt}` : src} onError={onError} {...rest} />
}

/** EDGE wordmark: dark + light PNGs, `html.light` picks which shows (`edge-logo--dark` / `edge-logo--light`). */
export default function EdgeLogoMarks({ className = '', alt = '' }) {
  return (
    <>
      <RetryingImg src={DARK_SRC} alt={alt} className={`edge-logo--dark ${className}`} draggable={false} />
      <RetryingImg src={LIGHT_SRC} alt={alt} className={`edge-logo--light ${className}`} draggable={false} />
    </>
  )
}
