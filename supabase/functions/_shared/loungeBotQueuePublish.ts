/**
 * Publish scheduled editorial queue rows + immediate publish helper.
 */

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { publishLoungeBotPost } from './loungeBotPublish.ts'
import { isXTwitterHttpUrl, stripXTwitterUrlsFromText } from './loungeBotXTweetUrl.ts'

type QueueRow = {
  id: string
  bot_user_id: string
  draft_caption: string
  draft_image_urls?: string[] | null
  category_pills: string[] | null
  attach_source_link: boolean
  source_url: string | null
}

function queueImageUrls(row: QueueRow): string[] {
  const raw = row.draft_image_urls
  if (!Array.isArray(raw)) return []
  return raw.map((u) => String(u || '').trim()).filter(Boolean).slice(0, 6)
}

export async function publishQueueRow(
  admin: SupabaseClient,
  row: QueueRow,
  reviewerId: string | null,
): Promise<{ postId: string | null; error: string | null }> {
  const sourceUrl = row.attach_source_link && row.source_url && !isXTwitterHttpUrl(row.source_url)
    ? row.source_url
    : null

  const result = await publishLoungeBotPost(admin, {
    botUserId: row.bot_user_id,
    caption: stripXTwitterUrlsFromText(row.draft_caption),
    categoryPills: row.category_pills || [],
    sourceUrl,
    imageUrls: queueImageUrls(row),
  })

  if (!result.postId) {
    await admin
      .from('lounge_bot_queue')
      .update({ status: 'failed', reviewed_at: new Date().toISOString(), reviewed_by: reviewerId })
      .eq('id', row.id)
    return result
  }

  await admin
    .from('lounge_bot_queue')
    .update({
      status: 'published',
      published_post_id: result.postId,
      reviewed_at: new Date().toISOString(),
      reviewed_by: reviewerId,
    })
    .eq('id', row.id)

  return result
}

export async function publishDueQueueRows(
  admin: SupabaseClient,
  opts: { botUserId?: string; limit?: number } = {},
): Promise<{ published: number; failed: number }> {
  let q = admin
    .from('lounge_bot_queue')
    .select('id, bot_user_id, draft_caption, draft_image_urls, category_pills, attach_source_link, source_url')
    .eq('status', 'scheduled')
    .lte('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(opts.limit ?? 20)

  if (opts.botUserId) q = q.eq('bot_user_id', opts.botUserId)

  const { data: rows, error } = await q
  if (error || !rows?.length) return { published: 0, failed: 0 }

  let published = 0
  let failed = 0
  for (const row of rows as QueueRow[]) {
    const res = await publishQueueRow(admin, row, null)
    if (res.postId) published += 1
    else failed += 1
  }
  return { published, failed }
}
