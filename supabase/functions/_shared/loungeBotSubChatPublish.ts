/**
 * Scott Share alerts → creator fan sub chat room.
 *
 * Chat never renders Lounge markdown. All bodies go through toPlainOutboundText.
 */

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { toPlainOutboundText } from './loungeBotPlainOutbound.ts'

export type BotSubChatPublishInput = {
  botUserId: string
  caption: string
  threadParts?: string[]
  imageUrls?: string[]
}

export type BotSubChatPublishResult = {
  messageId: string | null
  error: string | null
  threadMessageCount?: number
}

function normalizeBotImageUrls(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  for (const item of raw) {
    const url = String(item || '').trim()
    if (!url || out.includes(url)) continue
    out.push(url)
    if (out.length >= 12) break
  }
  return out
}

export async function getBotFanRoomId(
  admin: SupabaseClient,
  botUserId: string,
): Promise<string | null> {
  const { data, error } = await admin
    .from('creator_monetization_profiles')
    .select('fan_room_id')
    .eq('user_id', botUserId)
    .maybeSingle()

  if (error || !data?.fan_room_id) return null
  return String(data.fan_room_id)
}

async function insertChatMessage(
  admin: SupabaseClient,
  roomId: string,
  senderId: string,
  body: string,
  imageUrls: string[],
): Promise<{ messageId: string | null; error: string | null }> {
  const text = toPlainOutboundText(body).slice(0, 8000)
  if (!text && !imageUrls.length) {
    return { messageId: null, error: 'Empty message.' }
  }

  const { data, error } = await admin
    .from('chat_messages')
    .insert({
      room_id: roomId,
      sender_id: senderId,
      body: text,
      image_urls: imageUrls,
    })
    .select('id')
    .single()

  if (error || !data?.id) {
    return { messageId: null, error: error?.message || 'Chat insert failed.' }
  }

  return { messageId: data.id as string, error: null }
}

/** Post as the bot into its creator fan room (service role). */
export async function publishBotSubChatMessage(
  admin: SupabaseClient,
  input: BotSubChatPublishInput,
): Promise<BotSubChatPublishResult> {
  const roomId = await getBotFanRoomId(admin, input.botUserId)
  if (!roomId) {
    return {
      messageId: null,
      error: 'No fan sub chat room for this bot. Enable creator fan subs and ensure fan_room_id is set.',
    }
  }

  const imageUrls = normalizeBotImageUrls(input.imageUrls)
  const caption = String(input.caption || '').trim()
  const parts = (input.threadParts || [])
    .map((part) => String(part || '').trim())
    .filter(Boolean)

  const root = await insertChatMessage(admin, roomId, input.botUserId, caption, imageUrls)
  if (!root.messageId) {
    return { messageId: null, error: root.error || 'Chat insert failed.' }
  }

  let threadMessageCount = 1
  for (const part of parts) {
    const followUp = await insertChatMessage(admin, roomId, input.botUserId, part, [])
    if (followUp.messageId) threadMessageCount += 1
  }

  return { messageId: root.messageId, error: null, threadMessageCount }
}
