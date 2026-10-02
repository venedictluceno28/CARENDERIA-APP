# CARENDERIA-APP — Phase 1.0
## Supabase Foundation & Initial Schema Migration

Continue working on the existing CARENDERIA-APP project.

Phase 0.1 through Phase 0.4 are complete.

The conceptual domain model and proposed Supabase physical schema/security design have already been documented.

This task begins the FIRST implementation phase.

Before changing anything, read the relevant documentation, especially:

- `Documentation/TINDAHAN MODULE.txt`
- `Documentation/MARKDOWN/PHASE-0.3-DOMAIN-DATA-MODEL.md`
- `Documentation/MARKDOWN/PHASE-0.4-SUPABASE-SCHEMA-SECURITY-DESIGN.md`
- All Phase 0.2 operational/business-rule documents
- Any engineering/project rules inside `Documentation/`

Treat Phase 0.4 as the primary physical-schema/security design input.

Treat `Documentation/TINDAHAN MODULE.txt` as the living product specification.

---

# IMPORTANT — NEW CONFIRMED DECISIONS

Before implementation, incorporate these final confirmed decisions into the relevant documentation.

## Rider Calculation

For each active/non-cancelled order:

`Calculated Rider Amount = Internal DF Total + Final Customer Delivery Charge`

Examples:

| Internal DF | Customer Delivery Charge | Calculated Rider Amount |
| ---: | ---: | ---: |
| ₱10 | ₱15 | ₱25 |
| ₱20 | ₱0 | ₱20 |
| ₱10 | ₱35 | ₱45 |
| ₱20 | ₱20 | ₱40 |

Cancelled orders do NOT contribute to rider totals.

Daily rider reconciliation:

`SUM(active order calculated rider amounts) = Daily Calculated Rider Amount`

Then:

`Daily Calculated Rider Amount + Manual Daily Adjustment = Final Rider Amount`

Manual adjustment may be positive or negative.

---

## Guest Token Lifetime

Guest order/chat authorization uses a separate high-entropy guest token.

The readable order code is NOT an authorization secret.

For V1:

- Guest token is issued when an online guest order is successfully created.
- Guest token remains valid for approximately 24 hours from `Order Created At`.
- Guest chat expiry is based on order creation time.
- Sending additional messages does NOT extend the token/chat lifetime.
- No automated guest-token recovery is required for V1.
- If the customer loses access/token, they may contact the admin using the human-readable order code through another channel.

Do not build account-less recovery infrastructure in V1.

---

## Payment Evidence Retention

Payment evidence should remain private.

V1 retention rule:

- Payment evidence is retained for 30 days from order creation.
- After 30 days it becomes eligible for deletion.
- The order itself remains historically available.
- Payment evidence must never be publicly readable.
- Customer access is limited to the authorized guest window where appropriate.
- Admin may access retained evidence while it still exists.

Automatic cleanup does NOT have to be implemented in this exact phase unless already simple and safe to support.

The schema/storage model should be capable of supporting this retention rule.

---

# DOCUMENTATION UPDATE

Before or alongside implementation:

Update:

`Documentation/TINDAHAN MODULE.txt`

and/or the most appropriate Phase 0 documentation to capture the three confirmed decisions above.

Prefer creating a small implementation decision record:

`Documentation/MARKDOWN/PHASE-1.0-IMPLEMENTATION-FOUNDATION.md`

This document should record:

- Scope of Phase 1.0
- Final rider formula
- Guest-token lifetime rule
- Payment-evidence retention rule
- Which schema objects were actually implemented
- Which Phase 0.4 proposals were intentionally deferred
- Validation results
- Next recommended implementation step

All Markdown files must remain inside:

`Documentation/MARKDOWN/`

---

# IMPLEMENTATION PHILOSOPHY

Do NOT implement the entire backend in one giant change.

This phase should establish a clean Supabase foundation and a FIRST core migration.

Prefer small, reviewable migrations.

