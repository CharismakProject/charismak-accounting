-- DRAFT ONLY — DO NOT APPLY WITHOUT REVIEW.
-- Target inspected schema: Charismak Construction Accounting Supabase, 2026-09-02.
-- This draft is additive and preserves existing projects, transactions and journals.

-- 1. Shared top-level construction cost-code reference.
create table if not exists public.construction_cost_codes (
  code text primary key,
  name text not null,
  sort_order smallint not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint construction_cost_codes_code_check
    check (code ~ '^(0[1-9]|1[0-9]|20)$'),
  constraint construction_cost_codes_name_check
    check (length(trim(name)) >= 2)
);

insert into public.construction_cost_codes (code,name,sort_order) values
  ('01','Preliminaries',1),
  ('02','Substructure',2),
  ('03','Concrete & Reinforcement',3),
  ('04','Blockwork & Masonry',4),
  ('05','Structural Steel',5),
  ('06','Roofing',6),
  ('07','Doors',7),
  ('08','Windows & Glazing',8),
  ('09','Plastering & Screeding',9),
  ('10','Floor Finishes',10),
  ('11','Wall Finishes',11),
  ('12','Ceilings',12),
  ('13','Painting & Decoration',13),
  ('14','Joinery & Fixtures',14),
  ('15','Plumbing & Sanitary',15),
  ('16','Electrical',16),
  ('17','Mechanical & HVAC',17),
  ('18','External Works',18),
  ('19','Plant, Equipment & Specialist Works',19),
  ('20','Professional, Statutory & Other',20)
on conflict (code) do update
set name=excluded.name,sort_order=excluded.sort_order,is_active=true;

-- 2. Canonical link between an Estimator project and one Accounting project.
create table if not exists public.project_source_links (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  source_system text not null,
  source_project_id text not null,
  source_estimate_id text,
  source_version integer not null default 1 check (source_version > 0),
  source_fingerprint text,
  price_basis_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_source_links_source_system_check
    check (source_system in ('charismak_estimator')),
  constraint project_source_links_source_project_unique
    unique (company_id,source_system,source_project_id)
);

create index if not exists project_source_links_project_idx
  on public.project_source_links(project_id);

-- 3. Versioned internal project budgets.
-- Internal budget stays out of public.projects because assigned PMs currently have
-- project-row access. Budget tables are restricted to MD/accountant roles.
create table if not exists public.project_cost_budgets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  source_link_id uuid references public.project_source_links(id) on delete set null,
  budget_version integer not null default 1 check (budget_version > 0),
  status text not null default 'draft'
    check (status in ('draft','approved','superseded')),
  currency_code text not null default 'NGN'
    check (currency_code ~ '^[A-Z]{3}$'),
  direct_cost numeric(18,2) not null check (direct_cost >= 0),
  allowance_total numeric(18,2) not null default 0 check (allowance_total >= 0),
  internal_cost_budget numeric(18,2) not null check (internal_cost_budget >= 0),
  contract_value_snapshot numeric(18,2) check (contract_value_snapshot >= 0),
  source_fingerprint text not null,
  price_basis_at timestamptz,
  created_by uuid not null references auth.users(id),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  superseded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_cost_budgets_reconciled_check
    check (round(direct_cost + allowance_total,2) = round(internal_cost_budget,2)),
  constraint project_cost_budgets_version_unique
    unique (project_id,budget_version),
  constraint project_cost_budgets_source_fingerprint_unique
    unique (company_id,source_fingerprint)
);

create unique index if not exists project_cost_budgets_one_approved_idx
  on public.project_cost_budgets(project_id)
  where status='approved';
create index if not exists project_cost_budgets_project_idx
  on public.project_cost_budgets(project_id,status);

create table if not exists public.project_cost_budget_lines (
  id uuid primary key default gen_random_uuid(),
  budget_id uuid not null references public.project_cost_budgets(id) on delete cascade,
  source_line_id text not null,
  cost_code text not null references public.construction_cost_codes(code),
  description text not null,
  unit text,
  quantity numeric(20,6) check (quantity is null or quantity >= 0),
  rate numeric(18,4) check (rate is null or rate >= 0),
  amount numeric(18,2) not null check (amount >= 0),
  supply_responsibility text not null default 'unknown'
    check (supply_responsibility in ('contractor','client','unknown')),
  created_at timestamptz not null default now(),
  constraint project_cost_budget_lines_source_unique
    unique (budget_id,source_line_id)
);

create index if not exists project_cost_budget_lines_budget_idx
  on public.project_cost_budget_lines(budget_id,cost_code);

create table if not exists public.project_cost_budget_allowances (
  id uuid primary key default gen_random_uuid(),
  budget_id uuid not null references public.project_cost_budgets(id) on delete cascade,
  source_allowance_id text not null,
  kind text not null check (kind in ('contingency','other')),
  description text not null,
  amount numeric(18,2) not null check (amount >= 0),
  created_at timestamptz not null default now(),
  constraint project_cost_budget_allowances_source_unique
    unique (budget_id,source_allowance_id)
);

create index if not exists project_cost_budget_allowances_budget_idx
  on public.project_cost_budget_allowances(budget_id);

