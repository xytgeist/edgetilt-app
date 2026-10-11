# fantasy-yahoo-oauth-start / callback / sync

Yahoo Fantasy Connect (OAuth 2.0).

## Edge secrets (test + prod)

| Secret | Notes |
| --- | --- |
| `YAHOO_FANTASY_CLIENT_ID` | Yahoo Developer app Consumer Key |
| `YAHOO_FANTASY_CLIENT_SECRET` | Consumer Secret |
| `YAHOO_FANTASY_REDIRECT_URI` | Optional. Defaults to `{SUPABASE_URL}/functions/v1/fantasy-yahoo-oauth-callback` |
| `PUBLIC_APP_URL` | Post-auth SPA host (`https://lvslotpro.com` test / `https://edgetilt.com` prod) |

## Yahoo Developer app

1. Create an app at [Yahoo Developer](https://developer.yahoo.com/) with **Fantasy Sports** read access.
2. Application type: **Web Application**.
3. Redirect URI (exact):
   - Test: `https://kcosfvmreeiosdjdzycb.supabase.co/functions/v1/fantasy-yahoo-oauth-callback`
   - Prod: `https://jtjgtucumuoswnbauxry.supabase.co/functions/v1/fantasy-yahoo-oauth-callback`
4. Paste Client ID / Secret into Edge secrets (never into the SPA).

## Flow

1. Client `POST fantasy-yahoo-oauth-start` (user JWT, optional `{ returnMode: 'native'|'web' }`) → `{ url }`
2. EdgeiOS: `ASWebAuthenticationSession` (`startWebAuthSession`). Web: same-tab assign. Old IPA: system Safari.
3. Yahoo redirects to `fantasy-yahoo-oauth-callback?code=&state=`
4. Edge exchanges code, stores tokens in `fantasy_provider_tokens` (service-role only), syncs leagues:
   - `returnMode: native` (`n.*` state) → `edgetilt://yahoo-oauth?tab=fantasy&yahoo=linked`
   - `web` → `/fantasy-yahoo-return.html?tab=fantasy&yahoo=linked`
5. Client Sync → `fantasy-yahoo-sync`
