\set ON_ERROR_STOP on

begin;

create function pg_temp.claw_test_event(
  p_event_id uuid,
  p_sequence integer,
  p_properties jsonb default '{"status":"accepted"}'::jsonb,
  p_event_name text default 'submission_accepted'
)
returns jsonb
language sql
immutable
as $test_event$
  select pg_catalog.jsonb_build_object(
    'event_id', p_event_id,
    'occurred_at', '2026-07-29T06:00:00Z'::timestamptz,
    'sequence', p_sequence,
    'event_name', p_event_name,
    'field_name', null,
    'duration_ms', null,
    'app_version', 'app.v1',
    'event_schema_version', 'event.v1',
    'properties', p_properties
  )
$test_event$;

create function pg_temp.claw_test_accept(
  p_idempotency_key uuid,
  p_correlation_id uuid,
  p_session_id uuid,
  p_ai_consent_id uuid,
  p_analytics_consent_id uuid,
  p_training_consent_id uuid,
  p_request text default 'Research a synthetic market and prepare an operator-ready brief.',
  p_analytics_granted boolean default true,
  p_product_events jsonb default '[]'::jsonb,
  p_environment text default 'test',
  p_is_canary boolean default false
)
returns table (
  request_id uuid,
  was_created boolean,
  accepted_at timestamptz,
  brief jsonb,
  notification_states jsonb
)
language sql
as $test_accept$
  select *
  from public.claw_accept_request_v1(
    p_idempotency_key,
    p_correlation_id,
    p_session_id,
    'Synthetic Customer',
    'synthetic@example.test',
    null,
    'Research and admin',
    p_request,
    null,
    'Four weeks',
    '{"summary":"Research a synthetic market.","objectives":[],"deliverables":[],"constraints":[],"success_criteria":[]}'::jsonb,
    'privacy.v1',
    'request.v1',
    '{}'::jsonb,
    p_environment,
    'session.v1',
    'app.v1',
    true,
    p_is_canary,
    false,
    p_ai_consent_id,
    false,
    'ai.v1',
    null,
    p_analytics_consent_id,
    p_analytics_granted,
    'analytics.v1',
    p_training_consent_id,
    false,
    'training.v1',
    p_product_events
  )
$test_accept$;

-- Dedicated valid baseline for one-input-at-a-time fingerprint coverage.
create function pg_temp.claw_test_fingerprint_accept(
  p_overrides jsonb default '{}'::jsonb
)
returns table (
  request_id uuid,
  was_created boolean,
  accepted_at timestamptz,
  brief jsonb,
  notification_states jsonb
)
language sql
as $fingerprint_accept$
  select *
  from public.claw_accept_request_v1(
    '20500000-0000-4000-8000-000000000001',
    coalesce(
      (p_overrides ->> 'correlation_id')::uuid,
      '20500000-0000-4000-8000-000000000002'
    ),
    coalesce(
      (p_overrides ->> 'session_id')::uuid,
      '20500000-0000-4000-8000-000000000003'
    ),
    coalesce(p_overrides ->> 'name', 'Synthetic Customer'),
    coalesce(p_overrides ->> 'email', 'synthetic@example.test'),
    case
      when p_overrides ? 'business_url' then p_overrides ->> 'business_url'
      else null
    end,
    coalesce(p_overrides ->> 'service', 'Research and admin'),
    coalesce(
      p_overrides ->> 'request',
      'Research a synthetic market and prepare an operator-ready brief.'
    ),
    case
      when p_overrides ? 'budget' then p_overrides ->> 'budget'
      else null
    end,
    coalesce(p_overrides ->> 'timeline', 'Four weeks'),
    coalesce(
      p_overrides -> 'brief',
      '{"summary":"Research a synthetic market.","objectives":[],"deliverables":[],"constraints":[],"success_criteria":[]}'::jsonb
    ),
    coalesce(p_overrides ->> 'privacy_notice_version', 'privacy.v1'),
    coalesce(p_overrides ->> 'request_schema_version', 'request.v1'),
    coalesce(p_overrides -> 'metadata', '{}'::jsonb),
    coalesce(p_overrides ->> 'environment', 'test'),
    coalesce(p_overrides ->> 'session_schema_version', 'session.v1'),
    coalesce(p_overrides ->> 'app_version', 'app.v1'),
    coalesce((p_overrides ->> 'is_synthetic')::boolean, true),
    coalesce((p_overrides ->> 'is_canary')::boolean, false),
    coalesce((p_overrides ->> 'is_employee_test')::boolean, false),
    coalesce(
      (p_overrides ->> 'ai_consent_id')::uuid,
      '20500000-0000-4000-8000-000000000004'
    ),
    coalesce((p_overrides ->> 'ai_granted')::boolean, true),
    coalesce(p_overrides ->> 'ai_notice_version', 'ai.v1'),
    case
      when p_overrides ? 'ai_provider_policy_version'
        then p_overrides ->> 'ai_provider_policy_version'
      else 'provider.v1'
    end,
    coalesce(
      (p_overrides ->> 'analytics_consent_id')::uuid,
      '20500000-0000-4000-8000-000000000005'
    ),
    coalesce((p_overrides ->> 'analytics_granted')::boolean, true),
    coalesce(p_overrides ->> 'analytics_notice_version', 'analytics.v1'),
    coalesce(
      (p_overrides ->> 'training_consent_id')::uuid,
      '20500000-0000-4000-8000-000000000006'
    ),
    coalesce((p_overrides ->> 'training_granted')::boolean, false),
    coalesce(p_overrides ->> 'training_notice_version', 'training.v1'),
    coalesce(p_overrides -> 'product_events', '[]'::jsonb)
  )
