# Supabase auth email templates — EdgeTilt

**Purpose:** Branded copy for Supabase **Authentication → Emails → Templates**. Paste into **production** (`jtjgtucumuoswnbauxry` / `edgetilt.com`) and **test** (`kcosfvmreeiosdjdzycb` / `lvslotpro.com`) when you want sandbox parity.

**SMTP (prod):** sender **`EdgeTilt`** `<noreply@auth.edgetilt.com>` via Resend. Templates below do not change SMTP ... only subject + body.

**URLs:** Bodies use **`{{ .ConfirmationURL }}`**. Supabase builds that from **Authentication → URL Configuration** (`Site URL` + redirect allow list). Prod: **`https://edgetilt.com`**.

**Variables (Go template):** `{{ .ConfirmationURL }}`, `{{ .Email }}`, `{{ .SiteURL }}`, `{{ .Token }}`, `{{ .TokenHash }}`. Prefer **`{{ .ConfirmationURL }}`** for all action links.

**Logo in email:** use **one** full-width header JPG ... **no** dual `<img>`, **no** `@media` CSS (Gmail strips it and shows both logos).

| Asset | URL | Use |
| --- | --- | --- |
| **`edge-email-header-dark.jpg`** | `https://edgetilt.com/edge-email-header-dark.jpg` | **Default for prod** after deploy — gray band matches Gmail dark card, white EDGE baked in |
| **`edge-email-header-light.jpg`** | `https://edgetilt.com/edge-email-header-light.jpg` | Optional: swap manually if you ever want light-mode-only header |

Build: `node scripts/build-edge-email-logo.mjs`

**Until deploy:** temporary single logo (Gmail dark only):

```html
<img src="https://edgetilt.com/edge-lounge-logo-transparent.png" alt="Edge" width="186" height="46" style="display:block;margin:0 auto;border:0;" />
```

---

## Apply (dashboard)

1. Supabase project → **Authentication** → **Emails** → **Templates**
2. For each row below: set **Subject**, paste **Body (HTML)**, **Save**
3. Send a real signup or password reset to smoke (check spam)

Templates you need for the app today:

| Template | Used by app? |
| --- | --- |
| **Confirm signup** | Yes — `signUp` in **`App.jsx`** |
| **Reset password** | Yes — forgot password + Settings change password |
| **Magic Link** | Optional (not primary login today) |
| **Invite user** | Optional (admin invites only) |
| **Change email address** | Yes if users change email in Supabase/auth flows |

---

## Shared HTML wrapper

Each template below is a full HTML document. CTA color matches app cyan (`#06b6d4` / `#0891b2`).

**Header** (one `<img>`, full width — same in every template):

```html
            <td align="center" style="padding:0;text-align:center;">
              <img src="https://edgetilt.com/edge-email-header-dark.jpg" alt="Edge" width="520" height="72" style="display:block;width:100%;max-width:520px;height:auto;margin:0 auto;border:0;" />
            </td>
```

Remove any `<style>` blocks used only for logo swapping. Optional: keep `<meta name="color-scheme" content="light dark" />` in `<head>`.

---

## 1 — Confirm signup

**Subject**

```text
Confirm your EdgeTilt account
```

**Body (HTML)**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light dark" />
  <meta name="supported-color-schemes" content="light dark" />
  <title>Confirm your EdgeTilt account</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f4f5;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e4e4e7;">
          <tr>
            <td align="center" style="padding:0;text-align:center;">
              <img src="https://edgetilt.com/edge-email-header-dark.jpg" alt="Edge" width="520" height="72" style="display:block;width:100%;max-width:520px;height:auto;margin:0 auto;border:0;" />
            </td>
          </tr>
          <tr>
            <td style="padding:32px 32px 8px;color:#18181b;">
              <h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;font-weight:700;">Confirm your email</h1>
              <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#52525b;">
                Welcome to EdgeTilt ... the membership platform for edge hunters across AP slots, sports, crypto, investing, and more.
              </p>
              <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#52525b;">
                Tap the button below to confirm <strong style="color:#18181b;">{{ .Email }}</strong> and finish creating your account.
              </p>
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 24px;">
                <tr>
                  <td style="border-radius:12px;background:linear-gradient(90deg,#0891b2,#06b6d4);">
                    <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:12px;">Confirm email</a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#71717a;">
                If the button does not work, copy and paste this link into your browser:
              </p>
              <p style="margin:0 0 24px;font-size:12px;line-height:1.5;word-break:break-all;color:#0891b2;">
                <a href="{{ .ConfirmationURL }}" style="color:#0891b2;">{{ .ConfirmationURL }}</a>
              </p>
              <p style="margin:0;font-size:13px;line-height:1.6;color:#a1a1aa;">
                If you did not create an EdgeTilt account, you can ignore this email.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px 28px;border-top:1px solid #f4f4f5;text-align:center;">
              <p style="margin:0;font-size:12px;line-height:1.5;color:#a1a1aa;">
                EdgeTilt · <a href="https://edgetilt.com" style="color:#71717a;text-decoration:none;">edgetilt.com</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
