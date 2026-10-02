# CARENDERIA-APP — Phase 1.0

## Supabase Foundation & Initial Schema Migration

## 1. Purpose

Phase 1.0 establishes the first local Supabase/PostgreSQL implementation foundation. It converts the stable Phase 0.4 physical design and the final rider, guest-token, and payment-evidence decisions into one reviewable core migration without implementing application integration, messaging, Storage buckets, or trusted checkout.

## 2. Preconditions and Documents Read

Implementation was reconciled against:

- `Documentation/TINDAHAN MODULE.txt`
- Phase 0.2, 0.2A, 0.2B, and 0.2C product/operational decisions
- `PHASE-0.3-DOMAIN-DATA-MODEL.md`
- `PHASE-0.4-SUPABASE-SCHEMA-SECURITY-DESIGN.md`
- Existing project configuration and dependency files

Phase 0.4 remains the main physical-design source. The living specification and Phase 0.4 were updated only where the three newly confirmed decisions superseded unresolved wording.

## 3. Final Resolved Implementation Rules

### Rider calculation

For each order:

```text
Calculated Rider Amount = Internal DF Total + Final Customer Delivery Charge
```

Cancelled orders remain stored but are excluded when the trusted reconciliation operation later refreshes the daily calculated total.

```text
Daily Calculated Rider Amount = SUM(active order calculated rider amounts)
Daily Final Rider Amount = Daily Calculated Rider Amount + Manual Daily Adjustment
```

The daily adjustment is signed and may be positive, zero, or negative. There is no per-order manual rider adjustment.

### Guest token lifetime

- Online checkout will issue a separate high-entropy guest token.
- Only a secure token hash is stored; the readable order code is never an authorization secret.
- The token/chat window ends exactly 24 hours after `created_at` in the foundational constraint.
- Message activity will not extend the window.
- V1 has no automated token recovery; the readable order code is only for contacting the admin through another channel.

### Payment-evidence retention

- Payment evidence is private.
- Evidence is retained for 30 days from Order Created At and then becomes eligible for deletion.
- The order remains after evidence deletion.
- Customer access, where later allowed, is limited to the authorized guest window; admin access lasts only while retained evidence exists.
- Attachment metadata, private buckets, and automatic cleanup are deferred to the messaging/Storage phase. That phase must derive `retained_until` from Order Created At + 30 days.

## 4. Files Created or Changed

Created:

- `supabase/config.toml`
- `supabase/.gitignore`
- `supabase/migrations/20261002000000_phase_1_0_core_foundation.sql`
- `Documentation/MARKDOWN/PHASE-1.0-IMPLEMENTATION-FOUNDATION.md`

Updated:

- `Documentation/TINDAHAN MODULE.txt`
- `Documentation/MARKDOWN/PHASE-0.4-SUPABASE-SCHEMA-SECURITY-DESIGN.md`

No frontend source or dependency manifest was changed.

## 5. Migration Scope

The first migration includes:

- Core relational tables and foreign keys
- Business checks and generated arithmetic columns
- Historical snapshot storage and immutability protection
- Focused indexes
- One-current-menu uniqueness
- Updated-timestamp triggers
- Initial singleton settings values
- RLS enablement, least-privilege grants, and foundational policies
- A private active-admin authorization helper

The migration does not create conversations, messages, attachments, Storage buckets, checkout/order-edit RPCs, Edge Functions, or frontend data access.

## 6. Implemented Tables

1. `admin_profiles`
2. `catalog_items`
3. `published_menus`
4. `published_menu_items`
5. `address_book_entries`
6. `orders`
7. `order_items`
8. `daily_rider_reconciliations`
9. `store_settings`

All primary domain IDs use UUIDs except the fixed small-integer settings singleton and date-keyed rider reconciliation.

## 7. Money Representation

All authoritative money fields use PostgreSQL `bigint` centavos and `_centavos` names. Binary floating-point money is absent.

Non-negative checks cover prices, Internal DF, charges, subtotals, totals, and calculated rider amounts. `manual_adjustment_centavos` intentionally has no non-negative check. The generated daily final amount must remain non-negative.

## 8. Timestamp and Business-Date Handling

Event fields use `timestamptz` with database-side timestamps. `orders.business_date` is a stored generated date derived from `created_at` in `Asia/Manila`, preventing callers from choosing a reporting date.

Menu activation/expiry checks enforce a positive publication window no longer than 24 hours. Online guest expiry must equal Order Created At + 24 hours.

## 9. Snapshot Implementation

`orders.original_snapshot` is a required JSONB object containing `"snapshot_version": 1`. A database trigger rejects updates to the original snapshot and other immutable order identity fields.

Current order data remains relational and editable later through trusted operations. The original JSONB is one creation-time snapshot, not event sourcing or an edit history.

## 10. Cancellation and Payment Representation

Orders use reversible bookkeeping fields:

- `is_cancelled`
- `cancelled_at`
- optional `cancellation_reason`
- `restored_at`

Cancellation never deletes an order. A cancelled state requires a cancellation timestamp.

Payment checks enforce:

- CASH: null verification state and null `verified_at`
- ONLINE_PAYMENT: `NOT_VERIFIED` or `VERIFIED`
- VERIFIED: non-null `verified_at`
- NOT_VERIFIED: null `verified_at`

Reversal is represented by returning to `NOT_VERIFIED` and clearing the current verification timestamp.

## 11. Rider Calculation and Reconciliation Representation

`orders.calculated_rider_centavos` is a stored generated column equal to:

```text
internal_df_total_centavos
+ base_delivery_charge_centavos
+ far_area_charge_centavos
```

