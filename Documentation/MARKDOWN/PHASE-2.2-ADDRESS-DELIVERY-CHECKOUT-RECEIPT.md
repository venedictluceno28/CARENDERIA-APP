# Phase 2.2 — Address, Delivery, Checkout & Receipt

## Purpose

Phase 2.2 completes the guest customer transaction from the Phase 2.1 cart to a trusted order receipt. The browser collects intent and presents results; the existing Supabase checkout operation remains authoritative for menu validity, availability, prices, delivery charges, totals, order codes, and guest access.

## Scope

- Real `/order/address` checkout form using React Hook Form.
- Exact address, delivery-area classification, and CASH / ONLINE PAYMENT selection.
- Review of cart lines and known food subtotal without exposing Internal DF.
- Safe idempotent submission through the existing checkout client.
- Conflict reconciliation for changed prices, unavailable items, and stale menus.
- Secure `/order/receipt/:orderCode` restoration through guest access.
- A `/order/receipt/:orderCode/message` boundary for Phase 2.3.
- Responsive and large-text checkout/receipt styling.

The full messaging interface and payment gateway integration remain out of scope.

## Existing backend contracts used

The implementation uses the existing `checkout` Edge Function, `create_online_order` RPC, guest-session utility, and guest receipt endpoint. No server calculation is reproduced in the browser. The checkout request contains only the published menu ID, published item IDs, quantities, reviewed unit prices, customer details, location intent, payment method, idempotency key, and one-time guest token.

The public menu loader relies on row-level security to expose only the active menu and reads only anonymously granted columns.

## Feature architecture

All ordering work remains within `src/features/customer-ordering`. Checkout-specific pure logic lives in `checkout/`, while route views live with the existing customer-ordering components. Shared API, money-formatting, and guest-session utilities remain in `src/lib`.

## Address form

The form requires a trimmed customer name and exact delivery address. Names are not character-whitelisted, allowing ordinary Unicode names, spaces, apostrophes, and hyphens. Values live only in feature memory while the ordering layout is mounted; they are not added to URLs or persisted in local storage and are cleared after success.

The store address is shown in a compact informational block:

> Phase 1 Block 44 Lot 54, Marycris Complex, Pasong Camachile 2, General Trias, Cavite

## Location selection

An accessible single-select radio-card group provides Marycris Complex, Wellington Place, Elliston Place, and Outside these areas. Nearby values map to `locationClassification: NEARBY` plus the selected area name. Outside maps to `locationClassification: OUTSIDE` with no selected area name.

## Delivery messaging and preview strategy

The page explains that nearby orders can qualify for the commonly advertised “2 ULAM = FREE DELIVERY” promotion and that outside areas add ₱20. Internal DF and rider accounting are never shown.

No trusted preview endpoint existed. Adding one would have required new server calculation plumbing, so V1 deliberately defers it. The review displays the known food subtotal and says delivery is calculated securely when the order is placed. The authoritative receipt displays the accepted delivery charge and grand total.

## Payment method

The selectable methods are exactly CASH and ONLINE PAYMENT. Online payment explains that the order is placed first and that proof must be sent through Messages for manual admin verification. There is no card form, payment gateway, or automatic verification claim.

## Order review

Review shows food names, quantities, reviewed unit prices, food subtotal, entered customer details, selected area, and payment choice. Delivery and estimated grand total remain explicitly subject to secure server calculation.

## Idempotency integration

An attempt coordinator signs the complete checkout intent. Duplicate submissions and uncertain-network retries of the same intent reuse the same idempotency key and guest token. A meaningful intent change creates a new attempt. The button uses React Hook Form's submitting state to prevent duplicate clicks, while backend idempotency remains the actual duplicate-order defense.

## Conflict and error handling

- `PRICE_CHANGED`: applies safe current-price conflicts to the cart and requires explicit review.
- `ITEM_SOLD_OUT` / `ITEM_NOT_FOUND`: marks affected lines unavailable for removal.
- `MENU_INACTIVE` / `MENU_EXPIRED`: invalidates the stale cart and returns to the current menu.
- `INVALID_LOCATION` / `INVALID_PAYMENT_METHOD`: returns errors to the relevant form controls.
- `IDEMPOTENCY_CONFLICT`: discards the incompatible attempt and requests review.
- `NETWORK_ERROR`: retains the attempt and explains that retry is duplicate-safe.
- `RATE_LIMITED`: uses a safe Retry-After value when the browser can read it.
- Other safe failures receive customer-facing language rather than raw API output.

## Successful checkout flow

On authoritative success, the checkout client saves the guest session, the UI records the receipt destination, clears only the completed menu cart, clears the in-memory form draft, and replace-navigates to the receipt. Recording the receipt path before clearing the cart prevents the empty-cart guard from racing the success navigation. Browser back therefore cannot resubmit the checkout POST.

## Guest credential persistence and cart clearing

The existing versioned guest-session utility stores only the order code, guest token, and expiry for the 24-hour window. The token is never displayed, logged, or placed in a URL. Cart data is retained on errors and uncertain outcomes and is cleared only after an authoritative checkout success.

