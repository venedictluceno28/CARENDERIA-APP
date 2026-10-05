begin;

create extension if not exists pgtap with schema extensions;
select plan(43);

select ok(not has_table_privilege('anon', 'public.conversations', 'SELECT'), 'anon cannot read conversations');
select ok(not has_table_privilege('anon', 'public.messages', 'SELECT'), 'anon cannot read messages');
select ok(not has_table_privilege('anon', 'public.message_attachments', 'SELECT'), 'anon cannot read attachment metadata');
select ok(not has_table_privilege('anon', 'public.messages', 'INSERT'), 'anon cannot insert messages');
select ok(not has_function_privilege('anon', 'public.guest_get_receipt(text,text)', 'EXECUTE'), 'anon cannot execute guest receipt RPC directly');
select ok(has_function_privilege('service_role', 'public.guest_get_receipt(text,text)', 'EXECUTE'), 'service role can execute guest receipt RPC');
select ok((select not public from storage.buckets where id = 'message-media'), 'message media bucket is private');
select ok((select not public from storage.buckets where id = 'payment-evidence'), 'payment evidence bucket is private');

insert into public.published_menus (id, image_path, is_current, activated_at, expires_at)
values ('11000000-0000-4000-8000-000000000001', 'menus/messaging.jpg', true,
  statement_timestamp() - interval '1 hour', statement_timestamp() + interval '1 hour');
insert into public.published_menu_items (
  id, published_menu_id, name_snapshot, category_snapshot,
  unit_price_centavos, internal_df_centavos, photo_path_snapshot
) values (
  '21000000-0000-4000-8000-000000000001',
  '11000000-0000-4000-8000-000000000001',
  'Adobo', 'ULAM', 8000, 1000, 'items/adobo.jpg'
);

create temporary table messaging_results (label text primary key, payload jsonb);
grant select, insert on messaging_results to service_role, authenticated;

set local role service_role;
insert into messaging_results values ('order_a', public.create_online_order(
  '11000000-0000-4000-8000-000000000001',
  '[{"published_menu_item_id":"21000000-0000-4000-8000-000000000001","quantity":1,"expected_unit_price_centavos":8000}]',
  'Guest A', 'Address A', 'NEARBY', 'Marycris Complex', 'ONLINE_PAYMENT', repeat('a', 64)));
insert into messaging_results values ('order_b', public.create_online_order(
  '11000000-0000-4000-8000-000000000001',
  '[{"published_menu_item_id":"21000000-0000-4000-8000-000000000001","quantity":1,"expected_unit_price_centavos":8000}]',
  'Guest B', 'Address B', 'NEARBY', 'Wellington Place', 'CASH', repeat('b', 64)));
reset role;

select is((public.guest_get_receipt(
  (select payload ->> 'order_code' from messaging_results where label = 'order_a'), repeat('a', 64)
) ->> 'customer_name'), 'Guest A', 'valid token reads its own receipt');
select ok(not (public.guest_get_receipt(
  (select payload ->> 'order_code' from messaging_results where label = 'order_a'), repeat('a', 64)
) ?| array['calculated_rider_centavos', 'internal_df_total_centavos', 'guest_access_token_hash']),
  'guest receipt omits rider, Internal DF, and token hash');
select throws_ok(format($$select public.guest_get_receipt(%L, %L)$$,
  (select payload ->> 'order_code' from messaging_results where label = 'order_a'), repeat('c', 64)),
  '42501', 'GUEST_ACCESS_DENIED', 'invalid token is rejected');
select throws_ok(format($$select public.guest_get_receipt(%L, %L)$$,
  (select payload ->> 'order_code' from messaging_results where label = 'order_b'), repeat('a', 64)),
  '42501', 'GUEST_ACCESS_DENIED', 'token A cannot access order B receipt');
select throws_ok(format($$select public.guest_get_receipt(%L, null)$$,
  (select payload ->> 'order_code' from messaging_results where label = 'order_a')),
  '42501', 'GUEST_ACCESS_DENIED', 'order code alone never authorizes receipt access');

insert into messaging_results values ('guest_a_message', public.guest_send_message(
  (select payload ->> 'order_code' from messaging_results where label = 'order_a'),
  repeat('a', 64), 'Hello from A'));
