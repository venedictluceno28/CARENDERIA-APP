begin;

create extension if not exists pgtap with schema extensions;
select plan(19);

select ok(not has_table_privilege('anon', 'public.address_book_entries', 'SELECT'),
  'anonymous callers cannot read private saved addresses');
select ok(not has_table_privilege('anon', 'public.address_book_entries', 'INSERT'),
  'anonymous callers cannot create saved addresses');
select ok(not has_table_privilege('anon', 'public.address_book_entries', 'UPDATE'),
  'anonymous callers cannot edit or archive saved addresses');
select ok(not has_table_privilege('authenticated', 'public.address_book_entries', 'DELETE'),
  'application admins cannot destructively delete saved addresses');

select set_config('request.jwt.claim.sub', '', true);
set local role authenticated;
select is((select count(*) from public.address_book_entries), 0::bigint,
  'an authenticated caller without a profile cannot read saved addresses');
select throws_ok(
  $$insert into public.address_book_entries (customer_name, exact_address)
    values ('Denied', 'Denied address')$$,
  '42501', 'new row violates row-level security policy for table "address_book_entries"',
  'an authenticated caller without a profile cannot create an entry');
reset role;

insert into auth.users (id, aud, role, email, created_at, updated_at)
values
  ('98000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
    'inactive-address-admin@example.test', statement_timestamp(), statement_timestamp()),
  ('98000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
    'active-address-admin@example.test', statement_timestamp(), statement_timestamp());
insert into public.admin_profiles (user_id, display_name, is_active)
values
  ('98000000-0000-4000-8000-000000000001', 'Inactive Address Admin', false),
  ('98000000-0000-4000-8000-000000000002', 'Active Address Admin', true);

insert into public.address_book_entries (
  id, customer_name, exact_address, created_by
) values (
  '97000000-0000-4000-8000-000000000001', 'Existing Private Customer',
  'Existing private address', '98000000-0000-4000-8000-000000000002'
);

select set_config('request.jwt.claim.sub', '98000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select is((select count(*) from public.address_book_entries), 0::bigint,
  'inactive admins cannot read saved addresses');
select is((select count(*) from public.address_book_entries
    where id = '97000000-0000-4000-8000-000000000001'), 0::bigint,
  'inactive admins cannot address an existing row for mutation');
select throws_ok(
  $$insert into public.address_book_entries (customer_name, exact_address)
    values ('Inactive denied', 'Private address')$$,
  '42501', 'new row violates row-level security policy for table "address_book_entries"',
  'inactive admins cannot create saved addresses');
update public.address_book_entries set exact_address = 'Bypassed'
where id = '97000000-0000-4000-8000-000000000001';
reset role;
select is((select exact_address from public.address_book_entries
    where id = '97000000-0000-4000-8000-000000000001'),
  'Existing private address',
  'inactive admins cannot edit or archive saved addresses');

select set_config('request.jwt.claim.sub', '98000000-0000-4000-8000-000000000002', true);
set local role authenticated;
insert into public.address_book_entries (
  id, customer_name, exact_address, created_by
) values (
  '97000000-0000-4000-8000-000000000002', '  María O’Neil-Santos  ',
  '  Unit 2, Sample Street  ', '98000000-0000-4000-8000-000000000002'
);
reset role;

select ok((select exists(select 1 from public.address_book_entries
    where id = '97000000-0000-4000-8000-000000000002')),
  'an active admin can create a saved address');
select is((select created_by from public.address_book_entries
    where id = '97000000-0000-4000-8000-000000000002'),
  '98000000-0000-4000-8000-000000000002'::uuid,
  'address creation records the active admin');

create temporary table phase_2_8_result (payload jsonb);
grant insert, select on phase_2_8_result to authenticated;
set local role authenticated;
insert into phase_2_8_result
select public.admin_create_manual_order(
  '[{"name":"Fake Ulam","category":"ULAM","quantity":1,"unit_price_centavos":8500,"internal_df_per_unit_centavos":1000}]',
  'María O’Neil-Santos', 'Unit 2, Sample Street', 'NEARBY',
  'Marycris Complex', 'CASH'
);
reset role;
select ok((select (payload ->> 'order_id')::uuid is not null from phase_2_8_result),
  'Manual Order accepts values copied from Address Book');

set local role authenticated;
update public.address_book_entries
set customer_name = 'María Updated', exact_address = 'A different current address',
  is_archived = true
where id = '97000000-0000-4000-8000-000000000002';
reset role;

select ok((select customer_name = 'María Updated'
    and exact_address = 'A different current address' and is_archived
    from public.address_book_entries
    where id = '97000000-0000-4000-8000-000000000002'),
  'an active admin can edit and archive an entry');
select ok((select customer_name = 'María O’Neil-Santos'
    and exact_address = 'Unit 2, Sample Street'
    from public.orders
    where id = (select (payload ->> 'order_id')::uuid from phase_2_8_result)),
  'editing Address Book does not rewrite the order address');
select ok((select original_snapshot #>> '{customer,name}' = 'María O’Neil-Santos'
    and original_snapshot #>> '{customer,exact_address}' = 'Unit 2, Sample Street'
    from public.orders
    where id = (select (payload ->> 'order_id')::uuid from phase_2_8_result)),
  'editing Address Book does not rewrite the original order snapshot');

set local role authenticated;
update public.address_book_entries set is_archived = false
where id = '97000000-0000-4000-8000-000000000002';
reset role;
select ok((select not is_archived from public.address_book_entries
    where id = '97000000-0000-4000-8000-000000000002'),
  'an active admin can restore an archived entry');
select is((select count(*) from public.orders
    where id = (select (payload ->> 'order_id')::uuid from phase_2_8_result)), 1::bigint,
  'archive and restore preserve the historical order');
select is((select count(*) from public.address_book_entries
    where customer_name in ('Existing Private Customer', 'María Updated')), 2::bigint,
  'archive and restore preserve address-book rows without destructive deletion');

select * from finish();
rollback;
