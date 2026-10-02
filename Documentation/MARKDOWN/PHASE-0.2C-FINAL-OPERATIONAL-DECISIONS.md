# CARENDERIA-APP — Phase 0.2C

## Final Operational Edge-Case Decisions

## 1. Purpose

This document closes the remaining major operational business-rule gaps before domain and data modeling. It defines required behavior without selecting database structures, UI interactions, authentication technology, storage infrastructure, or implementation details.

## 2. Relationship to Previous Phase 0.2 Documents

- Phase 0.2 separated the reusable catalog, published menu, and historical order; established quantity and snapshot concepts; and scoped authentication, payment, and printing.
- Phase 0.2A generalized delivery calculation around configurable Internal DF, defined menu availability and expiry, and rejected a rigid restaurant-status pipeline.
- Phase 0.2B established retained cancellations, broad admin editing, minimal timestamps, online-payment verification, order-code-linked guest chat, and payment-evidence retention beyond chat access.
- Phase 0.2C resolves the remaining operational questions about cancellation control, recalculation, original snapshots, verification reversal, daily rider reconciliation, day boundaries, checkout conflicts, and chat timing.

Earlier phase documents remain historical decision records. Where Phase 0.2C refines an earlier open point, this document and the living specification represent the current rule.

## 3. Cancellation Authority

Only the admin/owner changes an order's cancellation state in V1.

- Customers do not receive an automated customer-side cancellation action.
- A customer may request cancellation through messaging or another communication channel.
- The admin decides and performs the cancellation in the system.

This keeps transaction control simple and avoids uncontrolled customer-side changes.

## 4. Cancellation Reversibility and Reason

Cancellation is reversible by the admin:

```text
Active → Cancelled → Restored/Active
```

This is a bookkeeping state, not a restaurant workflow. When restored, the order returns to active totals according to its current values.

Cancellation may include an optional short reason, for example:

- Customer cancelled
- Duplicate order
- Item unavailable
- Wrong order
- Other short explanation

The reason is not required, and V1 does not need a structured reason taxonomy.

The exact handling of cancellation and restoration timestamps/history belongs to data modeling. The current cancellation state must always be determinable.

## 5. Editing and Automatic Recalculation

When the admin changes transaction inputs that affect money, the application must automatically recalculate all affected derived values. The admin edits source transaction data rather than manually correcting arithmetic.

Inputs can include:

- Items
- Quantities
- Unit prices
- Internal DF
- Customer location category
- Customer delivery-charge inputs
- Other monetary inputs

Affected derived values can include:

- Item subtotals
- Food subtotal
- Accumulated Internal DF
- Base customer delivery charge
- Far-area charge
- Final customer delivery charge
- Customer grand total
- Calculated rider amount
- Daily financial and rider totals

Exact dependency and rounding rules belong to Phase 0.3. The business requirement is that no affected derived total remains stale after an edit.

## 6. Original Order Snapshot Preservation

Every order conceptually has:

1. **Original order snapshot:** The transaction as first created.
2. **Current editable order state:** The latest admin-corrected or reconciled version.

Editing the current state must not overwrite or destroy the original snapshot. `Created At` and `Last Edited At` remain useful but are not sufficient by themselves because they do not show the original values.

V1 does not require an edit-by-edit revision timeline, diff viewer, audit dashboard, or detailed change log. The minimum integrity requirement is preservation of the original snapshot alongside the current state.

## 7. Online-Payment Verification Reversal

ONLINE PAYMENT retains two states:

- Not Verified
- Verified

The admin can change `Not Verified → Verified` after reviewing payment evidence and can reverse an accidental verification with `Verified → Not Verified`.

Verification remains manual and external-payment evidence does not verify itself. No additional payment-state workflow is introduced.

## 8. Verification Metadata

When an ONLINE PAYMENT is marked Verified, preserve `Verified At` conceptually.

The current verification state must always be known. If verification is reversed, exact handling of the previous timestamp—clearing it, retaining it separately, or preserving limited history—is a Phase 0.3 data-model decision.

A complex verification-history interface is not required for V1.

## 9. Rider Daily Reconciliation

The existing model remains:

```text
Daily Calculated Rider Amount
    + Daily Manual Adjustment
    = Daily Final Rider Amount
```

