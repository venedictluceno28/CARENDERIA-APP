begin;

select plan(12);

select has_function(
  'private',
  'broadcast_message_activity',
  array[]::text[],
  'message activity broadcaster exists'
);

select has_function(
  'private',
  'broadcast_payment_activity',
  array[]::text[],
  'payment activity broadcaster exists'
);

select has_trigger(
  'public',
  'messages',
  'messages_broadcast_activity_after_insert',
  'message inserts emit activity'
);

select has_trigger(
  'public',
  'messages',
  'messages_broadcast_activity_after_reaction',
  'reaction changes emit activity'
);

select has_trigger(
  'public',
  'orders',
  'orders_broadcast_payment_activity',
  'payment verification changes emit activity'
);

select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'realtime'
      and tablename = 'messages'
      and policyname = 'active_admin_receive_message_activity'
  ),
  1,
  'one scoped admin realtime policy exists'
);

select ok(
  (
    select qual like '%is_active_admin%'
      and qual like '%admin-messages%'
      and qual like '%admin-conversation:%'
    from pg_policies
    where schemaname = 'realtime'
      and tablename = 'messages'
      and policyname = 'active_admin_receive_message_activity'
  ),
  'private admin topics require an active admin'
);

select ok(
  pg_get_functiondef('private.broadcast_message_activity()'::regprocedure)
    like '%jsonb_build_object(''kind'', ''message'')%',
  'message broadcasts contain only an activity kind'
);

select ok(
  pg_get_functiondef('private.broadcast_message_activity()'::regprocedure)
    not like '%text_content%',
  'message broadcasts do not expose message bodies'
);

select ok(
  pg_get_functiondef('private.broadcast_payment_activity()'::regprocedure)
    like '%jsonb_build_object(''kind'', ''payment'')%',
  'payment broadcasts contain only an activity kind'
);

select ok(
  not has_function_privilege(
    'anon',
    'private.broadcast_message_activity()',
    'EXECUTE'
  ),
  'anonymous callers cannot execute the message broadcaster'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'private.broadcast_payment_activity()',
    'EXECUTE'
  ),
  'authenticated callers cannot execute the payment broadcaster'
);

select * from finish();
rollback;
