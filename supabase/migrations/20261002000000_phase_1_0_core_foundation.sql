-- CARENDERIA-APP Phase 1.0: core relational foundation.
-- Messaging, Storage, guest endpoints, and trusted transaction functions are deferred.

create schema if not exists private;
revoke all on schema private from public;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = statement_timestamp();
  return new;
end;
$$;

revoke all on function private.set_updated_at() from public;

create table public.admin_profiles (
  user_id uuid primary key references auth.users (id) on delete restrict,
  display_name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint admin_profiles_display_name_check
    check (char_length(btrim(display_name)) between 1 and 120)
);

create trigger admin_profiles_set_updated_at
before update on public.admin_profiles
for each row execute function private.set_updated_at();

create table public.catalog_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,
  price_centavos bigint not null,
  internal_df_centavos bigint not null,
  photo_path text not null,
  is_archived boolean not null default false,
  created_by uuid references public.admin_profiles (user_id) on delete set null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint catalog_items_name_check
    check (char_length(btrim(name)) between 1 and 160),
  constraint catalog_items_category_check
    check (category in ('ULAM', 'DESSERTS', 'EXTRAS')),
  constraint catalog_items_price_check check (price_centavos >= 0),
  constraint catalog_items_internal_df_check check (internal_df_centavos >= 0),
  constraint catalog_items_photo_path_check check (char_length(btrim(photo_path)) > 0)
);

create index catalog_items_archive_category_idx
  on public.catalog_items (is_archived, category);

create trigger catalog_items_set_updated_at
before update on public.catalog_items
for each row execute function private.set_updated_at();

create table public.published_menus (
  id uuid primary key default gen_random_uuid(),
  image_path text not null,
  is_current boolean not null default false,
  activated_at timestamptz,
  expires_at timestamptz,
  deactivated_at timestamptz,
  created_by uuid references public.admin_profiles (user_id) on delete set null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint published_menus_image_path_check
    check (char_length(btrim(image_path)) > 0),
  constraint published_menus_activation_pair_check
    check ((activated_at is null) = (expires_at is null)),
  constraint published_menus_expiry_check
    check (
      activated_at is null
      or (
        expires_at > activated_at
        and expires_at <= activated_at + interval '24 hours'
      )
    ),
  constraint published_menus_deactivation_check
    check (deactivated_at is null or (activated_at is not null and deactivated_at >= activated_at)),
  constraint published_menus_current_state_check
    check (
      not is_current
      or (
        activated_at is not null
        and expires_at is not null
        and deactivated_at is null
      )
    )
);

create unique index published_menus_one_current_idx
  on public.published_menus ((true))
  where is_current;

create index published_menus_created_at_idx
  on public.published_menus (created_at desc);

create trigger published_menus_set_updated_at
before update on public.published_menus
for each row execute function private.set_updated_at();

create table public.published_menu_items (
  id uuid primary key default gen_random_uuid(),
  published_menu_id uuid not null
    references public.published_menus (id) on delete restrict,
  catalog_item_id uuid
    references public.catalog_items (id) on delete set null,
  name_snapshot text not null,
  category_snapshot text not null,
  unit_price_centavos bigint not null,
  internal_df_centavos bigint not null,
  photo_path_snapshot text not null,
  is_sold_out boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint published_menu_items_name_check
    check (char_length(btrim(name_snapshot)) between 1 and 160),
  constraint published_menu_items_category_check
    check (category_snapshot in ('ULAM', 'DESSERTS', 'EXTRAS')),
  constraint published_menu_items_price_check check (unit_price_centavos >= 0),
  constraint published_menu_items_internal_df_check check (internal_df_centavos >= 0),
  constraint published_menu_items_photo_path_check
    check (char_length(btrim(photo_path_snapshot)) > 0),
  constraint published_menu_items_sort_order_check check (sort_order >= 0)
);

create index published_menu_items_menu_sort_idx
  on public.published_menu_items (published_menu_id, sort_order);

create index published_menu_items_catalog_item_idx
  on public.published_menu_items (catalog_item_id)
  where catalog_item_id is not null;

