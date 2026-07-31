-- Claw request append-only consent lifecycle RPC (Task B2A, LOCAL-ONLY).
--
-- This migration adds one service-role-only, post-accept consent boundary. It records
-- grant and withdrawal events without accepting caller timestamps, state booleans,
-- sources, or arbitrary content. Exact event UUID replays return recorded historical
-- event fields; they never assert current state or downstream propagation completion.
--
-- Remote use remains blocked. Remaining direct grants require their own narrow RPCs;
-- prospective consent enforcement, downstream propagation, deletion governance, legal
-- and product approval, and hosted verification are all still required.

begin;

-- Remove every stale overload without CASCADE. A changed signature must never leave an
-- older executable function behind. Any real dependency fails this migration closed.
do $drop_old_consent_event_overloads$
declare
  function_row record;
begin
  for function_row in
    select
      namespace.nspname as schema_name,
      procedure.proname as function_name,
      pg_catalog.pg_get_function_identity_arguments(procedure.oid) as identity_arguments
    from pg_catalog.pg_proc as procedure
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname = 'claw_append_consent_event_v1'
  loop
    execute pg_catalog.format(
      'drop function %I.%I(%s)',
      function_row.schema_name,
      function_row.function_name,
      function_row.identity_arguments
    );
  end loop;
end
$drop_old_consent_event_overloads$;

create function public.claw_append_consent_event_v1(
  p_event_id uuid,
  p_request_id uuid,
  p_session_id uuid,
  p_consent_type text,
  p_event_type text,
  p_notice_version text,
  p_provider_policy_version text
)
returns table (
  event_id uuid,
  ledger_sequence bigint,
  recorded_at timestamptz,
  event_type text,
  recorded_granted boolean
)
language plpgsql
volatile
security definer
set search_path = pg_catalog
set TimeZone = 'UTC'
set DateStyle = 'ISO, YMD'
as $function$
declare
  v_consent_type text;
  v_event_type text;
  v_notice_version text;
  v_provider_policy_version text;
  v_recorded_granted boolean;
  v_now timestamptz := pg_catalog.statement_timestamp();
  v_existing_consent public.claw_request_consents%rowtype;
  v_latest_consent public.claw_request_consents%rowtype;
  v_inserted_consent public.claw_request_consents%rowtype;
  v_raced_consent public.claw_request_consents%rowtype;
  v_inserted boolean := false;
