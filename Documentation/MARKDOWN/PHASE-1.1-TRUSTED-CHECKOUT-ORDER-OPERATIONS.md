# CARENDERIA-APP — Phase 1.1

## Trusted Checkout & Order Operations

## 1. Purpose

Phase 1.1 establishes the trusted transaction boundary for online guest checkout and the core admin order operations. Browser input describes customer intent; PostgreSQL remains authoritative for menu validity, availability, prices, Internal DF, delivery calculations, totals, rider amounts, order codes, guest-token hashes, and original snapshots.

This phase intentionally does not add customer/admin order UI, messaging, payment-evidence uploads, inventory counts, a payment gateway, or a restaurant status workflow.

## 2. Phase 1.0 Validation Status

Phase 1.0 is runtime validated on the development laptop. A clean local `supabase db reset` successfully reapplied:

1. `20261002000000_phase_1_0_core_foundation.sql`
2. `20261003000000_phase_1_1_trusted_checkout_order_operations.sql`

`supabase db lint --level warning` completed with no schema errors or warnings. The missing optional `supabase/seed.sql` remains informational; no seed file is required.

No Phase 1.0 correction was required. The only implementation defects found during Phase 1.1 validation were in the new Phase 1.1 function code and were corrected before the final clean reset.

## 3. Files Created or Changed

Created:

- `supabase/migrations/20261003000000_phase_1_1_trusted_checkout_order_operations.sql`
- `supabase/functions/checkout/index.ts`
- `supabase/tests/database/phase_1_1_order_operations.sql`
- `Documentation/MARKDOWN/PHASE-1.1-TRUSTED-CHECKOUT-ORDER-OPERATIONS.md`

Updated:

- `supabase/config.toml`

The living product specification did not require clarification. Phase 1.1 implements its confirmed rules without redesigning them.

## 4. Trusted Checkout Architecture

```text
Guest browser
    → checkout Edge Function
        → service-role-only create_online_order RPC
            → authoritative validation/calculation/inserts in one transaction
```

The Edge Function is the public HTTP boundary. It validates JSON shape and size, creates guest authorization material, hashes the guest token, and invokes the database RPC with the service role available only in the Edge runtime.

The browser never receives the service-role key and cannot execute the privileged checkout RPC directly. The RPC is `SECURITY INVOKER`, has an empty `search_path`, and is executable only by `service_role`. Anonymous and ordinary authenticated roles have no execute privilege.

The PostgreSQL function performs final checks after locking the menu and requested menu-item rows. Validation, calculations, order insertion, order-item insertion, and snapshot creation share one database transaction. Any exception rolls back the complete operation.

## 5. Checkout Request Contract

The public Edge Function accepts:

```json
{
  "publishedMenuId": "uuid",
  "items": [
    {
      "publishedMenuItemId": "uuid",
      "quantity": 2,
      "expectedUnitPriceCentavos": 8000
    }
  ],
  "customerName": "Juan Dela Cruz",
  "exactAddress": "Full delivery address",
  "locationClassification": "NEARBY",
  "selectedAreaName": "Marycris Complex",
  "paymentMethod": "CASH"
}
```

`expectedUnitPriceCentavos` is a comparison value representing the price last reviewed by the customer. It is never used to calculate or insert the order. The database compares it with the current published price and returns `PRICE_CHANGED` if different.

The client does not submit authoritative unit prices, Internal DF, item subtotals, delivery charges, grand totals, rider amounts, order codes, token hashes, or snapshots.

The HTTP boundary limits requests to 16 KiB and 50 distinct cart lines. Quantities must be positive PostgreSQL integers; the business has no smaller arbitrary quantity cap in this phase.

## 6. Authoritative Validation Rules

Inside the creation transaction, checkout:

- Locks and verifies the requested published menu.
- Requires the menu to be current, activated, unexpired, and not manually deactivated.
- Rejects missing, duplicate, malformed, or non-positive cart lines.
- Requires every requested item to belong to that menu.
- Locks requested published items and rejects `SOLD OUT` items.
- Compares expected prices with current published prices.
- Reads name, category, price, Internal DF, catalog reference, and display order from published-menu snapshots.
- Reads delivery threshold, base charge, far-area rate, and nearby-area names from the settings singleton.
- Canonicalizes nearby-area names from settings and rejects unrecognized nearby values.
- Accepts only `CASH` or `ONLINE_PAYMENT`.

No inventory quantity lock exists because V1 has no stock-count model.

## 7. Price-Change Decision

Phase 1.1 uses a one-step create-with-comparison pattern:

1. The browser sends its last-reviewed unit price for each line.
2. The database reads the authoritative current price.
3. Any mismatch returns `PRICE_CHANGED` with safe current line details.
4. No order is created.
5. The customer UI can update the cart, require review, and retry with the newly reviewed prices.