$fingerprint_accept$;

do $metadata_assertions$
declare
  v_function_oid oid := 'public.claw_accept_request_v1(uuid,uuid,uuid,text,text,text,text,text,text,text,jsonb,text,text,jsonb,text,text,text,boolean,boolean,boolean,uuid,boolean,text,text,uuid,boolean,text,uuid,boolean,text,jsonb)'::regprocedure::oid;
  v_overloads integer;
  v_public_execute boolean;
begin
  select pg_catalog.count(*)::integer
  into v_overloads
  from pg_catalog.pg_proc as procedure
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'public'
    and procedure.proname = 'claw_accept_request_v1';

  if v_overloads <> 1 then
    raise exception 'B1B expected exactly one function overload, found %', v_overloads;
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_proc as procedure
    where procedure.oid = v_function_oid
      and procedure.prosecdef
      and procedure.provolatile = 'v'
      and procedure.proconfig @> array[
        'search_path=pg_catalog',
        'TimeZone=UTC',
        'DateStyle=ISO, YMD'
      ]
      and pg_catalog.cardinality(procedure.proconfig) = 3
  ) then
    raise exception 'B1B function metadata mismatch';
  end if;

  select exists (
    select 1
    from pg_catalog.pg_proc as procedure
    cross join lateral pg_catalog.aclexplode(procedure.proacl) as acl
    where procedure.oid = v_function_oid
      and acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  )
  into v_public_execute;

  if v_public_execute
    or pg_catalog.has_function_privilege('anon', v_function_oid, 'EXECUTE')
    or pg_catalog.has_function_privilege('authenticated', v_function_oid, 'EXECUTE')
    or not pg_catalog.has_function_privilege('service_role', v_function_oid, 'EXECUTE')
  then
    raise exception 'B1B function ACL mismatch';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_class as relation
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = relation.relnamespace
    where namespace.nspname = 'private'
      and relation.relname = 'claw_request_acceptance_receipts'
      and relation.relrowsecurity
  ) then
    raise exception 'B1B private receipt table must have RLS enabled';
  end if;

  if pg_catalog.has_table_privilege(
    'service_role',
    'private.claw_request_acceptance_receipts',
    'SELECT,INSERT,UPDATE,DELETE'
  ) then
    raise exception 'B1B service_role must not have direct receipt access';
  end if;
end
$metadata_assertions$;

-- SECURITY DEFINER must supply consent identity sequence access. The caller does not
-- need direct sequence privilege for the RPC, even though B1A temporarily grants it.
revoke all on sequence public.claw_request_consents_ledger_sequence_seq from service_role;

set role service_role;
create temporary table claw_first_acceptance as
select *
from pg_temp.claw_test_accept(
  '20000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000002',
  '20000000-0000-4000-8000-000000000003',
  '20000000-0000-4000-8000-000000000004',
  '20000000-0000-4000-8000-000000000005',
  '20000000-0000-4000-8000-000000000006',
  p_product_events => pg_catalog.jsonb_build_array(
    pg_temp.claw_test_event('20000000-0000-4000-8000-000000000007', 1)
  )
);
reset role;

do $new_acceptance_assertions$
declare
  v_request_id uuid;
  v_created boolean;
  v_notifications jsonb;
