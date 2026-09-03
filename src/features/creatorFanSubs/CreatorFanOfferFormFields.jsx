import { CREATOR_FAN_OFFER_LIMITS } from './fanSubOffer.js'
import { CREATOR_FAN_TIER_KEYS, formatFanTierLabel } from './fanSubTiers.js'

const LABEL_CLASS = 'text-[12px] font-semibold uppercase tracking-wide text-zinc-500'
const INPUT_CLASS =
  'mt-1.5 w-full rounded-lg border border-zinc-700/90 bg-zinc-900/80 px-3 py-2.5 text-[14px] text-zinc-100 outline-none focus:border-orange-500/50'

/**
 * @param {{
 *   headline: string,
 *   intro: string,
 *   privatePosts: string,
 *   fanChat: string,
 *   tierKey?: string,
 *   onHeadlineChange: (v: string) => void,
 *   onIntroChange: (v: string) => void,
 *   onPrivatePostsChange: (v: string) => void,
 *   onFanChatChange: (v: string) => void,
 *   onTierChange?: (v: string) => void,
 *   tierLocked?: boolean,
 *   disabled?: boolean,
 * }} props
 */
export default function CreatorFanOfferFormFields({
  headline,
  intro,
  privatePosts,
  fanChat,
  tierKey = 'fan-tier-999',
  onHeadlineChange,
  onIntroChange,
  onPrivatePostsChange,
  onFanChatChange,
  onTierChange,
  tierLocked = false,
  disabled = false,
}) {
  return (
    <div className="space-y-3" data-creator-fan-offer-form>
      <p className="text-[13px] leading-relaxed text-zinc-500">
        Tell fans what they get. Subscribers see this before checkout. You can edit anytime.
      </p>
      <label className="block">
        <span className={LABEL_CLASS}>Monthly price</span>
        <select
          value={tierKey}
          disabled={disabled || tierLocked || !onTierChange}
          onChange={(e) => onTierChange?.(e.target.value)}
          className={INPUT_CLASS}
        >
          {CREATOR_FAN_TIER_KEYS.map((key) => (
            <option key={key} value={key}>
              {formatFanTierLabel(key)}
            </option>
          ))}
        </select>
        {tierLocked ? (
          <span className="mt-1 block text-[12px] text-zinc-600">
            Price is locked while fan subscriptions are live.
          </span>
        ) : null}
      </label>
      <label className="block">
        <span className={LABEL_CLASS}>Headline (optional)</span>
        <input
          type="text"
          value={headline}
          disabled={disabled}
          maxLength={CREATOR_FAN_OFFER_LIMITS.headline}
          onChange={(e) => onHeadlineChange(e.target.value)}
          placeholder="e.g. Inner circle with me"
          className={INPUT_CLASS}
        />
      </label>
      <label className="block">
        <span className={LABEL_CLASS}>Overview</span>
        <textarea
          value={intro}
          disabled={disabled}
          maxLength={CREATOR_FAN_OFFER_LIMITS.intro}
          rows={3}
          onChange={(e) => onIntroChange(e.target.value)}
          placeholder="Short pitch: who this is for and what fans can expect overall."
          className={`${INPUT_CLASS} min-h-[4.5rem] resize-y`}
        />
      </label>
      <label className="block">
        <span className={LABEL_CLASS}>Private posts</span>
        <span className="mt-0.5 block text-[12px] text-zinc-600">
          Fan-only Lounge posts … what you will share here (drops, picks, BTS, etc.).
        </span>
        <textarea
          value={privatePosts}
          disabled={disabled}
          maxLength={CREATOR_FAN_OFFER_LIMITS.privatePosts}
          rows={4}
          onChange={(e) => onPrivatePostsChange(e.target.value)}
          placeholder="e.g. Weekly slot picks, session recaps, and Q&A threads fans do not see on the public feed."
          className={`${INPUT_CLASS} min-h-[5.5rem] resize-y`}
        />
      </label>
      <label className="block">
        <span className={LABEL_CLASS}>Fan group chat</span>
        <span className="mt-0.5 block text-[12px] text-zinc-600">
          Your private group room … how you show up and what members get.
        </span>
        <textarea
          value={fanChat}
          disabled={disabled}
          maxLength={CREATOR_FAN_OFFER_LIMITS.fanChat}
          rows={4}
          onChange={(e) => onFanChatChange(e.target.value)}
          placeholder="e.g. Live trip chat during Vegas weekends, quick line checks, and member-only polls."
          className={`${INPUT_CLASS} min-h-[5.5rem] resize-y`}
        />
      </label>
      <p className="text-[12px] leading-snug text-zinc-600">
        Need at least ~20 characters in the overview plus one detail section before you can go live.
      </p>
    </div>
  )
}