This is simpler than introducing quote tokens while still preventing silent creation at an unexpected amount. Every retry revalidates menu state, availability, prices, and settings inside the final transaction.

## 8. Delivery and Rider Calculation

All money is integer centavos.

```text
Internal DF Total = SUM(authoritative item Internal DF × quantity)

Base Delivery Charge =
  0 when Internal DF Total >= current threshold
  otherwise current fixed base charge

Far-Area Charge =
  0 for a configured nearby area
  otherwise current far-area rate

Customer Delivery Charge = Base Delivery Charge + Far-Area Charge
Grand Total = Food Subtotal + Customer Delivery Charge
Calculated Rider Amount = Internal DF Total + Customer Delivery Charge
```

The default settings remain 2000 threshold, 1500 base charge, and 2000 far-area charge. An Internal DF total of 1800 still produces the full 1500 base charge.

The order copies the actual settings inputs and results used. Later settings changes do not rewrite the original transaction.

## 9. Order Code Generation

The database generates `CRD-` plus ten characters from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` using cryptographically secure random bytes. The alphabet removes commonly confused characters and provides 50 bits of random code space.

The `orders.order_code` unique constraint remains the final concurrency authority. Creation retries a collision up to ten times. The readable code is stable and useful for support, but it is never guest authorization.

## 10. Guest Authorization Strategy

The Edge Function creates 32 cryptographically random bytes (256 bits) and encodes them as unpadded base64url. The plaintext token is returned once after successful checkout.

The Edge Function hashes the encoded token with SHA-256 and sends only the lowercase 64-character hexadecimal digest to PostgreSQL. The database stores that digest under a unique index and a new format constraint. Neither the plaintext token nor its hash appears in the original snapshot or safe checkout result.

Future guest-authorized operations must hash the presented token and compare it with the stored digest while also checking the order association and expiry. The fixed expiry is exactly `created_at + interval '24 hours'`; later activity will not extend it. V1 has no automated recovery.

## 11. Original Snapshot Construction

The database constructs snapshot version 1 exclusively from authoritative values. It contains:

- Order code, source, and creation timestamp
- Customer name, address, location class, and canonical selected area
- Payment method and initial verification state
- Published-menu reference for online orders
- Item source references, names, categories, quantities, prices, Internal DF, contributions, and sort positions
- Food, Internal DF, base/far/final delivery, grand, and calculated rider totals
- Delivery threshold, base rate, far-area rate, and nearby-area configuration used

The existing Phase 1.0 trigger continues to reject changes to `original_snapshot`. Admin edits change only the relational current state.

## 12. Online Payment Initialization

- `CASH`: `payment_verification_state = null`, `verified_at = null`
- `ONLINE_PAYMENT`: `payment_verification_state = NOT_VERIFIED`, `verified_at = null`

No gateway integration or automatic verification is present.

## 13. Admin Order Operations

Admin operations are `SECURITY DEFINER` functions with an empty `search_path`. Each calls the private active-admin authorization check based on `auth.uid()` and an active `admin_profiles` row. Anonymous callers have no execute permission.

Implemented operations:

- `admin_create_manual_order`: creates a manual order from admin-entered item inputs, applies trusted delivery arithmetic, and creates an immutable original snapshot.
- `admin_edit_order`: replaces current item lines and edits customer/payment/delivery inputs, then recalculates all dependent totals. It never changes the original snapshot.
- `admin_cancel_order`: records current cancellation state, time, and optional reason.
- `admin_restore_order`: returns a cancelled order to active bookkeeping and records restoration time.
- `admin_set_payment_verification`: verifies or reverses an `ONLINE_PAYMENT`; reversal clears `verified_at`.
- `admin_get_daily_totals`: returns Manila-business-date active/cancelled counts and active sales, delivery, and rider totals.
- `admin_reconcile_rider_day`: refreshes the active calculated rider total, stores a signed daily adjustment, and returns the final rider amount.

Admin arithmetic is not trusted from the browser. Admins may change underlying values, but derived item, order, delivery, grand, and rider values are calculated in PostgreSQL.

## 14. Manual Orders

Manual orders remain admin-only and use the common order tables. They have no published-menu reference, guest token/hash, guest expiry, or implicit conversation. Admin-entered item names, categories, unit prices, quantities, and Internal DF are treated as authorized source inputs. Derived amounts and the original snapshot remain database-controlled.

Manual `ONLINE_PAYMENT` orders use the same initial verification and admin verification/reversal rules. The evidence-upload path remains deferred to Phase 1.2.

## 15. Daily Totals

Daily operations use stored `business_date`, generated from `created_at` in `Asia/Manila`. Cancelled orders remain queryable but are excluded from active counts, sales, customer delivery charges, and calculated rider totals. Restored orders participate again using current values.

The reconciliation function implements:

```text
Daily Final Rider Amount =
  SUM(active order calculated rider amounts)
  + signed manual daily adjustment
