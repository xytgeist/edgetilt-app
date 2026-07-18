/**
 * Group header avatar: 3 overlapping member faces, or single group photo when set.
 *
 * @param {{
 *   groupAvatarUrl?: string | null,
 *   members: Array<{ user_id: string, avatar_url?: string | null, display_name?: string | null, handle?: string | null }>,
 *   size?: number,
 * }} props
 */
export default function ChatGroupHeaderStack({ groupAvatarUrl = null, members = [], size = 64 }) {
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
  const face = Math.round(size * 0.52)
  const overlap = Math.round(size * 0.36)

  if (stack.length === 0) {
    return (
      <div
        className="relative z-10 grid place-items-center rounded-full bg-amber-900/60 text-[22px] font-bold text-amber-100/90 shadow-lg"
        style={{ width: size, height: size }}
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
            className="absolute top-0 rounded-full shadow-md overflow-hidden bg-zinc-700"
            style={{ left: i * overlap, width: face, height: face, zIndex: 10 - i }}
          >
            {av ? (
              <img src={av} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="grid h-full w-full place-items-center text-[14px] font-bold text-zinc-200">
                {initial}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
