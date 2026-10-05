# Phase 2.3 — Customer Messaging & Payment Evidence UI

## Purpose

Phase 2.3 replaces the receipt messaging placeholder with a real, secure guest conversation tied to one online order. Guests can read and send messages, attach ordinary images, submit payment evidence for manual review, react to messages, and see the current online-payment verification state without creating a customer account or weakening the Phase 1.2 authorization model.

## Scope

- Secure order-linked guest messaging route.
- Receipt and payment context with the fixed guest expiry.
- Chronological, bounded message history with lightweight refresh.
- Plain-text messages, ordinary chat images, and payment-evidence images.
- Authorization-gated signed display for ordinary chat images.
- Minimal guest reactions.
- Dedicated unavailable and expired-access states.
- Mobile-first, large-font-safe conversation and composer design.

Admin messaging UI, payment verification controls, and payment gateways remain out of scope.

## Existing backend contracts

The UI uses the existing `guest-access` Edge Function and its `receipt`, `list_messages`, `send_message`, `react`, `signed_read`, and multipart upload operations. It uses the Phase 1.3 guest-session store for the order-code/token pair and the Phase 1.4 safe error and rate-limit contract.

The backend remains authoritative for authorization, the exact 24-hour expiry, message limits, attachment classification, image byte validation, private object paths, signed reads, payment method, and payment verification state.

## Feature architecture

Messaging remains inside `src/features/customer-ordering` because it directly depends on the receipt and guest-order flow. Pure validation, ordering, payment-display, reaction, and safe-error helpers live in `messaging/messaging-model.ts`. Shared guest API and session behavior remain in `src/lib`.

## Route and access model

The existing `/order/receipt/:orderCode/message` route now renders the real conversation. The readable order code remains in the route as a support reference. It is not authorization: every private operation also sends the separately persisted guest token in the request body. The token is never placed in the URL, displayed, logged, or copied into analytics.

## Guest session restoration

The route classifies the local credential as valid, expired, or unavailable before loading private state. A valid session still undergoes backend authorization on every receipt, history, send, reaction, upload, and signed-read request. Missing or malformed storage never falls back to order-code-only access.

## Conversation header

The header displays the order code, payment method, current verification state for ONLINE PAYMENT, and the actual conversation expiry returned by the backend. It explains that guest messaging lasts 24 hours from order creation and is not extended by sending messages. CASH orders omit the irrelevant verification badge.

## Message list

TanStack Query loads the newest bounded page and supports “Load earlier messages” using the backend `before` timestamp contract. Pages are deduplicated and sorted by creation time and ID. Guest and store messages use different alignment, surface shape, and explicit sender labels, so sender meaning does not rely on color alone.

Text is rendered as ordinary React text with preserved line breaks and aggressive safe wrapping. No HTML rendering or dangerous injection API is used. The list refreshes every 20 seconds and on window focus, with an explicit Refresh action for asynchronous admin replies.

## Message composer and text messaging

The composer supports text-only, attachment-only, and combined messages. A completely empty submission is disabled and rejected. Text is limited to 2,000 characters before submission while the server remains authoritative. Successful sends clear the draft and refetch history; failed sends preserve the text and selected image for retry.

## Image attachments

The file picker accepts JPEG, PNG, and WebP from gallery, screenshot selection, or normal browser camera choices. It does not force camera capture. Client validation rejects empty, unsupported, and over-5-MiB selections early. The selected filename, size, purpose, and a small local preview are shown with a remove action.

Uploads use the existing multipart Edge proxy. Guests never choose a Storage path, receive a write credential, or write attachment metadata directly. Upload loading disables duplicate actions. Backend MIME and content checks remain final.

## Payment-evidence upload

ONLINE PAYMENT shows a distinct Payment receipt action and explains that evidence is reviewed manually. It sends purpose `PAYMENT_EVIDENCE`; ordinary photos use `CHAT_IMAGE`. CASH does not emphasize payment evidence.

Uploading evidence does not change verification state. The conversation shows a secure evidence card after upload while the header continues to show the authoritative Not Verified or Verified value.

## Payment verification display

Receipt context refetches every 30 seconds and on window focus. An online order shows Not Verified until the backend reports `VERIFIED`; it then changes to Verified. CASH shows neither state.

## Signed media access

Ordinary chat images request a 60-second signed path for the exact authorized attachment. The client resolves the relative path against the configured Supabase origin, keeps the query cache short, and refreshes the signature at a restrained interval.

Phase 1.2 deliberately denies guest signed reads for `PAYMENT_EVIDENCE`. The UI respects that boundary: it shows that evidence was sent securely for admin review rather than requesting or exposing the private image. Both Storage buckets remain private.

## Reaction UI

Guests can choose 👍, ❤️, or 🙏, replace their current reaction, or click it again to clear it. The UI shows “You reacted” and “Store reacted” labels separately. The backend still verifies that the message belongs to the authorized order conversation.

## Guest expiry and invalid-session UX

An expired local credential or backend expiry response shows a dedicated “Guest messaging for this order has expired” state with the order code as a support reference. Missing or malformed access shows “Messaging unavailable” and explicitly states that the order code alone cannot open messages. Neither state exposes token or backend diagnostics.

## Rate-limit, authorization, and network errors

