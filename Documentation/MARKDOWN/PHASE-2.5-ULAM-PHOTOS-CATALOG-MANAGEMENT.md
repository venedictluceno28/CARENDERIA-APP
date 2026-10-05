# Phase 2.5 — ULAM PHOTOS / Catalog Management

## Purpose

Phase 2.5 gives the store owner a protected, phone-first reusable food library. Each catalog item carries the photo, customer price, category, and internal delivery allocation that a later ULAM POST workflow can snapshot into a daily menu.

## Scope

This phase activates **ULAM PHOTOS** and implements catalog listing, search, category and availability filters, create, edit, photo replacement, archive, and restore. It does not publish a menu, select food for today, manage sold-out state, or implement another admin module.

## Domain relationship

The existing separation remains authoritative:

- `catalog_items` is the mutable reusable definition.
- `published_menu_items` is a menu-specific value and photo snapshot.
- `order_items` is immutable historical order data.

Catalog updates and archive state changes touch only `catalog_items`. The database test proves that an existing published snapshot keeps its original name, category, prices, and photo path after its source catalog item is edited and archived. No catalog action cascades into menu or order history.

## Backend contracts used

The existing table and active-admin RLS supply catalog reads. The current backend did not include a suitable public product-image bucket or trusted catalog mutations, so the smallest missing backend surface was added:

- `admin_authorize_catalog_image_upload` authorizes an active admin and restricts the object prefix to `catalog/{catalog-item-uuid}/`.
- `admin_create_catalog_item` validates and creates one catalog row.
- `admin_update_catalog_item` validates current values and optionally replaces its photo path.
- `admin_set_catalog_item_archived` archives or restores without deleting.
- `admin-catalog-image` accepts authenticated multipart uploads, applies rate limits, checks declared MIME, 5 MiB size, and image magic bytes, generates a non-overwriting object name, and uploads with the server-only service credential.

All mutation RPCs repeat active-admin authorization. The browser never receives or imports a service-role key.

## Feature architecture

`src/features/admin-catalog/` owns the catalog types, filtering and form mapping, typed Supabase boundary, query/mutation state, cards, and form experience. Shared money-input and public-asset URL helpers live in `src/lib/`; customer ordering and admin orders consume those shared boundaries instead of importing catalog internals.

TanStack Query owns the single catalog list identity. React Hook Form owns create/edit inputs and dirty state. Components do not issue raw RPCs.

## Admin route and dashboard integration

The existing dashboard label remains **ULAM PHOTOS** and now links to `/admin/catalog`. The route is inside the existing `AdminRouteGuard`, so it requires a valid Supabase session and an active `admin_profiles` row. Backend RLS, RPC checks, and upload authorization remain authoritative if a route is called directly.

## Catalog list

The default view prioritizes active items. Mobile-first cards show a stable photo area with cover cropping and a fallback, wrapped food name, category, customer price, clearly internal DF, textual archived state, and edit/archive or restore actions. Results use the existing database order: category followed by food name. A manual Refresh action refetches without polling.

## Search and category filter

Search is case-insensitive by food name and composes with the category and availability controls. Category is a single selection: All, ULAM, DESSERTS, or EXTRAS. The catalog is currently small and safely available through active-admin RLS, so filtering is client-side over one fetched set.

## Active/archive model

Active, Archived, and All views use the existing `is_archived` model. Archive requires confirmation and explains that future menu availability changes while past menus and orders remain. Restore also requires confirmation. Neither action deletes a row or media object.

## Create flow

**Add food** opens the responsive catalog dialog. The owner selects a required image, enters a trimmed name, chooses exactly one category, and enters price and Internal DF in pesos. On Save, the client creates the catalog UUID, uploads the validated image to its scoped path, calls the trusted create RPC, invalidates the catalog query, closes only after authoritative success, and presents explicit success feedback. Duplicate submission is disabled while saving.

## Edit flow

Edit loads the current name, category, price, and Internal DF. The existing photo remains unless a replacement is selected. A successful replacement is uploaded under the same item-specific prefix with a fresh object UUID before the trusted update RPC changes the current catalog reference. The list is then invalidated and success feedback is shown. Closing a dirty create/edit form requires discard confirmation.

## Food name

The name is required, trimmed, accepts ordinary Unicode, and is limited to the existing backend maximum of 160 characters. It is not constrained to an English-only pattern.

## Customer price and money parsing

Price is a peso-facing decimal input and persists as integer centavos. The shared parser accepts whole pesos or one/two decimal places, strips display commas, rejects negative, unsafe, malformed, and excess-decimal values, then converts once with an integer-centavo safety check. Zero remains valid because the database allows it.

## Internal DF

Internal DF uses the same safe centavo conversion and may be zero. The admin UI labels it **Internal Delivery Allocation (Internal DF)** and states that it is used by delivery calculation and is not shown to customers. It is never added to the displayed food price and no customer feature was changed to expose it.

## Category

The form uses a mobile-friendly single-selection control backed by the existing exact values `ULAM`, `DESSERTS`, and `EXTRAS`. No second taxonomy was introduced.

## Photo upload

The picker accepts JPEG, PNG, and WebP and does not force camera capture. It offers immediate preview, removal, and replacement before save. Client checks provide early MIME and 5 MiB feedback; the Edge Function repeats size and MIME checks and verifies file signatures rather than trusting extensions. Loading text and disabled Save state cover upload progress and failures return a safe admin-facing message.

## Storage and security model

Catalog/menu photos are public customer-readable assets in the dedicated `public-assets` bucket. Direct client writes are not granted. Authenticated active-admin uploads pass through `admin-catalog-image`, and only that server function uses the service credential. Server-generated paths prevent arbitrary overwrite. Existing private messaging and payment-evidence buckets and policies were not changed or exposed.

