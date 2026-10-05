# Phase 2.9.1 — Realtime Messaging, UI Polish, and Dashboard State Cleanup

## Purpose

Phase 2.9.1 addresses issues found during real use: replies previously depended on polling or refresh, chat surfaces did not feel consistently familiar, some light surfaces could inherit unsuitable text color, and three implemented dashboard actions looked unfinished. The pass improves daily usability without changing order rules, guest authorization, private Storage, or payment-verification trust.

## User-reported issues resolved

- Customer and admin messages now arrive through Realtime-triggered authoritative refetches.
- Admin inbox previews and ordering update when message activity occurs.
- Customer payment state updates without refreshing the page.
- The chat thread uses conventional own-right/other-left bubbles, a bottom composer, predictable scrolling, image enlargement, and a New message affordance.
- Light and dark surfaces now have explicit semantic foreground pairings.
- ULAM POST, ULAM PHOTOS, MESSAGE, ADDRESS BOOK, MANUAL ORDER, and TODAY’S ORDERS share one active dashboard treatment; SETTINGS alone remains disabled and says Coming later.

## Realtime strategy

Realtime transports only an activity hint. A signal invalidates the relevant TanStack Query keys, which refetch through the existing guest-token-authorized Edge API or active-admin-authorized Edge/RPC/direct-RLS boundary. Raw broadcast payloads never become application message or payment state.

This preserves the existing source of truth for guest expiry, cross-order isolation, active-admin checks, pagination, reactions, attachment metadata, and payment state. Polling remains a 60-second foreground-only fallback, and normal focus refetch remains enabled.

## Backend signal design

Migration `20261005010000_phase_2_9_1_realtime_messaging.sql` adds two trigger functions:

- message insert or reaction change emits `{ "kind": "message" }`;
- payment-verification change emits `{ "kind": "payment" }` when an order has a conversation.

No trigger payload contains message text, customer data, payment values, attachment paths, guest credentials, or signed URLs.

Each event is sent to:

- a public `order-messages:<conversation UUID>` topic for the guest browser;
- the private `admin-messages` inbox topic;
- a private `admin-conversation:<conversation UUID>` detail topic.

The high-entropy conversation UUID is already returned only after the token-authorized guest history request or active-admin history request succeeds. Public guest signals contain no private data and grant no API access. Admin topics are private and have a `realtime.messages` SELECT policy requiring `private.is_active_admin()`; clients receive no permission to broadcast on them.

## Why invalidation/refetch remains authoritative

Realtime can be missed during sleep, roaming, or Wi-Fi loss and is not treated as authorization. Event handlers never append raw payloads into the message list. They invalidate the exact receipt, history, context, or inbox query, and existing APIs re-evaluate credentials and return authoritative state.

## Admin inbox subscription

The inbox joins private topic `admin-messages`. Message inserts, reaction changes, and relevant payment changes invalidate the `admin-messages` query family, so the latest preview/time and newest-first ordering are recalculated by the secured inbox RPC. No unread model was invented.

## Open admin conversation subscription

After the authorized history response supplies its conversation ID, detail joins its private conversation topic. Activity invalidates message history, compact order/payment context, and inbox context. The existing reply, signed-read, verification, and reversal operations remain unchanged.

## Customer subscription

After the guest-token-authorized history response supplies its conversation ID, customer chat joins the corresponding public activity topic. Any activity signal invalidates both guest message history and the customer receipt, covering admin replies, reactions, and payment verification changes. A topic alone cannot read history, receipt, or media.

## Reconnect and fallback behavior

The reusable hook owns subscription creation and cleanup. It refetches after a channel resubscribe, browser focus, visibility resume, or network-online event. Recovery performs an immediate refetch signal and one delayed retry after one second because browsers can emit `online` just before requests are usable. The timer and channel are removed on unmount or topic/order change.

Foreground-only 60-second message polling remains a safety net. Receipt polling remains at the established 30 seconds. Realtime or subscription failure therefore degrades to secure refetch rather than a blank screen, and the global error boundary remains unchanged.

## Messaging UI redesign

Both chat surfaces now use familiar semantics:

- the current user/store side aligns right on a solid dark bubble with light text;
- the other sender aligns left on a solid light bubble with dark text;
- sender names remain visible, so meaning is not color-only;
- timestamps and reaction summaries use foreground tokens appropriate to their bubble;
- text preserves line breaks and safely wraps long words and URLs;
- threads have bounded scrolling and overscroll containment;
- composers remain attached to the bottom chat area with safe-area padding and flexible height.

Customer chat photos are now explicit buttons that open an accessible larger dialog while preserving aspect ratio. Payment evidence remains clearly labelled and is never presented as a generic photo. Admin media still obtains a fresh short-lived signed read only when opened.

## Composer and scroll behavior

The existing multiline, attachment, payment-receipt, and Send controls remain large and keyboard-friendly. Customer and admin drafts retain their prior validation/failure behavior.

Initial load and successful send scroll to the latest message. Incoming activity scrolls only when the reader is already near the bottom. If the reader is reviewing older history, the thread stays in place and a **New message ↓** control appears.

## Contrast audit and design tokens

The root design tokens now explicitly pair:

- `surface-light` with `foreground-on-light`;
- `surface-dark` with `foreground-on-dark`;
- `surface-light-muted` for readable neutral regions;
- `muted-on-dark` for timestamps/helper content on dark bubbles.

Reusable `.glass-surface` and `.card` establish a dark foreground on their light surfaces. Messaging bubbles, lists, composers, attachment/error cards, reaction buttons, viewers, receipt cards, and admin attachments explicitly select their correct foreground. The dashboard retains its dark background/light text pairing. The local browser audit measured the customer own-message bubble at 10.81:1.