Safe messaging errors now include the existing guest-expiry, authorization, message, reaction, attachment, and request codes. `RATE_LIMITED` uses Retry-After when readable. Network send failures explain that the result was not confirmed and keep the draft. Invalid type, size, or image content receives plain customer-facing language. Cross-order and rejected credentials collapse to unavailable private access rather than revealing order existence.

## Mobile keyboard behavior

The conversation uses document flow instead of a brittle fixed `100vh` layout. The composer remains at the end of the conversation, includes safe-area bottom padding, and uses a resizable textarea with large touch controls. This avoids trapping the message list behind the phone keyboard.

## Privacy and security

- Message bodies, guest tokens, private paths, signed URLs, and payment images are not logged.
- No private content is placed in route queries.
- All text is untrusted plain text.
- Object URLs used for local previews are revoked when replaced or unmounted.
- Signed media URLs are short-lived and not persisted.
- Payment evidence remains classified separately and does not verify payment.
- Guest activity never extends the backend expiry.

## Accessibility

The history is exposed as a labelled live log with explicit sender names and semantic times. The composer has a label, length guidance, announced errors, and accessible attachment/remove controls. Reaction buttons expose pressed state and descriptive labels. Payment status and sender identity use text rather than color alone. Loading, empty, error, and expired states have readable semantics.

## Responsive and large-font design

Message bubbles have bounded widths, plain high-contrast surfaces, flexible headers, and `overflow-wrap` handling for long URLs. Attachment cards, previews, reactions, context rows, composer actions, and buttons collapse safely below 480px. No fixed message-bubble or composer height prevents text growth.

Exact browser metrics at 320px, 360px, 390px, 430px, and desktop reported `scrollWidth === clientWidth`. A populated 320px Extra Large text conversation with a long URL, reactions, evidence, and images was visually reviewed without horizontal clipping.

## Files changed

- `src/features/customer-ordering/components/MessageBoundaryPage.tsx`
- `src/features/customer-ordering/messaging/messaging-model.ts`
- `src/lib/api/guest-access.ts`
- `src/lib/api/errors.ts`
- `src/lib/guest-session.ts`
- `src/styles/index.css`
- `tests/frontend/guest-session.test.mjs`
- `tests/frontend/messaging.test.mjs`
- `tests/local/phase-2-3-browser-check.mjs`
- `Documentation/MARKDOWN/PHASE-2.3-CUSTOMER-MESSAGING-PAYMENT-EVIDENCE.md`

No backend migration, Edge Function, RLS policy, or Storage policy changed.

## Frontend tests

The frontend suite covers valid/expired/unavailable session classification; text, attachment-only, combined, and empty composer rules; supported and invalid file selections; 5-MiB rejection; chronological page merging; explicit admin sender semantics; online-versus-cash evidence behavior; authoritative Not Verified/Verified display; reaction replacement/clearing; rate limits; expired/denied access; invalid image content; and network draft-preservation messaging.

## End-to-end local validation

A short-lived, clearly fake local menu was published against the local Supabase stack. Headless Chrome completed a real ONLINE_PAYMENT checkout and opened Messages from the receipt. The run confirmed:

- Empty conversation state before the first send.
- Text send and restoration after full page refresh.
- Guest credential persistence without token output.
- Payment-evidence and ordinary chat-image uploads through the Edge proxy.
- One `PAYMENT_EVIDENCE` and one `CHAT_IMAGE` metadata record for the final order.
- Private chat image display through an authorized signed read.
- Payment evidence represented as admin-review-only.
- Payment remained `NOT_VERIFIED` after evidence upload.
- Guest reaction update and restoration.
- Guest token absent from the URL.
- Both Storage buckets remained private with the 5-MiB JPEG/PNG/WebP constraints.

The reusable local browser check contains no credential values and reports only boolean security/UX outcomes and the non-secret order reference.

Creating an admin reply and changing payment verification through an admin UI were not practical because Phase 2.4 has not implemented that interface. Admin-message rendering is covered by the frontend model test, and the customer query refresh strategy is ready to display backend replies and verification changes.

## Physical-phone validation

No physical phone was available in this coding environment. The existing `npm run dev:mobile` and LAN Supabase setup remain available, but gallery/camera selection, real software-keyboard behavior, rotation, OS Extra Large text, and private-image display on a handset require manual confirmation. This limitation is recorded rather than marked as passed.

## Backend and security impact

There are no backend changes. Guest authorization still requires the order code plus matching high-entropy token and unexpired order window. RLS, service-role-only guest RPCs, private buckets, server-selected paths, content validation, signed-read authorization, cross-order denial, fixed expiry, evidence classification, and payment verification rules remain unchanged.

## Risks and limitations

- The app uses authoritative refetch instead of optimistic messages, so slow networks may delay the newly sent bubble.
- Proxying images through the Edge Function has the existing bandwidth/runtime cost.
- Signed chat images require periodic short-lived URL renewal while visible.
- Guests cannot reopen payment evidence by design; only the admin can signed-read it.
- Full physical-phone validation remains manual.
- Admin replies and verification changes require backend/admin tooling until Phase 2.4 provides the UI.

## Deferred admin messaging

This phase does not add an admin chat interface. It also does not add order operations, menu administration, address book, manual orders, settings, or printing.

## Recommended next phase

Proceed with **Phase 2.4 — Admin Dashboard & Today’s Orders**: mobile admin dashboard actions, Today’s Orders, order details, cancellation/restoration, payment verification, and rider totals/reconciliation. Do not begin it automatically.
