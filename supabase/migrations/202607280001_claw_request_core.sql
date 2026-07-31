-- Claw Services operational request core (Task A).
--
-- The public application crosses a service-role-only Next.js trust boundary: browsers
-- never receive database credentials and these tables intentionally have no RLS policies.
-- Operational request rows contain necessary customer PII. Structured request metadata
-- permits no raw IP addresses, raw user agents, arbitrary headers, or full referrer URLs.
-- Notification jobs carry routing codes only, with no message body or arbitrary payload.
-- Audit events carry a closed operational taxonomy, with no note body, UI clickstream, or arbitrary JSON content channel.
-- Consent and learning-signal storage arrive in Task B.
-- UUID primary keys deliberately introduce no sequences, so this slice grants no sequence
-- privileges. The acceptance RPC is also intentionally deferred until Task B.

begin;

create extension if not exists pgcrypto;

create table if not exists public.claw_requests (
  id uuid primary key default gen_random_uuid(),
  idempotency_key uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  accepted_at timestamptz not null default now(),
  name text not null,
  email text not null,
  business_url text,
  service text not null,
  request text not null,
  budget text,
  timeline text,
  brief jsonb not null,
  status text not null default 'new',
  source text not null default 'web',
  contact_email_verified_at timestamptz,
  privacy_notice_version text not null,
  schema_version text not null,
  metadata jsonb not null default '{}'::jsonb,

  constraint claw_requests_idempotency_key_key unique (idempotency_key),
  constraint claw_requests_name_check
    check (char_length(btrim(name)) between 1 and 120),
  constraint claw_requests_email_check
    check (
      char_length(btrim(email)) between 3 and 254
      and position('@' in email) > 1
    ),
  constraint claw_requests_business_url_check
    check (
      business_url is null
      or char_length(business_url) <= 2048
    ),
  constraint claw_requests_service_check
    check (char_length(btrim(service)) between 1 and 120),
  constraint claw_requests_request_check
    check (char_length(btrim(request)) between 1 and 4000),
  constraint claw_requests_budget_check
    check (
      budget is null
      or char_length(budget) <= 120
    ),
  constraint claw_requests_timeline_check
    check (
      timeline is null
      or char_length(timeline) <= 120
    ),
  constraint claw_requests_privacy_notice_version_check
    check (char_length(btrim(privacy_notice_version)) between 1 and 64),
  constraint claw_requests_schema_version_check
    check (char_length(btrim(schema_version)) between 1 and 32),
  constraint claw_requests_status_check
    check (status in ('new', 'scoping', 'in_progress', 'review', 'completed', 'rejected')),
  constraint claw_requests_source_check
    check (source in ('web', 'apple_app')),
  constraint claw_requests_timestamps_check
    check (
      updated_at >= created_at
      and accepted_at >= created_at
    ),
  constraint claw_requests_brief_shape_check
    check (
      jsonb_typeof(brief) = 'object'
      and octet_length(brief::text) <= 16384
      and brief - array[
        'summary',
        'objectives',
        'deliverables',
        'constraints',
        'success_criteria'
      ] = '{}'::jsonb
      and brief ?& array[
        'summary',
        'objectives',
        'deliverables',
        'constraints',
        'success_criteria'
      ]
      and jsonb_typeof(brief -> 'summary') = 'string'
      and char_length(btrim(brief ->> 'summary')) between 1 and 2000
      and case
        when jsonb_typeof(brief -> 'objectives') = 'array' then
          jsonb_array_length(brief -> 'objectives') between 0 and 20
          and not jsonb_path_exists(
            brief,
            '$.objectives[*] ? (@.type() != "string")'
          )
        else false
      end
      and case
        when jsonb_typeof(brief -> 'deliverables') = 'array' then
          jsonb_array_length(brief -> 'deliverables') between 0 and 20
          and not jsonb_path_exists(
            brief,
            '$.deliverables[*] ? (@.type() != "string")'
          )
        else false
      end
      and case
        when jsonb_typeof(brief -> 'constraints') = 'array' then
          jsonb_array_length(brief -> 'constraints') between 0 and 20
          and not jsonb_path_exists(
            brief,
            '$.constraints[*] ? (@.type() != "string")'
          )
        else false
      end
      and case
        when jsonb_typeof(brief -> 'success_criteria') = 'array' then
          jsonb_array_length(brief -> 'success_criteria') between 0 and 20
          and not jsonb_path_exists(
            brief,
            '$.success_criteria[*] ? (@.type() != "string")'
          )
        else false
      end
    ),
  constraint claw_requests_metadata_shape_check
    check (
      jsonb_typeof(metadata) = 'object'
      and octet_length(metadata::text) <= 2048
      and metadata - array[
        'campaign_source',
        'campaign_medium',
        'campaign_name',
        'landing_path',
        'locale',
        'assistant_mode'
      ] = '{}'::jsonb
      and (
        not (metadata ? 'campaign_source')
        or (
          jsonb_typeof(metadata -> 'campaign_source') = 'string'
          and char_length(metadata ->> 'campaign_source') between 1 and 120
        )
      )
      and (
        not (metadata ? 'campaign_medium')
        or (
          jsonb_typeof(metadata -> 'campaign_medium') = 'string'
          and char_length(metadata ->> 'campaign_medium') between 1 and 120
        )
      )
      and (
        not (metadata ? 'campaign_name')
        or (
          jsonb_typeof(metadata -> 'campaign_name') = 'string'
          and char_length(metadata ->> 'campaign_name') between 1 and 120
        )
      )
      and (
        not (metadata ? 'landing_path')
        or (
          jsonb_typeof(metadata -> 'landing_path') = 'string'
          and char_length(metadata ->> 'landing_path') between 1 and 512
          and (metadata ->> 'landing_path') ~ '^/[^?#]*$'
        )
      )
      and (
        not (metadata ? 'locale')
        or (
          jsonb_typeof(metadata -> 'locale') = 'string'
          and char_length(metadata ->> 'locale') between 2 and 35
        )
      )
      and (
        not (metadata ? 'assistant_mode')
        or (
          jsonb_typeof(metadata -> 'assistant_mode') = 'string'
          and (metadata ->> 'assistant_mode') in ('guided', 'ai_assisted')
        )
      )
    )
);