create trigger published_menu_items_set_updated_at
before update on public.published_menu_items
for each row execute function private.set_updated_at();

create table public.address_book_entries (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  exact_address text not null,
  is_archived boolean not null default false,
  created_by uuid references public.admin_profiles (user_id) on delete set null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint address_book_entries_customer_name_check
    check (char_length(btrim(customer_name)) between 1 and 160),
  constraint address_book_entries_exact_address_check
    check (char_length(btrim(exact_address)) between 1 and 1000)
);

create index address_book_entries_search_idx
  on public.address_book_entries (is_archived, lower(customer_name));

create trigger address_book_entries_set_updated_at
before update on public.address_book_entries
for each row execute function private.set_updated_at();

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_code text not null,
  source text not null,
  published_menu_id uuid
    references public.published_menus (id) on delete restrict,
  address_book_entry_id uuid
    references public.address_book_entries (id) on delete set null,
  customer_name text not null,
  exact_address text not null,
  location_classification text not null,
  selected_area_name text,
  payment_method text not null,
  payment_verification_state text,
  verified_at timestamptz,
  delivery_threshold_centavos bigint not null,
  base_charge_below_threshold_centavos bigint not null,
  far_area_rate_centavos bigint not null,
  food_subtotal_centavos bigint not null,
  internal_df_total_centavos bigint not null,
  base_delivery_charge_centavos bigint not null,
  far_area_charge_centavos bigint not null,
  customer_delivery_charge_centavos bigint generated always as (
    base_delivery_charge_centavos + far_area_charge_centavos
  ) stored,
  grand_total_centavos bigint generated always as (
    food_subtotal_centavos + base_delivery_charge_centavos + far_area_charge_centavos
  ) stored,
  calculated_rider_centavos bigint generated always as (
    internal_df_total_centavos + base_delivery_charge_centavos + far_area_charge_centavos
  ) stored,
  is_cancelled boolean not null default false,
  cancelled_at timestamptz,
  cancellation_reason text,
  restored_at timestamptz,
  guest_access_token_hash text,
  guest_chat_expires_at timestamptz,
  original_snapshot jsonb not null,
  created_at timestamptz not null default statement_timestamp(),
  business_date date generated always as (
    (created_at at time zone 'Asia/Manila')::date
  ) stored,
  last_edited_at timestamptz not null default statement_timestamp(),
  created_by uuid references public.admin_profiles (user_id) on delete set null,
  constraint orders_order_code_unique unique (order_code),
  constraint orders_order_code_check
    check (
      order_code = upper(btrim(order_code))
      and char_length(order_code) between 4 and 32
      and order_code ~ '^[A-Z0-9-]+$'
    ),
  constraint orders_source_check check (source in ('ONLINE', 'MANUAL')),
  constraint orders_customer_name_check
    check (char_length(btrim(customer_name)) between 1 and 160),
  constraint orders_exact_address_check
    check (char_length(btrim(exact_address)) between 1 and 1000),
  constraint orders_location_classification_check
    check (location_classification in ('NEARBY', 'OUTSIDE')),
  constraint orders_selected_area_check
    check (
      location_classification = 'OUTSIDE'
      or (
        selected_area_name is not null
        and char_length(btrim(selected_area_name)) > 0
      )
    ),
  constraint orders_payment_method_check
    check (payment_method in ('CASH', 'ONLINE_PAYMENT')),
  constraint orders_payment_verification_state_check
    check (
      (payment_method = 'CASH' and payment_verification_state is null and verified_at is null)
      or (
        payment_method = 'ONLINE_PAYMENT'
        and payment_verification_state is not null
        and payment_verification_state in ('NOT_VERIFIED', 'VERIFIED')
        and (
          (payment_verification_state = 'NOT_VERIFIED' and verified_at is null)
          or (payment_verification_state = 'VERIFIED' and verified_at is not null)
        )
      )
    ),
  constraint orders_delivery_threshold_check check (delivery_threshold_centavos >= 0),
  constraint orders_base_rule_check check (base_charge_below_threshold_centavos >= 0),
  constraint orders_far_area_rate_check check (far_area_rate_centavos >= 0),
  constraint orders_food_subtotal_check check (food_subtotal_centavos >= 0),
  constraint orders_internal_df_total_check check (internal_df_total_centavos >= 0),
  constraint orders_base_delivery_charge_check check (base_delivery_charge_centavos >= 0),
  constraint orders_far_area_charge_check check (far_area_charge_centavos >= 0),
  constraint orders_customer_delivery_charge_check
    check (customer_delivery_charge_centavos >= 0),
  constraint orders_grand_total_check check (grand_total_centavos >= 0),
  constraint orders_calculated_rider_check check (calculated_rider_centavos >= 0),
  constraint orders_cancellation_check
    check (
      (
        (is_cancelled and cancelled_at is not null and restored_at is null)
        or (
          not is_cancelled
          and (
            restored_at is null
            or (cancelled_at is not null and restored_at >= cancelled_at)
          )
        )
      )
      and (cancellation_reason is null or char_length(btrim(cancellation_reason)) between 1 and 500)
    ),
  constraint orders_guest_token_hash_check
    check (guest_access_token_hash is null or char_length(guest_access_token_hash) >= 32),
  constraint orders_source_requirements_check
    check (
      (
        source = 'ONLINE'
        and published_menu_id is not null
        and guest_access_token_hash is not null
        and guest_chat_expires_at = created_at + interval '24 hours'
      )
      or (
        source = 'MANUAL'
        and published_menu_id is null
        and guest_access_token_hash is null
        and guest_chat_expires_at is null
      )
    ),
  constraint orders_original_snapshot_check
    check (
      jsonb_typeof(original_snapshot) = 'object'
      and original_snapshot @> '{"snapshot_version": 1}'::jsonb
    )
);

