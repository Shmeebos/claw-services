\set ON_ERROR_STOP on

begin;

-- A role with no direct grants represents the privileges inherited only from PUBLIC.
do $create_public_probe$
begin
  if not exists (
    select 1
    from pg_catalog.pg_roles
    where rolname = 'claw_b2a_public_probe'
  ) then
    execute 'create role claw_b2a_public_probe nologin noinherit';
  end if;
end
$create_public_probe$;

create function pg_temp.claw_b2a_accept(
  p_idempotency_key uuid,
  p_correlation_id uuid,
  p_session_id uuid,
  p_ai_consent_id uuid,
  p_analytics_consent_id uuid,
  p_training_consent_id uuid,
  p_ai_granted boolean default true,
  p_analytics_granted boolean default true,
  p_training_granted boolean default true
)
returns uuid
language sql
as $test_accept$
  select accepted.request_id
  from public.claw_accept_request_v1(
    p_idempotency_key,
    p_correlation_id,
    p_session_id,
    'B2A Synthetic Customer',
    'b2a-synthetic@example.test',
    null,
    'Research and admin',
    'Prepare a bounded synthetic operator brief for B2A verification.',
    null,
    'Four weeks',
    '{"summary":"Verify the B2A consent lifecycle.","objectives":[],"deliverables":[],"constraints":[],"success_criteria":[]}'::jsonb,
    'privacy.v1',
    'request.v1',
    '{}'::jsonb,
    'test',
    'session.v1',
    'app.v1',
    true,
    false,
    false,
    p_ai_consent_id,
    p_ai_granted,
    'ai.accept.v1',
    case when p_ai_granted then 'provider.accept.v1' else null end,
    p_analytics_consent_id,
    p_analytics_granted,
    'analytics.accept.v1',
    p_training_consent_id,
    p_training_granted,
    'training.accept.v1',
    '[]'::jsonb
  ) as accepted
$test_accept$;