begin
  if p_event_id is null
    or p_request_id is null
    or p_session_id is null
    or p_consent_type is null
    or p_event_type is null
    or p_notice_version is null
  then
    raise exception using
      errcode = '22023',
      message = 'claw_append_consent_event_invalid_input';
  end if;

  v_consent_type := pg_catalog.btrim(p_consent_type);
  v_event_type := pg_catalog.btrim(p_event_type);
  v_notice_version := pg_catalog.btrim(p_notice_version);
  v_provider_policy_version := pg_catalog.btrim(p_provider_policy_version);

  if v_consent_type not in ('ai_processing', 'product_analytics', 'model_training')
    or v_event_type not in ('grant', 'withdraw')
  then
    raise exception using
      errcode = '22023',
      message = 'claw_append_consent_event_invalid_input';
  end if;

  if not (pg_catalog.char_length(v_notice_version) between 1 and 64)
    or v_notice_version !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$'
  then
    raise exception using
      errcode = '22023',
      message = 'claw_append_consent_event_invalid_version';
  end if;

  if p_provider_policy_version is not null
    and (
      not (pg_catalog.char_length(v_provider_policy_version) between 1 and 64)
      or v_provider_policy_version !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$'
    )
  then
    raise exception using
      errcode = '22023',
      message = 'claw_append_consent_event_invalid_version';
  end if;

  if v_consent_type = 'ai_processing' and v_event_type = 'grant' then
    if v_provider_policy_version is null then
      raise exception using
        errcode = '22023',
        message = 'claw_append_consent_event_invalid_policy';
    end if;
  elsif v_provider_policy_version is not null then
    raise exception using
      errcode = '22023',
      message = 'claw_append_consent_event_invalid_policy';
  end if;

  v_recorded_granted := v_event_type = 'grant';

  -- Serialize every event competing for the same request/session/purpose. This lock is
  -- acquired in its own statement so a waiter receives a fresh READ COMMITTED snapshot
  -- for every later ledger read. A 64-bit hash collision only over-serializes.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_request_id::text || ':' || p_session_id::text || ':' || v_consent_type,
      0
    )
  );

  -- The immutable event row is its own receipt. Check it before today's live-request or
  -- transition rules so an older exact UUID remains replayable after later valid events.
  select existing_consent.*
  into v_existing_consent
  from public.claw_request_consents as existing_consent
  where existing_consent.id = p_event_id;

  if found then
    if v_existing_consent.request_id is not distinct from p_request_id
      and v_existing_consent.session_id is not distinct from p_session_id
      and v_existing_consent.consent_type is not distinct from v_consent_type
      and v_existing_consent.event_type is not distinct from v_event_type
      and v_existing_consent.notice_version is not distinct from v_notice_version
      and v_existing_consent.provider_policy_version is not distinct from v_provider_policy_version
      and v_existing_consent.granted is not distinct from v_recorded_granted
      and v_existing_consent.source is not distinct from 'web'
      and v_existing_consent.withdrawn_at is not distinct from (
        case
          when v_event_type = 'withdraw' then v_existing_consent.created_at
          else null
        end
      )
    then
      return query
      select
        v_existing_consent.id,
        v_existing_consent.ledger_sequence,
        v_existing_consent.created_at,
        v_existing_consent.event_type,
        v_existing_consent.granted;
      return;
    end if;

    raise exception using
      errcode = 'P0001',
      message = 'claw_append_consent_event_idempotency_mismatch';
  end if;

  perform 1
  from public.claw_requests as request_row
  where request_row.id = p_request_id
    and request_row.deleted_at is null;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'claw_append_consent_event_request_unavailable';
  end if;

  perform 1
  from public.claw_request_sessions as session_row
  where session_row.id = p_session_id;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'claw_append_consent_event_session_unavailable';
  end if;

  select latest_consent.*
  into v_latest_consent
  from public.claw_request_consents as latest_consent
  where latest_consent.request_id = p_request_id
    and latest_consent.session_id = p_session_id
    and latest_consent.consent_type = v_consent_type
  order by latest_consent.ledger_sequence desc
  limit 1;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'claw_append_consent_event_lineage_unavailable';
  end if;

  if v_event_type = 'grant'
    and v_latest_consent.event_type not in ('decline', 'withdraw')
  then
    raise exception using
      errcode = '55000',
      message = 'claw_append_consent_event_invalid_transition';
  elsif v_event_type = 'withdraw'
    and v_latest_consent.event_type <> 'grant'
  then
    raise exception using
      errcode = '55000',
      message = 'claw_append_consent_event_invalid_transition';
  end if;

  insert into public.claw_request_consents (
    id,
    request_id,
    session_id,
    consent_type,
    granted,
    notice_version,
    provider_policy_version,
    created_at,
    withdrawn_at,
    source,
    event_type
  )
  values (
    p_event_id,
    p_request_id,
    p_session_id,
    v_consent_type,
    v_recorded_granted,
    v_notice_version,
    v_provider_policy_version,
    v_now,
    case when v_event_type = 'withdraw' then v_now else null end,
    'web',
    v_event_type
  )
  on conflict (id) do nothing
  returning * into v_inserted_consent;

  v_inserted := found;

  -- A concurrent caller can use the same UUID with another lineage and therefore another
  -- advisory key. The primary key settles that race; only an exact canonical receipt wins.
  if not v_inserted then
    select raced_consent.*
    into v_raced_consent
    from public.claw_request_consents as raced_consent
    where raced_consent.id = p_event_id;

    if found
      and v_raced_consent.request_id is not distinct from p_request_id
      and v_raced_consent.session_id is not distinct from p_session_id
      and v_raced_consent.consent_type is not distinct from v_consent_type
      and v_raced_consent.event_type is not distinct from v_event_type
      and v_raced_consent.notice_version is not distinct from v_notice_version
      and v_raced_consent.provider_policy_version is not distinct from v_provider_policy_version
      and v_raced_consent.granted is not distinct from v_recorded_granted
      and v_raced_consent.source is not distinct from 'web'
      and v_raced_consent.withdrawn_at is not distinct from (
        case
          when v_event_type = 'withdraw' then v_raced_consent.created_at
          else null
        end
      )
    then
      return query
      select
        v_raced_consent.id,
        v_raced_consent.ledger_sequence,
        v_raced_consent.created_at,
        v_raced_consent.event_type,
        v_raced_consent.granted;
      return;
    end if;

    raise exception using
      errcode = 'P0001',
      message = 'claw_append_consent_event_idempotency_mismatch';
  end if;

  if v_event_type = 'withdraw' then
    insert into public.claw_request_events (
      request_id,
      created_at,
      event_type,
      actor_type,
      actor_id,
      previous_status,
      new_status
    )
    values (
      p_request_id,
      v_now,
      'consent_withdrawn',
      'service_role',
      null,
      null,
      null
    );
  end if;

  return query
  select
    v_inserted_consent.id,
    v_inserted_consent.ledger_sequence,
    v_inserted_consent.created_at,
    v_inserted_consent.event_type,
    v_inserted_consent.granted;
