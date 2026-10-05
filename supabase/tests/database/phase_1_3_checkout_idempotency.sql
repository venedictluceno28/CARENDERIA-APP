begin;

create extension if not exists pgtap with schema extensions;
select plan(20);

insert into public.published_menus (
  id, image_path, is_current, activated_at, expires_at
) values (
  '13000000-0000-4000-8000-000000000001',
  'menus/idempotency.jpg', true,
  statement_timestamp() - interval '1 hour',
  statement_timestamp() + interval '1 hour'
);

insert into public.published_menu_items (
  id, published_menu_id, name_snapshot, category_snapshot,
  unit_price_centavos, internal_df_centavos, photo_path_snapshot,
  is_sold_out, sort_order
) values
  ('23000000-0000-4000-8000-000000000001', '13000000-0000-4000-8000-000000000001', 'Adobo', 'ULAM', 8000, 1000, 'items/adobo.jpg', false, 1),
  ('23000000-0000-4000-8000-000000000002', '13000000-0000-4000-8000-000000000001', 'Rice', 'EXTRAS', 1500, 200, 'items/rice.jpg', false, 2);

select ok(not has_table_privilege('anon', 'public.checkout_idempotency', 'SELECT'),
  'anonymous callers cannot read idempotency data');
select ok(not has_table_privilege('authenticated', 'public.checkout_idempotency', 'SELECT'),
  'authenticated clients cannot read idempotency data');
select ok(not has_table_privilege('anon', 'public.checkout_idempotency', 'INSERT'),
  'anonymous callers cannot insert idempotency data');
select ok(not has_function_privilege('anon', 'public.create_online_order(uuid,jsonb,text,text,text,text,text,text,text)', 'EXECUTE'),
  'anonymous callers cannot execute idempotent checkout directly');
select ok(has_function_privilege('service_role', 'public.create_online_order(uuid,jsonb,text,text,text,text,text,text,text)', 'EXECUTE'),
  'service role can execute idempotent checkout');
select col_is_pk('public', 'checkout_idempotency', 'key_hash',
  'the key hash is the database concurrency authority');

create temporary table phase_1_3_results (label text primary key, payload jsonb);
grant select, insert on phase_1_3_results to service_role;
set local role service_role;

insert into phase_1_3_results values ('first', public.create_online_order(
  '13000000-0000-4000-8000-000000000001',
  '[{"published_menu_item_id":"23000000-0000-4000-8000-000000000001","quantity":1,"expected_unit_price_centavos":8000}]',
  'Retry Customer', 'Same address', 'NEARBY', 'Marycris Complex', 'CASH',
  repeat('a', 64), repeat('1', 64)));
insert into phase_1_3_results values ('retry', public.create_online_order(
  '13000000-0000-4000-8000-000000000001',
  '[{"published_menu_item_id":"23000000-0000-4000-8000-000000000001","quantity":1,"expected_unit_price_centavos":8000}]',
  'Retry Customer', 'Same address', 'NEARBY', 'marycris complex', 'CASH',
  repeat('a', 64), repeat('1', 64)));

reset role;
select is((select payload ->> 'order_id' from phase_1_3_results where label = 'retry'),
  (select payload ->> 'order_id' from phase_1_3_results where label = 'first'),
  'an equivalent retry returns the same order');
select ok((select (payload ->> 'idempotent_replay')::boolean from phase_1_3_results where label = 'retry'),
  'the retry response is identified as a replay');
select is((select count(*) from public.orders where customer_name = 'Retry Customer'), 1::bigint,
  'an exact retry does not create a second order');
select is((select count(*) from public.checkout_idempotency where key_hash = repeat('1', 64)), 1::bigint,
  'one idempotency record owns the completed order');
select ok((select order_id is not null and completed_at is not null
  from public.checkout_idempotency where key_hash = repeat('1', 64)),
  'the successful key is atomically associated with its order');
select ok((select not (payload -> 'items' -> 0) ? 'internal_df_per_unit_centavos'
  from phase_1_3_results where label = 'first'),
  'checkout responses exclude internal delivery values');

set local role service_role;
select throws_ok($$select public.create_online_order(
  '13000000-0000-4000-8000-000000000001',
  '[{"published_menu_item_id":"23000000-0000-4000-8000-000000000002","quantity":1,"expected_unit_price_centavos":1500}]',
  'Retry Customer', 'Same address', 'NEARBY', 'Marycris Complex', 'CASH',
  repeat('a', 64), repeat('1', 64))$$,
  'P0001', 'IDEMPOTENCY_CONFLICT', 'same key with a changed cart is rejected');
select throws_ok($$select public.create_online_order(
  '13000000-0000-4000-8000-000000000001',
  '[{"published_menu_item_id":"23000000-0000-4000-8000-000000000001","quantity":1,"expected_unit_price_centavos":8000}]',
  'Retry Customer', 'Changed address', 'NEARBY', 'Marycris Complex', 'CASH',
  repeat('a', 64), repeat('1', 64))$$,
  'P0001', 'IDEMPOTENCY_CONFLICT', 'same key with a changed address is rejected');
select throws_ok($$select public.create_online_order(
  '13000000-0000-4000-8000-000000000001',
  '[{"published_menu_item_id":"23000000-0000-4000-8000-000000000001","quantity":1,"expected_unit_price_centavos":8000}]',
  'Retry Customer', 'Same address', 'NEARBY', 'Marycris Complex', 'ONLINE_PAYMENT',
  repeat('a', 64), repeat('1', 64))$$,
  'P0001', 'IDEMPOTENCY_CONFLICT', 'same key with a changed payment method is rejected');
select throws_ok($$select public.create_online_order(
  '13000000-0000-4000-8000-000000000001',
  '[{"published_menu_item_id":"23000000-0000-4000-8000-000000000001","quantity":1,"expected_unit_price_centavos":8000}]',
  'Retry Customer', 'Same address', 'NEARBY', 'Marycris Complex', 'CASH',
  repeat('b', 64), repeat('1', 64))$$,
  'P0001', 'IDEMPOTENCY_CONFLICT', 'same key cannot be replayed with a different guest token');

insert into phase_1_3_results values ('different-key', public.create_online_order(
  '13000000-0000-4000-8000-000000000001',
  '[{"published_menu_item_id":"23000000-0000-4000-8000-000000000001","quantity":1,"expected_unit_price_centavos":8000}]',
  'Second Intent', 'Same address', 'NEARBY', 'Marycris Complex', 'CASH',
  repeat('b', 64), repeat('2', 64)));
reset role;

select isnt((select payload ->> 'order_id' from phase_1_3_results where label = 'different-key'),
  (select payload ->> 'order_id' from phase_1_3_results where label = 'first'),
  'a different key may create a separate legitimate order');
select is((select count(*) from public.orders where customer_name in ('Retry Customer', 'Second Intent')), 2::bigint,
  'different keys produce exactly two orders');
select ok((select bool_and(key_hash <> guest_token_hash) from public.checkout_idempotency),
  'idempotency and guest-token hashes are stored separately');
select ok((select bool_and(key_hash ~ '^[0-9a-f]{64}$' and request_fingerprint ~ '^[0-9a-f]{64}$')
  from public.checkout_idempotency), 'only hashes and deterministic fingerprints are persisted');

select * from finish();
rollback;
