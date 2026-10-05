create or replace function public.admin_list_conversations(
  p_search text default null,
  p_filter text default 'ALL',
  p_before timestamptz default null,
  p_limit integer default 30
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
  bounded_limit integer := least(greatest(coalesce(p_limit, 30), 1), 50);
  normalized_search text := lower(btrim(coalesce(p_search, '')));
begin
  perform private.require_active_admin();
  if p_filter not in (
    'ALL', 'ONLINE_PAYMENT', 'NOT_VERIFIED', 'VERIFIED',
    'ACTIVE_GUEST', 'EXPIRED_GUEST'
  ) then
    raise exception using errcode = '22023', message = 'INVALID_CONVERSATION_FILTER';
  end if;

  with candidates as (
    select
      conversation.id as conversation_id,
      orders.id as order_id,
      orders.order_code,
      orders.customer_name,
      orders.payment_method,
      orders.payment_verification_state,
      orders.verified_at,
      orders.created_at as order_created_at,
      orders.guest_chat_expires_at,
      latest_message.id as last_message_id,
      latest_message.sender_type as last_sender_type,
      latest_message.created_at as last_message_at,
      coalesce(
        latest_message.text_content,
        case
          when exists (
            select 1 from public.message_attachments as attachment
            where attachment.message_id = latest_message.id
              and attachment.deleted_at is null
              and attachment.purpose = 'PAYMENT_EVIDENCE'
          ) then 'Payment receipt'
          when exists (
            select 1 from public.message_attachments as attachment
            where attachment.message_id = latest_message.id
              and attachment.deleted_at is null
          ) then 'Image attachment'
          else 'Message'
        end
      ) as last_message_preview
    from public.conversations as conversation
    join public.orders as orders on orders.id = conversation.order_id
    join lateral (
      select message.id, message.sender_type, message.text_content, message.created_at
      from public.messages as message
      where message.conversation_id = conversation.id
      order by message.created_at desc, message.id desc
      limit 1
    ) as latest_message on true
    where orders.source = 'ONLINE'
      and (
        normalized_search = ''
        or lower(orders.customer_name) like '%' || normalized_search || '%'
        or lower(orders.order_code) like '%' || normalized_search || '%'
      )
      and (
        p_filter = 'ALL'
        or (p_filter = 'ONLINE_PAYMENT' and orders.payment_method = 'ONLINE_PAYMENT')
        or (p_filter = 'NOT_VERIFIED' and orders.payment_method = 'ONLINE_PAYMENT'
          and orders.payment_verification_state = 'NOT_VERIFIED')
        or (p_filter = 'VERIFIED' and orders.payment_method = 'ONLINE_PAYMENT'
          and orders.payment_verification_state = 'VERIFIED')
        or (p_filter = 'ACTIVE_GUEST' and orders.guest_chat_expires_at > statement_timestamp())
        or (p_filter = 'EXPIRED_GUEST' and orders.guest_chat_expires_at <= statement_timestamp())
      )
      and (p_before is null or latest_message.created_at < p_before)
    order by latest_message.created_at desc, conversation.id desc
    limit bounded_limit + 1
  ), page as (
    select * from candidates
    order by last_message_at desc, conversation_id desc
    limit bounded_limit
  )
  select jsonb_build_object(
    'conversations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'conversation_id', page.conversation_id,
        'order_id', page.order_id,
        'order_code', page.order_code,
        'customer_name', page.customer_name,
        'payment_method', page.payment_method,
        'payment_verification_state', page.payment_verification_state,
        'verified_at', page.verified_at,
        'order_created_at', page.order_created_at,
        'guest_chat_expires_at', page.guest_chat_expires_at,
        'last_message_id', page.last_message_id,
        'last_sender_type', page.last_sender_type,
        'last_message_preview', page.last_message_preview,
        'last_message_at', page.last_message_at
      ) order by page.last_message_at desc, page.conversation_id desc)
      from page
    ), '[]'::jsonb),
    'next_before', case
      when (select count(*) from candidates) > bounded_limit
      then (select min(page.last_message_at) from page)
      else null
    end
  ) into result;
  return result;
end;
$$;

revoke all on function public.admin_list_conversations(text,text,timestamptz,integer)
  from public, anon;
grant execute on function public.admin_list_conversations(text,text,timestamptz,integer)
  to authenticated;
