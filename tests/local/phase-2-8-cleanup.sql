delete from public.order_items
where order_id in (
  select id from public.orders
  where customer_name = 'Phase 2.8 Order Override'
);

delete from public.orders
where customer_name = 'Phase 2.8 Order Override';

delete from public.address_book_entries
where created_by = '98500000-0000-4000-8000-000000000001';

update public.admin_profiles set is_active = false
where user_id = '98500000-0000-4000-8000-000000000001';
