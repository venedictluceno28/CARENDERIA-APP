-- CARENDERIA-APP Phase 1.2: order-linked messaging and private media.

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders (id) on delete restrict,
  created_at timestamptz not null,
  expires_at timestamptz not null,
  closed_at timestamptz,
  constraint conversations_expiry_check check (expires_at > created_at),
  constraint conversations_closed_check check (closed_at is null or closed_at >= created_at)
);

create index conversations_expires_at_idx on public.conversations (expires_at);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete restrict,
  sender_type text not null,
  sender_admin_id uuid references public.admin_profiles (user_id) on delete set null,
  text_content text,
  guest_reaction text,
  admin_reaction text,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint messages_sender_type_check check (sender_type in ('GUEST', 'ADMIN')),
  constraint messages_sender_admin_check check (
    (sender_type = 'GUEST' and sender_admin_id is null)
    or (sender_type = 'ADMIN' and sender_admin_id is not null)
  ),
  constraint messages_text_check check (
    text_content is null
    or char_length(btrim(text_content)) between 1 and 2000
  ),
  constraint messages_guest_reaction_check check (
    guest_reaction is null
    or char_length(btrim(guest_reaction)) between 1 and 32
  ),
  constraint messages_admin_reaction_check check (
    admin_reaction is null
    or char_length(btrim(admin_reaction)) between 1 and 32
  )
);

create index messages_conversation_created_idx
  on public.messages (conversation_id, created_at desc, id desc);

create trigger messages_set_updated_at
before update on public.messages
for each row execute function private.set_updated_at();

create table public.message_attachments (
  id uuid primary key,
  order_id uuid not null references public.orders (id) on delete restrict,
  message_id uuid references public.messages (id) on delete set null,
  purpose text not null,
  bucket_id text not null,
  storage_path text not null unique,
  mime_type text not null,
  size_bytes bigint not null,
  created_by_type text not null,
  created_by_admin_id uuid references public.admin_profiles (user_id) on delete set null,
  created_at timestamptz not null default statement_timestamp(),
  retained_until timestamptz,
  deleted_at timestamptz,
  constraint message_attachments_purpose_check
    check (purpose in ('CHAT_IMAGE', 'PAYMENT_EVIDENCE')),
  constraint message_attachments_bucket_check check (
    (purpose = 'CHAT_IMAGE' and bucket_id = 'message-media')
    or (purpose = 'PAYMENT_EVIDENCE' and bucket_id = 'payment-evidence')
  ),
  constraint message_attachments_mime_check
    check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  constraint message_attachments_size_check
    check (size_bytes between 1 and 5242880),
  constraint message_attachments_creator_check check (
    (created_by_type = 'GUEST' and created_by_admin_id is null)
    or (created_by_type = 'ADMIN' and created_by_admin_id is not null)
  ),
  constraint message_attachments_retention_check check (
    (purpose = 'CHAT_IMAGE' and retained_until is null)
    or (purpose = 'PAYMENT_EVIDENCE' and retained_until is not null)
  ),
  constraint message_attachments_deleted_check
    check (deleted_at is null or deleted_at >= created_at)
);

create index message_attachments_order_purpose_created_idx
  on public.message_attachments (order_id, purpose, created_at desc);
create index message_attachments_message_idx
  on public.message_attachments (message_id)
  where message_id is not null;