The implementation must remain aligned with the project engineering rules:

- Simple
- Maintainable
- Explicit
- No unnecessary abstractions
- No speculative features
- Preserve historical integrity
- Secure guest access
- Admin-only sensitive mutations
- No permanent customer-account model in V1
- No complex order-status machine
- No inventory quantity system
- No generalized promotions engine

---

# PHASE 1.0 IMPLEMENTATION SCOPE

Implement only the foundational database/schema layer necessary to establish the core data model.

The intended first migration should focus on the safest core relational structures.

Recommended initial scope:

1. Supabase project/local structure if not already present
2. Required extensions only if genuinely necessary
3. `admin_profiles`
4. `catalog_items`
5. `published_menus`
6. `published_menu_items`
7. `orders`
8. `order_items`
9. `address_book_entries`
10. `daily_rider_reconciliations`
11. `store_settings`
12. Core constraints
13. Core indexes
14. Foundational RLS enablement/policies where straightforward
15. Type-safe schema validation/build checks where available

Messaging/storage/trusted checkout may be deferred to later implementation phases if that produces a cleaner first migration.

Do NOT force everything into Phase 1.0 merely because Phase 0.4 designed it.

---

# SUPABASE PROJECT STRUCTURE

If the repository does not yet contain the standard Supabase local project structure, initialize/configure it appropriately.

Expected area may include:

`supabase/`

with migration/config structure.

Do not modify the remote Supabase project unless explicitly required and already configured safely.

Prefer generating local migration files first.

Do not expose secrets.

Never commit:

- service-role secret
- database password
- private API credentials

Environment files containing secrets must remain ignored.

---

# MIGRATION STRATEGY

Create a clear first migration.

Prefer a timestamped Supabase migration filename.

Do not split trivial mutually dependent objects unnecessarily, but do not create one uncontrolled mega-migration covering the entire future backend.

The migration should be readable.

Use comments sparingly where they explain non-obvious business rules.

---

# MONEY

Implement money using integer centavos according to Phase 0.4.

Use a PostgreSQL integer type with sufficient range, preferably `bigint` where Phase 0.4 recommended it.

Naming should consistently communicate units.

Examples:

- `price_centavos`
- `internal_df_centavos`
- `base_delivery_charge_centavos`
- `far_area_charge_centavos`
- `customer_delivery_charge_centavos`
- `grand_total_centavos`
- `calculated_rider_centavos`
- `manual_adjustment_centavos`
- `final_rider_centavos`

Never use floating point for money.

---

# TIMESTAMPS

Use timezone-safe event timestamps.

Prefer PostgreSQL `timestamptz`.

Operational reporting interprets dates in:

`Asia/Manila`

Daily rider reconciliation should use a local business-date concept appropriate for Philippine reporting.

Do not use UTC calendar boundaries for "Today's Orders" semantics.

---

# CATEGORY / ENUM-LIKE VALUES

Follow Phase 0.4's recommendation for categorical values.

Prefer maintainable constraints.

Examples include:

Catalog category:
- ULAM
- DESSERTS
- EXTRAS

Order source:
- ONLINE
- MANUAL

Payment method:
- CASH
- ONLINE_PAYMENT

Payment verification:
- NOT_VERIFIED
- VERIFIED

Avoid unnecessary PostgreSQL enum rigidity if the documented design recommended text + CHECK constraints.

---

# ADMIN PROFILES

Implement the minimal Supabase Auth-linked admin profile model from Phase 0.4.

Do not add complex RBAC.

V1 only needs a simple admin/owner boundary.

Ensure:

- References Auth user appropriately
- Sensitive operational changes remain admin-only
- Public guests cannot enumerate admin data

---

# CATALOG ITEMS

Implement reusable catalog records.

Expected concepts include:

- ID
- Name
- Category
- Price centavos
- Internal DF centavos
- Photo reference/path
- Archive/inactive behavior
- Created timestamp
- Updated timestamp