-- SQL-language validation deliberately resolves the exact B2A function here. With only
-- A+B1A+B1B applied, this is the expected SQL RED because the RPC does not yet exist.
create function pg_temp.claw_b2a_call(
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
language sql
volatile
as $test_call$
  select *
  from public.claw_append_consent_event_v1(
    p_event_id,
    p_request_id,
    p_session_id,
    p_consent_type,
    p_event_type,
    p_notice_version,
    p_provider_policy_version
  )
$test_call$;

create function pg_temp.claw_b2a_expect_error(
  p_event_id uuid,
  p_request_id uuid,
  p_session_id uuid,
  p_consent_type text,
  p_event_type text,
  p_notice_version text,
  p_provider_policy_version text,
  p_expected_state text,
  p_expected_message text
)
returns void
language plpgsql
as $expect_error$
declare
  v_state text;
  v_message text;
begin
  begin
    perform *
    from public.claw_append_consent_event_v1(
      p_event_id,
      p_request_id,
      p_session_id,
      p_consent_type,
      p_event_type,
      p_notice_version,
      p_provider_policy_version
    );

    raise exception using
      errcode = 'ZX001',
      message = 'claw_b2a_test_unexpected_success';
  exception
    when others then
      get stacked diagnostics
        v_state = returned_sqlstate,
        v_message = message_text;

      -- The sentinel is never accepted as an expected failure.
      if v_state = 'ZX001' then
        raise;
      end if;

      if v_state is distinct from p_expected_state
        or (
          p_expected_message is not null
          and v_message is distinct from p_expected_message
        )
      then
        raise exception
          'B2A expected [%] %, received [%] %',
          p_expected_state,
          p_expected_message,
          v_state,
          v_message;
      end if;
  end;
end
$expect_error$;

create function pg_temp.claw_b2a_expect_denied_sql(p_sql text)
returns void
language plpgsql
as $expect_denied_sql$
declare
  v_state text;
begin
  begin
    execute p_sql;
    raise exception using
      errcode = 'ZX002',
      message = 'claw_b2a_acl_test_unexpected_success';
  exception
    when others then
      get stacked diagnostics v_state = returned_sqlstate;
      if v_state = 'ZX002' then
        raise;
      end if;
      if v_state <> '42501' then
        raise exception 'B2A ACL probe returned SQLSTATE % instead of 42501', v_state;
      end if;
  end;
end
$expect_denied_sql$;

do $catalog_and_acl_assertions$
declare
  v_function_oid oid := 'public.claw_append_consent_event_v1(uuid,uuid,uuid,text,text,text,text)'::regprocedure::oid;
  v_service_role_oid oid := (select oid from pg_catalog.pg_roles where rolname = 'service_role');
  v_anon_oid oid := (select oid from pg_catalog.pg_roles where rolname = 'anon');
  v_authenticated_oid oid := (select oid from pg_catalog.pg_roles where rolname = 'authenticated');
  v_overloads integer;
  v_direct_service_execute integer;
  v_prohibited_execute integer;
  v_privilege text;
begin
  select pg_catalog.count(*)::integer
  into v_overloads
  from pg_catalog.pg_proc as procedure
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'public'
    and procedure.proname = 'claw_append_consent_event_v1';

  if v_overloads <> 1 then
    raise exception 'B2A expected exactly one overload, found %', v_overloads;
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_proc as procedure
    where procedure.oid = v_function_oid
      and procedure.pronargs = 7
      and procedure.pronargdefaults = 0
      and pg_catalog.oidvectortypes(procedure.proargtypes)
        = 'uuid, uuid, uuid, text, text, text, text'
      and pg_catalog.pg_get_function_result(procedure.oid)
        = 'TABLE(event_id uuid, ledger_sequence bigint, recorded_at timestamp with time zone, event_type text, recorded_granted boolean)'
      and procedure.provolatile = 'v'
      and procedure.prosecdef
      and procedure.proowner <> v_service_role_oid
      and procedure.proconfig @> array[
        'search_path=pg_catalog',
        'TimeZone=UTC',
        'DateStyle=ISO, YMD'
      ]
      and pg_catalog.cardinality(procedure.proconfig) = 3
  ) then
    raise exception 'B2A function signature, return surface, owner, or metadata mismatch';
  end if;

  select
    pg_catalog.count(*) filter (
      where acl.grantee = v_service_role_oid
        and acl.privilege_type = 'EXECUTE'
    )::integer,
    pg_catalog.count(*) filter (
      where acl.grantee in (0, v_anon_oid, v_authenticated_oid)
        and acl.privilege_type = 'EXECUTE'
    )::integer
  into v_direct_service_execute, v_prohibited_execute
  from pg_catalog.pg_proc as procedure
  cross join lateral pg_catalog.aclexplode(procedure.proacl) as acl
  where procedure.oid = v_function_oid;

  if v_direct_service_execute <> 1
    or v_prohibited_execute <> 0
    or not pg_catalog.has_function_privilege('service_role', v_function_oid, 'EXECUTE')
    or pg_catalog.has_function_privilege('anon', v_function_oid, 'EXECUTE')
    or pg_catalog.has_function_privilege('authenticated', v_function_oid, 'EXECUTE')
    or pg_catalog.has_function_privilege('claw_b2a_public_probe', v_function_oid, 'EXECUTE')
  then
    raise exception 'B2A direct or effective function ACL mismatch';
  end if;

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
    raise exception 'B2A service_role retains a direct consent table or column ACL';
  end if;

  foreach v_privilege in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']
  loop
    if pg_catalog.has_table_privilege(
      'service_role',
      'public.claw_request_consents',
      v_privilege
    ) then
      raise exception 'B2A service_role retains effective consent %', v_privilege;
    end if;
  end loop;

  foreach v_privilege in array array['SELECT', 'INSERT', 'UPDATE']
  loop
    if pg_catalog.has_any_column_privilege(
      'service_role',
      'public.claw_request_consents',
      v_privilege
    ) then
      raise exception 'B2A service_role retains effective consent column %', v_privilege;
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
    raise exception 'B2A service_role retains direct or effective consent sequence privilege';
  end if;

  -- Unrelated temporary B1A and Task A grants must survive this narrow privilege closure.
  if not pg_catalog.has_table_privilege('service_role', 'public.claw_request_sessions', 'SELECT')
    or not pg_catalog.has_table_privilege('service_role', 'public.claw_request_sessions', 'INSERT')
    or not pg_catalog.has_column_privilege('service_role', 'public.claw_request_sessions', 'ended_at', 'UPDATE')
    or not pg_catalog.has_table_privilege('service_role', 'public.claw_request_product_events', 'SELECT')
    or not pg_catalog.has_table_privilege('service_role', 'public.claw_request_product_events', 'INSERT')
    or not pg_catalog.has_table_privilege('service_role', 'private.claw_deletion_tombstones', 'SELECT')
    or not pg_catalog.has_table_privilege('service_role', 'private.claw_deletion_tombstones', 'INSERT')
    or not pg_catalog.has_table_privilege('service_role', 'public.claw_requests', 'SELECT')
    or not pg_catalog.has_table_privilege('service_role', 'public.claw_requests', 'INSERT')
    or not pg_catalog.has_table_privilege('service_role', 'public.claw_requests', 'UPDATE')
    or not pg_catalog.has_table_privilege('service_role', 'public.claw_request_notifications', 'SELECT')
    or not pg_catalog.has_table_privilege('service_role', 'public.claw_request_notifications', 'INSERT')
    or not pg_catalog.has_table_privilege('service_role', 'public.claw_request_notifications', 'UPDATE')
    or not pg_catalog.has_table_privilege('service_role', 'public.claw_request_events', 'SELECT')
    or not pg_catalog.has_table_privilege('service_role', 'public.claw_request_events', 'INSERT')
    or not pg_catalog.has_schema_privilege('service_role', 'private', 'USAGE')
  then
    raise exception 'B2A changed an unrelated temporary prerequisite grant';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_class as relation
    cross join lateral pg_catalog.aclexplode(relation.relacl) as acl
    where relation.oid = 'public.claw_request_product_events'::pg_catalog.regclass
      and acl.grantee = v_service_role_oid
      and acl.privilege_type = 'INSERT'
  ) or not exists (
    select 1
    from pg_catalog.pg_attribute as attribute
    cross join lateral pg_catalog.aclexplode(attribute.attacl) as acl
    where attribute.attrelid = 'public.claw_request_sessions'::pg_catalog.regclass
      and attribute.attname = 'ended_at'
      and acl.grantee = v_service_role_oid
      and acl.privilege_type = 'UPDATE'
  ) then
    raise exception 'B2A changed direct unrelated prerequisite ACL entries';
  end if;
end
$catalog_and_acl_assertions$;

-- Effective ACL checks are paired with real direct-operation denials.
set role service_role;
select pg_temp.claw_b2a_expect_denied_sql(
  'select * from public.claw_request_consents limit 1'
);
select pg_temp.claw_b2a_expect_denied_sql(
  'insert into public.claw_request_consents default values'
);
select pg_temp.claw_b2a_expect_denied_sql(
  'update public.claw_request_consents set notice_version = notice_version where false'
);
select pg_temp.claw_b2a_expect_denied_sql(
  'delete from public.claw_request_consents where false'
);
select pg_temp.claw_b2a_expect_denied_sql(
  'truncate table public.claw_request_consents'
);
select pg_temp.claw_b2a_expect_denied_sql(
  'select pg_catalog.nextval(''public.claw_request_consents_ledger_sequence_seq''::pg_catalog.regclass)'
);
reset role;

