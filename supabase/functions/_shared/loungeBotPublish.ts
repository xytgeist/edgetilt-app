/**
 * Service-role publish helper for Lounge bots.
 */

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { attachLinkPreviewToEntity } from './linkUnfurl.ts'

export type BotPublishInput = {
  botUserId: string
  caption: string
  categoryPills?: string[]
  sourceUrl?: string | null
}

export type BotPublishResult = {
  postId: string | null
  error: string | null
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
  const caption = String(input.caption || '').trim()
  if (!caption) return { postId: null, error: 'Empty caption.' }
  if (caption.length > 2000) return { postId: null, error: 'Caption exceeds 2000 chars.' }

  const pills = Array.isArray(input.categoryPills)
    ? input.categoryPills.map((p) => String(p || '').trim()).filter(Boolean).slice(0, 3)
    : []

  let finalCaption = caption
  const url = String(input.sourceUrl || '').trim()
  if (url && !finalCaption.includes(url)) {
    const withUrl = `${finalCaption} ${url}`.trim()
    finalCaption = withUrl.length <= 2000 ? withUrl : caption
  }

  const row: Record<string, unknown> = {
    user_id: input.botUserId,
    caption: finalCaption,
    game_title: '',
    game_slug: null,
    category_pills: pills,
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
    await attachLinkPreviewToEntity(admin, 'feed_post', data.id, finalCaption, input.botUserId)
  } catch {
    // Link preview is best-effort for bot posts.
  }

  return { postId: data.id as string, error: null }
}
