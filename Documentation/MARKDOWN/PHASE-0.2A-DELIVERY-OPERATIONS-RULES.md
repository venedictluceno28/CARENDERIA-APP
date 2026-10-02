# CARENDERIA-APP — Phase 0.2A

## Delivery Calculation & Operational Rule Refinement

## 1. Purpose

This document formalizes the refined delivery and operational rules confirmed after Phase 0.2. It defines product behavior only. It does not define database tables, application code, UI components, authentication, or printer integration.

## 2. Relationship to Phase 0.2

Phase 0.2 established that internal delivery allocation, customer-facing delivery charges, and far-area charges are separate concepts. Phase 0.2A keeps that separation but supersedes the interpretation that the underlying free-base-delivery calculation depends specifically on ordering two or more ULAM.

The authoritative system rule is now based on accumulated Internal Delivery Allocation (`Internal DF`) across all applicable cart items and quantities.

`2 ULAM = FREE DELIVERY` may remain customer-facing promotional wording because a common ULAM may carry ₱10 Internal DF. It is not the calculation algorithm and does not prevent DESSERTS or EXTRAS from qualifying.

Phase 0.2 remains a historical decision record. This document records the refinement.

## 3. Internal Delivery Allocation Model

Each applicable reusable catalog item can have its own configurable Internal DF value. Internal DF is operational information and is distinct from the item's customer-visible food price.

For each cart line:

```text
Item Internal DF Contribution = Item Internal DF × Quantity
```

For the whole cart:

```text
Internal DF Total = SUM(Item Internal DF × Quantity)
```

Example:

- Pork Adobo food price: ₱80
- Pork Adobo Internal DF: ₱10
- Quantity: 2
- Internal DF contribution: ₱10 × 2 = ₱20

The food subtotal remains ₱80 × 2 = ₱160. Internal DF is not added to the displayed food price.

Published menus and orders must eventually preserve the Internal DF values that applied when they were created. Later catalog changes must not silently alter historical delivery calculations.

## 4. Delivery Threshold Calculation

The Internal DF threshold is ₱20 and the comparison is inclusive.

```text
If Internal DF Total >= ₱20:
    Base Customer Delivery Charge = ₱0
Else:
    Base Customer Delivery Charge = ₱15
```

The ₱15 charge is fixed. It is not the difference between the Internal DF Total and ₱20.

Examples:

- Internal DF Total ₱18 results in a ₱15 base charge, not ₱2.
- Internal DF Total ₱5 results in a ₱15 base charge.
- Internal DF Total ₱20 results in a ₱0 base charge.

The operational delivery-related amount before any manual rider adjustment can be understood conceptually as Internal DF Total plus the final customer delivery charge. The exact accounting and payout model remains open.

## 5. Nearby vs Outside-Area Calculation

The nearby promotional areas are:

- Marycris Complex
- Wellington Place
- Elliston Place

The far-area rule is:

```text
If the customer is within a nearby promotional area:
    Far-Area Charge = ₱0
Else:
    Far-Area Charge = ₱20
```

The final customer charge is:

```text
Final Customer Delivery Charge =
    Base Customer Delivery Charge + Far-Area Charge
```

Reaching the ₱20 Internal DF threshold removes only the base charge. It does not remove the far-area charge.

## 6. Delivery Calculation Examples/Table

| Internal DF Total | Location     | Base charge | Far-area charge | Final customer delivery charge |
| ----------------- | ------------ | ----------: | --------------: | -----------------------------: |
| ₱5                | Nearby       |         ₱15 |              ₱0 |                            ₱15 |
| ₱18               | Nearby       |         ₱15 |              ₱0 |                            ₱15 |
| ₱20               | Nearby       |          ₱0 |              ₱0 |                      FREE / ₱0 |
| ₱30               | Nearby       |          ₱0 |              ₱0 |                      FREE / ₱0 |
| ₱5                | Outside area |         ₱15 |             ₱20 |                            ₱35 |
| ₱18               | Outside area |         ₱15 |             ₱20 |                            ₱35 |
| ₱20               | Outside area |          ₱0 |             ₱20 |                            ₱20 |
| ₱30               | Outside area |          ₱0 |             ₱20 |                            ₱20 |

Two important fixed-charge examples:

- ₱18 Internal DF + ₱15 base charge = ₱33 delivery-related amount for a nearby order.
- ₱5 Internal DF + ₱15 base charge = ₱20 delivery-related amount for a nearby order.

For an outside-area order, the separate ₱20 far-area charge is added to the customer charge and the delivery-related amount.

## 7. Customer-Facing Promotion vs Underlying System Rule

The business may advertise `2 ULAM = FREE DELIVERY` because two common ULAM items at ₱10 Internal DF each reach the ₱20 threshold.