For V1, manual rider adjustment applies at the daily level. It may increase or reduce the daily calculated amount. Per-order rider adjustment is not required.

Historical food prices, item quantities, customer delivery charges, and customer grand totals must not be changed to manufacture a rider adjustment.

Exact calculated-rider arithmetic, adjustment-note requirements, and authorization details can be finalized during data modeling if they do not alter this daily business model.

## 10. Definition of Today

`TOTAL ORDERS FOR TODAY` uses Philippine local time:

- Timezone: `Asia/Manila`
- Business day start: `00:00:00`
- Business day end: `23:59:59` local time

Human-facing daily totals must not use UTC day boundaries. Storage may use technically appropriate timestamps, but reporting must convert and filter according to the `Asia/Manila` operational day.

## 11. Checkout Revalidation

Immediately before an order is created, the cart must be revalidated against the current active published menu.

Revalidation checks conceptually include:

- The menu is still active.
- The menu has not reached its 24-hour expiry.
- The admin has not manually deactivated it.
- Every cart item still belongs to the valid published menu.
- No cart item is SOLD OUT.
- The current published-menu price is used.
- Current relevant delivery data is used.

Order creation must not proceed from stale assumptions. The exact API, concurrency, and UI implementation belongs to later phases.

## 12. SOLD OUT Cart Behavior

If an item becomes SOLD OUT after being added to a cart but before order creation:

- Checkout is blocked.
- The order must not silently include the unavailable item.
- The customer must eventually be told which item is unavailable.
- The customer must remove or otherwise resolve that item before completing the order.

The exact conflict presentation and return-to-cart interaction belong to UI design.

## 13. Menu Expiry/Deactivation During Checkout

If the menu expires or the admin manually deactivates it before order creation:

- Checkout stops.
- The stale order is not created against the inactive menu.
- The customer is informed that the menu is no longer active.
- The customer may return to the current menu when one is available.

Historical menus, completed orders, and reusable catalog items remain preserved under prior rules.

## 14. Published-Menu Price Changes During Checkout

If the active published-menu price changes after an item enters the cart but before order creation:

- Final checkout validation uses the current valid published-menu price.
- Affected totals are recalculated.
- The customer must see/review the updated total before completing the order.
- The system must not silently charge the new amount.

This rule concerns the active published-menu price. A raw reusable-catalog price change does not automatically rewrite a published menu or historical order. The conceptual boundary remains:

```text
Reusable Catalog → Published Menu → Order
```

## 15. Guest Chat Expiry Timing

The guest messaging window begins at `Order Created At` and lasts approximately 24 hours:

```text
Guest Chat Expiry = Order Created At + 24 hours
```

Sending messages does not reset or extend the expiry. After expiry, the guest cannot continue using the chat as a permanently open channel.

The order and retained payment evidence survive chat expiry under prior rules. Exact expired-chat presentation and ordinary-message retention remain later design/architecture decisions.

## 16. V1 Simplicity Principles

V1 prioritizes:

- Simple admin operation
- Minimal bookkeeping states
- Automatic arithmetic where appropriate
- Editable operational records
- Preserved transaction history
- Clear customer conflict handling
- No unnecessary enterprise accounting features
- No imposed restaurant workflow

Prefer the simplest model that matches actual carenderia operations, provided it preserves transaction integrity, prevents stale checkout, and keeps financial history understandable.

## 17. Resolved Prior Ambiguities

| Previous open decision                       | Phase 0.2C resolution                                                                                |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Who can cancel                               | Admin/owner only; customers may request cancellation but do not perform it in the system.            |
| Cancellation reversibility                   | Admin may restore a cancelled order to active bookkeeping state.                                     |
| Cancellation reason                          | Optional short free-text reason; no taxonomy required.                                               |
| Effect of restoration on totals              | Restored orders participate in active totals using current values.                                   |
| Recalculation after edits                    | Automatically recalculate every affected derived total from edited transaction inputs.               |
| Original-versus-edited preservation          | Retain an original order snapshot separately from the current editable state.                        |
| Need for full revision history               | Not required for V1; original snapshot preservation is sufficient at this stage.                     |
| Payment verification reversal                | Admin can return Verified ONLINE PAYMENT to Not Verified.                                            |
| Minimum payment verification metadata        | Preserve Verified At when verification occurs.                                                       |
| Rider adjustment scope                       | Daily-level manual adjustment only for V1; no per-order adjustment required.                         |
| Definition of today                          | `Asia/Manila`, 00:00:00 through 23:59:59 local time.                                                 |
| Stale cart handling                          | Revalidate against the current active published menu before order creation.                          |
| SOLD OUT item already in cart                | Block checkout until the unavailable item is resolved.                                               |
| Menu expires/deactivates during checkout     | Block order creation and inform the customer.                                                        |
| Published-menu price changes during checkout | Use the current valid published price, recalculate, and require customer review before completion.   |
| Guest-chat timer origin                      | Starts at Order Created At, lasts approximately 24 hours, and does not extend with message activity. |

