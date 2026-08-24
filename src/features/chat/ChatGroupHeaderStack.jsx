/**
 * Group header avatar: up to 3 overlapping member faces, or single group photo when set.
 *
 * `size` is the face diameter (and the group-photo / empty disc). Conversation headers use
 * full-size faces (same as a DM avatar). Inbox rows pass `compact` so a 3-stack still fits
 * in a small list-tile box.
 *
 * @param {{
 *   groupAvatarUrl?: string | null,
 *   members: Array<{ user_id: string, avatar_url?: string | null, display_name?: string | null, handle?: string | null }>,
 *   size?: number,
 *   compact?: boolean,
 * }} props
 */
export default function ChatGroupHeaderStack({
  groupAvatarUrl = null,
  members = [],
  size = 64,
  compact = false,
}) {
  const url = String(groupAvatarUrl || '').trim()
  if (url) {
    return (
      <img
        src={url}
        alt=""
        className="relative z-10 rounded-full object-cover shadow-lg"
        style={{ width: size, height: size }}
      />
    )
  }

  const stack = members.slice(0, 3)
  // Compact: faces ~52% of `size` so 3 fit in a list-row disc. Full: face === DM avatar size.
  const face = compact ? Math.round(size * 0.52) : size
  const overlap = compact ? Math.round(size * 0.36) : Math.round(face * 0.55)
  const initialPx = Math.max(12, Math.round(face * 0.28))

  if (stack.length === 0) {
    return (
      <div
        className="relative z-10 grid place-items-center rounded-full bg-amber-900/60 font-bold text-amber-100/90 shadow-lg"
        style={{ width: size, height: size, fontSize: Math.max(18, Math.round(size * 0.34)) }}
      >
        👥
      </div>
    )
  }

  const totalW = face + overlap * Math.max(0, stack.length - 1)

  return (
    <div className="relative z-10" style={{ width: totalW, height: face }}>
      {stack.map((m, i) => {
        const label = m.display_name || m.handle || '?'
        const initial = String(label).replace(/^@/, '')[0]?.toUpperCase() || '?'
        const av = m.avatar_url
        return (
          <div
            key={m.user_id}
            className="absolute top-0 overflow-hidden rounded-full bg-zinc-700 shadow-md"
            style={{ left: i * overlap, width: face, height: face, zIndex: 10 - i }}
          >
            {av ? (
              <img src={av} alt="" className="h-full w-full object-cover" />
            ) : (
              <span
                className="grid h-full w-full place-items-center font-bold text-zinc-200"
                style={{ fontSize: initialPx }}
              >
                {initial}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
