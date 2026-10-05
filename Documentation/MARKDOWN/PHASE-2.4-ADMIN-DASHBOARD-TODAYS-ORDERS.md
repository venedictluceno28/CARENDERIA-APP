# Phase 2.4 — Admin Dashboard & Today’s Orders

## Purpose

Phase 2.4 gives an active administrator a phone-first workspace for understanding and operating the current Asia/Manila business day. It activates **Today’s Orders** on the existing seven-module dashboard without beginning the other admin modules.

## Scope and architecture

- `/admin` remains the protected dashboard. Today’s Orders is prominent and enabled; ULAM Post, ULAM Photos, Message, Address Book, Manual Order, and Settings remain visible, disabled placeholders.
- `/admin/orders` is protected by the existing `AdminRouteGuard`, which requires an authenticated session and an active `admin_profiles` record.
- `src/features/admin-orders/` owns Manila-date/search/form mapping logic and the operations UI. Admin authentication exposes its session hook through a small public feature boundary; order operations no longer import authentication internals directly.
- `src/lib/api/admin-operations.ts` is the typed browser boundary. Components do not issue raw RPC calls.
- TanStack Query owns list, detail, totals, and private-evidence request state. No Realtime subscription or aggressive polling was added.

## Backend contracts consumed

The browser uses the normal authenticated Supabase client, never a service-role credential.

- Active-admin RLS reads `orders`, `order_items`, and payment-evidence metadata.
- `admin_get_daily_totals` supplies active count, cancelled count, sales, customer delivery, calculated rider, manual adjustment, and final rider values.
- `admin_edit_order` replaces supported current order inputs and lines, then recalculates all derived values server-side. The immutable original snapshot is not sent or edited.
- `admin_cancel_order` and `admin_restore_order` preserve the order and update accounting membership.
- `admin_set_payment_verification` verifies or reverses online payment state.
- `admin_reconcile_rider_day` accepts one signed daily adjustment and returns authoritative totals. Backend validation prevents a negative final rider amount.
- `admin-messaging` `signed_read` provides short-lived access to an existing private payment-evidence object.

No Phase 2.4 schema, RLS, or backend authorization change was needed.

## Today’s Orders behavior

The date label is derived for `Asia/Manila`; filtering and totals remain backend-owned by `business_date`. Orders include online and manual sources and are shown newest-first, which prioritizes newly arrived work on a phone. Search is case-insensitive across customer name and order code.

Cards show the identifying subset: code, local time, customer, source, payment method, grand total, cancellation, and online verification. Cancelled orders stay visible with a textual badge and reduced emphasis. An empty day says “No orders yet today,” while loading and retryable safe-error states use the shared design system.

Daily summaries render backend values directly using the shared peso formatter. Cancelled orders are excluded by `admin_get_daily_totals`, not by client arithmetic.

## Rider reconciliation

The page displays calculated and final rider totals and accepts a single signed peso adjustment. Positive values add and negative values subtract. Input is converted to integer centavos only for transport; the displayed final value always comes from `admin_reconcile_rider_day`. Saving invalidates/refetches the daily summary.

## Detail, edit, and item editing

The responsive shared dialog becomes a large mobile surface. It shows source, created/last-edited time, address and area, payment and verification, cancellation reason, all lines, quantities, unit/subtotals, Internal DF, delivery, grand total, and calculated rider. Guest access tokens and hashes are never queried.

The React Hook Form edit experience loads current values and supports customer/address/location/payment, the transaction’s delivery threshold/base/far-area source values, plus adding, removing, or changing lines, names, categories, quantities, unit prices, and per-unit Internal DF. It never exposes derived arithmetic. Save calls `admin_edit_order`; PostgreSQL recalculates delivery, grand, and rider values, and success refreshes the list, detail, and totals. Closing a dirty form requires discard confirmation.

## Cancellation, restoration, and verification

Cancellation has an explicit confirmation and optional reason. Restoration also requires confirmation. Both keep the record visible and refresh all affected queries. Online payments expose Verify and Reverse Verification actions and display the verified time when present. Cash orders have no verification status or control.

If non-deleted payment evidence exists, the detail view offers **View private image**. The file is fetched only after that action through a short-lived signed URL; no bucket or object is made public.

## Query invalidation and refresh

Edits, cancellation, restoration, and verification invalidate the order list, selected detail, and daily totals. Rider adjustment refreshes totals. Default TanStack Query window-focus behavior catches orders created while the tab is in the background. There is no polling or Realtime subscription.

## Mobile, large text, and accessibility

The page uses expandable cards instead of a wide table, large labeled controls, wrapped badge groups, and responsive one/two/three-column layouts. At narrow widths, facts stack rather than overflowing and primary detail actions become full width. The existing Normal/Large/Extra Large root text preference naturally expands cards and forms. Important status is always textual rather than color-only. Form controls are labeled, detail loading is announced, errors use alerts, and confirmation regions identify their purpose.

## Security

- Anonymous users are redirected to `/admin/login`.
- Authenticated users without an active admin profile are denied by the route guard and backend authorization.
- Reads remain covered by active-admin RLS; mutations remain covered by trusted admin RPC checks.
- No guest secret, hash, service-role value, public evidence URL, or raw database error enters this UI.
- Existing original snapshots, RLS, and private storage policies were unchanged.

## Files changed

- `src/app/App.tsx`
- `src/features/admin-auth/components/AdminShellPage.tsx`
- `src/features/admin-orders/components/AdminOrdersPage.tsx`
- `src/features/admin-auth/admin-modules.ts`
- `src/features/admin-auth/index.ts`
- `src/features/admin-orders/model.ts`
- `src/lib/api/admin-operations.ts`
- `src/styles/index.css`
- `tests/frontend/admin-orders.test.mjs`
- this document

## Validation

Frontend coverage checks the seven dashboard modules and sole enabled route, Asia/Manila date boundary, online/manual and active/cancelled search, name/code search, CASH versus online verification actions, list/detail/totals query identities, signed positive/negative rider conversion, current-value edit mapping, preservation of item references/Internal DF and delivery inputs, omission of client-authoritative totals, and invalid edit rejection. The full frontend suite, ESLint, TypeScript/Vite production build, and Prettier check are required before handoff.

The build validates the protected route and compiled API contracts. Local browser operational validation should use clearly fake cash and online orders to exercise search, detail, edit/recalculation, cancel/restore, verify/reverse, rider adjustment, and payment evidence. The available environment did not provide a safely authorized local admin credential to automated Chrome, so mutation-level browser automation remains a manual follow-up; backend admin RPC behavior was already validated in Phase 1.1 and the frontend mappings are covered here.

A physical phone was not connected for this run. Follow up with `npm run dev:mobile` on 320/360/390/430-width hardware, including Extra Large text and the complete admin sequence above.

## Risks and limitations

- The list uses client-side search over today’s loaded order set; server search/pagination may be needed only when daily volume warrants it.
- There is intentionally no live subscription; returning focus refreshes stale data.
- The original snapshot has no read-only comparison UI yet.
- Only the first payment-evidence item is presented in this focused order view.
- Unfinished dashboard modules remain disabled by design.

## Recommended next phase

Proceed to **Phase 2.5 — ULAM Photos / Catalog Management**: create, photograph, price, categorize, set Internal DF, edit, archive, and search reusable food items. Today’s Menu publishing should follow in a later phase. Do not begin either automatically.