The review also inspected Today’s Orders, ULAM PHOTOS, ULAM POST, Manual Order, Address Book, menu/cart, checkout, and receipt styles. Their light operational cards already set dark foregrounds or inherit the corrected reusable surface rule; no unrelated redesign was introduced.

## Dashboard active/inactive cleanup

`adminModules` remains the single source of truth for title, route, icon, and enabled state. The obsolete per-card `emphasis` distinction was removed. Every enabled module receives the same active gradient, icon, arrow, pointer, hover, and **Open workspace** semantics. SETTINGS receives a dashed subdued disabled treatment, cannot be clicked, and explicitly says **Coming later**.

## Accessibility

- sender names remain textual;
- enabled and disabled dashboard actions use native button state plus visible text, not color alone;
- image thumbnails and dialogs have contextual labels and keyboard focus styles;
- the message list remains a polite live log;
- New message is a real button;
- error, loading, payment, and expiry states remain semantic text;
- focus, touch targets, wrapping, and Extra Large text support are preserved.

## Security review

- Guest message and receipt APIs still require the matching order code, token, and unexpired guest window.
- Active-admin routes and all admin backend operations remain independently authorized.
- Realtime is a signal, never an authorization decision or source of record.
- Guest activity topics carry only a `kind` string and cannot read another order.
- Private admin topics require an authenticated active admin through Realtime RLS.
- No service-role secret, guest token, raw private path, signed URL, message body, customer name, or payment value appears in broadcast payloads.
- Private Storage and 60-second signed reads are unchanged.
- No guest token is placed in a route or query parameter.

## Files changed

- `supabase/migrations/20261005010000_phase_2_9_1_realtime_messaging.sql`
- `src/lib/realtime/realtime-topics.ts`
- `src/lib/realtime/use-authoritative-realtime.ts`
- `src/features/customer-ordering/components/MessageBoundaryPage.tsx`
- `src/features/admin-messages/components/AdminMessagesPage.tsx`
- `src/features/admin-messages/components/AdminConversationPage.tsx`
- `src/features/admin-auth/admin-modules.ts`
- `src/features/admin-auth/components/AdminShellPage.tsx`
- `src/styles/index.css`
- `tests/frontend/realtime-messaging.test.mjs`
- `supabase/tests/database/phase_2_9_1_realtime_messaging.sql`
- `tests/local/phase-2-9-1-realtime-browser-check.mjs`
- `Documentation/MARKDOWN/PHASE-2.9.1-REALTIME-MESSAGING-UI-POLISH.md`

## Frontend tests

The focused tests cover opaque topic construction, guest/admin query invalidation, inbox and detail subscription scope, payment/receipt refresh wiring, private admin channels, focus/online/visibility recovery, delayed retry, channel cleanup, own/other alignment, semantic contrast classes, long-message wrapping, image viewer, New message affordance, payment-receipt labelling, all six enabled dashboard modules, and disabled SETTINGS.

The complete frontend suite contains 88 passing tests.

## Backend and security tests

The 12-assertion pgTAP file verifies both trigger functions, all three triggers, the single scoped Realtime admin policy, active-admin and topic restrictions, payload minimization, absence of message bodies, and lack of direct anon/authenticated trigger-function execution.

Database lint reports no schema errors. The migration does not add message/order tables to a broad public publication and does not change their established grants or RLS.

## Local two-session realtime E2E

Two isolated headless Chrome profiles were opened concurrently: one guest and one authenticated admin. With no page reload, the run confirmed:

1. the first customer message appeared in the open admin inbox;
2. a second customer message appeared in the open admin detail;
3. the admin reply appeared in customer chat;
4. payment evidence appeared in admin detail with **PAYMENT RECEIPT**;
5. Verified and reversed Not Verified state appeared in customer chat;
6. an admin reply sent while the customer was offline appeared after network recovery;
7. six implemented dashboard actions were enabled and SETTINGS alone was disabled;
8. own-message contrast measured 10.81:1;
9. customer and admin pages had no horizontal overflow at 320, 360, 390, 430, and 1440px;
10. 320px Extra Large text with a keyboard-sized viewport remained usable.

The run used fake local data. Its messages, order, evidence object/metadata, menu fixture, fake-admin activation, browser profiles, and temporary servers were removed afterward.

## Physical-phone validation

A physical phone was not available in this environment. The real `npm run dev:mobile` LAN/touch/keyboard/background-resume pass remains a manual device check. The two-browser emulation covered narrow widths, a 700px keyboard-sized viewport, Extra Large text, network loss/recovery, scrolling, media, and payment controls, but is not represented as physical-device validation.

## Risks and limitations

- Public guest Broadcast topics are bearer-like activity topics derived from a high-entropy conversation UUID. Their payloads contain no private content and cannot authorize data access, but a party who somehow learns a topic could cause that same browser to refetch. Existing API authorization and rate limits still govern every response.
- Realtime delivery is best effort. Foreground polling, focus/resume handling, and reconnect refetch remain intentionally available.
- The production Supabase project must have Realtime enabled with public channels allowed for guest activity topics; private admin topic authorization is migration-managed.
- Receipt polling remains at 30 seconds as an additional fallback, while message polling was reduced to 60 seconds.
- A final physical-device keyboard/background/LAN pass remains outstanding.

## Remaining work

No unread-count infrastructure, push notifications, generic notifications, CRM, analytics, or Settings were added. Bluetooth printing remains deferred until the exact printer model and protocol are known.

## Recommended next phase

Proceed to **Phase 2.10 — Settings** only after this pass is accepted. Cover store/carenderia identity, logo, font-size preference, logout/settings cleanup, and already-defined small store-level operational settings. Do not begin automatically.
