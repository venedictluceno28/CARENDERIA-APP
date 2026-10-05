begin;

create extension if not exists pgtap with schema extensions;
select plan(32);

select ok(not has_function_privilege('anon', 'public.admin_authorize_menu_image_upload(uuid)', 'EXECUTE'),
  'anonymous callers cannot authorize menu image uploads');
select ok(not has_function_privilege('anon', 'public.admin_get_active_menu()', 'EXECUTE'),
  'anonymous callers cannot read the admin menu payload');
select ok(not has_function_privilege('anon', 'public.admin_publish_menu(uuid,text,uuid[])', 'EXECUTE'),
  'anonymous callers cannot publish menus');
select ok(not has_function_privilege('anon', 'public.admin_deactivate_menu(uuid)', 'EXECUTE'),
  'anonymous callers cannot deactivate menus');
select ok(not has_function_privilege('anon', 'public.admin_set_menu_item_sold_out(uuid,boolean)', 'EXECUTE'),
  'anonymous callers cannot change sold-out state');
select ok(has_function_privilege('authenticated', 'public.admin_publish_menu(uuid,text,uuid[])', 'EXECUTE'),
  'authenticated role can reach the active-admin checked publish boundary');
select ok(not has_table_privilege('authenticated', 'public.published_menus', 'INSERT'),
  'application admins cannot bypass trusted menu publication with direct inserts');
select ok(not has_table_privilege('authenticated', 'public.published_menu_items', 'UPDATE'),
  'application admins cannot bypass trusted sold-out mutations');
select ok(not has_column_privilege('anon', 'public.published_menu_items', 'internal_df_centavos', 'SELECT'),
  'anonymous customers cannot read Internal DF');
select ok(has_column_privilege('anon', 'public.published_menus', 'is_current', 'SELECT')
  and has_column_privilege('anon', 'public.published_menus', 'deactivated_at', 'SELECT'),
  'public client can express the active-menu filter while RLS limits visible rows');

set local role authenticated;
select throws_ok(
  $$select public.admin_publish_menu(
    '91000000-0000-4000-8000-000000000001',
    'menus/91000000-0000-4000-8000-000000000001/91000000-0000-4000-8000-000000000099.jpg',
    array['92000000-0000-4000-8000-000000000001']::uuid[]
  )$$,
  '42501', 'ADMIN_REQUIRED',
  'publish rejects a caller without an active admin profile'
);
reset role;

insert into auth.users (id, aud, role, email, created_at, updated_at) values
  ('99000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
    'menu-admin@example.test', statement_timestamp(), statement_timestamp()),
  ('99000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
    'inactive-menu-admin@example.test', statement_timestamp(), statement_timestamp());
insert into public.admin_profiles (user_id, display_name, is_active) values
  ('99000000-0000-4000-8000-000000000001', 'Menu Test Admin', true),
  ('99000000-0000-4000-8000-000000000002', 'Inactive Menu Admin', false);
insert into public.catalog_items (
  id, name, category, price_centavos, internal_df_centavos, photo_path,
  is_archived, created_by
) values
  ('92000000-0000-4000-8000-000000000001', 'Fake Adobo', 'ULAM', 8500, 1000,
    'catalog/92000000-0000-4000-8000-000000000001/92000000-0000-4000-8000-000000000091.jpg',
    false, '99000000-0000-4000-8000-000000000001'),
  ('92000000-0000-4000-8000-000000000002', 'Fake Flan', 'DESSERTS', 5000, 0,
    'catalog/92000000-0000-4000-8000-000000000002/92000000-0000-4000-8000-000000000092.png',
    false, '99000000-0000-4000-8000-000000000001'),
  ('92000000-0000-4000-8000-000000000003', 'Archived Rice', 'EXTRAS', 1500, 200,
    'catalog/92000000-0000-4000-8000-000000000003/92000000-0000-4000-8000-000000000093.webp',
    true, '99000000-0000-4000-8000-000000000001');

