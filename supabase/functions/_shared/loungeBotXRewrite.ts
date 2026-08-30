/**
 * Rewrite X tweet text for editorial queue (OpenAI optional).
 */
import {
  ensureCaptionKeepsUrls,
  extractHttpUrls,
} from './loungeBotXTweetFetch.ts'
import { isXTwitterHttpUrl, stripXTwitterUrlsFromText } from './loungeBotXTweetUrl.ts'
import { LOUNGE_BOT_CAPTION_MAX } from './loungeBotCaptionLimits.ts'
import { sanitizeBotProse } from './wireBotProse.ts'

export function getUsMarketSessionContext(d = new Date()): { sessionName: string; timeContext: string } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const map: Record<string, string> = {}
  for (const p of fmt.formatToParts(d)) {
    if (p.type !== 'literal') map[p.type] = p.value
  }
  const wd = String(map.weekday || '')
  const hour = Number(map.hour || 0)
  const minute = Number(map.minute || 0)
  const totalMins = hour * 60 + minute

  if (wd === 'Sat') {
    return { sessionName: 'Weekend (Markets Closed)', timeContext: 'Saturday quiet tape, US cash markets closed.' }
  }
  if (wd === 'Sun') {
    if (totalMins >= 18 * 60) {
      return { sessionName: 'Sunday Night Globex / Futures Open', timeContext: 'Sunday evening, US index futures (Globex) opened for the trading week.' }
    }
    return { sessionName: 'Weekend (Markets Closed)', timeContext: 'Sunday, US markets closed ahead of evening futures open.' }
  }

  // Weekdays (Mon-Fri)
  if (totalMins >= 4 * 60 && totalMins < 9 * 60 + 30) {
    return { sessionName: 'Pre-Market Session', timeContext: 'Pre-market trading in New York ahead of the 9:30 AM ET opening bell.' }
  }
  if (totalMins >= 9 * 60 + 30 && totalMins < 11 * 60) {
    return { sessionName: 'Opening Drive (RTH Open)', timeContext: 'Regular trading hours open, active morning liquidity and initial balance.' }
  }
  if (totalMins >= 11 * 60 && totalMins < 14 * 60) {
    return { sessionName: 'Midday Session', timeContext: 'Midday trading session, lower volume chop / lunch lull.' }
  }
  if (totalMins >= 14 * 60 && totalMins < 15 * 60) {
    return { sessionName: 'Afternoon Session', timeContext: 'Afternoon trading, positioning ahead of final hour.' }
  }
  if (totalMins >= 15 * 60 && totalMins < 16 * 60) {
    return { sessionName: 'Power Hour / Cash Close', timeContext: 'Final hour of trading (Power Hour) into the 4:00 PM ET closing bell.' }
  }
  if (totalMins >= 16 * 60 && totalMins < 20 * 60) {
    return { sessionName: 'After-Hours / Earnings Session', timeContext: 'Post-market / after-hours session, earnings reports crossing the tape.' }
  }

  return { sessionName: 'Overnight Session', timeContext: 'Overnight session, US cash markets closed.' }
}

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
  const outboundUrls = extractHttpUrls(raw).filter((url) => !isXTwitterHttpUrl(url))
  const session = getUsMarketSessionContext()

  const key = Deno.env.get('OPENAI_API_KEY')?.trim()
  if (key) {
    try {
      const linkRule = outboundUrls.length
        ? ` Non-X outbound links from the source may be kept when essential: ${outboundUrls.join(' ')}. Never add x.com, twitter.com, or t.co links.`
        : ' Do not include x.com, twitter.com, or t.co links in the caption. Do not invent links.'

      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: Deno.env.get('OPENAI_CHAT_MODEL') || 'gpt-4o-mini',
          temperature: 0.75,
          max_tokens: 900,
          messages: [
            {
              role: 'system',
              content:
                `You rewrite X posts into Lounge feed captions for an EdgeTilt bot account. ` +
                `Current Market Session Context: ${session.sessionName} (${session.timeContext}).\n\n` +
                `Follow this voice instruction exactly:\n${voice}\n\n` +
                `Rules: output a single caption only. Do not copy the tweet verbatim. ` +
                `No em dashes, en dashes, or middle dots (·) ... use commas, ellipses (...), or "-" for breaks. Max ${LOUNGE_BOT_CAPTION_MAX} chars. ` +
                `Do not impersonate the original author; speak from the perspective of this bot's persona with authentic skin in the game. ` +
                `Never use exclamation points (!) unless the voice explicitly demands high hype. Avoid corny punchlines, forced jokes, or repetitive phrasing. ` +
                `Do NOT follow a rigid paragraph template. Vary post length naturally: sometimes a single sharp 1-liner observation, sometimes a concise level call, sometimes a multi-point thesis. ` +
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
        if (text) {
          return stripXTwitterUrlsFromText(
            sanitizeBotProse(ensureCaptionKeepsUrls(text, outboundUrls, LOUNGE_BOT_CAPTION_MAX)),
          )
        }
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
  const draft = outboundUrls.length
    ? `${prefix}${withoutUrls}\n${outboundUrls.join('\n')}`
    : `${prefix}${withoutUrls}`
  return stripXTwitterUrlsFromText(
    sanitizeBotProse(ensureCaptionKeepsUrls(draft, outboundUrls, LOUNGE_BOT_CAPTION_MAX)),
  )
}
