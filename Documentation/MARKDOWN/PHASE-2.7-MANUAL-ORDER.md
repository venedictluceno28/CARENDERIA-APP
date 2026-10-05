# Phase 2.7 — Manual Order

## Purpose

Phase 2.7 gives an active administrator a phone-first way to record orders received through Messenger, phone calls, walk-ins, or another external channel. A manual order enters the same trusted order ledger as customer-web checkout and therefore participates in Today’s Orders, daily sales, delivery and rider calculations, editing, cancellation/restoration, and payment verification.

## Scope

This phase activates **MANUAL ORDER** on the admin dashboard and adds the protected `/admin/manual-order` route. The workflow captures a customer name, exact address, established delivery area, one or more structured item rows, and Cash or Online Payment. It provides optional catalog assistance, a non-authoritative totals preview, trusted submission, and a success summary with the generated order code.

It does not create guest access, customer messaging, a receipt session, an alternative ledger, free-form order notes, a current-menu dependency, or a new manual-order schema.

## Existing trusted backend contract

No database migration was necessary. Phase 1.1 already supplied `admin_create_manual_order(jsonb,text,text,text,text,text)`, and that operation remains the sole creation boundary. It:

- requires an authenticated active admin;
- validates 1–50 explicit item rows, customer/address length, exact location values, payment method, categories, quantities, integer centavos, and non-negative prices/Internal DF;
- reads current delivery settings on the server;
- recalculates food, Internal DF, base delivery, outside-area charge, grand total, and rider amount;
- generates the unique order code;
- writes `source = 'MANUAL'`, `published_menu_id = null`, and no guest token/chat expiry;
- initializes online payments as `NOT_VERIFIED` while Cash has no verification state;
- stores `original_snapshot` and order-item transaction snapshots atomically.

The browser never submits derived totals, a source override, a guest credential, or a published-menu requirement.

## Feature architecture

`src/features/admin-manual-order/` owns the form types, catalog/settings query boundary, trusted draft mapping, preview projection, mutation, success state, and page components. It does not import admin-catalog, admin-menu, admin-orders, or customer-ordering internals.

The exact nearby-area contract and admin-order query identities were moved into neutral shared modules:

- `src/lib/delivery-areas.ts`
- `src/lib/admin-order-queries.ts`

Existing features re-export or consume those neutral definitions so there is one area list and one Today’s Orders invalidation identity.

## Protected route and dashboard integration

The dashboard’s existing **MANUAL ORDER** action now links to `/admin/manual-order`. `AdminRouteGuard` protects the route and requires the same authenticated, active `admin_profiles` record as the other admin workspaces. The RPC independently repeats authorization.

## Mobile-first workflow

The page follows a single vertical sequence:

1. Customer name, exact address, and delivery area
2. Optional quick-add from ULAM PHOTOS
3. Explicit editable order items
4. Payment choice
5. Review and trusted save

The layout stays stacked on phones instead of becoming a dense POS grid. Primary actions use touch-sized controls, item cards wrap long content, and the save summary remains reachable while scrolling.

## Customer and location

Customer name and exact address are trimmed, required, Unicode-friendly, and constrained to the backend’s 160- and 1,000-character limits. Delivery area uses exactly:

- Marycris Complex
- Wellington Place
- Elliston Place
- Outside these areas

The first three map to `location_classification = 'NEARBY'` plus the exact selected area name. Outside maps to `location_classification = 'OUTSIDE'` and `selected_area_name = null`.

## Catalog assistance and free-form items

The optional catalog search reads only active (`is_archived = false`) ULAM PHOTOS rows through a feature-owned typed query. Adding one pre-fills name, category, current price, and current Internal DF. The resulting row remains editable and is submitted using manual-order item semantics; no catalog or published-menu linkage is sent to the RPC.

The page always begins with a free-form item and can add more. This preserves manual entry when there is no active menu, when a quoted item is not in the catalog, or when an earlier catalog source is archived.

Each row explicitly captures name, ULAM/DESSERTS/EXTRAS category, positive whole-number quantity, non-negative unit price, and non-negative Internal DF. Peso strings accept at most two decimal places and convert to safe integer centavos before mutation.

## Totals preview and authority

The page reads current delivery settings and previews the four established cases:

- nearby and Internal DF below ₱20: ₱15 base delivery;
- nearby and Internal DF at/above ₱20: no delivery charge;
- outside and Internal DF below ₱20: ₱15 base plus ₱20 outside-area charge;
- outside and Internal DF at/above ₱20: ₱20 outside-area charge only.

The review separates food subtotal, Internal DF, base delivery, outside-area charge, customer delivery, grand total, and rider amount. It is explicitly labeled as an estimate. The backend re-reads settings and calculates every authoritative stored total.

## Payment behavior

Cash and Online Payment are the only choices. Cash orders retain a null verification state. Online-payment orders begin **Not Verified** and can use the existing Today’s Orders verification/reversal controls. Manual creation never implies verification.

## Submission and success

React Hook Form manages field and dynamic-item state. The create mutation disables repeated submission while pending. On success, the page displays the generated order code, customer, authoritative grand total, and payment state, with actions to open Today’s Orders or create another order.