select set_config('request.jwt.claim.sub', '99000000-0000-4000-8000-000000000002', true);
set local role authenticated;
select throws_ok(
  $$select public.admin_publish_menu(
    '91000000-0000-4000-8000-000000000001',
    'menus/91000000-0000-4000-8000-000000000001/91000000-0000-4000-8000-000000000099.jpg',
    array['92000000-0000-4000-8000-000000000001']::uuid[]
  )$$,
  '42501', 'ADMIN_REQUIRED',
  'inactive admins cannot publish menus'
);
reset role;

select set_config('request.jwt.claim.sub', '99000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select is(
  public.admin_authorize_menu_image_upload('91000000-0000-4000-8000-000000000001')->>'path_prefix',
  'menus/91000000-0000-4000-8000-000000000001/',
  'menu upload authorization scopes the object to its menu folder'
);
select throws_ok(
  $$select public.admin_publish_menu(
    '91000000-0000-4000-8000-000000000001',
    'menus/91000000-0000-4000-8000-000000000001/91000000-0000-4000-8000-000000000099.jpg',
    array['92000000-0000-4000-8000-000000000003']::uuid[]
  )$$,
  'P0001', 'CATALOG_SELECTION_INVALID',
  'archived catalog items cannot be published'
);
select is(
  public.admin_publish_menu(
    '91000000-0000-4000-8000-000000000001',
    'menus/91000000-0000-4000-8000-000000000001/91000000-0000-4000-8000-000000000099.jpg',
    array[
      '92000000-0000-4000-8000-000000000001',
      '92000000-0000-4000-8000-000000000002'
    ]::uuid[]
  ),
  '91000000-0000-4000-8000-000000000001'::uuid,
  'active admin publishes selected catalog items atomically'
);
reset role;

select is((select count(*) from public.published_menus where is_current), 1::bigint,
  'exactly one menu is current');
select ok((select created_by = '99000000-0000-4000-8000-000000000001'::uuid
  and expires_at = activated_at + interval '24 hours'
  from public.published_menus where id = '91000000-0000-4000-8000-000000000001'),
  'publish uses server identity and an exact 24-hour lifetime');
select is((select count(*) from public.published_menu_items
  where published_menu_id = '91000000-0000-4000-8000-000000000001'), 2::bigint,
  'publish creates exactly the selected snapshots');
select ok((select name_snapshot = 'Fake Adobo' and category_snapshot = 'ULAM'
  and unit_price_centavos = 8500 and internal_df_centavos = 1000
  and photo_path_snapshot like 'catalog/92000000%'
  from public.published_menu_items
  where published_menu_id = '91000000-0000-4000-8000-000000000001'
    and catalog_item_id = '92000000-0000-4000-8000-000000000001'),
  'published item snapshots all trusted catalog values');

set local role authenticated;
select ok((public.admin_get_active_menu()->>'id') = '91000000-0000-4000-8000-000000000001'
  and jsonb_array_length(public.admin_get_active_menu()->'items') = 2
  and (public.admin_get_active_menu()->'items'->0 ? 'internal_df_centavos'),
  'admin active-menu payload includes items and Internal DF');
select throws_ok(
  $$select public.admin_publish_menu(
    '91000000-0000-4000-8000-000000000002',
    'menus/91000000-0000-4000-8000-000000000002/91000000-0000-4000-8000-000000000098.png',
    array['92000000-0000-4000-8000-000000000001']::uuid[]
  )$$,
  'P0001', 'MENU_ACTIVE_EXISTS',
  'a second active menu is rejected by the trusted transaction'
);
reset role;

update public.catalog_items set name = 'Changed Adobo', price_centavos = 9900,
  internal_df_centavos = 1400
where id = '92000000-0000-4000-8000-000000000001';
select ok((select name_snapshot = 'Fake Adobo' and unit_price_centavos = 8500
  and internal_df_centavos = 1000
  from public.published_menu_items
  where published_menu_id = '91000000-0000-4000-8000-000000000001'
    and catalog_item_id = '92000000-0000-4000-8000-000000000001'),
  'later catalog edits do not rewrite the published snapshot');