This is equivalent to Internal DF Total + Final Customer Delivery Charge because the final customer delivery column is itself the sum of base and far-area charges.

`daily_rider_reconciliations` stores a refreshed calculated total and the authoritative signed manual adjustment. `final_rider_centavos` is generated as their sum. No client role can write this table in Phase 1.0; a later trusted reconciliation operation must calculate the daily total from non-cancelled orders for the Manila business date.

## 12. Settings Representation

`store_settings` is one explicit singleton row enforced by `id = 1`. The migration seeds non-personal confirmed defaults:

- Delivery threshold: `2000` centavos
- Base charge: `1500` centavos
- Far-area charge: `2000` centavos
- Nearby areas: Marycris Complex, Wellington Place, and Elliston Place
- Confirmed store address

The model remains explicit rather than using a generic key/value or JSON settings framework.

## 13. RLS and Grants Implemented

RLS is enabled on every implemented application table. Grants are revoked first and then added narrowly.

Anonymous access is limited to column-scoped SELECT on:

- The currently orderable menu
- Items belonging to that orderable menu
- Safe public store/settings fields

Internal DF, catalog data, admin profiles, orders, order items, addresses, and rider reconciliation are not anonymously readable.

Authenticated active admins can read operational tables through `private.is_active_admin()`. Direct admin insert/update is currently allowed only for catalog items, menus, menu items, address-book entries, and the settings singleton. No client role receives DELETE.

Orders, order items, and daily reconciliation have no client INSERT/UPDATE policies or grants. They fail closed until trusted transactional operations are implemented. No anonymous order insertion or mutation is possible.

## 14. Indexes and Constraints

Implemented focused indexes include:

- Catalog archive/category filtering
- One-current-menu partial uniqueness
- Menu history ordering
- Published-menu item ordering and source references
- Case-normalized unique order code
- Unique non-null guest-token hash
- Orders by Manila business date/cancellation/time
- Order-item ordering and source references
- Address-book archive/name search

Foreign keys use `RESTRICT` or `SET NULL`; no historical transaction relationship uses destructive cascading deletion.

Checks reject invalid categories, order sources, payment combinations, negative ordinary money, non-positive quantities, malformed original snapshots, inconsistent online/manual fields, and invalid singleton IDs.

## 15. Intentionally Deferred Components

- Admin account bootstrap and application authentication integration
- Trusted online checkout and manual-order transaction functions
- Trusted order editing, cancellation/restoration, and payment verification operations
- Trusted daily rider refresh/adjustment operation
- Order-code generation algorithm and collision retry logic
- Guest-token generation, hashing, comparison, and delivery to the browser
- Conversations, messages, reactions, and attachment metadata
- Public/private Storage buckets, policies, signed URLs, and evidence cleanup
- Type generation and frontend Supabase client integration
- Automated RLS/database integration tests

The schema contains fields required by later guest authorization, but no guest-private endpoint exists yet.

## 16. Validation Performed

- Supabase CLI `2.119.0` successfully parsed `supabase/config.toml` without configuration warnings.
- The migration file and expected local Supabase directories exist.
- Static checks confirmed all nine tables, RLS enablement for all nine, focused grants/policies, expected generated formulas, singleton defaults, and required CHECK/UNIQUE/index declarations.
- Static checks confirmed no anonymous INSERT/UPDATE/DELETE grant or policy exists.
- Markdown formatting passed Prettier.
- Existing frontend lint and production build passed without source changes.
- Source and dependency-manifest hashes were compared with the pre-change baseline.

## 17. Validation Limitations

Docker Desktop/Podman and a local PostgreSQL executable were not available in the environment. Therefore the migration could not be applied to a disposable local database, and runtime constraint/RLS behavior could not be integration-tested in this phase.

`supabase status` reached local-container inspection and failed only because neither Docker nor Podman was installed. No remote Supabase project was linked or modified.

Before deployment, run a local reset and database tests in an environment with Docker or Podman:

```text
supabase start
supabase db reset
supabase db lint
```

Then test rejected invalid categories/payment combinations, money and quantity checks, duplicate order codes, duplicate current menus, settings singleton enforcement, snapshot immutability, and anon/admin RLS paths.

## 18. Risks and Notes

- Header food/Internal DF totals are persisted aggregates and cannot be cross-checked against child rows with a simple row CHECK. Only later trusted order operations may write them.
- The one-current-menu index prevents two current markers, while timestamp policies prevent expired/deactivated rows from being publicly orderable. A trusted publication operation should still switch menus atomically.
- The current order-code constraint fixes uppercase alphanumeric/hyphen formatting but deliberately leaves generation length/alphabet details to the checkout phase.
- Guest-token hashes are stored, unique, and never anonymously exposed, but token cryptography is not improvised in this migration.
- Generated columns are used only where a confirmed same-row arithmetic rule can prevent drift: order-item contributions, customer/grand/rider totals, business date, and daily final rider amount.
- Payment-evidence retention is documented but cannot be physically represented until the attachment/Storage migration.

## 19. Recommended Next Phase

Proceed next with **Phase 1.1 — Trusted Checkout and Order Operations** before frontend order integration. It should implement and test one authoritative calculation path for online checkout, manual orders, edits, cancellation/restoration, payment verification, daily rider reconciliation, order-code generation, and guest-token issuance.

After trusted order operations pass transaction, concurrency, snapshot, and RLS tests, proceed with **Phase 1.2 — Messaging and Private Storage**. Messaging must apply the confirmed private 30-day payment-evidence retention rule.