## Photo replacement and history

Replacement updates only the current catalog row. Old objects are deliberately retained because published menu snapshots can continue to reference their old paths. This favors historical correctness over eager storage cleanup.

## Validation and error handling

Field-level messages cover required name, category, photo, valid nonnegative price, valid nonnegative Internal DF, supported image type, nonempty image, and the 5 MiB limit. Server failures are mapped to concise messages; raw PostgreSQL details are not rendered. Loading, retry, empty active, empty archived, filtered-empty, and success states remain inside the admin shell.

## Query invalidation

Create, edit, archive, and restore all invalidate the stable `['admin-catalog']` query. Manual Refresh refetches the same query. There is no competing local catalog cache, polling, or Realtime subscription.

## Mobile UX and large-font behavior

The page uses large touch controls, wrapping filter groups, stacked card facts, decimal-friendly keyboards, a full-height responsive dialog on narrow screens, and reachable primary actions. Automated browser review found no horizontal overflow at 320, 360, 390, 430, or 1440 pixels, including 320 pixels with Extra Large text. Long names wrap and filter groups expand naturally.

## Accessibility

Inputs have visible labels and associated errors. The file input is labeled; previews and catalog photos have meaningful alt text while fallback content remains textual. Filter buttons expose pressed state, active/archive state is written rather than color-only, status and errors use live semantics, and the native modal dialog handles focus and Escape behavior.

## Security review

- Anonymous and inactive/non-admin users are denied by both route and backend layers.
- Anonymous users have no catalog mutation RPC privilege; active admins have no destructive table delete path.
- Upload authorization scopes each object to a server-approved item prefix and generated filename.
- The browser bundle contains no service-role secret.
- Public reads apply only to `public-assets`; private evidence and message objects remain private.
- Catalog flows use no guest order token.
- Archive/edit preserves published and order snapshots.

## Files changed

- `src/app/App.tsx`
- `src/features/admin-auth/admin-modules.ts`
- `src/features/admin-catalog/api/admin-catalog.ts`
- `src/features/admin-catalog/components/AdminCatalogPage.tsx`
- `src/features/admin-catalog/model.ts`
- `src/features/admin-catalog/types.ts`
- `src/features/admin-orders/model.ts`
- `src/features/customer-ordering/api/public-menu.ts`
- `src/lib/money-input.ts`
- `src/lib/public-asset-url.ts`
- `src/styles/index.css`
- `supabase/config.toml`
- `supabase/functions/admin-catalog-image/index.ts`
- `supabase/migrations/20261003040000_phase_2_5_admin_catalog.sql`
- `supabase/tests/database/phase_2_5_admin_catalog.sql`
- `tests/frontend/admin-catalog.test.mjs`
- `tests/frontend/admin-orders.test.mjs`
- `tests/local/phase-2-5-admin-fixture.sql`
- `tests/local/phase-2-5-browser-check.mjs`
- this document

## Frontend tests

The frontend suite covers the stable query identity, active/archived/all filtering, case-insensitive name search, category composition, exact accepted image MIME types, 5 MiB boundary, missing/empty/unsupported/oversize image rejection, existing edit defaults, safe centavo mapping, trimming, zero Internal DF, and malformed/negative money rejection. Existing dashboard coverage now expects ULAM PHOTOS and Today’s Orders as the two enabled modules.

The local browser test additionally exercises the rendered login/dashboard/catalog path, required photo workflow, preview-backed create, search, edit defaults and mutation, name/price/Internal DF update, photo replacement, success messages, archive confirmation, archived filter, restore, final cleanup archive, and responsive overflow assertions.

## Backend and database tests

The Phase 2.5 pgTap test contains 20 assertions for the public bucket configuration, MIME/size limits, RPC privilege boundaries, anonymous denial, active-admin enforcement, scoped photo paths, create/update/archive/restore behavior, absence of destructive catalog delete access, and preservation of a published snapshot after source edits.

## Local end-to-end validation

Local Supabase was migrated non-destructively and its function router restarted to discover the new endpoint. A clearly synthetic active admin and 1×1 fake PNG were used. Headless Chrome passed login, dashboard navigation, upload/create, appearance, name search, ULAM filtering through the created category, edit of name/price/Internal DF, replacement upload, archive/removal from Active, Archived view, restore, and final archive. The run verified the edited values, no token in the URL, and zero horizontal overflow at all required widths. Database tests independently verified that published history was unchanged. Synthetic catalog records were left archived; no real order or catalog data was used.

## Physical-phone validation

A physical phone was not connected for this run. Manual follow-up should run `npm run dev:mobile` and verify real gallery/camera-picker behavior, soft-keyboard behavior for both money fields, scrolling, save/edit/archive, and Extra Large text on the target device.

## Risks and limitations

- Client-side search/filtering is appropriate for the current small catalog; server pagination may be needed at much larger scale.
- Old replaced photos are intentionally retained for historical references; a future reference-aware retention job may reclaim objects proven unused.
- If an upload succeeds but the following create/update RPC fails, the newly uploaded object can remain orphaned. Cleanup is intentionally conservative so it cannot remove media referenced by history.
- Public food-image URLs are deliberately readable by anyone who knows the path; write access remains protected.
- Image resizing/compression is not included. The authoritative 5 MiB limit prevents unrestricted phone uploads.

## Deferred ULAM POST work

This phase does not create today’s menu, snapshot selected catalog items, upload a menu image, enforce a 24-hour lifetime, deactivate a menu, or mark published items sold out.

## Recommended next phase

Proceed to **Phase 2.6 — ULAM POST / Today’s Menu Publishing**. It should consume this catalog, snapshot current values, publish one time-bounded active menu with its required image, support manual deactivation, and manage published-item sold-out state. Do not begin it automatically.
