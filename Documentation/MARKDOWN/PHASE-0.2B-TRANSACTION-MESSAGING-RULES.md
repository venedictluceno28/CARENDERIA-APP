# CARENDERIA-APP — Phase 0.2B

## Transaction Editing, Cancellation, Payment Verification & Guest Messaging

## 1. Purpose

This document formalizes the minimum transaction and guest-messaging rules needed by CARENDERIA-APP V1. It deliberately avoids a complex restaurant workflow and does not define database tables, UI components, storage infrastructure, authentication, calculations in code, or integrations.

## 2. Relationship to Phase 0.2A

Phase 0.2A established delivery calculations, rider-accounting distinctions, sold-out behavior, menu expiry, and the decision not to impose a multi-step restaurant order pipeline. It left cancellation, editing, payment verification, guest identity, chat expiry, and evidence retention open.

Phase 0.2B resolves those questions at the product-rule level while preserving these Phase 0.2A principles:

- No rigid operational status pipeline in V1.
- Historical transactions must remain understandable.
- Editing and rider reconciliation must not silently rewrite what happened.
- Manual and online orders belong in the same daily operational history where applicable.

## 3. Minimal Transaction Lifecycle Philosophy

V1 does not require statuses such as `NEW`, `CONFIRMED`, `PREPARING`, `OUT FOR DELIVERY`, or `COMPLETED`. The real carenderia process varies, and the software must not force a restaurant-style sequence.

The minimum bookkeeping distinction is:

- Active/non-cancelled
- Cancelled

This distinction exists for accounting and history, not as the start of a larger workflow.

Payment method and online-payment verification are separate attributes. They are not operational order stages.

## 4. Cancellation Behavior

Cancelled orders are retained rather than deleted.

When an order is cancelled:

- It remains visible in `TOTAL ORDERS FOR TODAY`.
- The admin can inspect the order and understand that it existed.
- It is clearly identifiable as cancelled.
- Its original transaction information remains available for inspection.

At minimum, cancellation conceptually preserves:

- Order identity/code
- Customer information
- Ordered items
- Original transaction values
- Creation time
- Cancellation state
- Cancellation time, when available

The exact visual treatment is deferred. Cancellation must not be expanded into a complex status workflow.

Who can cancel, when cancellation is allowed, whether cancellation is reversible, and whether a reason is required remain open.

## 5. Cancellation Effect on Totals

Cancelled orders do not contribute to active financial or operational totals. At minimum, exclude them from:

- Today's sales total
- Customer delivery-fee total
- Calculated rider total
- Final rider payout total
- Active order count, if such a count is displayed

A separate cancelled-order count may be useful later but is not a confirmed requirement.

The cancelled order itself remains visible. Exclusion from totals must not erase or rewrite its original values.

The treatment of cancellation after payment, refunds, previously paid rider amounts, and reversal of manual rider adjustments remains open.

## 6. Admin Order Editing

From `TOTAL ORDERS FOR TODAY`, the admin/owner may edit essentially the complete order. Editable information can include:

- Customer name
- Address
- Ordered items
- Quantities
- Unit prices
- Item totals
- Payment method
- Customer-facing delivery charge
- Internal DF values
- Rider-related values
- Other transaction fields required by the order

This broad flexibility is intentional for corrections and real-world manual adjustments. V1 should not impose unnecessary field restrictions.

Editing may require recalculating dependent values, but the exact recalculation and preservation strategy remains an architecture decision. Editing must not make a changed order indistinguishable from an order that was originally created with the changed values.

## 7. Minimal Edit Metadata

The confirmed minimum metadata is:

- `Created At`
- `Last Edited At`
- `Cancelled At`, when cancelled

This metadata indicates that the transaction changed without requiring a full audit system in V1.

A full change-by-change audit log is not required. Still open are:

- Whether original values are retained after each edit.
- Whether a detailed history is eventually needed.
- Whether the system records or displays who performed an edit.
- How metadata behaves if a cancellation is reversed, if reversal is later allowed.

## 8. Payment Methods

Payment methods remain:

- CASH
- ONLINE PAYMENT

There is no integrated payment gateway in V1. ONLINE PAYMENT occurs outside the application, and the customer can send evidence through messaging.

CASH orders do not use the online-payment verification workflow unless a later requirement explicitly adds one.

## 9. Online-Payment Verification

ONLINE PAYMENT has exactly two verification states for V1:

- Not Verified
- Verified

The conceptual flow is:

```text
Customer selects ONLINE PAYMENT
    → order is created
    → customer sends payment receipt image
    → admin reviews the evidence
    → admin manually marks payment Verified
```

No automatic confirmation is required. Do not add states such as Processing, Failed, Refunded, or Disputed without a later decision.

Whether verification can be reversed, whether `Verified At` metadata is needed, and whether the verifying admin must be recorded remain open.

## 10. Guest Order-Code Identity

A guest conversation is associated with the customer's order using the generated order code. Customer name alone is not sufficient conversation identity.

Conceptually:

```text
Order code: CRD-A7K29
Customer: Juan Dela Cruz
MESSAGE US → conversation associated with CRD-A7K29
```

The example code is illustrative only. Code format, length, generation algorithm, and exact uniqueness strategy remain architecture decisions.

The order code must be:

- Unique enough for the application's intended use.
- Human-readable enough to use in conversation.
- Associated with the correct order.

The customer may provide both name and order code when contacting the admin.

## 11. Guest Messaging Lifecycle

Guest chat is a temporary order-related communication channel.

- A guest chat is linked to the relevant order code.
- The customer can actively use the guest chat for approximately 24 hours.
- After that window expires, the customer cannot continue using it as a permanently open chat.
- Chat expiry does not delete the order.
- Admin access to retained order-related records does not have to match the customer's chat-access duration.

Exact timing mechanics remain open, including when the 24-hour clock starts, whether activity extends it, and whether the expired conversation is read-only or inaccessible to the customer.

## 12. Payment-Image Evidence Retention

Guest chat availability and important order-related evidence are separate concerns.

An online-payment receipt image:

- Can remain associated with its order for later admin inspection.
- Must not automatically disappear solely because the customer's 24-hour guest-chat window expired.
- Is not automatically verified merely because it was uploaded.

Still open are:

- Exact retention duration.
- Storage strategy.
- File size and type limits.
- Compression and image-quality rules.
- Deletion policy.
- Access controls and privacy/security requirements.

## 13. TOTAL ORDERS FOR TODAY Implications

`TOTAL ORDERS FOR TODAY` serves as both:

1. A daily operational/order view.
2. A lightweight reconciliation and editing tool.

It includes online and manual orders. The admin can inspect and edit orders, review cancellation state, and—where applicable—review online-payment verification and retained payment evidence.

Cancelled orders remain visible but are excluded from active totals. The list remains chronological and searchable under existing requirements.

The exact day boundary, timezone implementation, reporting labels, edit UI, and placement of rider reconciliation remain open.

## 14. Manual-Order Implications

Where relevant, manual orders follow the same core transaction principles:

- They remain part of daily order history.
- The admin can edit them.
- They may be cancelled.
- Cancellation does not delete them.
- Cancelled manual orders do not contribute to active totals.
- They retain the minimum creation/edit/cancellation metadata.

Do not infer guest messaging for a manual order that did not originate from a customer guest session.

If a manual order uses ONLINE PAYMENT, whether the same evidence and verification process is used remains an open operational detail unless evidence is supplied through an order-linked customer chat.

## 15. Conceptual Transaction Metadata

Without defining a database schema, an order conceptually requires:

- Order code
- Source: online or manual
- Created At
- Last Edited At
- Cancelled state
- Cancelled At, when cancelled
- Payment method
- Online-payment verification state, when applicable

The transaction also retains the customer, item, delivery, Internal DF, rider-related, and monetary values required by the existing product rules.

These are conceptual requirements only. No column names, data types, constraints, or storage layout are selected here.

## 16. Resolved Ambiguities

| Previous open decision                    | Confirmed Phase 0.2B resolution                                                                   |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Whether cancelled orders remain visible   | They remain visible and inspectable in `TOTAL ORDERS FOR TODAY`.                                  |
| Cancellation effect on active totals      | Cancelled orders are excluded from sales, delivery-fee, rider, final-payout, and active counts.   |
| Whether cancellation deletes history      | It does not; original transaction information and cancellation metadata remain available.         |
| Which order fields the admin can edit     | The admin may edit essentially the whole order.                                                   |
| Minimum edit-history requirement          | Preserve Created At, Last Edited At, and Cancelled At when applicable.                            |
| Need for a full V1 audit log              | A full audit log is not required, although the original-versus-edited strategy remains open.      |
| ONLINE PAYMENT verification               | Admin-controlled Not Verified / Verified states apply only to ONLINE PAYMENT.                     |
| Guest conversation identity               | Link it to the generated order code, not customer name alone.                                     |
| Guest chat lifetime                       | Customer access remains active for approximately 24 hours, then expires.                          |
| Effect of chat expiry on an order         | Chat expiry does not remove the order.                                                            |
| Effect of chat expiry on payment evidence | Important payment images may remain associated with the order for admin access.                   |
| Manual-order cancellation/history         | The same cancellation, visibility, totals, editing, and metadata principles apply where relevant. |