The mutation invalidates the current Manila-date order list and daily totals. On a failed or uncertain network response it also invalidates both queries and tells the owner to inspect Today’s Orders before retrying, because the established manual RPC has no idempotency key.

## Today’s Orders lifecycle

No duplicate order-management UI was introduced. Once created, the order is immediately handled by the existing Phase 2.4 tools. Manual source remains visible, and the owner can inspect trusted totals, edit fields/items, cancel with a reason, restore, and verify online payment. Editing recalculates current values while preserving `original_snapshot`; cancellation excludes the order from active daily totals and restoration includes it again.

## Loading, empty, error, and success states

The catalog has loading skeletons, a retryable safe error, and an empty/search-no-match state that keeps custom entry available. A settings-query failure disables only the convenience preview; trusted saving can still proceed. Form errors are actionable, mutation errors do not expose raw SQL, and the success state uses authoritative RPC output.

## Accessibility and responsive behavior

Inputs use visible labels, required markers, native numeric/select semantics, and descriptive field errors. Payment choices retain native radio behavior. Sections have labelled headings, destructive/order-state feedback is textual, icon-only actions have accessible labels, and success/error content uses live roles.

Automated browser checks found no horizontal overflow at 320, 360, 390, 430, or 1,440 pixels, including 320 pixels with Extra Large text. Long content wraps, item actions remain operable, and the sticky save block remains touch-accessible.

## Security and privacy

- Route, RLS, and RPC authorization require an active admin.
- Manual orders use `source = 'MANUAL'` and cannot masquerade as online checkout.
- No guest token, guest chat expiry, customer receipt credential, or token-bearing URL is created.
- Only explicit intent fields and structured item values reach the RPC; derived totals are omitted.
- Catalog assistance reads active admin-visible catalog values but creates no menu dependency.
- Safe error mapping prevents raw database details from reaching the UI.

## Files changed

- `src/app/App.tsx`
- `src/features/admin-auth/admin-modules.ts`
- `src/features/admin-manual-order/api/admin-manual-order.ts`
- `src/features/admin-manual-order/components/AdminManualOrderPage.tsx`
- `src/features/admin-manual-order/model.ts`
- `src/features/admin-manual-order/types.ts`
- `src/features/admin-orders/model.ts`
- `src/features/customer-ordering/types.ts`
- `src/lib/admin-order-queries.ts`
- `src/lib/delivery-areas.ts`
- `src/styles/index.css`
- `tests/frontend/admin-manual-order.test.mjs`
- `tests/frontend/admin-orders.test.mjs`
- `tests/local/phase-2-7-admin-fixture.sql`
- `tests/local/phase-2-7-browser-check.mjs`
- this document

## Automated validation

The frontend suite covers dashboard activation, separate query identities, catalog prefill, exact free-form RPC mapping, trimming and integer-centavo conversion, absence of guest/derived fields, outside-area mapping, Cash/Online Payment intent, invalid customer/location/item/money rejection, and every delivery threshold/area preview case.

The unchanged Phase 1.1 pgTap suite remains the backend regression contract for manual creation, authorization, trusted arithmetic, manual-only source semantics, snapshot preservation after edit, Cash-to-online verification initialization, verification/reversal, cancellation/restoration, and daily active totals. The complete database suite is run after this phase because the feature deliberately reuses those operations.

## Local end-to-end validation

A transient synthetic active admin and active fake catalog row were used against local Supabase. Headless Chrome passed protected login, dashboard navigation, catalog search/prefill, simultaneous catalog and custom item entry, nearby Cash totals, trusted creation, generated order code, immediate Today’s Orders discovery, manual-source display, edit, original-snapshot preservation through authenticated database read, cancellation and daily-count decrement, restoration and daily-count recovery, outside-area Online Payment totals, initial Not Verified display, and verification through existing order tooling.

The Cash case produced ₱165 food, ₱15 Internal DF, ₱15 customer delivery, ₱180 grand total, and ₱30 rider. The outside online case produced ₱50 food, ₱20 Internal DF, ₱20 outside-area delivery, ₱70 grand total, and ₱40 rider. No token appeared in the URL.

## Physical-phone validation

A physical phone was not connected for this run. Follow-up on the target device should use `npm run dev:mobile` and verify keyboard types, long address entry, catalog scrolling, add/remove item reachability, payment choice, sticky-save overlap while the keyboard is open, success actions, and Extra Large text.

## Risks and limitations

- Manual creation has no idempotency key. The UI prevents concurrent double-clicks and reconciles Today’s Orders after an uncertain response, but the owner must check the list before retrying.
- The totals preview mirrors current server settings for convenience; a settings change between preview and submission can make the authoritative result differ, which is why the success state uses RPC output.
- Catalog assistance intentionally excludes archived items and has no current-menu assist; free-form entry covers both cases without coupling manual orders to publication.
- A dedicated note field, receipt printing, customer messaging, and address reuse remain outside this phase.
- The production bundle retains the existing greater-than-500-kB advisory; route-level code splitting can be considered separately.

## Recommended next phase

Proceed to **Phase 2.8 — Address Book**. It should reuse trusted customer/address semantics, keep exact addresses explicit, define careful duplicate/search behavior, and integrate with Manual Order and checkout only through neutral boundaries. Do not begin it automatically.
