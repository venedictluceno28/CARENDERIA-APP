# CARENDERIA-APP — Phase 1.3

## Checkout Idempotency, Admin Authentication & Application Integration

## 1. Purpose

Phase 1.3 resolves ambiguous checkout retries and establishes the minimum secure React/Supabase integration boundary. It adds transactional checkout idempotency, a browser Supabase client, email/password admin login, active-admin route authorization, TanStack Query server state, typed API clients, and temporary guest-token persistence.

This phase does not implement the final admin dashboard, customer ordering screens, receipt/chat UI, or final visual system.

## 2. Dependencies

The implementation preserves and builds on:

- Phase 1.0 core schema, RLS, immutable order snapshots, and active-admin helper.
- Phase 1.1 trusted checkout and admin order operations.
- Phase 1.2 guest receipt/messaging and private Storage boundaries.
- Supabase Auth, React Router, React Hook Form, and TanStack Query.
- `@supabase/supabase-js` for supported browser session handling.

## 3. Files Changed

Created:

- `supabase/migrations/20261003020000_phase_1_3_checkout_idempotency.sql`
- `supabase/tests/database/phase_1_3_checkout_idempotency.sql`
- `src/lib/supabase/client.ts`
- `src/lib/api/errors.ts`
- `src/lib/api/edge.ts`
- `src/lib/api/checkout.ts`
- `src/lib/api/guest-access.ts`
- `src/lib/api/admin-operations.ts`
- `src/lib/guest-session.ts`
- `src/features/admin-auth/`
- `src/vite-env.d.ts`
- This document

Updated:

- `supabase/functions/checkout/index.ts`
- `supabase/config.toml`
- `src/app/App.tsx`
- `src/main.tsx`
- `src/styles/index.css`
- `package.json` and `package-lock.json`

Earlier validated migrations were not rewritten.

## 4. Checkout Idempotency Design

Each checkout attempt owns two independent client-generated secrets:

- A UUIDv4 idempotency key, reused only for retries of the same intended checkout.
- A 256-bit base64url guest token, reused with that attempt and returned in the successful result.

The browser sends both only in the POST body. The Edge Function validates them and sends only SHA-256 hashes to PostgreSQL. Neither plaintext value is stored in the database. Having the client retain the pending guest token is necessary because a server cannot reconstruct a hash-only credential after the original HTTP response is lost.

The checkout intent fingerprint is a SHA-256 digest of canonical JSON containing normalized menu ID, sorted item IDs, quantities, reviewed prices, customer name, address, location selection, and payment method. Authoritative totals are deliberately absent. The fingerprint detects key reuse; it never determines pricing.

## 5. Database Implementation and Concurrency

`checkout_idempotency` stores:

- Primary-key idempotency-key hash
- Request fingerprint
- Guest-token hash
- Unique completed order reference
- Creation/completion timestamps

The service-role-only nine-argument `create_online_order` overload performs the following in one PostgreSQL transaction:

1. Canonicalize and hash the request intent.
2. Insert the key claim with `ON CONFLICT DO NOTHING`.
3. Lock the claimed row with `FOR UPDATE`.
4. Reject a fingerprint or guest-token mismatch with `IDEMPOTENCY_CONFLICT`.
5. Return the existing safe checkout result when already completed.
6. Otherwise call the existing trusted checkout implementation and associate the resulting order before commit.

The primary key is the final concurrency authority. Two simultaneous requests with the same key serialize on the same row. Only one can create an order; the other reconstructs the same successful response after the first transaction commits. Validation or creation failures roll back the provisional key row, allowing a corrected request with that key when no order was created.

The response projection now explicitly excludes Internal DF and other operational fields on both first success and replay.

## 6. Idempotency Request Contract

The checkout Edge request adds:

```json
{
  "idempotencyKey": "UUIDv4",
  "guestToken": "43-character base64url token"
}
```

The application creates both once with `createCheckoutAttempt()` and passes that same attempt to `submitCheckout()` for every retry. A genuinely new order intent must use a new attempt. An equivalent replay returns HTTP 200 with `idempotent_replay: true`; the first creation returns HTTP 201. Conflicting reuse returns HTTP 409 and `IDEMPOTENCY_CONFLICT`.

## 7. Supabase Browser Client

The lazy singleton in `src/lib/supabase/client.ts` uses only:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Both already exist as blank placeholders in `.env.example`. Missing configuration produces a safe setup message instead of crashing the public route. Private server credentials are never read by or bundled into React.

## 8. Admin Authentication Architecture

Authentication and authorization remain distinct:

```text
Supabase Auth session
  + matching admin_profiles row
  + is_active = true
  = authorized admin application access
```

`AuthProvider` narrowly owns session restoration and auth-state changes. `useAdminProfile` uses TanStack Query for the current server-side profile. The database RLS policy exposes only the caller's active profile, so a missing or inactive profile fails closed.

Route guards are UX controls only. Existing database admin functions continue to call the active-admin authorization helper independently.

## 9. Initial Admin Provisioning

There is no public admin registration route or signup button. Project-wide self-signup remains disabled. Email/password login is enabled so pre-provisioned users can authenticate.

For V1:

1. Create the initial user through the Supabase Dashboard/Auth administration interface or another controlled operator process.
2. Insert the matching `admin_profiles` row through controlled database administration.
3. Set `is_active = true` only after verifying the account belongs to the owner.

Application clients receive no permission to create or activate admin profiles.

## 10. Login, Protected Routing, and Session Handling

`/admin/login` provides email, password, submit/loading state, and safe credential errors using React Hook Form. It has no signup action.