begin
  select request_id, was_created, notification_states
  into v_request_id, v_created, v_notifications
  from claw_first_acceptance;

  if not v_created then
    raise exception 'B1B first acceptance must report created';
  end if;

  if v_notifications <> '[{"status":"pending","recipient_type":"customer"},{"status":"pending","recipient_type":"team"}]'::jsonb then
    raise exception 'B1B returned notification states mismatch: %', v_notifications;
  end if;

  if not exists (
    select 1
    from public.claw_requests as request_row
    where request_row.id = v_request_id
      and request_row.source = 'web'
      and request_row.status = 'new'
      and request_row.environment = 'test'
      and request_row.data_class = 'service_delivery_only'
      and request_row.is_synthetic
      and not request_row.is_canary
      and not request_row.is_employee_test
      and request_row.retention_expires_at = request_row.accepted_at + interval '24 months'
      and request_row.deletion_requested_at is null
      and request_row.deleted_at is null
  ) then
    raise exception 'B1B canonical request controls mismatch';
  end if;

  if (select pg_catalog.count(*) from public.claw_request_notifications where request_id = v_request_id) <> 2
    or (select pg_catalog.count(*) from public.claw_request_events where request_id = v_request_id and event_type = 'accepted') <> 1
    or (select pg_catalog.count(*) from public.claw_request_consents where request_id = v_request_id) <> 3
    or (select pg_catalog.count(*) from public.claw_request_product_events where request_id = v_request_id) <> 1
  then
    raise exception 'B1B exact artifact counts mismatch';
  end if;

  if not exists (
    select 1
    from private.claw_request_acceptance_receipts as receipt
    where receipt.idempotency_key = '20000000-0000-4000-8000-000000000001'
      and receipt.request_id = v_request_id
      and receipt.session_id = '20000000-0000-4000-8000-000000000003'
      and pg_catalog.octet_length(receipt.input_fingerprint) = 32
  ) then
    raise exception 'B1B private receipt mismatch';
  end if;

  if (select pg_catalog.count(distinct ledger_sequence) from public.claw_request_consents where request_id = v_request_id) <> 3
    or exists (
      select 1
      from public.claw_request_consents
      where request_id = v_request_id
        and (
          (consent_type = 'ai_processing' and (granted or event_type <> 'decline' or provider_policy_version is not null))
          or (consent_type = 'product_analytics' and (not granted or event_type <> 'grant'))
          or (consent_type = 'model_training' and (granted or event_type <> 'decline'))
        )
    )
  then
    raise exception 'B1B consent identity or purpose state mismatch';
  end if;
end
$new_acceptance_assertions$;

set role service_role;
create temporary table claw_exact_replay as
select *
from pg_temp.claw_test_accept(
  '20000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000002',
  '20000000-0000-4000-8000-000000000003',
  '20000000-0000-4000-8000-000000000004',
  '20000000-0000-4000-8000-000000000005',
  '20000000-0000-4000-8000-000000000006',
  p_product_events => pg_catalog.jsonb_build_array(
    pg_temp.claw_test_event('20000000-0000-4000-8000-000000000007', 1)
  )
);
reset role;

do $exact_replay_assertions$
begin
  if not exists (
    select 1
    from claw_exact_replay as replay
    join claw_first_acceptance as original using (request_id, accepted_at, brief, notification_states)
    where not replay.was_created
  ) then
    raise exception 'B1B exact replay receipt mismatch';
  end if;

  if (select pg_catalog.count(*) from public.claw_requests) <> 1
    or (select pg_catalog.count(*) from public.claw_request_notifications) <> 2
    or (select pg_catalog.count(*) from public.claw_request_events where event_type = 'accepted') <> 1
    or (select pg_catalog.count(*) from public.claw_request_consents) <> 3
    or (select pg_catalog.count(*) from public.claw_request_product_events) <> 1
  then
    raise exception 'B1B replay duplicated state';
  end if;
end
$exact_replay_assertions$;

-- Function-local GUCs make timestamp parsing and canonical fingerprint serialization
-- independent of the caller session. Both calls use the same explicit timestamp text.
set timezone = 'Pacific/Honolulu';
set datestyle = 'SQL, MDY';
set role service_role;
create temporary table claw_cross_guc_acceptance as
select *
from pg_temp.claw_test_accept(
  '20100000-0000-4000-8000-000000000001',
  '20100000-0000-4000-8000-000000000002',
  '20100000-0000-4000-8000-000000000003',
  '20100000-0000-4000-8000-000000000004',
  '20100000-0000-4000-8000-000000000005',
  '20100000-0000-4000-8000-000000000006',
  p_product_events => pg_catalog.jsonb_build_array(
    pg_temp.claw_test_event('20100000-0000-4000-8000-000000000007', 1)
      || pg_catalog.jsonb_build_object('occurred_at', '2026-07-29T06:00:00+00:00')
  )
);
reset role;

