create policy active_admin_receive_message_activity
on realtime.messages
for select
to authenticated
using (
  extension = 'broadcast'
  and (select private.is_active_admin())
  and (
    (select realtime.topic()) = 'admin-messages'
    or (select realtime.topic()) like 'admin-conversation:%'
  )
);

create or replace function private.broadcast_message_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(
    jsonb_build_object('kind', 'message'),
    'activity',
    'order-messages:' || new.conversation_id::text,
    false
  );
  perform realtime.send(
    jsonb_build_object('kind', 'message'),
    'activity',
    'admin-messages',
    true
  );
  perform realtime.send(
    jsonb_build_object('kind', 'message'),
    'activity',
    'admin-conversation:' || new.conversation_id::text,
    true
  );
  return null;
end;
$$;

create trigger messages_broadcast_activity_after_insert
after insert on public.messages
for each row execute function private.broadcast_message_activity();

create trigger messages_broadcast_activity_after_reaction
after update of guest_reaction, admin_reaction on public.messages
for each row
when (
  old.guest_reaction is distinct from new.guest_reaction
  or old.admin_reaction is distinct from new.admin_reaction
)
execute function private.broadcast_message_activity();

create or replace function private.broadcast_payment_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_conversation_id uuid;
begin
  select conversation.id into target_conversation_id
  from public.conversations as conversation
  where conversation.order_id = new.id;

  if target_conversation_id is null then
    return null;
  end if;

  perform realtime.send(
    jsonb_build_object('kind', 'payment'),
    'activity',
    'order-messages:' || target_conversation_id::text,
    false
  );
  perform realtime.send(
    jsonb_build_object('kind', 'payment'),
    'activity',
    'admin-messages',
    true
  );
  perform realtime.send(
    jsonb_build_object('kind', 'payment'),
    'activity',
    'admin-conversation:' || target_conversation_id::text,
    true
  );
  return null;
end;
$$;

create trigger orders_broadcast_payment_activity
after update of payment_verification_state on public.orders
for each row
when (
  old.payment_verification_state is distinct from new.payment_verification_state
)
execute function private.broadcast_payment_activity();

revoke all on function private.broadcast_message_activity() from public;
revoke all on function private.broadcast_payment_activity() from public;
