-- Claw Services request desk fresh-install baseline.
-- Run this in the SQL editor for the chosen Claw Services Supabase project.
-- Evolve an existing installation with a reviewed versioned migration; `if not exists`
-- does not add new columns or constraints to a table that already exists.

create extension if not exists pgcrypto;

create table if not exists public.claw_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null,
  email text not null,
  business_url text,
  service text not null,
  request text not null,
  budget text,
  timeline text,
  brief text not null,
  status text not null default 'new' check (status in ('new', 'scoping', 'in_progress', 'review', 'completed')),
  source text not null default 'website',
  metadata jsonb not null default '{}'::jsonb,
  constraint claw_requests_name_check check (char_length(btrim(name)) between 2 and 120),
  constraint claw_requests_email_check check (char_length(btrim(email)) between 3 and 180),
  constraint claw_requests_business_url_check check (business_url is null or char_length(business_url) <= 240),
  constraint claw_requests_service_check check (service in (
    'Premium website / landing page',
    'Lead intake automation',
    'Content or design pack',
    'Research or admin pack',
    'Monthly operator desk'
  )),
  constraint claw_requests_request_check check (char_length(btrim(request)) between 15 and 2200),
  constraint claw_requests_budget_check check (budget is null or char_length(budget) <= 80),
  constraint claw_requests_timeline_check check (timeline is null or char_length(timeline) <= 80),
  constraint claw_requests_brief_check check (char_length(btrim(brief)) > 0),
  constraint claw_requests_source_check check (source = 'website'),
  constraint claw_requests_metadata_check check (jsonb_typeof(metadata) = 'object')
);

create index if not exists claw_requests_created_at_idx on public.claw_requests (created_at desc);
create index if not exists claw_requests_status_idx on public.claw_requests (status);

alter table public.claw_requests enable row level security;

-- The public website submits through a Next.js server route using SUPABASE_SERVICE_ROLE_KEY.
-- Do not expose service-role keys to the browser. No public insert policy is needed.

create or replace function public.claw_requests_set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists claw_requests_set_updated_at on public.claw_requests;
create trigger claw_requests_set_updated_at
before update on public.claw_requests
for each row execute function public.claw_requests_set_updated_at();