## 18. Remaining Open Decisions

The remaining items are primarily architecture, security, storage, or UX decisions suitable for Phase 0.3 and later phases:

1. Exact admin authentication implementation, account recovery, and session rules.
2. Exact order-code format, generation algorithm, uniqueness constraints, expiry, and recovery.
3. Exact database entities, relationships, constraints, snapshot representation, and timestamp strategy.
4. Exact handling of cancellation/restoration timestamps and whether prior cancellation metadata is retained after restoration.
5. Whether cancellation after a verified external payment requires a separate refund/reconciliation record.
6. Whether verification reversal preserves prior `Verified At` values or limited verification history.
7. Exact payment-evidence retention duration and deletion policy.
8. Storage security, access control, bucket/structure design, file-size/type limits, and image compression.
9. Retention behavior for ordinary guest text, photos, and reactions after chat expiry.
10. Exact expired-chat customer experience.
11. Exact calculated-rider formula and whether daily adjustment requires a reason or authorization metadata.
12. Exact UI behavior for sold-out, inactive-menu, and changed-price checkout conflicts.
13. Concurrency and transaction strategy for reliable checkout revalidation.
14. Rounding and currency-calculation rules.
15. Duplicate-cart behavior, quantity limits, and quantity-control UI.
16. Exact customer delivery-area control and admin validation behavior.
17. Menu scheduling, republish/edit expiry behavior, and no-active-menu presentation.
18. Manual ONLINE PAYMENT evidence flow when no guest chat exists.
19. Printer brand/model/protocol, supported phones, pairing, retries, and fallback.
20. Offline/network-loss strategy, safe retries, and duplicate-submission prevention.
21. Address-book deletion, duplicates, history, and additional contact information.
22. Branding asset constraints, font-size options, and persistence.

## 19. Risks and Edge Cases

- Restoring a cancelled order after prices or delivery settings change could alter active totals unless the current state is explicit and recalculated consistently.
- Cancellation after a verified external payment may require reconciliation even though refunds are not yet modeled.
- Original and current order states can diverge significantly; admin views must avoid presenting the original snapshot as the amount currently owed.
- Full editing followed by automatic recalculation requires one authoritative calculation path to prevent contradictory totals.
- A price, availability, or menu change can occur during final checkout revalidation; later architecture must make validation and creation sufficiently atomic.
- Customers must explicitly review a changed price to avoid an unexpected charge.
- Manila-time reporting can be wrong if storage timestamps are filtered before timezone conversion.
- Reversing payment verification without history can obscure a previous mistake, although detailed history is not required for V1.
- Retained payment evidence introduces privacy, security, and deletion obligations.
- Network retries can duplicate order creation or apply edits, cancellations, restoration, or verification actions more than once.

## 20. Readiness for Phase 0.3

The product and operational rules are sufficiently stable to begin **Phase 0.3 — Domain & Data Model**.

The domain model can now represent stable concepts including:

- Catalog items and published-menu snapshots
- Original and current order states
- Order items and quantities
- Delivery calculations and Internal DF snapshots
- Active/cancelled/restored bookkeeping
- Online/manual source
- Online-payment verification and evidence association
- Order-linked guest conversations with fixed expiry
- Daily rider reconciliation
- Manila-local operational reporting

The remaining decisions are appropriate for Phase 0.3 because they concern representation, constraints, timestamp/storage strategies, concurrency, security, and lifecycle implementation rather than unresolved core business intent.

Phase 0.3 should begin only in a separate task. This phase does not create a schema, migration, SQL, Supabase configuration, or application code.
