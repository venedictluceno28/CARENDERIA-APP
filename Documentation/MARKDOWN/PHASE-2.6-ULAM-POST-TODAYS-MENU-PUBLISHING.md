# Phase 2.6 — ULAM POST / Today’s Menu Publishing

## Purpose

Phase 2.6 lets the store owner assemble today’s customer menu from the reusable ULAM PHOTOS catalog, publish it safely, control item availability during service, preview the customer-visible result, and deactivate the menu without deleting history.

## Scope

This phase activates **ULAM POST** on the admin dashboard and adds the protected `/admin/menu` workflow. It includes active-menu status, active catalog selection, a required menu-level image, atomic catalog snapshot publication, server-authored 24-hour expiry, per-published-item SOLD OUT/AVAILABLE controls, customer-safe preview, and confirmed manual deactivation.

It does not merge ULAM POST with ULAM PHOTOS, create a full menu-history manager, or implement Manual Order, Address Book, full Admin Messages, Settings, printing, promotions, or analytics.

## Domain relationship

The established three-layer model remains intact:

- `catalog_items` is the mutable reusable source.
- `published_menu_items` is the immutable-value snapshot for one menu, except for that menu’s reversible `is_sold_out` state.
- `order_items` is the historical transaction snapshot.

Publication copies catalog ID, name, category, customer price, Internal DF, and photo path into the existing published-menu item columns. Later catalog edits affect only future publication. Deactivation and sold-out changes never archive a catalog item or rewrite an order.

## Backend contracts used

The physical menu schema, one-current-menu partial unique index, maximum-24-hour check constraint, active-menu anonymous RLS, catalog RLS, and `public-assets` bucket already existed. The missing trusted operations were added:

- `admin_get_active_menu()` returns the server-current admin menu and its item snapshots, including admin-only Internal DF.
- `admin_authorize_menu_image_upload(menu_id)` requires an active admin and allocates only `menus/{menu-id}/`.
- `admin_publish_menu(menu_id, image_path, catalog_item_ids[])` serializes publishing, retires an expired current marker, rejects another live menu, validates every selected item is active, creates the menu with server timestamps, and snapshots all selected rows in one transaction.
- `admin_deactivate_menu(menu_id)` clears current state and records deactivation without deleting data.
- `admin_set_menu_item_sold_out(item_id, state)` changes only an item belonging to the current unexpired menu.
- `admin-menu-publish` validates authenticated multipart input, rate limits, verifies JPEG/PNG/WebP signatures and the 5 MiB limit, uploads with the server-only service credential, invokes the trusted publish RPC, and deletes the new object on publish failure when cleanup succeeds.

Direct authenticated insert/update grants on published menu tables were revoked so application admins cannot bypass the trusted boundaries.

## Feature architecture

`src/features/admin-menu/` owns admin menu types, selection and preview projections, API mapping, queries/mutations, and the operational page. It reads catalog data through its own typed boundary and does not import admin-catalog internals.

Exact menu categories, product-image validation, and the customer active-menu query identity moved to neutral shared modules under `src/lib/`. The customer ordering feature re-exports its category contract for compatibility.

## Admin route and dashboard integration

The existing **ULAM POST** action is enabled and links to `/admin/menu`. The route uses the existing `AdminRouteGuard`, requiring an authenticated session and active `admin_profiles` record. RPCs and the Edge function independently repeat active-admin authorization.

## Active-menu state

The page uses a server-time RPC instead of the browser clock. With no active unexpired menu, it presents **No active menu** and the creation workflow. A live menu shows its menu image, Manila-formatted publish and expiry times, item count, customer preview, deactivation, and the published item list. Expired menus are not returned as active; the next trusted publish retires an expired `is_current` marker before creating the new row.

## Catalog selection

Only `catalog_items.is_archived = false` rows are loaded. Items are grouped in the exact order ULAM, DESSERTS, EXTRAS. Large selectable cards show the food photo or fallback, name, category grouping, customer price, and admin-only Internal DF. `aria-pressed`, an explicit Selected label/icon, border, and background make state clear without relying only on color. At least one unique current catalog ID is required.

## Snapshot behavior

The browser sends only the selected catalog UUIDs, menu UUID, and image file. It never sends snapshot names, prices, Internal DF, or food photo paths. PostgreSQL locks the publication operation, re-reads active catalog rows, and copies authoritative values in selected order. Archived, missing, duplicate, empty, or oversized selections are rejected.

## Price and Internal DF snapshots

`unit_price_centavos` and `internal_df_centavos` are copied directly from trusted integer-centavo catalog columns. Editing the catalog after publication does not change the active or historical menu. Customer payloads and preview projections omit Internal DF; it remains visible on the admin selection and active-menu cards only.

