import { useEffect, useMemo, useState } from 'react'
import LoungeFeedAuthorMetaBadges from '../features/lounge/LoungeFeedAuthorMetaBadges.jsx'
import {
  LOUNGE_FEED_META_TEXT_COLUMN_CLASS,
  LOUNGE_QUOTE_EMBED_AVATAR_CLASS,
  LOUNGE_QUOTE_EMBED_CAPTION_CLASS,
  LOUNGE_QUOTE_EMBED_DISPLAY_NAME_CLASS,
  LOUNGE_QUOTE_EMBED_META_HANDLE_TIME_CLASS,
  LOUNGE_QUOTE_EMBED_META_ROW_CLASS,
} from '../features/lounge/loungeFeedAvatar.js'
import { profileAvatarInitials, profileAvatarToneClass } from '../features/profiles/profileGate.js'
import {
  fetchChatLoungePostEmbed,
  isLoungePostLinkPreview,
  loungePostAgeLabel,
  resolveLoungePostEmbedFromPreview,
} from '../utils/loungePostLinkPreview.js'

/**
 * Quote-repost-style Lounge post inset for Edge chat link previews.
 *
 * @param {{
 *   preview: object,
 *   className?: string,
 *   isMine?: boolean,
 *   embedded?: boolean,
 *   supabaseClient?: import('@supabase/supabase-js').SupabaseClient | null,
 *   onPreviewOpen?: (preview: object, e: MouseEvent) => void,
 * }} props
 */
export default function ChatLoungePostPreviewCard({
  preview,
  className = '',
  isMine = false,
  embedded = false,
  supabaseClient = null,
  onPreviewOpen,
}) {
  const [embed, setEmbed] = useState(() => resolveLoungePostEmbedFromPreview(preview))
  const [loadFailed, setLoadFailed] = useState(false)

  useEffect(() => {
    setEmbed(resolveLoungePostEmbedFromPreview(preview))
    setLoadFailed(false)
  }, [preview])

  useEffect(() => {
    const postId = String(preview?.lounge_post_id || embed?.id || '').trim()
    if (!postId || !supabaseClient) return undefined
    if (
      String(embed?.caption || '').trim() &&
      String(embed?.author?.display_name || embed?.author?.handle || '').trim()
    ) {
      return undefined
    }

    let cancelled = false
    void fetchChatLoungePostEmbed(supabaseClient, postId).then((next) => {
      if (cancelled) return
      if (next) setEmbed(next)
      else setLoadFailed(true)
    })
    return () => {
      cancelled = true
    }
  }, [embed?.author?.display_name, embed?.caption, embed?.id, preview?.lounge_post_id, supabaseClient])

  const author = embed?.author || {}
  const displayName = useMemo(() => {
    return String(author.display_name || author.handle || 'Member').trim() || 'Member'
  }, [author.display_name, author.handle])
  const handleLabel = useMemo(() => {
    const raw = String(author.handle || '').trim().replace(/^@/, '')
    return raw ? `@${raw}` : ''
  }, [author.handle])
  const caption = String(embed?.caption || '').trim()
  const ageLabel = loungePostAgeLabel(embed?.created_at)

  if (!isLoungePostLinkPreview(preview) || loadFailed) return null

  const marginTop = embedded ? 'mt-2' : 'mt-1.5'
  const widthClass = embedded ? 'w-full max-w-full' : 'w-full max-w-[280px]'
  const embeddedShell = embedded
    ? `pt-2 border-t ${isMine ? 'border-white/20' : 'border-zinc-600/50'}`
    : ''
  const shellBg = embedded
    ? isMine
      ? 'bg-black/12'
      : 'bg-black/25'
    : isMine
      ? 'bg-blue-600/90'
      : 'bg-zinc-800/95'
  const borderClass = isMine ? 'border-white/20' : 'border-zinc-600/50'
  const nameClass = isMine ? 'text-white' : LOUNGE_QUOTE_EMBED_DISPLAY_NAME_CLASS
  const metaClass = isMine ? 'text-white/75' : LOUNGE_QUOTE_EMBED_META_HANDLE_TIME_CLASS
  const captionClass = isMine ? 'text-white/90' : LOUNGE_QUOTE_EMBED_CAPTION_CLASS
  const dotClass = isMine ? 'text-white/45' : 'text-zinc-600'

  const open = (e) => {
    if (typeof onPreviewOpen === 'function') {
      onPreviewOpen(preview, e)
      return
    }
    try {
      window.open(preview.url, '_blank', 'noopener,noreferrer')
    } catch {
      /* */
    }
  }

  const stop = (e) => {
    e.stopPropagation()
    e.preventDefault()
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        stop(e)
        open(e)
      }}
      onPointerDown={stop}
      className={`${marginTop} ${embeddedShell} block ${widthClass} rounded-xl border ${borderClass} px-2.5 py-2 text-left touch-manipulation ${shellBg} ${className}`}
      aria-label={caption ? `Open Lounge post by ${displayName}` : `Open Lounge post by ${displayName}`}
    >
      <div className="flex min-w-0 items-center gap-2">
        <div className={`${LOUNGE_QUOTE_EMBED_AVATAR_CLASS} pointer-events-none`} aria-hidden>
          {author.avatar_url ? (
            <img src={author.avatar_url} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
          ) : (
            <span
              className={`flex h-full w-full items-center justify-center font-bold text-white ${profileAvatarToneClass(
                author.user_id || author.handle || 'member',
              )}`}
            >
              {profileAvatarInitials(author.display_name, author.handle)}
            </span>
          )}
        </div>
        <div className={`min-w-0 flex-1 ${LOUNGE_FEED_META_TEXT_COLUMN_CLASS}`}>
          <div className={LOUNGE_QUOTE_EMBED_META_ROW_CLASS}>
            <LoungeFeedAuthorMetaBadges
              role={author.role}
              isOg={author.is_og === true}
              displayName={displayName}
              displayNameClassName={nameClass}
              metaVariant="quoteEmbed"
            />
            <span className={metaClass}>
              {handleLabel ? <span className="min-w-0 truncate">{handleLabel}</span> : null}
              {handleLabel && ageLabel ? <span className={`shrink-0 ${dotClass}`}>·</span> : null}
              {ageLabel ? (
                <span className="shrink-0 font-normal tabular-nums whitespace-nowrap">{ageLabel}</span>
              ) : null}
            </span>
          </div>
          {embed?.pinned ? (
            <div className="mt-1">
              <span className="inline-flex shrink-0 rounded-full bg-fuchsia-500/20 px-2 py-0.5 text-xs font-semibold uppercase leading-none tracking-wide text-fuchsia-200">
                Pinned
              </span>
            </div>
          ) : null}
        </div>
      </div>
      {caption ? (
        <div className={`mt-1 text-left whitespace-pre-wrap break-words line-clamp-6 ${captionClass}`}>{caption}</div>
      ) : null}
    </button>
  )
}