set timezone = 'Asia/Tokyo';
set datestyle = 'German, DMY';
set role service_role;
create temporary table claw_cross_guc_replay as
select *
from pg_temp.claw_test_accept(
  '20100000-0000-4000-8000-000000000001',
  '20100000-0000-4000-8000-000000000002',
  '20100000-0000-4000-8000-000000000003',
  '20100000-0000-4000-8000-000000000004',
  '20100000-0000-4000-8000-000000000005',
  '20100000-0000-4000-8000-000000000006',
  p_product_events => pg_catalog.jsonb_build_array(
    pg_temp.claw_test_event('20100000-0000-4000-8000-000000000007', 1)
      || pg_catalog.jsonb_build_object('occurred_at', '2026-07-29T06:00:00+00:00')
  )
);
reset role;
reset timezone;
reset datestyle;

do $cross_guc_replay_assertions$
begin
  if not exists (select 1 from claw_cross_guc_acceptance where was_created)
    or not exists (select 1 from claw_cross_guc_replay where not was_created)
    or (select request_id from claw_cross_guc_acceptance)
      <> (select request_id from claw_cross_guc_replay)
  then
    raise exception 'B1B cross-GUC canonical replay mismatch';
  end if;
end
$cross_guc_replay_assertions$;

-- Every material top-level input is independently represented in replay behavior.
-- Session-bound provenance fails at the earlier exact-session guard; other valid changes
-- reach the private receipt and fail with the bounded idempotency mismatch. AI grant and
-- provider policy are one constrained state pair, so that valid transition changes both.
set role service_role;
create temporary table claw_fingerprint_baseline as
select * from pg_temp.claw_test_fingerprint_accept();
reset role;

do $fingerprint_baseline_assertions$
begin
  if not exists (select 1 from claw_fingerprint_baseline where was_created) then
    raise exception 'B1B fingerprint baseline must report created';
  end if;
end
$fingerprint_baseline_assertions$;

do $exhaustive_mismatch_assertions$
declare
  v_case text;
  v_overrides jsonb;
  v_expected_message text;
  v_case_count integer := 0;
  v_requests_before bigint := (select pg_catalog.count(*) from public.claw_requests);
  v_sessions_before bigint := (select pg_catalog.count(*) from public.claw_request_sessions);
  v_notifications_before bigint := (select pg_catalog.count(*) from public.claw_request_notifications);
  v_operational_events_before bigint := (select pg_catalog.count(*) from public.claw_request_events);
  v_consents_before bigint := (select pg_catalog.count(*) from public.claw_request_consents);
  v_product_events_before bigint := (select pg_catalog.count(*) from public.claw_request_product_events);
  v_receipts_before bigint := (select pg_catalog.count(*) from private.claw_request_acceptance_receipts);
