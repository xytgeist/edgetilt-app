/**
 * OpenAI model defaults after GPT-4 series retirement (2027-01-14).
 * Migration target: GPT-6 Luna … https://help.openai.com/en/articles/20001600
 * Start with reasoning effort `none` (closest GPT-4.x latency/cost profile).
 */

export const DEFAULT_OPENAI_VISION_MODEL = 'gpt-6-luna'
export const DEFAULT_OPENAI_CHAT_MODEL = 'gpt-6-luna'

/** Responses API (`/v1/responses`) … merge into request body. */
export function openaiResponsesReasoningNone(): { reasoning: { effort: 'none' } } {
  return { reasoning: { effort: 'none' } }
}

/** Chat Completions (`/v1/chat/completions`) … merge into request body. */
export function openaiChatReasoningNone(): { reasoning_effort: 'none' } {
  return { reasoning_effort: 'none' }
}

export function resolveOpenAiVisionModel(): string {
  return Deno.env.get('OPENAI_VISION_MODEL')?.trim() || DEFAULT_OPENAI_VISION_MODEL
}

export function resolveOpenAiChatModel(): string {
  return Deno.env.get('OPENAI_CHAT_MODEL')?.trim() || DEFAULT_OPENAI_CHAT_MODEL
}
