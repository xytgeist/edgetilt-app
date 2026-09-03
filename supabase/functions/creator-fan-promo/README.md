# creator-fan-promo

Creator self-serve fan-sub promo codes (Stripe Coupon + Promotion Code).

**Auth:** user JWT. Creator must have Connect complete.

| Action | Body | Notes |
| --- | --- | --- |
| `list` | `{ "action": "list" }` | Own codes |
| `create` | `{ "action": "create", "code", "discount_type": "percent"\|"amount", "percent_off"? , "amount_off_cents"?, "duration": "once"\|"forever"\|"repeating", "duration_in_months"?, "max_redemptions"?, "expires_at"? }` | Max 20 active |
| `deactivate` | `{ "action": "deactivate", "id": "uuid" }` | Disables Stripe promotion code |

**Fee policy:** creator eats the discount. Checkout uses `application_fee_percent` on the final paid amount.
