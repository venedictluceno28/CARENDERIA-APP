# CARENDERIA-APP — Phase 2.1

## Customer Menu & Cart

## 1. Purpose

Phase 2.1 replaces the customer shell placeholder with the first complete customer business feature: reading the current published menu, browsing its dishes, and preparing a local cart for the later trusted checkout flow. The browser remains a display and intent-capture layer; PostgreSQL and the existing checkout operation remain authoritative.

## 2. Scope

Implemented:

- Active published-menu loading and recoverable loading, empty, and error states
- Stable `ULAM`, `DESSERTS`, and `EXTRAS` category navigation
- Snapshot-based menu image, food photo, name, category, price, and SOLD OUT presentation
- Shared BUY and ADD TO CART behavior
- Quantity increment/decrement, removal, item count, line totals, and food subtotal
- Responsive cart dialog that becomes a mobile bottom sheet
- Mobile sticky cart action
- Versioned local cart persistence
- Active-menu, item-availability, and item-price reconciliation
- A route boundary at `/order/address`
- Development-only representative state rendering for visual review

Not implemented:

- Address or location input
- Delivery/promotion calculation UI
- Payment choice or payment evidence
- Checkout submission, receipt, or messaging
- Customer accounts
- Admin menu/catalog tooling

## 3. Backend Contracts Consumed

The customer query reads only the anonymous columns already granted by Phase 1.0 RLS:

- `published_menus`: `id`, `image_path`, `activated_at`, `expires_at`
- `published_menu_items`: `id`, `published_menu_id`, `name_snapshot`, `category_snapshot`, `unit_price_centavos`, `photo_path_snapshot`, `is_sold_out`, `sort_order`

The UI does not query reusable catalog rows, Internal DF, rider amounts, admin metadata, or unrestricted menu history. It does not reproduce the activation/expiration/deactivation predicate. The existing `anonymous_read_active_menus` and dependent item policy decide what is visible.

No migration, policy, RPC, Edge Function, or Storage permission changed in this phase.

## 4. Feature Architecture

The cohesive feature is located under `src/features/customer-ordering`. It owns:

- Public-menu query mapping
- TanStack Query hook
- Menu and cart types
- Pure menu/cart operations
- Feature-local cart context and persistence
- Food, category, cart, and customer-menu presentation

This avoids sibling-feature imports. Shared buttons, badges, dialog, feedback states, layout, icons, formatting, and surfaces remain in the Phase 2.0 shared layers.

TanStack Query owns remote menu state. React context/state owns the local cart. Redux was not added, and cart data is not stored in the query cache.

## 5. Active-Menu Query

`loadActiveMenu` first asks for one RLS-visible published menu, then requests its public snapshot items ordered by `sort_order` and name. Public database column names are mapped into a customer-safe model. Integer prices and confirmed categories are checked defensively before rendering.

Query behavior:

- 60-second stale time
- Two automatic retries
- Refetch on window focus
- Five-minute foreground refresh interval
- No background or interaction-driven aggressive polling
- Explicit retry/refresh controls in error and empty states

The final Phase 2.2 checkout call will still perform authoritative transactional validation.

## 6. Images

Absolute HTTP(S), data, blob, and root-relative image references are used directly. Other snapshot paths resolve through the documented `public-assets` public-bucket URL shape. Missing or failed images render the design-system-aligned chef-hat fallback. Fixed aspect ratios reserve image space and avoid large layout shifts.

Public asset provisioning and admin image upload remain outside this phase. A deployment whose database contains object paths must provide the documented `public-assets` bucket contract; otherwise the customer sees the safe fallback.

## 7. Category Navigation

Only populated categories are shown, always in the business order:

1. ULAM
2. DESSERTS
3. EXTRAS

The selector is a sticky, horizontally scrollable tab list with large touch targets. Selecting a category changes the visible card grid without refetching or changing routes. Empty categories are omitted instead of presenting dead controls.

## 8. Food-Card Design

Each card presents only customer-facing snapshot information:

- Stable image area with fallback
- Food name
- Category
- Formatted peso price
- BUY and ADD TO CART actions

The grid uses one column on narrow screens, two on medium screens, and three on wide screens. Long names wrap, and cards have no fixed content height that would clip large-font text.

## 9. SOLD OUT Behavior

