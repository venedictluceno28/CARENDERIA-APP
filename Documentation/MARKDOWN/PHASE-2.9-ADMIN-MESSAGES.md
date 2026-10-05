# Phase 2.9 — Admin Messages

## Purpose

Phase 2.9 activates the admin **MESSAGE** workflow. The owner can find an order-linked customer conversation, read retained history, reply with plain text, inspect private customer images and payment evidence, and verify or reverse an online payment without duplicating order management.

## Scope

Implemented:

- protected `/admin/messages` and `/admin/messages/:orderId` routes plus an active dashboard action;
- a recent-activity inbox with backend name/order-code search and simple operational filters;
- chronological customer/admin message history and text replies;
- short-lived, active-admin-authorized viewing for ordinary images and payment receipts;
- trusted online-payment verification and confirmed reversal;
- guest messaging-window context, retained expired history, and View Order integration;
- paged loading, moderate foreground polling, retryable states, mobile layouts, and accessibility behavior;
- frontend, database-security, build, lint, formatting, and local browser validation.

Unread infrastructure, push notifications, rich text, CRM, Settings, printing, and analytics remain outside this phase.

## Existing backend contracts

The feature reuses the Phase 1.2 `admin-messaging` Edge Function for `list_messages`, `send_message`, and `signed_read`. Every action validates the caller's authenticated session and active admin profile on the backend. Message history uses the existing chronological cursor contract; text replies use its established validation and rate limiting; signed reads return 60-second URLs for private Storage objects.

The existing trusted payment-verification operation remains the only write path for verification state. Evidence existence never changes verification automatically. Existing private `chat-images` and `payment-evidence` buckets remain private, and no guest credential or service-role credential is present in the admin frontend.

A concrete missing capability was the inbox projection. Migration `20261005000000_phase_2_9_admin_messages.sql` adds `admin_list_conversations`, a `security definer` RPC that begins with `private.require_active_admin()`. It returns only online-order conversations with actual message activity, newest first, and exposes the minimum order, payment, guest-expiry, and last-message context required by the inbox. Public and anonymous execution are revoked.

## Feature architecture

`src/features/admin-messages/` owns:

- inbox and message-domain types;
- query identities, page merging, reply validation, and presentation helpers;
- the typed Supabase RPC/Edge API boundary;
- the inbox page;
- the conversation page, composer, attachment viewer, and payment actions;
- public exports through `index.ts`.

The feature reuses only public shared/admin-operation boundaries. It does not import customer-ordering internals or maintain a second messaging system.

## Admin route and dashboard integration

The MESSAGE dashboard tile opens `/admin/messages`. Both the list and `/admin/messages/:orderId` detail route are nested under `AdminRouteGuard`, while the RPC, Edge Function, signed-read action, and payment operation independently enforce active-admin authorization.

The list uses the shared admin header with deterministic Back to `/admin`. Detail uses the same header with deterministic Back to `/admin/messages`; neither depends on browser history. The route contains a non-secret order UUID, never a guest token.

## Conversation list, search, and filters

Each card shows customer name, order code, last sender and preview, last activity, payment method, online-payment verification state, and active/expired customer messaging status. Customer and Store are written as text, so sender meaning does not rely on color. There is no unread badge because the backend has no unread model.

The RPC performs case-insensitive customer-name and order-code search. Filters are All, Online Payment, Not Verified, Verified, Active Guest Chat, and Expired Guest Chat. Message-text search was intentionally not added. The inbox displays only conversations with messages and sorts by latest message time descending.

## Conversation detail and message rendering

Detail shows compact order context: customer name, order code, order time, payment method, applicable verification state/time, and the exact guest-window expiry state. Messages are merged into chronological order and clearly labelled Customer or Store.

Message text is rendered by React as untrusted plain text. No HTML injection path is used. Attachments are distinguished from text and from one another; payment evidence is visibly labelled **PAYMENT RECEIPT**. CASH conversations retain ordinary messaging but omit verification state, receipt callouts, and verification controls.