-- 4. Actual-cost bridge. Existing transactions remain valid with a NULL cost code.
alter table public.transactions
  add column if not exists cost_code text references public.construction_cost_codes(code);

create index if not exists transactions_project_cost_code_idx
  on public.transactions(project_id,cost_code)
  where cost_code is not null;

-- 5. Cost visibility follows live role semantics: MD + accountant can view.
-- PMs keep normal project access but do not automatically gain internal budget/profit data.
create or replace function private.can_view_project_cost(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.projects project
      join public.company_members member
        on member.company_id=project.company_id
       and member.user_id=(select auth.uid())
       and member.status='active'
      where project.id=target_project_id
        and member.role in ('md','accountant')
    );
$$;

revoke all on function private.can_view_project_cost(uuid) from public,anon;
grant execute on function private.can_view_project_cost(uuid) to authenticated;

alter table public.construction_cost_codes enable row level security;
alter table public.project_source_links enable row level security;
alter table public.project_cost_budgets enable row level security;
alter table public.project_cost_budget_lines enable row level security;
alter table public.project_cost_budget_allowances enable row level security;

drop policy if exists construction_cost_codes_select_authenticated on public.construction_cost_codes;
create policy construction_cost_codes_select_authenticated
on public.construction_cost_codes for select to authenticated
using (true);

drop policy if exists project_source_links_select_cost_roles on public.project_source_links;
create policy project_source_links_select_cost_roles
on public.project_source_links for select to authenticated
using ((select private.can_view_project_cost(project_id)));

drop policy if exists project_source_links_insert_md on public.project_source_links;
create policy project_source_links_insert_md
on public.project_source_links for insert to authenticated
with check (
  (select private.has_company_role(company_id,array['md']::company_role[]))
  and created_by=(select auth.uid())
  and exists (
    select 1 from public.projects project
    where project.id=project_id and project.company_id=company_id
  )
);

drop policy if exists project_source_links_update_md on public.project_source_links;
create policy project_source_links_update_md
on public.project_source_links for update to authenticated
using ((select private.has_company_role(company_id,array['md']::company_role[])))
with check ((select private.has_company_role(company_id,array['md']::company_role[])));

drop policy if exists project_cost_budgets_select_cost_roles on public.project_cost_budgets;
create policy project_cost_budgets_select_cost_roles
on public.project_cost_budgets for select to authenticated
using ((select private.can_view_project_cost(project_id)));

drop policy if exists project_cost_budgets_insert_md on public.project_cost_budgets;
create policy project_cost_budgets_insert_md
on public.project_cost_budgets for insert to authenticated
with check (
  (select private.has_company_role(company_id,array['md']::company_role[]))
  and created_by=(select auth.uid())
  and exists (
    select 1 from public.projects project
    where project.id=project_id and project.company_id=company_id
  )
);

drop policy if exists project_cost_budgets_update_md on public.project_cost_budgets;
create policy project_cost_budgets_update_md
on public.project_cost_budgets for update to authenticated
using ((select private.has_company_role(company_id,array['md']::company_role[])))
with check ((select private.has_company_role(company_id,array['md']::company_role[])));

-- Child budget records inherit access through the protected budget header.
drop policy if exists project_cost_budget_lines_select_cost_roles on public.project_cost_budget_lines;
create policy project_cost_budget_lines_select_cost_roles
on public.project_cost_budget_lines for select to authenticated
using (exists (
  select 1 from public.project_cost_budgets budget
  where budget.id=budget_id
    and (select private.can_view_project_cost(budget.project_id))
));

drop policy if exists project_cost_budget_lines_write_md on public.project_cost_budget_lines;
create policy project_cost_budget_lines_write_md
on public.project_cost_budget_lines for all to authenticated
using (exists (
  select 1 from public.project_cost_budgets budget
  where budget.id=budget_id
    and (select private.has_company_role(budget.company_id,array['md']::company_role[]))
))
with check (exists (
  select 1 from public.project_cost_budgets budget
  where budget.id=budget_id
    and (select private.has_company_role(budget.company_id,array['md']::company_role[]))
));

drop policy if exists project_cost_budget_allowances_select_cost_roles on public.project_cost_budget_allowances;
create policy project_cost_budget_allowances_select_cost_roles
on public.project_cost_budget_allowances for select to authenticated
using (exists (
  select 1 from public.project_cost_budgets budget
  where budget.id=budget_id
    and (select private.can_view_project_cost(budget.project_id))
));

drop policy if exists project_cost_budget_allowances_write_md on public.project_cost_budget_allowances;
create policy project_cost_budget_allowances_write_md
on public.project_cost_budget_allowances for all to authenticated
using (exists (
  select 1 from public.project_cost_budgets budget
  where budget.id=budget_id
    and (select private.has_company_role(budget.company_id,array['md']::company_role[]))
))
with check (exists (
  select 1 from public.project_cost_budgets budget
  where budget.id=budget_id
    and (select private.has_company_role(budget.company_id,array['md']::company_role[]))
));

-- Intentionally no direct mutation of existing transaction RLS or project RLS in V1.
-- Applying a cost code to transactions will use the existing authenticated posting/update path
-- once that write path is reconciled with the live database schema.