`/admin` restores the Supabase session, then separately queries the active profile. Unauthenticated users are redirected to login. Authenticated non-admin or inactive-admin users receive a denial screen and can sign out. Active admins reach a minimal placeholder showing their display name or email.

The SDK manages persisted sessions, automatic token refresh, URL session detection, logout, and auth-state notifications. Passwords and auth tokens are never manually stored by application code. Logout clears the admin-profile query state.

## 11. TanStack Query

The existing root `QueryClientProvider` is retained. Current active-admin profile data uses a stable user-scoped query key and a one-minute stale window. Supabase Auth session state remains in the narrow auth context rather than being treated as ordinary query data.

## 12. Guest-Token Browser Persistence

The implementation uses `localStorage`, scoped under one application key and keyed by canonical order code. This choice preserves receipt/chat reopening after a mobile tab or browser is closed, which `sessionStorage` would not reliably support.

The tradeoff is that both storage mechanisms are readable by same-origin JavaScript if an XSS vulnerability exists. Mitigations in this phase are deliberately simple:

- Store only order code, guest token, and expiry.
- Remove expired records whenever storage is read or written.
- Never place the token in a URL.
- Never log or send it to analytics.
- Keep the database token hash-only and enforce the fixed server-side 24-hour expiry.

This is a temporary browser credential store, not a general-purpose vault.

## 13. Typed API Boundaries

The checkout client exposes typed intent, attempt, result, safe-error, and replay fields. It persists the successful order/token association only after a valid response.

The guest-access client establishes typed wrappers for receipt retrieval, message history, text send, reactions, image upload, and signed attachment access. Tokens remain in POST bodies/form fields.

The admin operations module establishes a shared RPC boundary with a typed daily-totals operation. Future admin features should add focused methods there instead of placing raw RPC calls in presentation components.

Shared modules do not import features. `admin-auth` imports shared code and no sibling feature.

## 14. Error Handling

`AppError` maps known public codes without exposing raw PostgreSQL details. Checkout includes Phase 1.1 codes plus `IDEMPOTENCY_CONFLICT`. Network and configuration failures have separate safe client messages. Unexpected server failures remain `CHECKOUT_FAILED`/`UNKNOWN_ERROR` at public boundaries.

## 15. RLS and Security Preservation

- Idempotency rows have RLS enabled and no anonymous/authenticated table privileges or policies.
- Only the service role can execute the idempotent checkout RPC.
- Direct order mutation/read remains denied to anonymous clients.
- Active-admin RLS and function checks were not weakened.
- Guest operations still authorize the order/token pair and fixed expiry server-side.
- Customer ordering remains unauthenticated.
- The browser uses only public Supabase client credentials.

The pre-existing eight-argument checkout RPC remains service-role-only for backward-compatible database tests and as the internal trusted creation primitive. The Edge/public application path exclusively calls the idempotent overload.

## 16. Database and Edge Tests

The Phase 1.3 pgTAP suite covers:

- First creation and exact replay
- Same returned order and no second order
- Changed cart, address, payment method, or guest token conflict
- Different keys creating legitimate distinct orders
- Hash/fingerprint format and separation
- Safe result projection
- Primary-key concurrency authority
- No anonymous/authenticated idempotency-table exposure
- Service-role-only RPC execution

All three pgTAP files pass: 105 assertions total.

A simultaneous two-request local Edge smoke test returned two successful responses for one order: one creation and one replay. Direct database verification confirmed exactly one order row.

## 17. Auth Validation

Automated local Supabase integration checks passed for:

- Invalid password rejection
- Authenticated user without an admin profile denied
- Inactive admin profile denied
- Active admin profile allowed
- Session refresh/restoration
- Logout invalidating refresh capability

Phase 1.1 pgTAP continues to verify that database admin functions reject callers without an active admin identity. Public signup remains disabled and should also be confirmed in each deployed environment.

No browser automation framework is installed. Before deployment, manually verify in a real browser that `/admin` redirects when signed out, an active owner reaches the shell after login/reload, denied users cannot reach it, logout redirects on the next guard evaluation, and an expired session returns to login.

## 18. Frontend and Supabase Validation

Completed locally:

- Clean `supabase db reset` across Phase 1.0–1.3
- `supabase db lint --level warning` with no findings
- Full pgTAP suite: 105/105
- Concurrent checkout Edge smoke test
- Auth REST/RLS integration smoke test
- ESLint
- TypeScript and production Vite build
- Prettier on frontend, Edge Function, package, and documentation files
- Static architecture and browser-secret searches

No remote Supabase project was modified.

## 19. Release Readiness

Resolved in Phase 1.3:

- Checkout idempotency, including concurrent same-key retries
- Minimal admin authentication/application authorization boundary
- Browser integration foundations and guest-token persistence

Still required before public production launch:

- Deployment-level rate limiting and monitoring for checkout, guest operations, uploads, signed reads, and authentication failures
- Automatic payment-evidence cleanup or a documented, monitored operational cleanup procedure
- Image-content validation/hardening beyond declared MIME and size checks

## 20. Deferred Work

- Final admin dashboard and feature screens
- Final customer menu/cart/address/checkout and receipt/chat screens
- Final design system/glassmorphism
- Customer accounts
- Bluetooth printing
- Analytics and inventory tracking
- Full browser end-to-end automation

## 21. Recommended Next Phase

Proceed with a focused **Phase 1.4 — Production Abuse Controls, Evidence Cleanup & Image Hardening** before public launch. After those operational security blockers are resolved, begin the real customer/admin interface as a separate UI phase using the boundaries established here.
