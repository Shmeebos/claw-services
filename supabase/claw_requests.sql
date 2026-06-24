-- Claw Services request desk table
-- Run this in the Supabase SQL editor for the chosen Claw Services project.

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
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists claw_requests_created_at_idx on public.claw_requests (created_at desc);
create index if not exists claw_requests_status_idx on public.claw_requests (status);

alter table public.claw_requests enable row level security;

-- The public website submits through a Next.js server route using SUPABASE_SERVICE_ROLE_KEY.
-- Do not expose service-role keys to the browser. No public insert policy is needed.

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists claw_requests_set_updated_at on public.claw_requests;
create trigger claw_requests_set_updated_at
before update on public.claw_requests
for each row execute function public.set_updated_at();