select is((select payload ->> 'sender_type' from messaging_results where label = 'guest_a_message'),
  'GUEST', 'guest sends a message to its own conversation');
select ok((select count(*) = 1 and min(conversation.expires_at) = min(orders.guest_chat_expires_at)
  from public.conversations as conversation
  join public.orders as orders on orders.id = conversation.order_id
  where orders.customer_name = 'Guest A'), 'lazy conversation is unique and uses fixed order expiry');
select is(jsonb_array_length(public.guest_list_messages(
  (select payload ->> 'order_code' from messaging_results where label = 'order_a'), repeat('a', 64), null, 50
) -> 'messages'), 1, 'guest reads only its authorized message history');
select throws_ok(format($$select public.guest_list_messages(%L, %L, null, 50)$$,
  (select payload ->> 'order_code' from messaging_results where label = 'order_b'), repeat('a', 64)),
  '42501', 'GUEST_ACCESS_DENIED', 'token A cannot read conversation B');

insert into messaging_results values ('guest_b_message', public.guest_send_message(
  (select payload ->> 'order_code' from messaging_results where label = 'order_b'),
  repeat('b', 64), 'Hello from B'));
select throws_ok(format($$select public.guest_set_message_reaction(%L, %L, %L, %L)$$,
  (select payload ->> 'order_code' from messaging_results where label = 'order_a'),
  repeat('a', 64),
  (select payload ->> 'id' from messaging_results where label = 'guest_b_message'), 'LIKE'),
  'P0001', 'MESSAGE_NOT_FOUND', 'guest A cannot react to conversation B');

select throws_ok(format($$select public.admin_send_message(%L, %L)$$,
  (select payload ->> 'order_id' from messaging_results where label = 'order_a'), 'No admin'),
  '42501', 'ADMIN_REQUIRED', 'admin message operation requires active admin identity');

insert into auth.users (id, aud, role, email, created_at, updated_at)
values ('91000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
  'messaging-admin@example.test', statement_timestamp(), statement_timestamp());
insert into public.admin_profiles (user_id, display_name)
values ('91000000-0000-4000-8000-000000000001', 'Messaging Admin');
select set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000001', true);

set local role authenticated;
insert into messaging_results values ('admin_message', public.admin_send_message(
  (select (payload ->> 'order_id')::uuid from messaging_results where label = 'order_a'), 'Admin reply'));
reset role;
select is((select payload ->> 'sender_type' from messaging_results where label = 'admin_message'),
  'ADMIN', 'active admin sends an order-linked message');
select is(jsonb_array_length(public.admin_list_messages(
  (select (payload ->> 'order_id')::uuid from messaging_results where label = 'order_a'), null, 50
) -> 'messages'), 2, 'admin can read retained conversation history');

select public.guest_set_message_reaction(
  (select payload ->> 'order_code' from messaging_results where label = 'order_a'),
  repeat('a', 64),
  (select (payload ->> 'id')::uuid from messaging_results where label = 'admin_message'), 'THANKS');
select is((select guest_reaction from public.messages
  where id = (select (payload ->> 'id')::uuid from messaging_results where label = 'admin_message')),
  'THANKS', 'guest reaction is stored on the authorized message');
select public.admin_set_message_reaction(
  (select (payload ->> 'id')::uuid from messaging_results where label = 'guest_a_message'), 'LIKE');
select is((select admin_reaction from public.messages
  where id = (select (payload ->> 'id')::uuid from messaging_results where label = 'guest_a_message')),
  'LIKE', 'admin reaction is stored without a generalized reaction table');

select is((public.guest_authorize_attachment_upload(
  (select payload ->> 'order_code' from messaging_results where label = 'order_a'), repeat('a', 64), 'CHAT_IMAGE'
) ->> 'bucket_id'), 'message-media', 'guest chat-image upload is authorized only to private message bucket');

