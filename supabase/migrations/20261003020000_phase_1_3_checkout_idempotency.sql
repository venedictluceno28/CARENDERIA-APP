-- CARENDERIA-APP Phase 1.3: transactional checkout idempotency.

create table public.checkout_idempotency (
  key_hash text primary key,
  request_fingerprint text not null,
  guest_token_hash text not null,
  order_id uuid unique references public.orders(id) on delete restrict,
  created_at timestamptz not null default statement_timestamp(),
  completed_at timestamptz,
  constraint checkout_idempotency_key_hash_check
    check (key_hash ~ '^[0-9a-f]{64}$'),
  constraint checkout_idempotency_fingerprint_check
    check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint checkout_idempotency_guest_hash_check
    check (guest_token_hash ~ '^[0-9a-f]{64}$'),
  constraint checkout_idempotency_completion_check
    check ((order_id is null and completed_at is null) or (order_id is not null and completed_at is not null))
);

comment on table public.checkout_idempotency is
  'Hash-only checkout retry coordination. Plaintext idempotency keys and guest tokens are never stored.';

alter table public.checkout_idempotency enable row level security;
revoke all on table public.checkout_idempotency from public, anon, authenticated;
grant select, insert, update on table public.checkout_idempotency to service_role;

create or replace function private.checkout_result(
  p_order_id uuid,
  p_idempotent_replay boolean
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'order_id', orders.id,
    'order_code', orders.order_code,
    'created_at', orders.created_at,
    'guest_expires_at', orders.guest_chat_expires_at,
    'payment_method', orders.payment_method,
    'payment_verification_state', orders.payment_verification_state,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', item.name_snapshot,
        'category', item.category_snapshot,
        'quantity', item.quantity,
        'unit_price_centavos', item.unit_price_centavos,
        'item_subtotal_centavos', item.item_subtotal_centavos
      ) order by item.sort_order, item.id)
      from public.order_items as item
      where item.order_id = orders.id
    ), '[]'::jsonb),
    'food_subtotal_centavos', orders.food_subtotal_centavos,
    'base_delivery_charge_centavos', orders.base_delivery_charge_centavos,
    'far_area_charge_centavos', orders.far_area_charge_centavos,
    'customer_delivery_charge_centavos', orders.customer_delivery_charge_centavos,
    'grand_total_centavos', orders.grand_total_centavos,
    'idempotent_replay', p_idempotent_replay
  )
  from public.orders as orders
  where orders.id = p_order_id;
$$;

revoke all on function private.checkout_result(uuid, boolean) from public;
grant execute on function private.checkout_result(uuid, boolean) to service_role;

create or replace function public.create_online_order(
  p_published_menu_id uuid,
  p_items jsonb,
  p_customer_name text,
  p_exact_address text,
  p_location_classification text,
  p_selected_area_name text,
  p_payment_method text,
  p_guest_token_hash text,
  p_idempotency_key_hash text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  canonical_items jsonb;
  fingerprint text;
  idempotency_record public.checkout_idempotency%rowtype;
  created_result jsonb;
  created_order_id uuid;
begin
  if p_idempotency_key_hash is null or p_idempotency_key_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'INVALID_IDEMPOTENCY_KEY';
  end if;

  if p_guest_token_hash is null or p_guest_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'INVALID_GUEST_TOKEN';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'published_menu_item_id', (line ->> 'published_menu_item_id')::uuid,
    'quantity', (line ->> 'quantity')::integer,
    'expected_unit_price_centavos', (line ->> 'expected_unit_price_centavos')::bigint
  ) order by (line ->> 'published_menu_item_id')::uuid), '[]'::jsonb)
  into canonical_items
  from jsonb_array_elements(p_items) as line;

  fingerprint := encode(extensions.digest(convert_to(jsonb_build_object(
    'published_menu_id', p_published_menu_id,
    'items', canonical_items,
    'customer_name', btrim(p_customer_name),
    'exact_address', btrim(p_exact_address),
    'location_classification', upper(btrim(p_location_classification)),
    'selected_area_name', case
      when upper(btrim(p_location_classification)) = 'NEARBY'
        then lower(btrim(p_selected_area_name))
      else null
    end,
    'payment_method', upper(btrim(p_payment_method))
  )::text, 'UTF8'), 'sha256'), 'hex');

  insert into public.checkout_idempotency (
    key_hash, request_fingerprint, guest_token_hash
  ) values (
    p_idempotency_key_hash, fingerprint, p_guest_token_hash
  ) on conflict (key_hash) do nothing;

  select * into strict idempotency_record
  from public.checkout_idempotency
  where key_hash = p_idempotency_key_hash
  for update;

  if idempotency_record.request_fingerprint <> fingerprint
    or idempotency_record.guest_token_hash <> p_guest_token_hash then
    raise exception using errcode = 'P0001', message = 'IDEMPOTENCY_CONFLICT';
  end if;

  if idempotency_record.order_id is not null then
    return private.checkout_result(idempotency_record.order_id, true);
  end if;

  created_result := public.create_online_order(
    p_published_menu_id,
    p_items,
    btrim(p_customer_name),
    btrim(p_exact_address),
    upper(btrim(p_location_classification)),
    case when upper(btrim(p_location_classification)) = 'NEARBY'
      then btrim(p_selected_area_name) else null end,
    upper(btrim(p_payment_method)),
    p_guest_token_hash
  );
  created_order_id := (created_result ->> 'order_id')::uuid;

  update public.checkout_idempotency
  set order_id = created_order_id,
      completed_at = statement_timestamp()
  where key_hash = p_idempotency_key_hash;

  return private.checkout_result(created_order_id, false);
end;
$$;

revoke all on function public.create_online_order(uuid, jsonb, text, text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.create_online_order(uuid, jsonb, text, text, text, text, text, text, text)
  to service_role;