SOLD OUT items remain visible with a text-and-icon badge and reduced image emphasis. Both actions are disabled, and the pure cart operation also rejects sold-out additions. State is therefore not communicated through color alone and is guarded in both presentation and local behavior.

If a refetch marks a cart line sold out, the line remains visible, receives a clear unavailable explanation, and blocks proceeding until removed. A removed published item receives equivalent handling. The checkout backend remains the final guard.

## 10. Cart Model

The persisted V1 cart contains:

- Published menu ID
- Published menu item ID
- Snapshot display name
- Snapshot image reference/URL
- Category
- Last-reviewed unit price in centavos
- Optional current price awaiting review
- Positive integer quantity
- Local availability state

Internal DF, delivery values, customer data, credentials, and secrets are never stored. The last-reviewed fields map directly to the future checkout line contract: `publishedMenuItemId`, `quantity`, and `expectedUnitPriceCentavos`.

## 11. BUY and ADD TO CART

Both actions call the same pure add operation. An available new item creates a line; a duplicate increments its quantity. ADD TO CART gives subtle live-region feedback and keeps the customer browsing. BUY performs the same add and opens the cart immediately to express faster ordering intent. Neither action submits an order.

## 12. Quantity, Removal, and Subtotal

Quantity controls use large labeled buttons. Increment adds one. Decrement at one removes the line, so zero and negative quantities cannot remain in cart state. Quantities are validated against the positive PostgreSQL integer range rather than an invented business maximum.

The displayed food subtotal is the sum of `last-reviewed unit price × quantity`. It excludes delivery and is explicitly described as subject to final checkout confirmation.

## 13. Cart Persistence

The cart uses `localStorage` key `tindahan.customer-cart.v1`. Parsing validates the version, menu relationship, unique item IDs, categories, prices, quantities, availability values, and safe string bounds. Invalid or unreadable storage falls back to an empty cart without blocking the app.

Persistence is a usability enhancement only. Storage failure leaves the in-memory cart functional. Empty carts remove the stored value.

## 14. Menu-Change Handling

After a successful active-menu response:

- No active menu clears a persisted cart.
- A different menu ID clears the old cart.
- The customer receives a live-region message explaining that today’s menu changed.
- The normal query refresh schedule also catches expiration or manual deactivation when RLS stops exposing the menu.

Old lines never silently carry into an unrelated published menu.

## 15. Price-Change Handling

When refetched menu data has a different item price, the cart retains the last-reviewed value for its displayed subtotal and stores the current value separately. The sheet shows old → current price, blocks proceeding, and requires **Accept updated prices**. Acceptance replaces the reviewed value and recalculates the subtotal.

This is a customer-review aid, not price authority. Phase 2.2 must still map a `PRICE_CHANGED` checkout response into the same review behavior before retrying.

## 16. Cart Presentation

The Phase 2.0 native dialog is used as a centered panel on larger screens and a bottom sheet on small screens. The sheet contains images, item details, reviewed prices, line totals, quantity controls, removal, conflict messages, subtotal, and a strong proceed action. Focus behavior, Escape handling, backdrop dismissal, and dialog semantics come from the shared primitive.

When the cart has items, a safe-area-aware fixed action displays the item count and subtotal. The header cart action remains available at all sizes and includes an accessible count label.

## 17. Proceed Route Boundary

The enabled proceed action routes to `/order/address` only when no local availability or price-review conflict remains. The route deliberately shows a boundary page with cart count/subtotal and states that no order or payment has occurred. It does not contain an address form, delivery logic, payment controls, or checkout call.

An empty cart cannot remain on the boundary route and is redirected to the menu.

## 18. Accessibility

- One page `h1` and structured category/card headings
- Native buttons and dialog semantics
- Visible focus from the shared design system
- Food-name image alternatives and an announced fallback
- Text SOLD OUT and conflict explanations
- Explicit action labels for food, quantity, remove, and cart controls
- Polite live feedback for cart changes
- Quantity exposed through an `output` value
- Touch targets at or near the 48-pixel design-system target
- Price and availability do not rely on color alone

## 19. Responsive and Large-Font Behavior

The menu is mobile-first. Category controls scroll instead of shrinking, grids adapt progressively, the cart surface becomes a bottom sheet, safe-area padding protects fixed actions, and cart rows allow wrapping.