-- Every lineage is created through the approved B1B RPC after B2A has revoked direct
-- consent table and sequence access. This proves the B1B definer boundary still works.
set role service_role;
create temporary table claw_b2a_main as
select pg_temp.claw_b2a_accept(
  '30000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000002',
  '30000000-0000-4000-8000-000000000003',
  '30000000-0000-4000-8000-000000000004',
  '30000000-0000-4000-8000-000000000005',
  '30000000-0000-4000-8000-000000000006'
) as request_id;

create temporary table claw_b2a_ended as
select pg_temp.claw_b2a_accept(
  '30100000-0000-4000-8000-000000000001',
  '30100000-0000-4000-8000-000000000002',
  '30100000-0000-4000-8000-000000000003',
  '30100000-0000-4000-8000-000000000004',
  '30100000-0000-4000-8000-000000000005',
  '30100000-0000-4000-8000-000000000006'
) as request_id;

create temporary table claw_b2a_deletion_pending as
select pg_temp.claw_b2a_accept(
  '30200000-0000-4000-8000-000000000001',
  '30200000-0000-4000-8000-000000000002',
  '30200000-0000-4000-8000-000000000003',
  '30200000-0000-4000-8000-000000000004',
  '30200000-0000-4000-8000-000000000005',
  '30200000-0000-4000-8000-000000000006'
) as request_id;

create temporary table claw_b2a_deleted as
select pg_temp.claw_b2a_accept(
  '30300000-0000-4000-8000-000000000001',
  '30300000-0000-4000-8000-000000000002',
  '30300000-0000-4000-8000-000000000003',
  '30300000-0000-4000-8000-000000000004',
  '30300000-0000-4000-8000-000000000005',
  '30300000-0000-4000-8000-000000000006'
) as request_id;
reset role;

do $b1b_after_revocation_assertions$
begin
  if (select pg_catalog.count(*) from claw_b2a_main) <> 1
    or (select pg_catalog.count(*) from claw_b2a_ended) <> 1
    or (select pg_catalog.count(*) from claw_b2a_deletion_pending) <> 1
    or (select pg_catalog.count(*) from claw_b2a_deleted) <> 1
    or (select pg_catalog.count(*) from public.claw_requests) <> 4
    or (select pg_catalog.count(*) from public.claw_request_sessions) <> 4
    or (select pg_catalog.count(*) from public.claw_request_consents) <> 12
  then
    raise exception 'B2A prerequisite B1B baseline creation failed after privilege revocation';
  end if;
end
$b1b_after_revocation_assertions$;

-- Valid post-accept withdraw then regrant for all three independent purposes.
set role service_role;
create temporary table claw_b2a_main_ai_withdraw as
select * from pg_temp.claw_b2a_call(
  '31000000-0000-4000-8000-000000000001',
  (select request_id from claw_b2a_main),
  '30000000-0000-4000-8000-000000000003',
  'ai_processing',
  'withdraw',
  ' ai.notice.v2 ',
  null
);

create temporary table claw_b2a_main_analytics_withdraw as
select * from pg_temp.claw_b2a_call(
  '31000000-0000-4000-8000-000000000002',
  (select request_id from claw_b2a_main),
  '30000000-0000-4000-8000-000000000003',
  'product_analytics',
  'withdraw',
  ' analytics.notice.v2 ',
  null
);

create temporary table claw_b2a_main_training_withdraw as
select * from pg_temp.claw_b2a_call(
  '31000000-0000-4000-8000-000000000003',
  (select request_id from claw_b2a_main),
  '30000000-0000-4000-8000-000000000003',
  'model_training',
  'withdraw',
  ' training.notice.v2 ',
  null
);

create temporary table claw_b2a_main_ai_regrant as
select * from pg_temp.claw_b2a_call(
  '31000000-0000-4000-8000-000000000004',
  (select request_id from claw_b2a_main),
  '30000000-0000-4000-8000-000000000003',
  'ai_processing',
  'grant',
  ' ai.notice.v3 ',
  ' provider.lifecycle.v2 '
);

create temporary table claw_b2a_main_analytics_regrant as
select * from pg_temp.claw_b2a_call(
  '31000000-0000-4000-8000-000000000005',
  (select request_id from claw_b2a_main),
  '30000000-0000-4000-8000-000000000003',
  'product_analytics',
  'grant',
  ' analytics.notice.v3 ',
  null
);

create temporary table claw_b2a_main_training_regrant as
select * from pg_temp.claw_b2a_call(
  '31000000-0000-4000-8000-000000000006',
  (select request_id from claw_b2a_main),
  '30000000-0000-4000-8000-000000000003',
  'model_training',
  'grant',
  ' training.notice.v3 ',
  null
);
reset role;

do $main_transition_assertions$
declare
  v_request_id uuid := (select request_id from claw_b2a_main);