Constraints should enforce sensible valid values.

Avoid destructive deletion where historical references may exist.

---

# PUBLISHED MENUS

Implement menu records supporting:

- At most one active menu
- Activation
- Expiry
- Manual deactivation
- Menu image
- Historical survival

Use the Phase 0.4 recommended enforcement strategy for one-active-menu behavior.

If Phase 0.4 recommended a partial unique index or similar safe database-level enforcement, implement it carefully.

---

# PUBLISHED MENU ITEMS

Implement publication snapshots.

They must preserve publication-time information such as:

- Name
- Category
- Unit price
- Internal DF
- Image reference where appropriate
- Sold-out state

Catalog changes must not silently rewrite published snapshots.

Do not cascade destructive catalog deletion into historical menu data.

---

# ORDERS

Implement the current editable order representation according to Phase 0.4.

The schema should support:

- Order code
- ONLINE / MANUAL source
- Nullable published-menu relation
- Customer name
- Address snapshot
- Location classification/input needed for delivery explanation
- Payment method
- Online payment verification
- Verification timestamp
- Internal DF total
- Base delivery charge
- Far-area charge
- Final customer delivery charge
- Food/order subtotal
- Grand total
- Calculated rider amount
- Cancellation state
- Cancellation metadata
- Created At
- Last Edited At
- Cancelled At
- Guest chat expiry where applicable
- Original immutable snapshot representation

Use the Phase 0.4 design rather than inventing a new model.

---

# ORIGINAL SNAPSHOT

Follow Phase 0.4's selected approach.

If Phase 0.4 selected:

`orders.original_snapshot jsonb`

then implement it as a versioned immutable-at-application-level snapshot.

The snapshot should contain the original transaction state including original order-item information.

Include a small snapshot schema/version identifier if Phase 0.4 recommended one.

Do NOT create event sourcing.

Do NOT create edit-by-edit revision tables.

Do NOT automatically rewrite `original_snapshot` during later order edits.

---

# ORDER ITEMS

Implement current editable order items.

Support:

- Online items tied to published menu records when applicable
- Manual items without catalog/menu references
- Name/category transaction snapshots
- Quantity
- Unit price centavos
- Internal DF per unit
- Derived/persisted item subtotal according to Phase 0.4 design
- Internal DF contribution
- Created/updated timestamps

Quantity must be positive.

Money values should have appropriate non-negative checks.

---

# RIDER CALCULATION FIELD

The order's calculated rider amount follows the newly confirmed business rule:

`calculated_rider_centavos = internal_df_total_centavos + customer_delivery_charge_centavos`

This applies to the current editable order values.

Cancelled orders remain stored but are excluded from daily calculated rider totals.

Do not introduce per-order manual rider adjustment.

V1 manual rider adjustment is DAILY only.

If this value is stored rather than dynamically derived, ensure application/database design keeps it consistent.

Use Phase 0.4's recommended persisted-vs-derived strategy.

---

# DAILY RIDER RECONCILIATION

Implement the daily reconciliation representation.

It must support:

- Business date
- Calculated rider total
- Manual adjustment
- Final rider amount
- Last updated
- Updated by/admin where appropriate

Conceptual formula:

`Final Rider Amount = Calculated Rider Amount + Manual Adjustment`

Manual adjustment may be:

- Positive
- Zero
- Negative

Avoid constraints that prohibit negative adjustment values.

The calculated rider total itself should not become an arbitrary manual number if it is meant to originate from active orders.

Document whether it is cached/persisted versus recomputed according to the Phase 0.4 decision.

---

# CANCELLATION

Implement minimal reversible cancellation fields.

Requirements:

- Admin-only mutation
- Optional reason
- Cancelled At
- Restoration support
- Cancelled orders remain queryable
- Cancelled orders excluded from active totals

Do not add restaurant workflow statuses.

---

# PAYMENT VERIFICATION

Implement:

- NOT_VERIFIED
- VERIFIED

for ONLINE PAYMENT.

CASH should not require online verification semantics.

Support:

- Reversal from VERIFIED → NOT_VERIFIED
- `verified_at`

Avoid complex payment entities.

---

# ADDRESS BOOK

Implement independent admin-managed address-book records.

Support:

- Customer name
- Exact address
- Search
- Editing
- Archive/inactive behavior if Phase 0.4 recommended it

Historical order addresses remain independent snapshots.

---

# STORE SETTINGS

Implement the explicit singleton settings model recommended by Phase 0.4.

At minimum support the confirmed current settings/model needs:

- Store/carenderia name
- Logo reference/path
- Font-size preference
- Internal DF qualification threshold
- Base delivery charge below threshold
- Far-area charge
- Nearby/promotional area representation according to Phase 0.4

Do not build a generic key/value configuration framework unless Phase 0.4 explicitly selected it.

Seed/default values may reflect current confirmed business rules if appropriate:

- DF threshold = ₱20
- Base charge = ₱15
- Far-area charge = ₱20

Represent these in centavos.

Nearby areas:

- Marycris Complex
- Wellington Place
- Elliston Place

Keep the implementation understandable and editable later.

---

# ORDER CODE

Implement the database uniqueness requirement.

If generating actual codes is deferred to trusted checkout, that is acceptable.

The schema must at least support:

- Stable code
- Unique constraint
- Case-normalized convention if appropriate

Do not expose database primary keys as the customer-facing code.

---

# GUEST TOKEN

Do not use order code as authorization.

If the core `orders` model needs fields supporting later guest access, implement only what Phase 0.4 designed.

Guest token requirements:

- High entropy
- 24-hour lifetime from order creation
- No automatic recovery in V1

Prefer storing a secure token hash rather than plaintext token if Phase 0.4 recommended that design.

If guest-token implementation belongs to the trusted-checkout phase rather than this initial migration, document the deferral rather than improvising.

---

# RLS

Enable RLS on exposed application tables where appropriate.

Apply foundational policies that are safe and clearly defined.

Do NOT grant anonymous clients broad direct access to:

- Orders
- Order items
- Rider reconciliation
- Address book
- Store mutation
- Admin profiles

Public/anonymous direct reads may be appropriate for safely exposed active menu data, subject to Phase 0.4 design.

Trusted order creation should NOT be implemented as unrestricted anonymous direct table inserts.

If trusted checkout RPC/Edge Function is deferred, keep sensitive guest writes denied until that secure path exists.

Security should fail closed.

---

# GRANTS

Review database grants as part of security.

Do not assume RLS alone is enough.

Follow the least-privilege strategy documented in Phase 0.4.

Avoid granting anonymous mutation access to internal tables.

---

# INDEXES

Implement only indexes justified by current queries and constraints.

Likely examples from Phase 0.4:

- Order code uniqueness
- Orders created timestamp
- Active menu access
- Published menu item lookup
- Daily reconciliation date
- Address-book search support
- Relevant FK indexes

Avoid speculative indexes.

---

# FOREIGN KEY DELETE BEHAVIOR

Follow Phase 0.4 recommendations carefully.

Historical records must survive.

Avoid cascade behavior that could erase:

- Published menu history
- Orders
- Order items
- Payment/order history

Use `RESTRICT`, `SET NULL`, or archive semantics where appropriate.

Use CASCADE only where deletion of the parent is itself controlled and the children have no independent/historical meaning.

---

# UPDATED_AT HANDLING

If implementing automatic `updated_at` behavior, keep it simple and consistent.

A small reusable database function/trigger may be acceptable if it reduces repeated application mistakes.

Do not add trigger complexity beyond concrete needs.

Document any trigger introduced.

---

# NO MESSAGING IMPLEMENTATION YET UNLESS REQUIRED

Prefer deferring:

