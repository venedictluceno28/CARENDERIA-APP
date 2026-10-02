# CARENDERIA-APP — Phase 0.2

## Product & Business Rule Decisions

## 1. Purpose

This document records the product decisions confirmed after Phase 0.1. It resolves selected ambiguities without defining database tables, application code, UI details, authentication implementation, or printer protocols.

The product continues to prioritize a simple mobile experience for customers and a highly readable, low-complexity mobile admin experience for the carenderia owner.

## 2. Confirmed Product Decisions

1. `ULAM PHOTOS` is the reusable catalog for items in all three categories: ULAM, DESSERTS, and EXTRAS.
2. Each reusable catalog item conceptually has a name, food price, category, photo, and internal delivery allocation.
3. `ULAM POST` is the customer-facing published menu. The owner builds it by selecting reusable catalog items.
4. Reusable catalog items, published menu entries, and order items are distinct layers.
5. Published menus and orders preserve snapshots of the relevant item information. Later catalog changes must not rewrite menus or historical orders.
6. Orders support multiple units of an item.
7. Delivery money is separated into internal delivery allocation, customer-facing delivery charge, and additional far-area charge.
8. The nearby free-delivery promotion depends only on the total quantity of ULAM items.
9. CASH and ONLINE PAYMENT are order classifications in the first version; no integrated payment gateway will be used.
10. Guest ordering is the primary customer flow. Customer authentication is optional future scope.
11. The deployed admin area must eventually require authentication, although its implementation is deferred.
12. Receipt generation must remain separate from the future Bluetooth printer integration.
13. Branding remains configurable through carenderia name, logo, a default logo placeholder, and font-size preference.

## 3. Catalog → Published Menu → Order Model

The product has three distinct conceptual layers:

```text
Reusable Catalog
      ↓ selection and snapshot
Published Menu
      ↓ customer selection and snapshot
Order
```

### Reusable Catalog (`ULAM PHOTOS`)

The owner maintains reusable items from ULAM, DESSERTS, and EXTRAS. Each item conceptually contains:

- Name
- Food price
- Category
- Photo
- Internal delivery allocation

The catalog is an operational source for preparing a menu. Its current name is retained, although it covers more than ULAM.

### Published Menu (`ULAM POST`)

The owner selects catalog items to prepare the active customer-facing menu. The published menu eventually snapshots the item information required to display and sell that menu independently of later catalog changes.

Existing rules remain:

- Only one active menu post exists at a time.
- A menu post has a maximum lifetime of 24 hours.
- The owner can delete the menu post.
- The menu post must contain an image.
- Items are categorized as ULAM, DESSERTS, or EXTRAS.

### Order

An order snapshots the item name, category, unit price, quantity, and other relevant values that applied when the order was created. Historical orders must remain accurate after:

- Menu expiration
- Menu deletion
- Catalog item deletion
- Catalog price changes
- Catalog item edits

This is a product rule, not a database design. Exact storage structures will be decided later.

## 4. Quantity Behavior

Orders support quantities, including multiple units of the same item. Each conceptual order item needs:

- Item information
- Quantity
- Unit price
- Item subtotal

The calculation is:

```text
item subtotal = quantity × unit price
```

Example: Pork Adobo at ₱80 × 2 has an item subtotal of ₱160.

The exact mobile controls for changing quantities remain a design-phase decision. Duplicate cart behavior and quantity limits also remain open.

## 5. Delivery Business Model

### Store location

The carenderia is located at:

Phase 1 Block 44 Lot 54  
Marycris Complex  
Pasong Camachile 2  
General Trias, Cavite

### Nearby promotional areas

The nearby promotional areas are:

- Marycris Complex
- Wellington Place
- Elliston Place

### Distinct delivery concepts

Delivery-related money must not be represented as one generic fee:

1. **Internal delivery allocation:** An operational amount associated with catalog/order items. It is not added to the displayed food price.
2. **Customer-facing delivery charge:** The delivery amount shown to and charged to the customer.
3. **Additional far-area charge:** The additional ₱20 applied outside the three promotional areas under the currently confirmed ULAM rules.

For ULAM, the current business rule/example is a ₱10 internal allocation per ULAM unit. This value must eventually be configurable or data-driven rather than embedded permanently in application logic.

### Promotion qualification

Only ULAM quantities count toward the two-ULAM free-delivery threshold. DESSERTS and EXTRAS do not count toward it.

