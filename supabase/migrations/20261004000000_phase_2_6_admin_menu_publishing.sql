-- Phase 2.6: trusted daily-menu publishing and availability operations.

create or replace function public.admin_authorize_menu_image_upload(
  p_menu_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_active_admin();
  if p_menu_id is null then
    raise exception using errcode = '22023', message = 'INVALID_MENU';
  end if;
  return jsonb_build_object(
    'menu_id', p_menu_id,
    'bucket_id', 'public-assets',
    'path_prefix', 'menus/' || p_menu_id::text || '/'
  );
end;
$$;

create or replace function public.admin_get_active_menu()
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare result jsonb;
begin
  perform private.require_active_admin();
  select jsonb_build_object(
    'id', menu.id,
    'image_path', menu.image_path,
    'activated_at', menu.activated_at,
    'expires_at', menu.expires_at,
    'items', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', item.id,
          'catalog_item_id', item.catalog_item_id,
          'name_snapshot', item.name_snapshot,
          'category_snapshot', item.category_snapshot,
          'unit_price_centavos', item.unit_price_centavos,
          'internal_df_centavos', item.internal_df_centavos,
          'photo_path_snapshot', item.photo_path_snapshot,
          'is_sold_out', item.is_sold_out,
          'sort_order', item.sort_order
        ) order by item.sort_order, item.name_snapshot
      )
      from public.published_menu_items as item
      where item.published_menu_id = menu.id
    ), '[]'::jsonb)
  ) into result
  from public.published_menus as menu
  where menu.is_current
    and menu.activated_at <= statement_timestamp()
    and menu.expires_at > statement_timestamp()
    and menu.deactivated_at is null
  order by menu.activated_at desc
  limit 1;
  return result;
end;
$$;

create or replace function public.admin_publish_menu(
  p_menu_id uuid,
  p_image_path text,
  p_catalog_item_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  published_at timestamptz := statement_timestamp();
  selected_count integer;
begin
  perform private.require_active_admin();
  if p_menu_id is null
    or p_image_path !~ ('^menus/' || p_menu_id::text || '/[0-9a-f-]+\.(jpg|png|webp)$')
    or coalesce(cardinality(p_catalog_item_ids), 0) not between 1 and 100
    or array_position(p_catalog_item_ids, null) is not null
    or (select count(distinct selected_id) from unnest(p_catalog_item_ids) as selected(selected_id))
      <> cardinality(p_catalog_item_ids) then
    raise exception using errcode = '22023', message = 'INVALID_MENU';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('public.admin_publish_menu', 0));

  update public.published_menus
  set is_current = false,
      deactivated_at = coalesce(deactivated_at, expires_at)
  where is_current
    and expires_at <= published_at;

  if exists (select 1 from public.published_menus where is_current) then
    raise exception using errcode = 'P0001', message = 'MENU_ACTIVE_EXISTS';
  end if;

  select count(*) into selected_count
  from unnest(p_catalog_item_ids) as selected(id)
  join public.catalog_items as item on item.id = selected.id
  where not item.is_archived;
  if selected_count <> cardinality(p_catalog_item_ids) then
    raise exception using errcode = 'P0001', message = 'CATALOG_SELECTION_INVALID';
  end if;

  insert into public.published_menus (
    id, image_path, is_current, activated_at, expires_at, created_by
  ) values (
    p_menu_id, p_image_path, true, published_at,
    published_at + interval '24 hours', auth.uid()
  );

  insert into public.published_menu_items (
    published_menu_id, catalog_item_id, name_snapshot, category_snapshot,
    unit_price_centavos, internal_df_centavos, photo_path_snapshot, sort_order
  )
  select
    p_menu_id, item.id, item.name, item.category, item.price_centavos,
    item.internal_df_centavos, item.photo_path, selected.ordinality - 1
  from unnest(p_catalog_item_ids) with ordinality as selected(id, ordinality)
  join public.catalog_items as item on item.id = selected.id
  order by selected.ordinality;

  return p_menu_id;
end;
$$;

create or replace function public.admin_deactivate_menu(
  p_menu_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_active_admin();
  if p_menu_id is null then
    raise exception using errcode = '22023', message = 'INVALID_MENU';
  end if;
  update public.published_menus
  set is_current = false,
      deactivated_at = statement_timestamp()
  where id = p_menu_id
    and is_current
    and deactivated_at is null;
  if not found then
    raise exception using errcode = 'P0001', message = 'MENU_NOT_ACTIVE';
  end if;
  return p_menu_id;
end;
$$;

create or replace function public.admin_set_menu_item_sold_out(
  p_menu_item_id uuid,
  p_sold_out boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_active_admin();
  if p_menu_item_id is null or p_sold_out is null then
    raise exception using errcode = '22023', message = 'INVALID_MENU_ITEM';
  end if;
  update public.published_menu_items as item
  set is_sold_out = p_sold_out
  where item.id = p_menu_item_id
    and exists (
      select 1
      from public.published_menus as menu
      where menu.id = item.published_menu_id
        and menu.is_current
        and menu.activated_at <= statement_timestamp()
        and menu.expires_at > statement_timestamp()
        and menu.deactivated_at is null
    );
  if not found then
    raise exception using errcode = 'P0001', message = 'MENU_ITEM_NOT_ACTIVE';
  end if;
  return p_menu_item_id;
end;
$$;

-- Application admins mutate menus only through the trusted snapshot operations.
revoke insert, update on table public.published_menus from authenticated;
revoke insert, update on table public.published_menu_items from authenticated;

revoke all on function public.admin_authorize_menu_image_upload(uuid) from public, anon;
revoke all on function public.admin_get_active_menu() from public, anon;
revoke all on function public.admin_publish_menu(uuid, text, uuid[]) from public, anon;
revoke all on function public.admin_deactivate_menu(uuid) from public, anon;
revoke all on function public.admin_set_menu_item_sold_out(uuid, boolean) from public, anon;

grant execute on function public.admin_authorize_menu_image_upload(uuid) to authenticated;
grant execute on function public.admin_get_active_menu() to authenticated;
grant execute on function public.admin_publish_menu(uuid, text, uuid[]) to authenticated;
grant execute on function public.admin_deactivate_menu(uuid) to authenticated;
grant execute on function public.admin_set_menu_item_sold_out(uuid, boolean) to authenticated;
