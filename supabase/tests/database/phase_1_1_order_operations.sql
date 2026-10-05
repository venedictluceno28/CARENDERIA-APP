begin;

create extension if not exists pgtap with schema extensions;
select plan(42);

insert into public.published_menus (
  id, image_path, is_current, activated_at, expires_at
) values (
  '10000000-0000-4000-8000-000000000001',
  'menus/test.jpg', true, statement_timestamp() - interval '1 hour', statement_timestamp() + interval '1 hour'
);

insert into public.published_menu_items (
  id, published_menu_id, name_snapshot, category_snapshot,
  unit_price_centavos, internal_df_centavos, photo_path_snapshot,
  is_sold_out, sort_order
) values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Adobo', 'ULAM', 8000, 1000, 'items/adobo.jpg', false, 1),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'Dessert', 'DESSERTS', 5000, 1000, 'items/dessert.jpg', false, 2),
  ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 'Extra', 'EXTRAS', 2000, 3000, 'items/extra.jpg', false, 3),
  ('20000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', 'Sold Out', 'ULAM', 9000, 1000, 'items/sold.jpg', true, 4);

select ok(not has_function_privilege('anon', 'public.create_online_order(uuid,jsonb,text,text,text,text,text,text)', 'EXECUTE'),
  'anon cannot execute the privileged checkout RPC directly');
select ok(not has_function_privilege('authenticated', 'public.create_online_order(uuid,jsonb,text,text,text,text,text,text)', 'EXECUTE'),
  'authenticated clients cannot execute checkout RPC directly');
select ok(has_function_privilege('service_role', 'public.create_online_order(uuid,jsonb,text,text,text,text,text,text)', 'EXECUTE'),
  'service role can execute checkout RPC');
select ok(not has_table_privilege('anon', 'public.orders', 'INSERT'), 'anon cannot insert orders');
select ok(not has_table_privilege('anon', 'public.orders', 'UPDATE'), 'anon cannot update orders');
select ok(not has_table_privilege('anon', 'public.orders', 'SELECT'), 'anon cannot read arbitrary orders');

create temporary table test_results (label text primary key, payload jsonb);
grant select, insert on test_results to service_role, authenticated;

set local role service_role;
insert into test_results values ('near_below', public.create_online_order(
  '10000000-0000-4000-8000-000000000001',
  '[{"published_menu_item_id":"20000000-0000-4000-8000-000000000001","quantity":1,"expected_unit_price_centavos":8000}]',
  'Near Below', 'Test address', 'NEARBY', 'Marycris Complex', 'CASH', repeat('a', 64)));
reset role;

select is((select (payload ->> 'base_delivery_charge_centavos')::bigint from test_results where label = 'near_below'), 1500::bigint,
  'nearby below threshold uses full 1500 base charge');
select is((select calculated_rider_centavos from public.orders where customer_name = 'Near Below'), 2500::bigint,
  'nearby DF 1000 produces rider amount 2500');
select ok((select payment_verification_state is null and verified_at is null from public.orders where customer_name = 'Near Below'),
  'CASH has no payment verification state');
select ok((select guest_chat_expires_at = created_at + interval '24 hours' from public.orders where customer_name = 'Near Below'),
  'guest expiry is exactly creation plus 24 hours');
select ok((select guest_access_token_hash = repeat('a', 64) and original_snapshot::text not like '%' || repeat('a', 64) || '%'
  from public.orders where customer_name = 'Near Below'), 'hash is stored and omitted from original snapshot');