comment on table public.claw_requests is
  'Operational Claw intake records containing the minimum customer PII and a canonical structured brief.';
comment on column public.claw_requests.metadata is
  'Closed, size-bounded attribution metadata; never store network identifiers, request headers, or referrer URLs.';
comment on column public.claw_requests.brief is
  'Canonical bounded brief object; not a transcript, prompt log, provider response, or hidden-reasoning store.';
comment on column public.claw_requests.source is
  'Known product surface. Only web submissions are active in Task A; apple_app is reserved for the approved app surface.';

create table if not exists public.claw_request_notifications (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.claw_requests (id) on delete cascade,
  recipient_type text not null,
  template_key text not null,
  status text not null default 'pending',
  attempt_count smallint not null default 0,
  max_attempts smallint not null default 5,
  last_error_class text,
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deduplication_key text not null,

  constraint claw_request_notifications_recipient_type_check
    check (recipient_type in ('customer', 'team')),
  constraint claw_request_notifications_template_key_check
    check (template_key in ('request_received_customer', 'request_received_team')),
  constraint claw_request_notifications_recipient_template_pair_check
    check (
      (
        recipient_type = 'customer'
        and template_key = 'request_received_customer'
      )
      or (
        recipient_type = 'team'
        and template_key = 'request_received_team'
      )
    ),
  constraint claw_request_notifications_status_check
    check (status in ('pending', 'processing', 'sent', 'failed', 'cancelled')),
  constraint claw_request_notifications_attempt_count_check
    check (attempt_count between 0 and 10),
  constraint claw_request_notifications_max_attempts_check
    check (
      max_attempts between 1 and 10
      and attempt_count <= max_attempts
    ),
  constraint claw_request_notifications_last_error_class_check
    check (
      last_error_class is null
      or last_error_class in (
        'provider_unavailable',
        'rate_limited',
        'authentication_failed',
        'invalid_recipient',
        'template_error',
        'provider_rejected',
        'unknown'
      )
    ),
  constraint claw_request_notifications_deduplication_key_check
    check (
      char_length(deduplication_key) between 1 and 200
      and deduplication_key ~ '^[a-z0-9][a-z0-9:_-]{0,199}$'
    ),
  constraint claw_request_notifications_deduplication_key_key
    unique (deduplication_key),
  constraint claw_request_notifications_sent_at_check
    check (
      (status = 'sent' and sent_at is not null)
      or (status <> 'sent' and sent_at is null)
    ),
  constraint claw_request_notifications_timestamps_check
    check (
      updated_at >= created_at
      and available_at >= created_at
    )
);