create index message_attachments_evidence_retention_idx
  on public.message_attachments (retained_until)
  where purpose = 'PAYMENT_EVIDENCE' and deleted_at is null;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('message-media', 'message-media', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('payment-evidence', 'payment-evidence', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.message_attachments enable row level security;

revoke all on table public.conversations from anon, authenticated;
revoke all on table public.messages from anon, authenticated;
revoke all on table public.message_attachments from anon, authenticated;

grant select on table public.conversations to authenticated;
grant select on table public.messages to authenticated;
grant select on table public.message_attachments to authenticated;

create policy active_admin_read_conversations
on public.conversations for select to authenticated
using ((select private.is_active_admin()));

create policy active_admin_read_messages
on public.messages for select to authenticated
using ((select private.is_active_admin()));

create policy active_admin_read_message_attachments
on public.message_attachments for select to authenticated
using ((select private.is_active_admin()));

create or replace function private.require_guest_order(
  p_order_code text,
  p_guest_token_hash text,
  p_require_unexpired boolean default true
)
returns uuid
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  authorized_order_id uuid;
  expires_at timestamptz;
begin
  if p_guest_token_hash is null or p_guest_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '42501', message = 'GUEST_ACCESS_DENIED';
  end if;

  select id, guest_chat_expires_at
  into authorized_order_id, expires_at
  from public.orders
  where order_code = upper(btrim(coalesce(p_order_code, '')))
    and guest_access_token_hash = p_guest_token_hash
    and source = 'ONLINE';

  if authorized_order_id is null then
    raise exception using errcode = '42501', message = 'GUEST_ACCESS_DENIED';
  end if;

  if p_require_unexpired and expires_at <= statement_timestamp() then
    raise exception using errcode = '42501', message = 'GUEST_ACCESS_EXPIRED';
  end if;

  return authorized_order_id;
end;
$$;

revoke all on function private.require_guest_order(text, text, boolean) from public;
grant execute on function private.require_guest_order(text, text, boolean) to service_role;

create or replace function private.ensure_conversation(p_order_id uuid)
returns uuid
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  conversation_id uuid;
begin
  select id into conversation_id
  from public.conversations
  where order_id = p_order_id;

  if conversation_id is null then
    insert into public.conversations (order_id, created_at, expires_at)
    select id, created_at, guest_chat_expires_at
    from public.orders
    where id = p_order_id
      and source = 'ONLINE'
      and guest_chat_expires_at is not null
    on conflict (order_id) do nothing
    returning id into conversation_id;

    if conversation_id is null then
      select id into conversation_id
      from public.conversations
      where order_id = p_order_id;
    end if;
  end if;

  if conversation_id is null then
    raise exception using errcode = 'P0001', message = 'CONVERSATION_UNAVAILABLE';
  end if;
  return conversation_id;
end;
$$;

revoke all on function private.ensure_conversation(uuid) from public;
grant execute on function private.ensure_conversation(uuid) to service_role;

create or replace function private.image_extension(p_mime_type text)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select case p_mime_type
    when 'image/jpeg' then 'jpg'
    when 'image/png' then 'png'
    when 'image/webp' then 'webp'
  end;
$$;

revoke all on function private.image_extension(text) from public;
grant execute on function private.image_extension(text) to service_role;

create or replace function public.guest_get_receipt(
  p_order_code text,
  p_guest_token_hash text
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  authorized_order_id uuid;
  result jsonb;
begin
  authorized_order_id := private.require_guest_order(p_order_code, p_guest_token_hash, true);

  select jsonb_build_object(
    'order_code', orders.order_code,
    'customer_name', orders.customer_name,
    'exact_address', orders.exact_address,
    'location_classification', orders.location_classification,
    'selected_area_name', orders.selected_area_name,
    'payment_method', orders.payment_method,
    'payment_verification_state', orders.payment_verification_state,
    'food_subtotal_centavos', orders.food_subtotal_centavos,
    'base_delivery_charge_centavos', orders.base_delivery_charge_centavos,
    'far_area_charge_centavos', orders.far_area_charge_centavos,
    'customer_delivery_charge_centavos', orders.customer_delivery_charge_centavos,
    'grand_total_centavos', orders.grand_total_centavos,
    'is_cancelled', orders.is_cancelled,
    'created_at', orders.created_at,
    'guest_expires_at', orders.guest_chat_expires_at,
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
    ), '[]'::jsonb)
  ) into result
  from public.orders as orders
  where orders.id = authorized_order_id;

  return result;
end;
$$;

create or replace function public.guest_list_messages(
  p_order_code text,
  p_guest_token_hash text,
  p_before timestamptz default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  authorized_order_id uuid;
  conversation_id uuid;
  result jsonb;
  bounded_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
begin
  authorized_order_id := private.require_guest_order(p_order_code, p_guest_token_hash, true);
  conversation_id := private.ensure_conversation(authorized_order_id);

  select jsonb_build_object(
    'conversation_id', conversation.id,
    'expires_at', conversation.expires_at,
    'messages', coalesce((
      select jsonb_agg(message_row.payload order by message_row.created_at, message_row.id)
      from (
        select message.id, message.created_at, jsonb_build_object(
          'id', message.id,
          'sender_type', message.sender_type,
          'text', message.text_content,
          'guest_reaction', message.guest_reaction,
          'admin_reaction', message.admin_reaction,
          'created_at', message.created_at,
          'attachments', coalesce((
            select jsonb_agg(jsonb_build_object(
              'id', attachment.id,
              'purpose', attachment.purpose,
              'mime_type', attachment.mime_type,
              'size_bytes', attachment.size_bytes,
              'created_at', attachment.created_at
            ) order by attachment.created_at, attachment.id)
            from public.message_attachments as attachment
            where attachment.message_id = message.id
              and attachment.deleted_at is null
          ), '[]'::jsonb)
        ) as payload
        from public.messages as message
        where message.conversation_id = conversation.id
          and (p_before is null or message.created_at < p_before)
        order by message.created_at desc, message.id desc
        limit bounded_limit
      ) as message_row
    ), '[]'::jsonb)
  ) into result
  from public.conversations as conversation
  where conversation.id = conversation_id;

  return result;
end;
$$;

create or replace function public.guest_send_message(
  p_order_code text,
  p_guest_token_hash text,
  p_text text
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  authorized_order_id uuid;
  conversation_id uuid;
  created_message public.messages%rowtype;
begin
  if char_length(btrim(coalesce(p_text, ''))) not between 1 and 2000 then
    raise exception using errcode = '22023', message = 'INVALID_MESSAGE';
  end if;
  authorized_order_id := private.require_guest_order(p_order_code, p_guest_token_hash, true);
  conversation_id := private.ensure_conversation(authorized_order_id);
  insert into public.messages (conversation_id, sender_type, text_content)
  values (conversation_id, 'GUEST', btrim(p_text))
  returning * into created_message;
  return jsonb_build_object(
    'id', created_message.id,
    'sender_type', created_message.sender_type,
    'text', created_message.text_content,
    'created_at', created_message.created_at
  );
end;
$$;

create or replace function public.guest_set_message_reaction(
  p_order_code text,
  p_guest_token_hash text,
  p_message_id uuid,
  p_reaction text
)
returns void
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  authorized_order_id uuid;
begin
  if p_reaction is not null
    and char_length(btrim(p_reaction)) not between 1 and 32
  then
    raise exception using errcode = '22023', message = 'INVALID_REACTION';
  end if;
  authorized_order_id := private.require_guest_order(p_order_code, p_guest_token_hash, true);
  update public.messages as message
  set guest_reaction = nullif(btrim(p_reaction), '')
  from public.conversations as conversation
  where message.id = p_message_id
    and message.conversation_id = conversation.id
    and conversation.order_id = authorized_order_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'MESSAGE_NOT_FOUND';
  end if;
end;
$$;

create or replace function public.guest_authorize_attachment_upload(
  p_order_code text,
  p_guest_token_hash text,
  p_purpose text
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  authorized_order_id uuid;
  conversation_id uuid;
  target_order public.orders%rowtype;
begin
  if p_purpose not in ('CHAT_IMAGE', 'PAYMENT_EVIDENCE') then
    raise exception using errcode = '22023', message = 'INVALID_ATTACHMENT_PURPOSE';
  end if;
  authorized_order_id := private.require_guest_order(p_order_code, p_guest_token_hash, true);
  select * into target_order from public.orders where id = authorized_order_id;
  if p_purpose = 'PAYMENT_EVIDENCE'
    and target_order.payment_method <> 'ONLINE_PAYMENT'
  then
    raise exception using errcode = '22023', message = 'ONLINE_PAYMENT_REQUIRED';
  end if;
  conversation_id := private.ensure_conversation(authorized_order_id);
  return jsonb_build_object(
    'order_id', authorized_order_id,
    'conversation_id', conversation_id,
    'expires_at', target_order.guest_chat_expires_at,
    'bucket_id', case when p_purpose = 'PAYMENT_EVIDENCE' then 'payment-evidence' else 'message-media' end
  );
end;
$$;

create or replace function public.guest_finalize_attachment(
  p_order_code text,
  p_guest_token_hash text,
  p_attachment_id uuid,
  p_storage_path text,
  p_mime_type text,
  p_size_bytes bigint,
  p_purpose text,
  p_text text default null
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  authorized_order_id uuid;
  conversation_id uuid;
  target_order public.orders%rowtype;
  extension text;
  expected_path text;
  bucket text;
  created_message_id uuid;
  retention_deadline timestamptz;
begin
  if p_purpose not in ('CHAT_IMAGE', 'PAYMENT_EVIDENCE')
    or p_mime_type not in ('image/jpeg', 'image/png', 'image/webp')
    or p_size_bytes not between 1 and 5242880
    or (p_text is not null and char_length(btrim(p_text)) not between 1 and 2000)
  then
    raise exception using errcode = '22023', message = 'INVALID_ATTACHMENT';
  end if;
  authorized_order_id := private.require_guest_order(p_order_code, p_guest_token_hash, true);
  select * into target_order from public.orders where id = authorized_order_id for share;
  if p_purpose = 'PAYMENT_EVIDENCE' and target_order.payment_method <> 'ONLINE_PAYMENT' then
    raise exception using errcode = '22023', message = 'ONLINE_PAYMENT_REQUIRED';
  end if;
  conversation_id := private.ensure_conversation(authorized_order_id);
  extension := private.image_extension(p_mime_type);
  bucket := case when p_purpose = 'PAYMENT_EVIDENCE' then 'payment-evidence' else 'message-media' end;
  expected_path := 'orders/' || authorized_order_id || '/' ||
    case when p_purpose = 'PAYMENT_EVIDENCE' then 'evidence/' else 'messages/' end ||
    p_attachment_id || '.' || extension;
  if p_storage_path is distinct from expected_path then
    raise exception using errcode = '42501', message = 'ATTACHMENT_PATH_DENIED';
  end if;
  insert into public.messages (conversation_id, sender_type, text_content)
  values (conversation_id, 'GUEST', nullif(btrim(p_text), ''))
  returning id into created_message_id;
  retention_deadline := case when p_purpose = 'PAYMENT_EVIDENCE'
    then target_order.created_at + interval '30 days' end;
  insert into public.message_attachments (
    id, order_id, message_id, purpose, bucket_id, storage_path,
    mime_type, size_bytes, created_by_type, retained_until
  ) values (
    p_attachment_id, authorized_order_id, created_message_id, p_purpose,
    bucket, p_storage_path, p_mime_type, p_size_bytes, 'GUEST', retention_deadline
  );
  return jsonb_build_object(
    'message_id', created_message_id,
    'attachment', jsonb_build_object(
      'id', p_attachment_id,
      'purpose', p_purpose,
      'mime_type', p_mime_type,
      'size_bytes', p_size_bytes,
      'created_at', statement_timestamp()
    )
  );
end;
$$;

create or replace function public.guest_authorize_attachment_read(
  p_order_code text,
  p_guest_token_hash text,
  p_attachment_id uuid
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  authorized_order_id uuid;
  attachment public.message_attachments%rowtype;
begin
  authorized_order_id := private.require_guest_order(p_order_code, p_guest_token_hash, true);
  select * into attachment
  from public.message_attachments
  where id = p_attachment_id
    and order_id = authorized_order_id
    and purpose = 'CHAT_IMAGE'
    and deleted_at is null;
  if not found then
    raise exception using errcode = '42501', message = 'ATTACHMENT_ACCESS_DENIED';
  end if;
  return jsonb_build_object('bucket_id', attachment.bucket_id, 'storage_path', attachment.storage_path);
end;
$$;

do $$
declare
  signature regprocedure;
begin
  foreach signature in array array[
    'public.guest_get_receipt(text,text)'::regprocedure,
    'public.guest_list_messages(text,text,timestamptz,integer)'::regprocedure,
    'public.guest_send_message(text,text,text)'::regprocedure,
    'public.guest_set_message_reaction(text,text,uuid,text)'::regprocedure,
    'public.guest_authorize_attachment_upload(text,text,text)'::regprocedure,
    'public.guest_finalize_attachment(text,text,uuid,text,text,bigint,text,text)'::regprocedure,
    'public.guest_authorize_attachment_read(text,text,uuid)'::regprocedure
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', signature);
    execute format('grant execute on function %s to service_role', signature);
  end loop;
end;
$$;

create or replace function public.admin_list_messages(
  p_order_id uuid,
  p_before timestamptz default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  conversation_id uuid;
  result jsonb;
  bounded_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
begin
  perform private.require_active_admin();
  if not exists (select 1 from public.orders where id = p_order_id and source = 'ONLINE') then
    raise exception using errcode = 'P0001', message = 'ORDER_NOT_FOUND';
  end if;
  conversation_id := private.ensure_conversation(p_order_id);
  select jsonb_build_object(
    'conversation_id', conversation.id,
    'expires_at', conversation.expires_at,
    'messages', coalesce((
      select jsonb_agg(message_row.payload order by message_row.created_at, message_row.id)
      from (
        select message.id, message.created_at, jsonb_build_object(
          'id', message.id,
          'sender_type', message.sender_type,
          'text', message.text_content,
          'guest_reaction', message.guest_reaction,
          'admin_reaction', message.admin_reaction,
          'created_at', message.created_at,
          'attachments', coalesce((
            select jsonb_agg(jsonb_build_object(
              'id', attachment.id, 'purpose', attachment.purpose,
              'mime_type', attachment.mime_type, 'size_bytes', attachment.size_bytes,
              'created_at', attachment.created_at,
              'retained_until', attachment.retained_until
            ) order by attachment.created_at, attachment.id)
            from public.message_attachments as attachment
            where attachment.message_id = message.id and attachment.deleted_at is null
          ), '[]'::jsonb)
        ) as payload
        from public.messages as message
        where message.conversation_id = conversation.id
          and (p_before is null or message.created_at < p_before)
        order by message.created_at desc, message.id desc
        limit bounded_limit
      ) as message_row
    ), '[]'::jsonb)
  ) into result
  from public.conversations as conversation
  where conversation.id = conversation_id;
  return result;
end;
$$;

create or replace function public.admin_send_message(p_order_id uuid, p_text text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  conversation_id uuid;
  created_message public.messages%rowtype;
begin
  perform private.require_active_admin();
  if char_length(btrim(coalesce(p_text, ''))) not between 1 and 2000 then
    raise exception using errcode = '22023', message = 'INVALID_MESSAGE';
  end if;
  conversation_id := private.ensure_conversation(p_order_id);
  insert into public.messages (conversation_id, sender_type, sender_admin_id, text_content)
  values (conversation_id, 'ADMIN', auth.uid(), btrim(p_text))
  returning * into created_message;
  return jsonb_build_object('id', created_message.id, 'sender_type', 'ADMIN',
    'text', created_message.text_content, 'created_at', created_message.created_at);
end;
$$;

create or replace function public.admin_set_message_reaction(p_message_id uuid, p_reaction text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.require_active_admin();
  if p_reaction is not null and char_length(btrim(p_reaction)) not between 1 and 32 then
    raise exception using errcode = '22023', message = 'INVALID_REACTION';
  end if;
  update public.messages set admin_reaction = nullif(btrim(p_reaction), '') where id = p_message_id;
  if not found then raise exception using errcode = 'P0001', message = 'MESSAGE_NOT_FOUND'; end if;
end;
$$;

create or replace function public.admin_authorize_attachment_upload(p_order_id uuid, p_purpose text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  target_order public.orders%rowtype;
  conversation_id uuid;
begin
  perform private.require_active_admin();
  if p_purpose not in ('CHAT_IMAGE', 'PAYMENT_EVIDENCE') then
    raise exception using errcode = '22023', message = 'INVALID_ATTACHMENT_PURPOSE';
  end if;
  select * into target_order from public.orders where id = p_order_id;
  if not found then raise exception using errcode = 'P0001', message = 'ORDER_NOT_FOUND'; end if;
  if p_purpose = 'PAYMENT_EVIDENCE' and target_order.payment_method <> 'ONLINE_PAYMENT' then
    raise exception using errcode = '22023', message = 'ONLINE_PAYMENT_REQUIRED';
  end if;
  if p_purpose = 'CHAT_IMAGE' and target_order.source <> 'ONLINE' then
    raise exception using errcode = 'P0001', message = 'CONVERSATION_UNAVAILABLE';
  end if;
  if target_order.source = 'ONLINE' then conversation_id := private.ensure_conversation(p_order_id); end if;
  return jsonb_build_object(
    'order_id', p_order_id, 'conversation_id', conversation_id,
    'bucket_id', case when p_purpose = 'PAYMENT_EVIDENCE' then 'payment-evidence' else 'message-media' end
  );
end;
$$;

create or replace function public.admin_finalize_attachment(
  p_order_id uuid,
  p_attachment_id uuid,
  p_storage_path text,
  p_mime_type text,
  p_size_bytes bigint,
  p_purpose text,
  p_text text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  target_order public.orders%rowtype;
  conversation_id uuid;
  created_message_id uuid;
  extension text;
  expected_path text;
  bucket text;
  retention_deadline timestamptz;
begin
  perform private.require_active_admin();
  if p_purpose not in ('CHAT_IMAGE', 'PAYMENT_EVIDENCE')
    or p_mime_type not in ('image/jpeg', 'image/png', 'image/webp')
    or p_size_bytes not between 1 and 5242880
    or (p_text is not null and char_length(btrim(p_text)) not between 1 and 2000)
  then raise exception using errcode = '22023', message = 'INVALID_ATTACHMENT'; end if;
  select * into target_order from public.orders where id = p_order_id for share;
  if not found then raise exception using errcode = 'P0001', message = 'ORDER_NOT_FOUND'; end if;
  if p_purpose = 'PAYMENT_EVIDENCE' and target_order.payment_method <> 'ONLINE_PAYMENT' then
    raise exception using errcode = '22023', message = 'ONLINE_PAYMENT_REQUIRED';
  end if;
  if p_purpose = 'CHAT_IMAGE' and target_order.source <> 'ONLINE' then
    raise exception using errcode = 'P0001', message = 'CONVERSATION_UNAVAILABLE';
  end if;
  extension := private.image_extension(p_mime_type);
  bucket := case when p_purpose = 'PAYMENT_EVIDENCE' then 'payment-evidence' else 'message-media' end;
  expected_path := 'orders/' || p_order_id || '/' ||
    case when p_purpose = 'PAYMENT_EVIDENCE' then 'evidence/' else 'messages/' end ||
    p_attachment_id || '.' || extension;
  if p_storage_path is distinct from expected_path then
    raise exception using errcode = '42501', message = 'ATTACHMENT_PATH_DENIED';
  end if;
  if target_order.source = 'ONLINE' then
    conversation_id := private.ensure_conversation(p_order_id);
    insert into public.messages (conversation_id, sender_type, sender_admin_id, text_content)
    values (conversation_id, 'ADMIN', auth.uid(), nullif(btrim(p_text), ''))
    returning id into created_message_id;
  end if;
  retention_deadline := case when p_purpose = 'PAYMENT_EVIDENCE'
    then target_order.created_at + interval '30 days' end;
  insert into public.message_attachments (
    id, order_id, message_id, purpose, bucket_id, storage_path,
    mime_type, size_bytes, created_by_type, created_by_admin_id, retained_until
  ) values (
    p_attachment_id, p_order_id, created_message_id, p_purpose, bucket,
    p_storage_path, p_mime_type, p_size_bytes, 'ADMIN', auth.uid(), retention_deadline
  );
  return jsonb_build_object('message_id', created_message_id,
    'attachment', jsonb_build_object('id', p_attachment_id, 'purpose', p_purpose,
      'mime_type', p_mime_type, 'size_bytes', p_size_bytes));
end;
$$;

create or replace function public.admin_authorize_attachment_read(p_attachment_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare attachment public.message_attachments%rowtype;
begin
  perform private.require_active_admin();
  select * into attachment from public.message_attachments
  where id = p_attachment_id and deleted_at is null;
  if not found then raise exception using errcode = 'P0001', message = 'ATTACHMENT_NOT_FOUND'; end if;
  if attachment.purpose = 'PAYMENT_EVIDENCE'
    and attachment.retained_until <= statement_timestamp()
  then raise exception using errcode = 'P0001', message = 'EVIDENCE_EXPIRED'; end if;
  return jsonb_build_object('bucket_id', attachment.bucket_id, 'storage_path', attachment.storage_path);
end;
$$;

create or replace function public.admin_list_expired_payment_evidence(p_limit integer default 100)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  perform private.require_active_admin();
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', attachment.id,
    'bucket_id', attachment.bucket_id,
    'storage_path', attachment.storage_path,
    'retained_until', attachment.retained_until
  ) order by attachment.retained_until), '[]'::jsonb)
  into result
  from (
    select * from public.message_attachments
    where purpose = 'PAYMENT_EVIDENCE'
      and deleted_at is null
      and retained_until <= statement_timestamp()
    order by retained_until
    limit least(greatest(coalesce(p_limit, 100), 1), 500)
  ) as attachment;
  return result;
end;
$$;

do $$
declare
  signature regprocedure;
begin
  foreach signature in array array[
    'public.admin_list_messages(uuid,timestamptz,integer)'::regprocedure,
    'public.admin_send_message(uuid,text)'::regprocedure,
    'public.admin_set_message_reaction(uuid,text)'::regprocedure,
    'public.admin_authorize_attachment_upload(uuid,text)'::regprocedure,
    'public.admin_finalize_attachment(uuid,uuid,text,text,bigint,text,text)'::regprocedure,
    'public.admin_authorize_attachment_read(uuid)'::regprocedure,
    'public.admin_list_expired_payment_evidence(integer)'::regprocedure
  ] loop
    execute format('revoke all on function %s from public, anon', signature);
    execute format('grant execute on function %s to authenticated', signature);
  end loop;
end;
$$;
