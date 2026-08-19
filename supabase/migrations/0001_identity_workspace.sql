-- Charismak Accounting foundation: company workspace, interface families, positions and permissions
-- Financial tables intentionally excluded from this first migration.

create extension if not exists pgcrypto;

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  country_code text not null default 'NG',
  currency_code text not null default 'NGN',
  timezone text not null default 'Africa/Lagos',
  logo_url text,
  active_project_limit integer not null default 10 check (active_project_limit > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create type public.interface_family as enum ('md_owner','accountant_cfo','project_director','project_manager');
create type public.membership_status as enum ('invited','active','suspended','archived');
create type public.permission_scope as enum ('own','assigned_projects','selected_projects','selected_accounts','company_wide');

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.positions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  code text not null,
  name text not null,
  interface_family public.interface_family not null,
  parent_position_id uuid references public.positions(id) on delete set null,
  is_system_template boolean not null default false,
  created_at timestamptz not null default now(),
  unique(company_id, code)
);

create table if not exists public.permissions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  description text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.company_memberships (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status public.membership_status not null default 'active',
  is_owner boolean not null default false,
  created_at timestamptz not null default now(),
  unique(company_id, user_id)
);

create table if not exists public.membership_positions (
  membership_id uuid not null references public.company_memberships(id) on delete cascade,
  position_id uuid not null references public.positions(id) on delete cascade,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  primary key(membership_id, position_id)
);

create table if not exists public.position_permissions (
  position_id uuid not null references public.positions(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  scope public.permission_scope not null,
  approval_limit numeric(18,2),
  payment_limit numeric(18,2),
  created_at timestamptz not null default now(),
  primary key(position_id, permission_id)
);

create table if not exists public.membership_permission_overrides (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references public.company_memberships(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  allowed boolean not null,
  scope public.permission_scope,
  approval_limit numeric(18,2),
  payment_limit numeric(18,2),
  granted_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique(membership_id, permission_id)
);

insert into public.permissions (code, description) values
 ('company.view','View company-level information'),
 ('users.manage','Manage users, positions and delegated permissions'),
 ('projects.view','View permitted projects'),
 ('projects.manage','Create and manage projects'),
 ('transactions.view','View permitted transactions'),
 ('transactions.create','Create transaction records'),
 ('transactions.confirm','Confirm imported or detected transaction classifications'),
 ('transactions.post','Post approved accounting events'),
 ('payments.approve','Approve payment requests within delegated limits'),
 ('payments.pay','Process approved payments within delegated limits'),
 ('reconciliation.manage','Manage bank/account reconciliation'),
 ('profitability.view','View internal cost and profitability information'),
 ('reports.view','View permitted reports'),
 ('reports.export','Download or export permitted reports'),
 ('reports.share_external','Create/share approved external reports')
on conflict (code) do nothing;

alter table public.companies enable row level security;
alter table public.profiles enable row level security;
alter table public.positions enable row level security;
alter table public.company_memberships enable row level security;
alter table public.membership_positions enable row level security;
alter table public.position_permissions enable row level security;
alter table public.membership_permission_overrides enable row level security;

create or replace function public.is_company_member(target_company uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.company_memberships m
    where m.company_id = target_company
      and m.user_id = auth.uid()
      and m.status = 'active'
  );
$$;

create policy companies_member_select on public.companies
for select using (public.is_company_member(id));

create policy memberships_company_select on public.company_memberships
for select using (public.is_company_member(company_id));

create policy positions_company_select on public.positions
for select using (company_id is null or public.is_company_member(company_id));

create policy own_profile_select on public.profiles
for select using (id = auth.uid());

create policy own_profile_update on public.profiles
for update using (id = auth.uid()) with check (id = auth.uid());

-- Write policies for companies/users/permissions will be added only after the
-- server-side authorization functions are implemented and tested. Deny-by-default
-- is intentional for this first migration.