This wording must not be encoded as the system rule. The calculation must not:

- Count only ULAM items.
- Assume every ULAM has exactly ₱10 Internal DF.
- Require two physical items when one item can contribute ₱20 Internal DF.
- Exclude DESSERTS or EXTRAS from Internal DF accumulation.

The authoritative rule is:

```text
Accumulated Internal DF >= ₱20 gives a ₱0 base customer delivery charge.
```

Customer-facing copy must still explain that outside-area customers pay the ₱20 far-area charge even when the base charge is free.

## 8. DESSERTS/EXTRAS Behavior

DESSERTS and EXTRAS may have item-specific Internal DF values and contribute to the cart's Internal DF Total. An order does not need an ULAM to qualify for a ₱0 base delivery charge.

Example:

- Mango Graham Salad Internal DF: ₱20 (example only)
- Quantity: 1
- Internal DF Total: ₱20
- Nearby final customer delivery charge: ₱0
- Outside-area final customer delivery charge: ₱20

No category-wide Internal DF value is confirmed for DESSERTS or EXTRAS. The admin configures Internal DF per catalog item. The example must not become a default for every dessert.

This resolves the Phase 0.2 zero-ULAM delivery ambiguity at the conceptual level: all category combinations use the same accumulated-Internal-DF calculation.

## 9. Customer-Visible vs Internal Delivery Information

Customers need to see:

- Food prices
- Food subtotals
- Whether the base delivery charge is free
- Final customer delivery charge
- Grand total
- Promotional explanation
- The outside-area/far-area condition

Admins may additionally need to see:

- Internal DF per item
- Item Internal DF contribution
- Accumulated Internal DF Total
- Calculated rider amount
- Manual rider adjustment
- Final rider amount

Internal DF must not be combined with the food price or exposed as though it were an additional food cost. For example, a food price of ₱80 with ₱10 Internal DF is displayed as ₱80, not ₱90.

## 10. Rider Calculation and Manual Adjustment

The amount calculated from order delivery values is not always the final amount paid to the rider. The product must conceptually distinguish:

- **Calculated rider amount:** The delivery-related amount calculated from transactions under the eventual accounting rule.
- **Manual rider adjustment:** A separately recorded increase or reduction used during reconciliation.
- **Final rider amount:** Calculated rider amount plus the manual adjustment.

Example:

```text
Calculated Rider Amount: ₱250
Manual Adjustment:       +₱30
Final Rider Amount:       ₱280
```

Manual adjustments must not be represented by changing historical food prices, quantities, original delivery charges, or customer grand totals. Those values describe the original customer transaction.

Still open are the exact calculated-rider formula, whether adjustment occurs per order, per day, or both, required reasons/notes, authorization, and audit history.

## 11. SOLD OUT Behavior

A published menu item supports a `SOLD OUT` state.

When sold out:

- The item remains visible in today's published menu.
- Customers can see that it is sold out.
- Customers cannot use `BUY` for it.
- Customers cannot use `ADD TO CART` for it.
- The reusable catalog item is not deleted.
- The admin can restore the published item's availability later.

The exact UI treatment and behavior for items already in a cart when they become sold out remain open.

## 12. Menu Expiry and Manual Deactivation

An active menu has a maximum lifetime of 24 hours.

At expiration:

- It becomes unavailable for new customer orders.
- Historical menu information remains preserved.
- Historical orders remain preserved.
- Reusable catalog items remain preserved.

The admin can manually end/deactivate the active menu before the 24-hour limit. Manual deactivation follows the same preservation rules and prevents new customer ordering from that menu.

Scheduling, whether editing changes the original expiry time, and exact customer-facing empty/expired states remain open.

## 13. V1 Order-Status Decision

V1 will not impose a multi-step restaurant workflow such as:

```text
NEW → CONFIRMED → PREPARING → OUT FOR DELIVERY → COMPLETED
```

The carenderia's daily process can vary, so the system must not force a rigid operational pipeline. This decision removes the need to design a complex order-status workflow for V1.

This does not resolve payment classification/verification, cancellation bookkeeping, or whether a minimal non-workflow state is required for reporting.

## 14. Cancellation Distinction

Cancellation remains an open decision. A minimal `Cancelled / Not Cancelled` bookkeeping concept may be required because cancellation affects:

- Daily sales
- Customer totals
- Rider calculations
- Reporting
- Visibility in Today's Orders

Cancellation must not be expanded into a complex restaurant workflow by assumption. Required decisions include who can cancel, when cancellation is allowed, whether cancelled orders remain visible, what totals exclude or retain, and how the original transaction is preserved.

## 15. Resolved Phase 0.2 Ambiguities