## Admin reply

The multiline composer uses the existing `send_message` action through a TanStack Query mutation. Whitespace-only replies are blocked. On success, the draft clears, history and inbox queries are invalidated, and the latest reply remains visible. On failure, the draft stays intact and a safe retryable error is shown; failed text is never inserted as if sent.

The backend can support other message actions, but this admin UI intentionally sends text only. No new attachment-upload behavior was added.

## Private image and payment-evidence viewing

Tapping an ordinary attachment or payment receipt requests a fresh signed URL through the active-admin `signed_read` action. The URL is held only in the open viewer mutation state, reset when the dialog closes, never placed in navigation/query parameters, and not logged. The responsive viewer preserves image aspect ratio, identifies its content, provides an accessible close button, and offers a safe retry path if signing or loading fails.

Payment evidence remains separate from ordinary images in both its label and accessible action name. Private bucket policies were not weakened.

## Payment verification and reversal

An ONLINE_PAYMENT conversation shows **Not Verified** with **Mark Verified**, or **Verified** with its secondary timestamp and **Mark Not Verified**. Verification calls the existing trusted admin operation. Reversal requires confirmation because it changes a confirmed state.

Successful mutations invalidate conversation context, the inbox, order detail, Today's Orders, and daily totals. The UI does not maintain a competing local payment state. CASH orders expose none of these controls.

## Guest expiry and retention

The UI explicitly describes the customer messaging window as active until a timestamp or expired at a timestamp. That customer authorization window is distinct from active-admin access. Expired conversations and their retained history remain visible to the owner according to backend retention.

This phase does not change cleanup policy: payment evidence continues to use the established 30-day retention/cleanup model and is not removed when the 24-hour guest window ends. Ordinary chat-image retention remains governed by the existing messaging/storage policy.

## Polling, refetch, and pagination

TanStack Query refetches on focus. The visible inbox polls every 30 seconds; an open conversation polls every 20 seconds; neither polls in the background or retries in a tight loop. Manual Retry controls remain available for failures.

The inbox requests 30 conversations at a time and exposes **Load More**. Message history requests 50 messages at a time and exposes **Load earlier**. Pages are de-duplicated by stable IDs before display. Initial detail load scrolls to the latest message; replies force the new latest message into view, while polling preserves an administrator's upward reading position unless they were already near the bottom.

## Order-link integration

**View Order** navigates to the existing `/admin/orders` route with the selected order ID in router state. Today's Orders consumes that state and opens its existing detail dialog. Messages does not duplicate cancellation, editing, delivery-fee, or other order operations.

## Loading, empty, and error states

The list and detail use established skeletons instead of blank screens. Empty inbox copy is **No messages yet**; a directly opened order without messages keeps its context and says **No messages in this order yet**. Safe error notices cover list/detail loading, reply, image signing/loading, and payment changes, with Retry where meaningful. Rate-limit retry timing from the established Edge contract is presented without automatic retry loops or raw backend details.

The existing global error boundary remains unchanged and effective.

## Mobile UX, large text, and accessibility

The mobile flow is a full inbox page followed by a full conversation page. Cards, bubbles, timestamps, status groups, payment actions, image viewer, multiline composer, and buttons wrap without horizontal overflow. The composer remains reachable and actions expand where useful on narrow screens.

Sender identity, payment state, expiry state, loading, and errors are textual. Image controls have contextual accessible labels; the dialog has a labelled title/description and close control; form controls have labels; filters expose pressed state; keyboard focus uses the shared focus treatment. Automated browser review covered 320, 360, 390, 430, and 1440 pixels plus 320px Extra Large text.

## Privacy and security

- anonymous and inactive-admin inbox calls are denied by the database;
- Edge message list/reply/signed-read operations require an active admin;
- private images are accessed only with short-lived signed reads;
- guest tokens and token hashes are absent from list responses, frontend storage, and URLs;
- no service-role secret is bundled into frontend code;
- message bodies, customer details, signed URLs, and private media are not logged;
- database and Edge boundaries continue to enforce order association rather than trusting presentation state.

