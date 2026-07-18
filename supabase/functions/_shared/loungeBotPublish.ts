/**
 * Service-role publish helper for Lounge bots.
 */

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { attachLinkPreviewToEntity, unfurlUrl, type LinkPreviewPayload } from './linkUnfurl.ts'
import { isXTwitterHttpUrl, stripXTwitterUrlsFromText } from './loungeBotXTweetUrl.ts'
import { sanitizeBotProse } from './wireBotProse.ts'

export type BotPublishInput = {
  botUserId: string
  caption: string
  categoryPills?: string[]
  sourceUrl?: string | null
  /** When true, skip URL + preview unless unfurl succeeds (news bots). Default false. */
  requirePreviewToAttachLink?: boolean
  /** When true, post is hidden from anon / non-subscribers on the lounge feed. */
  subscriberOnly?: boolean
}

export type BotPublishResult = {
  postId: string | null
  error: string | null
  threadPartCount?: number
}

export type BotThreadPart = {
  body: string
}

export function serviceAdmin(): SupabaseClient {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim()
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim()
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.')
  }
  return createClient(supabaseUrl, serviceRoleKey)
}

export async function publishLoungeBotPost(
  admin: SupabaseClient,
  input: BotPublishInput,
): Promise<BotPublishResult> {
  const caption = stripXTwitterUrlsFromText(sanitizeBotProse(String(input.caption || '').trim()))
  if (!caption) return { postId: null, error: 'Empty caption.' }
  if (caption.length > 2000) return { postId: null, error: 'Caption exceeds 2000 chars.' }

  const pills = Array.isArray(input.categoryPills)
    ? input.categoryPills.map((p) => String(p || '').trim()).filter(Boolean).slice(0, 3)
    : []

  let finalCaption = caption
  const rawUrl = String(input.sourceUrl || '').trim()
  const url = rawUrl && !isXTwitterHttpUrl(rawUrl) ? rawUrl : ''
  const requirePreview = input.requirePreviewToAttachLink === true
  let preparedPreview: LinkPreviewPayload | null = null

  if (url) {
    preparedPreview = await unfurlUrl(admin, url)

    if (!finalCaption.includes(url)) {
      const withUrl = `${finalCaption} ${url}`.trim()
      finalCaption = withUrl.length <= 2000 ? withUrl : caption
    }
  }

  const row: Record<string, unknown> = {
    user_id: input.botUserId,
    caption: finalCaption,
    game_title: '',
    game_slug: null,
    category_pills: pills,
    subscriber_only: input.subscriberOnly === true,
  }

  const { data, error } = await admin
    .from('community_feed_posts')
    .insert(row)
    .select('id')
    .single()

  if (error || !data?.id) {
    return { postId: null, error: error?.message || 'Insert failed.' }
  }

  try {
    if (preparedPreview) {
      await admin
        .from('community_feed_posts')
        .update({ link_preview: preparedPreview })
        .eq('id', data.id)
    } else if (url && !requirePreview) {
      await attachLinkPreviewToEntity(admin, 'feed_post', data.id, finalCaption, input.botUserId)
    }
  } catch {
    // Link preview is best-effort for bot posts.
  }

  return { postId: data.id as string, error: null }
}

/** Publish root post plus author thread parts (feed_comments.is_thread_part). */
export async function publishLoungeBotPostWithThread(
  admin: SupabaseClient,
  input: BotPublishInput & { threadParts?: BotThreadPart[] },
): Promise<BotPublishResult> {
  const root = await publishLoungeBotPost(admin, input)
  if (!root.postId) return root

  const parts = (input.threadParts || [])
    .map((part) => stripXTwitterUrlsFromText(sanitizeBotProse(String(part?.body || '').trim())))
    .filter(Boolean)

  if (!parts.length) {
    return { ...root, threadPartCount: 1 }
  }

  for (let i = 0; i < parts.length; i++) {
    let body = parts[i]!
    if (body.length > 2000) body = `${body.slice(0, 1997)}...`

    const { error } = await admin.from('feed_comments').insert({
      post_id: root.postId,
      user_id: input.botUserId,
      body,
      is_thread_part: true,
      thread_part_index: i + 1,
    })

    if (error) {
      return {
        postId: root.postId,
        error: `Thread part ${i + 1}: ${error.message}`,
        threadPartCount: 1 + i,
      }
    }
  }

  const threadPartCount = 1 + parts.length
  await admin
    .from('community_feed_posts')
    .update({ thread_part_count: threadPartCount })
    .eq('id', root.postId)

  return { postId: root.postId, error: null, threadPartCount }
}