begin
  for v_case, v_overrides, v_expected_message in
    select case_row.case_name, case_row.overrides, case_row.expected_message
    from (values
      ('correlation_id', '{"correlation_id":"20500000-0000-4000-8000-000000000012"}'::jsonb, 'claw_accept_request_idempotency_mismatch'),
      ('session_id', '{"session_id":"20500000-0000-4000-8000-000000000013"}'::jsonb, 'claw_accept_request_idempotency_mismatch'),
      ('name', '{"name":"Changed Synthetic Customer"}'::jsonb, 'claw_accept_request_idempotency_mismatch'),
      ('email', '{"email":"changed@example.test"}'::jsonb, 'claw_accept_request_idempotency_mismatch'),
      ('business_url', '{"business_url":"https://changed.example.test"}'::jsonb, 'claw_accept_request_idempotency_mismatch'),
      ('service', '{"service":"Content and design"}'::jsonb, 'claw_accept_request_idempotency_mismatch'),
      ('request', '{"request":"Prepare a materially changed synthetic operator brief."}'::jsonb, 'claw_accept_request_idempotency_mismatch'),
      ('budget', '{"budget":"Synthetic budget tier"}'::jsonb, 'claw_accept_request_idempotency_mismatch'),
      ('timeline', '{"timeline":"Six weeks"}'::jsonb, 'claw_accept_request_idempotency_mismatch'),
      ('brief', '{"brief":{"summary":"Changed synthetic summary.","objectives":[],"deliverables":[],"constraints":[],"success_criteria":[]}}'::jsonb, 'claw_accept_request_idempotency_mismatch'),
      ('privacy_notice_version', '{"privacy_notice_version":"privacy.v2"}'::jsonb, 'claw_accept_request_idempotency_mismatch'),
      ('request_schema_version', '{"request_schema_version":"request.v2"}'::jsonb, 'claw_accept_request_idempotency_mismatch'),
      ('metadata', '{"metadata":{"locale":"en-US"}}'::jsonb, 'claw_accept_request_idempotency_mismatch'),
      ('environment', '{"environment":"preview"}'::jsonb, 'claw_accept_request_session_mismatch'),
      ('session_schema_version', '{"session_schema_version":"session.v2"}'::jsonb, 'claw_accept_request_session_mismatch'),
      ('app_version', '{"app_version":"app.v2"}'::jsonb, 'claw_accept_request_session_mismatch'),
      ('is_synthetic', '{"is_synthetic":false}'::jsonb, 'claw_accept_request_session_mismatch'),
      ('is_canary', '{"is_canary":true}'::jsonb, 'claw_accept_request_session_mismatch'),
      ('is_employee_test', '{"is_employee_test":true}'::jsonb, 'claw_accept_request_session_mismatch'),
      ('ai_consent_id', '{"ai_consent_id":"20500000-0000-4000-8000-000000000014"}'::jsonb, 'claw_accept_request_idempotency_mismatch'),
      ('ai_consent_state', '{"ai_granted":false,"ai_provider_policy_version":null}'::jsonb, 'claw_accept_request_idempotency_mismatch'),
      ('ai_notice_version', '{"ai_notice_version":"ai.v2"}'::jsonb, 'claw_accept_request_idempotency_mismatch'),
      ('ai_provider_policy_version', '{"ai_provider_policy_version":"provider.v2"}'::jsonb, 'claw_accept_request_idempotency_mismatch'),
      ('analytics_consent_id', '{"analytics_consent_id":"20500000-0000-4000-8000-000000000015"}'::jsonb, 'claw_accept_request_idempotency_mismatch'),
      ('analytics_granted', '{"analytics_granted":false}'::jsonb, 'claw_accept_request_idempotency_mismatch'),
      ('analytics_notice_version', '{"analytics_notice_version":"analytics.v2"}'::jsonb, 'claw_accept_request_idempotency_mismatch'),
      ('training_consent_id', '{"training_consent_id":"20500000-0000-4000-8000-000000000016"}'::jsonb, 'claw_accept_request_idempotency_mismatch'),
      ('training_granted', '{"training_granted":true}'::jsonb, 'claw_accept_request_idempotency_mismatch'),
      ('training_notice_version', '{"training_notice_version":"training.v2"}'::jsonb, 'claw_accept_request_idempotency_mismatch')
    ) as case_row(case_name, overrides, expected_message)
    union all
    select
      'product_events',
      pg_catalog.jsonb_build_object(
        'product_events',
        pg_catalog.jsonb_build_array(
          pg_temp.claw_test_event('20500000-0000-4000-8000-000000000017', 1)
        )
      ),
      'claw_accept_request_idempotency_mismatch'
  loop
    v_case_count := v_case_count + 1;

    begin
      perform * from pg_temp.claw_test_fingerprint_accept(v_overrides);
      raise exception 'B1B expected mismatch for case %', v_case;
    exception when others then
      if sqlerrm <> v_expected_message then
        raise exception
          'B1B mismatch case % returned % instead of %',
          v_case,
          sqlerrm,
          v_expected_message;
      end if;
    end;
  end loop;

  if v_case_count <> 30 then
    raise exception 'B1B exhaustive mismatch case count mismatch: %', v_case_count;
  end if;

  if (select pg_catalog.count(*) from public.claw_requests) <> v_requests_before
    or (select pg_catalog.count(*) from public.claw_request_sessions) <> v_sessions_before
    or (select pg_catalog.count(*) from public.claw_request_notifications) <> v_notifications_before
    or (select pg_catalog.count(*) from public.claw_request_events) <> v_operational_events_before
    or (select pg_catalog.count(*) from public.claw_request_consents) <> v_consents_before
    or (select pg_catalog.count(*) from public.claw_request_product_events) <> v_product_events_before
    or (select pg_catalog.count(*) from private.claw_request_acceptance_receipts) <> v_receipts_before
  then
    raise exception 'B1B mismatch cases changed durable row counts';
  end if;
end
$exhaustive_mismatch_assertions$;

