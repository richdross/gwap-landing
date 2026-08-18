-- GWAP PLATFORM V1 — BUSINESS PLANE
-- Zero-cost-first schema for Supabase/Postgres.
-- Existing auth.users remains the identity source; these tables hold business state.

create extension if not exists pgcrypto;

create table if not exists public.gwap_customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null references auth.users(id) on delete set null,
  email text,
  display_name text,
  stripe_customer_id text unique,
  status text not null default 'lead' check (status in ('lead','customer','inactive')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.gwap_products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  status text not null default 'draft' check (status in ('draft','active','retired')),
  stripe_product_id text unique,
  stripe_price_id text,
  price_cents integer,
  currency text not null default 'usd',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.gwap_orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.gwap_customers(id) on delete set null,
  product_id uuid references public.gwap_products(id) on delete set null,
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text,
  amount_cents integer,
  currency text not null default 'usd',
  status text not null default 'pending' check (status in ('pending','paid','failed','refunded','cancelled')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.gwap_subscriptions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.gwap_customers(id) on delete cascade,
  product_id uuid references public.gwap_products(id) on delete set null,
  stripe_subscription_id text unique,
  status text not null default 'inactive',
  current_period_end timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.gwap_entitlements (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.gwap_customers(id) on delete cascade,
  product_id uuid references public.gwap_products(id) on delete cascade,
  entitlement_key text not null,
  status text not null default 'active' check (status in ('active','revoked','expired')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  source_order_id uuid references public.gwap_orders(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(customer_id, product_id, entitlement_key)
);

create table if not exists public.gwap_missions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.gwap_customers(id) on delete set null,
  mission_type text not null,
  title text not null,
  status text not null default 'queued' check (status in ('queued','running','waiting','completed','failed','cancelled')),
  input jsonb not null default '{}'::jsonb,
  output jsonb,
  proof jsonb,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

create table if not exists public.gwap_results (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid references public.gwap_missions(id) on delete cascade,
  customer_id uuid references public.gwap_customers(id) on delete set null,
  result_type text not null,
  verdict text,
  payload jsonb not null default '{}'::jsonb,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists gwap_customers_email_idx on public.gwap_customers(email);
create index if not exists gwap_orders_customer_idx on public.gwap_orders(customer_id, created_at desc);
create index if not exists gwap_entitlements_customer_idx on public.gwap_entitlements(customer_id, status);
create index if not exists gwap_missions_customer_idx on public.gwap_missions(customer_id, created_at desc);
create index if not exists gwap_results_mission_idx on public.gwap_results(mission_id, created_at desc);

alter table public.gwap_customers enable row level security;
alter table public.gwap_products enable row level security;
alter table public.gwap_orders enable row level security;
alter table public.gwap_subscriptions enable row level security;
alter table public.gwap_entitlements enable row level security;
alter table public.gwap_missions enable row level security;
alter table public.gwap_results enable row level security;

-- Service-role access is handled server-side by the Worker.
-- End-user RLS policies will be added only when a customer-facing authenticated surface requires them.