begin
  if (select pg_catalog.count(*) from public.claw_request_consents where request_id = v_request_id) <> 9
    or (select pg_catalog.count(distinct ledger_sequence) from public.claw_request_consents where request_id = v_request_id) <> 9
  then
    raise exception 'B2A main consent counts or ledger uniqueness mismatch';
  end if;

  if not exists (
    select 1
    from public.claw_request_consents as initial_event
    join public.claw_request_consents as withdraw_event
      on withdraw_event.id = '31000000-0000-4000-8000-000000000001'
    join public.claw_request_consents as grant_event
      on grant_event.id = '31000000-0000-4000-8000-000000000004'
    where initial_event.id = '30000000-0000-4000-8000-000000000004'
      and initial_event.ledger_sequence < withdraw_event.ledger_sequence
      and withdraw_event.ledger_sequence < grant_event.ledger_sequence
  ) or not exists (
    select 1
    from public.claw_request_consents as initial_event
    join public.claw_request_consents as withdraw_event
      on withdraw_event.id = '31000000-0000-4000-8000-000000000002'
    join public.claw_request_consents as grant_event
      on grant_event.id = '31000000-0000-4000-8000-000000000005'
    where initial_event.id = '30000000-0000-4000-8000-000000000005'
      and initial_event.ledger_sequence < withdraw_event.ledger_sequence
      and withdraw_event.ledger_sequence < grant_event.ledger_sequence
  ) or not exists (
    select 1
    from public.claw_request_consents as initial_event
    join public.claw_request_consents as withdraw_event
      on withdraw_event.id = '31000000-0000-4000-8000-000000000003'
    join public.claw_request_consents as grant_event
      on grant_event.id = '31000000-0000-4000-8000-000000000006'
    where initial_event.id = '30000000-0000-4000-8000-000000000006'
      and initial_event.ledger_sequence < withdraw_event.ledger_sequence
      and withdraw_event.ledger_sequence < grant_event.ledger_sequence
  ) then
    raise exception 'B2A authoritative ledger order mismatch';
  end if;

  if exists (
    select 1
    from public.claw_request_consents
    where id in (
      '31000000-0000-4000-8000-000000000001',
      '31000000-0000-4000-8000-000000000002',
      '31000000-0000-4000-8000-000000000003'
    )
      and (
        event_type <> 'withdraw'
        or granted
        or withdrawn_at is null
        or withdrawn_at <> created_at
        or provider_policy_version is not null
        or source <> 'web'
      )
  ) then
    raise exception 'B2A withdraw event shape mismatch';
  end if;

  if not exists (
    select 1
    from public.claw_request_consents
    where id = '31000000-0000-4000-8000-000000000004'
      and consent_type = 'ai_processing'
      and event_type = 'grant'
      and granted
      and notice_version = 'ai.notice.v3'
      and provider_policy_version = 'provider.lifecycle.v2'
      and withdrawn_at is null
      and source = 'web'
  ) or exists (
    select 1
    from public.claw_request_consents
    where id in (
      '31000000-0000-4000-8000-000000000005',
      '31000000-0000-4000-8000-000000000006'
    )
      and (
        event_type <> 'grant'
        or not granted
        or provider_policy_version is not null
        or withdrawn_at is not null
        or source <> 'web'
      )
  ) then
    raise exception 'B2A regrant event shape or policy mismatch';
  end if;

  if exists (
    select 1
    from (
      select * from claw_b2a_main_ai_withdraw
      union all select * from claw_b2a_main_analytics_withdraw
      union all select * from claw_b2a_main_training_withdraw
      union all select * from claw_b2a_main_ai_regrant
      union all select * from claw_b2a_main_analytics_regrant
      union all select * from claw_b2a_main_training_regrant
    ) as returned_event
    left join public.claw_request_consents as stored_event
      on stored_event.id = returned_event.event_id
    where stored_event.id is null
      or returned_event.ledger_sequence <> stored_event.ledger_sequence
      or returned_event.recorded_at <> stored_event.created_at
      or returned_event.event_type <> stored_event.event_type
      or returned_event.recorded_granted <> stored_event.granted
  ) then
    raise exception 'B2A recorded historical return fields mismatch';
  end if;
end
$main_transition_assertions$;

-- Ended sessions remain valid lineage for withdrawal.
set role service_role;
update public.claw_request_sessions
set ended_at = pg_catalog.statement_timestamp()
where id = '30100000-0000-4000-8000-000000000003';

create temporary table claw_b2a_ended_withdraw as
select * from pg_temp.claw_b2a_call(
  '31100000-0000-4000-8000-000000000001',
  (select request_id from claw_b2a_ended),
  '30100000-0000-4000-8000-000000000003',
  'ai_processing',
  'withdraw',
  'ai.ended.v2',
  null
);
reset role;

do $ended_session_assertions$
begin
  if not exists (
    select 1
    from public.claw_request_consents as consent
    join public.claw_request_sessions as session_row
      on session_row.id = consent.session_id
    where consent.id = '31100000-0000-4000-8000-000000000001'
      and session_row.ended_at is not null
      and consent.event_type = 'withdraw'
      and not consent.granted
      and consent.withdrawn_at = consent.created_at
  ) then
    raise exception 'B2A ended-session withdrawal failed';
  end if;
end
$ended_session_assertions$;

-- deletion_requested_at alone does not block while deleted_at remains null.
set role service_role;
update public.claw_requests
set deletion_requested_at = pg_catalog.statement_timestamp()
where id = (select request_id from claw_b2a_deletion_pending);

create temporary table claw_b2a_deletion_pending_withdraw as
select * from pg_temp.claw_b2a_call(
  '31200000-0000-4000-8000-000000000001',
  (select request_id from claw_b2a_deletion_pending),
  '30200000-0000-4000-8000-000000000003',
  'ai_processing',
  'withdraw',
  'ai.deletion-pending.v2',
  null
);

update public.claw_requests
set deletion_requested_at = pg_catalog.statement_timestamp(),
    deleted_at = pg_catalog.statement_timestamp()
where id = (select request_id from claw_b2a_deleted);
reset role;

do $deletion_pending_assertions$
begin
  if not exists (
    select 1
    from public.claw_request_consents as consent
    join public.claw_requests as request_row
      on request_row.id = consent.request_id
    where consent.id = '31200000-0000-4000-8000-000000000001'
      and request_row.deletion_requested_at is not null
      and request_row.deleted_at is null
      and consent.event_type = 'withdraw'
  ) then
    raise exception 'B2A deletion-requested withdrawal failed';
  end if;
end
$deletion_pending_assertions$;

create temporary table claw_b2a_deleted_before as
select
  (select pg_catalog.count(*) from public.claw_request_consents) as consent_count,
  (select pg_catalog.count(*) from public.claw_request_events) as audit_count;

set role service_role;
select pg_temp.claw_b2a_expect_error(
  '31300000-0000-4000-8000-000000000001',
  (select request_id from claw_b2a_deleted),
  '30300000-0000-4000-8000-000000000003',
  'ai_processing',
  'withdraw',
  'ai.deleted.v2',
  null,
  'P0002',
  'claw_append_consent_event_request_unavailable'
);
reset role;