-- Event array order is not material; canonical sequence and UUID ordering is.
set role service_role;
create temporary table claw_ordered_acceptance as
select *
from pg_temp.claw_test_accept(
  '21000000-0000-4000-8000-000000000001',
  '21000000-0000-4000-8000-000000000002',
  '21000000-0000-4000-8000-000000000003',
  '21000000-0000-4000-8000-000000000004',
  '21000000-0000-4000-8000-000000000005',
  '21000000-0000-4000-8000-000000000006',
  p_product_events => pg_catalog.jsonb_build_array(
    pg_temp.claw_test_event('21000000-0000-4000-8000-000000000007', 1, '{}'::jsonb, 'assistant_opened'),
    pg_temp.claw_test_event('21000000-0000-4000-8000-000000000008', 2)
  )
);
create temporary table claw_reordered_replay as
select *
from pg_temp.claw_test_accept(
  '21000000-0000-4000-8000-000000000001',
  '21000000-0000-4000-8000-000000000002',
  '21000000-0000-4000-8000-000000000003',
  '21000000-0000-4000-8000-000000000004',
  '21000000-0000-4000-8000-000000000005',
  '21000000-0000-4000-8000-000000000006',
  p_product_events => pg_catalog.jsonb_build_array(
    pg_temp.claw_test_event('21000000-0000-4000-8000-000000000008', 2),
    pg_temp.claw_test_event('21000000-0000-4000-8000-000000000007', 1, '{}'::jsonb, 'assistant_opened')
  )
);
reset role;

do $ordered_replay_assertions$
begin
  if not exists (select 1 from claw_ordered_acceptance where was_created)
    or not exists (select 1 from claw_reordered_replay where not was_created)
    or (select request_id from claw_ordered_acceptance) <> (select request_id from claw_reordered_replay)
  then
    raise exception 'B1B canonical event ordering replay mismatch';
  end if;
end
$ordered_replay_assertions$;

-- Analytics decline with an empty batch is durable and inserts no product events.
set role service_role;
create temporary table claw_analytics_decline as
select *
from pg_temp.claw_test_accept(
  '22000000-0000-4000-8000-000000000001',
  '22000000-0000-4000-8000-000000000002',
  '22000000-0000-4000-8000-000000000003',
  '22000000-0000-4000-8000-000000000004',
  '22000000-0000-4000-8000-000000000005',
  '22000000-0000-4000-8000-000000000006',
  p_analytics_granted => false,
  p_product_events => '[]'::jsonb
);
reset role;

do $analytics_decline_assertions$
declare
  v_request_id uuid := (select request_id from claw_analytics_decline);
begin
  if not exists (select 1 from claw_analytics_decline where was_created)
    or exists (select 1 from public.claw_request_product_events where request_id = v_request_id)
    or not exists (
      select 1
      from public.claw_request_consents
      where request_id = v_request_id
        and consent_type = 'product_analytics'
        and not granted
        and event_type = 'decline'
    )
  then
    raise exception 'B1B analytics decline state mismatch';
  end if;
end
$analytics_decline_assertions$;

-- Invalid telemetry must fail before or atomically roll back every row.
do $invalid_telemetry_assertions$
declare
  v_requests_before bigint := (select pg_catalog.count(*) from public.claw_requests);
  v_sessions_before bigint := (select pg_catalog.count(*) from public.claw_request_sessions);
  v_consents_before bigint := (select pg_catalog.count(*) from public.claw_request_consents);
  v_notifications_before bigint := (select pg_catalog.count(*) from public.claw_request_notifications);
  v_operational_events_before bigint := (select pg_catalog.count(*) from public.claw_request_events);
  v_events_before bigint := (select pg_catalog.count(*) from public.claw_request_product_events);
  v_receipts_before bigint := (select pg_catalog.count(*) from private.claw_request_acceptance_receipts);
