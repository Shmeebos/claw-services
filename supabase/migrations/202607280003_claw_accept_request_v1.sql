-- Claw request atomic acceptance RPC (Task B1B, LOCAL-ONLY).
--
-- This migration composes the approved Task A operational tables and B1A governance
-- tables into one idempotent acceptance transaction. Browser roles receive no table or
-- function access. The function stores no prompt, transcript, provider body, arbitrary
-- headers, network identifiers, or hidden reasoning.
--
-- TEMPORARY LOCAL-ONLY: existing direct service_role table/sequence grants remain a
-- remote blocker until the later notification, withdrawal, deletion, and telemetry
-- lifecycle RPCs exist and every direct INSERT grant can be revoked together.

begin;

create table if not exists private.claw_request_acceptance_receipts (
  idempotency_key uuid primary key,
  request_id uuid not null unique,
  session_id uuid not null,
  input_fingerprint bytea not null,
  created_at timestamptz not null default now(),

  constraint claw_request_acceptance_receipts_fingerprint_check
    check (octet_length(input_fingerprint) = 32)
);

comment on table private.claw_request_acceptance_receipts is
  'Private immutable idempotency receipt. The SHA-256 fingerprint includes random UUID provenance and canonical bounded input, but stores no request content or consent payload.';
comment on column private.claw_request_acceptance_receipts.input_fingerprint is
  'A 32-byte canonical acceptance fingerprint used only to reject mismatched replays. It is never exposed through API roles.';

alter table private.claw_request_acceptance_receipts enable row level security;
revoke all on table private.claw_request_acceptance_receipts
  from public, anon, authenticated, service_role;

-- Remove every stale overload without CASCADE. A changed signature must never leave an
-- older executable function behind. Any real dependency fails this migration closed.
do $drop_old_acceptance_overloads$
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
      and procedure.proname = 'claw_accept_request_v1'
  loop
    execute pg_catalog.format(
      'drop function %I.%I(%s)',
      function_row.schema_name,
      function_row.function_name,
      function_row.identity_arguments
    );
  end loop;
end
$drop_old_acceptance_overloads$;

create function public.claw_accept_request_v1(
  p_idempotency_key uuid,
  p_correlation_id uuid,
  p_session_id uuid,
  p_name text,
  p_email text,
  p_business_url text,
  p_service text,
  p_request text,
  p_budget text,
  p_timeline text,
  p_brief jsonb,
  p_privacy_notice_version text,
  p_request_schema_version text,
  p_metadata jsonb,
  p_environment text,
  p_session_schema_version text,
  p_app_version text,
  p_is_synthetic boolean,
  p_is_canary boolean,
  p_is_employee_test boolean,
  p_ai_consent_id uuid,
  p_ai_granted boolean,
  p_ai_notice_version text,
  p_ai_provider_policy_version text,
  p_analytics_consent_id uuid,
  p_analytics_granted boolean,
  p_analytics_notice_version text,
  p_training_consent_id uuid,
  p_training_granted boolean,
  p_training_notice_version text,
  p_product_events jsonb
)
returns table (
  request_id uuid,
  was_created boolean,
  accepted_at timestamptz,
  brief jsonb,
  notification_states jsonb
)
language plpgsql
security definer
set search_path = pg_catalog
set timezone = 'UTC'
set datestyle = 'ISO, YMD'
as $claw_accept_request_v1$
declare
  v_now timestamptz := pg_catalog.statement_timestamp();
  v_name text := pg_catalog.btrim(p_name);
  v_email text := pg_catalog.btrim(p_email);
  v_business_url text := nullif(pg_catalog.btrim(p_business_url), '');
  v_service text := pg_catalog.btrim(p_service);
  v_request_text text := pg_catalog.btrim(p_request);
  v_budget text := nullif(pg_catalog.btrim(p_budget), '');
  v_timeline text := nullif(pg_catalog.btrim(p_timeline), '');
  v_privacy_notice_version text := pg_catalog.btrim(p_privacy_notice_version);
  v_request_schema_version text := pg_catalog.btrim(p_request_schema_version);
  v_environment text := pg_catalog.btrim(p_environment);
  v_session_schema_version text := pg_catalog.btrim(p_session_schema_version);
  v_app_version text := pg_catalog.btrim(p_app_version);
  v_ai_notice_version text := pg_catalog.btrim(p_ai_notice_version);
  v_ai_provider_policy_version text := nullif(pg_catalog.btrim(p_ai_provider_policy_version), '');
  v_analytics_notice_version text := pg_catalog.btrim(p_analytics_notice_version);
  v_training_notice_version text := pg_catalog.btrim(p_training_notice_version);
  v_canonical_events jsonb := '[]'::jsonb;
  v_item jsonb;
  v_canonical_item jsonb;
  v_event_id uuid;
  v_event_occurred_at timestamptz;
  v_event_sequence integer;
  v_event_name text;
  v_event_field_name text;
  v_event_duration_ms integer;
  v_event_app_version text;
  v_event_schema_version text;
  v_event_properties jsonb;
  v_event_count integer;
  v_distinct_event_ids integer;
  v_distinct_sequences integer;
  v_input_fingerprint bytea;
  v_candidate_request_id uuid := pg_catalog.gen_random_uuid();
  v_request_row public.claw_requests%rowtype;
  v_session_row public.claw_request_sessions%rowtype;
  v_receipt_row private.claw_request_acceptance_receipts%rowtype;
  v_was_created boolean := false;
  v_count integer;