do $deleted_request_assertions$
begin
  if (select pg_catalog.count(*) from public.claw_request_consents)
      <> (select consent_count from claw_b2a_deleted_before)
    or (select pg_catalog.count(*) from public.claw_request_events)
      <> (select audit_count from claw_b2a_deleted_before)
    or exists (
      select 1
      from public.claw_request_consents
      where id = '31300000-0000-4000-8000-000000000001'
    )
  then
    raise exception 'B2A deleted request created partial consent or audit state';
  end if;
end
$deleted_request_assertions$;

-- Replaying an older withdraw UUID after a later regrant returns its historical row and
-- creates neither another ledger row nor another audit row.
create temporary table claw_b2a_replay_before as
select
  (select pg_catalog.count(*) from public.claw_request_consents) as consent_count,
  (select pg_catalog.count(*) from public.claw_request_events) as audit_count;

set role service_role;
create temporary table claw_b2a_old_withdraw_replay as
select * from pg_temp.claw_b2a_call(
  '31000000-0000-4000-8000-000000000001',
  (select request_id from claw_b2a_main),
  '30000000-0000-4000-8000-000000000003',
  'ai_processing',
  'withdraw',
  'ai.notice.v2',
  null
);
reset role;

do $historical_replay_assertions$
begin
  if not exists (
    select 1
    from claw_b2a_old_withdraw_replay as replay
    join claw_b2a_main_ai_withdraw as original
      using (event_id, ledger_sequence, recorded_at, event_type, recorded_granted)
    where replay.event_type = 'withdraw'
      and not replay.recorded_granted
  ) or (select pg_catalog.count(*) from public.claw_request_consents)
      <> (select consent_count from claw_b2a_replay_before)
    or (select pg_catalog.count(*) from public.claw_request_events)
      <> (select audit_count from claw_b2a_replay_before)
  then
    raise exception 'B2A exact historical replay changed state or receipt fields';
  end if;
end
$historical_replay_assertions$;

-- The key-presence branches below intentionally preserve explicit JSON null for provider
-- policy. coalesce(overrides ->> key, baseline) would make that mismatch case vacuous.
create function pg_temp.claw_b2a_replay_with_overrides(
  p_baseline_request_id uuid,
  p_baseline_session_id uuid,
  p_overrides jsonb
)
returns table (
  event_id uuid,
  ledger_sequence bigint,
  recorded_at timestamptz,
  event_type text,
  recorded_granted boolean
)
language sql
as $replay_overrides$
  select *
  from public.claw_append_consent_event_v1(
    '31000000-0000-4000-8000-000000000004',
    case
      when p_overrides ? 'request_id' then (p_overrides ->> 'request_id')::uuid
      else p_baseline_request_id
    end,
    case
      when p_overrides ? 'session_id' then (p_overrides ->> 'session_id')::uuid
      else p_baseline_session_id
    end,
    case
      when p_overrides ? 'consent_type' then p_overrides ->> 'consent_type'
      else 'ai_processing'
    end,
    case
      when p_overrides ? 'event_type' then p_overrides ->> 'event_type'
      else 'grant'
    end,
    case
      when p_overrides ? 'notice_version' then p_overrides ->> 'notice_version'
      else 'ai.notice.v3'
    end,
    case
      when p_overrides ? 'provider_policy_version'
        then p_overrides ->> 'provider_policy_version'
      else 'provider.lifecycle.v2'
    end
  )
$replay_overrides$;

create temporary table claw_b2a_mismatch_before as
select
  (select pg_catalog.count(*) from public.claw_request_consents) as consent_count,
  (select pg_catalog.count(*) from public.claw_request_events) as audit_count;

set role service_role;
do $material_mismatch_matrix$
declare
  v_case text;
  v_overrides jsonb;
  v_case_count integer := 0;
  v_state text;
  v_message text;
  v_main_request_id uuid := (select request_id from claw_b2a_main);
  v_ended_request_id uuid := (select request_id from claw_b2a_ended);
begin
  -- Prove the override helper preserves explicit JSON null instead of silently
  -- coalescing it back to the valid baseline provider policy.
  begin
    perform *
    from pg_temp.claw_b2a_replay_with_overrides(
      v_main_request_id,
      '30000000-0000-4000-8000-000000000003',
      '{"provider_policy_version":null}'::jsonb
    );
    raise exception using
      errcode = 'ZX004',
      message = 'claw_b2a_explicit_null_unexpected_success';
  exception
    when others then
      get stacked diagnostics
        v_state = returned_sqlstate,
        v_message = message_text;
      if v_state = 'ZX004' then
        raise;
      end if;
      if v_state <> '22023'
        or v_message <> 'claw_append_consent_event_invalid_policy'
      then
        raise exception
          'B2A explicit-null override returned [%] %',
          v_state,
          v_message;
      end if;
  end;

  for v_case, v_overrides in
    select case_row.case_name, case_row.overrides
    from (values
      (
        'request_id',
        pg_catalog.jsonb_build_object('request_id', v_ended_request_id)
      ),
      (
        'session_id',
        '{"session_id":"30100000-0000-4000-8000-000000000003"}'::jsonb
      ),
      ('notice_version', '{"notice_version":"ai.notice.changed"}'::jsonb),
      (
        'provider_policy_version',
        '{"provider_policy_version":"provider.lifecycle.changed"}'::jsonb
      )
    ) as case_row(case_name, overrides)
  loop
    v_case_count := v_case_count + 1;
    begin
      perform *
      from pg_temp.claw_b2a_replay_with_overrides(
        v_main_request_id,
        '30000000-0000-4000-8000-000000000003',
        v_overrides
      );
      raise exception using
        errcode = 'ZX003',
        message = 'claw_b2a_mismatch_matrix_unexpected_success';
    exception
      when others then
        get stacked diagnostics
          v_state = returned_sqlstate,
          v_message = message_text;
        if v_state = 'ZX003' then
          raise;
        end if;
        if v_state <> 'P0001'
          or v_message <> 'claw_append_consent_event_idempotency_mismatch'
        then
          raise exception
            'B2A mismatch case % returned [%] %',
            v_case,
            v_state,
            v_message;
        end if;
    end;
  end loop;

  -- Purpose and event type are tested against a non-AI grant so changing exactly one
  -- field remains a valid input. An AI grant couples purpose/event shape to its required
  -- nonnull provider policy, so those one-field changes would fail policy validation
  -- before reaching the immutable event receipt.
  perform pg_temp.claw_b2a_expect_error(
    '31000000-0000-4000-8000-000000000005',
    v_main_request_id,
    '30000000-0000-4000-8000-000000000003',
    'model_training',
    'grant',
    'analytics.notice.v3',
    null,
    'P0001',
    'claw_append_consent_event_idempotency_mismatch'
  );
  v_case_count := v_case_count + 1;

  perform pg_temp.claw_b2a_expect_error(
    '31000000-0000-4000-8000-000000000005',
    v_main_request_id,
    '30000000-0000-4000-8000-000000000003',
    'product_analytics',
    'withdraw',
    'analytics.notice.v3',
    null,
    'P0001',
    'claw_append_consent_event_idempotency_mismatch'
  );
  v_case_count := v_case_count + 1;

  if v_case_count <> 6 then
    raise exception 'B2A material mismatch case count was % instead of 6', v_case_count;
  end if;
