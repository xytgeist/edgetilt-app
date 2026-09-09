/**
 * Ops / cron destination flags for Syndicate desk drops.
 * Cron omits the picker … implicit destinations + x: false.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { publishLoungeBotPost, publishLoungeBotPostWithThread, type BotThreadPart } from './loungeBotPublish.ts'
import { publishBotSubChatMessage } from './loungeBotSubChatPublish.ts'
import { publishSyndicateXPost } from './loungeBotXPublish.ts'

export type PublishDestinations = {
  loungePublic: boolean
  loungeFanOnly: boolean
  vipChat: boolean
  x: boolean
}

const KEYS = ['loungePublic', 'loungeFanOnly', 'vipChat', 'x'] as const

/** Implicit destinations when Ops/cron omit the picker. x is always forced false. */
export function resolvePublishDestinations(
  raw: unknown,
  implicit: Omit<PublishDestinations, 'x'>,
): PublishDestinations {
  const fallback: PublishDestinations = {
    loungePublic: implicit.loungePublic === true,
    loungeFanOnly: implicit.loungeFanOnly === true,
    vipChat: implicit.vipChat === true,
    x: false,
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fallback
  const o = raw as Record<string, unknown>
  if (!KEYS.some((k) => k in o)) return fallback
  return {
    loungePublic: o.loungePublic === true,
    loungeFanOnly: o.loungeFanOnly === true,
    vipChat: o.vipChat === true,
    x: o.x === true,
  }
}

export function anyPublishDestination(d: PublishDestinations): boolean {
  return d.loungePublic || d.loungeFanOnly || d.vipChat || d.x
}

export function implicitDestForPollAction(action: string): Omit<PublishDestinations, 'x'> {
  switch (String(action || '').trim()) {
    case 'nfl_slate_card':
    case 'cfb_slate_card':
    case 'nfl_primetime_spotlight':
      return { loungePublic: true, loungeFanOnly: true, vipChat: true }
    case 'nfl_wong_teaser':
    case 'weekly_syndicate_recap':
    case 'nfl_anytime_td':
    case 'cfb_thu_night_spotlight':
      return { loungePublic: true, loungeFanOnly: false, vipChat: true }
    case 'predictive_pick':
    case 'picks_for_today':
      return { loungePublic: true, loungeFanOnly: false, vipChat: false }
    case 'nfl_halftime_pivot':
    case 'nfl_live_middle_arb':
    case 'nfl_wed_tnf_vip':
    case 'nfl_sat_vip_adds_kills':
    case 'cfb_wed_midweek_vip':
    case 'cfb_sat_vip_adds_kills':
    case 'ufc_slate_card':
      return { loungePublic: false, loungeFanOnly: false, vipChat: true }
    default:
      return { loungePublic: true, loungeFanOnly: false, vipChat: false }
  }
}

export type FanOutInput = {
  admin: SupabaseClient
  botUserId: string
  dest: PublishDestinations
  publicCaption?: string | null
  fanOnlyCaption?: string | null
  vipCaption?: string | null
  categoryPills?: string[]
  fanOnlyThreadParts?: BotThreadPart[]
  vipThreadParts?: string[]
}

export type FanOutResult = {
  publicPostId: string | null
  privatePostId: string | null
  vipMessageId: string | null
  tweetId: string | null
  error?: string
  xWarning?: string
  fanOnlyWarning?: string
  vipChatWarning?: string
}

/**
 * Honor destination flags. X uses public tease when present, else VIP caption (Ops opt-in leak).
 */
export async function fanOutSyndicatePublish(input: FanOutInput): Promise<FanOutResult> {
  const pills = input.categoryPills?.length ? input.categoryPills : ['sports']
  const publicCaption = String(input.publicCaption || '').trim()
  const fanOnlyCaption = String(input.fanOnlyCaption || '').trim()
  const vipCaption = String(input.vipCaption || '').trim()
  const out: FanOutResult = {
    publicPostId: null,
    privatePostId: null,
    vipMessageId: null,
    tweetId: null,
  }

  if (input.dest.loungePublic) {
    const caption = publicCaption || vipCaption
    if (!caption) {
      out.error = 'Public Lounge requested but no caption.'
      return out
    }
    const res = await publishLoungeBotPost(input.admin, {
      botUserId: input.botUserId,
      caption,
      categoryPills: pills,
    })
    if (res.error || !res.postId) {
      out.error = res.error || 'Lounge public publish failed.'
      return out
    }
    out.publicPostId = res.postId
  }

  if (input.dest.loungeFanOnly) {
    const caption = fanOnlyCaption || publicCaption || vipCaption
    if (!caption) {
      out.fanOnlyWarning = 'Fan-only Lounge requested but no caption.'
    } else {
      const res = await publishLoungeBotPostWithThread(input.admin, {
        botUserId: input.botUserId,
        caption,
        categoryPills: pills,
        creatorFanOnly: true,
        threadParts: input.fanOnlyThreadParts,
      })
      if (res.error || !res.postId) {
        out.fanOnlyWarning = res.error || 'Fan-only Lounge failed.'
      } else {
        out.privatePostId = res.postId
      }
    }
  }

  if (input.dest.vipChat) {
    const caption = vipCaption || publicCaption
    if (!caption) {
      out.vipChatWarning = 'VIP chat requested but no caption.'
    } else {
      const res = await publishBotSubChatMessage(input.admin, {
        botUserId: input.botUserId,
        caption,
        threadParts: input.vipThreadParts,
      })
      if (res.error || !res.messageId) {
        out.vipChatWarning = res.error || 'VIP chat failed.'
      } else {
        out.vipMessageId = res.messageId
      }
    }
  }

  if (input.dest.x) {
    const caption = publicCaption || vipCaption || fanOnlyCaption
    const x = await publishSyndicateXPost(caption)
    if (x.warning || !x.tweetId) {
      out.xWarning = x.warning || 'X publish failed.'
    } else {
      out.tweetId = x.tweetId
    }
  }

  return out
}

export function fanOutWarnings(fan: FanOutResult): string | undefined {
  const parts = [fan.fanOnlyWarning, fan.vipChatWarning, fan.xWarning].filter(Boolean)
  return parts.length ? parts.join(' ') : undefined
}

const VIP_ONLY_IMPLICIT = { loungePublic: false, loungeFanOnly: false, vipChat: true } as const

/** VIP-only runners (halftime, middle, Wed/Sat ops). Public/X are Ops opt-in. */
export async function fanOutVipOnlyCaption(input: {
  admin: SupabaseClient
  botUserId: string
  destinations?: unknown
  caption: string
  categoryPills?: string[]
}): Promise<FanOutResult & { dest: PublishDestinations }> {
  const dest = resolvePublishDestinations(input.destinations, VIP_ONLY_IMPLICIT)
  const fan = await fanOutSyndicatePublish({
    admin: input.admin,
    botUserId: input.botUserId,
    dest,
    vipCaption: input.caption,
    categoryPills: input.categoryPills?.length ? input.categoryPills : ['sports'],
  })
  return { ...fan, dest }
}

/** True when nothing landed on any requested channel. */
export function fanOutMissedAll(fan: FanOutResult): boolean {
  return !fan.publicPostId && !fan.privatePostId && !fan.vipMessageId && !fan.tweetId
}
