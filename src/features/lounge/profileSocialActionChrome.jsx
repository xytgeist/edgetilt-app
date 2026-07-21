import { Ban, Bell, BellRing, MessageCircle, UserCheck, UserPlus } from 'lucide-react'

/** Shared glyph size for profile header social actions (Follow, Message, Alerts, Block). */
export const PROFILE_SOCIAL_ACTION_ICON_CLASS = 'h-[18px] w-[18px] shrink-0'

const PROFILE_SOCIAL_ACTION_BTN_BASE =
  'flex h-9 w-9 shrink-0 items-center justify-center rounded-full border touch-manipulation outline-none ring-0 [-webkit-tap-highlight-color:transparent] disabled:cursor-not-allowed disabled:opacity-50'

const PROFILE_SOCIAL_NEUTRAL_BTN =
  `${PROFILE_SOCIAL_ACTION_BTN_BASE} border-zinc-600/85 bg-zinc-950/75 text-zinc-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] hover:border-zinc-500 hover:bg-zinc-900 hover:text-zinc-100`

/**
 * @param {'neutral'|'followActive'|'alertsActive'|'alertsFan'|'alertsFanActive'|'blockActive'|'block'} variant
 */
export function profileSocialActionButtonClass(variant) {
  if (variant === 'followActive') {
    return `${PROFILE_SOCIAL_ACTION_BTN_BASE} border-cyan-500/55 bg-cyan-950/35 text-cyan-100 shadow-[inset_0_1px_0_rgba(34,211,238,0.12)] hover:border-cyan-400/65`
  }
  if (variant === 'alertsActive') {
    return `${PROFILE_SOCIAL_ACTION_BTN_BASE} border-orange-500/50 bg-orange-950/35 text-orange-100 shadow-[inset_0_1px_0_rgba(251,146,60,0.12)] hover:border-orange-400/55`
  }
  if (variant === 'alertsFan') {
    return `${PROFILE_SOCIAL_ACTION_BTN_BASE} border-orange-500/65 bg-orange-500 text-zinc-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] hover:bg-orange-400`
  }
  if (variant === 'alertsFanActive') {
    return `${PROFILE_SOCIAL_ACTION_BTN_BASE} border-orange-500/50 bg-orange-950/35 text-orange-100 shadow-[inset_0_1px_0_rgba(251,146,60,0.1)] hover:border-orange-400/55`
  }
  if (variant === 'blockActive') {
    return `${PROFILE_SOCIAL_ACTION_BTN_BASE} border-red-600/55 bg-red-950/40 text-red-200 hover:border-red-500/60`
  }
  if (variant === 'block') {
    return `${PROFILE_SOCIAL_NEUTRAL_BTN} text-zinc-400 hover:border-red-700/45 hover:text-red-300`
  }
  return PROFILE_SOCIAL_NEUTRAL_BTN
}

const lucideProps = {
  className: PROFILE_SOCIAL_ACTION_ICON_CLASS,
  strokeWidth: 1.75,
  'aria-hidden': true,
}

export function ProfileSocialFollowIcon({ following }) {
  const Icon = following ? UserCheck : UserPlus
  return <Icon {...lucideProps} />
}

export function ProfileSocialMessageIcon() {
  return <MessageCircle {...lucideProps} />
}

/** @param {{ active?: boolean }} props */
export function ProfileSocialAlertsIcon({ active = false }) {
  if (active) {
    return <BellRing {...lucideProps} />
  }
  return <Bell {...lucideProps} />
}

export function ProfileSocialBlockIcon() {
  return <Ban {...lucideProps} />
}