create unique index orders_guest_access_token_hash_idx
  on public.orders (guest_access_token_hash)
  where guest_access_token_hash is not null;

create index orders_business_date_active_created_idx
  on public.orders (business_date, is_cancelled, created_at desc);

create index orders_created_at_idx on public.orders (created_at desc);
create index orders_published_menu_idx
  on public.orders (published_menu_id)
  where published_menu_id is not null;
create index orders_address_book_entry_idx
  on public.orders (address_book_entry_id)
  where address_book_entry_id is not null;

create or replace function private.protect_order_immutables()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.order_code is distinct from old.order_code
    or new.source is distinct from old.source
    or new.created_at is distinct from old.created_at
    or new.original_snapshot is distinct from old.original_snapshot
  then
    raise exception 'order identity and original snapshot are immutable';
  end if;

  new.last_edited_at = statement_timestamp();
  return new;
end;
$$;

revoke all on function private.protect_order_immutables() from public;

create trigger orders_protect_immutables
before update on public.orders
for each row execute function private.protect_order_immutables();

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete restrict,
  published_menu_item_id uuid
    references public.published_menu_items (id) on delete set null,
  catalog_item_id uuid
    references public.catalog_items (id) on delete set null,
  name_snapshot text not null,
  category_snapshot text not null,
  quantity integer not null,
  unit_price_centavos bigint not null,
  internal_df_per_unit_centavos bigint not null,
  item_subtotal_centavos bigint generated always as (
    quantity::bigint * unit_price_centavos
  ) stored,
  internal_df_total_centavos bigint generated always as (
    quantity::bigint * internal_df_per_unit_centavos
  ) stored,
  sort_order integer not null default 0,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint order_items_name_check
    check (char_length(btrim(name_snapshot)) between 1 and 160),
  constraint order_items_category_check
    check (category_snapshot in ('ULAM', 'DESSERTS', 'EXTRAS')),
  constraint order_items_quantity_check check (quantity > 0),
  constraint order_items_unit_price_check check (unit_price_centavos >= 0),
  constraint order_items_internal_df_check check (internal_df_per_unit_centavos >= 0),
  constraint order_items_item_subtotal_check check (item_subtotal_centavos >= 0),
  constraint order_items_internal_df_total_check check (internal_df_total_centavos >= 0),
  constraint order_items_sort_order_check check (sort_order >= 0)
);

