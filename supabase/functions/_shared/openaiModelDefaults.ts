/**
 * OpenAI model defaults after GPT-4 series retirement (2027-01-14).
 * Migration target: GPT-6 Luna … https://help.openai.com/en/articles/20001600
 * Start with reasoning effort `none` (closest GPT-4.x latency/cost profile).
 *
 * Chat Completions gotcha: gpt-6 / o-series reject legacy `max_tokens`.
 * Always send `max_completion_tokens` (see openaiChatMaxCompletionTokens).
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

/**
 * Chat Completions output cap (visible + reasoning tokens).
 * gpt-6-luna / o-series return 400 if you send deprecated `max_tokens`.
 */
export function openaiChatMaxCompletionTokens(n: number): { max_completion_tokens: number } {
  const capped = Number.isFinite(n) ? Math.floor(n) : 0
  return { max_completion_tokens: Math.max(1, capped) }
}

export function resolveOpenAiVisionModel(): string {
  return Deno.env.get('OPENAI_VISION_MODEL')?.trim() || DEFAULT_OPENAI_VISION_MODEL
}

export function resolveOpenAiChatModel(): string {
  return Deno.env.get('OPENAI_CHAT_MODEL')?.trim() || DEFAULT_OPENAI_CHAT_MODEL
}