begin
  if p_idempotency_key is null
    or p_correlation_id is null
    or p_session_id is null
    or p_ai_consent_id is null
    or p_analytics_consent_id is null
    or p_training_consent_id is null
  then
    raise exception using
      errcode = '22023',
      message = 'claw_accept_request_missing_uuid';
  end if;

  if p_ai_consent_id = p_analytics_consent_id
    or p_ai_consent_id = p_training_consent_id
    or p_analytics_consent_id = p_training_consent_id
  then
    raise exception using
      errcode = '22023',
      message = 'claw_accept_request_duplicate_consent_id';
  end if;

  if p_is_synthetic is null
    or p_is_canary is null
    or p_is_employee_test is null
    or p_ai_granted is null
    or p_analytics_granted is null
    or p_training_granted is null
  then
    raise exception using
      errcode = '22023',
      message = 'claw_accept_request_missing_boolean';
  end if;

  if v_environment not in ('unknown', 'production', 'preview', 'development', 'test') then
    raise exception using
      errcode = '22023',
      message = 'claw_accept_request_invalid_environment';
  end if;

  if p_ai_granted and v_ai_provider_policy_version is null then
    raise exception using
      errcode = '22023',
      message = 'claw_accept_request_ai_policy_required';
  end if;

  if not p_ai_granted and v_ai_provider_policy_version is not null then
    raise exception using
      errcode = '22023',
      message = 'claw_accept_request_ai_policy_not_applicable';
  end if;

  if p_brief is null
    or p_metadata is null
    or p_product_events is null
    or pg_catalog.jsonb_typeof(p_brief) <> 'object'
    or pg_catalog.jsonb_typeof(p_metadata) <> 'object'
    or pg_catalog.jsonb_typeof(p_product_events) <> 'array'
  then
    raise exception using
      errcode = '22023',
      message = 'claw_accept_request_invalid_json_shape';
  end if;

  if pg_catalog.octet_length(p_product_events::text) > 32768
    or pg_catalog.jsonb_array_length(p_product_events) > 50
  then
    raise exception using
      errcode = '22023',
      message = 'claw_accept_request_telemetry_too_large';
  end if;

  if not p_analytics_granted
    and pg_catalog.jsonb_array_length(p_product_events) > 0
  then
    raise exception using
      errcode = '22023',
      message = 'claw_accept_request_analytics_consent_required';
  end if;

  for v_item in
    select event_item.value
    from pg_catalog.jsonb_array_elements(p_product_events) as event_item(value)
  loop
    if pg_catalog.jsonb_typeof(v_item) <> 'object'
      or v_item - array[
        'event_id',
        'occurred_at',
        'sequence',
        'event_name',
        'field_name',
        'duration_ms',
        'app_version',
        'event_schema_version',
        'properties'
      ] <> '{}'::jsonb
      or not (v_item ?& array[
        'event_id',
        'occurred_at',
        'sequence',
        'event_name',
        'field_name',
        'duration_ms',
        'app_version',
        'event_schema_version',
        'properties'
      ])
      or pg_catalog.jsonb_typeof(v_item -> 'event_id') <> 'string'
      or pg_catalog.jsonb_typeof(v_item -> 'occurred_at') <> 'string'
      or pg_catalog.jsonb_typeof(v_item -> 'sequence') <> 'number'
      or pg_catalog.jsonb_typeof(v_item -> 'event_name') <> 'string'
      or pg_catalog.jsonb_typeof(v_item -> 'field_name') not in ('string', 'null')
      or pg_catalog.jsonb_typeof(v_item -> 'duration_ms') not in ('number', 'null')
      or pg_catalog.jsonb_typeof(v_item -> 'app_version') <> 'string'
      or pg_catalog.jsonb_typeof(v_item -> 'event_schema_version') <> 'string'
      or pg_catalog.jsonb_typeof(v_item -> 'properties') <> 'object'
      or (v_item ->> 'sequence') !~ '^[0-9]{1,7}$'
      or (
        pg_catalog.jsonb_typeof(v_item -> 'duration_ms') = 'number'
        and (v_item ->> 'duration_ms') !~ '^[0-9]{1,7}$'
      )
    then
      raise exception using
        errcode = '22023',
        message = 'claw_accept_request_invalid_telemetry_shape';
    end if;

    begin
      v_event_id := (v_item ->> 'event_id')::uuid;
      v_event_occurred_at := (v_item ->> 'occurred_at')::timestamptz;
      v_event_sequence := (v_item ->> 'sequence')::integer;
      v_event_name := v_item ->> 'event_name';
      v_event_field_name := v_item ->> 'field_name';
      v_event_duration_ms := (v_item ->> 'duration_ms')::integer;
      v_event_app_version := v_item ->> 'app_version';
      v_event_schema_version := v_item ->> 'event_schema_version';
      v_event_properties := v_item -> 'properties';
    exception
      when data_exception then
        raise exception using
          errcode = '22023',
          message = 'claw_accept_request_invalid_telemetry_value';
    end;

    if v_event_occurred_at > v_now + interval '5 minutes' then
      raise exception using
        errcode = '22023',
        message = 'claw_accept_request_future_telemetry';
    end if;

    if v_event_app_version is distinct from v_app_version then
      raise exception using
        errcode = '22023',
        message = 'claw_accept_request_telemetry_app_mismatch';
    end if;

    v_canonical_item := pg_catalog.jsonb_build_object(
      'event_id', v_event_id,
      'occurred_at', v_event_occurred_at,
      'sequence', v_event_sequence,
      'event_name', v_event_name,
      'field_name', v_event_field_name,
      'duration_ms', v_event_duration_ms,
      'app_version', v_event_app_version,
      'event_schema_version', v_event_schema_version,
      'properties', v_event_properties
    );
    v_canonical_events := v_canonical_events || pg_catalog.jsonb_build_array(v_canonical_item);
  end loop;

  select
    pg_catalog.count(*)::integer,
    pg_catalog.count(distinct event_item.value ->> 'event_id')::integer,
    pg_catalog.count(distinct event_item.value ->> 'sequence')::integer
  into v_event_count, v_distinct_event_ids, v_distinct_sequences
  from pg_catalog.jsonb_array_elements(v_canonical_events) as event_item(value);

  if v_event_count <> v_distinct_event_ids
    or v_event_count <> v_distinct_sequences
  then
    raise exception using
      errcode = '22023',
      message = 'claw_accept_request_duplicate_telemetry';
  end if;

  select coalesce(
    pg_catalog.jsonb_agg(
      event_item.value
      order by (event_item.value ->> 'sequence')::integer,
        event_item.value ->> 'event_id'
    ),
    '[]'::jsonb
  )
  into v_canonical_events
  from pg_catalog.jsonb_array_elements(v_canonical_events) as event_item(value);

  v_input_fingerprint := extensions.digest(
    pg_catalog.convert_to(
      pg_catalog.jsonb_build_object(
        'contract', 'claw_accept_request_v1',
        'idempotency_key', p_idempotency_key,
        'correlation_id', p_correlation_id,
        'session_id', p_session_id,
        'name', v_name,
        'email', v_email,
        'business_url', v_business_url,
        'service', v_service,
        'request', v_request_text,
        'budget', v_budget,
        'timeline', v_timeline,
        'brief', p_brief,
        'privacy_notice_version', v_privacy_notice_version,
        'request_schema_version', v_request_schema_version,
        'metadata', p_metadata,
        'source', 'web',
        'status', 'new',
        'environment', v_environment,
        'data_class', 'service_delivery_only',
        'session_schema_version', v_session_schema_version,
        'app_version', v_app_version,
        'is_synthetic', p_is_synthetic,
        'is_canary', p_is_canary,
        'is_employee_test', p_is_employee_test,
        'retention_policy', 'accepted_at_plus_24_months_v1',
        'ai_consent_id', p_ai_consent_id,
        'ai_granted', p_ai_granted,
        'ai_notice_version', v_ai_notice_version,
        'ai_provider_policy_version', v_ai_provider_policy_version,
        'analytics_consent_id', p_analytics_consent_id,
        'analytics_granted', p_analytics_granted,
        'analytics_notice_version', v_analytics_notice_version,
        'training_consent_id', p_training_consent_id,
        'training_granted', p_training_granted,
        'training_notice_version', v_training_notice_version,
        'product_events', v_canonical_events
      )::text,
      'UTF8'
    ),
    'sha256'
  );

  begin
    insert into public.claw_request_sessions (
      id,
      source,
      environment,
      schema_version,
      app_version,
      is_synthetic,
      is_canary,
      is_employee_test
    ) values (
      p_session_id,
      'web',
      v_environment,
      v_session_schema_version,
      v_app_version,
      p_is_synthetic,
      p_is_canary,
      p_is_employee_test
    )
    on conflict (id) do nothing;
  exception
    when check_violation or not_null_violation then
      raise exception using
        errcode = '22023',
        message = 'claw_accept_request_invalid_session';
  end;

  select session_row.*
  into v_session_row
  from public.claw_request_sessions as session_row
  where session_row.id = p_session_id
  for update;

  if not found
    or v_session_row.source <> 'web'
    or v_session_row.environment is distinct from v_environment
    or v_session_row.schema_version is distinct from v_session_schema_version
    or v_session_row.app_version is distinct from v_app_version
    or v_session_row.is_synthetic is distinct from p_is_synthetic
    or v_session_row.is_canary is distinct from p_is_canary
    or v_session_row.is_employee_test is distinct from p_is_employee_test
  then
    raise exception using
      errcode = '22023',
      message = 'claw_accept_request_session_mismatch';
  end if;

  begin
    insert into public.claw_requests (
      id,
      idempotency_key,
      created_at,
      updated_at,
      accepted_at,
      name,
      email,
      business_url,
      service,
      request,
      budget,
      timeline,
      brief,
      status,
      source,
      contact_email_verified_at,
      privacy_notice_version,
      schema_version,
      metadata,
      correlation_id,
      environment,
      data_class,
      is_synthetic,
      is_canary,
      is_employee_test,
      retention_expires_at,
      deletion_requested_at,
      deleted_at
    ) values (
      v_candidate_request_id,
      p_idempotency_key,
      v_now,
      v_now,
      v_now,
      v_name,
      v_email,
      v_business_url,
      v_service,
      v_request_text,
      v_budget,
      v_timeline,
      p_brief,
      'new',
      'web',
      null,
      v_privacy_notice_version,
      v_request_schema_version,
      p_metadata,
      p_correlation_id,
      v_environment,
      'service_delivery_only',
      p_is_synthetic,
      p_is_canary,
      p_is_employee_test,
      v_now + interval '24 months',
      null,
      null
    )
    on conflict (idempotency_key) do nothing
    returning * into v_request_row;
    v_was_created := found;
  exception
    when check_violation or not_null_violation then
      raise exception using
        errcode = '22023',
        message = 'claw_accept_request_invalid_request';
  end;

  if not v_was_created then
    select request_row.*
    into v_request_row
    from public.claw_requests as request_row
    where request_row.idempotency_key = p_idempotency_key
    for update;

    if not found then
      raise exception using
        errcode = 'P0001',
        message = 'claw_accept_request_missing_replay';
    end if;

    select receipt_row.*
    into v_receipt_row
    from private.claw_request_acceptance_receipts as receipt_row
    where receipt_row.idempotency_key = p_idempotency_key;

    if not found
      or v_receipt_row.request_id is distinct from v_request_row.id
      or v_receipt_row.session_id is distinct from p_session_id
      or v_receipt_row.input_fingerprint is distinct from v_input_fingerprint
    then
      raise exception using
        errcode = 'P0001',
        message = 'claw_accept_request_idempotency_mismatch';
    end if;
  else
    if v_session_row.ended_at is not null then
      raise exception using
        errcode = '22023',
        message = 'claw_accept_request_session_ended';
    end if;

    begin
      insert into private.claw_request_acceptance_receipts (
        idempotency_key,
        request_id,
        session_id,
        input_fingerprint,
        created_at
      ) values (
        p_idempotency_key,
        v_request_row.id,
        p_session_id,
        v_input_fingerprint,
        v_now
      );

      insert into public.claw_request_notifications (
        request_id,
        recipient_type,
        template_key,
        status,
        available_at,
        created_at,
        updated_at,
        deduplication_key
      ) values
        (
          v_request_row.id,
          'customer',
          'request_received_customer',
          'pending',
          v_now,
          v_now,
          v_now,
          'request:' || v_request_row.id::text || ':customer:request_received_customer'
        ),
        (
          v_request_row.id,
          'team',
          'request_received_team',
          'pending',
          v_now,
          v_now,
          v_now,
          'request:' || v_request_row.id::text || ':team:request_received_team'
        );

      insert into public.claw_request_events (
        request_id,
        created_at,
        event_type,
        actor_type,
        actor_id,
        previous_status,
        new_status
      ) values (
        v_request_row.id,
        v_now,
        'accepted',
        'system',
        null,
        null,
        null
      );

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
      ) values
        (
          p_ai_consent_id,
          v_request_row.id,
          p_session_id,
          'ai_processing',
          p_ai_granted,
          v_ai_notice_version,
          v_ai_provider_policy_version,
          v_now,
          null,
          'web',
          case when p_ai_granted then 'grant' else 'decline' end
        ),
        (
          p_analytics_consent_id,
          v_request_row.id,
          p_session_id,
          'product_analytics',
          p_analytics_granted,
          v_analytics_notice_version,
          null,
          v_now,
          null,
          'web',
          case when p_analytics_granted then 'grant' else 'decline' end
        ),
        (
          p_training_consent_id,
          v_request_row.id,
          p_session_id,
          'model_training',
          p_training_granted,
          v_training_notice_version,
          null,
          v_now,
          null,
          'web',
          case when p_training_granted then 'grant' else 'decline' end
        );

      insert into public.claw_request_product_events (
        event_id,
        session_id,
        request_id,
        occurred_at,
        sequence,
        event_name,
        field_name,
        duration_ms,
        app_version,
        event_schema_version,
        properties
      )
      select
        event_row.event_id,
        p_session_id,
        v_request_row.id,
        event_row.occurred_at,
        event_row.sequence,
        event_row.event_name,
        event_row.field_name,
        event_row.duration_ms,
        event_row.app_version,
        event_row.event_schema_version,
        event_row.properties
      from pg_catalog.jsonb_to_recordset(v_canonical_events) as event_row(
        event_id uuid,
        occurred_at timestamptz,
        sequence integer,
        event_name text,
        field_name text,
        duration_ms integer,
        app_version text,
        event_schema_version text,
        properties jsonb
      );
    exception
      when unique_violation then
        raise exception using
          errcode = '23505',
          message = 'claw_accept_request_artifact_conflict';
      when check_violation or not_null_violation or foreign_key_violation then
        raise exception using
          errcode = '22023',
          message = 'claw_accept_request_invalid_artifact';
    end;
  end if;

  select pg_catalog.count(*)::integer
  into v_count
  from public.claw_request_notifications as notification
  where notification.request_id = v_request_row.id
    and notification.deduplication_key in (
      'request:' || v_request_row.id::text || ':customer:request_received_customer',
      'request:' || v_request_row.id::text || ':team:request_received_team'
    );

  if v_count <> 2 then
    raise exception using
      errcode = 'P0001',
      message = 'claw_accept_request_notification_state_corrupt';
  end if;

  select pg_catalog.count(*)::integer
  into v_count
  from public.claw_request_events as request_event
  where request_event.request_id = v_request_row.id
    and request_event.event_type = 'accepted'
    and request_event.actor_type = 'system'
    and request_event.actor_id is null
    and request_event.previous_status is null
    and request_event.new_status is null;

  if v_count <> 1 then
    raise exception using
      errcode = 'P0001',
      message = 'claw_accept_request_audit_state_corrupt';
  end if;

  select pg_catalog.count(*)::integer
  into v_count
  from public.claw_request_consents as consent
  where
    (
      consent.id = p_ai_consent_id
      and consent.request_id = v_request_row.id
      and consent.session_id = p_session_id
      and consent.consent_type = 'ai_processing'
      and consent.granted = p_ai_granted
      and consent.notice_version = v_ai_notice_version
      and consent.provider_policy_version is not distinct from v_ai_provider_policy_version
      and consent.withdrawn_at is null
      and consent.source = 'web'
      and consent.event_type = case when p_ai_granted then 'grant' else 'decline' end
    )
    or (
      consent.id = p_analytics_consent_id
      and consent.request_id = v_request_row.id
      and consent.session_id = p_session_id
      and consent.consent_type = 'product_analytics'
      and consent.granted = p_analytics_granted
      and consent.notice_version = v_analytics_notice_version
      and consent.provider_policy_version is null
      and consent.withdrawn_at is null
      and consent.source = 'web'
      and consent.event_type = case when p_analytics_granted then 'grant' else 'decline' end
    )
    or (
      consent.id = p_training_consent_id
      and consent.request_id = v_request_row.id
      and consent.session_id = p_session_id
      and consent.consent_type = 'model_training'
      and consent.granted = p_training_granted
      and consent.notice_version = v_training_notice_version
      and consent.provider_policy_version is null
      and consent.withdrawn_at is null
      and consent.source = 'web'
      and consent.event_type = case when p_training_granted then 'grant' else 'decline' end
    );

  if v_count <> 3 then
    raise exception using
      errcode = 'P0001',
      message = 'claw_accept_request_consent_state_corrupt';
  end if;

  for v_item in
    select event_item.value
    from pg_catalog.jsonb_array_elements(v_canonical_events) as event_item(value)
  loop
    perform 1
    from public.claw_request_product_events as product_event
    where product_event.event_id = (v_item ->> 'event_id')::uuid
      and product_event.session_id = p_session_id
      and product_event.request_id = v_request_row.id
      and product_event.occurred_at = (v_item ->> 'occurred_at')::timestamptz
      and product_event.sequence = (v_item ->> 'sequence')::integer
      and product_event.event_name = v_item ->> 'event_name'
      and product_event.field_name is not distinct from v_item ->> 'field_name'
      and product_event.duration_ms is not distinct from (v_item ->> 'duration_ms')::integer
      and product_event.app_version = v_item ->> 'app_version'
      and product_event.event_schema_version = v_item ->> 'event_schema_version'
      and product_event.properties = v_item -> 'properties';

    if not found then
      raise exception using
        errcode = 'P0001',
        message = 'claw_accept_request_telemetry_state_corrupt';
    end if;
  end loop;

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'recipient_type', notification.recipient_type,
        'status', notification.status
      )
      order by case notification.recipient_type
        when 'customer' then 1
        when 'team' then 2
        else 3
      end
    ),
    '[]'::jsonb
  )
  into notification_states
  from public.claw_request_notifications as notification
  where notification.request_id = v_request_row.id
    and notification.deduplication_key in (
      'request:' || v_request_row.id::text || ':customer:request_received_customer',
      'request:' || v_request_row.id::text || ':team:request_received_team'
    );

  request_id := v_request_row.id;
  was_created := v_was_created;
  accepted_at := v_request_row.accepted_at;
  brief := v_request_row.brief;
  return next;
end
$claw_accept_request_v1$;

comment on function public.claw_accept_request_v1(
  uuid, uuid, uuid,
  text, text, text, text, text, text, text,
  jsonb, text, text, jsonb,
  text, text, text, boolean, boolean, boolean,
  uuid, boolean, text, text,
  uuid, boolean, text,
  uuid, boolean, text,
  jsonb
) is
  'LOCAL-ONLY atomic request acceptance boundary. Remote use remains blocked until narrow lifecycle RPCs replace every direct service_role INSERT grant and hosted authorization is verified.';

revoke all on function public.claw_accept_request_v1(uuid, uuid, uuid, text, text, text, text, text, text, text, jsonb, text, text, jsonb, text, text, text, boolean, boolean, boolean, uuid, boolean, text, text, uuid, boolean, text, uuid, boolean, text, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.claw_accept_request_v1(uuid, uuid, uuid, text, text, text, text, text, text, text, jsonb, text, text, jsonb, text, text, text, boolean, boolean, boolean, uuid, boolean, text, text, uuid, boolean, text, uuid, boolean, text, jsonb) to service_role;

commit;
