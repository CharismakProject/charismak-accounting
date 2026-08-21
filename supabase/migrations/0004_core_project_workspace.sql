-- Restores the foundational objects that existed in production before the
-- recurring statement-ingestion migration. This migration intentionally does
-- not seed a Charismak-specific company; clean QA and new installations should
-- remain multi-company and create workspaces through onboarding.

-- Shared position templates used by onboarding/invites.
insert into public.positions (company_id, code, name, interface_family, is_system_template)
select null, x.code, x.name, x.family::public.interface_family, true
from (values
 ('MD_OWNER','MD / Owner','md_owner'),
 ('CFO','Accountant / CFO','accountant_cfo'),
 ('PROJECT_DIRECTOR','Project Director','project_director'),
 ('CONSTRUCTION_MANAGER','Construction Manager','project_manager'),
 ('PROJECT_MANAGER','Project Manager','project_manager')
) as x(code,name,family)
where not exists (
  select 1 from public.positions p where p.company_id is null and p.code = x.code
);

insert into public.positions (company_id, code, name, interface_family, parent_position_id, is_system_template)
select null, x.code, x.name, x.family::public.interface_family,
       (select p.id from public.positions p where p.company_id is null and p.code = x.parent_code limit 1),
       true
from (values
 ('FINANCE_MANAGER','Finance Manager','accountant_cfo','CFO'),
 ('SENIOR_ACCOUNTANT','Senior Accountant','accountant_cfo','CFO'),
 ('ACCOUNTANT','Accountant','accountant_cfo','CFO'),
 ('ACCOUNTS_OFFICER','Accounts Officer','accountant_cfo','ACCOUNTANT'),
 ('CASHIER','Cashier','accountant_cfo','ACCOUNTANT'),
 ('SENIOR_PROJECT_COORDINATOR','Senior Project Coordinator','project_director','PROJECT_DIRECTOR'),
 ('PROJECT_COORDINATOR','Project Coordinator','project_director','PROJECT_DIRECTOR'),
 ('SITE_MANAGER','Site Manager','project_manager','PROJECT_MANAGER'),
 ('SITE_ENGINEER','Site Engineer','project_manager','PROJECT_MANAGER'),
 ('SUPERVISOR','Supervisor','project_manager','PROJECT_MANAGER'),
 ('STOREKEEPER','Storekeeper','project_manager','PROJECT_MANAGER')
) as x(code,name,family,parent_code)
where not exists (
  select 1 from public.positions p where p.company_id is null and p.code = x.code
);

-- Projects foundation.
create type public.project_status as enum ('draft','active','on_hold','completed','archived');

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  contact_person text,
  email text,
  phone text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, name)
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  project_code text not null,
  name text not null,
  location text,
  status public.project_status not null default 'draft',
  start_date date,
  end_date date,
  aliases text[] not null default '{}',
  contract_value numeric(18,2),
  internal_cost_budget numeric(18,2),
  notes text,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, project_code)
);

create table if not exists public.project_financial_summaries (
  project_id uuid primary key references public.projects(id) on delete cascade,
  funding_received numeric(18,2) not null default 0,
  confirmed_expenditure numeric(18,2) not null default 0,
  cash_balance numeric(18,2) not null default 0,
  outstanding_commitments numeric(18,2) not null default 0,
  funding_surplus_shortfall numeric(18,2) not null default 0,
  reporting_period_start date,
  reporting_period_end date,
  source_label text,
  updated_at timestamptz not null default now()
);

create table if not exists public.project_cost_categories (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  category_name text not null,
  amount numeric(18,2) not null default 0,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, category_name)
);

alter table public.clients enable row level security;
alter table public.projects enable row level security;
alter table public.project_financial_summaries enable row level security;
alter table public.project_cost_categories enable row level security;

drop policy if exists clients_member_select on public.clients;
create policy clients_member_select on public.clients
for select to authenticated
using ((select private.is_company_member(company_id)));

drop policy if exists projects_member_select on public.projects;
create policy projects_member_select on public.projects
for select to authenticated
using ((select private.is_company_member(company_id)));

drop policy if exists project_financial_summaries_member_select on public.project_financial_summaries;
create policy project_financial_summaries_member_select on public.project_financial_summaries
for select to authenticated
using (exists (
  select 1 from public.projects p
  where p.id = project_financial_summaries.project_id
    and (select private.is_company_member(p.company_id))
));

drop policy if exists project_cost_categories_member_select on public.project_cost_categories;
create policy project_cost_categories_member_select on public.project_cost_categories
for select to authenticated
using (exists (
  select 1 from public.projects p
  where p.id = project_cost_categories.project_id
    and (select private.is_company_member(p.company_id))
));

