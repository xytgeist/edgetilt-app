import { formatFanTierLabel } from './fanSubTiers.js'
import { creatorFanOfferHeadline } from './fanSubOffer.js'

/**
 * Fan-facing offer summary for the creator settings panel (matches Subscribe modal copy).
 * @param {{
 *   handle?: string,
 *   tierKey?: string,
 *   headline: string,
 *   intro: string,
 *   privatePosts: string,
 *   fanChat: string,
 *   onEdit?: () => void,
 *   editDisabled?: boolean,
 * }} props
 */
export default function CreatorFanOfferPreviewCard({
  handle = '',
  tierKey = '',
  headline,
  intro,
  privatePosts,
  fanChat,
  onEdit,
  editDisabled = false,
}) {
  const displayHeadline = creatorFanOfferHeadline(
    { offer_headline: headline, handle },
    handle,
  )
  const tierLabel = formatFanTierLabel(String(tierKey || ''))
  const introText = String(intro || '').trim()
  const postsText = String(privatePosts || '').trim()
  const chatText = String(fanChat || '').trim()

  return (
    <div
      data-creator-fan-offer-preview
      className="rounded-xl border border-zinc-700/80 bg-zinc-950/80 p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-zinc-500">
            Fan offer preview
          </p>
          <p className="mt-2 text-[17px] font-bold text-zinc-100">{displayHeadline}</p>
          {tierLabel ? (
            <p className="mt-1 text-[14px] font-semibold text-orange-400">{tierLabel}</p>
          ) : null}
        </div>
        {onEdit ? (
          <button
            type="button"
            disabled={editDisabled}
            onClick={onEdit}
            className="shrink-0 rounded-lg border border-zinc-600/90 bg-zinc-800/80 px-3 py-1.5 text-[13px] font-semibold text-zinc-100 hover:bg-zinc-700/80 disabled:opacity-50"
          >
            Edit
          </button>
        ) : null}
      </div>

      {introText ? (
        <p className="mt-4 text-[15px] leading-relaxed text-zinc-300 whitespace-pre-wrap">{introText}</p>
      ) : null}

      {postsText ? (
        <section className="mt-5">
          <h3 className="text-[13px] font-bold text-zinc-100">Private posts</h3>
          <p className="mt-2 text-[15px] leading-relaxed text-zinc-300 whitespace-pre-wrap">{postsText}</p>
        </section>
      ) : null}

      {chatText ? (
        <section className="mt-5">
          <h3 className="text-[13px] font-bold text-zinc-100">Fan group chat</h3>
          <p className="mt-2 text-[15px] leading-relaxed text-zinc-300 whitespace-pre-wrap">{chatText}</p>
        </section>
      ) : null}

      <p className="mt-4 text-[12px] leading-snug text-zinc-600">
        This is what fans see before checkout.
      </p>
    </div>
  )
}
