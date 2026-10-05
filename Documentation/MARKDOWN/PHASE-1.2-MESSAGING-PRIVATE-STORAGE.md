# CARENDERIA-APP — Phase 1.2

## Messaging, Guest Receipt Access & Private Storage

## 1. Purpose

Phase 1.2 implements the backend boundary for temporary order-linked guest receipt/chat access and privately retained image attachments. The readable order code remains a support identifier only. Every guest-private operation requires the matching high-entropy token issued by checkout, hashed exactly as in Phase 1.1, and an unexpired guest window.

No customer accounts, chat UI, receipt UI, payment gateway, or Bluetooth printing were added.

## 2. Previous-Phase Dependencies

Phase 1.2 relies on:

- Phase 1.0 order, order-item, admin-profile, RLS, and immutable-snapshot foundations.
- Phase 1.1 atomic checkout, `CRD-` order codes, 256-bit base64url guest tokens, lowercase SHA-256 token hashes, exact 24-hour guest expiry, and active-admin authorization.
- The Phase 0.4 recommendation for one conversation per online order, separate message/attachment records, private Storage, and payment evidence retained for 30 days from order creation.

All three migrations apply cleanly in timestamp order. No Phase 1.0 or Phase 1.1 migration was edited.

## 3. Files Created or Changed

Created:

- `supabase/migrations/20261003010000_phase_1_2_messaging_private_storage.sql`
- `supabase/functions/_shared/messaging.ts`
- `supabase/functions/guest-access/index.ts`
- `supabase/functions/admin-messaging/index.ts`
- `supabase/tests/database/phase_1_2_messaging_private_storage.sql`
- `Documentation/MARKDOWN/PHASE-1.2-MESSAGING-PRIVATE-STORAGE.md`

Updated:

- `supabase/config.toml`

No product clarification was required in the living specification.

## 4. Messaging Architecture

```text
Guest browser
  → guest-access Edge Function
    → SHA-256 token hash
    → service-role-only guest RPC
      → matching order + unexpired guest window

Authenticated admin browser
  → admin-messaging Edge Function
    → RPC invoked with the admin JWT
      → auth.uid() + active admin_profiles check

Private images
  → controlled Edge upload
  → service-role Storage write to a server-generated path
  → trusted attachment finalization
  → authorization-gated 60-second signed read
```

The Edge Functions are intentionally small routers. Shared token hashing, RPC, Storage, response, and safe-error logic lives in `_shared/messaging.ts`.

## 5. Conversation Model

`conversations` contains:

- UUID identity
- Unique `order_id`
- `created_at`
- Fixed `expires_at`
- Optional `closed_at`

Creation is lazy. The first authorized receipt/chat-related operation that needs a conversation creates it. Its `created_at` and `expires_at` are copied from the online order, so lazy creation never resets or extends the guest lifetime. A unique order constraint enforces zero-or-one conversation.

Manual orders do not automatically receive conversations.

## 6. Message Model

`messages` contains one conversation reference, sender type (`GUEST` or `ADMIN`), optional admin identity, optional text, reactions, and timestamps.

Text is trimmed and limited to 2,000 characters. Text-only sends require non-empty text. An attachment send may contain an optional caption; trusted finalization creates the message and attachment metadata together.

Message history uses bounded chronological pagination. Requests accept an optional `before` timestamp and a limit from 1 through 100, defaulting to 50.

## 7. Reaction Representation

V1 uses two nullable fields on each message:

- `guest_reaction`
- `admin_reaction`

Each side has at most one current reaction, limited to 32 characters. This avoids a generalized reactions table before the UI reaction set is confirmed. Either side may replace or clear its own current reaction through an authorized operation.

## 8. Attachment Model

`message_attachments` stores:

- UUID assigned before upload
- Owning order and optional message
- Purpose and private bucket
- Server-controlled Storage path
- Server-observed MIME type and byte size
- Creator type and optional admin identity
- Creation, retention, and deletion metadata

Allowed purposes are:

- `CHAT_IMAGE`
- `PAYMENT_EVIDENCE`

Attachment metadata cannot be inserted directly by guests or ordinary authenticated clients.

## 9. Payment-Evidence Classification

Payment evidence is allowed only for an `ONLINE_PAYMENT` order. It uses the separate private `payment-evidence` bucket and receives:

```text
retained_until = order.created_at + 30 days
```

Uploading evidence does not modify payment verification. The order remains `NOT_VERIFIED` until an active admin uses the existing Phase 1.1 verification operation after reviewing the evidence.

Guest signed reads deliberately exclude `PAYMENT_EVIDENCE`. Active admins may request signed access while the evidence is within its retention window.

## 10. Guest-Token Validation

The Edge Function accepts the plaintext 43-character base64url token in the request body, never in an object path. It hashes the exact encoded token with SHA-256 and produces the same lowercase 64-character hexadecimal representation used by checkout.

The reusable database helper requires:

- Canonical matching order code
- Matching stored token hash
- `source = ONLINE`
- `guest_chat_expires_at > statement_timestamp()` when guest access is required

