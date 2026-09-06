# digiverse.ventures

Static holding-company site for **Digiverse Ventures, LLC** (Wyoming). Apple Individual → Org and D&B need a real business website on this domain. Not an Edge product surface.

**Do not invent** a street address or phone. Canonical contact: **`contact@digiverse.ventures`**. Product legal on EdgeTilt stays **`support@edgetilt.com`**.

## Publish (Cloudflare Pages)

Domain is already on Cloudflare. Fastest path:

1. [Cloudflare Dashboard](https://dash.cloudflare.com) → **Workers & Pages** → **Create** → **Pages** → **Upload assets**.
2. Project name: `digiverse-ventures`.
3. Upload this folder (`sites/digiverse-ventures`).
4. **Custom domains** → `digiverse.ventures` (and `www` if you want it).

Or from a machine with Wrangler logged in:

```bash
npx wrangler pages deploy sites/digiverse-ventures --project-name=digiverse-ventures
```

Preview locally:

```bash
npx --yes serve sites/digiverse-ventures
```
