-- CARENDERIA-APP Phase 1.1: trusted checkout and order operations.
-- Browser callers express intent only. Authoritative prices, delivery values,
-- calculations, snapshots, and operational mutations are database-controlled.

create or replace function private.generate_order_code_candidate()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  random_bytes bytea := extensions.gen_random_bytes(10);
  result text := 'CRD-';
begin
  for position in 0..9 loop
    result := result || substr(alphabet, (get_byte(random_bytes, position) & 31) + 1, 1);
  end loop;
  return result;
end;
$$;

revoke all on function private.generate_order_code_candidate() from public;
grant usage on schema private to service_role;
grant execute on function private.generate_order_code_candidate() to service_role;

create or replace function private.require_active_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select private.is_active_admin()) then
    raise exception using errcode = '42501', message = 'ADMIN_REQUIRED';
  end if;
end;
$$;

revoke all on function private.require_active_admin() from public;

alter table public.orders
  add constraint orders_guest_token_sha256_check
  check (
    guest_access_token_hash is null
    or guest_access_token_hash ~ '^[0-9a-f]{64}$'
  ) not valid;

alter table public.orders validate constraint orders_guest_token_sha256_check;

create or replace function public.create_online_order(
  p_published_menu_id uuid,
  p_items jsonb,
  p_customer_name text,
  p_exact_address text,
  p_location_classification text,
  p_selected_area_name text,
  p_payment_method text,
  p_guest_token_hash text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  created_timestamp timestamptz := statement_timestamp();
  created_order_id uuid := gen_random_uuid();
  created_order_code text;
  guest_expiry timestamptz := created_timestamp + interval '24 hours';
  canonical_area_name text;
  settings public.store_settings%rowtype;
  menu public.published_menus%rowtype;
  authoritative_items jsonb;
  conflict_items jsonb;
  food_subtotal bigint;
  internal_df_total bigint;
  base_delivery_charge bigint;
  far_area_charge bigint;
  customer_delivery_charge bigint;
  grand_total bigint;
  calculated_rider bigint;
  payment_state text;
  original_snapshot jsonb;
  requested_count integer;
  inserted boolean := false;
begin
  if jsonb_typeof(p_items) is distinct from 'array'
    or jsonb_array_length(p_items) = 0
    or jsonb_array_length(p_items) > 50
  then
    raise exception using errcode = '22023', message = 'INVALID_ITEMS';
  end if;

  if char_length(btrim(coalesce(p_customer_name, ''))) not between 1 and 160
    or char_length(btrim(coalesce(p_exact_address, ''))) not between 1 and 1000
  then
    raise exception using errcode = '22023', message = 'INVALID_CUSTOMER_DETAILS';
  end if;

  if p_location_classification not in ('NEARBY', 'OUTSIDE') then
    raise exception using errcode = '22023', message = 'INVALID_LOCATION';
  end if;

  if p_payment_method not in ('CASH', 'ONLINE_PAYMENT') then
    raise exception using errcode = '22023', message = 'INVALID_PAYMENT_METHOD';
  end if;

  if p_guest_token_hash is null
    or p_guest_token_hash !~ '^[0-9a-f]{64}$'
  then
    raise exception using errcode = '22023', message = 'INVALID_GUEST_TOKEN';
  end if;

  begin
    select count(*)
    into requested_count
    from jsonb_to_recordset(p_items) as requested(
      published_menu_item_id uuid,
      quantity integer,
      expected_unit_price_centavos bigint
    );
  exception when others then
    raise exception using errcode = '22023', message = 'INVALID_ITEMS';
  end;

  if requested_count <> jsonb_array_length(p_items)
    or exists (
      select 1
      from jsonb_to_recordset(p_items) as requested(
        published_menu_item_id uuid,
        quantity integer,
        expected_unit_price_centavos bigint
      )
      where published_menu_item_id is null
        or quantity is null
        or quantity <= 0
        or expected_unit_price_centavos is null
        or expected_unit_price_centavos < 0
    )
  then
    raise exception using errcode = '22023', message = 'INVALID_QUANTITY';
  end if;

  if (
    select count(distinct requested.published_menu_item_id)
    from jsonb_to_recordset(p_items) as requested(
      published_menu_item_id uuid,
      quantity integer,
      expected_unit_price_centavos bigint
    )
  ) <> requested_count then
    raise exception using errcode = '22023', message = 'DUPLICATE_ITEM';
  end if;

  select * into menu
  from public.published_menus
  where id = p_published_menu_id
  for update;

  if not found or not menu.is_current or menu.deactivated_at is not null
    or menu.activated_at is null or menu.activated_at > created_timestamp
  then
    raise exception using errcode = 'P0001', message = 'MENU_INACTIVE';
  end if;

  if menu.expires_at is null or menu.expires_at <= created_timestamp then
    raise exception using errcode = 'P0001', message = 'MENU_EXPIRED';
  end if;

  -- Lock every matching line before final availability and price validation.
  perform 1
  from public.published_menu_items as menu_item
  join jsonb_to_recordset(p_items) as requested(
    published_menu_item_id uuid,
    quantity integer,
    expected_unit_price_centavos bigint
  ) on requested.published_menu_item_id = menu_item.id
  where menu_item.published_menu_id = p_published_menu_id
  for update of menu_item;

  if (
    select count(*)
    from public.published_menu_items as menu_item
    join jsonb_to_recordset(p_items) as requested(
      published_menu_item_id uuid,
      quantity integer,
      expected_unit_price_centavos bigint
    ) on requested.published_menu_item_id = menu_item.id
    where menu_item.published_menu_id = p_published_menu_id
  ) <> requested_count then
    raise exception using errcode = 'P0001', message = 'ITEM_NOT_FOUND';
  end if;

  select jsonb_agg(jsonb_build_object(
    'published_menu_item_id', menu_item.id,
    'name', menu_item.name_snapshot
  ) order by menu_item.sort_order, menu_item.id)
  into conflict_items
  from public.published_menu_items as menu_item
  join jsonb_to_recordset(p_items) as requested(
    published_menu_item_id uuid,
    quantity integer,
    expected_unit_price_centavos bigint
  ) on requested.published_menu_item_id = menu_item.id
  where menu_item.published_menu_id = p_published_menu_id
    and menu_item.is_sold_out;

  if conflict_items is not null then
    raise exception using
      errcode = 'P0001',
      message = 'ITEM_SOLD_OUT|' || conflict_items::text;
  end if;

  select jsonb_agg(jsonb_build_object(
    'published_menu_item_id', menu_item.id,
    'name', menu_item.name_snapshot,
    'expected_unit_price_centavos', requested.expected_unit_price_centavos,
    'current_unit_price_centavos', menu_item.unit_price_centavos
  ) order by menu_item.sort_order, menu_item.id)
  into conflict_items
  from public.published_menu_items as menu_item
  join jsonb_to_recordset(p_items) as requested(
    published_menu_item_id uuid,
    quantity integer,
    expected_unit_price_centavos bigint
  ) on requested.published_menu_item_id = menu_item.id
  where menu_item.published_menu_id = p_published_menu_id
    and requested.expected_unit_price_centavos <> menu_item.unit_price_centavos;

  if conflict_items is not null then
    raise exception using
      errcode = 'P0001',
      message = 'PRICE_CHANGED|' || conflict_items::text;
  end if;

  select * into settings
  from public.store_settings
  where id = 1
  for share;

  if not found then
    raise exception using errcode = 'P0001', message = 'CHECKOUT_FAILED';
  end if;

  if p_location_classification = 'NEARBY' then
    select area_name into canonical_area_name
    from unnest(settings.nearby_area_names) as area_name
    where lower(btrim(area_name)) = lower(btrim(coalesce(p_selected_area_name, '')))
    limit 1;

    if canonical_area_name is null then
      raise exception using errcode = '22023', message = 'INVALID_LOCATION';
    end if;
  else
    canonical_area_name := null;
  end if;

  select
    jsonb_agg(jsonb_build_object(
      'published_menu_item_id', menu_item.id,
      'catalog_item_id', menu_item.catalog_item_id,
      'name', menu_item.name_snapshot,
      'category', menu_item.category_snapshot,
      'quantity', requested.quantity,
      'unit_price_centavos', menu_item.unit_price_centavos,
      'internal_df_per_unit_centavos', menu_item.internal_df_centavos,
      'item_subtotal_centavos', requested.quantity::bigint * menu_item.unit_price_centavos,
      'internal_df_total_centavos', requested.quantity::bigint * menu_item.internal_df_centavos,
      'sort_order', menu_item.sort_order
    ) order by menu_item.sort_order, menu_item.id),
    sum(requested.quantity::bigint * menu_item.unit_price_centavos),
    sum(requested.quantity::bigint * menu_item.internal_df_centavos)
  into authoritative_items, food_subtotal, internal_df_total
  from public.published_menu_items as menu_item
  join jsonb_to_recordset(p_items) as requested(
    published_menu_item_id uuid,
    quantity integer,
    expected_unit_price_centavos bigint
  ) on requested.published_menu_item_id = menu_item.id
  where menu_item.published_menu_id = p_published_menu_id;

  base_delivery_charge := case
    when internal_df_total >= settings.delivery_threshold_centavos then 0
    else settings.base_charge_centavos
  end;
  far_area_charge := case
    when p_location_classification = 'OUTSIDE' then settings.far_area_charge_centavos
    else 0
  end;
  customer_delivery_charge := base_delivery_charge + far_area_charge;
  grand_total := food_subtotal + customer_delivery_charge;
  calculated_rider := internal_df_total + customer_delivery_charge;
  payment_state := case when p_payment_method = 'ONLINE_PAYMENT' then 'NOT_VERIFIED' end;

  for attempt in 1..10 loop
    created_order_code := private.generate_order_code_candidate();
    original_snapshot := jsonb_build_object(
      'snapshot_version', 1,
      'order_code', created_order_code,
      'source', 'ONLINE',
      'created_at', created_timestamp,
      'customer', jsonb_build_object(
        'name', btrim(p_customer_name),
        'exact_address', btrim(p_exact_address),
        'location_classification', p_location_classification,
        'selected_area_name', canonical_area_name
      ),
      'payment', jsonb_build_object(
        'method', p_payment_method,
        'verification_state', payment_state,
        'verified_at', null
      ),
      'published_menu_id', p_published_menu_id,
      'items', authoritative_items,
      'totals', jsonb_build_object(
        'food_subtotal_centavos', food_subtotal,
        'internal_df_total_centavos', internal_df_total,
        'base_delivery_charge_centavos', base_delivery_charge,
        'far_area_charge_centavos', far_area_charge,
        'customer_delivery_charge_centavos', customer_delivery_charge,
        'grand_total_centavos', grand_total,
        'calculated_rider_centavos', calculated_rider
      ),
      'delivery_settings', jsonb_build_object(
        'delivery_threshold_centavos', settings.delivery_threshold_centavos,
        'base_charge_below_threshold_centavos', settings.base_charge_centavos,
        'far_area_rate_centavos', settings.far_area_charge_centavos,
        'nearby_area_names', to_jsonb(settings.nearby_area_names)
      )
    );

    begin
      insert into public.orders (
        id, order_code, source, published_menu_id, customer_name, exact_address,
        location_classification, selected_area_name, payment_method,
        payment_verification_state, verified_at, delivery_threshold_centavos,
        base_charge_below_threshold_centavos, far_area_rate_centavos,
        food_subtotal_centavos, internal_df_total_centavos,
        base_delivery_charge_centavos, far_area_charge_centavos,
        guest_access_token_hash, guest_chat_expires_at, original_snapshot,
        created_at, last_edited_at
      ) values (
        created_order_id, created_order_code, 'ONLINE', p_published_menu_id,
        btrim(p_customer_name), btrim(p_exact_address), p_location_classification,
        canonical_area_name, p_payment_method, payment_state, null,
        settings.delivery_threshold_centavos, settings.base_charge_centavos,
        settings.far_area_charge_centavos, food_subtotal, internal_df_total,
        base_delivery_charge, far_area_charge, p_guest_token_hash, guest_expiry,
        original_snapshot, created_timestamp, created_timestamp
      );
      inserted := true;
      exit;
    exception when unique_violation then
      if exists (
        select 1 from public.orders
        where guest_access_token_hash = p_guest_token_hash
      ) then
        raise exception using errcode = '23505', message = 'GUEST_TOKEN_COLLISION';
      end if;
    end;
  end loop;

  if not inserted then
    raise exception using errcode = 'P0001', message = 'ORDER_CODE_GENERATION_FAILED';
  end if;

  insert into public.order_items (
    order_id, published_menu_item_id, catalog_item_id, name_snapshot,
    category_snapshot, quantity, unit_price_centavos,
    internal_df_per_unit_centavos, sort_order
  )
  select
    created_order_id,
    (item ->> 'published_menu_item_id')::uuid,
    nullif(item ->> 'catalog_item_id', '')::uuid,
    item ->> 'name',
    item ->> 'category',
    (item ->> 'quantity')::integer,
    (item ->> 'unit_price_centavos')::bigint,
    (item ->> 'internal_df_per_unit_centavos')::bigint,
    (item ->> 'sort_order')::integer
  from jsonb_array_elements(authoritative_items) as item;

  return jsonb_build_object(
    'order_id', created_order_id,
    'order_code', created_order_code,
    'created_at', created_timestamp,
    'guest_expires_at', guest_expiry,
    'payment_method', p_payment_method,
    'payment_verification_state', payment_state,
    'items', authoritative_items,
    'food_subtotal_centavos', food_subtotal,
    'base_delivery_charge_centavos', base_delivery_charge,
    'far_area_charge_centavos', far_area_charge,
    'customer_delivery_charge_centavos', customer_delivery_charge,
    'grand_total_centavos', grand_total
  );
exception
  when sqlstate '22003' then
    raise exception using errcode = '22023', message = 'INVALID_QUANTITY';
end;
$$;

revoke all on function public.create_online_order(uuid, jsonb, text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.create_online_order(uuid, jsonb, text, text, text, text, text, text)
  to service_role;

create or replace function public.admin_create_manual_order(
  p_items jsonb,
  p_customer_name text,
  p_exact_address text,
  p_location_classification text,
  p_selected_area_name text,
  p_payment_method text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_timestamp timestamptz := statement_timestamp();
  created_order_id uuid := gen_random_uuid();
  created_order_code text;
  canonical_area_name text;
  settings public.store_settings%rowtype;
  normalized_items jsonb;
  food_subtotal bigint;
  internal_df_total bigint;
  base_delivery_charge bigint;
  far_area_charge bigint;
  payment_state text;
  original_snapshot jsonb;
  inserted boolean := false;
begin
  perform private.require_active_admin();

  if jsonb_typeof(p_items) is distinct from 'array'
    or jsonb_array_length(p_items) = 0
    or jsonb_array_length(p_items) > 50
  then
    raise exception using errcode = '22023', message = 'INVALID_ITEMS';
  end if;
  if char_length(btrim(coalesce(p_customer_name, ''))) not between 1 and 160
    or char_length(btrim(coalesce(p_exact_address, ''))) not between 1 and 1000
  then
    raise exception using errcode = '22023', message = 'INVALID_CUSTOMER_DETAILS';
  end if;
  if p_location_classification not in ('NEARBY', 'OUTSIDE') then
    raise exception using errcode = '22023', message = 'INVALID_LOCATION';
  end if;
  if p_payment_method not in ('CASH', 'ONLINE_PAYMENT') then
    raise exception using errcode = '22023', message = 'INVALID_PAYMENT_METHOD';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_items) as item(
      name text, category text, quantity integer,
      unit_price_centavos bigint, internal_df_per_unit_centavos bigint
    )
    where char_length(btrim(coalesce(name, ''))) not between 1 and 160
      or category not in ('ULAM', 'DESSERTS', 'EXTRAS')
      or quantity is null or quantity <= 0
      or unit_price_centavos is null or unit_price_centavos < 0
      or internal_df_per_unit_centavos is null or internal_df_per_unit_centavos < 0
  ) then
    raise exception using errcode = '22023', message = 'INVALID_ITEMS';
  end if;

  select * into settings from public.store_settings where id = 1 for share;
  if p_location_classification = 'NEARBY' then
    select area_name into canonical_area_name
    from unnest(settings.nearby_area_names) as area_name
    where lower(btrim(area_name)) = lower(btrim(coalesce(p_selected_area_name, '')))
    limit 1;
    if canonical_area_name is null then
      raise exception using errcode = '22023', message = 'INVALID_LOCATION';
    end if;
  end if;

  select jsonb_agg(jsonb_build_object(
      'name', btrim(item.name), 'category', item.category,
      'quantity', item.quantity, 'unit_price_centavos', item.unit_price_centavos,
      'internal_df_per_unit_centavos', item.internal_df_per_unit_centavos,
      'item_subtotal_centavos', item.quantity::bigint * item.unit_price_centavos,
      'internal_df_total_centavos', item.quantity::bigint * item.internal_df_per_unit_centavos,
      'sort_order', item.ordinality - 1
    ) order by item.ordinality),
    sum(item.quantity::bigint * item.unit_price_centavos),
    sum(item.quantity::bigint * item.internal_df_per_unit_centavos)
  into normalized_items, food_subtotal, internal_df_total
  from (
    select record.*, element.ordinality
    from jsonb_array_elements(p_items) with ordinality as element(value, ordinality)
    cross join lateral jsonb_to_record(element.value) as record(
      name text, category text, quantity integer,
      unit_price_centavos bigint, internal_df_per_unit_centavos bigint
    )
  ) as item;

  base_delivery_charge := case when internal_df_total >= settings.delivery_threshold_centavos then 0 else settings.base_charge_centavos end;
  far_area_charge := case when p_location_classification = 'OUTSIDE' then settings.far_area_charge_centavos else 0 end;
  payment_state := case when p_payment_method = 'ONLINE_PAYMENT' then 'NOT_VERIFIED' end;

  for attempt in 1..10 loop
    created_order_code := private.generate_order_code_candidate();
    original_snapshot := jsonb_build_object(
      'snapshot_version', 1, 'order_code', created_order_code, 'source', 'MANUAL',
      'created_at', created_timestamp,
      'customer', jsonb_build_object('name', btrim(p_customer_name), 'exact_address', btrim(p_exact_address),
        'location_classification', p_location_classification, 'selected_area_name', canonical_area_name),
      'payment', jsonb_build_object('method', p_payment_method, 'verification_state', payment_state, 'verified_at', null),
      'published_menu_id', null, 'items', normalized_items,
      'totals', jsonb_build_object(
        'food_subtotal_centavos', food_subtotal, 'internal_df_total_centavos', internal_df_total,
        'base_delivery_charge_centavos', base_delivery_charge, 'far_area_charge_centavos', far_area_charge,
        'customer_delivery_charge_centavos', base_delivery_charge + far_area_charge,
        'grand_total_centavos', food_subtotal + base_delivery_charge + far_area_charge,
        'calculated_rider_centavos', internal_df_total + base_delivery_charge + far_area_charge),
      'delivery_settings', jsonb_build_object(
        'delivery_threshold_centavos', settings.delivery_threshold_centavos,
        'base_charge_below_threshold_centavos', settings.base_charge_centavos,
        'far_area_rate_centavos', settings.far_area_charge_centavos,
        'nearby_area_names', to_jsonb(settings.nearby_area_names))
    );
    begin
      insert into public.orders (
        id, order_code, source, customer_name, exact_address, location_classification,
        selected_area_name, payment_method, payment_verification_state,
        delivery_threshold_centavos, base_charge_below_threshold_centavos,
        far_area_rate_centavos, food_subtotal_centavos, internal_df_total_centavos,
        base_delivery_charge_centavos, far_area_charge_centavos, original_snapshot,
        created_at, last_edited_at, created_by
      ) values (
        created_order_id, created_order_code, 'MANUAL', btrim(p_customer_name), btrim(p_exact_address),
        p_location_classification, canonical_area_name, p_payment_method, payment_state,
        settings.delivery_threshold_centavos, settings.base_charge_centavos, settings.far_area_charge_centavos,
        food_subtotal, internal_df_total, base_delivery_charge, far_area_charge,
        original_snapshot, created_timestamp, created_timestamp, auth.uid()
      );
      inserted := true;
      exit;
    exception when unique_violation then
      null;
    end;
  end loop;
  if not inserted then
    raise exception using errcode = 'P0001', message = 'ORDER_CODE_GENERATION_FAILED';
  end if;

  insert into public.order_items (
    order_id, name_snapshot, category_snapshot, quantity, unit_price_centavos,
    internal_df_per_unit_centavos, sort_order
  )
  select created_order_id, item ->> 'name', item ->> 'category',
    (item ->> 'quantity')::integer, (item ->> 'unit_price_centavos')::bigint,
    (item ->> 'internal_df_per_unit_centavos')::bigint, (item ->> 'sort_order')::integer
  from jsonb_array_elements(normalized_items) as item;

  return jsonb_build_object('order_id', created_order_id, 'order_code', created_order_code,
    'created_at', created_timestamp, 'grand_total_centavos', food_subtotal + base_delivery_charge + far_area_charge,
    'calculated_rider_centavos', internal_df_total + base_delivery_charge + far_area_charge);
end;
$$;

revoke all on function public.admin_create_manual_order(jsonb, text, text, text, text, text)
  from public, anon;
grant execute on function public.admin_create_manual_order(jsonb, text, text, text, text, text)
  to authenticated;

create or replace function public.admin_edit_order(
  p_order_id uuid,
  p_items jsonb,
  p_customer_name text,
  p_exact_address text,
  p_location_classification text,
  p_selected_area_name text,
  p_payment_method text,
  p_delivery_threshold_centavos bigint default null,
  p_base_charge_below_threshold_centavos bigint default null,
  p_far_area_rate_centavos bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.orders%rowtype;
  settings public.store_settings%rowtype;
  canonical_area_name text;
  normalized_items jsonb;
  food_subtotal bigint;
  internal_df_total bigint;
  threshold_value bigint;
  base_rate bigint;
  far_rate bigint;
  base_delivery_charge bigint;
  far_area_charge bigint;
  payment_state text;
begin
  perform private.require_active_admin();
  select * into target from public.orders where id = p_order_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'ORDER_NOT_FOUND'; end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 50 then
    raise exception using errcode = '22023', message = 'INVALID_ITEMS';
  end if;
  if char_length(btrim(coalesce(p_customer_name, ''))) not between 1 and 160
    or char_length(btrim(coalesce(p_exact_address, ''))) not between 1 and 1000 then
    raise exception using errcode = '22023', message = 'INVALID_CUSTOMER_DETAILS';
  end if;
  if p_location_classification not in ('NEARBY', 'OUTSIDE') then raise exception using errcode = '22023', message = 'INVALID_LOCATION'; end if;
  if p_payment_method not in ('CASH', 'ONLINE_PAYMENT') then raise exception using errcode = '22023', message = 'INVALID_PAYMENT_METHOD'; end if;
  if exists (
    select 1 from jsonb_to_recordset(p_items) as item(
      name text, category text, quantity integer, unit_price_centavos bigint,
      internal_df_per_unit_centavos bigint, published_menu_item_id uuid, catalog_item_id uuid)
    where char_length(btrim(coalesce(name, ''))) not between 1 and 160
      or category not in ('ULAM', 'DESSERTS', 'EXTRAS') or quantity is null or quantity <= 0
      or unit_price_centavos is null or unit_price_centavos < 0
      or internal_df_per_unit_centavos is null or internal_df_per_unit_centavos < 0
  ) then raise exception using errcode = '22023', message = 'INVALID_ITEMS'; end if;

  select * into settings from public.store_settings where id = 1;
  if p_location_classification = 'NEARBY' then
    select area_name into canonical_area_name from unnest(settings.nearby_area_names) as area_name
    where lower(btrim(area_name)) = lower(btrim(coalesce(p_selected_area_name, ''))) limit 1;
    if canonical_area_name is null then raise exception using errcode = '22023', message = 'INVALID_LOCATION'; end if;
  end if;

  threshold_value := coalesce(p_delivery_threshold_centavos, target.delivery_threshold_centavos);
  base_rate := coalesce(p_base_charge_below_threshold_centavos, target.base_charge_below_threshold_centavos);
  far_rate := coalesce(p_far_area_rate_centavos, target.far_area_rate_centavos);
  if threshold_value < 0 or base_rate < 0 or far_rate < 0 then raise exception using errcode = '22023', message = 'INVALID_DELIVERY_SETTINGS'; end if;

  select jsonb_agg(jsonb_build_object(
      'published_menu_item_id', item.published_menu_item_id, 'catalog_item_id', item.catalog_item_id,
      'name', btrim(item.name), 'category', item.category, 'quantity', item.quantity,
      'unit_price_centavos', item.unit_price_centavos,
      'internal_df_per_unit_centavos', item.internal_df_per_unit_centavos,
      'sort_order', item.ordinality - 1) order by item.ordinality),
    sum(item.quantity::bigint * item.unit_price_centavos),
    sum(item.quantity::bigint * item.internal_df_per_unit_centavos)
  into normalized_items, food_subtotal, internal_df_total
  from (
    select record.*, element.ordinality
    from jsonb_array_elements(p_items) with ordinality as element(value, ordinality)
    cross join lateral jsonb_to_record(element.value) as record(
      name text, category text, quantity integer, unit_price_centavos bigint,
      internal_df_per_unit_centavos bigint, published_menu_item_id uuid,
      catalog_item_id uuid
    )
  ) as item;

  base_delivery_charge := case when internal_df_total >= threshold_value then 0 else base_rate end;
  far_area_charge := case when p_location_classification = 'OUTSIDE' then far_rate else 0 end;
  payment_state := case
    when p_payment_method = 'CASH' then null
    when target.payment_method = 'ONLINE_PAYMENT' then target.payment_verification_state
    else 'NOT_VERIFIED'
  end;

  delete from public.order_items where order_id = p_order_id;
  insert into public.order_items (
    order_id, published_menu_item_id, catalog_item_id, name_snapshot, category_snapshot,
    quantity, unit_price_centavos, internal_df_per_unit_centavos, sort_order)
  select p_order_id, nullif(item ->> 'published_menu_item_id', '')::uuid,
    nullif(item ->> 'catalog_item_id', '')::uuid, item ->> 'name', item ->> 'category',
    (item ->> 'quantity')::integer, (item ->> 'unit_price_centavos')::bigint,
    (item ->> 'internal_df_per_unit_centavos')::bigint, (item ->> 'sort_order')::integer
  from jsonb_array_elements(normalized_items) as item;

  update public.orders set
    customer_name = btrim(p_customer_name), exact_address = btrim(p_exact_address),
    location_classification = p_location_classification, selected_area_name = canonical_area_name,
    payment_method = p_payment_method, payment_verification_state = payment_state,
    verified_at = case when payment_state = 'VERIFIED' then target.verified_at end,
    delivery_threshold_centavos = threshold_value,
    base_charge_below_threshold_centavos = base_rate, far_area_rate_centavos = far_rate,
    food_subtotal_centavos = food_subtotal, internal_df_total_centavos = internal_df_total,
    base_delivery_charge_centavos = base_delivery_charge, far_area_charge_centavos = far_area_charge
  where id = p_order_id;

  return jsonb_build_object('order_id', p_order_id,
    'food_subtotal_centavos', food_subtotal, 'internal_df_total_centavos', internal_df_total,
    'customer_delivery_charge_centavos', base_delivery_charge + far_area_charge,
    'grand_total_centavos', food_subtotal + base_delivery_charge + far_area_charge,
    'calculated_rider_centavos', internal_df_total + base_delivery_charge + far_area_charge);
end;
$$;

revoke all on function public.admin_edit_order(uuid, jsonb, text, text, text, text, text, bigint, bigint, bigint)
  from public, anon;
grant execute on function public.admin_edit_order(uuid, jsonb, text, text, text, text, text, bigint, bigint, bigint)
  to authenticated;

create or replace function public.admin_cancel_order(p_order_id uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_active_admin();
  if p_reason is not null and char_length(btrim(p_reason)) not between 1 and 500 then
    raise exception using errcode = '22023', message = 'INVALID_CANCELLATION_REASON';
  end if;
  update public.orders set is_cancelled = true, cancelled_at = statement_timestamp(),
    cancellation_reason = nullif(btrim(p_reason), ''), restored_at = null
  where id = p_order_id;
  if not found then raise exception using errcode = 'P0001', message = 'ORDER_NOT_FOUND'; end if;
end; $$;

create or replace function public.admin_restore_order(p_order_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_active_admin();
  update public.orders set is_cancelled = false, restored_at = statement_timestamp()
  where id = p_order_id and is_cancelled;
  if not found then raise exception using errcode = 'P0001', message = 'ORDER_NOT_CANCELLED'; end if;
end; $$;

create or replace function public.admin_set_payment_verification(p_order_id uuid, p_verified boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_active_admin();
  update public.orders set
    payment_verification_state = case when p_verified then 'VERIFIED' else 'NOT_VERIFIED' end,
    verified_at = case when p_verified then statement_timestamp() else null end
  where id = p_order_id and payment_method = 'ONLINE_PAYMENT';
  if not found then raise exception using errcode = 'P0001', message = 'ONLINE_PAYMENT_REQUIRED'; end if;
end; $$;

revoke all on function public.admin_cancel_order(uuid, text) from public, anon;
revoke all on function public.admin_restore_order(uuid) from public, anon;
revoke all on function public.admin_set_payment_verification(uuid, boolean) from public, anon;
grant execute on function public.admin_cancel_order(uuid, text) to authenticated;
grant execute on function public.admin_restore_order(uuid) to authenticated;
grant execute on function public.admin_set_payment_verification(uuid, boolean) to authenticated;

create or replace function public.admin_reconcile_rider_day(
  p_business_date date,
  p_manual_adjustment_centavos bigint default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  calculated bigint;
  final_amount bigint;
begin
  perform private.require_active_admin();
  if p_business_date is null then raise exception using errcode = '22023', message = 'INVALID_BUSINESS_DATE'; end if;
  select coalesce(sum(calculated_rider_centavos), 0) into calculated
  from public.orders where business_date = p_business_date and not is_cancelled;
  final_amount := calculated + p_manual_adjustment_centavos;
  if final_amount < 0 then raise exception using errcode = '22023', message = 'INVALID_RIDER_ADJUSTMENT'; end if;
  insert into public.daily_rider_reconciliations (
    business_date, calculated_rider_centavos, manual_adjustment_centavos, updated_by)
  values (p_business_date, calculated, p_manual_adjustment_centavos, auth.uid())
  on conflict (business_date) do update set
    calculated_rider_centavos = excluded.calculated_rider_centavos,
    manual_adjustment_centavos = excluded.manual_adjustment_centavos,
    updated_by = excluded.updated_by;
  return jsonb_build_object('business_date', p_business_date,
    'calculated_rider_centavos', calculated,
    'manual_adjustment_centavos', p_manual_adjustment_centavos,
    'final_rider_centavos', final_amount);
end;
$$;

create or replace function public.admin_get_daily_totals(p_business_date date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  perform private.require_active_admin();
  select jsonb_build_object(
    'business_date', p_business_date,
    'active_order_count', count(*) filter (where not is_cancelled),
    'cancelled_order_count', count(*) filter (where is_cancelled),
    'sales_centavos', coalesce(sum(grand_total_centavos) filter (where not is_cancelled), 0),
    'customer_delivery_charge_centavos', coalesce(sum(customer_delivery_charge_centavos) filter (where not is_cancelled), 0),
    'calculated_rider_centavos', coalesce(sum(calculated_rider_centavos) filter (where not is_cancelled), 0),
    'manual_adjustment_centavos', coalesce((select manual_adjustment_centavos from public.daily_rider_reconciliations where business_date = p_business_date), 0),
    'final_rider_centavos', coalesce(sum(calculated_rider_centavos) filter (where not is_cancelled), 0)
      + coalesce((select manual_adjustment_centavos from public.daily_rider_reconciliations where business_date = p_business_date), 0)
  ) into result
  from public.orders where business_date = p_business_date;
  return result;
end;
$$;

revoke all on function public.admin_reconcile_rider_day(date, bigint) from public, anon;
revoke all on function public.admin_get_daily_totals(date) from public, anon;
grant execute on function public.admin_reconcile_rider_day(date, bigint) to authenticated;
grant execute on function public.admin_get_daily_totals(date) to authenticated;
