-- GWAP PLATFORM V1 — INTELLIGENCE PLANE
-- Uses existing Supabase/Postgres first to avoid activating new billable storage.

create extension if not exists pgcrypto;

create table if not exists public.gwap_signals (
  id uuid primary key default gen_random_uuid(),
  source_type text not null,
  source_ref text,
  title text,
  body text,
  url text,
  observed_at timestamptz not null default now(),
  normalized jsonb not null default '{}'::jsonb,
  status text not null default 'new' check (status in ('new','processed','ignored','promoted')),
  created_at timestamptz not null default now()
);

create table if not exists public.gwap_evidence (
  id uuid primary key default gen_random_uuid(),
  signal_id uuid references public.gwap_signals(id) on delete cascade,
  evidence_type text not null,
  source_url text,
  content_text text,
  metadata jsonb not null default '{}'::jsonb,
  captured_at timestamptz not null default now()
);

create table if not exists public.gwap_opportunities (
  id uuid primary key default gen_random_uuid(),
  opportunity_key text not null unique,
  title text not null,
  summary text,
  score integer check (score between 0 and 100),
  thesis jsonb not null default '{}'::jsonb,
  evidence_summary jsonb not null default '{}'::jsonb,
  status text not null default 'candidate' check (status in ('candidate','watch','validated','rejected','launched')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.gwap_opportunity_signals (
  opportunity_id uuid references public.gwap_opportunities(id) on delete cascade,
  signal_id uuid references public.gwap_signals(id) on delete cascade,
  relevance numeric(5,4),
  created_at timestamptz not null default now(),
  primary key (opportunity_id, signal_id)
);

create table if not exists public.gwap_intelligence_runs (
  id uuid primary key default gen_random_uuid(),
  run_type text not null,
  status text not null default 'queued' check (status in ('queued','running','completed','failed')),
  input jsonb not null default '{}'::jsonb,
  output jsonb,
  model_provider text,
  model_name text,
  usage jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists gwap_signals_source_idx on public.gwap_signals(source_type, observed_at desc);
create index if not exists gwap_signals_status_idx on public.gwap_signals(status, observed_at desc);
create index if not exists gwap_evidence_signal_idx on public.gwap_evidence(signal_id, captured_at desc);
create index if not exists gwap_opportunities_score_idx on public.gwap_opportunities(status, score desc);
create index if not exists gwap_intelligence_runs_created_idx on public.gwap_intelligence_runs(created_at desc);

alter table public.gwap_signals enable row level security;
alter table public.gwap_evidence enable row level security;
alter table public.gwap_opportunities enable row level security;
alter table public.gwap_opportunity_signals enable row level security;
alter table public.gwap_intelligence_runs enable row level security;

-- These tables are server-side only for V1. Public read APIs will be curated by Workers.
