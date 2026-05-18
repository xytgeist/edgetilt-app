/** Strip trailing punctuation often pasted after URLs in prose. */
export function trimUrlTrail(url) {
  let u = String(url)
  while (u.length > 0 && /[),.;:!?\]'"]+$/u.test(u)) {
    u = u.slice(0, -1)
  }
  return u
}

export function hrefForUrlDisplay(display) {
  const d = String(display).trim()
  if (!d) return ''
  if (/^https?:\/\//iu.test(d)) return d
  if (/^www\./iu.test(d)) return `https://${d}`
  return ''
}

/**
 * Lounge caption: `http(s)://…` and `www.…` links (opens new tab), Unicode `#tags`, and `@handles`.
 * @param {{ hashtagClassName?: string, linkClassName?: string, mentionClassName?: string, onMentionClick?: (handle: string, e: MouseEvent) => void, onHashtagClick?: (tag: string, e: MouseEvent) => void }} [opts]
 */
export function renderRichCaption(
  text,
  {
    hashtagClassName = 'font-semibold text-cyan-400',
    linkClassName = 'font-medium text-sky-400 underline underline-offset-2 decoration-sky-400/70 break-words',
    mentionClassName = 'font-medium text-orange-400',
    onMentionClick = null,
    onHashtagClick = null,
  } = {}
) {
  const s = String(text ?? '')
  if (!s) return null
  const out = []
  let rk = 0

  const pushMentionParsed = (fragment) => {
    if (!fragment) return
    let last = 0
    const re = /@([\w]+)/g
    let m
    while ((m = re.exec(fragment)) !== null) {
      if (m.index > last) out.push(fragment.slice(last, m.index))
      const handle = m[1]
      if (onMentionClick) {
        out.push(
          <button
            key={`rk-m-${rk++}`}
            type="button"
            onClick={(e) => onMentionClick(handle, e)}
            className={`${mentionClassName} touch-manipulation [-webkit-tap-highlight-color:transparent]`}
          >
            @{handle}
          </button>
        )
      } else {
        out.push(
          <span key={`rk-m-${rk++}`} className={mentionClassName}>
            @{handle}
          </span>
        )
      }
      last = m.index + m[0].length
    }
    if (last < fragment.length) out.push(fragment.slice(last))
  }

  const pushHashtagParsed = (fragment) => {
    if (!fragment) return
    let last = 0
    const re = /#(?:[\p{L}\p{N}_-]+)/gu
    let m
    while ((m = re.exec(fragment)) !== null) {
      if (m.index > last) pushMentionParsed(fragment.slice(last, m.index))
      const tag = m[0]
      if (onHashtagClick) {
        out.push(
          <button
            key={`rk-h-${rk++}`}
            type="button"
            onClick={(e) => onHashtagClick(tag, e)}
            className={`${hashtagClassName} touch-manipulation [-webkit-tap-highlight-color:transparent]`}
          >
            {tag}
          </button>
        )
      } else {
        out.push(
          <span key={`rk-h-${rk++}`} className={hashtagClassName}>
            {tag}
          </span>
        )
      }
      last = m.index + m[0].length
    }
    if (last < fragment.length) pushMentionParsed(fragment.slice(last))
  }

  let last = 0
  const urlRe = /https?:\/\/[^\s<>"']+|www\.[^\s<>"']+/gi
  let um
  while ((um = urlRe.exec(s)) !== null) {
    const raw = um[0]
    const display = trimUrlTrail(raw)
    const href = hrefForUrlDisplay(display)
    if (um.index > last) {
      pushHashtagParsed(s.slice(last, um.index))
    }
    if (href) {
      out.push(
        <a
          key={`rk-u-${rk++}`}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={linkClassName}
        >
          {display}
        </a>
      )
    } else {
      pushHashtagParsed(display || raw)
    }
    last = um.index + raw.length
  }
  if (last < s.length) pushHashtagParsed(s.slice(last))
  return out.length ? out : null
}