For example, `1 ULAM + 1 EXTRA` remains a one-ULAM order for delivery-promotion purposes.

### Address/delivery experience

The future address page must:

- Show the store address.
- Explain the free-delivery promotion.
- List Marycris Complex, Wellington Place, and Elliston Place as nearby promotional areas.
- Let the customer clearly identify one of those areas or state that the address is outside them.
- Make the additional ₱20 far-area charge difficult to misunderstand.

The exact control—radio choices, select options, checkbox, or another simple mobile control—is not decided. The design must not change the business rule.

## 6. Delivery Rule Table

The following customer-facing rules are confirmed for orders containing at least one ULAM:

| Location                 | ULAM quantity | Base charge | Far-area charge | Customer-facing delivery charge |
| ------------------------ | ------------- | ----------- | --------------- | ------------------------------- |
| Nearby promotional area  | 1             | ₱15         | ₱0              | ₱15                             |
| Nearby promotional area  | 2+            | ₱0          | ₱0              | FREE / ₱0                       |
| Outside promotional area | 1             | ₱15         | ₱20             | ₱35                             |
| Outside promotional area | 2+            | ₱0          | ₱20             | ₱20                             |

The two-ULAM promotion removes the base delivery charge. It does not remove the additional far-area charge.

Orders with zero ULAM are not covered by this table and remain an open decision.

## 7. Rider/Internal Delivery Accounting Distinction

The rider should earn approximately a minimum of ₱20 per delivery. Internal allocations and customer-facing charges contribute to the delivery-related amount, but they remain separate business concepts.

Examples under the current ₱10 internal allocation per ULAM unit:

| Scenario        | Internal allocation | Customer charge | Delivery-related amount |
| --------------- | ------------------- | --------------- | ----------------------- |
| Nearby, 1 ULAM  | ₱10                 | ₱15             | ₱25                     |
| Nearby, 2 ULAM  | ₱20                 | ₱0              | ₱20                     |
| Outside, 1 ULAM | ₱10                 | ₱35             | ₱45                     |
| Outside, 2 ULAM | ₱20                 | ₱20             | ₱40                     |

“FREE DELIVERY” describes the customer's charge, not the rider's earnings. Internal allocation must not be combined with or presented as part of the food price.

How the delivery-related amount becomes an actual rider payout or accounting entry remains open.

## 8. Online Payment Behavior

The first version will not integrate GCash, Maya, card processors, or another payment gateway.

Payment method is an order classification:

- CASH
- ONLINE PAYMENT

If ONLINE PAYMENT is selected:

1. The customer completes the order.
2. Payment takes place externally.
3. The customer opens the application's messaging feature.
4. The customer sends a photo or screenshot of the payment receipt.
5. The admin reviews the submitted image.

The system must not imply automatic verification. Whether the admin can manually mark an order as paid or verified remains open.

## 9. Authentication Scope

### Customer

- A customer does not need an account to order.
- Guest ordering is a primary first-version flow.
- Customer login is not required for the initial implementation.
- Customer accounts remain possible future functionality once their benefits and behavior are defined.

### Admin/owner

- The deployed admin area must not be publicly accessible.
- Admin authentication is required before production deployment.
- The exact approach is deferred to the authentication/architecture phase.
- Supabase Auth may be evaluated later, but is not selected or implemented by this decision.

## 10. Bluetooth Printing Status

The printer model is not yet known, so no browser API, protocol, or platform approach is selected.

The intended conceptual separation is:

```text
Order
  ↓
Receipt data
  ↓
Receipt renderer
  ↓
Printing integration/adapter
  ↓
Bluetooth thermal printer
```

Receipt generation must work independently of printer integration. When the printer arrives, the brand, model, protocol, supported phone operating systems, pairing method, and documentation must be reviewed before implementation.

## 11. Branding Requirements

The owner will eventually be able to configure:

- Carenderia name
- Carenderia logo
- Font-size preference

A default logo placeholder is required when no custom logo exists. The UI, file limits, allowed formats, font-size range, and persistence behavior remain design/architecture decisions.

## 12. Phase 0.1 Decisions Resolved