insert into messaging_results values ('chat_attachment', public.guest_finalize_attachment(
  (select payload ->> 'order_code' from messaging_results where label = 'order_a'),
  repeat('a', 64), '31000000-0000-4000-8000-000000000001',
  'orders/' || (select payload ->> 'order_id' from messaging_results where label = 'order_a') ||
    '/messages/31000000-0000-4000-8000-000000000001.jpg',
  'image/jpeg', 1024, 'CHAT_IMAGE', null));
select ok((select attachment.order_id = (select (payload ->> 'order_id')::uuid from messaging_results where label = 'order_a')
  and attachment.message_id is not null and attachment.retained_until is null
  from public.message_attachments as attachment where id = '31000000-0000-4000-8000-000000000001'),
  'chat attachment metadata belongs to the correct order and message');
select is((public.guest_authorize_attachment_read(
  (select payload ->> 'order_code' from messaging_results where label = 'order_a'), repeat('a', 64),
  '31000000-0000-4000-8000-000000000001'
) ->> 'bucket_id'), 'message-media', 'guest may request controlled read for its own chat image');
select throws_ok(format($$select public.guest_authorize_attachment_read(%L, %L, %L)$$,
  (select payload ->> 'order_code' from messaging_results where label = 'order_b'), repeat('b', 64),
  '31000000-0000-4000-8000-000000000001'),
  '42501', 'ATTACHMENT_ACCESS_DENIED', 'token B cannot read order A attachment');
select throws_ok(format($$select public.guest_finalize_attachment(%L,%L,%L,%L,%L,%s,%L,null)$$,
  (select payload ->> 'order_code' from messaging_results where label = 'order_a'), repeat('a', 64),
  '31000000-0000-4000-8000-000000000002',
  'orders/' || (select payload ->> 'order_id' from messaging_results where label = 'order_b') ||
    '/messages/31000000-0000-4000-8000-000000000002.jpg',
  'image/jpeg', 1024, 'CHAT_IMAGE'),
  '42501', 'ATTACHMENT_PATH_DENIED', 'cross-order storage path is rejected');

insert into messaging_results values ('payment_evidence', public.guest_finalize_attachment(
  (select payload ->> 'order_code' from messaging_results where label = 'order_a'),
  repeat('a', 64), '31000000-0000-4000-8000-000000000003',
  'orders/' || (select payload ->> 'order_id' from messaging_results where label = 'order_a') ||
    '/evidence/31000000-0000-4000-8000-000000000003.png',
  'image/png', 2048, 'PAYMENT_EVIDENCE', 'Payment screenshot'));
select ok((select purpose = 'PAYMENT_EVIDENCE' and bucket_id = 'payment-evidence'
  from public.message_attachments where id = '31000000-0000-4000-8000-000000000003'),
  'payment evidence is explicitly classified in its private bucket');
select ok((select attachment.retained_until = orders.created_at + interval '30 days'
  from public.message_attachments as attachment
  join public.orders as orders on orders.id = attachment.order_id
  where attachment.id = '31000000-0000-4000-8000-000000000003'),
  'payment evidence retention eligibility is exactly order creation plus 30 days');
select is((select payment_verification_state from public.orders where customer_name = 'Guest A'),
  'NOT_VERIFIED', 'evidence upload does not verify online payment');
select throws_ok(format($$select public.guest_authorize_attachment_read(%L, %L, %L)$$,
  (select payload ->> 'order_code' from messaging_results where label = 'order_a'), repeat('a', 64),
  '31000000-0000-4000-8000-000000000003'),
  '42501', 'ATTACHMENT_ACCESS_DENIED', 'payment evidence is not exposed through guest signed reads');
select ok((select retained_until is null from public.message_attachments
  where id = '31000000-0000-4000-8000-000000000001'),
  'ordinary chat images do not inherit the evidence retention rule');
select ok((select conversation.expires_at = orders.guest_chat_expires_at
  from public.conversations as conversation join public.orders as orders on orders.id = conversation.order_id
  where orders.customer_name = 'Guest A'), 'message activity does not extend guest expiry');
select throws_ok(format($$select public.guest_authorize_attachment_upload(%L,%L,%L)$$,
  (select payload ->> 'order_code' from messaging_results where label = 'order_b'), repeat('b', 64), 'PAYMENT_EVIDENCE'),
  '22023', 'ONLINE_PAYMENT_REQUIRED', 'CASH order cannot classify an upload as payment evidence');

