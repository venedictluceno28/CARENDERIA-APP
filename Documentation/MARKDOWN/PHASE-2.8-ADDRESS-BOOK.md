# Phase 2.8 — Address Book

## Purpose

Phase 2.8 activates the admin **ADDRESS BOOK** workflow. The owner can save frequently used customer names and exact addresses, find them quickly, maintain active and archived entries, and copy an active entry into Manual Order.

The Address Book remains reusable admin convenience data. It is not customer identity, authentication, a CRM, or an order-history owner.

## Scope

Implemented:

- protected `/admin/address-book` route and active dashboard action;
- mobile-first address list and alphabetical ordering;
- case-insensitive customer-name and exact-address search;
- Active, Archived, and All filters;
- add and edit forms using React Hook Form;
- archive confirmation and restore;
- TanStack Query loading, error, mutation, and invalidation behavior;
- Manual Order saved-address selector and editable autofill;
- responsive and large-font behavior;
- frontend, database security, snapshot, and local browser validation.

Customer accounts, CRM features, loyalty, purchase-history dashboards, phone/SMS integration, full Admin Messages, Settings, and printing remain deferred.

## Domain relationship

`address_book_entries` is the mutable reusable source. `orders.customer_name`, `orders.exact_address`, and the customer section in `orders.original_snapshot` are order-owned values.

Selecting an address-book entry copies plain name and address strings into the Manual Order form. The form remains editable, and `admin_create_manual_order` persists those submitted values into the order and its original snapshot. There is no live frontend linkage. Editing, archiving, or restoring an address-book row cannot rewrite an existing order.

Duplicate names and duplicate addresses are allowed. Database row identity distinguishes entries, and the selector displays both the name and exact address.

## Backend contracts used

The phase uses the existing `public.address_book_entries` table as the source of truth:

- `customer_name` — required, trimmed by the application, 1–160 characters;
- `exact_address` — required, trimmed by the application, 1–1,000 characters;
- `is_archived` — non-destructive active/archive state;
- `created_by`, `created_at`, and `updated_at` — existing audit fields.

The existing schema intentionally has no delivery-area column, so this phase does not invent one. Manual Order continues to require an explicit established delivery-area choice: Marycris Complex, Wellington Place, Elliston Place, or Outside these areas.

Existing grants and RLS are used directly. Anonymous users have no table privileges. Authenticated reads, inserts, and updates are limited by `private.is_active_admin()`. The frontend has no service-role credential and receives only the project anonymous key. Application roles have no DELETE privilege.

No migration or new backend operation was required.

## Feature architecture

`src/features/admin-address-book/` owns:

- address-book types and form input mapping;
- a typed Supabase API boundary;
- the shared `['admin-address-book']` query identity;
- client-side search/status filtering;
- the list, forms, confirmations, notices, and selector UI;
- the feature’s public exports through `index.ts`.

Manual Order imports only the feature’s public selector boundary. It does not import address-book implementation internals. A small Manual Order model helper copies the selected strings into its own draft.

## Admin route and dashboard integration

The existing ADDRESS BOOK module now opens `/admin/address-book`. `AdminRouteGuard` requires an authenticated session and active admin profile, while database RLS independently enforces backend authorization.

The page uses `AdminPageHeader`; Back deterministically navigates to `/admin`. Direct route loading, refresh, logout behavior, and unauthenticated redirect use the same established admin shell.

## List and search

The page uses wrapping cards rather than a wide table. Each card displays the customer name, multiline exact address, and archived state where applicable. Tapping the main card opens Edit; full-size Edit and Archive/Restore actions remain visible.

The backend safely returns the private admin-only list, alphabetically ordered by customer name and then exact address. Because the expected owner-managed dataset is small, name/address substring matching and status filtering happen client-side. Matching is case-insensitive and does not require an exact value.

## Add and edit flows

**Add Address** opens a large scrollable dialog. The form contains only the schema-backed customer name and exact address. Names accept ordinary Unicode, spaces, apostrophes, and hyphens without restrictive pattern validation. Exact address uses a comfortable multiline field.

Edit loads current values as React Hook Form defaults. Both operations trim values, validate the established length bounds, show safe errors, provide explicit success feedback, and invalidate the shared address-book query.

## Archive and restore

Archive requires confirmation and updates `is_archived`; it never deletes a row or cascades to orders. Archived entries are hidden from the default Active list and from Manual Order selection. The Archived or All filter exposes them, and Restore returns them to active selection. Both mutations show success feedback and invalidate the shared query.

## Manual Order integration

The Customer section now includes **Use saved address**. Its large selector:

- queries through the same typed API and query key as Address Book;
- includes active entries only;
- searches customer name and exact address;
- displays enough address context to distinguish duplicate names;
- copies customer name and exact address into the form;
- leaves both populated fields editable;
- leaves delivery area explicit because the address-book schema stores no area.