begin
  begin
    perform *
    from pg_temp.claw_test_accept(
      '23000000-0000-4000-8000-000000000001',
      '23000000-0000-4000-8000-000000000002',
      '23000000-0000-4000-8000-000000000003',
      '23000000-0000-4000-8000-000000000004',
      '23000000-0000-4000-8000-000000000005',
      '23000000-0000-4000-8000-000000000006',
      p_analytics_granted => false,
      p_product_events => pg_catalog.jsonb_build_array(
        pg_temp.claw_test_event('23000000-0000-4000-8000-000000000007', 1)
      )
    );
    raise exception 'B1B expected analytics consent rejection';
  exception when others then
    if sqlerrm <> 'claw_accept_request_analytics_consent_required' then raise; end if;
  end;

  begin
    perform *
    from pg_temp.claw_test_accept(
      '23100000-0000-4000-8000-000000000001',
      '23100000-0000-4000-8000-000000000002',
      '23100000-0000-4000-8000-000000000003',
      '23100000-0000-4000-8000-000000000004',
      '23100000-0000-4000-8000-000000000005',
      '23100000-0000-4000-8000-000000000006',
      p_product_events => pg_catalog.jsonb_build_array(
        pg_temp.claw_test_event('23100000-0000-4000-8000-000000000007', 1)
        || '{"raw_text":"forbidden"}'::jsonb
      )
    );
    raise exception 'B1B expected unknown-key rejection';
  exception when others then
    if sqlerrm <> 'claw_accept_request_invalid_telemetry_shape' then raise; end if;
  end;

  begin
    perform *
    from pg_temp.claw_test_accept(
      '23200000-0000-4000-8000-000000000001',
      '23200000-0000-4000-8000-000000000002',
      '23200000-0000-4000-8000-000000000003',
      '23200000-0000-4000-8000-000000000004',
      '23200000-0000-4000-8000-000000000005',
      '23200000-0000-4000-8000-000000000006',
      p_product_events => pg_catalog.jsonb_build_array(
        pg_temp.claw_test_event(
          '23200000-0000-4000-8000-000000000007',
          1,
          '{"request":"forbidden content channel"}'::jsonb
        )
      )
    );
    raise exception 'B1B expected content-property rejection';
  exception when others then
    if sqlerrm <> 'claw_accept_request_invalid_artifact' then raise; end if;
  end;

  begin
    perform *
    from pg_temp.claw_test_accept(
      '23300000-0000-4000-8000-000000000001',
      '23300000-0000-4000-8000-000000000002',
      '23300000-0000-4000-8000-000000000003',
      '23300000-0000-4000-8000-000000000004',
      '23300000-0000-4000-8000-000000000005',
      '23300000-0000-4000-8000-000000000006',
      p_product_events => pg_catalog.jsonb_build_array(
        pg_temp.claw_test_event('23300000-0000-4000-8000-000000000007', 1),
        pg_temp.claw_test_event('23300000-0000-4000-8000-000000000008', 1)
      )
    );
    raise exception 'B1B expected duplicate-sequence rejection';
  exception when others then
    if sqlerrm <> 'claw_accept_request_duplicate_telemetry' then raise; end if;
  end;

  begin
    perform *
    from pg_temp.claw_test_accept(
      '23400000-0000-4000-8000-000000000001',
      '23400000-0000-4000-8000-000000000002',
      '23400000-0000-4000-8000-000000000003',
      '23400000-0000-4000-8000-000000000004',
      '23400000-0000-4000-8000-000000000005',
      '23400000-0000-4000-8000-000000000006',
      p_product_events => pg_catalog.jsonb_build_array(
        pg_temp.claw_test_event('23400000-0000-4000-8000-000000000007', 1)
          || pg_catalog.jsonb_build_object(
            'occurred_at',
            'caller-controlled-invalid-time-value'
          )
      )
    );
    raise exception 'B1B expected malformed-timestamp rejection';
  exception when others then
    if sqlerrm <> 'claw_accept_request_invalid_telemetry_value' then raise; end if;
  end;

  if (select pg_catalog.count(*) from public.claw_requests) <> v_requests_before
    or (select pg_catalog.count(*) from public.claw_request_sessions) <> v_sessions_before
    or (select pg_catalog.count(*) from public.claw_request_consents) <> v_consents_before
    or (select pg_catalog.count(*) from public.claw_request_notifications) <> v_notifications_before
    or (select pg_catalog.count(*) from public.claw_request_events) <> v_operational_events_before
    or (select pg_catalog.count(*) from public.claw_request_product_events) <> v_events_before
    or (select pg_catalog.count(*) from private.claw_request_acceptance_receipts) <> v_receipts_before
  then
    raise exception 'B1B invalid telemetry left partial state';
  end if;
end
$invalid_telemetry_assertions$;

-- Caller UUID collisions and session-sequence collisions are bounded and atomic.
do $collision_assertions$
declare
  v_requests_before bigint := (select pg_catalog.count(*) from public.claw_requests);
  v_sessions_before bigint := (select pg_catalog.count(*) from public.claw_request_sessions);
  v_consents_before bigint := (select pg_catalog.count(*) from public.claw_request_consents);
begin
  begin
    perform *
    from pg_temp.claw_test_accept(
      '24000000-0000-4000-8000-000000000001',
      '24000000-0000-4000-8000-000000000002',
      '24000000-0000-4000-8000-000000000003',
      '20000000-0000-4000-8000-000000000004',
      '24000000-0000-4000-8000-000000000005',
      '24000000-0000-4000-8000-000000000006',
      p_product_events => '[]'::jsonb
    );
    raise exception 'B1B expected consent UUID collision';
  exception when others then
    if sqlerrm <> 'claw_accept_request_artifact_conflict' then raise; end if;
  end;

  begin
    perform *
    from pg_temp.claw_test_accept(
      '24100000-0000-4000-8000-000000000001',
      '24100000-0000-4000-8000-000000000002',
      '20000000-0000-4000-8000-000000000003',
      '24100000-0000-4000-8000-000000000004',
      '24100000-0000-4000-8000-000000000005',
      '24100000-0000-4000-8000-000000000006',
      p_product_events => pg_catalog.jsonb_build_array(
        pg_temp.claw_test_event('24100000-0000-4000-8000-000000000007', 1)
      )
    );
    raise exception 'B1B expected session sequence collision';
  exception when others then
    if sqlerrm <> 'claw_accept_request_artifact_conflict' then raise; end if;
  end;

  if (select pg_catalog.count(*) from public.claw_requests) <> v_requests_before
    or (select pg_catalog.count(*) from public.claw_request_sessions) <> v_sessions_before
    or (select pg_catalog.count(*) from public.claw_request_consents) <> v_consents_before
  then
    raise exception 'B1B collision left partial state';
  end if;
