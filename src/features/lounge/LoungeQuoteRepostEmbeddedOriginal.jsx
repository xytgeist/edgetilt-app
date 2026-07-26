import { isLoungeFanOnlyPostLocked } from '../../utils/loungeFanOnlyPost.js'
import LoungeQuoteRepostEmbedAuthorMeta from './LoungeQuoteRepostEmbedAuthorMeta.jsx'
import LoungeExpandableRichCaption from './LoungeExpandableRichCaption.jsx'
import LoungeLinkPreviewBlock from './LoungeLinkPreviewBlock.jsx'
import { LoungePostFeedImagesAndGif } from './LoungePostFeedMedia.jsx'
import LoungeFanOnlyLockedPostInset from './LoungeFanOnlyLockedPostInset.jsx'
import {
  LOUNGE_QUOTE_EMBED_CAPTION_CLASS,
  LOUNGE_QUOTE_EMBED_SHELL_BASE,
  LOUNGE_QUOTE_EMBED_SHELL_INTERACTIVE,
} from './loungeFeedAvatar.js'

/**
 * Quote-repost card inset: original post body, or locked blur + subscribe for fan-only sources.
 */
export default function LoungeQuoteRepostEmbeddedOriginal({
  hostPost,
  repostedPost,
  fanLockCtx,
  captionText,
  captionOpts,
  showCaption,
  displayNameFor,
  handleFor,
  postAgeLabel,
  onEmbeddedAuthorProfile,
  onOpenOriginal,
  onLinkPreviewOpen,
  renderMarketStrip,
  mediaLightboxProps,
  onOpenGuideCard,
  fanSubscribeBusy = false,
  onSubscribeToCreatorFan,
  captionStartExpanded = false,
}) {
  if (!repostedPost) return null

  const locked = isLoungeFanOnlyPostLocked(repostedPost, fanLockCtx)
  const creatorHandle =
    repostedPost.author_profile?.handle || handleFor(repostedPost)?.replace(/^@/, '')
  const onSubscribe = () => onSubscribeToCreatorFan?.(repostedPost.user_id)

  const authorMeta = (
    <LoungeQuoteRepostEmbedAuthorMeta
      post={repostedPost}
      displayNameFor={displayNameFor}
      handleFor={handleFor}
      postAgeLabel={postAgeLabel}
      onDisplayNameClick={
        onEmbeddedAuthorProfile
          ? (e) => onEmbeddedAuthorProfile(e, repostedPost)
          : undefined
      }
    />
  )

  if (locked) {
    return (
      <div className={LOUNGE_QUOTE_EMBED_SHELL_BASE} data-lounge-quote-embed-locked>
        {authorMeta}
        {typeof onSubscribeToCreatorFan === 'function' ? (
          <LoungeFanOnlyLockedPostInset
            text={showCaption ? captionText : ''}
            captionOpts={captionOpts}
            creatorHandle={creatorHandle}
            busy={fanSubscribeBusy}
            onSubscribe={onSubscribe}
            className="mt-1"
          />
        ) : null}
      </div>
    )
  }

  const openOriginal = (e) => {
    if (e.target instanceof Element && e.target.closest('button, a, [data-lounge-fan-only-cta]')) {
      e.stopPropagation()
      return
    }
    onOpenOriginal?.(e)
  }

  return (
    <div
      role="button"
      tabIndex={0}
      data-lounge-original-embed
      aria-label="View original post"
      className={LOUNGE_QUOTE_EMBED_SHELL_INTERACTIVE}
      onClick={openOriginal}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return
        if (e.target !== e.currentTarget) return
        e.preventDefault()
        onOpenOriginal?.(e)
      }}
    >
      {authorMeta}
      {showCaption ? (
        <div className={`mt-1 text-left ${LOUNGE_QUOTE_EMBED_CAPTION_CLASS}`}>
          <LoungeExpandableRichCaption
            text={captionText}
            captionOpts={captionOpts}
            startExpanded={captionStartExpanded}
          />
        </div>
      ) : null}
      <LoungeLinkPreviewBlock preview={repostedPost.link_preview} className="mt-2" onPreviewOpen={onLinkPreviewOpen} />
      {renderMarketStrip?.(repostedPost, 'mt-2')}
      <LoungePostFeedImagesAndGif
        post={repostedPost}
        variant="embed"
        feedAutoplayRowId={hostPost?.id}
        firstMarginTopClass="mt-2"
        {...mediaLightboxProps}
      />
      {repostedPost.is_ap_guide_post && repostedPost.game_slug ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onOpenGuideCard?.(repostedPost.game_slug)
          }}
          className="mt-2 w-full text-left rounded-xl overflow-hidden border border-zinc-700/60 bg-zinc-900/80 hover:border-zinc-600 active:border-cyan-700/60 transition-colors touch-manipulation [-webkit-tap-highlight-color:transparent]"
          aria-label={`View AP Guide: ${repostedPost.game_title}`}
        >
          <div className="relative h-40 bg-gradient-to-br from-amber-950/60 to-zinc-900 overflow-hidden">
            {repostedPost.guide_thumbnail_url ? (
              <img
                src={repostedPost.guide_thumbnail_url}
                alt=""
                className="h-full w-full object-cover opacity-80"
                loading="lazy"
                decoding="async"
                onError={(ev) => {
                  ev.currentTarget.style.display = 'none'
                }}
              />
            ) : null}
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
            <div className="absolute bottom-0 inset-x-0 px-2.5 pb-2 flex flex-col items-start gap-1">
              <p className="text-[#fff] font-bold text-xs leading-tight truncate w-full">
                {repostedPost.game_title}
              </p>
              <span className="inline-flex items-center rounded-full border border-amber-500/50 bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-300">
                AP Guide
              </span>
            </div>
          </div>
        </button>
      ) : null}
    </div>
  )
}
