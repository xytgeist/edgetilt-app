# stripe-ensure-edge-pro-price

Ops helper. **Service role** only. Finds or creates the **$9.99/mo** Edge Pro Stripe Price on the account behind **`STRIPE_SECRET_KEY`**, then reports whether **`STRIPE_PRICE_EDGE_PRO`** points at a Price that exists in that account/mode.

```bash
npx supabase functions deploy stripe-ensure-edge-pro-price --project-ref kcosfvmreeiosdjdzycb
node scripts/stripe-ensure-edge-pro-price.mjs
```

If `needsSecretUpdate` is true, set Edge secret **`STRIPE_PRICE_EDGE_PRO`** to the printed `priceId`, then redeploy **`stripe-create-checkout-session`**.