## Files changed

- `supabase/migrations/20261005000000_phase_2_9_admin_messages.sql`
- `src/features/admin-messages/api/admin-messages.ts`
- `src/features/admin-messages/components/AdminMessagesPage.tsx`
- `src/features/admin-messages/components/AdminConversationPage.tsx`
- `src/features/admin-messages/index.ts`
- `src/features/admin-messages/model.ts`
- `src/features/admin-messages/types.ts`
- `src/features/admin-auth/admin-modules.ts`
- `src/features/admin-orders/components/AdminOrdersPage.tsx`
- `src/components/layout/AdminPageHeader.tsx`
- `src/app/App.tsx`
- `src/styles/index.css`
- `tests/frontend/admin-messages.test.mjs`
- `tests/frontend/admin-orders.test.mjs`
- `supabase/tests/database/phase_2_9_admin_messages.sql`
- `tests/local/phase-2-9-admin-fixture.sql`
- `tests/local/phase-2-9-browser-check.mjs`
- `tests/local/phase-2-9-cleanup.sql`
- `Documentation/MARKDOWN/PHASE-2.9-ADMIN-MESSAGES.md`

## Tests and validation

Frontend tests cover dashboard activation, protected list/detail routes, deterministic Back targets, inbox page merging and sort, name/order search wiring, list context and empty state, chronological customer/admin rendering, expiry context, View Order, empty-reply rejection, reply mutation/draft behavior, query invalidation, signed-read viewer/close/failure behavior, payment-receipt labels, verify/reverse states, CASH exclusions, and absence of guest/service credentials.

The 19-assertion pgTAP suite covers RPC privileges, anonymous message denial, private buckets, missing/inactive/active admin behavior, newest-first ordering, both search fields, all operational filters, retained expired history, pagination, omission of guest hashes, and trusted verification context.

The local headless-browser scenario uses clearly fake data and validates:

1. unauthenticated redirect, login, dashboard navigation, and protected-route refresh;
2. inbox search/filter and conversation selection;
3. customer text, ordinary private image, and clearly labelled payment-receipt viewing;
4. blocked empty reply, successful admin reply, and customer-side receipt of that reply;
5. payment verification and reversal reflected back through the customer contract;
6. expired guest-window presentation with retained admin history;
7. absence of verification controls for CASH;
8. View Order and deterministic Back navigation;
9. 320, 360, 390, 430, and 1440px layouts plus 320px Extra Large text without horizontal overflow.

Synthetic orders, messages, attachments, Storage objects, menu data, and fake-admin activation are removed after the run.

## Physical-phone validation

A physical phone was not available in this environment. The real `npm run dev:mobile` LAN, touch, keyboard, and device image-viewer pass therefore remains a manual check. Automated mobile emulation covered the required widths, long message/content wrapping, inbox and conversation navigation, reply, private viewers, payment controls, Back behavior, and Extra Large text, but is not represented as physical-device validation.

## Risks and limitations

- The established history and new inbox cursors are timestamp-based. An unusually large number of records sharing the exact page-boundary timestamp could require a future composite timestamp/ID cursor.
- The inbox intentionally excludes orders without message activity; directly opening a valid order route still presents useful context and its empty state.
- Admin image/attachment sending is not exposed because this phase's operational requirement is secure customer-media review and text replies.
- Polling is moderate rather than realtime, so a visible customer message can take up to roughly 20–30 seconds without focus/manual refetch.
- The final physical-phone keyboard and LAN interaction pass remains outstanding.

## Deferred modules

Settings, Bluetooth printing, generic/push notifications, unread-count infrastructure, customer CRM, and full analytics remain deferred. Printing should wait until the exact printer model and protocol are known.

## Recommended next phase

Proceed to **Phase 2.10 — Settings**: store/carenderia name, logo, font-size preference, logout/settings cleanup, and small already-defined store-level operational settings. Keep Bluetooth printing separate. Do not begin automatically.
