/**
 * Branded transactional HTML shell (logo header + card layout).
 * Matches Supabase auth templates in docs/supabase-auth-email-templates.md.
 *
 * Logo JPG is served from prod CDN by default (Gmail-safe single header image).
 * Override with TRANSACTIONAL_EMAIL_LOGO_ORIGIN if needed.
 */

const DEFAULT_LOGO_ORIGIN = 'https://edgetilt.com'

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function transactionalEmailLogoUrl(): string {
  const origin =
    Deno.env.get('TRANSACTIONAL_EMAIL_LOGO_ORIGIN')?.trim()?.replace(/\/$/, '') ||
    DEFAULT_LOGO_ORIGIN
  return `${origin}/edge-email-header-dark.jpg`
}

export type TransactionalEmailCta = {
  label: string
  href: string
}

export type WrapTransactionalEmailArgs = {
  /** Document <title> and accessibility */
  title: string
  /** Optional H1 above body */
  headline?: string
  /** Inner body fragments (escape user content before passing) */
  bodyHtml: string
  /** App origin for footer link (may differ from logo host on test) */
  appUrl: string
  cta?: TransactionalEmailCta
  /** Optional note above the standard EdgeTilt footer bar */
  footerNoteHtml?: string
}

/** Styled paragraph for transactional body copy. */
export function transactionalEmailParagraph(html: string, opts?: { marginBottom?: string }): string {
  const mb = opts?.marginBottom ?? '16px'
  return `<p style="margin:0 0 ${mb};font-size:15px;line-height:1.6;color:#52525b;">${html}</p>`
}

/** Fallback link block when a CTA button may not work (matches auth templates). */
export function transactionalEmailFallbackLink(href: string): string {
  const safeHref = escapeHtml(href)
  return [
    `<p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#71717a;">If the button does not work, copy and paste this link into your browser:</p>`,
    `<p style="margin:0 0 24px;font-size:12px;line-height:1.5;word-break:break-all;color:#0891b2;"><a href="${safeHref}" style="color:#0891b2;">${safeHref}</a></p>`,
  ].join('')
}

export function wrapTransactionalEmailHtml(args: WrapTransactionalEmailArgs): string {
  const safeTitle = escapeHtml(args.title)
  const safeAppUrl = escapeHtml(args.appUrl.replace(/\/$/, ''))
  const logoUrl = escapeHtml(transactionalEmailLogoUrl())
  const headline = args.headline ? escapeHtml(args.headline) : ''
  const headlineBlock = headline
    ? `<h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;font-weight:700;color:#18181b;">${headline}</h1>`
    : ''

  let ctaBlock = ''
  if (args.cta) {
    const safeHref = escapeHtml(args.cta.href)
    const safeLabel = escapeHtml(args.cta.label)
    ctaBlock = `
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 24px;">
                <tr>
                  <td style="border-radius:12px;background:linear-gradient(90deg,#0891b2,#06b6d4);">
                    <a href="${safeHref}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:12px;">${safeLabel}</a>
                  </td>
                </tr>
              </table>`
  }

  let footerNoteBlock = ''
  if (args.footerNoteHtml) {
    footerNoteBlock = `<p style="margin:0 0 24px;font-size:13px;line-height:1.6;color:#71717a;">${args.footerNoteHtml}</p>`
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light dark" />
  <meta name="supported-color-schemes" content="light dark" />
  <title>${safeTitle}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f4f5;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e4e4e7;">
          <tr>
            <td align="center" style="padding:0;text-align:center;">
              <img src="${logoUrl}" alt="Edge" width="520" height="72" style="display:block;width:100%;max-width:520px;height:auto;margin:0 auto;border:0;" />
            </td>
          </tr>
          <tr>
            <td style="padding:32px 32px 8px;color:#18181b;">
              ${headlineBlock}
              ${args.bodyHtml}
              ${ctaBlock}
              ${footerNoteBlock}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px 28px;border-top:1px solid #f4f4f5;text-align:center;">
              <p style="margin:0;font-size:12px;line-height:1.5;color:#a1a1aa;">
                EdgeTilt · <a href="${safeAppUrl}" style="color:#71717a;text-decoration:none;">edgetilt.com</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}