create index if not exists clients_company_id_idx on public.clients(company_id);
create index if not exists projects_company_id_idx on public.projects(company_id);
create index if not exists projects_client_id_idx on public.projects(client_id);
create index if not exists project_cost_categories_project_id_idx on public.project_cost_categories(project_id);

-- Owner helper and initial write policies required by subsequent migrations.
create or replace function private.is_company_owner(target_company uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.company_memberships m
    where m.company_id = target_company
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.is_owner = true
  );
$$;

revoke all on function private.is_company_owner(uuid) from public, anon;
grant execute on function private.is_company_owner(uuid) to authenticated;

drop policy if exists clients_owner_insert on public.clients;
create policy clients_owner_insert on public.clients
for insert to authenticated
with check ((select private.is_company_owner(company_id)));

drop policy if exists clients_owner_update on public.clients;
create policy clients_owner_update on public.clients
for update to authenticated
using ((select private.is_company_owner(company_id)))
with check ((select private.is_company_owner(company_id)));

drop policy if exists projects_owner_insert on public.projects;
create policy projects_owner_insert on public.projects
for insert to authenticated
with check ((select private.is_company_owner(company_id)));

drop policy if exists projects_owner_update on public.projects;
create policy projects_owner_update on public.projects
for update to authenticated
using ((select private.is_company_owner(company_id)))
with check ((select private.is_company_owner(company_id)));

drop policy if exists project_financial_summaries_owner_insert on public.project_financial_summaries;
create policy project_financial_summaries_owner_insert on public.project_financial_summaries
for insert to authenticated
with check (exists (
  select 1 from public.projects p
  where p.id = project_financial_summaries.project_id
    and (select private.is_company_owner(p.company_id))
));

drop policy if exists project_financial_summaries_owner_update on public.project_financial_summaries;
create policy project_financial_summaries_owner_update on public.project_financial_summaries
for update to authenticated
using (exists (
  select 1 from public.projects p
  where p.id = project_financial_summaries.project_id
    and (select private.is_company_owner(p.company_id))
))
with check (exists (
  select 1 from public.projects p
  where p.id = project_financial_summaries.project_id
    and (select private.is_company_owner(p.company_id))
));

drop policy if exists project_cost_categories_owner_write on public.project_cost_categories;
create policy project_cost_categories_owner_write on public.project_cost_categories
for all to authenticated
using (exists (
  select 1 from public.projects p
  where p.id = project_cost_categories.project_id
    and (select private.is_company_owner(p.company_id))
))
with check (exists (
  select 1 from public.projects p
  where p.id = project_cost_categories.project_id
    and (select private.is_company_owner(p.company_id))
));

-- Company invite foundation used by signup and access management.
create table if not exists public.company_invites (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  email text not null,
  position_code text not null,
  is_owner boolean not null default false,
  invited_by uuid references auth.users(id),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  unique(company_id, email)
);

alter table public.company_invites enable row level security;

drop policy if exists company_invites_owner_select on public.company_invites;
create policy company_invites_owner_select on public.company_invites
for select to authenticated
using ((select private.is_company_owner(company_id)));

create or replace function public.accept_company_invite_on_signup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  invite_row public.company_invites%rowtype;
  membership_id uuid;
  position_id uuid;
begin
  select * into invite_row
  from public.company_invites
  where lower(email) = lower(coalesce(new.email, ''))
    and accepted_at is null
  order by created_at asc
  limit 1;

  if invite_row.id is null then
    return new;
  end if;

  insert into public.company_memberships (company_id, user_id, status, is_owner)
  values (invite_row.company_id, new.id, 'active', invite_row.is_owner)
  on conflict (company_id, user_id) do update set
    status = 'active',
    is_owner = excluded.is_owner
  returning id into membership_id;

  select id into position_id
  from public.positions
  where code = invite_row.position_code
    and is_system_template = true
  limit 1;

  if position_id is not null then
    insert into public.membership_positions (membership_id, position_id, is_primary)
    values (membership_id, position_id, true)
    on conflict (membership_id, position_id) do update set is_primary = true;
  end if;

  update public.company_invites
  set accepted_at = now()
  where id = invite_row.id;

  return new;
end;
$$;

revoke execute on function public.accept_company_invite_on_signup() from public, anon, authenticated;

drop trigger if exists on_auth_user_accept_company_invite on auth.users;
create trigger on_auth_user_accept_company_invite
after insert on auth.users
for each row execute procedure public.accept_company_invite_on_signup();
