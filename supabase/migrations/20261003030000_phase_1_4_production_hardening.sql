-- CARENDERIA-APP Phase 1.4: rate limiting, retention cleanup, and Storage hardening.

create table public.edge_rate_limits (
  scope text not null,
  identity_hash text not null,
  window_started_at timestamptz not null,
  request_count integer not null default 1,
  expires_at timestamptz not null,
  primary key (scope, identity_hash, window_started_at),
  constraint edge_rate_limits_scope_check
    check (scope ~ '^[a-z0-9:_-]{1,80}$'),
  constraint edge_rate_limits_identity_hash_check
    check (identity_hash ~ '^[0-9a-f]{64}$'),
  constraint edge_rate_limits_count_check check (request_count > 0),
  constraint edge_rate_limits_window_check check (expires_at > window_started_at)
);

create index edge_rate_limits_expiry_idx on public.edge_rate_limits (expires_at);
alter table public.edge_rate_limits enable row level security;
revoke all on table public.edge_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on table public.edge_rate_limits to service_role;

create or replace function public.consume_edge_rate_limit(
  p_scope text,
  p_identity_hash text,
  p_limit integer,
  p_window_seconds integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  window_start timestamptz;
  window_end timestamptz;
  current_count integer;
begin
  if p_scope !~ '^[a-z0-9:_-]{1,80}$'
    or p_identity_hash !~ '^[0-9a-f]{64}$'
    or p_limit not between 1 and 10000
    or p_window_seconds not between 1 and 86400
  then
    raise exception using errcode = '22023', message = 'INVALID_RATE_LIMIT';
  end if;

  window_start := to_timestamp(
    floor(extract(epoch from v_now) / p_window_seconds) * p_window_seconds
  );
  window_end := window_start + make_interval(secs => p_window_seconds);

  insert into public.edge_rate_limits (
    scope, identity_hash, window_started_at, request_count, expires_at
  ) values (
    p_scope, p_identity_hash, window_start, 1, window_end + interval '1 day'
  )
  on conflict (scope, identity_hash, window_started_at) do update
    set request_count = public.edge_rate_limits.request_count + 1
  returning request_count into current_count;

  return jsonb_build_object(
    'allowed', current_count <= p_limit,
    'limit', p_limit,
    'remaining', greatest(p_limit - current_count, 0),
    'retry_after_seconds', greatest(1, ceil(extract(epoch from window_end - v_now))::integer)
  );
end;
$$;

revoke all on function public.consume_edge_rate_limit(text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_edge_rate_limit(text, text, integer, integer)
  to service_role;

create or replace function private.prune_edge_rate_limits()
returns bigint
language sql
security definer
set search_path = ''
as $$
  with deleted as (
    delete from public.edge_rate_limits
    where expires_at <= statement_timestamp()
    returning 1
  )
  select count(*) from deleted;
$$;

revoke all on function private.prune_edge_rate_limits() from public;

alter table public.message_attachments
  add column cleanup_claimed_at timestamptz,
  add column cleanup_attempts integer not null default 0,
  add column cleanup_last_error text,
  add constraint message_attachments_cleanup_attempts_check
    check (cleanup_attempts >= 0),
  add constraint message_attachments_cleanup_error_check
    check (cleanup_last_error is null or char_length(cleanup_last_error) between 1 and 120);

create index message_attachments_cleanup_claim_idx
  on public.message_attachments (retained_until, cleanup_claimed_at)
  where purpose = 'PAYMENT_EVIDENCE' and deleted_at is null;

create or replace function public.claim_expired_payment_evidence(
  p_limit integer default 100
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  result jsonb;
begin
  if p_limit not between 1 and 500 then
    raise exception using errcode = '22023', message = 'INVALID_CLEANUP_LIMIT';
  end if;

  with candidates as (
    select id
    from public.message_attachments
    where purpose = 'PAYMENT_EVIDENCE'
      and retained_until <= statement_timestamp()
      and deleted_at is null
      and (cleanup_claimed_at is null or cleanup_claimed_at <= statement_timestamp() - interval '1 hour')
    order by retained_until, id
    for update skip locked
    limit p_limit
  ), claimed as (
    update public.message_attachments as attachment
    set cleanup_claimed_at = statement_timestamp(),
        cleanup_attempts = cleanup_attempts + 1,
        cleanup_last_error = null
    from candidates
    where attachment.id = candidates.id
    returning attachment.id, attachment.bucket_id, attachment.storage_path,
      attachment.retained_until
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id,
    'bucket_id', bucket_id,
    'storage_path', storage_path,
    'retained_until', retained_until
  ) order by retained_until, id), '[]'::jsonb)
  into result
  from claimed;

  return result;
end;
$$;

create or replace function public.complete_payment_evidence_cleanup(
  p_attachment_id uuid
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.message_attachments
  set deleted_at = coalesce(deleted_at, statement_timestamp()),
      cleanup_claimed_at = null,
      cleanup_last_error = null
  where id = p_attachment_id
    and purpose = 'PAYMENT_EVIDENCE'
    and retained_until <= statement_timestamp();
  return found;
end;
$$;

create or replace function public.fail_payment_evidence_cleanup(
  p_attachment_id uuid,
  p_safe_error text
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.message_attachments
  set cleanup_claimed_at = null,
      cleanup_last_error = left(coalesce(nullif(btrim(p_safe_error), ''), 'DELETE_FAILED'), 120)
  where id = p_attachment_id
    and purpose = 'PAYMENT_EVIDENCE'
    and deleted_at is null;
  return found;
end;
$$;

do $$
declare
  signature regprocedure;
begin
  foreach signature in array array[
    'public.claim_expired_payment_evidence(integer)'::regprocedure,
    'public.complete_payment_evidence_cleanup(uuid)'::regprocedure,
    'public.fail_payment_evidence_cleanup(uuid,text)'::regprocedure
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', signature);
    execute format('grant execute on function %s to service_role', signature);
  end loop;
end;
$$;

update storage.buckets
set public = false,
    file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id in ('message-media', 'payment-evidence');

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'carenderia-rate-limit-prune',
  '17 18 * * *',
  'select private.prune_edge_rate_limits()'
);

create or replace function private.configure_phase_1_4_evidence_cleanup_cron()
returns bigint
language plpgsql
security definer
set search_path = ''
as $function$
declare
  existing_job bigint;
  scheduled_job bigint;
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'project_url')
    or not exists (select 1 from vault.decrypted_secrets where name = 'evidence_cleanup_secret')
  then
    raise exception using errcode = '55000', message = 'CLEANUP_VAULT_SECRETS_REQUIRED';
  end if;

  select jobid into existing_job from cron.job
  where jobname = 'carenderia-payment-evidence-cleanup';
  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;

  select cron.schedule(
    'carenderia-payment-evidence-cleanup',
    '30 18 * * *',
    $cron$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/retention-cleanup',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cleanup-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'evidence_cleanup_secret')
        ),
        body := '{"source":"cron"}'::jsonb
      )
    $cron$
  ) into scheduled_job;
  return scheduled_job;
end;
$function$;

revoke all on function private.configure_phase_1_4_evidence_cleanup_cron() from public;