```

No generic analytics system or per-order rider adjustment was added.

## 16. Safe Error Contract

Expected public errors are mapped to stable codes:

| Code                               | HTTP status | Meaning                                                          |
| ---------------------------------- | ----------: | ---------------------------------------------------------------- |
| `MENU_INACTIVE`                    |         409 | Menu is missing, not current/activated, or manually deactivated. |
| `MENU_EXPIRED`                     |         409 | Menu expiry has passed.                                          |
| `ITEM_NOT_FOUND`                   |         409 | A line is not in the requested menu.                             |
| `ITEM_SOLD_OUT`                    |         409 | One or more named items are unavailable.                         |
| `PRICE_CHANGED`                    |         409 | Current authoritative price differs from the reviewed price.     |
| `INVALID_QUANTITY`                 |         400 | Quantity is missing, invalid, or non-positive.                   |
| `INVALID_LOCATION`                 |         400 | Location class/nearby area is invalid.                           |
| `INVALID_PAYMENT_METHOD`           |         400 | Payment method is unsupported.                                   |
| `INVALID_ITEMS` / `DUPLICATE_ITEM` |         400 | Cart structure is invalid.                                       |
| `CHECKOUT_FAILED`                  |         500 | Safe fallback for unexpected/internal failures.                  |

Conflict details contain only safe item identity/name/price fields where needed. SQL details, schema names, service credentials, customer records, guest-token hashes, and internal exceptions are not returned.

## 17. RLS and Grant Changes

- Direct anonymous order SELECT/INSERT/UPDATE remains denied.
- `create_online_order` is revoked from `PUBLIC`, `anon`, and `authenticated`, then granted only to `service_role`.
- Admin mutation functions are revoked from `PUBLIC` and `anon`, then granted to `authenticated`; every call still requires an active admin profile.
- The service role receives only the private-schema access needed by the invoker checkout function's code generator.
- No client receives table mutation grants for orders, order items, or rider reconciliation.
- The existing original-snapshot immutability trigger and all Phase 1.0 RLS policies remain active.

## 18. Security and Functional Validation

Final local validation completed:

- Clean `supabase db reset`: passed; both migrations applied.
- `supabase db lint --level warning`: passed with no issues.
- pgTAP: 42/42 assertions passed.
- Checkout Edge Function local compile/serve smoke test: passed; malformed input returned safe `INVALID_REQUEST` HTTP 400.

The pgTAP suite covers:

- Nearby below/exact/above threshold and far below/exact threshold
- Multiple quantities, mixed categories, dessert-only, and extra-only behavior
- SOLD OUT, invalid quantity, wrong menu-item relationship, price change, expiry, and deactivation rejection
- Failure atomicity and order-code uniqueness/format
- Snapshot agreement and immutability
- Hash-only token persistence and exact 24-hour expiry
- CASH and initial ONLINE_PAYMENT semantics
- Direct anonymous mutation/read denial and service-role-only checkout execution
- Active-admin enforcement
- Manual creation, edit recalculation, cancellation, restoration, verification/reversal, daily totals, and reconciliation

## 19. Runtime Status and Limitations

The local PostgreSQL/Docker validation gate is resolved. Phase 1.0 and Phase 1.1 apply cleanly together.

Current limitations:

- No production/remote Supabase project was modified or tested.
- Rate limiting and bot/abuse protection must be configured at deployment infrastructure level; request size and structure limits alone are not a complete abuse defense.
- Checkout has no idempotency key, so a client retry after losing a successful response can create a second intentional-looking order. The customer UI should avoid blind retries, and a later phase should add an idempotency contract before production traffic.
- Admin functions exist at the database boundary, but no admin Edge/API façade or UI has been implemented.
- Guest receipt/token validation endpoints are deferred with messaging/private access work.
- Message/conversation tables and payment-evidence storage remain deferred.

## 20. Required Confirmations

- Browser-supplied prices are comparison-only and never authoritative.
- Browser-supplied Internal DF values are not accepted.
- Delivery calculations use database menu/settings data.
- Rider amount equals Internal DF total plus final customer delivery charge.
- Online creation is atomic.
- The original snapshot is created from authoritative values.
- Guest token and order code are separate.
- Plaintext guest tokens are not stored.
- Guest expiry is exactly 24 hours from creation.
- Direct anonymous order mutation/read remains denied.
- Payment verification and cancellation remain active-admin-only.
- No frontend service-role exposure exists.

## 21. Deferred Work and Recommended Next Phase

Stop after Phase 1.1. Do not proceed automatically to UI or messaging.

Recommended next phase: **Phase 1.2 — Messaging & Private Storage**. It should add token-authorized guest receipt/chat operations, conversations/messages, private message media, private 30-day payment-evidence retention and cleanup, signed upload/read flows, and cross-order access tests. Before public launch, add checkout idempotency and deployment-level rate limiting as explicit release requirements.