| Phase 0.1 question                     | Confirmed resolution                                                                                     |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Menu post model                        | A published menu is built from selected reusable catalog items and also retains the required post image. |
| Menu post / `ULAM PHOTOS` relationship | `ULAM PHOTOS` is the reusable catalog; selected items are snapshotted into the published menu.           |
| Food images                            | Every reusable catalog item has a photo, and the menu post must also contain an image.                   |
| Ordering quantities                    | Quantities are supported; order items preserve quantity, unit price, and subtotal.                       |
| Pricing snapshots                      | Published menus and orders preserve applicable item information and prices.                              |
| Delivery fee concept                   | Internal allocation, customer charge, and far-area charge are distinct.                                  |
| ULAM-based delivery charges            | The four nearby/outside and one/two-plus ULAM rules are confirmed.                                       |
| Online payment                         | It is an external payment classification, not an integrated gateway in version one.                      |
| Customer account scope                 | Guest ordering is primary; customer authentication is deferred/optional future scope.                    |
| Admin authentication requirement       | Authentication is mandatory for a deployed admin area; implementation is deferred.                       |
| Receipt printing architecture          | Receipt generation is separated from a printer adapter; printer specifics await the physical device.     |

The quantity decision also resolves the Phase 0.1 question about whether multiple units can be ordered, but it does not determine the quantity-control UI or cart merging behavior.

## 13. Remaining Open Decisions

1. What customers see when the 24-hour menu expires.
2. Whether editing or republishing a menu resets its 24-hour lifetime.
3. Whether menu posts can be scheduled.
4. Sold-out/unavailable item behavior.
5. Duplicate-cart behavior, quantity limits, and quantity-control interaction.
6. Customer-facing delivery charges for zero-ULAM orders: dessert-only, extras-only, and DESSERTS + EXTRAS.
7. Internal delivery allocations for DESSERTS and EXTRAS and how they affect rider accounting.
8. How actual rider payout is calculated and recorded.
9. The exact area-selection control and whether address claims require admin validation.
10. Whether an admin manually marks external online payments as submitted, verified, paid, or rejected.
11. Order statuses, payment statuses, delivery statuses, cancellations, and refunds.
12. Order-editing limits, recalculation rules, audit history, and customer notification.
13. Order-code format, uniqueness, lifetime, and recovery.
14. Definition of “today,” accounting inclusion rules, and treatment of fees/cancelled/unpaid orders.
15. Guest conversation identity, order association, and exact 24-hour deletion semantics.
16. Customer-account benefits and behavior if customer authentication is introduced later.
17. Admin authentication method, account recovery, session rules, and number of admin accounts.
18. Address-book duplicates, deletion, history, and whether contact details are needed.
19. Printer model, protocol, supported mobile platform, pairing, retry, and fallback behavior.
20. Branding file limits, font-size choices, and settings persistence.
21. Offline and unreliable-network behavior.

## 14. Risks and Edge Cases Discovered

- A zero-ULAM order has no confirmed customer delivery charge, so checkout cannot safely calculate every valid cart yet.
- Customer-selected delivery area can be inaccurate or misunderstood, especially near area boundaries.
- A configurable internal allocation can change over time; orders must preserve the allocation that applied when created if historical delivery accounting depends on it.
- “Approximately ₱20 minimum” is not yet a complete rider-payout formula and can conflict with future item combinations.
- Editing an order can change ULAM quantity and therefore move the order between delivery-charge tiers.
- A menu or catalog deletion must never remove information required by historical orders.
- External payment screenshots can be missing, duplicated, unreadable, or associated with the wrong guest/order.
- Messaging expiration could delete payment evidence unless retention and payment-review rules are coordinated.
- Calling a delivery “free” without showing that the far-area charge still applies could mislead customers outside the promotional areas.
- Browser Bluetooth support varies by device, operating system, browser, and printer protocol.

## 15. Recommended Next Phase

Complete a focused Phase 0.3 business-rules workshop before database or UI design. Prioritize decisions that block correct totals and order handling:

1. Zero-ULAM delivery rules and DESSERTS/EXTRAS internal allocations.
2. Order, payment, delivery, cancellation, and editing lifecycles.
3. Daily accounting definitions and rider-payout calculation.
4. Guest messaging identity, payment-evidence retention, and expiration.
5. Menu expiration/editing and sold-out behavior.

After those rules are confirmed, information architecture and screen-state design can proceed with fewer costly revisions. Database design, authentication implementation, UI implementation, and Bluetooth integration remain out of scope for this phase.
