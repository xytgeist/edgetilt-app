# Security & anti-scrape roadmap

Hardens AP guide content against PostgREST bulk exfiltration and adds Edge Monitor visibility for scrape-like patterns.

---

## Problem

Before **`20260731160000_guide_content_protection.sql`**, any client with the public anon key could:

```http
GET /rest/v1/guides?select=id,content_markdown&published=eq.true
```

The Guides paywall was **client-only** (`guideAccess.js` / `canOpenGuide()`). Scrapers bypassed it entirely.

---

## Phase 1 (shipped in repo)

| Piece | Purpose |
| --- | --- |
| **`guides.skins_search_text`** | Skins-only search haystack without fetching markdown |
| **`REVOKE SELECT (content_markdown)`** on `guides` for `anon` / `authenticated` | Blocks direct PostgREST exfiltration |
| **`user_can_open_guide()`** | SQL mirror of `canOpenGuide()` |
| **`get_guide_content(p_slug)`** | SECURITY DEFINER fetch + audit + rate limit |
| **`admin_get_guide_for_edit()`** | Admin slot-guide-form load |
| **`guide_read_events`** | Granted/denied audit rows |
| **Client** `guideContentApi.js` | Guides expand + admin form use RPCs |

**Keep in sync when entitlements change:**

- `src/features/guides/guideAccess.js` (`FREE_GUIDE_SLUGS`, starter pack years, Pro-only slugs)
- `public.starter_weekly_drop_free_guide_slugs()` in SQL
- `public.user_can_open_guide()` in **`20260731160000`** (or follow-up migration)

---

## Phase 2 (shipped in repo)

| Piece | Purpose |
| --- | --- |
| **`admin_ops_security_snapshot()`** | Admin RPC: 24h guide read aggregates, heavy readers, denied slug tops |
| **`EdgeMonitorSecurityPanel`** | **Security** tab in Edge Monitor |
| **Alert thresholds** | `guide_denied_reads_24h`, `guide_heavy_anon_1h` in `opsMonitorAlerts.js` |

---

## Phase 3 (partial)

| Piece | Status |
| --- | --- |
| **`casino-places-search` JWT gate** | Requires signed-in user before Google Places proxy |

---

## Rollout order

1. Apply **`20260731160000`** then **`20260731170000`** on **test** (`kcosfvmreeiosdjdzycb`)
2. Deploy client (Vercel preview / test)
3. Smoke (see backlog)
4. Redeploy **`casino-places-search`** Edge fn on test
5. Promote SQL + client + Edge fn to **production** per **`docs/production-rollout-checklist.md`**

**Important:** Client deploy **after** SQL on each environment. Old client + new SQL breaks guide expand until RPC client ships.

---

## UX / product impacts (discuss before prod)

1. **Skin search** ... depends on `skins_search_text` backfill quality (trigger keeps it fresh on ingest).
2. **Entitlement parity** ... SQL must match `guideAccess.js` or users see unlock in UI but 403 on expand.
3. **Rate limits** ... ~120 granted reads/hour per authenticated user; ~300/hour shared anon bucket (NAT risk at busy venues).
4. **Admin form** ... extra RPC round-trip on edit load (admin-only).
5. **Casino online search** ... logged-out users cannot use Google Places fallback in Calendar autocomplete (local DB search still works).
6. **Scrapers with valid subs** ... entitlement RPC still grants content; Monitor **heavy_readers** surfaces abuse.

---

## Verification

**PostgREST blocked:**

```bash
curl "$SUPABASE_URL/rest/v1/guides?select=content_markdown&limit=1" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY"
# Expect column permission error (not markdown body)
```

**RPC works (free slug example):**

```bash
curl "$SUPABASE_URL/rest/v1/rpc/get_guide_content" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"p_slug":"buffalo-link"}'
```

**Monitor:** Edge Monitor → **Security** tab → **Security · guide reads** panel populated after migration **`20260731170000`**.

---

## Related files

| Area | Path |
| --- | --- |
| Client entitlements | `src/features/guides/guideAccess.js` |
| Content fetch | `src/features/guides/guideContentApi.js` |
| Guides UI | `src/features/guides/GuidesScreen.jsx` |
| Admin form | `src/slot-guide-form/SlotGuideFormApp.jsx` |
| Monitor panel | `src/features/ops/EdgeMonitorSecurityPanel.jsx` |
| SQL | `supabase/migrations/20260731160000_guide_content_protection.sql` |
| SQL monitor | `supabase/migrations/20260731170000_admin_ops_security_snapshot.sql` |