end
$collision_assertions$;

-- Existing sessions are exact provenance objects. Reclassification is rejected. A later
-- legitimate ended_at does not break replay, but cannot accept a new request.
update public.claw_request_sessions
set ended_at = pg_catalog.statement_timestamp()
where id = '20000000-0000-4000-8000-000000000003';

set role service_role;
create temporary table claw_ended_session_replay as
select *
from pg_temp.claw_test_accept(
  '20000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000002',
  '20000000-0000-4000-8000-000000000003',
  '20000000-0000-4000-8000-000000000004',
  '20000000-0000-4000-8000-000000000005',
  '20000000-0000-4000-8000-000000000006',
  p_product_events => pg_catalog.jsonb_build_array(
    pg_temp.claw_test_event('20000000-0000-4000-8000-000000000007', 1)
  )
);
reset role;

do $session_lifecycle_assertions$
declare
  v_requests_before bigint := (select pg_catalog.count(*) from public.claw_requests);
begin
  if not exists (select 1 from claw_ended_session_replay where not was_created) then
    raise exception 'B1B ended-session exact replay must return the receipt';
  end if;

  begin
    perform *
    from pg_temp.claw_test_accept(
      '25000000-0000-4000-8000-000000000001',
      '25000000-0000-4000-8000-000000000002',
      '20000000-0000-4000-8000-000000000003',
      '25000000-0000-4000-8000-000000000004',
      '25000000-0000-4000-8000-000000000005',
      '25000000-0000-4000-8000-000000000006'
    );
    raise exception 'B1B expected ended-session rejection';
  exception when others then
    if sqlerrm <> 'claw_accept_request_session_ended' then raise; end if;
  end;

  begin
    perform *
    from pg_temp.claw_test_accept(
      '25100000-0000-4000-8000-000000000001',
      '25100000-0000-4000-8000-000000000002',
      '20000000-0000-4000-8000-000000000003',
      '25100000-0000-4000-8000-000000000004',
      '25100000-0000-4000-8000-000000000005',
      '25100000-0000-4000-8000-000000000006',
      p_environment => 'preview'
    );
    raise exception 'B1B expected session reclassification rejection';
  exception when others then
    if sqlerrm <> 'claw_accept_request_session_mismatch' then raise; end if;
  end;

  if (select pg_catalog.count(*) from public.claw_requests) <> v_requests_before then
    raise exception 'B1B session rejection left a request';
  end if;
end
$session_lifecycle_assertions$;

-- Actual execution denial, not only catalog ACL inspection.
set role anon;
do $anon_execute_denial$
begin
  begin
    perform *
    from pg_temp.claw_test_accept(
      '26000000-0000-4000-8000-000000000001',
      '26000000-0000-4000-8000-000000000002',
      '26000000-0000-4000-8000-000000000003',
      '26000000-0000-4000-8000-000000000004',
      '26000000-0000-4000-8000-000000000005',
      '26000000-0000-4000-8000-000000000006'
    );
    raise exception 'B1B anon execution unexpectedly succeeded';
  exception when insufficient_privilege then
    null;
  end;
end
$anon_execute_denial$;
reset role;

set role authenticated;
do $authenticated_execute_denial$
begin
  begin
    perform *
    from pg_temp.claw_test_accept(
      '26100000-0000-4000-8000-000000000001',
      '26100000-0000-4000-8000-000000000002',
      '26100000-0000-4000-8000-000000000003',
      '26100000-0000-4000-8000-000000000004',
      '26100000-0000-4000-8000-000000000005',
      '26100000-0000-4000-8000-000000000006'
    );
    raise exception 'B1B authenticated execution unexpectedly succeeded';
  exception when insufficient_privilege then
    null;
  end;
end
$authenticated_execute_denial$;
reset role;

rollback;

\echo 'Task B1B atomic acceptance SQL assertions passed'