create index order_items_order_sort_idx
  on public.order_items (order_id, sort_order);

create index order_items_published_menu_item_idx
  on public.order_items (published_menu_item_id)
  where published_menu_item_id is not null;

create index order_items_catalog_item_idx
  on public.order_items (catalog_item_id)
  where catalog_item_id is not null;

create trigger order_items_set_updated_at
before update on public.order_items
for each row execute function private.set_updated_at();

create table public.daily_rider_reconciliations (
  business_date date primary key,
  calculated_rider_centavos bigint not null default 0,
  manual_adjustment_centavos bigint not null default 0,
  final_rider_centavos bigint generated always as (
    calculated_rider_centavos + manual_adjustment_centavos
  ) stored,
  updated_by uuid references public.admin_profiles (user_id) on delete set null,
  updated_at timestamptz not null default statement_timestamp(),
  constraint daily_rider_calculated_check check (calculated_rider_centavos >= 0),
  constraint daily_rider_final_check check (final_rider_centavos >= 0)
);

create trigger daily_rider_reconciliations_set_updated_at
before update on public.daily_rider_reconciliations
for each row execute function private.set_updated_at();

create table public.store_settings (
  id smallint primary key default 1,
  store_name text not null default 'Carenderia',
  store_address text not null default E'Phase 1 Block 44 Lot 54\nMarycris Complex\nPasong Camachile 2\nGeneral Trias, Cavite',
  logo_path text,
  font_size_preference text not null default 'DEFAULT',
  delivery_threshold_centavos bigint not null default 2000,
  base_charge_centavos bigint not null default 1500,
  far_area_charge_centavos bigint not null default 2000,
  nearby_area_names text[] not null default array[
    'Marycris Complex',
    'Wellington Place',
    'Elliston Place'
  ]::text[],
  updated_by uuid references public.admin_profiles (user_id) on delete set null,
  updated_at timestamptz not null default statement_timestamp(),
  constraint store_settings_singleton_check check (id = 1),
  constraint store_settings_name_check check (char_length(btrim(store_name)) between 1 and 160),
  constraint store_settings_address_check check (char_length(btrim(store_address)) > 0),
  constraint store_settings_logo_path_check
    check (logo_path is null or char_length(btrim(logo_path)) > 0),
  constraint store_settings_font_size_check
    check (font_size_preference in ('DEFAULT', 'LARGE')),
  constraint store_settings_delivery_threshold_check check (delivery_threshold_centavos >= 0),
  constraint store_settings_base_charge_check check (base_charge_centavos >= 0),
  constraint store_settings_far_area_charge_check check (far_area_charge_centavos >= 0),
  constraint store_settings_nearby_areas_check check (cardinality(nearby_area_names) > 0)
);

create trigger store_settings_set_updated_at
before update on public.store_settings
for each row execute function private.set_updated_at();

insert into public.store_settings (id)
values (1)
on conflict (id) do nothing;

create or replace function private.is_active_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_profiles
    where user_id = auth.uid()
      and is_active
  );
$$;

revoke all on function private.is_active_admin() from public;
grant usage on schema private to authenticated;
grant execute on function private.is_active_admin() to authenticated;

alter table public.admin_profiles enable row level security;
alter table public.catalog_items enable row level security;
alter table public.published_menus enable row level security;
alter table public.published_menu_items enable row level security;
alter table public.address_book_entries enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.daily_rider_reconciliations enable row level security;
alter table public.store_settings enable row level security;

revoke all on table public.admin_profiles from anon, authenticated;
revoke all on table public.catalog_items from anon, authenticated;
revoke all on table public.published_menus from anon, authenticated;
revoke all on table public.published_menu_items from anon, authenticated;
revoke all on table public.address_book_entries from anon, authenticated;
revoke all on table public.orders from anon, authenticated;
revoke all on table public.order_items from anon, authenticated;
revoke all on table public.daily_rider_reconciliations from anon, authenticated;
revoke all on table public.store_settings from anon, authenticated;

grant select (id, image_path, activated_at, expires_at)
  on public.published_menus to anon;
