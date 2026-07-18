/**
 * Rewrite X tweet text for editorial queue (OpenAI optional).
 */
import {
  ensureCaptionKeepsUrls,
  extractHttpUrls,
} from './loungeBotXTweetFetch.ts'
import { sanitizeBotProse } from './wireBotProse.ts'

const CAPTION_MAX = 500

export async function rewriteTweetForBot(opts: {
  sourceText: string
  xHandle: string
  /** Full LLM voice instruction (from bot config or persona registry). */
  voicePrompt?: string
}): Promise<string> {
  const raw = String(opts.sourceText || '').trim()
  if (!raw) return ''

  const voice =
    String(opts.voicePrompt || '').trim() || 'concise, informed EdgeTilt Lounge bot; not spammy'
  const sourceUrls = extractHttpUrls(raw)

  const key = Deno.env.get('OPENAI_API_KEY')?.trim()
  if (key) {
    try {
      const linkRule = sourceUrls.length
        ? ` The source includes these exact URL(s) ... keep every one of them in the caption (usually at the end, unchanged): ${sourceUrls.join(' ')}.`
        : ' If the source has http(s) links, keep those exact URLs in the caption (usually at the end). Do not invent links.'

      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: Deno.env.get('OPENAI_CHAT_MODEL') || 'gpt-4o-mini',
          temperature: 0.7,
          max_tokens: 280,
          messages: [
            {
              role: 'system',
              content:
                `You rewrite X posts into Lounge feed captions for an EdgeTilt bot account. ` +
                `Follow this voice instruction exactly:\n${voice}\n\n` +
                `Rules: output a single caption only. Do not copy the tweet verbatim. ` +
                `No em dashes or en dashes ... use " · " or "-" for breaks. Max ${CAPTION_MAX} chars. ` +
                `Do not impersonate the original author; informational tone only. ` +
                `Never start with a salutation or stock opener (Yo, Listen up, Alright, Check this, Hey, So, etc.). ` +
                `Jump straight into the point. Do not reuse the same opening across posts.` +
                linkRule,
            },
            {
              role: 'user',
              content: `@${opts.xHandle}: ${raw}`,
            },
          ],
        }),
      })
      if (res.ok) {
        const json = await res.json()
        const text = String(json?.choices?.[0]?.message?.content || '').trim()
        if (text) return sanitizeBotProse(ensureCaptionKeepsUrls(text, sourceUrls, CAPTION_MAX))
      }
    } catch {
      /* fallback below */
    }
  }

  // Fallback: keep links; trim body around them if needed.
  const withoutUrls = raw
    .replace(/https?:\/\/[^\s<>"']+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const prefix = `@${opts.xHandle.replace(/^@/, '')} pulse: `
  const draft = sourceUrls.length
    ? `${prefix}${withoutUrls}\n${sourceUrls.join('\n')}`
    : `${prefix}${withoutUrls}`
  return sanitizeBotProse(ensureCaptionKeepsUrls(draft, sourceUrls, CAPTION_MAX))
}