set local role authenticated;
select is(
  public.admin_set_menu_item_sold_out(
    (select id from public.published_menu_items
      where published_menu_id = '91000000-0000-4000-8000-000000000001'
        and catalog_item_id = '92000000-0000-4000-8000-000000000001'), true
  ),
  (select id from public.published_menu_items
    where published_menu_id = '91000000-0000-4000-8000-000000000001'
      and catalog_item_id = '92000000-0000-4000-8000-000000000001'),
  'sold-out mutation returns the scoped published item'
);
reset role;
select ok((select item.is_sold_out and not catalog.is_archived
  from public.published_menu_items as item
  join public.catalog_items as catalog on catalog.id = item.catalog_item_id
  where item.published_menu_id = '91000000-0000-4000-8000-000000000001'
    and item.catalog_item_id = '92000000-0000-4000-8000-000000000001'),
  'sold-out state changes only the published item, not the catalog');

insert into public.published_menus (
  id, image_path, is_current, activated_at, expires_at, deactivated_at
) values (
  '91000000-0000-4000-8000-000000000009', 'menus/historical/fake.jpg', false,
  statement_timestamp() - interval '2 days', statement_timestamp() - interval '1 day',
  statement_timestamp() - interval '1 day'
);
insert into public.published_menu_items (
  id, published_menu_id, name_snapshot, category_snapshot,
  unit_price_centavos, internal_df_centavos, photo_path_snapshot
) values (
  '93000000-0000-4000-8000-000000000009',
  '91000000-0000-4000-8000-000000000009', 'Historical', 'ULAM', 100, 0,
  'catalog/historical/fake.jpg'
);
set local role authenticated;
select throws_ok(
  $$select public.admin_set_menu_item_sold_out(
    '93000000-0000-4000-8000-000000000009', true
  )$$,
  'P0001', 'MENU_ITEM_NOT_ACTIVE',
  'sold-out mutation cannot change an inactive historical menu item'
);
select is(
  public.admin_deactivate_menu('91000000-0000-4000-8000-000000000001'),
  '91000000-0000-4000-8000-000000000001'::uuid,
  'active admin can deactivate the current menu'
);
reset role;

select ok((select not is_current and deactivated_at is not null
  from public.published_menus where id = '91000000-0000-4000-8000-000000000001'),
  'deactivation clears current state without deleting the menu');
set local role anon;
select is((select count(*) from public.published_menus), 0::bigint,
  'customers no longer see a deactivated menu');
reset role;
select ok(exists(select 1 from public.published_menus
  where id = '91000000-0000-4000-8000-000000000001')
  and (select count(*) = 2 from public.published_menu_items
    where published_menu_id = '91000000-0000-4000-8000-000000000001'),
  'deactivation preserves menu and item history');

set local role authenticated;
select is(
  public.admin_publish_menu(
    '91000000-0000-4000-8000-000000000002',
    'menus/91000000-0000-4000-8000-000000000002/91000000-0000-4000-8000-000000000098.png',
    array['92000000-0000-4000-8000-000000000001']::uuid[]
  ),
  '91000000-0000-4000-8000-000000000002'::uuid,
  'publishing is allowed after the previous menu is deactivated'
);
reset role;
select ok((select name_snapshot = 'Changed Adobo' and unit_price_centavos = 9900
  and internal_df_centavos = 1400
  from public.published_menu_items
  where published_menu_id = '91000000-0000-4000-8000-000000000002'),
  'a future menu snapshots the newly edited catalog values');
select ok((select expires_at > activated_at
  and expires_at <= activated_at + interval '24 hours'
  from public.published_menus where id = '91000000-0000-4000-8000-000000000002'),
  'every newly published menu remains within the server-enforced lifetime');

select * from finish();
rollback;