```

---

## 2 — Reset password

**Subject**

```text
Reset your EdgeTilt password
```

**Body (HTML)**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light dark" />
  <meta name="supported-color-schemes" content="light dark" />
  <title>Reset your EdgeTilt password</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f4f5;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e4e4e7;">
          <tr>
            <td align="center" style="padding:0;text-align:center;">
              <img src="https://edgetilt.com/edge-email-header-dark.jpg" alt="Edge" width="520" height="72" style="display:block;width:100%;max-width:520px;height:auto;margin:0 auto;border:0;" />
            </td>
          </tr>
          <tr>
            <td style="padding:32px 32px 8px;color:#18181b;">
              <h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;font-weight:700;">Reset your password</h1>
              <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#52525b;">
                We received a request to reset the password for <strong style="color:#18181b;">{{ .Email }}</strong>.
              </p>
              <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#52525b;">
                Tap the button below to choose a new password. This link expires soon for your security.
              </p>
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 24px;">
                <tr>
                  <td style="border-radius:12px;background:linear-gradient(90deg,#0891b2,#06b6d4);">
                    <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:12px;">Reset password</a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#71717a;">
                If the button does not work, copy and paste this link into your browser:
              </p>
              <p style="margin:0 0 24px;font-size:12px;line-height:1.5;word-break:break-all;color:#0891b2;">
                <a href="{{ .ConfirmationURL }}" style="color:#0891b2;">{{ .ConfirmationURL }}</a>
              </p>
              <p style="margin:0;font-size:13px;line-height:1.6;color:#a1a1aa;">
                If you did not request a password reset, you can ignore this email. Your password will not change.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px 28px;border-top:1px solid #f4f4f5;text-align:center;">
              <p style="margin:0;font-size:12px;line-height:1.5;color:#a1a1aa;">
                EdgeTilt · <a href="https://edgetilt.com" style="color:#71717a;text-decoration:none;">edgetilt.com</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
```

**Note:** App redirect target is **`/reset-password`** (`App.jsx`, Settings). Supabase includes that in **`{{ .ConfirmationURL }}`** when **`redirectTo`** / allow list is configured.

---

## 3 — Magic link (optional)

**Subject**

```text
Your EdgeTilt sign-in link
```

**Body (HTML)**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light dark" />
  <meta name="supported-color-schemes" content="light dark" />
  <title>Your EdgeTilt sign-in link</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f4f5;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e4e4e7;">
          <tr>
            <td align="center" style="padding:0;text-align:center;">
              <img src="https://edgetilt.com/edge-email-header-dark.jpg" alt="Edge" width="520" height="72" style="display:block;width:100%;max-width:520px;height:auto;margin:0 auto;border:0;" />
            </td>
          </tr>
          <tr>
            <td style="padding:32px 32px 8px;color:#18181b;">
              <h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;font-weight:700;">Sign in to EdgeTilt</h1>
              <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#52525b;">
                Tap the button below to sign in as <strong style="color:#18181b;">{{ .Email }}</strong>. This link expires soon.
              </p>
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 24px;">
                <tr>
                  <td style="border-radius:12px;background:linear-gradient(90deg,#0891b2,#06b6d4);">
                    <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:12px;">Sign in</a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#71717a;">
                If the button does not work, copy and paste this link into your browser:
              </p>
              <p style="margin:0 0 24px;font-size:12px;line-height:1.5;word-break:break-all;color:#0891b2;">
                <a href="{{ .ConfirmationURL }}" style="color:#0891b2;">{{ .ConfirmationURL }}</a>
              </p>
              <p style="margin:0;font-size:13px;line-height:1.6;color:#a1a1aa;">
                If you did not request this link, you can ignore this email.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px 28px;border-top:1px solid #f4f4f5;text-align:center;">
              <p style="margin:0;font-size:12px;line-height:1.5;color:#a1a1aa;">
                EdgeTilt · <a href="https://edgetilt.com" style="color:#71717a;text-decoration:none;">edgetilt.com</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