comment on table public.claw_request_notifications is
  'Service-only transactional outbox. Routing, template, retry, and error-class codes only; delivery content is rendered outside the acceptance transaction.';
comment on column public.claw_request_notifications.last_error_class is
  'Closed operational error class only. Provider messages and stack traces must not be stored here.';
comment on column public.claw_request_notifications.deduplication_key is
  'Deterministic caller-supplied key derived from stable request, recipient-type, and template identifiers.';

create table if not exists public.claw_request_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.claw_requests (id) on delete cascade,
  created_at timestamptz not null default now(),
  event_type text not null,
  actor_type text not null default 'system',
  actor_id uuid,
  previous_status text,
  new_status text,

  constraint claw_request_events_event_type_check
    check (
      event_type in (
        'accepted',
        'status_changed',
        'internal_note_added',
        'notification_sent',
        'notification_failed',
        'consent_withdrawn',
        'training_candidate_approved',
        'training_candidate_rejected'
      )
    ),
  constraint claw_request_events_actor_type_check
    check (actor_type in ('system', 'service_role', 'operator', 'customer')),
  constraint claw_request_events_previous_status_check
    check (
      previous_status is null
      or previous_status in ('new', 'scoping', 'in_progress', 'review', 'completed', 'rejected')
    ),
  constraint claw_request_events_new_status_check
    check (
      new_status is null
      or new_status in ('new', 'scoping', 'in_progress', 'review', 'completed', 'rejected')
    ),
  constraint claw_request_events_status_transition_check
    check (
      (
        event_type = 'status_changed'
        and previous_status is not null
        and new_status is not null
        and previous_status <> new_status
      )
      or (
        event_type <> 'status_changed'
        and previous_status is null
        and new_status is null
      )
    )
);

comment on table public.claw_request_events is
  'Append-only operational and audit event facts. Event details live in typed columns and closed taxonomies, never free-form content.';
comment on column public.claw_request_events.event_type is
  'Closed audit taxonomy; internal_note_added records only that an operator action occurred, never the note text.';

create index if not exists claw_requests_status_created_at_idx
  on public.claw_requests (status, created_at desc);

create index if not exists claw_request_notifications_status_available_at_idx
  on public.claw_request_notifications (status, available_at, created_at);

create index if not exists claw_request_notifications_request_id_idx
  on public.claw_request_notifications (request_id);

create index if not exists claw_request_events_request_id_created_at_idx
  on public.claw_request_events (request_id, created_at desc);

create or replace function public.claw_set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at = statement_timestamp();
  return new;
end;
$$;

comment on function public.claw_set_updated_at() is
  'Internal trigger helper. It is not an application RPC and is not directly executable by application roles.';

revoke all on function public.claw_set_updated_at()
  from public, anon, authenticated, service_role;

-- Drop/recreate makes this migration repeatable while keeping exactly one trigger per table.
drop trigger if exists claw_requests_set_updated_at on public.claw_requests;
create trigger claw_requests_set_updated_at
before update on public.claw_requests
for each row execute function public.claw_set_updated_at();

drop trigger if exists claw_request_notifications_set_updated_at
  on public.claw_request_notifications;
create trigger claw_request_notifications_set_updated_at
before update on public.claw_request_notifications
for each row execute function public.claw_set_updated_at();

alter table public.claw_requests enable row level security;
alter table public.claw_request_notifications enable row level security;
alter table public.claw_request_events enable row level security;

-- No CREATE POLICY statements belong in this service-role-only core. RLS remains closed
-- even if a future operator accidentally grants a table privilege to an API-facing role.
revoke all on table public.claw_requests
  from public, anon, authenticated;
revoke all on table public.claw_request_notifications
  from public, anon, authenticated;
revoke all on table public.claw_request_events
  from public, anon, authenticated;

-- Reset service_role privileges before granting the minimum operational table surface.
revoke all on table public.claw_requests from service_role;
revoke all on table public.claw_request_notifications from service_role;
revoke all on table public.claw_request_events from service_role;

grant select, insert, update on table public.claw_requests to service_role;
grant select, insert, update on table public.claw_request_notifications to service_role;
grant select, insert on table public.claw_request_events to service_role;

commit;
