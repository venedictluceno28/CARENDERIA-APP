-- Clearly fake, local-only admin and order fixtures for Phase 2.9 validation.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change_token_new,
  email_change_token_current, email_change,
  created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '99500000-0000-4000-8000-000000000099',
  'authenticated', 'authenticated', 'phase29-admin@example.test',
  crypt(:'test_password', gen_salt('bf', 10)),
  statement_timestamp(), '{"provider":"email","providers":["email"]}',
  '{"email_verified":true}', '', '', '', '', '',
  statement_timestamp(), statement_timestamp()
)
on conflict (id) do update set
  encrypted_password = excluded.encrypted_password,
  email_confirmed_at = excluded.email_confirmed_at,
  raw_user_meta_data = excluded.raw_user_meta_data,
  updated_at = excluded.updated_at;

insert into auth.identities (
  provider_id, user_id, identity_data, provider, created_at, updated_at
) values (
  '99500000-0000-4000-8000-000000000099',
  '99500000-0000-4000-8000-000000000099',
  '{"sub":"99500000-0000-4000-8000-000000000099","email":"phase29-admin@example.test","email_verified":true,"phone_verified":false}',
  'email', statement_timestamp(), statement_timestamp()
)
on conflict (provider_id, provider) do nothing;

insert into public.admin_profiles (user_id, display_name, is_active)
values ('99500000-0000-4000-8000-000000000099', 'Phase 2.9 Fake Admin', true)
on conflict (user_id) do update set is_active = true;

insert into public.published_menus (
  id, image_path, is_current, activated_at, expires_at
) values (
  '99400000-0000-4000-8000-000000000001', 'menus/phase-2-9-local.png', false,
  null, null
) on conflict (id) do nothing;

insert into public.published_menu_items (
  id, published_menu_id, name_snapshot, category_snapshot,
  unit_price_centavos, internal_df_centavos, photo_path_snapshot, sort_order
) values (
  '99400000-0000-4000-8000-000000000002',
  '99400000-0000-4000-8000-000000000001',
  'Phase 2.9 Fake Meal', 'ULAM', 8500, 1000, 'items/phase-2-9-local.png', 0
) on conflict (id) do nothing;

insert into public.orders (
  id, order_code, source, published_menu_id, customer_name, exact_address,
  location_classification, selected_area_name, payment_method,
  payment_verification_state, delivery_threshold_centavos,
  base_charge_below_threshold_centavos, far_area_rate_centavos,
  food_subtotal_centavos, internal_df_total_centavos,
  base_delivery_charge_centavos, far_area_charge_centavos,
  guest_access_token_hash, guest_chat_expires_at, original_snapshot,
  created_at, last_edited_at
) values
(
  '99500000-0000-4000-8000-000000000001', 'CRD-P29ABCDEFH', 'ONLINE',
  '99400000-0000-4000-8000-000000000001', 'Phase 2.9 Online Customer',
  '29 Fake Message Street', 'NEARBY', 'Marycris Complex', 'ONLINE_PAYMENT',
  'NOT_VERIFIED', 2000, 1500, 2000, 8500, 1000, 1500, 0,
  encode(extensions.digest(:'guest_token', 'sha256'), 'hex'),
  statement_timestamp() + interval '24 hours',
  '{"snapshot_version":1,"fixture":"phase-2.9"}',
  statement_timestamp(), statement_timestamp()
),
(
  '99500000-0000-4000-8000-000000000002', 'CRD-P29ABCDEGJ', 'ONLINE',
  '99400000-0000-4000-8000-000000000001', 'Phase 2.9 Expired Customer',
  'Expired Fake Message Street', 'NEARBY', 'Wellington Place', 'ONLINE_PAYMENT',
  'NOT_VERIFIED', 2000, 1500, 2000, 8500, 1000, 1500, 0,
  encode(extensions.digest('phase29-expired-token', 'sha256'), 'hex'),
  statement_timestamp() - interval '24 hours',
  '{"snapshot_version":1,"fixture":"phase-2.9-expired"}',
  statement_timestamp() - interval '48 hours', statement_timestamp() - interval '48 hours'
),
(
  '99500000-0000-4000-8000-000000000003', 'CRD-P29ABCDEGK', 'ONLINE',
  '99400000-0000-4000-8000-000000000001', 'Phase 2.9 Cash Customer',
  'Cash Fake Message Street', 'NEARBY', 'Elliston Place', 'CASH',
  null, 2000, 1500, 2000, 8500, 1000, 1500, 0,
  encode(extensions.digest('phase29-cash-token', 'sha256'), 'hex'),
  statement_timestamp() + interval '24 hours',
  '{"snapshot_version":1,"fixture":"phase-2.9-cash"}',
  statement_timestamp(), statement_timestamp()
)
on conflict (id) do nothing;

insert into public.order_items (
  id, order_id, published_menu_item_id, name_snapshot, category_snapshot,
  quantity, unit_price_centavos, internal_df_per_unit_centavos, sort_order
) values (
  '99500000-0000-4000-8000-000000000011',
  '99500000-0000-4000-8000-000000000001',
  '99400000-0000-4000-8000-000000000002',
  'Phase 2.9 Fake Meal', 'ULAM', 1, 8500, 1000, 0
) on conflict (id) do nothing;

insert into public.conversations (id, order_id, created_at, expires_at)
values
  ('99500000-0000-4000-8000-000000000022',
    '99500000-0000-4000-8000-000000000002',
    statement_timestamp() - interval '48 hours', statement_timestamp() - interval '24 hours'),
  ('99500000-0000-4000-8000-000000000023',
    '99500000-0000-4000-8000-000000000003',
    statement_timestamp(), statement_timestamp() + interval '24 hours')
on conflict (id) do nothing;

insert into public.messages (
  id, conversation_id, sender_type, text_content, created_at, updated_at
) values
  ('99500000-0000-4000-8000-000000000032',
    '99500000-0000-4000-8000-000000000022', 'GUEST',
    'Retained expired customer history', statement_timestamp() - interval '25 hours',
    statement_timestamp() - interval '25 hours'),
  ('99500000-0000-4000-8000-000000000033',
    '99500000-0000-4000-8000-000000000023', 'GUEST',
    'Cash conversation without verification controls', statement_timestamp() - interval '1 minute',
    statement_timestamp() - interval '1 minute')
on conflict (id) do nothing;
