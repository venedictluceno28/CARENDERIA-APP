# Local Mobile/LAN Testing

This setup is only for testing CARENDERIA-APP from a phone on the same trusted Wi-Fi network as the development laptop. It does not change the hosted Supabase project or production deployment configuration.

## Current development addresses

- Frontend: `http://192.168.18.8:5173`
- Local Supabase gateway: `http://192.168.18.8:54321`
- Admin login: `http://192.168.18.8:5173/admin/login`

The LAN address is replaceable and may change when the laptop reconnects to Wi-Fi.

## Environment loading

Normal laptop development continues to use the ignored project-root `.env` with:

```text
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=<local publishable key>
```

Mobile mode additionally loads the ignored `.env.mobile.local`. It overrides only `VITE_SUPABASE_URL`:

```text
VITE_SUPABASE_URL=http://192.168.18.8:54321
```

The local publishable key continues to come from `.env`; it is not duplicated. Never use a service-role key, `sb_secret_…` key, or Storage S3 credential in either file.

Vite reads environment files only at startup. Stop and restart Vite after changing either file.

## Start mobile testing

1. Connect the laptop and phone to the same trusted Wi-Fi.
2. Start Docker Desktop and the local Supabase stack.
3. From the project root, run:

   ```powershell
   npm run dev:mobile
   ```

4. Keep that terminal open.
5. On the phone, open `http://192.168.18.8:5173`.
6. Test the public shell, then open `http://192.168.18.8:5173/admin/login`.
7. Enter the existing admin password manually. Do not store it in an environment file, script, test, or documentation.
8. Confirm successful login opens `/admin`, then confirm logout removes protected access.

The mobile script uses `vite --host 0.0.0.0 --mode mobile`. Normal `npm run dev` remains loopback-oriented and uses the standard local environment.

## Supabase local configuration

`supabase/config.toml` retains the loopback `site_url` and adds the LAN frontend to `additional_redirect_urls`. This preserves laptop development and permits Auth redirects for the current LAN origin. Password sign-in, REST, Edge Functions, and Storage all use the project URL supplied by `VITE_SUPABASE_URL`.

When the laptop LAN address changes:

1. Run `ipconfig` and find the Wi-Fi IPv4 address.
2. Update `.env.mobile.local`.
3. Update the LAN entry in `supabase/config.toml`.
4. Restart Vite and the local Supabase stack so both configurations reload.

Do not expose Supabase Studio to the phone; it remains a laptop-only development tool.

## Windows Firewall

The current Wi-Fi connection is classified as Private. If Windows asks whether Node.js/Vite may accept incoming connections, allow it only on Private networks.

If the phone cannot connect and no suitable application rule exists, an administrator may add narrowly scoped Private/LocalSubnet rules:

```powershell
New-NetFirewallRule -DisplayName "TINDAHAN Vite LAN" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 5173 -Profile Private -RemoteAddress LocalSubnet
New-NetFirewallRule -DisplayName "TINDAHAN Supabase LAN" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 54321 -Profile Private -RemoteAddress LocalSubnet
```

Do not disable Windows Firewall and do not enable these rules for the Public profile. Remove the rules when LAN testing is no longer needed:

```powershell
Remove-NetFirewallRule -DisplayName "TINDAHAN Vite LAN"
Remove-NetFirewallRule -DisplayName "TINDAHAN Supabase LAN"
```

## Verified laptop checks

The following were verified through `192.168.18.8`:

- Vite frontend returned HTTP 200 while listening on `0.0.0.0:5173`.
- The transformed browser module contained `http://192.168.18.8:54321` and not the loopback Supabase URL.
- Auth health returned HTTP 200.
- REST returned HTTP 200 with the local publishable key.
- Storage health returned HTTP 200 without changing private-bucket policies.
- Checkout Edge Function CORS preflight returned HTTP 200.
- Auth, REST, Storage, and Edge responses allowed the LAN browser origin.

These networking changes do not alter RLS, active-admin checks, guest authorization, order-code separation, service-role isolation, private Storage, checkout idempotency, or rate limiting.