## Menu image

The menu-level image is separate from per-food photos and is required. The picker supports gallery/camera-capable browser selection without forcing capture, preview, replacement, removal, JPEG/PNG/WebP, and 5 MiB client validation. The Edge function repeats MIME, size, and magic-byte validation. Public reads use the intended `public-assets` product-image bucket; direct browser writes are not granted.

## Publish flow

The owner selects active food, chooses a menu image, reviews the selected count, and presses **Publish menu**. The action disables while pending. The Edge function authorizes the admin, uploads a generated non-overwriting object path, and calls the atomic snapshot RPC. On authoritative success, admin active-menu, catalog-selection, and customer active-menu queries are invalidated and explicit success feedback appears.

If the network result is uncertain, the UI invalidates/refetches active-menu state before making another publish practical. It does not optimistically create a local menu.

## One-active-menu enforcement

`admin_publish_menu` takes a transaction advisory lock and checks the existing current marker. The existing partial unique index remains a second database-level guarantee. A second live publish raises `MENU_ACTIVE_EXISTS`; there is no silent replacement. The owner must deactivate the current menu first.

## 24-hour expiry

`activated_at` comes from `statement_timestamp()` and `expires_at` is exactly 24 hours later. The existing database constraint also rejects any lifetime longer than 24 hours. Customer RLS, explicit customer filters, checkout validation, and the admin RPC all require an unexpired window. Customer activity cannot extend expiry.

## Manual deactivation

Deactivation requires a focused confirmation explaining customer impact and historical preservation. The trusted RPC sets `is_current = false` and `deactivated_at` using server time. Menu rows, item snapshots, and existing orders remain.

## SOLD OUT and AVAILABLE

Each live published item shows textual **Available** or **SOLD OUT** state and one large action. The trusted RPC confirms the item belongs to the current unexpired menu. Toggling never archives or edits its source catalog row. Admin and customer active-menu queries are invalidated after success, while checkout remains authoritative if a customer has stale cart state.

## Customer impact and active-menu query hardening

The customer query continues to read only customer-safe menu and item columns. It now also expresses `is_current`, activation, expiry, and deactivation filters explicitly. This matters when an active admin opens the customer route in the same authenticated browser: admin RLS can see history, so relying only on anonymous RLS could select an old row. Anonymous users received only the two additional menu state-column privileges needed to express this predicate; RLS still restricts their visible rows to the active window.

No active menu retains the existing customer empty state. Sold-out state appears after refresh/refetch, cart reconciliation preserves the line but blocks stale purchase, and deactivation removes the menu from customer reads.

## Customer preview

The modal preview projects a separate customer-safe shape containing food name, category, price, photo, and availability only. It contains no Internal DF property, source catalog ID, sort metadata, rider calculation, or admin control. The preview and customer page both provide resilient image fallbacks.

## Query invalidation

TanStack Query uses separate active-menu and active-catalog identities. Publish, deactivate, and availability changes invalidate the admin active-menu key and the shared customer active-menu key. Publish/deactivate refresh catalog selection as well. Manual Refresh reconciles both admin queries. There is no aggressive polling on the admin page.

## Loading, empty, and error states

The page provides active-menu skeletons, catalog selection skeletons, retryable safe errors, a no-active-menu creation state, and an empty-catalog action leading to ULAM PHOTOS. Field feedback covers missing selection, missing/invalid/empty/oversize image, and server failure. Raw SQL errors and service credentials are never rendered.

## Network uncertainty

Menu rows and snapshots are never assembled optimistically in React. A failed/unknown Edge response triggers active-menu reconciliation. The Edge function attempts to delete a newly uploaded menu object when the trusted publish RPC fails, reducing orphaned media without ever deleting historical images.

## Mobile UX and large-font behavior

The workflow uses stacked phone layouts, full-width actions, large selection cards, decimal-free snapshot display, a visible sticky publish review, wrapping timestamps, and large availability controls. Automated review found no horizontal overflow at 320, 360, 390, 430, or 1440 pixels, including 320 pixels with Extra Large text. Long names and timestamps wrap, and the publish/deactivate buttons remain reachable.

## Accessibility

The menu image input is labeled through its visible picker and error association. Selection buttons expose `aria-pressed` plus text. Status is textual, not color-only. Native dialogs manage focus and Escape. Images have useful alternative text and an announced unavailable-image fallback. Headings remain hierarchical, status/error regions are live, and all primary controls have descriptive labels.

## Security

