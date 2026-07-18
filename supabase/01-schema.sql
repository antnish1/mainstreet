-- Mainstreet Business Billing schema
-- Run first in Supabase Dashboard > SQL Editor.
-- Initial staff PIN: 2580. Change it immediately from Report > Business security.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.app_settings (
  id smallint primary key default 1 check (id = 1),
  business_name text not null default 'Mainstreet Meals & Coffee',
  pin_hash text not null,
  updated_at timestamptz not null default now()
);

insert into public.app_settings (id, pin_hash)
values (1, extensions.crypt('2580', extensions.gen_salt('bf')))
on conflict (id) do nothing;

create table if not exists public.staff_sessions (
  token uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days')
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  name_key text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.menu_items (
  id text primary key,
  category text not null,
  name text not null,
  full_rate numeric(12,2) not null check (full_rate >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_no text not null unique,
  client_reference uuid not null unique,
  invoice_date date not null,
  customer_id uuid not null references public.customers(id),
  total_amount numeric(12,2) not null default 0 check (total_amount >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  menu_item_id text references public.menu_items(id),
  item_name text not null,
  category text not null,
  full_rate numeric(12,2) not null check (full_rate >= 0),
  half_qty integer not null default 0 check (half_qty >= 0),
  full_qty integer not null default 0 check (full_qty >= 0),
  amount numeric(12,2) not null check (amount >= 0),
  created_at timestamptz not null default now(),
  check (half_qty > 0 or full_qty > 0)
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  payment_no text not null unique,
  client_reference uuid not null unique,
  payment_date date not null,
  customer_id uuid not null references public.customers(id),
  amount numeric(12,2) not null check (amount > 0),
  note text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists customers_name_search_idx on public.customers (name_key);
create index if not exists invoices_date_idx on public.invoices (invoice_date desc);
create index if not exists invoices_customer_idx on public.invoices (customer_id);
create index if not exists payments_date_idx on public.payments (payment_date desc);
create index if not exists payments_customer_idx on public.payments (customer_id);
create index if not exists invoice_items_invoice_idx on public.invoice_items (invoice_id);

alter table public.app_settings enable row level security;
alter table public.staff_sessions enable row level security;
alter table public.customers enable row level security;
alter table public.menu_items enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.payments enable row level security;

revoke all on public.app_settings from anon, authenticated;
revoke all on public.staff_sessions from anon, authenticated;
revoke all on public.customers from anon, authenticated;
revoke all on public.invoices from anon, authenticated;
revoke all on public.invoice_items from anon, authenticated;
revoke all on public.payments from anon, authenticated;
revoke all on public.menu_items from anon, authenticated;
grant select on public.menu_items to anon, authenticated;

drop policy if exists menu_items_public_read on public.menu_items;
create policy menu_items_public_read
on public.menu_items for select
to anon, authenticated
using (is_active = true);