Invalid tokens, mismatched order/token pairs, and missing tokens all fail without revealing which value was wrong. Stored hashes are never returned.

## 11. Guest Receipt Access

The `receipt` action returns only customer-facing current order data:

- Order code and customer/address details
- Location selection
- Item names, categories, quantities, unit prices, and subtotals
- Food, delivery, and grand totals
- Payment method/current verification state
- Cancellation flag, creation time, and guest expiry

It excludes Internal DF, calculated rider amounts, token hashes, original snapshots, admin identities, and reconciliation data. Receipt reopening expires with the same 24-hour guest window.

## 12. Guest Messaging Authorization

Guest list, send, react, upload, and signed-read operations all revalidate the token/order pair and expiry in PostgreSQL. A token for order A cannot act on order B, even when supplied with order B's readable code, conversation ID, message ID, attachment ID, or path.

Guest message activity never changes either `orders.guest_chat_expires_at` or `conversations.expires_at`.

## 13. Admin Messaging Authorization

The admin Edge Function requires a bearer token. Database RPCs are invoked with that user JWT, not with service-role identity, so `auth.uid()` must match an active `admin_profiles` row.

Active admins can:

- Read retained online-order message history after guest expiry
- Send admin messages
- Set the admin reaction
- Upload chat images or appropriate payment evidence
- Request signed attachment access during the applicable retention period

Inactive or unauthenticated admins are denied. Service-role Storage actions happen only after the user-JWT RPC authorizes the domain operation.

## 14. Guest-Expiry Enforcement

Guest receipt, history, send, reaction, upload authorization, finalization, and signed reads all require the current time to be before the order's fixed guest expiry.

After expiry, the order, conversation, messages, attachments, and retained payment evidence remain stored. Only guest-private access closes. Admin historical access remains subject to active-admin authorization and evidence retention.

## 15. Payment-Evidence Retention

Evidence becomes cleanup-eligible exactly 30 elapsed days after order creation. The migration adds a focused retention index and an admin-only query for eligible objects.

Automatic deletion is intentionally deferred. Safe cleanup must delete the Storage object first, then tombstone attachment metadata. Until that worker exists, expired evidence is denied new signed access but may remain physically stored. Production must not claim automatic 30-day deletion until that worker is deployed and monitored.

Normal `CHAT_IMAGE` records currently have no deletion deadline because no ordinary-image retention policy is confirmed. They remain with conversation/admin history for now.

## 16. Private Storage Design

Two buckets are created:

| Bucket             | Public | Purpose                          |
| ------------------ | ------ | -------------------------------- |
| `message-media`    | No     | Guest/admin ordinary chat photos |
| `payment-evidence` | No     | Sensitive payment screenshots    |

Both allow only JPEG, PNG, and WebP and enforce a 5 MiB maximum at bucket level. No anonymous or authenticated direct `storage.objects` policy is created. Client listing, arbitrary upload, overwrite, and deletion are therefore unavailable.

The service role exists only in Edge runtime environment variables and is never returned to callers.

## 17. Upload Flow

V1 uses an Edge-proxy upload rather than issuing client-writable signed upload slots:

1. Accept one multipart image, optional caption, purpose, and order authorization.
2. Enforce request, MIME, count, text, and 5 MiB limits.
3. Authorize the order/purpose in PostgreSQL.
4. Generate an attachment UUID and exact path server-side.
5. Upload with `x-upsert: false` using the Edge-held service credential.
6. Revalidate authorization and atomically create message/attachment metadata.
7. Delete the uploaded object if metadata finalization fails.

This uses more Edge bandwidth than direct signed uploads but provides the smallest secure V1 surface: guests never choose paths, receive write credentials, or create arbitrary metadata.

## 18. Signed Read Flow

Signed reads are two-step:

1. A guest/admin authorization RPC verifies order ownership, expiry, purpose, and retention.
2. The Edge Function creates a 60-second Storage signature for that exact bucket/path.

The response contains an origin-independent `/storage/v1/...` signed path and `expiresIn: 60`. The application resolves the path against its configured Supabase origin. Raw bucket paths are never returned as customer DTO fields, and permanent public URLs are not created.

## 19. File Restrictions

- One image per upload request
- JPEG, PNG, or WebP only
- 5 MiB maximum
- Optional caption limited to 2,000 characters
- No overwrite (`x-upsert: false`)
- Random UUID filename
- Server-selected bucket, folder, extension, and complete path
- Database revalidation of MIME, size, purpose, ownership, and exact expected path

This phase validates declared request MIME and the server-observed multipart size. It does not decode image magic bytes, transcode, strip metadata, or run malware scanning. Those are documented deployment hardening items.

## 20. Cross-Order Security

The database tests verify that token A cannot:

- Read order B's receipt
- Read conversation B
- React to a message in B
- Read B's attachment
- Finalize metadata into B's object path

An order code without the matching token is rejected. Storage paths contain UUIDs but never rely on obscurity; all reads are signed only after domain authorization.

