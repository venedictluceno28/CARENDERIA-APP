begin;

create extension if not exists pgtap with schema extensions;
select plan(37);

select ok(not has_table_privilege('anon', 'public.edge_rate_limits', 'SELECT'),
  'anonymous callers cannot read limiter state');
select ok(not has_table_privilege('authenticated', 'public.edge_rate_limits', 'SELECT'),
  'authenticated clients cannot read limiter state');
select ok(not has_function_privilege('anon', 'public.consume_edge_rate_limit(text,text,integer,integer)', 'EXECUTE'),
  'anonymous callers cannot consume limiter counters directly');
select ok(has_function_privilege('service_role', 'public.consume_edge_rate_limit(text,text,integer,integer)', 'EXECUTE'),
  'service role can reach the limiter boundary');

create temporary table hardening_results (label text primary key, payload jsonb);
grant select, insert on hardening_results to service_role;
set local role service_role;
insert into hardening_results values ('rate_1', public.consume_edge_rate_limit('test:receipt', repeat('1',64), 3, 600));
insert into hardening_results values ('rate_2', public.consume_edge_rate_limit('test:receipt', repeat('1',64), 3, 600));
insert into hardening_results values ('rate_3', public.consume_edge_rate_limit('test:receipt', repeat('1',64), 3, 600));
insert into hardening_results values ('rate_4', public.consume_edge_rate_limit('test:receipt', repeat('1',64), 3, 600));
insert into hardening_results values ('other_identity', public.consume_edge_rate_limit('test:receipt', repeat('2',64), 3, 600));
insert into hardening_results values ('other_action', public.consume_edge_rate_limit('test:message', repeat('1',64), 3, 600));
reset role;

select ok((select (payload ->> 'allowed')::boolean and (payload ->> 'remaining')::integer = 2
  from hardening_results where label = 'rate_1'), 'requests below the threshold are allowed');
select ok((select (payload ->> 'allowed')::boolean and (payload ->> 'remaining')::integer = 0
  from hardening_results where label = 'rate_3'), 'the exact threshold remains allowed');
select ok((select not (payload ->> 'allowed')::boolean and (payload ->> 'retry_after_seconds')::integer > 0
  from hardening_results where label = 'rate_4'), 'the first excess request is denied with retry timing');
select ok((select (payload ->> 'allowed')::boolean from hardening_results where label = 'other_identity'),
  'independent identities do not share a counter');
select ok((select (payload ->> 'allowed')::boolean from hardening_results where label = 'other_action'),
  'different actions use independent counters');
select is((select count(*) from public.edge_rate_limits
  where scope in ('test:receipt', 'test:message')), 3::bigint,
  'only one row exists for each scope, identity, and fixed window');
select ok((select bool_and(identity_hash ~ '^[0-9a-f]{64}$' and identity_hash not in ('client-a','token-a'))
  from public.edge_rate_limits where scope in ('test:receipt', 'test:message')),
  'limiter state contains hashes rather than raw identities or tokens');

select ok((select not public from storage.buckets where id = 'message-media'),
  'message media remains private');
select ok((select not public from storage.buckets where id = 'payment-evidence'),
  'payment evidence remains private');
select ok((select file_size_limit = 5242880 from storage.buckets where id = 'message-media'),
  'message media has a 5 MiB bucket limit');
select ok((select file_size_limit = 5242880 from storage.buckets where id = 'payment-evidence'),
  'payment evidence has a 5 MiB bucket limit');
select is((select allowed_mime_types from storage.buckets where id = 'message-media'),
  array['image/jpeg','image/png','image/webp']::text[], 'message media allows only JPEG, PNG, and WebP');
select is((select allowed_mime_types from storage.buckets where id = 'payment-evidence'),
  array['image/jpeg','image/png','image/webp']::text[], 'payment evidence allows only JPEG, PNG, and WebP');

select ok(not has_function_privilege('anon', 'public.claim_expired_payment_evidence(integer)', 'EXECUTE'),
  'anonymous callers cannot claim cleanup work');