- Route, RLS, RPCs, and Edge authorization require an authenticated active admin.
- Anonymous users cannot authorize uploads, publish, deactivate, mutate availability, or read Internal DF.
- Application admins cannot directly insert/update published-menu tables.
- The service-role key remains only inside the Edge runtime.
- Menu object paths are scoped to a server-approved menu UUID and generated filename.
- Public reads expose only intended product images and customer-safe menu fields; private messaging/evidence buckets were unchanged.
- Publishing is serialized, transactionally snapshots active catalog rows, and preserves menu/order history.

## Files changed

- `src/app/App.tsx`
- `src/features/admin-auth/admin-modules.ts`
- `src/features/admin-catalog/model.ts`
- `src/features/admin-catalog/types.ts`
- `src/features/admin-menu/api/admin-menu.ts`
- `src/features/admin-menu/components/AdminMenuPage.tsx`
- `src/features/admin-menu/model.ts`
- `src/features/admin-menu/types.ts`
- `src/features/customer-ordering/api/public-menu.ts`
- `src/features/customer-ordering/hooks/use-active-menu.ts`
- `src/features/customer-ordering/types.ts`
- `src/lib/image-upload.ts`
- `src/lib/menu-category.ts`
- `src/lib/query-keys.ts`
- `src/styles/index.css`
- `supabase/config.toml`
- `supabase/functions/_shared/messaging.ts`
- `supabase/functions/admin-menu-publish/index.ts`
- `supabase/migrations/20261004000000_phase_2_6_admin_menu_publishing.sql`
- `supabase/migrations/20261004010000_phase_2_6_customer_active_menu_filter.sql`
- `supabase/tests/database/phase_2_6_admin_menu_publishing.sql`
- `tests/frontend/admin-menu.test.mjs`
- `tests/frontend/admin-orders.test.mjs`
- `tests/local/phase-2-6-admin-fixture.sql`
- `tests/local/phase-2-6-browser-check.mjs`
- this document

## Frontend tests

The frontend suite covers dashboard activation, route mapping, separate query keys, exact category grouping, select/deselect behavior without duplicates, active-ID selection validation, JPEG/PNG/WebP and 5 MiB boundaries, missing/empty/unsupported/oversize image rejection, and the customer preview projection retaining price/sold-out state while removing Internal DF and catalog IDs. Existing customer cart tests continue to cover sold-out reconciliation and inactive-menu clearing.

## Database and security tests

The Phase 2.6 pgTap suite has 32 assertions covering anonymous/inactive-admin denial, active-admin boundaries, removal of direct menu mutations, customer Internal DF isolation, safe public filter privileges, upload path scoping, archived-item rejection, atomic publication, one-current enforcement, server identity and 24-hour expiry, snapshot correctness, admin payload, duplicate-live conflict, stability after catalog edits, sold-out scoping, catalog independence, inactive-history protection, deactivation, anonymous disappearance, historical preservation, republishing after deactivation, and new-value snapshots in future menus.

## Local end-to-end validation

A transient synthetic admin, three active fake catalog items across ULAM/DESSERTS/EXTRAS, one archived fake item, and a 1×1 PNG were used against local Supabase. Headless Chrome passed login, dashboard navigation, archived-item exclusion, three-item selection, real Edge upload/publication, active status and timestamps, admin Internal DF display, customer-safe preview, customer-page publication, cart add, SOLD OUT reflection, AVAILABLE restoration, source catalog price edit, unchanged published price, confirmed deactivation, and customer empty state. The resulting synthetic menus were deactivated, all synthetic catalog rows were archived, and the synthetic admin was deactivated.

Responsive assertions passed at 320, 360, 390, 430, and 1440 pixels and at 320 pixels with Extra Large text. No token appeared in the URL and no horizontal overflow was detected.

## Physical-phone validation

A physical phone was not connected for this run. Manual follow-up should run `npm run dev:mobile` and verify real gallery/camera picker behavior, long catalog selection, publish action reachability, active-menu scrolling, customer preview, sold-out controls, deactivation, and Extra Large text on the target phone.

## Risks and limitations

- Full menu history/search is intentionally absent; history is preserved in the database.
- Successful menu images remain public historical assets. Reference-aware media retention is deferred.
- Edge cleanup after a failed publish is best effort; a storage/network failure during cleanup can leave an unreferenced object.
- There is no admin realtime subscription or countdown timer; focus/manual refresh and server predicates determine current status.
- The production bundle still carries the existing greater-than-500-kB chunk advisory; route-level code splitting can be considered separately.

## Deferred modules

Manual Order, Address Book, full Admin Messages, Settings, Bluetooth printing, generic analytics, promotion tooling, and full menu-history administration remain out of scope.

## Recommended next phase

Proceed to **Phase 2.7 — Manual Order**. It should let the owner record phone/outside orders while preserving trusted calculations, current editable state, original snapshots, cancellation/restoration, Today’s Orders integration, and rider totals. Do not begin it automatically.