select ok((select (original_snapshot #>> '{totals,grand_total_centavos}')::bigint = grand_total_centavos
  from public.orders where customer_name = 'Near Below'), 'original snapshot matches authoritative grand total');

insert into test_results values ('near_threshold', public.create_online_order(
  '10000000-0000-4000-8000-000000000001',
  '[{"published_menu_item_id":"20000000-0000-4000-8000-000000000001","quantity":2,"expected_unit_price_centavos":8000}]',
  'Near Threshold', 'Test address', 'NEARBY', 'Wellington Place', 'ONLINE_PAYMENT', repeat('b', 64)));
select ok((select base_delivery_charge_centavos = 0 and calculated_rider_centavos = 2000
  from public.orders where customer_name = 'Near Threshold'), 'nearby exact threshold is free base delivery and rider 2000');
select ok((select payment_verification_state = 'NOT_VERIFIED' and verified_at is null
  from public.orders where customer_name = 'Near Threshold'), 'ONLINE_PAYMENT starts NOT_VERIFIED');

insert into test_results values ('near_above', public.create_online_order(
  '10000000-0000-4000-8000-000000000001',
  '[{"published_menu_item_id":"20000000-0000-4000-8000-000000000003","quantity":1,"expected_unit_price_centavos":2000}]',
  'Near Above', 'Test address', 'NEARBY', 'Elliston Place', 'CASH', repeat('c', 64)));
select is((select customer_delivery_charge_centavos from public.orders where customer_name = 'Near Above'), 0::bigint,
  'extra-only cart above threshold has free nearby delivery');

insert into test_results values ('far_below', public.create_online_order(
  '10000000-0000-4000-8000-000000000001',
  '[{"published_menu_item_id":"20000000-0000-4000-8000-000000000002","quantity":1,"expected_unit_price_centavos":5000}]',
  'Far Below', 'Far address', 'OUTSIDE', null, 'CASH', repeat('d', 64)));
select ok((select base_delivery_charge_centavos = 1500 and far_area_charge_centavos = 2000
  and customer_delivery_charge_centavos = 3500 and calculated_rider_centavos = 4500
  from public.orders where customer_name = 'Far Below'), 'far below threshold yields base 1500, far 2000, rider 4500');

insert into test_results values ('far_threshold', public.create_online_order(
  '10000000-0000-4000-8000-000000000001',
  '[{"published_menu_item_id":"20000000-0000-4000-8000-000000000001","quantity":2,"expected_unit_price_centavos":8000}]',
  'Far Threshold', 'Far address', 'OUTSIDE', null, 'CASH', repeat('e', 64)));
select ok((select base_delivery_charge_centavos = 0 and far_area_charge_centavos = 2000
  and calculated_rider_centavos = 4000 from public.orders where customer_name = 'Far Threshold'),
  'far exact threshold yields rider 4000');

insert into test_results values ('mixed', public.create_online_order(
  '10000000-0000-4000-8000-000000000001',
  '[{"published_menu_item_id":"20000000-0000-4000-8000-000000000001","quantity":1,"expected_unit_price_centavos":8000},{"published_menu_item_id":"20000000-0000-4000-8000-000000000002","quantity":1,"expected_unit_price_centavos":5000}]',
  'Mixed', 'Test address', 'NEARBY', 'Marycris Complex', 'CASH', repeat('f', 64)));
select ok((select food_subtotal_centavos = 13000 and internal_df_total_centavos = 2000
  from public.orders where customer_name = 'Mixed'), 'mixed categories and quantities use authoritative line values');

select throws_ok($$select public.create_online_order(
  '10000000-0000-4000-8000-000000000001',
  '[{"published_menu_item_id":"20000000-0000-4000-8000-000000000004","quantity":1,"expected_unit_price_centavos":9000}]',
  'Rejected', 'Test', 'NEARBY', 'Marycris Complex', 'CASH', repeat('1a', 32))$$,
  'P0001', 'ITEM_SOLD_OUT|[{"name": "Sold Out", "published_menu_item_id": "20000000-0000-4000-8000-000000000004"}]',
  'sold-out item is rejected');
select throws_ok($$select public.create_online_order(
  '10000000-0000-4000-8000-000000000001',
  '[{"published_menu_item_id":"20000000-0000-4000-8000-000000000001","quantity":0,"expected_unit_price_centavos":8000}]',
  'Rejected', 'Test', 'NEARBY', 'Marycris Complex', 'CASH', repeat('2a', 32))$$,
  '22023', 'INVALID_QUANTITY', 'invalid quantity is rejected');
select throws_ok($$select public.create_online_order(
  '10000000-0000-4000-8000-000000000001',
  '[{"published_menu_item_id":"20000000-0000-4000-8000-000000000001","quantity":1,"expected_unit_price_centavos":7999}]',
  'Rejected', 'Test', 'NEARBY', 'Marycris Complex', 'CASH', repeat('3a', 32))$$,
  'P0001', 'PRICE_CHANGED|[{"name": "Adobo", "published_menu_item_id": "20000000-0000-4000-8000-000000000001", "current_unit_price_centavos": 8000, "expected_unit_price_centavos": 7999}]',
  'changed price is rejected before creation');
select throws_ok($$select public.create_online_order(
  '10000000-0000-4000-8000-000000000001',
  '[{"published_menu_item_id":"29999999-0000-4000-8000-000000000099","quantity":1,"expected_unit_price_centavos":100}]',
  'Rejected', 'Test', 'NEARBY', 'Marycris Complex', 'CASH', repeat('4a', 32))$$,
  'P0001', 'ITEM_NOT_FOUND', 'invalid menu-item relationship is rejected');
select is((select count(*) from public.orders
  where published_menu_id = '10000000-0000-4000-8000-000000000001'), 6::bigint,
  'failed checkouts leave no partial fixture orders');
select is((select count(distinct order_code) from public.orders
  where published_menu_id = '10000000-0000-4000-8000-000000000001'), 6::bigint,
  'generated human-readable fixture order codes are unique');
select ok((select bool_and(order_code ~ '^CRD-[A-HJ-NP-Z2-9]{10}$') from public.orders
  where published_menu_id = '10000000-0000-4000-8000-000000000001'),
  'fixture order codes use canonical format');

update public.published_menus set expires_at = statement_timestamp() - interval '1 second'
where id = '10000000-0000-4000-8000-000000000001';
select throws_ok($$select public.create_online_order(
  '10000000-0000-4000-8000-000000000001',
  '[{"published_menu_item_id":"20000000-0000-4000-8000-000000000001","quantity":1,"expected_unit_price_centavos":8000}]',
  'Expired', 'Test', 'NEARBY', 'Marycris Complex', 'CASH', repeat('5a', 32))$$,
  'P0001', 'MENU_EXPIRED', 'expired menu is rejected');
update public.published_menus set expires_at = statement_timestamp() + interval '1 hour',
  is_current = false, deactivated_at = statement_timestamp()
where id = '10000000-0000-4000-8000-000000000001';
select throws_ok($$select public.create_online_order(
  '10000000-0000-4000-8000-000000000001',
  '[{"published_menu_item_id":"20000000-0000-4000-8000-000000000001","quantity":1,"expected_unit_price_centavos":8000}]',
  'Inactive', 'Test', 'NEARBY', 'Marycris Complex', 'CASH', repeat('6a', 32))$$,
  'P0001', 'MENU_INACTIVE', 'deactivated menu is rejected');

select throws_ok($$select public.admin_cancel_order(
  (select id from public.orders where customer_name = 'Near Below'), null)$$,
  '42501', 'ADMIN_REQUIRED', 'admin operations reject callers without an active admin identity');

select ok(not has_function_privilege('anon', 'public.admin_cancel_order(uuid,text)', 'EXECUTE'),
  'anonymous callers cannot execute cancellation');
select ok(has_function_privilege('authenticated', 'public.admin_cancel_order(uuid,text)', 'EXECUTE'),
  'authenticated role can reach the admin-checked cancellation boundary');

insert into auth.users (id, aud, role, email, created_at, updated_at)
values ('90000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
  'admin@example.test', statement_timestamp(), statement_timestamp());
insert into public.admin_profiles (user_id, display_name)
values ('90000000-0000-4000-8000-000000000001', 'Test Admin');
select set_config('request.jwt.claim.sub', '90000000-0000-4000-8000-000000000001', true);

set local role authenticated;
insert into test_results values ('manual', public.admin_create_manual_order(
  '[{"name":"Manual Item","category":"EXTRAS","quantity":1,"unit_price_centavos":1200,"internal_df_per_unit_centavos":500}]',
  'Manual Customer', 'Manual address', 'NEARBY', 'Marycris Complex', 'CASH'));
reset role;
select ok((select source = 'MANUAL' and published_menu_id is null and guest_access_token_hash is null
  from public.orders where id = (select (payload ->> 'order_id')::uuid from test_results where label = 'manual')),
  'manual creation uses manual-only source semantics');
select ok((select grand_total_centavos = 2700 and calculated_rider_centavos = 2000
  from public.orders where id = (select (payload ->> 'order_id')::uuid from test_results where label = 'manual')),
  'manual creation uses trusted arithmetic');

create temporary table original_before_edit as
select id, original_snapshot
from public.orders
where id = (select (payload ->> 'order_id')::uuid from test_results where label = 'manual');

select public.admin_edit_order(
  (select id from original_before_edit),
  '[{"name":"Edited Item","category":"DESSERTS","quantity":2,"unit_price_centavos":1000,"internal_df_per_unit_centavos":500}]',
  'Edited Customer', 'Edited address', 'NEARBY', 'Wellington Place', 'ONLINE_PAYMENT');
select ok((select food_subtotal_centavos = 2000 and internal_df_total_centavos = 1000
  and customer_delivery_charge_centavos = 1500 and grand_total_centavos = 3500
  and calculated_rider_centavos = 2500 from public.orders where id = (select id from original_before_edit)),
  'admin edit recalculates every derived amount');
select is((select original_snapshot from public.orders where id = (select id from original_before_edit)),
  (select original_snapshot from original_before_edit), 'admin edit preserves original snapshot');
select ok((select payment_method = 'ONLINE_PAYMENT' and payment_verification_state = 'NOT_VERIFIED' and verified_at is null
  from public.orders where id = (select id from original_before_edit)), 'editing CASH to ONLINE_PAYMENT initializes NOT_VERIFIED');

select public.admin_set_payment_verification((select id from original_before_edit), true);
select ok((select payment_verification_state = 'VERIFIED' and verified_at is not null
  from public.orders where id = (select id from original_before_edit)), 'admin can verify online payment');
select public.admin_set_payment_verification((select id from original_before_edit), false);
select ok((select payment_verification_state = 'NOT_VERIFIED' and verified_at is null
  from public.orders where id = (select id from original_before_edit)), 'admin can reverse payment verification');

select public.admin_cancel_order((select id from original_before_edit), 'Test cancellation');
select ok((select is_cancelled and cancelled_at is not null and cancellation_reason = 'Test cancellation'
  from public.orders where id = (select id from original_before_edit)), 'admin cancellation preserves the order with cancellation metadata');
select is((public.admin_get_daily_totals((statement_timestamp() at time zone 'Asia/Manila')::date) ->> 'active_order_count')::bigint,
  (select count(*) from public.orders
    where business_date = (statement_timestamp() at time zone 'Asia/Manila')::date
      and not is_cancelled), 'cancelled order is excluded from daily active count');

select public.admin_restore_order((select id from original_before_edit));
select ok((select not is_cancelled and restored_at is not null
  from public.orders where id = (select id from original_before_edit)), 'admin restoration returns the order to active bookkeeping');
insert into test_results values ('reconcile', public.admin_reconcile_rider_day(
  (statement_timestamp() at time zone 'Asia/Manila')::date, 100));
select is((select (payload ->> 'final_rider_centavos')::bigint from test_results where label = 'reconcile'),
  (select (coalesce(sum(calculated_rider_centavos), 0) + 100)::bigint from public.orders
    where business_date = (statement_timestamp() at time zone 'Asia/Manila')::date
      and not is_cancelled),
  'daily rider reconciliation uses active calculated amounts plus signed adjustment');
select is((public.admin_get_daily_totals((statement_timestamp() at time zone 'Asia/Manila')::date) ->> 'active_order_count')::bigint,
  (select count(*) from public.orders
    where business_date = (statement_timestamp() at time zone 'Asia/Manila')::date
      and not is_cancelled), 'restored order is included in daily active totals');

select * from finish();
rollback;
