import { useEffect, useMemo, useState } from 'react'
import LoungeFeedAuthorMetaBadges from '../features/lounge/LoungeFeedAuthorMetaBadges.jsx'
import { LoungePostFeedImagesAndGif } from '../features/lounge/LoungePostFeedMedia.jsx'
import {
  LOUNGE_FEED_META_TEXT_COLUMN_CLASS,
  LOUNGE_QUOTE_EMBED_AVATAR_CLASS,
  LOUNGE_QUOTE_EMBED_CAPTION_CLASS,
  LOUNGE_QUOTE_EMBED_DISPLAY_NAME_CLASS,
  LOUNGE_QUOTE_EMBED_META_HANDLE_TIME_CLASS,
  LOUNGE_QUOTE_EMBED_META_ROW_CLASS,
  LOUNGE_QUOTE_EMBED_SHELL_BASE,
  LOUNGE_QUOTE_EMBED_SHELL_INTERACTIVE,
} from '../features/lounge/loungeFeedAvatar.js'
import { profileAvatarInitials, profileAvatarToneClass } from '../features/profiles/profileGate.js'
import {
  fetchChatLoungePostEmbed,
  isLoungePostLinkPreview,
  loungePostAgeLabel,
  loungePostEmbedHasMedia,
  resolveLoungePostEmbedFromPreview,
} from '../utils/loungePostLinkPreview.js'

/**
 * Quote-repost-style Lounge post inset for Edge chat link previews.
 *
 * @param {{
 *   preview: object,
 *   className?: string,
 *   embedded?: boolean,
 *   supabaseClient?: import('@supabase/supabase-js').SupabaseClient | null,
 *   onPreviewOpen?: (preview: object, e: MouseEvent) => void,
 * }} props
 */
export default function ChatLoungePostPreviewCard({
  preview,
  className = '',
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

    let cancelled = false
    void fetchChatLoungePostEmbed(supabaseClient, postId).then((next) => {
      if (cancelled) return
      if (next) setEmbed(next)
      else setLoadFailed(true)
    })
    return () => {
      cancelled = true
    }
  }, [embed?.id, preview?.lounge_post_id, supabaseClient])

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
  const postForMedia = useMemo(
    () => ({
      id: embed?.id,
      caption: embed?.caption,
      media_url: embed?.media_url,
      gif_url: embed?.gif_url,
      image_urls: embed?.image_urls,
      stream_video_uid: embed?.stream_video_uid,
      stream_poster_url: embed?.stream_poster_url,
      stream_video_width: embed?.stream_video_width,
      stream_video_height: embed?.stream_video_height,
    }),
    [embed],
  )
  const hasMedia = loungePostEmbedHasMedia(postForMedia)

  if (!isLoungePostLinkPreview(preview) || loadFailed) return null

  const marginTop = embedded ? 'mt-2' : 'mt-0'
  const embeddedShell = embedded ? 'pt-2 border-t border-zinc-700/50' : ''
  const shellClass = embedded ? LOUNGE_QUOTE_EMBED_SHELL_BASE : LOUNGE_QUOTE_EMBED_SHELL_INTERACTIVE

  const open = (e) => {
    if (e.target instanceof Element && e.target.closest('[data-lounge-feed-carousel-track], [data-lounge-feed-carousel-bleed]')) {
      return
    }
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
  }

  return (
    <div
      role="button"
      tabIndex={0}
      data-chat-lounge-post-embed
      aria-label={`Open Lounge post by ${displayName}`}
      className={`${marginTop} ${embeddedShell} ${shellClass} ${className}`.trim()}
      onClick={(e) => {
        stop(e)
        open(e)
      }}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return
        if (e.target !== e.currentTarget) return
        e.preventDefault()
        open(e)
      }}
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
              displayNameClassName={LOUNGE_QUOTE_EMBED_DISPLAY_NAME_CLASS}
              metaVariant="quoteEmbed"
            />
            <span className={LOUNGE_QUOTE_EMBED_META_HANDLE_TIME_CLASS}>
              {handleLabel ? <span className="min-w-0 truncate">{handleLabel}</span> : null}
              {handleLabel && ageLabel ? <span className="shrink-0 text-zinc-600">·</span> : null}
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
        <div className={`mt-1 text-left line-clamp-6 ${LOUNGE_QUOTE_EMBED_CAPTION_CLASS}`}>{caption}</div>
      ) : null}
      {hasMedia ? (
        <div onClick={stop} onPointerDown={stop}>
          <LoungePostFeedImagesAndGif
            post={postForMedia}
            variant="embed"
            firstMarginTopClass="mt-2"
            enableLightbox={false}
            feedAutoplayRowId={embed?.id}
          />
        </div>
      ) : null}
    </div>
  )
}
