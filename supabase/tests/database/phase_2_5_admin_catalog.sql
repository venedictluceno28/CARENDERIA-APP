begin;

create extension if not exists pgtap with schema extensions;
select plan(20);

select ok(
  (select public from storage.buckets where id = 'public-assets'),
  'public-assets is publicly readable for future published-menu images'
);
select is(
  (select file_size_limit from storage.buckets where id = 'public-assets'),
  5242880::bigint,
  'catalog images are limited to 5 MiB'
);
select is(
  (select allowed_mime_types from storage.buckets where id = 'public-assets'),
  array['image/jpeg', 'image/png', 'image/webp']::text[],
  'catalog bucket permits only JPEG, PNG, and WebP'
);

select ok(not has_function_privilege('anon', 'public.admin_authorize_catalog_image_upload(uuid)', 'EXECUTE'),
  'anonymous callers cannot authorize catalog image uploads');
select ok(not has_function_privilege('anon', 'public.admin_create_catalog_item(uuid,text,text,bigint,bigint,text)', 'EXECUTE'),
  'anonymous callers cannot create catalog items');
select ok(not has_function_privilege('anon', 'public.admin_update_catalog_item(uuid,text,text,bigint,bigint,text)', 'EXECUTE'),
  'anonymous callers cannot edit catalog items');
select ok(not has_function_privilege('anon', 'public.admin_set_catalog_item_archived(uuid,boolean)', 'EXECUTE'),
  'anonymous callers cannot archive catalog items');
select ok(has_function_privilege('authenticated', 'public.admin_create_catalog_item(uuid,text,text,bigint,bigint,text)', 'EXECUTE'),
  'authenticated role can reach the active-admin checked create boundary');
select ok(not has_table_privilege('anon', 'public.catalog_items', 'SELECT'),
  'anonymous callers cannot read Internal DF from the raw catalog');
select ok(not has_table_privilege('anon', 'public.catalog_items', 'INSERT'),
  'anonymous callers cannot insert catalog rows');
select ok(not has_table_privilege('authenticated', 'public.catalog_items', 'DELETE'),
  'catalog rows cannot be destructively deleted by application admins');

set local role authenticated;
select throws_ok(
  $$select public.admin_create_catalog_item(
    '81000000-0000-4000-8000-000000000001', 'Denied', 'ULAM', 8500, 1000,
    'catalog/81000000-0000-4000-8000-000000000001/81000000-0000-4000-8000-000000000099.jpg'
  )$$,
  '42501', 'ADMIN_REQUIRED',
  'catalog mutation rejects a caller without an active admin profile'
);
reset role;

insert into auth.users (id, aud, role, email, created_at, updated_at)
values ('89000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
  'catalog-admin@example.test', statement_timestamp(), statement_timestamp());
insert into public.admin_profiles (user_id, display_name)
values ('89000000-0000-4000-8000-000000000001', 'Catalog Test Admin');
select set_config('request.jwt.claim.sub', '89000000-0000-4000-8000-000000000001', true);

set local role authenticated;
select public.admin_create_catalog_item(
  '81000000-0000-4000-8000-000000000001', '  Fake Adobo  ', 'ULAM', 8500, 1000,
  'catalog/81000000-0000-4000-8000-000000000001/81000000-0000-4000-8000-000000000099.jpg'
);
reset role;

select ok((select name = 'Fake Adobo' and category = 'ULAM' and price_centavos = 8500
  and internal_df_centavos = 1000 and not is_archived
  from public.catalog_items where id = '81000000-0000-4000-8000-000000000001'),
  'active admin creates a normalized reusable catalog item');
select is((select created_by from public.catalog_items where id = '81000000-0000-4000-8000-000000000001'),
  '89000000-0000-4000-8000-000000000001'::uuid,
  'catalog creation records the active admin');

set local role authenticated;
select throws_ok(
  $$select public.admin_create_catalog_item(
    '81000000-0000-4000-8000-000000000002', 'Bad Path', 'ULAM', 100, 0,
    'orders/private/payment.jpg'
  )$$,
  '22023', 'INVALID_CATALOG_ITEM',
  'catalog creation rejects paths outside the allocated item folder'
);
reset role;

insert into public.published_menus (
  id, image_path, is_current, activated_at, expires_at
) values (
  '82000000-0000-4000-8000-000000000001', 'menus/fake.jpg', false,
  statement_timestamp(), statement_timestamp() + interval '24 hours'
);
insert into public.published_menu_items (
  id, published_menu_id, catalog_item_id, name_snapshot, category_snapshot,
  unit_price_centavos, internal_df_centavos, photo_path_snapshot, sort_order
) values (
  '83000000-0000-4000-8000-000000000001',
  '82000000-0000-4000-8000-000000000001',
  '81000000-0000-4000-8000-000000000001',
  'Fake Adobo', 'ULAM', 8500, 1000,
  'catalog/81000000-0000-4000-8000-000000000001/81000000-0000-4000-8000-000000000099.jpg', 0
);

set local role authenticated;
select public.admin_update_catalog_item(
  '81000000-0000-4000-8000-000000000001', 'Fake Caldereta', 'ULAM', 9500, 1200, null
);
reset role;
select ok((select name = 'Fake Caldereta' and price_centavos = 9500
  and internal_df_centavos = 1200
  and photo_path like '%000000000099.jpg'
  from public.catalog_items where id = '81000000-0000-4000-8000-000000000001'),
  'editing changes current values and preserves the photo when no replacement is supplied');
select ok((select name_snapshot = 'Fake Adobo' and unit_price_centavos = 8500
  and internal_df_centavos = 1000 and photo_path_snapshot like '%000000000099.jpg'
  from public.published_menu_items where id = '83000000-0000-4000-8000-000000000001'),
  'catalog editing does not rewrite a published-menu snapshot');

set local role authenticated;
select public.admin_set_catalog_item_archived('81000000-0000-4000-8000-000000000001', true);
reset role;
select ok((select is_archived from public.catalog_items where id = '81000000-0000-4000-8000-000000000001'),
  'archive marks the reusable item inactive');
select ok((select exists(select 1 from public.catalog_items where id = '81000000-0000-4000-8000-000000000001')
  and exists(select 1 from public.published_menu_items where catalog_item_id = '81000000-0000-4000-8000-000000000001')),
  'archive preserves catalog and published history');

set local role authenticated;
select public.admin_set_catalog_item_archived('81000000-0000-4000-8000-000000000001', false);
reset role;
select ok((select not is_archived from public.catalog_items where id = '81000000-0000-4000-8000-000000000001'),
  'restore returns the item to the active catalog');

select * from finish();
rollback;