end
$material_mismatch_matrix$;
reset role;

do $material_mismatch_atomicity$
begin
  if (select pg_catalog.count(*) from public.claw_request_consents)
      <> (select consent_count from claw_b2a_mismatch_before)
    or (select pg_catalog.count(*) from public.claw_request_events)
      <> (select audit_count from claw_b2a_mismatch_before)
  then
    raise exception 'B2A material mismatch matrix changed durable counts';
  end if;
end
$material_mismatch_atomicity$;

create temporary table claw_b2a_negative_before as
select
  (select pg_catalog.count(*) from public.claw_request_consents) as consent_count,
  (select pg_catalog.count(*) from public.claw_request_events) as audit_count;

set role service_role;
do $transition_and_validation_matrix$
declare
  v_main_request_id uuid := (select request_id from claw_b2a_main);
  v_ended_request_id uuid := (select request_id from claw_b2a_ended);
  v_deleted_request_id uuid := (select request_id from claw_b2a_deleted);
begin
  -- Redundant current-state transitions.
  perform pg_temp.claw_b2a_expect_error(
    '32000000-0000-4000-8000-000000000001', v_main_request_id,
    '30000000-0000-4000-8000-000000000003', 'ai_processing', 'grant',
    'ai.redundant.v1', 'provider.redundant.v1', '55000',
    'claw_append_consent_event_invalid_transition'
  );
  perform pg_temp.claw_b2a_expect_error(
    '32000000-0000-4000-8000-000000000002', v_ended_request_id,
    '30100000-0000-4000-8000-000000000003', 'ai_processing', 'withdraw',
    'ai.redundant.v2', null, '55000',
    'claw_append_consent_event_invalid_transition'
  );

  -- B1B owns the initial decline; B2A accepts only grant and withdraw.
  perform pg_temp.claw_b2a_expect_error(
    '32000000-0000-4000-8000-000000000003', v_main_request_id,
    '30000000-0000-4000-8000-000000000003', 'ai_processing', 'decline',
    'ai.decline.v1', null, '22023', 'claw_append_consent_event_invalid_input'
  );
  perform pg_temp.claw_b2a_expect_error(
    '32000000-0000-4000-8000-000000000004', v_main_request_id,
    '30000000-0000-4000-8000-000000000003', 'bundled_consent', 'withdraw',
    'invalid.purpose.v1', null, '22023', 'claw_append_consent_event_invalid_input'
  );

  -- Null UUIDs and required inputs are stable, content-free invalid-input failures.
  perform pg_temp.claw_b2a_expect_error(
    null, v_main_request_id, '30000000-0000-4000-8000-000000000003',
    'ai_processing', 'withdraw', 'null.event.v1', null,
    '22023', 'claw_append_consent_event_invalid_input'
  );
  perform pg_temp.claw_b2a_expect_error(
    '32000000-0000-4000-8000-000000000005', null,
    '30000000-0000-4000-8000-000000000003', 'ai_processing', 'withdraw',
    'null.request.v1', null, '22023', 'claw_append_consent_event_invalid_input'
  );
  perform pg_temp.claw_b2a_expect_error(
    '32000000-0000-4000-8000-000000000006', v_main_request_id, null,
    'ai_processing', 'withdraw', 'null.session.v1', null,
    '22023', 'claw_append_consent_event_invalid_input'
  );
  perform pg_temp.claw_b2a_expect_error(
    '32000000-0000-4000-8000-000000000007', v_main_request_id,
    '30000000-0000-4000-8000-000000000003', null, 'withdraw',
    'null.purpose.v1', null, '22023', 'claw_append_consent_event_invalid_input'
  );
  perform pg_temp.claw_b2a_expect_error(
    '32000000-0000-4000-8000-000000000008', v_main_request_id,
    '30000000-0000-4000-8000-000000000003', 'ai_processing', null,
    'null.type.v1', null, '22023', 'claw_append_consent_event_invalid_input'
  );
  perform pg_temp.claw_b2a_expect_error(
    '32000000-0000-4000-8000-000000000009', v_main_request_id,
    '30000000-0000-4000-8000-000000000003', 'ai_processing', 'withdraw',
    null, null, '22023', 'claw_append_consent_event_invalid_input'
  );

  -- AI/non-AI provider-policy applicability.
  perform pg_temp.claw_b2a_expect_error(
    '32100000-0000-4000-8000-000000000001', v_main_request_id,
    '30000000-0000-4000-8000-000000000003', 'ai_processing', 'grant',
    'ai.policy.v1', null, '22023', 'claw_append_consent_event_invalid_policy'
  );
  perform pg_temp.claw_b2a_expect_error(
    '32100000-0000-4000-8000-000000000002', v_main_request_id,
    '30000000-0000-4000-8000-000000000003', 'ai_processing', 'withdraw',
    'ai.policy.v2', 'provider.forbidden.v1', '22023',
    'claw_append_consent_event_invalid_policy'
  );
  perform pg_temp.claw_b2a_expect_error(
    '32100000-0000-4000-8000-000000000003', v_main_request_id,
    '30000000-0000-4000-8000-000000000003', 'product_analytics', 'grant',
    'analytics.policy.v1', 'provider.forbidden.v1', '22023',
    'claw_append_consent_event_invalid_policy'
  );
  perform pg_temp.claw_b2a_expect_error(
    '32100000-0000-4000-8000-000000000004', v_main_request_id,
    '30000000-0000-4000-8000-000000000003', 'product_analytics', 'withdraw',
    'analytics.policy.v2', 'provider.forbidden.v1', '22023',
    'claw_append_consent_event_invalid_policy'
  );
  perform pg_temp.claw_b2a_expect_error(
    '32100000-0000-4000-8000-000000000005', v_main_request_id,
    '30000000-0000-4000-8000-000000000003', 'model_training', 'grant',
    'training.policy.v1', 'provider.forbidden.v1', '22023',
    'claw_append_consent_event_invalid_policy'
  );
  perform pg_temp.claw_b2a_expect_error(
    '32100000-0000-4000-8000-000000000006', v_main_request_id,
    '30000000-0000-4000-8000-000000000003', 'model_training', 'withdraw',
    'training.policy.v2', 'provider.forbidden.v1', '22023',
    'claw_append_consent_event_invalid_policy'
  );

  -- Malformed, blank, and oversized canonical version tokens.
  perform pg_temp.claw_b2a_expect_error(
    '32200000-0000-4000-8000-000000000001', v_main_request_id,
    '30000000-0000-4000-8000-000000000003', 'ai_processing', 'withdraw',
    '   ', null, '22023', 'claw_append_consent_event_invalid_version'
  );
  perform pg_temp.claw_b2a_expect_error(
    '32200000-0000-4000-8000-000000000002', v_main_request_id,
    '30000000-0000-4000-8000-000000000003', 'ai_processing', 'withdraw',
    'bad version', null, '22023', 'claw_append_consent_event_invalid_version'
  );
  perform pg_temp.claw_b2a_expect_error(
    '32200000-0000-4000-8000-000000000003', v_main_request_id,
    '30000000-0000-4000-8000-000000000003', 'ai_processing', 'withdraw',
    pg_catalog.repeat('n', 65), null, '22023',
    'claw_append_consent_event_invalid_version'
  );
  perform pg_temp.claw_b2a_expect_error(
    '32200000-0000-4000-8000-000000000004', v_main_request_id,
    '30000000-0000-4000-8000-000000000003', 'ai_processing', 'grant',
    'ai.version.v1', '   ', '22023', 'claw_append_consent_event_invalid_version'
  );
  perform pg_temp.claw_b2a_expect_error(
    '32200000-0000-4000-8000-000000000005', v_main_request_id,
    '30000000-0000-4000-8000-000000000003', 'ai_processing', 'grant',
    'ai.version.v2', 'bad version', '22023',
    'claw_append_consent_event_invalid_version'
  );
  perform pg_temp.claw_b2a_expect_error(
    '32200000-0000-4000-8000-000000000006', v_main_request_id,
    '30000000-0000-4000-8000-000000000003', 'ai_processing', 'grant',
    'ai.version.v3', pg_catalog.repeat('p', 65), '22023',
    'claw_append_consent_event_invalid_version'
  );

  -- Live request, exact session, exact lineage, and cross-lineage UUID collision failures.
  perform pg_temp.claw_b2a_expect_error(
    '32300000-0000-4000-8000-000000000001',
    '39900000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000003', 'ai_processing', 'withdraw',
    'missing.request.v1', null, 'P0002',
    'claw_append_consent_event_request_unavailable'
  );
  perform pg_temp.claw_b2a_expect_error(
    '32300000-0000-4000-8000-000000000002', v_main_request_id,
    '39900000-0000-4000-8000-000000000002', 'ai_processing', 'withdraw',
    'missing.session.v1', null, 'P0002',
    'claw_append_consent_event_session_unavailable'
  );
  perform pg_temp.claw_b2a_expect_error(
    '32300000-0000-4000-8000-000000000003', v_main_request_id,
    '30100000-0000-4000-8000-000000000003', 'ai_processing', 'withdraw',
    'missing.lineage.v1', null, 'P0002',
    'claw_append_consent_event_lineage_unavailable'
  );
  perform pg_temp.claw_b2a_expect_error(
    '32300000-0000-4000-8000-000000000004', v_deleted_request_id,
    '30300000-0000-4000-8000-000000000003', 'ai_processing', 'withdraw',
    'deleted.request.v2', null, 'P0002',
    'claw_append_consent_event_request_unavailable'
  );
  perform pg_temp.claw_b2a_expect_error(
    '31000000-0000-4000-8000-000000000004', v_ended_request_id,
    '30100000-0000-4000-8000-000000000003', 'ai_processing', 'grant',
    'ai.notice.v3', 'provider.lifecycle.v2', 'P0001',
    'claw_append_consent_event_idempotency_mismatch'
  );
