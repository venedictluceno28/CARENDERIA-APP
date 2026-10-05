-- Phase 2.5: reusable catalog operations and public product-image storage.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'public-assets',
  'public-assets',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = true,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.admin_authorize_catalog_image_upload(
  p_catalog_item_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_active_admin();
  if p_catalog_item_id is null then
    raise exception using errcode = '22023', message = 'INVALID_CATALOG_ITEM';
  end if;
  return jsonb_build_object(
    'catalog_item_id', p_catalog_item_id,
    'bucket_id', 'public-assets',
    'path_prefix', 'catalog/' || p_catalog_item_id::text || '/'
  );
end;
$$;

create or replace function public.admin_create_catalog_item(
  p_catalog_item_id uuid,
  p_name text,
  p_category text,
  p_price_centavos bigint,
  p_internal_df_centavos bigint,
  p_photo_path text
)
returns public.catalog_items
language plpgsql
security definer
set search_path = ''
as $$
declare created public.catalog_items;
begin
  perform private.require_active_admin();
  if p_catalog_item_id is null
    or char_length(btrim(coalesce(p_name, ''))) not between 1 and 160
    or p_category not in ('ULAM', 'DESSERTS', 'EXTRAS')
    or p_price_centavos is null or p_price_centavos < 0
    or p_internal_df_centavos is null or p_internal_df_centavos < 0
    or p_photo_path !~ ('^catalog/' || p_catalog_item_id::text || '/[0-9a-f-]+\.(jpg|png|webp)$') then
    raise exception using errcode = '22023', message = 'INVALID_CATALOG_ITEM';
  end if;
  insert into public.catalog_items (
    id, name, category, price_centavos, internal_df_centavos,
    photo_path, created_by
  ) values (
    p_catalog_item_id, btrim(p_name), p_category, p_price_centavos,
    p_internal_df_centavos, p_photo_path, auth.uid()
  ) returning * into created;
  return created;
end;
$$;

create or replace function public.admin_update_catalog_item(
  p_catalog_item_id uuid,
  p_name text,
  p_category text,
  p_price_centavos bigint,
  p_internal_df_centavos bigint,
  p_photo_path text default null
)
returns public.catalog_items
language plpgsql
security definer
set search_path = ''
as $$
declare updated public.catalog_items;
begin
  perform private.require_active_admin();
  if p_catalog_item_id is null
    or char_length(btrim(coalesce(p_name, ''))) not between 1 and 160
    or p_category not in ('ULAM', 'DESSERTS', 'EXTRAS')
    or p_price_centavos is null or p_price_centavos < 0
    or p_internal_df_centavos is null or p_internal_df_centavos < 0
    or (p_photo_path is not null and p_photo_path !~ ('^catalog/' || p_catalog_item_id::text || '/[0-9a-f-]+\.(jpg|png|webp)$')) then
    raise exception using errcode = '22023', message = 'INVALID_CATALOG_ITEM';
  end if;
  update public.catalog_items set
    name = btrim(p_name),
    category = p_category,
    price_centavos = p_price_centavos,
    internal_df_centavos = p_internal_df_centavos,
    photo_path = coalesce(p_photo_path, photo_path)
  where id = p_catalog_item_id
  returning * into updated;
  if not found then
    raise exception using errcode = 'P0001', message = 'CATALOG_ITEM_NOT_FOUND';
  end if;
  return updated;
end;
$$;

create or replace function public.admin_set_catalog_item_archived(
  p_catalog_item_id uuid,
  p_archived boolean
)
returns public.catalog_items
language plpgsql
security definer
set search_path = ''
as $$
declare updated public.catalog_items;
begin
  perform private.require_active_admin();
  if p_catalog_item_id is null or p_archived is null then
    raise exception using errcode = '22023', message = 'INVALID_CATALOG_ITEM';
  end if;
  update public.catalog_items
  set is_archived = p_archived
  where id = p_catalog_item_id
  returning * into updated;
  if not found then
    raise exception using errcode = 'P0001', message = 'CATALOG_ITEM_NOT_FOUND';
  end if;
  return updated;
end;
$$;

revoke all on function public.admin_authorize_catalog_image_upload(uuid) from public, anon;
revoke all on function public.admin_create_catalog_item(uuid, text, text, bigint, bigint, text) from public, anon;
revoke all on function public.admin_update_catalog_item(uuid, text, text, bigint, bigint, text) from public, anon;
revoke all on function public.admin_set_catalog_item_archived(uuid, boolean) from public, anon;

grant execute on function public.admin_authorize_catalog_image_upload(uuid) to authenticated;
grant execute on function public.admin_create_catalog_item(uuid, text, text, bigint, bigint, text) to authenticated;
grant execute on function public.admin_update_catalog_item(uuid, text, text, bigint, bigint, text) to authenticated;
grant execute on function public.admin_set_catalog_item_archived(uuid, boolean) to authenticated;