## 21. RLS and Grants

- RLS is enabled on conversations, messages, and attachments.
- `anon` and `authenticated` receive no insert/update/delete grants.
- Anonymous users have no direct reads.
- Active admins receive read-only table access through existing `private.is_active_admin()` checks.
- Guest RPCs are revoked from `PUBLIC`, `anon`, and `authenticated`, then granted only to `service_role`.
- Admin RPCs are revoked from `PUBLIC` and `anon`, granted to `authenticated`, and enforce the active-admin helper internally.
- Both private buckets have no direct client Storage policy.

## 22. Safe Response Contracts

Guest responses use explicit JSON projections. Message DTOs omit admin UUIDs and Storage paths. Attachment DTOs expose only attachment ID, purpose, MIME type, size, and creation time. Receipt DTOs omit internal delivery/rider/security data.

Expected authorization and validation errors map to stable safe codes. SQL details, token hashes, service credentials, bucket paths, unrelated order existence, and raw internal exceptions are not returned.

## 23. Rate-Limit Requirements

Local Supabase does not provide the deployment's final abuse-control layer. Before public launch, infrastructure-level limits are required at minimum for:

- Checkout attempts per IP/device window
- Receipt and message-history lookup failures
- Guest message sends
- Image upload attempts and total bytes
- Signed URL generation
- Admin authentication failures

The implemented body, pagination, text, MIME, attachment-count, and file-size limits are defensive validation, not a replacement for rate limiting.

## 24. Checkout-Idempotency Status

Checkout idempotency remains the highest-priority public-launch blocker. It was not mixed into Phase 1.2 because it changes the checkout request/uniqueness contract and deserves isolated migration and retry tests. Clients must not blindly retry a checkout after an ambiguous successful network response.

## 25. Database Tests

The existing 42 Phase 1.1 assertions and 43 new Phase 1.2 assertions all pass (85 total). Phase 1.2 coverage includes:

- Direct grant denial and service-role-only guest RPC execution
- Private bucket configuration
- Valid, invalid, absent, expired, and cross-order tokens
- Safe receipt projection
- Lazy conversation uniqueness and fixed expiry
- Guest/admin send, list, and reactions
- Cross-conversation and cross-path rejection
- Attachment ownership/classification
- Exact 30-day evidence deadline
- Guest evidence-read denial
- Evidence not changing verification
- Admin access after guest expiry
- Inactive-admin denial
- Absence of direct client Storage policies

## 26. Storage Tests

Local Storage integration verified:

- Controlled guest image upload through the Edge Function: passed
- Direct unsigned private-object read: denied (HTTP 400)
- Authorization-controlled signed read: passed (HTTP 200)
- Signed lifetime response: 60 seconds
- Server-generated path and no-overwrite upload: passed

Automatic evidence cleanup and production Storage lifecycle monitoring remain deployment validation items.

## 27. Edge Function Tests

All Edge Functions compiled and served in the local Supabase Edge runtime. End-to-end smoke tests verified checkout → receipt → private upload → signed read. The admin endpoint returned HTTP 401 without authorization. Admin database behavior is covered with authenticated-role pgTAP tests.

## 28. Runtime Validation

Completed locally:

- Clean `supabase db reset` with Phase 1.0, 1.1, and 1.2
- `supabase db lint --level warning` with no issues
- 85/85 pgTAP assertions
- Edge and local private-Storage integration tests
- ESLint
- Production build
- Prettier validation

No remote Supabase project was linked or modified.

## 29. Deferred Work

- Customer/admin chat and receipt UI
- Payment-evidence UI
- Automated evidence cleanup worker and tombstone operation
- Ordinary message/image retention policy
- Image signature decoding, EXIF stripping, transcoding, and malware scanning
- Production rate limiting and monitoring
- Checkout idempotency
- Customer accounts
- Payment gateway/OCR verification
- Bluetooth receipt printing

## 30. Risks and Limitations

- Proxying 5 MiB files through Edge Functions consumes runtime bandwidth and execution time; direct signed uploads may be appropriate later after adding a durable upload-reservation model.
- MIME validation does not prove the bytes decode as the declared image type.
- Failed processes can still leave rare Storage/database orphans despite best-effort cleanup; production needs an orphan audit.
- Evidence objects are not automatically deleted at 30 days yet.
- Ordinary chat retention is intentionally unspecified and therefore currently indefinite.
- Relative signed paths require clients to resolve against the configured Supabase origin.
- Without deployment rate limiting, public endpoints remain susceptible to request abuse.
- Without checkout idempotency, ambiguous network retries can create duplicate orders.

## 31. Recommended Next Phase

Before UI work or public launch, implement a focused **Phase 1.3 — Checkout Idempotency, Retention Cleanup & Production Abuse Controls**. It should add an idempotency contract, a monitored evidence cleanup/tombstone worker, orphaned-object reconciliation, image-content validation decisions, and deployment rate-limit configuration/tests.

Stop after Phase 1.2. Do not proceed automatically to messaging UI or receipt UI.