select ok(has_function_privilege('service_role', 'public.claim_expired_payment_evidence(integer)', 'EXECUTE'),
  'only the service cleanup boundary can claim work');
select has_column('public', 'message_attachments', 'cleanup_claimed_at',
  'attachment metadata records retry-safe cleanup claims');

insert into public.published_menus (id, image_path, is_current, activated_at, expires_at)
values ('14000000-0000-4000-8000-000000000001', 'menus/hardening.jpg', true,
  statement_timestamp() - interval '1 hour', statement_timestamp() + interval '1 hour');
insert into public.orders (
  id, order_code, source, published_menu_id, customer_name, exact_address,
  location_classification, selected_area_name, payment_method, payment_verification_state,
  delivery_threshold_centavos, base_charge_below_threshold_centavos, far_area_rate_centavos,
  food_subtotal_centavos, internal_df_total_centavos, base_delivery_charge_centavos,
  far_area_charge_centavos, guest_access_token_hash, guest_chat_expires_at,
  original_snapshot, created_at, last_edited_at
) values (
  '44000000-0000-4000-8000-000000000001', 'CRD-HARDEN2345', 'ONLINE',
  '14000000-0000-4000-8000-000000000001', 'Retention Test', 'Private address',
  'NEARBY', 'Marycris Complex', 'ONLINE_PAYMENT', 'NOT_VERIFIED',
  2000, 1500, 2000, 8000, 1000, 1500, 0, repeat('e', 64),
  statement_timestamp() - interval '30 days', '{"snapshot_version":1}',
  statement_timestamp() - interval '31 days', statement_timestamp() - interval '31 days'
);
insert into public.conversations (id, order_id, created_at, expires_at)
values ('54000000-0000-4000-8000-000000000001', '44000000-0000-4000-8000-000000000001',
  statement_timestamp() - interval '31 days', statement_timestamp() - interval '30 days');
insert into public.messages (id, conversation_id, sender_type, text_content, created_at)
values ('64000000-0000-4000-8000-000000000001', '54000000-0000-4000-8000-000000000001',
  'GUEST', 'Historical message', statement_timestamp() - interval '31 days');
insert into public.message_attachments (
  id, order_id, message_id, purpose, bucket_id, storage_path, mime_type,
  size_bytes, created_by_type, created_at, retained_until
) values
  ('74000000-0000-4000-8000-000000000001', '44000000-0000-4000-8000-000000000001', '64000000-0000-4000-8000-000000000001',
    'PAYMENT_EVIDENCE', 'payment-evidence', 'orders/44000000-0000-4000-8000-000000000001/evidence/expired.jpg',
    'image/jpeg', 100, 'GUEST', statement_timestamp() - interval '31 days', statement_timestamp() - interval '1 day'),
  ('74000000-0000-4000-8000-000000000002', '44000000-0000-4000-8000-000000000001', '64000000-0000-4000-8000-000000000001',
    'PAYMENT_EVIDENCE', 'payment-evidence', 'orders/44000000-0000-4000-8000-000000000001/evidence/not-yet.png',
    'image/png', 100, 'GUEST', statement_timestamp() - interval '29 days', statement_timestamp() + interval '1 second'),
  ('74000000-0000-4000-8000-000000000003', '44000000-0000-4000-8000-000000000001', '64000000-0000-4000-8000-000000000001',
    'CHAT_IMAGE', 'message-media', 'orders/44000000-0000-4000-8000-000000000001/messages/chat.webp',
    'image/webp', 100, 'GUEST', statement_timestamp() - interval '31 days', null),
  ('74000000-0000-4000-8000-000000000004', '44000000-0000-4000-8000-000000000001', '64000000-0000-4000-8000-000000000001',
    'PAYMENT_EVIDENCE', 'payment-evidence', 'orders/44000000-0000-4000-8000-000000000001/evidence/retry.jpg',
    'image/jpeg', 100, 'GUEST', statement_timestamp() - interval '31 days', statement_timestamp() - interval '2 hours');