| Earlier ambiguity or interpretation    | Phase 0.2A resolution                                                                                      |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Free base delivery depended on 2+ ULAM | Superseded: it depends on accumulated Internal DF reaching the inclusive ₱20 threshold.                    |
| DESSERTS/EXTRAS did not count          | Superseded: any applicable item may contribute its configured Internal DF.                                 |
| Zero-ULAM customer delivery rule       | Resolved conceptually: use the same Internal DF threshold and location calculation for every category mix. |
| Charge below threshold                 | Fixed at ₱15; it is not the amount needed to reach ₱20.                                                    |
| Outside-area behavior                  | A separate fixed ₱20 far-area charge is added after the base calculation.                                  |
| Internal DF visibility                 | It remains operational and is not combined with customer-visible food prices.                              |
| Rider amount                           | The calculated amount is distinguishable from a separate manual adjustment and final amount.               |
| Sold-out handling                      | Published items remain visible but cannot be bought or added to cart; availability can be restored.        |
| Menu expiry                            | Expiry stops new ordering but preserves historical menus, orders, and catalog items.                       |
| Manual menu end                        | The admin can deactivate the active menu early without deleting historical information.                    |
| V1 operational statuses                | No rigid multi-step restaurant order-status workflow is required.                                          |

## 16. Remaining Open Decisions

1. Who may cancel an order and until what point.
2. How cancellation changes customer totals, daily sales, delivery calculations, and rider calculations.
3. Whether cancelled orders remain visible in Today's Orders and how they are identified.
4. Whether external ONLINE PAYMENT can be marked submitted, verified, paid, or rejected, and by whom.
5. How guest conversations are identified and linked to orders/order codes.
6. Whether the guest-message 24-hour timer applies per message or per conversation.
7. Whether guest text, photos, reactions, and payment evidence are deleted identically after 24 hours.
8. Whether payment-receipt images require admin historical retention beyond the guest-message lifetime.
9. Which order fields are editable and at what point.
10. Whether edits recalculate Internal DF, customer delivery charge, rider amount, and accounting totals.
11. How original values and edit history are preserved.
12. The exact calculated-rider formula.
13. Whether manual rider adjustments are per order, per day, or both.
14. Whether rider adjustments require a reason, authorization, and audit history.
15. Whether calculated and final rider amounts are included in Today's Orders or a separate reconciliation view.
16. What happens to an item already in a cart when it becomes sold out or its menu becomes inactive.
17. Whether editing a published menu changes its original 24-hour expiry time.
18. Menu scheduling and the customer-facing expired/no-active-menu state.
19. Duplicate-cart behavior, quantity limits, and quantity controls.
20. Exact delivery-area selection control and whether the admin validates customer area claims.
21. Order-code format, uniqueness, expiry, and recovery.
22. Definition of “today” and accounting inclusion rules.
23. Exact admin authentication method, accounts, recovery, and session rules.
24. Printer brand/model/protocol, mobile support, pairing, retry, and fallback behavior.
25. Address-book deletion, duplicates, history, and additional contact information.
26. Branding asset limits, font-size choices, and settings persistence.
27. Offline and network-loss behavior, retries, and duplicate-submission prevention.

## 17. Risks and Edge Cases

- Internal DF values changing after publication can corrupt historical calculations unless menu and order snapshots preserve them.
- A zero or negative Internal DF value has not been explicitly prohibited or defined.
- Discounts, refunds, and manual order edits may affect customer totals without a confirmed impact on Internal DF or rider calculations.
- A sold-out item can remain in an existing cart unless checkout revalidates availability.
- A menu can expire between cart creation and order completion.
- Customers may select the wrong delivery area, especially near area boundaries.
- Promotional `2 ULAM` wording can be misleading when ULAM Internal DF differs from ₱10 or another category qualifies alone.
- A manual rider adjustment without a reason or history could make daily reconciliation difficult to explain.
- Cancellation and order editing can silently distort sales and rider totals unless original values remain recoverable.
- Guest-message deletion can remove payment evidence before the admin finishes reviewing it.
- Repeated checkout attempts after network loss can create duplicate orders.

## 18. Recommended Next Decision Workshop

The next workshop should resolve transaction integrity and reconciliation before database or UI design:

1. Cancellation rules and effects on all reported/calculated totals.
2. Editable order fields, recalculation behavior, and audit-history requirements.
3. Exact rider calculation and whether manual reconciliation is per order, per day, or both.
4. External payment verification and payment-evidence retention.
5. Guest conversation identity and 24-hour expiration semantics.
6. Cart revalidation when items sell out or menus expire.
7. Definition of “today” and daily accounting inclusion rules.

Implementation, database design, UI design, Supabase integration, and Bluetooth integration must remain paused until the required business decisions are sufficiently precise.
