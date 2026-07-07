/**
 * X-tracker bot LLM voice prompts (`lounge_bot_accounts.config.voice_prompt` only).
 */

export function resolveXBotVoicePrompt(opts: {
  config?: Record<string, unknown> | null
  displayName?: string
}): string {
  const explicit = String(opts.config?.voice_prompt || '').trim()
  if (explicit) return explicit

  const fallback = String(opts.config?.voice_style || opts.displayName || '').trim()
  return fallback || 'concise, informed, not spammy'
}
