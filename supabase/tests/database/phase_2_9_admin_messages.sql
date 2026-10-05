begin;

create extension if not exists pgtap with schema extensions;
select plan(19);

select ok(not has_function_privilege(
  'anon', 'public.admin_list_conversations(text,text,timestamptz,integer)', 'EXECUTE'),
  'anonymous callers cannot list admin conversations');
select ok(has_function_privilege(
  'authenticated', 'public.admin_list_conversations(text,text,timestamptz,integer)', 'EXECUTE'),
  'authenticated callers can reach the active-admin checked inbox boundary');
select ok(not has_table_privilege('anon', 'public.messages', 'SELECT'),
  'message bodies remain unavailable to anonymous callers');
select ok((select not public from storage.buckets where id = 'message-media')
  and (select not public from storage.buckets where id = 'payment-evidence'),
  'message and payment-evidence buckets remain private');

set local role authenticated;
select throws_ok(
  $$select public.admin_list_conversations(null, 'ALL', null, 30)$$,
  '42501', 'ADMIN_REQUIRED',
  'a caller without an active admin profile cannot list conversations');
reset role;

insert into public.published_menus (
  id, image_path, is_current, activated_at, expires_at
) values (
  '15000000-0000-4000-8000-000000000001', 'menus/phase-2-9.jpg', true,
  statement_timestamp() - interval '1 hour', statement_timestamp() + interval '1 hour'
);
insert into public.published_menu_items (
  id, published_menu_id, name_snapshot, category_snapshot,
  unit_price_centavos, internal_df_centavos, photo_path_snapshot
) values (
  '25000000-0000-4000-8000-000000000001',
  '15000000-0000-4000-8000-000000000001',
  'Fake Adobo', 'ULAM', 8000, 1000, 'items/phase-2-9.jpg'
);

create temporary table phase_2_9_results (label text primary key, payload jsonb);
grant select, insert on phase_2_9_results to service_role, authenticated;
set local role service_role;
insert into phase_2_9_results values ('online', public.create_online_order(
  '15000000-0000-4000-8000-000000000001',
  '[{"published_menu_item_id":"25000000-0000-4000-8000-000000000001","quantity":1,"expected_unit_price_centavos":8000}]',
  'Phase 2.9 Online Customer', 'Fake Address A', 'NEARBY', 'Marycris Complex',
  'ONLINE_PAYMENT', repeat('a', 64)
));
insert into phase_2_9_results values ('cash', public.create_online_order(
  '15000000-0000-4000-8000-000000000001',
  '[{"published_menu_item_id":"25000000-0000-4000-8000-000000000001","quantity":1,"expected_unit_price_centavos":8000}]',
  'Phase 2.9 Cash Customer', 'Fake Address B', 'NEARBY', 'Wellington Place',
  'CASH', repeat('b', 64)
));
reset role;

select public.guest_send_message(
  (select payload ->> 'order_code' from phase_2_9_results where label = 'online'),
  repeat('a', 64), 'Older online payment message');
select public.guest_send_message(
  (select payload ->> 'order_code' from phase_2_9_results where label = 'cash'),
  repeat('b', 64), 'Newest cash message');

set local session_replication_role = replica;
update public.orders
set created_at = created_at - interval '2 days',
  last_edited_at = last_edited_at - interval '2 days',
  guest_chat_expires_at = guest_chat_expires_at - interval '2 days'
where id = (select (payload ->> 'order_id')::uuid
  from phase_2_9_results where label = 'cash');
update public.conversations
set created_at = created_at - interval '2 days',
  expires_at = expires_at - interval '2 days'
where order_id = (select (payload ->> 'order_id')::uuid
  from phase_2_9_results where label = 'cash');
set local session_replication_role = origin;

insert into auth.users (id, aud, role, email, created_at, updated_at)
values
  ('99000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
    'inactive-phase29@example.test', statement_timestamp(), statement_timestamp()),
  ('99000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
    'active-phase29@example.test', statement_timestamp(), statement_timestamp());
insert into public.admin_profiles (user_id, display_name, is_active)
values
  ('99000000-0000-4000-8000-000000000001', 'Inactive Phase 2.9 Admin', false),
  ('99000000-0000-4000-8000-000000000002', 'Active Phase 2.9 Admin', true);

select set_config('request.jwt.claim.sub', '99000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select throws_ok(
  $$select public.admin_list_conversations(null, 'ALL', null, 30)$$,
  '42501', 'ADMIN_REQUIRED',
  'inactive admins cannot list conversations');
reset role;

select set_config('request.jwt.claim.sub', '99000000-0000-4000-8000-000000000002', true);
set local role authenticated;
select is(jsonb_array_length(public.admin_list_conversations(
  'Phase 2.9', 'ALL', null, 30) -> 'conversations'), 2,
  'active admin receives conversations with message activity');
select is(public.admin_list_conversations('Phase 2.9', 'ALL', null, 30)
  #>> '{conversations,0,customer_name}', 'Phase 2.9 Cash Customer',
  'inbox sorts by latest message activity');
select is(jsonb_array_length(public.admin_list_conversations(
  'online customer', 'ALL', null, 30) -> 'conversations'), 1,
  'inbox searches customer names case-insensitively');
select is(jsonb_array_length(public.admin_list_conversations(
  (select payload ->> 'order_code' from phase_2_9_results where label = 'cash'),
  'ALL', null, 30) -> 'conversations'), 1,
  'inbox searches exact or partial order codes');
select is(jsonb_array_length(public.admin_list_conversations(
  'Phase 2.9', 'ONLINE_PAYMENT', null, 30) -> 'conversations'), 1,
  'online-payment filter excludes cash');
select is(jsonb_array_length(public.admin_list_conversations(
  'Phase 2.9', 'NOT_VERIFIED', null, 30) -> 'conversations'), 1,
  'Not Verified filter reflects authoritative payment state');
select is(jsonb_array_length(public.admin_list_conversations(
  'Phase 2.9', 'ACTIVE_GUEST', null, 30) -> 'conversations'), 1,
  'active guest-chat filter uses the fixed order expiry');
select is(jsonb_array_length(public.admin_list_conversations(
  'Phase 2.9', 'EXPIRED_GUEST', null, 30) -> 'conversations'), 1,
  'expired guest-chat filter retains admin-visible history');
select ok(public.admin_list_conversations('Phase 2.9', 'ALL', null, 1)
  ->> 'next_before' is not null,
  'a bounded first page exposes a Load More cursor');
select is(jsonb_array_length(public.admin_list_conversations(
  'Phase 2.9', 'ALL',
  (public.admin_list_conversations('Phase 2.9', 'ALL', null, 1) ->> 'next_before')::timestamptz,
  1) -> 'conversations'), 1,
  'conversation pagination returns the earlier activity page');
select ok(public.admin_list_conversations('Phase 2.9', 'ALL', null, 30)::text
  not like '%' || repeat('a', 64) || '%',
  'inbox payload never exposes guest token hashes');
select public.admin_set_payment_verification(
  (select (payload ->> 'order_id')::uuid from phase_2_9_results where label = 'online'),
  true);
select is(jsonb_array_length(public.admin_list_conversations(
  'Phase 2.9', 'VERIFIED', null, 30) -> 'conversations'), 1,
  'Verified filter refreshes from trusted order payment state');
select is(public.admin_list_conversations('Phase 2.9', 'VERIFIED', null, 30)
  #>> '{conversations,0,payment_verification_state}', 'VERIFIED',
  'conversation payload exposes the current verification state');
reset role;

select * from finish();
rollback;