```

---

## 4 — Change email address

**Subject**

```text
Confirm your new EdgeTilt email
```

**Body (HTML)**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light dark" />
  <meta name="supported-color-schemes" content="light dark" />
  <title>Confirm your new EdgeTilt email</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f4f5;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e4e4e7;">
          <tr>
            <td align="center" style="padding:0;text-align:center;">
              <img src="https://edgetilt.com/edge-email-header-dark.jpg" alt="Edge" width="520" height="72" style="display:block;width:100%;max-width:520px;height:auto;margin:0 auto;border:0;" />
            </td>
          </tr>
          <tr>
            <td style="padding:32px 32px 8px;color:#18181b;">
              <h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;font-weight:700;">Confirm your new email</h1>
              <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#52525b;">
                Tap the button below to confirm this email address for your EdgeTilt account.
              </p>
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 24px;">
                <tr>
                  <td style="border-radius:12px;background:linear-gradient(90deg,#0891b2,#06b6d4);">
                    <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:12px;">Confirm new email</a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#71717a;">
                If the button does not work, copy and paste this link into your browser:
              </p>
              <p style="margin:0 0 24px;font-size:12px;line-height:1.5;word-break:break-all;color:#0891b2;">
                <a href="{{ .ConfirmationURL }}" style="color:#0891b2;">{{ .ConfirmationURL }}</a>
              </p>
              <p style="margin:0;font-size:13px;line-height:1.6;color:#a1a1aa;">
                If you did not request this change, contact support and do not use the link.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px 28px;border-top:1px solid #f4f4f5;text-align:center;">
              <p style="margin:0;font-size:12px;line-height:1.5;color:#a1a1aa;">
                EdgeTilt · <a href="https://edgetilt.com" style="color:#71717a;text-decoration:none;">edgetilt.com</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
```

---

## 5 — Invite user (optional)

**Subject**

```text
You're invited to EdgeTilt
```

**Body (HTML)**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light dark" />
  <meta name="supported-color-schemes" content="light dark" />
  <title>You're invited to EdgeTilt</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f4f5;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e4e4e7;">
          <tr>
            <td align="center" style="padding:0;text-align:center;">
              <img src="https://edgetilt.com/edge-email-header-dark.jpg" alt="Edge" width="520" height="72" style="display:block;width:100%;max-width:520px;height:auto;margin:0 auto;border:0;" />
            </td>
          </tr>
          <tr>
            <td style="padding:32px 32px 8px;color:#18181b;">
              <h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;font-weight:700;">You're invited</h1>
              <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#52525b;">
                You've been invited to join EdgeTilt ... guides, tools, and community for edge hunters across slots, sports, crypto, and more.
              </p>
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 24px;">
                <tr>
                  <td style="border-radius:12px;background:linear-gradient(90deg,#0891b2,#06b6d4);">
                    <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:12px;">Accept invite</a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#71717a;">
                If the button does not work, copy and paste this link into your browser:
              </p>
              <p style="margin:0 0 24px;font-size:12px;line-height:1.5;word-break:break-all;color:#0891b2;">
                <a href="{{ .ConfirmationURL }}" style="color:#0891b2;">{{ .ConfirmationURL }}</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px 28px;border-top:1px solid #f4f4f5;text-align:center;">
              <p style="margin:0;font-size:12px;line-height:1.5;color:#a1a1aa;">
                EdgeTilt · <a href="https://edgetilt.com" style="color:#71717a;text-decoration:none;">edgetilt.com</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
```

---

## Smoke (prod)

- [ ] **Confirm signup** ... new email signup on `edgetilt.com`; link lands on site and confirms
- [ ] **Reset password** ... forgot password or Settings → change password; link opens **`/reset-password`**
- [ ] Inbox shows **EdgeTilt** sender, **EDGE** logo image (opaque JPG/PNG), and branded body

---

## Update log

- **2026-07-02:** Initial EdgeTilt-branded templates (confirm, reset, magic link, change email, invite). Source of truth for dashboard paste.
- **2026-07-02:** Email header: single opaque **`edge-email-header-dark.jpg`** (no CSS logo swap; Gmail strips `<style>`). Build: **`node scripts/build-edge-email-logo.mjs`**.
