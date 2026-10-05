# Mobile Admin Stability Debug Pass

## Purpose

This pass pauses Phase 2.8 and fixes the two mobile-LAN white screens reported after Phase 2.7. It also adds deterministic Back navigation to every implemented admin subpage, hardens the shared dialog lifecycle, and prevents future render failures from leaving a completely blank application.

No business rules, database schema, RLS policy, RPC authorization, storage policy, or remote Supabase project were changed.

## Reproduction environment

The failures were reproduced before changing the implementation with:

- `npm run dev:mobile`
- an HTTP LAN origin at `http://192.168.18.8:5173`
- headless Chrome mobile emulation at 390 px
- an authenticated synthetic local admin
- DevTools runtime-exception capture

The LAN page reported `window.isSecureContext === false` and `typeof crypto.randomUUID === 'undefined'`.

## Manual Order root cause

`AdminManualOrderPage` creates its initial React Hook Form draft during render. `emptyManualItem()` called `crypto.randomUUID()` directly. Browsers expose `crypto.randomUUID()` only in secure contexts; an ordinary HTTP LAN address is not a secure context even though desktop `localhost` is treated as trustworthy.

The captured exception was:

`TypeError: crypto.randomUUID is not a function at emptyManualItem`

Because there was no render error boundary, React removed the failed tree and the user saw an empty white page.

## ULAM PHOTOS Add Food root cause

The catalog list itself rendered. Opening Add Food mounted `CatalogForm`, whose initial item ID used `crypto.randomUUID()` directly. The same insecure LAN origin produced:

`TypeError: crypto.randomUUID is not a function at CatalogForm`

The native dialog and image preview were not the source of the reported white screen. The failure happened before the picker could be used.

## UUID fix

`src/lib/secure-random-uuid.ts` now provides one neutral UUID boundary. It uses native `crypto.randomUUID()` when available. Otherwise it fills 16 bytes with `crypto.getRandomValues()`, applies the RFC 4122 version-4 and variant bits, and formats the UUID. The fallback remains cryptographically sourced and does not use `Math.random()`.

Every direct application call was migrated, including Manual Order form keys, catalog item IDs, menu publication IDs, newly added order-edit rows, and checkout idempotency keys. This avoids leaving the same LAN-only crash in another workflow.

## Catalog picker and preview stability

Cancelling a file picker now leaves the current photo, preview, and validation state unchanged. JPEG, PNG, and WebP selections were exercised sequentially. The `URL.createObjectURL()` preview updated without a render failure, and the effect revoked replaced object URLs. A valid PNG was then uploaded through the real local Edge function and saved through the existing trusted catalog RPC.

No storage or catalog authorization was weakened.

## Shared dialog hardening

The shared dialog already used mobile bottom-sheet sizing, `100dvh`, safe-area-aware height, native focus handling, and a top-layer `<dialog>`, so no z-index or parent-transform defect caused the white screens.

Testing did expose a separate rapid close/re-open race: a delayed native `close` event could overwrite a newly controlled open state. `Dialog` now distinguishes a prop-driven close from an external native close. It also has a small `showModal`/`close` capability fallback for older browser surfaces. Add Food can close and reopen reliably.

## Admin Back navigation

`AdminPageHeader` centralizes the admin subpage header. It provides:

- a labelled **Back** button with a left arrow;
- deterministic navigation to `/admin` rather than browser history;
- the existing logout action;
- a mobile-specific header class for consistent responsive behavior.

It is used by:

- `/admin/orders`
- `/admin/catalog`
- `/admin/menu`
- `/admin/manual-order`

At phone widths the store-name copy yields space to the labelled Back control and logout button. The Back action remains visible despite older CSS that hid first header actions on small screens. The `/admin` dashboard intentionally continues to have no Back button.

## Safe render fallback

`AppErrorBoundary` now wraps the application providers and router. A render or lifecycle exception produces a bounded **Something went wrong** state with Try Again and Back to Admin actions instead of a blank page.

Production UI exposes no exception message, stack trace, SQL detail, token, customer data, or secret. Development logging includes only the error type and React component stack. A development-only failure route validates the fallback and is excluded from production routing.

## Authentication and route behavior

The Back action is navigation UI only. All routes remain inside the existing `AdminRouteGuard`; direct entry, refresh, logout, inactive-admin checks, and unauthenticated redirects are unchanged. Testing confirmed that direct unauthenticated entry to `/admin/manual-order` returns to `/admin/login`.

## Automated coverage

Frontend tests now verify:

- native UUID delegation in secure contexts;
- cryptographically sourced RFC 4122 version-4 UUID generation when `randomUUID` is unavailable;
- all existing Manual Order, catalog, authentication, checkout, and design-system behavior.

The mobile-LAN browser check verifies:

- the real insecure origin has no `crypto.randomUUID`;
- Manual Order renders on first load and after direct refresh;
- no matching catalog data does not crash Manual Order;
- one, two, and three manual item rows render and removal remains stable;
- Add Food opens and reopens;
- JPEG, PNG, and WebP selection does not crash;
- cancelling the picker preserves the preview;
- replaced preview object URLs are revoked;
- a valid PNG saves through the local Edge function and trusted catalog operation;
- all four admin subpages show Back and return to `/admin`;
- the dashboard has no redundant Back control;
- logout and unauthenticated redirect still work;
- a representative render exception reaches the safe fallback;
- no horizontal overflow occurs at 320, 360, 390, 430, or 1,440 px, or at 320 px with Extra Large text.

## Files changed

- `src/app/App.tsx`
- `src/main.tsx`
- `src/components/layout/AdminPageHeader.tsx`
- `src/components/layout/AppHeader.tsx`
- `src/components/ui/AppErrorBoundary.tsx`
- `src/components/ui/Dialog.tsx`
- `src/components/ui/Icon.tsx`
- `src/features/admin-catalog/components/AdminCatalogPage.tsx`
- `src/features/admin-manual-order/components/AdminManualOrderPage.tsx`
- `src/features/admin-manual-order/model.ts`
- `src/features/admin-menu/components/AdminMenuPage.tsx`
- `src/features/admin-orders/components/AdminOrdersPage.tsx`
- `src/lib/api/checkout.ts`
- `src/lib/secure-random-uuid.ts`
- `src/styles/index.css`
- `tests/frontend/mobile-admin-stability.test.mjs`
- `tests/local/mobile-admin-stability-browser-check.mjs`
- this document

## Physical-phone result

A physical phone was not connected for this run. The failures were reproduced and fixed through the actual HTTP LAN configuration rather than localhost, with Chrome mobile emulation and real local authentication/catalog operations. A target-phone follow-up should still verify its native gallery/camera chooser, virtual-keyboard resizing, rotation, and safe-area presentation.

## Security and environment confirmation

- The UUID fallback uses Web Crypto secure randomness.
- Auth guards and active-admin checks remain unchanged.
- Catalog upload and creation still use the existing authenticated Edge/RPC boundaries.
- Production fallback content contains no technical or private data.
- Only the local Supabase stack was used.
- No remote Supabase project was linked, migrated, queried, or modified.
- Phase 2.8 / Address Book was not started.
