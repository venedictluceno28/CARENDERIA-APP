# CARENDERIA-APP — Phase 1.4

## Production Hardening & Backend Freeze

## 1. Purpose

Phase 1.4 closes the concrete backend release blockers identified in Phase 1.3: abuse rate limiting, automatic payment-evidence cleanup, upload-content validation, and guest-credential persistence review. It also performs a final regression pass across the Phase 1.0–1.3 security boundaries.

The core backend is **functionally ready for UI development**. This is not a production-deployment declaration: the hosted project still requires the explicitly listed deployment validation and secret/Cron configuration.

## 2. Scope Boundaries

This phase does not add customer or admin product screens, a design system, customer accounts, analytics, inventory, Bluetooth printing, or new restaurant workflows. It hardens only existing backend and minimal application-integration surfaces.

## 3. Previous Release Blockers

| Blocker                            | Phase 1.4 result                                                                 |
| ---------------------------------- | -------------------------------------------------------------------------------- |
| Edge/API abuse rate limiting       | PostgreSQL-backed atomic limiter implemented and locally tested.                 |
| Payment-evidence automatic cleanup | Retry-safe worker and reproducible hosted Cron configurator implemented.         |
| Image-content hardening            | MIME allowlist, size limits, and JPEG/PNG/WebP magic-byte agreement implemented. |
| Guest credential review            | Defensive validation and lightweight automated tests added.                      |

## 4. Files Created or Changed

Created:

- `supabase/migrations/20261003030000_phase_1_4_production_hardening.sql`
- `supabase/functions/_shared/rate-limit.ts`
- `supabase/functions/retention-cleanup/index.ts`
- `supabase/functions/.env.example`
- `supabase/tests/database/phase_1_4_production_hardening.sql`
- `supabase/tests/integration/phase_1_4_hardening.ps1`
- `tests/frontend/guest-session.test.mjs`
- This document

Updated:

- `supabase/functions/_shared/messaging.ts`
- `supabase/functions/checkout/index.ts`
- `supabase/functions/guest-access/index.ts`
- `supabase/functions/admin-messaging/index.ts`
- `supabase/config.toml`
- `src/lib/guest-session.ts`
- `src/lib/api/errors.ts`
- `package.json`

Validated Phase 1.0–1.3 migrations were not rewritten.

## 5. Rate-Limiting Architecture

The implementation chooses a lightweight PostgreSQL fixed-window limiter rather than adding external Redis. Supabase's official Edge Function example uses Upstash Redis because atomic in-memory counters scale well, but this carenderia's expected traffic does not justify another account, secret set, billing surface, and operational dependency yet. PostgreSQL already provides atomic `INSERT ... ON CONFLICT ... UPDATE` behavior and is required by every protected operation anyway.

`edge_rate_limits` stores only scope, a SHA-256 identity hash, fixed-window timestamp, count, and expiry. It never stores guest tokens, authorization headers, or raw client identifiers. RLS is enabled and client roles receive no table or function access. A daily `pg_cron` job prunes expired counters.

Relevant Supabase guidance:

- [Edge Function rate limiting with Upstash](https://supabase.com/docs/guides/functions/examples/rate-limiting)
- [Supabase Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits)

### Identity dimensions

- Checkout: forwarded client address.
- Guest actions: forwarded client address and guest-token hash in independent counters.
- Admin messaging: forwarded client address and hashed bearer-session value.
- Scope includes the endpoint/action, so receipt reads cannot consume message-send or signed-read capacity.
- Order code is never a limiter identity or authorization credential.

The Edge layer uses the first `X-Forwarded-For` value because the local Supabase gateway preserves it as the original client address. The hosted gateway/proxy must be validated to confirm that callers cannot inject this position. If the production proxy does not sanitize it, configure a trusted gateway/WAF header before launch; token-scoped guest limits remain an additional independent layer.

## 6. Chosen V1 Limits

| Operation                     | Identity dimensions     | Limit/window       |
| ----------------------------- | ----------------------- | ------------------ |
| Checkout                      | Client address          | 10 per 10 minutes  |
| Guest receipt                 | Address + guest token   | 30 per 10 minutes  |
| Guest message history         | Address + guest token   | 60 per 10 minutes  |
| Guest message send            | Address + guest token   | 20 per minute      |
| Guest reaction                | Address + guest token   | 30 per minute      |
| Guest image upload            | Address + guest token   | 6 per 10 minutes   |
| Guest signed read             | Address + guest token   | 30 per 10 minutes  |
| Admin messaging action        | Address + auth session  | 120 per 10 minutes |
| Admin image upload            | Address + auth session  | 20 per 10 minutes  |
| Supabase Auth signup/sign-in  | Supabase Auth IP bucket | 10 per 5 minutes   |
| Supabase Auth token refreshes | Supabase Auth IP bucket | 120 per 5 minutes  |

These are conservative enough to obstruct simple automation while allowing ordinary mobile retries and conversation activity. They should be reviewed against production logs rather than tuned speculatively.

## 7. Rate-Limit Responses and Failure Behavior

An exceeded application limit returns HTTP 429 with:

```json
{
  "error": {
    "code": "RATE_LIMITED",
    "message": "Too many requests. Please try again later."
  }
}
```

`Retry-After` contains the remaining fixed-window duration. Internal scope/key/counter data is absent.

Limiter infrastructure failure fails closed with HTTP 503 and `RATE_LIMIT_UNAVAILABLE`. This applies to checkout, guest operations, uploads, signed reads, and admin messaging. Those operations already depend on PostgreSQL for authorization or transaction execution, so allowing them through during database failure would not meaningfully preserve availability and would weaken the abuse boundary. Fixed windows automatically recover; stale rows do not permanently disable the store.

Rate limiting never replaces authorization. Invalid/expired/cross-order credentials remain denied below their thresholds.

## 8. Payment-Evidence Cleanup

The confirmed eligibility timestamp remains exactly `order.created_at + interval '30 days'`. Eligibility uses `retained_until <= statement_timestamp()`; it is elapsed-time based and not rounded to a Manila calendar date.

Cleanup uses a narrow claim/delete/complete sequence:

1. `claim_expired_payment_evidence` locks eligible metadata with `FOR UPDATE SKIP LOCKED`, records a claim and attempt, and returns at most 100 objects.
2. The private `retention-cleanup` Edge Function deletes each object through the Storage API. Supabase explicitly recommends the Storage API rather than SQL deletion to avoid orphaned physical objects.
3. Only a successful delete or confirmed `NoSuchKey` result calls `complete_payment_evidence_cleanup`, which sets `deleted_at` and clears the claim.
4. Other failures call `fail_payment_evidence_cleanup`, retain metadata as available/not-deleted, store only a safe failure code, and release the item for retry.
5. Claims older than one hour are recoverable if a worker terminates unexpectedly.

This ordering prefers a retryable orphaned object over falsely claiming a still-existing object was deleted. If object deletion succeeds but the completion call fails, the next run receives `NoSuchKey` and safely completes the tombstone.

Orders, messages, conversations, and attachment metadata remain. Ordinary `CHAT_IMAGE` rows are never selected.

Supabase Storage deletion guidance: [Delete Objects](https://supabase.com/docs/guides/storage/management/delete-objects).

## 9. Cron and Scheduling Strategy

`pg_cron` and `pg_net` are enabled reproducibly by the migration.

- `carenderia-rate-limit-prune` runs at `17 18 * * *` UTC (02:17 Asia/Manila) and needs no network or secret.
- `carenderia-payment-evidence-cleanup` is designed for `30 18 * * *` UTC (02:30 Asia/Manila), once daily.

The evidence job is intentionally not created until deployment secrets exist. In the hosted project:

1. Generate one independent high-entropy cleanup secret.
2. Configure the Edge Function secret `EVIDENCE_CLEANUP_SECRET`.
3. Add Vault secrets named `project_url` and `evidence_cleanup_secret`, using the same cleanup-secret value for the latter.
4. Deploy `retention-cleanup`.
5. As a controlled database operator, execute `select private.configure_phase_1_4_evidence_cleanup_cron();`.
6. Inspect `cron.job` and monitor `cron.job_run_details`.

No secret is embedded in migration text or Cron command text; the command reads Vault at runtime. The worker accepts only POST plus a constant-time checked secret header. Supabase recommends Vault for scheduled Edge calls: [Scheduling Edge Functions](https://supabase.com/docs/guides/functions/schedule-functions).

Local tests invoked the worker directly. Hosted Cron execution and monitoring remain deployment validation because no remote project was changed.

## 10. Storage Restrictions

Both private customer-upload buckets are migration-controlled:

| Bucket             | Public | Maximum | Allowed MIME types                      |
| ------------------ | ------ | ------- | --------------------------------------- |
| `message-media`    | No     | 5 MiB   | `image/jpeg`, `image/png`, `image/webp` |
| `payment-evidence` | No     | 5 MiB   | `image/jpeg`, `image/png`, `image/webp` |

No anonymous/authenticated direct Storage object policies were added. Uploads remain Edge-proxied, paths and UUID filenames remain server-generated, overwrite remains disabled, and signed reads remain short-lived and authorization-gated.

Supabase documents bucket-level file-size/MIME restrictions and private-bucket access controls in [Creating Buckets](https://supabase.com/docs/guides/storage/buckets/creating-buckets) and [Storage Buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals).

## 11. Image Content Validation

The upload boundary now reads the first 16 bytes and recognizes:

- JPEG: `FF D8 FF`
- PNG: the complete eight-byte PNG signature
- WebP: `RIFF` plus `WEBP` at bytes 8–11

The detected format must exactly match the declared allowed MIME type. HTML, SVG, PDF, archives, arbitrary binary data, empty files, MIME spoofing, and files above 5 MiB are rejected before Storage upload. Client filenames/extensions are ignored; the server generates the object ID and extension from validated MIME.

Errors are safe and specific: `INVALID_FILE_TYPE`, `INVALID_IMAGE_CONTENT`, and `FILE_TOO_LARGE`.

Magic-byte validation is deliberately lightweight. It blocks obvious type confusion but does not prove complete image decoding or absence of malicious payloads after the header. A heavyweight image-processing/malware service is not justified for V1.

## 12. EXIF and Privacy

JPEG uploads can still contain EXIF device, timestamp, or location metadata. Phase 1.4 does not claim to strip or transcode it. Doing that reliably requires a maintained decoder/encoder and additional Edge CPU/memory. This is deferred non-blocking privacy hardening; the UI should advise users to upload cropped screenshots/photos when appropriate.

## 13. Guest Credential Persistence Review

`localStorage` remains the pragmatic V1 choice because customers need to reopen receipt/chat after mobile tab or browser restarts and there is no same-origin application server capable of issuing an HttpOnly session cookie.

Security properties now enforced:

- One scoped key: `carenderia.guest-orders.v1`.
- Each token is bound to one validated canonical order code.
- Order code and token formats are validated on read and write.
- Expired entries are ignored and removed.
- Malformed JSON, non-object array values, invalid expiries, invalid tokens, and invalid order codes fail safely.
- Looking up another order never returns the first order's token.
- Checkout storage failure does not turn a successfully created order into a client-visible checkout failure.
- Tokens are not placed in URLs, logs, analytics, or admin-auth state.

`localStorage` is not equivalent to an HttpOnly cookie. Any successful same-origin XSS could read the credential. The accepted V1 tradeoff is bounded by the 24-hour server expiry, order-specific limited authority, private server-side hash, and absence of arbitrary HTML rendering.

## 14. XSS and CSP Review

Static source review found no `dangerouslySetInnerHTML`, direct `innerHTML`, `document.write`, eval-style execution, or user-content HTML rendering. React text interpolation remains the required approach for future message UI; messages must never be treated as trusted HTML.

A production CSP belongs in the hosting/reverse-proxy layer because `connect-src` must name the deployed Supabase origin. Recommended baseline:

```text
default-src 'self';
base-uri 'self';
object-src 'none';
frame-ancestors 'none';
form-action 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob: https://<project-ref>.supabase.co;
connect-src 'self' https://<project-ref>.supabase.co wss://<project-ref>.supabase.co;
upgrade-insecure-requests;
```

The exact deployed header must be tested with Vite assets, Supabase Auth/REST/Functions/Storage, and any later image CDN. CSP is deployment-configured and not locally claimed complete.

## 15. Logging and Error Review

Application Edge Functions contain no request-body, token, authorization-header, customer-payload, payment-image, object-content, or service-key logging. Cleanup responses expose only processed/deleted/failed counts. Stored cleanup errors use a short safe code rather than raw Storage responses.

Public expected errors remain sanitized. New codes are:

- `RATE_LIMITED` (429)
- `RATE_LIMIT_UNAVAILABLE` (503)
- `INVALID_FILE_TYPE` (400)
- `INVALID_IMAGE_CONTENT` (400)
- `FILE_TOO_LARGE` (413)
- `CLEANUP_FAILED` (500, private worker boundary)

Storage paths, limiter keys, token hashes, SQL details, and secrets are not returned.

## 16. Security Regression Review

Phase 1.4 preserves:

- RLS on all application and hardening tables.
- Service-role isolation from React.
- Hash-only guest authorization and readable order-code separation.
- Original-order snapshot immutability.
- Transactional checkout idempotency.
- Active-admin database authorization independent of route guards.
- Private Storage with no direct client object policy.
- Cross-order guest/message/attachment isolation.

Order code alone still grants no receipt, chat, attachment, upload, or mutation access.

## 17. Automated Validation

### Database

- Clean reset applies Phase 1.0–1.4 together.
- Database lint reports no issues.
- Four pgTAP files pass: 142/142 assertions.
- Phase 1.4 covers below/at/over limit behavior, independent identities/actions, hash-only state, client privilege denial, exact cleanup eligibility, claim/retry/idempotency behavior, order/message preservation, chat-media exclusion, bucket restrictions, and Cron configuration gates.

### Edge and Storage

The reproducible PowerShell integration suite validates:

- HTTP 429 `RATE_LIMITED` and `Retry-After`.
- Independent guests and action scopes.
- Authorization still required below limits.
- Valid JPEG, PNG, and WebP upload.
- Ignored client extension with safe server-generated path.
- Disallowed MIME, spoofed MIME/content, and oversized rejection.
- Direct unsigned private read denial.
- Authorized signed read success and 60-second lifetime.
- Cross-order signed-read denial.
- Expired-guest upload and signed-read denial.
- Existing Storage object deletion.
- Missing-object retry completion.
- Order/message preservation and idempotent cleanup rerun.

### Frontend utility

Five lightweight Node tests validate guest credential restoration, wrong-order isolation, expiry removal, malformed-storage handling, invalid credential rejection, and order-specific clearing. No large frontend test framework was introduced.

### Application checks

- ESLint
- TypeScript and production Vite build
- Prettier
- Shared/feature import-boundary scan
- Service-role/browser-secret scan
- XSS-dangerous API scan

## 18. Hosted Validation Requirements

Before production traffic:

| Hosted-only item    | Required action                                                                                                      |
| ------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Evidence Cron       | Configure Edge/Vault secrets, call the Cron configurator, observe successful daily runs and alerts.                  |
| Forwarded client IP | Confirm the hosted gateway sanitizes the first `X-Forwarded-For` value; otherwise supply a trusted proxy header/WAF. |
| Auth rate limits    | Confirm hosted Auth settings match the tracked local intent.                                                         |
| Storage buckets     | Verify deployed private/public flags, 5 MiB limits, and exact MIME lists.                                            |
| CSP                 | Install the deployment header with the real Supabase origin and run browser validation.                              |
| Monitoring          | Alert on cleanup failures, sustained 429s, Auth failures, and Cron job failures.                                     |

No remote Supabase project was linked or modified.

## 19. Production-Readiness Matrix

| Concern                  | Implemented?              | Locally tested?    | Hosted validation required? | Remaining action                          |
| ------------------------ | ------------------------- | ------------------ | --------------------------- | ----------------------------------------- |
| Checkout idempotency     | Yes                       | Yes                | Routine deployment smoke    | Re-run after deploy                       |
| Rate limiting            | Yes                       | Yes                | Yes                         | Validate trusted IP header and thresholds |
| Guest authorization      | Yes                       | Yes                | Routine deployment smoke    | None architectural                        |
| Admin authorization      | Yes                       | Yes                | Routine login smoke         | Provision owner securely                  |
| Payment evidence privacy | Yes                       | Yes                | Yes                         | Verify hosted bucket settings             |
| Evidence cleanup         | Yes                       | Yes, direct worker | Yes                         | Configure Vault/Cron and monitor          |
| File-content validation  | Yes, V1 signatures        | Yes                | Routine deployment smoke    | Optional future full decode/scanning      |
| Storage restrictions     | Yes                       | Yes                | Yes                         | Verify migration result remotely          |
| CSP                      | Recommended               | No                 | Yes                         | Configure at host with real origin        |
| Secrets                  | Yes, source-safe contract | Yes                | Yes                         | Generate Edge/Vault secret                |
| Logging                  | Yes, reviewed             | Yes, static        | Yes                         | Confirm platform log/retention settings   |
| RLS                      | Yes                       | Yes                | Routine deployment smoke    | None architectural                        |
| Cross-order isolation    | Yes                       | Yes                | Routine deployment smoke    | None architectural                        |

## 20. Deferred Non-Blocking Hardening

- Full image decoding/transcoding and malware scanning.
- EXIF stripping.
- Distributed Redis limiter if traffic outgrows PostgreSQL counters.
- Centralized security-event analytics and automated abuse blocking.
- Browser end-to-end suite once Phase 2 establishes stable UI flows.

These do not block beginning UI work. They should be driven by deployment evidence or concrete product requirements.

## 21. Backend Freeze Recommendation

Freeze the core backend after deploying and validating the hosted-only checklist. Major schema/security/business-logic work should pause unless Phase 2 integration exposes a concrete defect. The local backend is functionally ready for UI development; production launch readiness still depends on secrets, Cron, trusted client-IP behavior, CSP, and monitoring in the hosted environment.

## 22. Recommended Next Phase

Proceed to **Phase 2.0 — Design System & Real Application Shell**. Build the mobile-first customer/admin visual foundations and integrate them through the typed boundaries already established. Do not reopen backend architecture speculatively.