set local role service_role;
insert into hardening_results values ('cleanup_claim', public.claim_expired_payment_evidence(1));
reset role;
select ok((select not (payload @> '[{"id":"74000000-0000-4000-8000-000000000002"}]'::jsonb)
  from hardening_results where label = 'cleanup_claim'), 'not-yet-expired evidence remains unclaimed');
select ok((select payload @> '[{"id":"74000000-0000-4000-8000-000000000001"}]'::jsonb
  from hardening_results where label = 'cleanup_claim'), 'evidence older than the precise deadline becomes eligible');
select ok((select cleanup_claimed_at is not null and cleanup_attempts = 1
  from public.message_attachments where id = '74000000-0000-4000-8000-000000000001'),
  'claiming records an attempt without marking the object deleted');
select ok((select cleanup_claimed_at is null and deleted_at is null
  from public.message_attachments where id = '74000000-0000-4000-8000-000000000003'),
  'ordinary chat media is never cleanup-eligible');

set local role service_role;
insert into hardening_results values ('completed', to_jsonb(public.complete_payment_evidence_cleanup('74000000-0000-4000-8000-000000000001')));
insert into hardening_results values ('completed_again', to_jsonb(public.complete_payment_evidence_cleanup('74000000-0000-4000-8000-000000000001')));
reset role;
select ok((select payload::text = 'true' from hardening_results where label = 'completed'),
  'successful object deletion can be tombstoned');
select ok((select deleted_at is not null and cleanup_claimed_at is null
  from public.message_attachments where id = '74000000-0000-4000-8000-000000000001'),
  'tombstoned evidence is no longer represented as available');
select ok((select payload::text = 'true' from hardening_results where label = 'completed_again'),
  'cleanup completion is idempotent');

set local role service_role;
insert into hardening_results values ('cleanup_second', public.claim_expired_payment_evidence(10));
select public.fail_payment_evidence_cleanup('74000000-0000-4000-8000-000000000004', 'DELETE_FAILED');
reset role;
select ok((select not (payload @> '[{"id":"74000000-0000-4000-8000-000000000001"}]'::jsonb)
  from hardening_results where label = 'cleanup_second'), 'a second run does not reclaim tombstoned evidence');
select ok((select cleanup_claimed_at is null and cleanup_last_error = 'DELETE_FAILED'
  from public.message_attachments where id = '74000000-0000-4000-8000-000000000004'),
  'one object failure is safely released for a later retry');
set local role service_role;
insert into hardening_results values ('cleanup_retry', public.claim_expired_payment_evidence(10));
reset role;
select ok((select payload @> '[{"id":"74000000-0000-4000-8000-000000000004"}]'::jsonb
  from hardening_results where label = 'cleanup_retry'), 'failed cleanup work can be claimed again');
select ok((select cleanup_attempts = 2 from public.message_attachments
  where id = '74000000-0000-4000-8000-000000000004'), 'retry attempts are counted');
select ok((select exists(select 1 from public.orders where id = '44000000-0000-4000-8000-000000000001')),
  'cleanup preserves the order');
select ok((select exists(select 1 from public.messages where id = '64000000-0000-4000-8000-000000000001')),
  'cleanup preserves message history');
select ok((select deleted_at is null from public.message_attachments
  where id = '74000000-0000-4000-8000-000000000003'), 'cleanup leaves ordinary chat attachment metadata available');
select ok((select exists(select 1 from cron.job where jobname = 'carenderia-rate-limit-prune')),
  'expired limiter counters have a reproducible daily prune job');
select ok((select not exists(select 1 from cron.job where jobname = 'carenderia-payment-evidence-cleanup')),
  'evidence HTTP cron is not scheduled before deployment Vault secrets exist');
select throws_ok($$select private.configure_phase_1_4_evidence_cleanup_cron()$$,
  '55000', 'CLEANUP_VAULT_SECRETS_REQUIRED', 'cleanup scheduling fails closed until Vault is configured');

select * from finish();
rollback;