## Receipt design and restoration

The receipt fetches authoritative data with the local guest credential. It shows the order code, customer and delivery information, accepted item snapshots, food subtotal, customer delivery charge, grand total, payment method, and order time. It does not show Internal DF, rider amount, token material, hashes, or admin metadata.

Refresh and direct reopening work while a valid local guest session exists. Missing or expired credentials show a safe expiry state and explain that the order code remains a support reference; the code is never used as authorization.

## Order code and online-payment messaging

The order code is prominent, wrap-safe, and copyable, with explicit wording that it is a reference rather than a password. ONLINE PAYMENT shows Verified or Not Verified and a clear Message Admin action. CASH has no verification status or payment-proof instructions.

## Message Admin boundary

The message action routes to an authenticated-by-guest-session boundary. It verifies that a valid local session exists but intentionally does not implement chat. Phase 2.3 will use the existing guest-access messaging contract.

## Privacy and accessibility

Personal fields are absent from URLs, analytics, and application logs. The form uses explicit labels, fieldsets, radio controls, validation alerts, semantic headings, loading state, and non-color payment text. The copy control has an order-specific accessible label. Receipt restoration uses localized skeletons rather than blocking the whole app.

## Responsive, mobile, and large-font behavior

Checkout is a vertical sequence of separated glass surfaces. Payment cards expand to two columns only when room permits. Long names, addresses, food labels, totals, and order codes wrap; controls maintain mobile tap targets and bottom spacing. Rules at 430px and 350px collapse review rows and receipt actions to prevent horizontal overflow. The implementation uses the existing Normal, Large, and Extra Large root-font preferences.

Exact browser device-metric checks at 320px, 360px, 390px, 430px, and desktop reported `scrollWidth === clientWidth`. A 320px Extra Large text receipt was also visually inspected: the long customer name, order code, verification badge, and actions wrapped without horizontal overflow.

## Files changed

- `src/app/App.tsx`
- `src/styles/index.css`
- `src/features/customer-ordering/CustomerOrderingProvider.tsx`
- `src/features/customer-ordering/cart-context.ts`
- `src/features/customer-ordering/cart.ts`
- `src/features/customer-ordering/types.ts`
- `src/features/customer-ordering/checkout/checkout-flow.ts`
- `src/features/customer-ordering/checkout/receipt-model.ts`
- `src/features/customer-ordering/components/CheckoutPage.tsx`
- `src/features/customer-ordering/components/ReceiptPage.tsx`
- `src/features/customer-ordering/components/MessageBoundaryPage.tsx`
- `src/lib/api/edge.ts`
- `src/lib/api/errors.ts`
- `src/pages/ReceiptPreviewPage.tsx`
- `tests/frontend/checkout-flow.test.mjs`

The obsolete checkout boundary placeholder was removed.

## Frontend tests

Tests cover required form fields, exact request mapping, absence of Internal DF/rider/client totals, nearby/outside mapping, stable intent signatures, same-intent retry reuse, changed-intent attempts, price conflict reconciliation, sold-out reconciliation, defensive conflict parsing, authoritative receipt totals, and payment verification presentation. Existing cart, guest-session, and design-system suites continue to cover persistence and supporting primitives.

## End-to-end local validation

A short-lived, clearly fake local published menu and food item were used against the running local Supabase stack. Headless Chrome completed CASH checkouts with fake customer data. Database inspection confirmed created orders with the expected published item, ₱85.00 food subtotal, ₱15.00 authoritative nearby delivery charge, and ₱100.00 grand total. Guest credentials were not printed or inspected outside the browser.

This run exposed a success-navigation race: cart clearing could cause the empty-checkout guard to replace the receipt route with `/`. The checkout now records the receipt destination before clearing state, so the guard resolves to the receipt. The deterministic frontend suite, lint, formatting, and production build validate the final source. The temporary fixture is local-only and expires automatically.

## Physical-phone LAN validation

The project retains the established `npm run dev:mobile` configuration and mobile Supabase URL setup. A physical phone was not available to this coding environment, so touch keyboard behavior, actual LAN completion, OS-level large-font settings, and back navigation on a real handset require manual confirmation. This is recorded as an honest validation limitation rather than marked as passed.

## Backend and security impact

No backend schema, function, RLS, storage policy, or business-rule changes were required. The browser continues to send customer intent only. No delivery formula or hidden value was moved client-side.

## Risks and limitations

- Delivery has no pre-submit authoritative quote; it is shown after checkout.
- Guest receipt restoration depends on the same browser retaining the 24-hour credential.
- Full messaging and receipt upload are deferred.
- Physical-phone LAN behavior remains a manual test item.

## Recommended next phase

Proceed with **Phase 2.3 — Customer Messaging & Payment Evidence UI**: guest order-linked text/image messages, payment receipt upload, reactions, secure signed-media viewing, payment verification visibility, and clear 24-hour expiry UX. Do not begin it as part of Phase 2.2.