end
$transition_and_validation_matrix$;
reset role;

do $negative_atomicity_assertions$
begin
  if (select pg_catalog.count(*) from public.claw_request_consents)
      <> (select consent_count from claw_b2a_negative_before)
    or (select pg_catalog.count(*) from public.claw_request_events)
      <> (select audit_count from claw_b2a_negative_before)
  then
    raise exception 'B2A failed-call matrix changed consent or audit counts';
  end if;
end
$negative_atomicity_assertions$;

-- Exactly one content-free operational fact is written for each newly inserted withdraw,
-- and no grant/replay/failed call writes a withdrawal audit event.
do $audit_assertions$
declare
  v_expected_withdrawals uuid[] := array[
    '31000000-0000-4000-8000-000000000001'::uuid,
    '31000000-0000-4000-8000-000000000002'::uuid,
    '31000000-0000-4000-8000-000000000003'::uuid,
    '31100000-0000-4000-8000-000000000001'::uuid,
    '31200000-0000-4000-8000-000000000001'::uuid
  ];
begin
  if (select pg_catalog.count(*) from public.claw_request_events where event_type = 'consent_withdrawn') <> 5
    or exists (
      select 1
      from public.claw_request_events
      where event_type = 'consent_withdrawn'
        and (
          actor_type <> 'service_role'
          or actor_id is not null
          or previous_status is not null
          or new_status is not null
        )
    )
  then
    raise exception 'B2A withdrawal audit count or content-free shape mismatch';
  end if;

  if exists (
    select 1
    from public.claw_request_consents as consent
    where consent.id = any(v_expected_withdrawals)
      and (
        select pg_catalog.count(*)
        from public.claw_request_events as audit_event
        where audit_event.request_id = consent.request_id
          and audit_event.event_type = 'consent_withdrawn'
          and audit_event.created_at = consent.created_at
      ) <> 1
  ) then
    raise exception 'B2A new withdrawal did not receive exactly one same-timestamp audit';
  end if;

  if exists (
    select 1
    from public.claw_request_events as audit_event
    where audit_event.event_type = 'consent_withdrawn'
      and (
        select pg_catalog.count(*)
        from public.claw_request_consents as consent
        where consent.id = any(v_expected_withdrawals)
          and consent.request_id = audit_event.request_id
          and consent.created_at = audit_event.created_at
          and consent.event_type = 'withdraw'
      ) <> 1
  ) then
    raise exception 'B2A withdrawal audit does not map to exactly one new withdraw';
  end if;

  if exists (
    select 1
    from public.claw_request_events as audit_event
    join public.claw_request_consents as consent
      on consent.request_id = audit_event.request_id
     and consent.created_at = audit_event.created_at
    where audit_event.event_type = 'consent_withdrawn'
      and consent.event_type = 'grant'
      and consent.id in (
        '31000000-0000-4000-8000-000000000004',
        '31000000-0000-4000-8000-000000000005',
        '31000000-0000-4000-8000-000000000006'
      )
  ) then
    raise exception 'B2A grant created a withdrawal audit';
  end if;