Normal and Extra Large modes were rendered. Text and controls remain usable without fixed-height content regions. Exact Chrome device emulation confirmed document widths equal viewport widths at 320 and 390 pixels; the category strip itself scrolls intentionally without creating page overflow.

## 20. Files Changed

Application and feature:

- `src/app/App.tsx`
- `src/pages/CustomerHomePage.tsx`
- `src/pages/CheckoutBoundaryPage.tsx`
- `src/pages/CustomerOrderingPreviewPage.tsx` (development route only)
- `src/features/customer-ordering/types.ts`
- `src/features/customer-ordering/cart.ts`
- `src/features/customer-ordering/menu.ts`
- `src/features/customer-ordering/cart-context.ts`
- `src/features/customer-ordering/CustomerOrderingProvider.tsx`
- `src/features/customer-ordering/api/public-menu.ts`
- `src/features/customer-ordering/hooks/use-active-menu.ts`
- `src/features/customer-ordering/components/CustomerOrderingLayout.tsx`
- `src/features/customer-ordering/components/CustomerMenuExperience.tsx`
- `src/features/customer-ordering/components/MenuCategoryTabs.tsx`
- `src/features/customer-ordering/components/FoodCard.tsx`
- `src/features/customer-ordering/components/FoodImage.tsx`
- `src/features/customer-ordering/components/CartSheet.tsx`
- `src/styles/index.css`
- `tsconfig.app.json` (permits explicit TypeScript extensions used by the existing stripped-TypeScript Node test runner)

Tests and documentation:

- `tests/frontend/customer-ordering.test.mjs`
- `Documentation/MARKDOWN/PHASE-2.1-CUSTOMER-MENU-CART.md`

## 21. Frontend Tests

The Node frontend suite now covers:

- Populated category filtering in stable order
- Empty-cart model
- Add and duplicate increment
- SOLD OUT rejection
- Quantity increment/decrement and remove-at-zero
- Removal
- Reviewed-price subtotal
- Inactive/replaced-menu clearing
- Sold-out reconciliation and blocking
- Price-change review and acceptance
- Valid and malformed persisted carts

The existing money, large-font preference, and guest-session tests continue to pass.

## 22. Visual Review

The development-only `/__customer-ordering` route renders representative data through the production feature components and is excluded from production routing.

Reviewed:

- Loading state
- No-active-menu state
- Recoverable error state
- Full active menu
- ULAM, DESSERTS, and EXTRAS
- SOLD OUT item
- Long food name
- One- and multiple-item cart behavior
- Extra Large font cart sheet
- 320, 360, 390, and 430-pixel mobile widths
- 1440-pixel desktop layout

An initial 320-pixel review exposed an over-constrained banner image. The image was changed to respect its grid column rather than derive width from its aspect ratio. The exact-width rerun reported `document.scrollWidth === innerWidth` at 320 and 390 pixels. At 390 pixels, every cart price, remove action, and subtotal remained inside the sheet.

Temporary screenshots were not added to the repository.

## 23. Backend and Security Impact

There is no backend mutation in Phase 2.1. Existing anonymous SELECT grants and RLS remain unchanged. No service-role material, guest token, authenticated admin field, Internal DF, rider amount, or private Storage path is exposed. The cart is non-authoritative, and all final transaction claims remain deferred to the trusted checkout boundary.

## 24. Risks and Limitations

- Public snapshot object paths depend on deployment of the documented `public-assets` bucket contract; failed image reads degrade to a placeholder.
- Five-minute refresh plus focus refetch balances freshness and network use, but a state change can still occur between refresh and checkout. Phase 2.2 must handle authoritative conflicts.
- `localStorage` can be cleared or blocked and is not cross-device; it is intentionally not an order record.
- The proceed route is a boundary only. Customers cannot submit an order in this phase.
- The development preview uses generated representative images and must not be treated as seeded business data.

## 25. Recommended Next Phase

Proceed to **Phase 2.2 — Address, Delivery, Checkout & Receipt**.

It should add customer name and exact address, area selection, promotion explanation, authoritative delivery preview, CASH/ONLINE PAYMENT selection, idempotent trusted checkout, PRICE_CHANGED/SOLD OUT conflict recovery, secure guest credential saving, receipt presentation, and the message entry point. Phase 2.2 was not started here.