insert into public.orders (
  id, order_code, source, published_menu_id, customer_name, exact_address,
  location_classification, selected_area_name, payment_method, payment_verification_state,
  delivery_threshold_centavos, base_charge_below_threshold_centavos, far_area_rate_centavos,
  food_subtotal_centavos, internal_df_total_centavos, base_delivery_charge_centavos,
  far_area_charge_centavos, guest_access_token_hash, guest_chat_expires_at,
  original_snapshot, created_at, last_edited_at
) values (
  '41000000-0000-4000-8000-000000000001', 'CRD-ABCDEFGHJK', 'ONLINE',
  '11000000-0000-4000-8000-000000000001', 'Expired Guest', 'Expired address',
  'NEARBY', 'Marycris Complex', 'ONLINE_PAYMENT', 'NOT_VERIFIED',
  2000, 1500, 2000, 8000, 1000, 1500, 0, repeat('e', 64),
  statement_timestamp() - interval '1 hour', '{"snapshot_version":1}',
  statement_timestamp() - interval '25 hours', statement_timestamp() - interval '25 hours'
);
insert into public.order_items (
  order_id, name_snapshot, category_snapshot, quantity,
  unit_price_centavos, internal_df_per_unit_centavos
) values ('41000000-0000-4000-8000-000000000001', 'Expired item', 'ULAM', 1, 8000, 1000);
select throws_ok($$select public.guest_get_receipt('CRD-ABCDEFGHJK', repeat('e',64))$$,
  '42501', 'GUEST_ACCESS_EXPIRED', 'expired guest cannot reopen receipt');
select throws_ok($$select public.guest_send_message('CRD-ABCDEFGHJK', repeat('e',64), 'Too late')$$,
  '42501', 'GUEST_ACCESS_EXPIRED', 'expired guest cannot send messages');
select throws_ok($$select public.guest_authorize_attachment_upload('CRD-ABCDEFGHJK', repeat('e',64), 'CHAT_IMAGE')$$,
  '42501', 'GUEST_ACCESS_EXPIRED', 'expired guest cannot begin an upload');

insert into public.message_attachments (
  id, order_id, purpose, bucket_id, storage_path, mime_type, size_bytes,
  created_by_type, retained_until, created_at
) values (
  '31000000-0000-4000-8000-000000000004', '41000000-0000-4000-8000-000000000001',
  'PAYMENT_EVIDENCE', 'payment-evidence',
  'orders/41000000-0000-4000-8000-000000000001/evidence/31000000-0000-4000-8000-000000000004.jpg',
  'image/jpeg', 512, 'GUEST', statement_timestamp() + interval '5 days',
  statement_timestamp() - interval '25 hours'
);
select ok((select exists(select 1 from public.orders where id = '41000000-0000-4000-8000-000000000001')
  and exists(select 1 from public.message_attachments where id = '31000000-0000-4000-8000-000000000004')),
  'guest expiry deletes neither order nor retained evidence');
select is((public.admin_authorize_attachment_read('31000000-0000-4000-8000-000000000004') ->> 'bucket_id'),
  'payment-evidence', 'active admin may inspect retained evidence after guest expiry');

set local role authenticated;
select is((select count(*) from public.messages as message
  join public.conversations as conversation on conversation.id = message.conversation_id
  join public.orders as orders on orders.id = conversation.order_id
  where orders.published_menu_id = '11000000-0000-4000-8000-000000000001'),
  5::bigint, 'active admin RLS can read fixture message history directly');
reset role;
update public.admin_profiles set is_active = false where user_id = '91000000-0000-4000-8000-000000000001';
select throws_ok(format($$select public.admin_list_messages(%L,null,50)$$,
  (select payload ->> 'order_id' from messaging_results where label = 'order_a')),
  '42501', 'ADMIN_REQUIRED', 'inactive admin cannot use messaging operations');
select ok(not exists (
  select 1 from pg_policies
  where schemaname = 'storage' and tablename = 'objects'
    and ('anon' = any(roles) or 'authenticated' = any(roles))
), 'private media has no direct client Storage policy');

select * from finish();
rollback;