end
$audit_assertions$;

-- Actual denied calls for PUBLIC-only, anon, and authenticated callers.
set role claw_b2a_public_probe;
select pg_temp.claw_b2a_expect_error(
  '39000000-0000-4000-8000-000000000001',
  '39000000-0000-4000-8000-000000000002',
  '39000000-0000-4000-8000-000000000003',
  'ai_processing', 'grant', 'acl.v1', 'provider.acl.v1',
  '42501', null
);
reset role;

set role anon;
select pg_temp.claw_b2a_expect_error(
  '39100000-0000-4000-8000-000000000001',
  '39100000-0000-4000-8000-000000000002',
  '39100000-0000-4000-8000-000000000003',
  'ai_processing', 'grant', 'acl.v1', 'provider.acl.v1',
  '42501', null
);
reset role;

set role authenticated;
select pg_temp.claw_b2a_expect_error(
  '39200000-0000-4000-8000-000000000001',
  '39200000-0000-4000-8000-000000000002',
  '39200000-0000-4000-8000-000000000003',
  'ai_processing', 'grant', 'acl.v1', 'provider.acl.v1',
  '42501', null
);
reset role;

-- These structural assertions intentionally run on every suite invocation. The harness
-- invokes this suite fresh, reapplies the exact B2A migration, and invokes it again.
do $reapply_assertions$
declare
  v_function_oid oid := 'public.claw_append_consent_event_v1(uuid,uuid,uuid,text,text,text,text)'::regprocedure::oid;
  v_service_role_oid oid := (select oid from pg_catalog.pg_roles where rolname = 'service_role');
begin
  if (
    select pg_catalog.count(*)
    from pg_catalog.pg_proc as procedure
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname = 'claw_append_consent_event_v1'
  ) <> 1 then
    raise exception 'B2A reapply left stale overloads';
  end if;

  if not pg_catalog.has_function_privilege('service_role', v_function_oid, 'EXECUTE')
    or pg_catalog.has_function_privilege('anon', v_function_oid, 'EXECUTE')
    or pg_catalog.has_function_privilege('authenticated', v_function_oid, 'EXECUTE')
    or exists (
      select 1
      from pg_catalog.pg_class as relation
      cross join lateral pg_catalog.aclexplode(relation.relacl) as acl
      where relation.oid = 'public.claw_request_consents'::pg_catalog.regclass
        and acl.grantee = v_service_role_oid
    )
    or pg_catalog.has_table_privilege('service_role', 'public.claw_request_consents', 'SELECT')
    or pg_catalog.has_table_privilege('service_role', 'public.claw_request_consents', 'INSERT')
    or pg_catalog.has_sequence_privilege(
      'service_role',
      'public.claw_request_consents_ledger_sequence_seq',
      'USAGE'
    )
  then
    raise exception 'B2A reapply ACL assertions failed';
  end if;
end
$reapply_assertions$;

rollback;

\echo 'Task B2A append-only consent lifecycle SQL assertions passed'