## 17. Remaining Open Decisions

1. Who may cancel an order and until what point.
2. Whether cancellation can be reversed and whether a reason is required.
3. How cancellation after payment affects refunds or payment verification.
4. How cancellation affects rider amounts already reconciled or paid.
5. Whether a separate cancelled-order count is needed.
6. Exact recalculation behavior when the admin edits items, quantities, prices, Internal DF, location, delivery charges, or rider values.
7. Whether original values must be retained after every edit.
8. Whether a detailed audit trail is eventually needed and whether editor identity is recorded.
9. Whether ONLINE PAYMENT verification can be reversed and whether verification time/editor metadata is required.
10. The order-code format, length, generation algorithm, uniqueness scope, expiry, and recovery behavior.
11. When the guest-chat 24-hour window starts and whether activity extends it.
12. What an expired guest sees and whether previous messages remain read-only.
13. Exact admin retention period and deletion policy for messages and payment evidence.
14. Storage, compression, size/type limits, access control, and security for payment images.
15. Whether manual ONLINE PAYMENT orders use the same evidence/verification flow without guest chat.
16. The exact calculated-rider formula.
17. Whether rider adjustment is per order, per day, or both.
18. Whether rider adjustments require reasons, authorization, or their own history.
19. Definition of “today,” including the Philippine-local operational day boundary and later timezone implementation.
20. What happens when an item becomes sold out while in the cart.
21. What happens when a menu expires or is manually deactivated during checkout.
22. How catalog/menu price changes during checkout affect a pending cart.
23. Duplicate-cart behavior, quantity limits, and quantity controls.
24. Exact customer delivery-area selection and possible admin validation.
25. Menu scheduling, edit/republish expiry behavior, and no-active-menu presentation.
26. Exact admin authentication method, account recovery, and session rules.
27. Printer model/protocol, mobile support, pairing, retries, and fallback.
28. Address-book deletion, duplicate handling, history, and additional contact details.
29. Branding asset limits, font-size options, and persistence.
30. Offline/network-loss behavior, retry safety, and duplicate-order prevention.

## 18. Risks and Edge Cases

- Full order editing can change every dependent total; partial recalculation could leave contradictory transaction values.
- Minimal timestamps show that an edit happened but do not explain what changed.
- Editing an order after payment verification can make retained evidence inconsistent with the new total.
- Cancelling an already verified online-payment order introduces an unresolved refund/reconciliation case.
- Cancelling after rider reconciliation may require a separate accounting correction rather than rewriting history.
- A reused, mistyped, or exposed order code could connect a guest to the wrong conversation unless later access rules are carefully designed.
- A 24-hour chat window can expire before an admin reviews payment evidence.
- Retaining payment images creates privacy, security, access-control, and storage-lifecycle obligations.
- Guest-message expiry and payment-evidence retention can diverge, so deletion must distinguish ordinary chat from retained evidence.
- Manual orders may not have a guest conversation through which payment evidence can be submitted.
- A cart or checkout can become stale when an item sells out, a menu expires, or prices change.
- Network retries can duplicate orders, messages, image uploads, edits, or verification actions.

## 19. Recommended Next Phase

Proceed to a final focused Phase 0 business-rules workshop before architecture or UI design. Prioritize:

1. Exact edit recalculation and original-value preservation.
2. Cancellation authority, timing, reversibility, payment/rider consequences, and reasons.
3. Rider calculation and per-order/per-day reconciliation.
4. Guest-chat timing and retained-evidence lifecycle/security.
5. Definition of the Philippine-local operational day.
6. Cart and checkout revalidation after menu, availability, or price changes.

Do not begin database design, UI implementation, authentication, messaging transport, file storage, payment integration, or printer integration until these decisions are sufficiently precise.
