-- Clearly fake, local-only identities and catalog data for Phase 2.7 browser validation.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change_token_new,
  email_change_token_current, email_change,
  created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '97500000-0000-4000-8000-000000000001',
  'authenticated', 'authenticated', 'phase27-admin@example.test',
  crypt(:'test_password', gen_salt('bf', 10)),
  statement_timestamp(), '{"provider":"email","providers":["email"]}',
  '{"email_verified":true}', '', '', '', '', '',
  statement_timestamp(), statement_timestamp()
)
on conflict (id) do update set
  encrypted_password = excluded.encrypted_password,
  email_confirmed_at = excluded.email_confirmed_at,
  raw_user_meta_data = excluded.raw_user_meta_data,
  confirmation_token = '', recovery_token = '', email_change_token_new = '',
  email_change_token_current = '', email_change = '',
  updated_at = excluded.updated_at;

insert into auth.identities (
  provider_id, user_id, identity_data, provider, created_at, updated_at
) values (
  '97500000-0000-4000-8000-000000000001',
  '97500000-0000-4000-8000-000000000001',
  '{"sub":"97500000-0000-4000-8000-000000000001","email":"phase27-admin@example.test","email_verified":true,"phone_verified":false}',
  'email', statement_timestamp(), statement_timestamp()
)
on conflict (provider_id, provider) do nothing;

insert into public.admin_profiles (user_id, display_name, is_active)
values (
  '97500000-0000-4000-8000-000000000001',
  'Phase 2.7 Fake Admin', true
)
on conflict (user_id) do update set is_active = true;

insert into public.catalog_items (
  id, name, category, price_centavos, internal_df_centavos, photo_path,
  is_archived, created_by
) values (
  '97600000-0000-4000-8000-000000000001',
  'Phase 2.7 Fake Adobo', 'ULAM', 8500, 1000,
  'catalog/97600000-0000-4000-8000-000000000001/fake.png', false,
  '97500000-0000-4000-8000-000000000001'
)
on conflict (id) do update set
  name = excluded.name,
  category = excluded.category,
  price_centavos = excluded.price_centavos,
  internal_df_centavos = excluded.internal_df_centavos,
  is_archived = false;
