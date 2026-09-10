/**
 * Ops / cron destination flags for Syndicate desk drops.
 * Cron omits the picker … implicit destinations + x: false.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { publishLoungeBotPost, publishLoungeBotPostWithThread, type BotThreadPart } from './loungeBotPublish.ts'
import { publishBotSubChatMessage } from './loungeBotSubChatPublish.ts'
import { toPlainOutboundText } from './loungeBotPlainOutbound.ts'
import { formatSyndicateXText, publishSyndicateXPost } from './loungeBotXPublish.ts'

export type PublishDestinations = {
  loungePublic: boolean
  loungeFanOnly: boolean
  vipChat: boolean
  x: boolean
}

const KEYS = ['loungePublic', 'loungeFanOnly', 'vipChat', 'x'] as const

/** Implicit destinations when Ops/cron omit the picker. x stays off unless implicit.x is true. */
export function resolvePublishDestinations(
  raw: unknown,
  implicit: Omit<PublishDestinations, 'x'> & { x?: boolean },
): PublishDestinations {
  const fallback: PublishDestinations = {
    loungePublic: implicit.loungePublic === true,
    loungeFanOnly: implicit.loungeFanOnly === true,
    vipChat: implicit.vipChat === true,
    x: implicit.x === true,
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

export function implicitDestForPollAction(action: string): PublishDestinations {
  switch (String(action || '').trim()) {
    case 'nfl_slate_card':
    case 'cfb_slate_card':
      return { loungePublic: true, loungeFanOnly: true, vipChat: true, x: false }
    case 'nfl_primetime_spotlight':
      return { loungePublic: true, loungeFanOnly: false, vipChat: true, x: true }
    case 'nfl_wong_teaser':
    case 'weekly_syndicate_recap':
    case 'nfl_anytime_td':
    case 'cfb_thu_night_spotlight':
      return { loungePublic: true, loungeFanOnly: false, vipChat: true, x: false }
    case 'predictive_pick':
    case 'picks_for_today':
      return { loungePublic: true, loungeFanOnly: false, vipChat: false, x: false }
    case 'nfl_halftime_pivot':
    case 'nfl_live_middle_arb':
    case 'nfl_wed_tnf_vip':
    case 'nfl_sat_vip_adds_kills':
    case 'cfb_wed_midweek_vip':
    case 'cfb_sat_vip_adds_kills':
    case 'ufc_slate_card':
      return { loungePublic: false, loungeFanOnly: false, vipChat: true, x: false }
    default:
      return { loungePublic: true, loungeFanOnly: false, vipChat: false, x: false }
  }
}

export type DestPreviewPart = { label?: string; body: string }

export type DestPreviewSlot = {
  caption: string
  threadParts: DestPreviewPart[]
  chars?: number
  limit?: number
}

/** Exact copy each Send to location would get (same fallbacks as fanOut). */
export type SyndicateDestPreview = {
  public: DestPreviewSlot
  private: DestPreviewSlot
  chat: DestPreviewSlot
  x: DestPreviewSlot
}

export type DestPreviewInput = {
  publicCaption?: string | null
  fanOnlyCaption?: string | null
  fanOnlyThreadParts?: Array<{ label?: string; body?: string } | string> | null
  vipCaption?: string | null
  vipThreadParts?: Array<{ label?: string; body?: string } | string> | null
  xCaption?: string | null
  xMaxChars?: number
}

function normalizeThreadParts(raw: DestPreviewInput['fanOnlyThreadParts']): DestPreviewPart[] {
  if (!Array.isArray(raw)) return []
  const out: DestPreviewPart[] = []
  for (const part of raw) {
    if (typeof part === 'string') {
      const body = part.trim()
      if (body) out.push({ body })
      continue
    }
    if (!part || typeof part !== 'object') continue
    const body = String(part.body || '').trim()
    if (!body) continue
    const label = String(part.label || '').trim()
    out.push(label ? { label, body } : { body })
  }
  return out
}

export function buildSyndicateDestPreview(input: DestPreviewInput): SyndicateDestPreview {
  const publicCaption = String(input.publicCaption || '').trim()
  const fanOnlyCaption = String(input.fanOnlyCaption || '').trim()
  const vipCaption = String(input.vipCaption || '').trim()
  const xCaption = String(input.xCaption || '').trim()
  const xMaxChars = input.xMaxChars
  const fanThreads = normalizeThreadParts(input.fanOnlyThreadParts)
  const vipThreads = normalizeThreadParts(input.vipThreadParts)
  const publicOut = publicCaption || vipCaption
  const privateOut = fanOnlyCaption || publicCaption || vipCaption
  const chatOut = vipCaption || publicCaption
  const xOut = formatSyndicateXText(xCaption || publicCaption || vipCaption || fanOnlyCaption, xMaxChars)
  return {
    public: { caption: publicOut, threadParts: [] },
    private: { caption: privateOut, threadParts: fanThreads },
    chat: {
      caption: toPlainOutboundText(chatOut),
      threadParts: vipThreads.map((p) => ({
        ...(p.label ? { label: p.label } : {}),
        body: toPlainOutboundText(p.body),
      })),
    },
    x: { caption: xOut, threadParts: [], chars: xOut.length, ...(xMaxChars ? { limit: xMaxChars } : {}) },
  }
}

export function destPreviewPayload(input: DestPreviewInput): { destPreviews: SyndicateDestPreview } {
  return { destPreviews: buildSyndicateDestPreview(input) }
}

export type FanOutInput = {
  admin: SupabaseClient
  botUserId: string
  dest: PublishDestinations
  publicCaption?: string | null
  fanOnlyCaption?: string | null
  vipCaption?: string | null
  xCaption?: string | null
  xMaxChars?: number
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
 * Honor destination flags. X uses xCaption when set, else public tease, else VIP (Ops opt-in leak).
 */
export async function fanOutSyndicatePublish(input: FanOutInput): Promise<FanOutResult> {
  const pills = input.categoryPills?.length ? input.categoryPills : ['sports']
  const publicCaption = String(input.publicCaption || '').trim()
  const fanOnlyCaption = String(input.fanOnlyCaption || '').trim()
  const vipCaption = String(input.vipCaption || '').trim()
  const xCaption = String(input.xCaption || '').trim()
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
    const caption = xCaption || publicCaption || vipCaption || fanOnlyCaption
    const x = await publishSyndicateXPost(caption, { maxChars: input.xMaxChars })
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