Saving still calls the existing trusted manual-order RPC with copied form values. No address-book object or mutable reference is submitted.

## Query and feedback behavior

The page and selector share `addressBookQueryKey`. Create, edit, archive, and restore invalidate it, so both surfaces refresh without maintaining duplicate server state. The list includes skeleton loading, safe retryable error, first-use empty, archived empty, and search no-match states. Mutations provide explicit added, updated, archived, and restored notices.

## Mobile UX, large text, and accessibility

Cards and controls use the established touch target, wrapping, and focus styles. Long names and multiline addresses use defensive wrapping. The form dialog scrolls within the viewport, retains a reachable Save action, and gives the exact address five text rows. Primary mobile actions expand to full width where useful.

Labels are programmatically associated with fields; required fields expose inline alerts; filters use `aria-pressed`; loading and notice content use status semantics; errors use alerts; dialogs retain labelled titles/descriptions and keyboard dismissal.

Automated browser review confirmed no horizontal overflow at 320, 360, 390, 430, and 1440 pixels, including 320px with Extra Large text.

## Privacy and security

Names and addresses are not placed in URLs, analytics, logs, customer routes, or public projections. They are requested only inside authenticated admin pages. Safe UI errors avoid returning raw backend messages. Database tests confirm anonymous denial, inactive-admin denial, active-admin access, no application DELETE privilege, archive/restore preservation, and order snapshot independence.

## Files changed

- `src/features/admin-address-book/api/admin-address-book.ts`
- `src/features/admin-address-book/components/AdminAddressBookPage.tsx`
- `src/features/admin-address-book/components/AddressBookPicker.tsx`
- `src/features/admin-address-book/index.ts`
- `src/features/admin-address-book/model.ts`
- `src/features/admin-address-book/types.ts`
- `src/features/admin-auth/admin-modules.ts`
- `src/features/admin-manual-order/components/AdminManualOrderPage.tsx`
- `src/features/admin-manual-order/model.ts`
- `src/app/App.tsx`
- `src/styles/index.css`
- `tests/frontend/admin-address-book.test.mjs`
- `tests/frontend/admin-orders.test.mjs`
- `supabase/tests/database/phase_2_8_address_book.sql`
- `tests/local/phase-2-8-admin-fixture.sql`
- `tests/local/phase-2-8-browser-check.mjs`
- `tests/local/phase-2-8-cleanup.sql`
- `Documentation/MARKDOWN/PHASE-2.8-ADDRESS-BOOK.md`

## Tests and validation

Frontend coverage includes query identity, active/archive filtering, name and address search, no-match behavior, Unicode and multiline input normalization, required/length rejection, duplicate-name behavior, edit defaults, copied-value independence, dashboard activation, protected route composition, shared header usage, and Manual Order wiring.

The 19-assertion pgTAP test covers anonymous privileges, callers without an active profile, inactive-admin reads and mutations, active-admin create/edit/archive/restore, lack of destructive DELETE, Manual Order creation from copied values, original/current order address stability after an Address Book edit, and preservation through archive/restore.

The local headless-browser scenario used clearly fake data and validated:

1. unauthenticated direct-route redirect, admin login, protected-route refresh, logout, and redirect back to login;
2. dashboard navigation and empty state;
3. required validation, add, name search, address search, and edit;
4. Manual Order selection, autofill, editable override, and creation;
5. direct authenticated order audit before and after a later Address Book edit;
6. unchanged order fields and original snapshot;
7. archive, archived filter, restore, and Back navigation;
8. responsive widths and 320px Extra Large text.

Synthetic order items, order, address entry, and fake-admin activation were removed after validation.

## Physical-phone validation

A physical phone was not available in this environment. The actual `npm run dev:mobile` touch/keyboard/LAN pass therefore remains a manual device check. Automated mobile emulation covered the required widths, scrolling layouts, dialogs, selector, autofill, long content, Extra Large text, Back behavior, and horizontal overflow, but it is not represented as a physical-device result.

## Risks and limitations

- Delivery area cannot be inferred or saved because the established address-book schema has no area field. The owner must choose it per Manual Order.
- Client-side search is appropriate for the current small private dataset; future pagination or server-side search may be warranted only if the list becomes materially large.
- The existing direct-RLS write boundary does not provide an address-book-specific RPC error code, so unexpected database failures use a safe generic message.
- The final physical phone keyboard and LAN interaction pass is still outstanding.

## Recommended next phase

Proceed to **Phase 2.9 — Admin Messages**: an owner-side, mobile-first conversation list with order context, customer messages, admin replies, private image/payment-evidence viewing, payment-verification convenience, and 24-hour guest-chat awareness. Do not begin it automatically.
