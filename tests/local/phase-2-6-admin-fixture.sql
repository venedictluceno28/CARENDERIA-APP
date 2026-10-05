-- Clearly fake local-only admin and catalog used by the Phase 2.6 browser test.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change_token_new,
  email_change_token_current, email_change,
  created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '96500000-0000-4000-8000-000000000001',
  'authenticated', 'authenticated', 'phase26-admin@example.test',
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
  '96500000-0000-4000-8000-000000000001',
  '96500000-0000-4000-8000-000000000001',
  '{"sub":"96500000-0000-4000-8000-000000000001","email":"phase26-admin@example.test","email_verified":true,"phone_verified":false}',
  'email', statement_timestamp(), statement_timestamp()
)
on conflict (provider_id, provider) do nothing;

insert into public.admin_profiles (user_id, display_name, is_active)
values (
  '96500000-0000-4000-8000-000000000001',
  'Phase 2.6 Fake Admin', true
)
on conflict (user_id) do update set is_active = true;

update public.published_menus
set is_current = false,
    deactivated_at = coalesce(deactivated_at, statement_timestamp())
where is_current
  and created_by = '96500000-0000-4000-8000-000000000001';

do $$
begin
  if exists (select 1 from public.published_menus where is_current) then
    raise exception 'A non-test active menu exists; refusing to alter it.';
  end if;
end;
$$;

insert into public.catalog_items (
  id, name, category, price_centavos, internal_df_centavos, photo_path,
  is_archived, created_by
) values
  ('96600000-0000-4000-8000-000000000001', 'Phase 2.6 Fake Adobo',
    'ULAM', 8500, 1000,
    'catalog/96600000-0000-4000-8000-000000000001/96600000-0000-4000-8000-000000000091.png',
    false, '96500000-0000-4000-8000-000000000001'),
  ('96600000-0000-4000-8000-000000000002', 'Phase 2.6 Fake Flan',
    'DESSERTS', 5000, 0,
    'catalog/96600000-0000-4000-8000-000000000002/96600000-0000-4000-8000-000000000092.png',
    false, '96500000-0000-4000-8000-000000000001'),
  ('96600000-0000-4000-8000-000000000003', 'Phase 2.6 Fake Rice',
    'EXTRAS', 1500, 200,
    'catalog/96600000-0000-4000-8000-000000000003/96600000-0000-4000-8000-000000000093.png',
    false, '96500000-0000-4000-8000-000000000001'),
  ('96600000-0000-4000-8000-000000000004', 'Phase 2.6 Archived Fake',
    'ULAM', 100, 0,
    'catalog/96600000-0000-4000-8000-000000000004/96600000-0000-4000-8000-000000000094.png',
    true, '96500000-0000-4000-8000-000000000001')
on conflict (id) do update set
  name = excluded.name,
  category = excluded.category,
  price_centavos = excluded.price_centavos,
  internal_df_centavos = excluded.internal_df_centavos,
  photo_path = excluded.photo_path,
  is_archived = excluded.is_archived;