end
$function$;

comment on function public.claw_append_consent_event_v1(
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  text
) is
  'LOCAL-ONLY append-only consent lifecycle boundary. Returns recorded historical event fields, never current state or propagation proof.';

revoke all on function public.claw_append_consent_event_v1(
  uuid, uuid, uuid, text, text, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.claw_append_consent_event_v1(
  uuid, uuid, uuid, text, text, text, text
) to service_role;

-- B2A replaces direct service-role consent-ledger access. Remove both relation-level and
-- any stale column-level ACLs, then remove every direct sequence privilege.
revoke all on table public.claw_request_consents from service_role;

do $revoke_consent_column_acl$
declare
  column_row record;
begin
  for column_row in
    select attribute.attname as column_name
    from pg_catalog.pg_attribute as attribute
    where attribute.attrelid = 'public.claw_request_consents'::pg_catalog.regclass
      and attribute.attnum > 0
      and not attribute.attisdropped
  loop
    execute pg_catalog.format(
      'revoke all (%I) on table public.claw_request_consents from service_role',
      column_row.column_name
    );
  end loop;
end
$revoke_consent_column_acl$;

revoke all on sequence public.claw_request_consents_ledger_sequence_seq from service_role;

-- Fail closed if role membership or stale ACLs still leave a direct/effective consent path.
do $verify_consent_acl_closed$
declare
  v_service_role_oid oid := (
    select role.oid
    from pg_catalog.pg_roles as role
    where role.rolname = 'service_role'
  );
  v_privilege text;
begin
  if exists (
    select 1
    from pg_catalog.pg_class as relation
    cross join lateral pg_catalog.aclexplode(relation.relacl) as acl
    where relation.oid = 'public.claw_request_consents'::pg_catalog.regclass
      and acl.grantee = v_service_role_oid
  ) or exists (
    select 1
    from pg_catalog.pg_attribute as attribute
    cross join lateral pg_catalog.aclexplode(attribute.attacl) as acl
    where attribute.attrelid = 'public.claw_request_consents'::pg_catalog.regclass
      and attribute.attnum > 0
      and not attribute.attisdropped
      and acl.grantee = v_service_role_oid
  ) then
    raise exception using
      errcode = '42501',
      message = 'claw_append_consent_event_consent_acl_not_closed';
  end if;

  foreach v_privilege in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']
  loop
    if pg_catalog.has_table_privilege(
      'service_role',
      'public.claw_request_consents',
      v_privilege
    ) then
      raise exception using
        errcode = '42501',
        message = 'claw_append_consent_event_consent_acl_not_closed';
    end if;
  end loop;

  foreach v_privilege in array array['SELECT', 'INSERT', 'UPDATE']
  loop
    if pg_catalog.has_any_column_privilege(
      'service_role',
      'public.claw_request_consents',
      v_privilege
    ) then
      raise exception using
        errcode = '42501',
        message = 'claw_append_consent_event_consent_acl_not_closed';
    end if;
  end loop;

  if exists (
    select 1
    from pg_catalog.pg_class as relation
    cross join lateral pg_catalog.aclexplode(relation.relacl) as acl
    where relation.oid = 'public.claw_request_consents_ledger_sequence_seq'::pg_catalog.regclass
      and acl.grantee = v_service_role_oid
  ) or pg_catalog.has_sequence_privilege(
    'service_role',
    'public.claw_request_consents_ledger_sequence_seq',
    'USAGE'
  ) or pg_catalog.has_sequence_privilege(
    'service_role',
    'public.claw_request_consents_ledger_sequence_seq',
    'SELECT'
  ) or pg_catalog.has_sequence_privilege(
    'service_role',
    'public.claw_request_consents_ledger_sequence_seq',
    'UPDATE'
  ) then
    raise exception using
      errcode = '42501',
      message = 'claw_append_consent_event_consent_acl_not_closed';
  end if;
end
$verify_consent_acl_closed$;

commit;