grant select (
  id,
  published_menu_id,
  name_snapshot,
  category_snapshot,
  unit_price_centavos,
  photo_path_snapshot,
  is_sold_out,
  sort_order
) on public.published_menu_items to anon;
grant select (
  store_name,
  store_address,
  logo_path,
  font_size_preference,
  delivery_threshold_centavos,
  base_charge_centavos,
  far_area_charge_centavos,
  nearby_area_names
) on public.store_settings to anon;

grant select on table public.admin_profiles to authenticated;
grant select on table public.catalog_items to authenticated;
grant select on table public.published_menus to authenticated;
grant select on table public.published_menu_items to authenticated;
grant select on table public.address_book_entries to authenticated;
grant select on table public.orders to authenticated;
grant select on table public.order_items to authenticated;
grant select on table public.daily_rider_reconciliations to authenticated;
grant select on table public.store_settings to authenticated;

grant insert, update on table public.catalog_items to authenticated;
grant insert, update on table public.published_menus to authenticated;
grant insert, update on table public.published_menu_items to authenticated;
grant insert, update on table public.address_book_entries to authenticated;
grant update on table public.store_settings to authenticated;

create policy admin_profiles_read_own
on public.admin_profiles
for select
to authenticated
using (auth.uid() = user_id and is_active);

create policy active_admin_read_catalog_items
on public.catalog_items for select to authenticated
using ((select private.is_active_admin()));

create policy active_admin_insert_catalog_items
on public.catalog_items for insert to authenticated
with check ((select private.is_active_admin()));

create policy active_admin_update_catalog_items
on public.catalog_items for update to authenticated
using ((select private.is_active_admin()))
with check ((select private.is_active_admin()));

create policy anonymous_read_active_menus
on public.published_menus for select to anon
using (
  is_current
  and activated_at <= statement_timestamp()
  and expires_at > statement_timestamp()
  and deactivated_at is null
);

create policy active_admin_read_published_menus
on public.published_menus for select to authenticated
using ((select private.is_active_admin()));

create policy active_admin_insert_published_menus
on public.published_menus for insert to authenticated
with check ((select private.is_active_admin()));

create policy active_admin_update_published_menus
on public.published_menus for update to authenticated
using ((select private.is_active_admin()))
with check ((select private.is_active_admin()));

create policy anonymous_read_active_menu_items
on public.published_menu_items for select to anon
using (
  exists (
    select 1
    from public.published_menus
    where published_menus.id = published_menu_items.published_menu_id
  )
);

create policy active_admin_read_published_menu_items
on public.published_menu_items for select to authenticated
using ((select private.is_active_admin()));

create policy active_admin_insert_published_menu_items
on public.published_menu_items for insert to authenticated
with check ((select private.is_active_admin()));

create policy active_admin_update_published_menu_items
on public.published_menu_items for update to authenticated
using ((select private.is_active_admin()))
with check ((select private.is_active_admin()));

create policy active_admin_read_address_book
on public.address_book_entries for select to authenticated
using ((select private.is_active_admin()));

create policy active_admin_insert_address_book
on public.address_book_entries for insert to authenticated
with check ((select private.is_active_admin()));

create policy active_admin_update_address_book
on public.address_book_entries for update to authenticated
using ((select private.is_active_admin()))
with check ((select private.is_active_admin()));

create policy active_admin_read_orders
on public.orders for select to authenticated
using ((select private.is_active_admin()));

create policy active_admin_read_order_items
on public.order_items for select to authenticated
using ((select private.is_active_admin()));

create policy active_admin_read_daily_rider_reconciliations
on public.daily_rider_reconciliations for select to authenticated
using ((select private.is_active_admin()));

create policy anonymous_read_store_settings
on public.store_settings for select to anon
using (true);

create policy active_admin_read_store_settings
on public.store_settings for select to authenticated
using ((select private.is_active_admin()));

create policy active_admin_update_store_settings
on public.store_settings for update to authenticated
using ((select private.is_active_admin()))
with check (id = 1 and (select private.is_active_admin()));