- Conversations
- Messages
- Message attachments
- Payment-evidence Storage
- Signed URL handling

to a later dedicated implementation phase.

The core order/payment fields may support future messaging, but do not overload Phase 1.0 unnecessarily.

If Phase 0.4 dependencies require a minimal conversation table now, explain why.

---

# NO TRUSTED CHECKOUT IMPLEMENTATION YET UNLESS CLEANLY SEPARABLE

This phase may prepare the schema for trusted checkout.

Prefer a later dedicated phase for:

- Checkout Edge Function
- Transactional RPC
- Guest token issuance
- Server-authoritative delivery calculation
- Snapshot construction

unless Phase 0.4 explicitly makes a small foundational RPC necessary for schema correctness.

Do not mix too many concerns into the first migration.

---

# TYPES / LOCAL DEVELOPMENT

If Supabase CLI/type generation is already configured and safe to use locally:

- Generate or validate database types after migrations if appropriate.

Do not introduce application integration yet unless necessary for validation.

The frontend should remain functionally unchanged.

---

# MIGRATION VALIDATION

Validate the migration locally where possible.

At minimum check:

- Migration parses/applies cleanly
- Constraints behave as intended
- Unique active-menu enforcement works
- Invalid category/payment/source values fail
- Money checks work
- Quantity checks work
- Order-code uniqueness works
- Singleton settings enforcement works
- RLS is enabled where intended
- Anonymous access is not accidentally broad

If Supabase local environment is unavailable, clearly report which validation could not be executed.

Do not pretend remote state was tested if it was not.

---

# TEST DATA

Do NOT populate production-like persistent data unnecessarily.

If migration validation requires temporary local test records, keep them in a reproducible local/test context.

Do not insert personal customer data.

---

# DOCUMENTATION OUTPUT

Create:

`Documentation/MARKDOWN/PHASE-1.0-IMPLEMENTATION-FOUNDATION.md`

Document:

1. Purpose
2. Preconditions/read documents
3. Final resolved implementation rules
4. Files created/changed
5. Migration scope
6. Implemented tables
7. Money representation
8. Timestamp/business-date handling
9. Snapshot implementation
10. Cancellation/payment representation
11. Rider calculation/reconciliation representation
12. Settings representation
13. RLS/grants implemented
14. Indexes/constraints
15. Intentionally deferred components
16. Validation performed
17. Validation limitations
18. Risks/notes
19. Recommended next phase

---

# EXPECTED NEXT PHASE

If Phase 1.0 succeeds, likely next work should be split into focused phases such as:

**Phase 1.1 — Messaging & Private Storage**
and/or
**Phase 1.2 — Trusted Checkout RPC / Edge Function**
and/or
**Phase 1.3 — Admin Auth & Application Integration**

Do not automatically begin them.

Recommend the most logical next step after inspecting the implemented foundation.

---

# FINAL VALIDATION

Before stopping:

1. Confirm the migration file(s) exist.
2. Confirm the implementation matches Phase 0.4.
3. Confirm rider formula uses:
   `Internal DF + Customer Delivery Charge`.
4. Confirm daily manual rider adjustment supports positive/negative values.
5. Confirm money uses centavos/integer representation.
6. Confirm event timestamps are timezone-safe.
7. Confirm the order code is not used as an auth secret.
8. Confirm guest security is not weakened.
9. Confirm cancelled orders remain stored.
10. Confirm original snapshots are preserved.
11. Confirm CASH does not require online verification.
12. Confirm RLS fails closed for sensitive anonymous operations.
13. Confirm no secrets were committed.
14. Confirm frontend behavior remains unchanged.
15. Run formatting/lint/build checks relevant to changed files.
16. Report all migration/schema validation results.
17. Report any deviations from Phase 0.4.
18. Recommend the next implementation phase.
19. Stop.

Do not continue automatically.

The goal is:

**Implement the smallest secure database foundation that accurately represents the business rules, validate it, review it, then continue incrementally.**