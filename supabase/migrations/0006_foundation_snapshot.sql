-- Clean-install compatibility snapshot.
--
-- The live database received these objects through several early production
-- migrations that were not originally committed to this repository. Later
-- migrations in this repo assume these tables/functions already exist. Keeping
-- this as one idempotent foundation migration makes local QA and a future fresh
-- installation deterministic without copying production data.

-- ---------------------------------------------------------------------------
-- Core permission helpers / role access
-- ---------------------------------------------------------------------------

create or replace function private.has_permission(target_company uuid, target_permission text)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select
    private.is_company_owner(target_company)
    or exists (
      select 1
      from public.company_memberships m
      join public.membership_positions mp on mp.membership_id=m.id
      join public.position_permissions pp on pp.position_id=mp.position_id
      join public.permissions p on p.id=pp.permission_id
      where m.company_id=target_company
        and m.user_id=auth.uid()
        and m.status='active'
        and p.code=target_permission
        and not exists (
          select 1 from public.membership_permission_overrides o
          where o.membership_id=m.id and o.permission_id=p.id and o.allowed=false
        )
    )
    or exists (
      select 1
      from public.company_memberships m
      join public.membership_permission_overrides o on o.membership_id=m.id and o.allowed=true
      join public.permissions p on p.id=o.permission_id
      where m.company_id=target_company
        and m.user_id=auth.uid()
        and m.status='active'
        and p.code=target_permission
    );
$$;

create or replace function private.has_company_wide_permission(target_company uuid,target_permission text)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select private.is_company_owner(target_company)
  or exists (
    select 1
    from public.company_memberships m
    join public.membership_positions mp on mp.membership_id=m.id
    join public.position_permissions pp on pp.position_id=mp.position_id
    join public.permissions p on p.id=pp.permission_id
    where m.company_id=target_company and m.user_id=auth.uid() and m.status='active'
      and p.code=target_permission and pp.scope='company_wide'::public.permission_scope
      and not exists(select 1 from public.membership_permission_overrides o where o.membership_id=m.id and o.permission_id=p.id and o.allowed=false)
  )
  or exists (
    select 1
    from public.company_memberships m
    join public.membership_permission_overrides o on o.membership_id=m.id and o.allowed=true
    join public.permissions p on p.id=o.permission_id
    where m.company_id=target_company and m.user_id=auth.uid() and m.status='active'
      and p.code=target_permission and o.scope='company_wide'::public.permission_scope
  );
$$;

insert into public.permissions(code,description) values
 ('accounts.manage','Create and manage financial accounts'),
 ('statements.upload','Upload and analyse account statements'),
 ('budgets.manage','Create and revise project budgets'),
 ('commitments.manage','Create and manage commitments'),
 ('approvals.request','Create spending and funding requests'),
 ('approvals.manage','Approve, reject or return requests'),
 ('treasury.view','View cash, account and funding positions'),
 ('imprest.manage','Manage site imprest and retirement'),
 ('variations.manage','Create and manage project variations'),
 ('audit.view','View audit history'),
 ('settings.manage','Manage company configuration and role emails'),
 ('progress.update','Record project/site progress updates'),
 ('documents.upload','Upload project evidence and documents')
on conflict(code) do update set description=excluded.description;

create table if not exists public.company_role_emails (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  position_code text not null,
  interface_family public.interface_family not null,
  email text not null,
  display_label text,
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, position_code, email)
);
create unique index if not exists company_role_emails_company_email_lower_uidx on public.company_role_emails(company_id,lower(email));

create table if not exists public.user_interface_preferences (
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  active_interface public.interface_family not null,
  switched_at timestamptz not null default now(),
  primary key(company_id,user_id)
);

create table if not exists public.project_assignments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  membership_id uuid not null references public.company_memberships(id) on delete cascade,
  assignment_role text,
  can_view_cost boolean not null default true,
  can_request boolean not null default true,
  can_approve boolean not null default false,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique(project_id,membership_id)
);

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  actor_user_id uuid references auth.users(id),
  actor_email text,
  acting_interface public.interface_family,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  project_id uuid references public.projects(id) on delete set null,
  before_data jsonb,
  after_data jsonb,
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_log_company_created_idx on public.audit_log(company_id,created_at desc);
create index if not exists audit_log_actor_created_idx on public.audit_log(actor_user_id,created_at desc);
create index if not exists audit_log_project_created_idx on public.audit_log(project_id,created_at desc);

alter table public.company_role_emails enable row level security;
alter table public.user_interface_preferences enable row level security;
alter table public.project_assignments enable row level security;
alter table public.audit_log enable row level security;

create or replace function private.current_interface(target_company uuid)
returns public.interface_family
language plpgsql
stable
security definer
set search_path=''
as $$
declare v_interface public.interface_family;
begin
  select uip.active_interface into v_interface
  from public.user_interface_preferences uip
  where uip.company_id=target_company and uip.user_id=auth.uid();
  if v_interface is not null then return v_interface; end if;
  if private.is_company_owner(target_company) then return 'md_owner'::public.interface_family; end if;
  select p.interface_family into v_interface
  from public.company_memberships m
  join public.membership_positions mp on mp.membership_id=m.id
  join public.positions p on p.id=mp.position_id
  where m.company_id=target_company and m.user_id=auth.uid() and m.status='active'
  order by mp.is_primary desc,mp.created_at asc limit 1;
  return coalesce(v_interface,'project_manager'::public.interface_family);
end;
$$;

create or replace function private.can_access_project(target_company uuid,target_project uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select private.is_company_owner(target_company)
  or private.has_company_wide_permission(target_company,'projects.view')
  or exists (
    select 1 from public.project_assignments pa
    join public.company_memberships m on m.id=pa.membership_id
    where pa.company_id=target_company and pa.project_id=target_project
      and m.user_id=auth.uid() and m.status='active'
  );
$$;

create or replace function private.can_view_project_cost(target_company uuid,target_project uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select private.is_company_owner(target_company)
  or private.has_company_wide_permission(target_company,'transactions.view')
  or private.has_company_wide_permission(target_company,'profitability.view')
  or exists (
    select 1 from public.project_assignments pa
    join public.company_memberships m on m.id=pa.membership_id
    where pa.company_id=target_company and pa.project_id=target_project
      and pa.can_view_cost=true and m.user_id=auth.uid() and m.status='active'
  );
$$;

create or replace function private.project_company(target_project uuid)
returns uuid language sql stable security definer set search_path='' as $$
  select company_id from public.projects where id=target_project;
$$;

create or replace function private.normalized_party(value text)
returns text language sql immutable set search_path='' as $$
  select regexp_replace(regexp_replace(lower(trim(coalesce(value,''))),'\s+',' ','g'),'[^a-z0-9 ._\-/]','','g')
$$;

-- ---------------------------------------------------------------------------
-- Storage identity helper and financial document bucket
-- ---------------------------------------------------------------------------

create or replace function private.storage_company_id(object_name text)
returns uuid
language plpgsql
stable
security definer
set search_path=''
as $$
declare first_folder text;
begin
  first_folder := (storage.foldername(object_name))[1];
  if first_folder is null then return null; end if;
  return first_folder::uuid;
exception when others then return null;
end;
$$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('financial-documents','financial-documents',false,20971520,array[
  'application/pdf','text/csv','application/csv','application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','image/jpeg','image/png'
])
on conflict(id) do update set public=false,file_size_limit=20971520,allowed_mime_types=excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- Rich project/accounting columns that later migrations rely on
-- ---------------------------------------------------------------------------

alter table public.projects
  add column if not exists description text,
  add column if not exists project_type text,
  add column if not exists site_address text,
  add column if not exists project_image_path text,
  add column if not exists image_alt text,
  add column if not exists progress_percent numeric not null default 0 check(progress_percent>=0 and progress_percent<=100),
  add column if not exists practical_completion_date date,
  add column if not exists retention_period_months integer,
  add column if not exists external_reference text;

alter table public.project_financial_summaries
  add column if not exists commitments_approved numeric not null default 0,
  add column if not exists commitments_paid numeric not null default 0,
  add column if not exists original_budget numeric not null default 0,
  add column if not exists revised_budget numeric not null default 0,
  add column if not exists company_funding numeric not null default 0,
  add column if not exists other_financing numeric not null default 0,
  add column if not exists actual_paid_cost numeric not null default 0,
  add column if not exists committed_cost numeric not null default 0,
  add column if not exists forecast_cost_to_complete numeric not null default 0,
  add column if not exists forecast_final_cost numeric not null default 0,
  add column if not exists expected_contract_revenue numeric not null default 0,
  add column if not exists work_certified numeric not null default 0,
  add column if not exists invoiced_amount numeric not null default 0,
  add column if not exists paid_revenue numeric not null default 0,
  add column if not exists retention_held numeric not null default 0,
  add column if not exists forecast_profit numeric not null default 0,
  add column if not exists overhead_allocated numeric not null default 0,
  add column if not exists forecast_override boolean not null default false;

alter table public.financial_accounts
  add column if not exists current_balance numeric,
  add column if not exists balance_as_of date,
  add column if not exists account_scope text not null default 'company',
  add column if not exists institution_key text,
  add column if not exists last_statement_at timestamptz;

alter table public.statement_imports
  add column if not exists parser_name text,
  add column if not exists parser_confidence numeric,
  add column if not exists parse_warnings jsonb not null default '[]'::jsonb,
  add column if not exists analysed_at timestamptz,
  add column if not exists rows_auto_posted integer not null default 0,
  add column if not exists rows_pending_review integer not null default 0;

alter table public.canonical_transactions
  add column if not exists transaction_type text,
  add column if not exists funding_source text,
  add column if not exists is_personal_non_business boolean not null default false,
  add column if not exists is_internal_transfer boolean not null default false,
  add column if not exists is_posted boolean not null default false,
  add column if not exists posted_at timestamptz,
  add column if not exists created_by uuid references auth.users(id),
  add column if not exists reversal_of uuid references public.canonical_transactions(id),
  add column if not exists reversed_at timestamptz,
  add column if not exists notes text;

-- ---------------------------------------------------------------------------
-- Construction finance operating tables
-- ---------------------------------------------------------------------------

create table if not exists public.project_commitments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  description text not null,
  approved_amount numeric(18,2),
  paid_amount numeric(18,2) not null default 0,
  outstanding_amount numeric(18,2) not null default 0,
  status text not null default 'outstanding',
  source_label text,
  created_at timestamptz not null default now(),
  unique(project_id,description)
);

create table if not exists public.project_exclusions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  description text not null,
  amount numeric(18,2) not null,
  reason text not null,
  source_label text,
  created_at timestamptz not null default now(),
  unique(project_id,description)
);

create table if not exists public.company_finance_settings (
  company_id uuid primary key references public.companies(id) on delete cascade,
  approval_mode text not null default 'threshold' check(approval_mode in ('none','threshold','multi_level','custom')),
  default_approval_threshold numeric not null default 0,
  maker_checker boolean not null default true,
  allow_emergency_retrospective boolean not null default true,
  receipt_required_above numeric not null default 0,
  overhead_allocation_method text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.approval_rules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  request_type text,
  project_id uuid references public.projects(id) on delete cascade,
  min_amount numeric not null default 0,
  max_amount numeric,
  required_position_code text,
  levels integer not null default 1 check(levels>0),
  active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.project_budget_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  cost_code text,
  work_section text,
  description text not null,
  original_budget numeric not null default 0,
  revised_budget numeric not null default 0,
  committed_amount numeric not null default 0,
  actual_amount numeric not null default 0,
  forecast_remaining numeric not null default 0,
  source_document_id uuid references public.source_documents(id) on delete set null,
  sort_order integer not null default 0,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_variations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  variation_code text,
  title text not null,
  description text,
  variation_type text not null default 'addition' check(variation_type in ('addition','omission','substitution','other')),
  amount numeric not null default 0,
  status text not null default 'proposed' check(status in ('proposed','submitted','under_review','approved','rejected','executed_unapproved')),
  client_approved_at timestamptz,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.approval_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  requested_by uuid not null references auth.users(id),
  request_type text not null,
  description text not null,
  amount numeric not null default 0,
  currency_code text not null default 'NGN',
  status text not null default 'pending' check(status in ('draft','pending','approved','partially_approved','rejected','returned','cancelled','paid','partially_paid','emergency_retrospective')),
  urgency text not null default 'normal' check(urgency in ('normal','urgent','emergency')),
  approved_amount numeric not null default 0,
  paid_amount numeric not null default 0,
  evidence_required boolean not null default false,
  source_document_id uuid references public.source_documents(id) on delete set null,
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.approval_actions (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.approval_requests(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id),
  action text not null check(action in ('submit','approve','partial_approve','reject','return','cancel','mark_paid','override','comment')),
  amount numeric,
  comments text,
  acting_interface public.interface_family,
  created_at timestamptz not null default now()
);

create table if not exists public.imprest_accounts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  custodian_membership_id uuid references public.company_memberships(id) on delete set null,
  name text not null,
  approved_limit numeric not null default 0,
  current_balance numeric not null default 0,
  status text not null default 'active' check(status in ('active','suspended','closed')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.imprest_entries (
  id uuid primary key default gen_random_uuid(),
  imprest_account_id uuid not null references public.imprest_accounts(id) on delete cascade,
  canonical_transaction_id uuid references public.canonical_transactions(id) on delete set null,
  entry_type text not null check(entry_type in ('release','expense','refund','retirement','adjustment')),
  amount numeric not null,
  category_name text,
  description text,
  evidence_document_id uuid references public.source_documents(id) on delete set null,
  status text not null default 'recorded' check(status in ('draft','recorded','submitted','approved','rejected')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.transfer_pairs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  transfer_date date not null,
  amount numeric not null check(amount>=0),
  from_account_id uuid references public.financial_accounts(id) on delete set null,
  to_account_id uuid references public.financial_accounts(id) on delete set null,
  from_project_id uuid references public.projects(id) on delete set null,
  to_project_id uuid references public.projects(id) on delete set null,
  debit_transaction_id uuid references public.canonical_transactions(id) on delete set null,
  credit_transaction_id uuid references public.canonical_transactions(id) on delete set null,
  status text not null default 'suggested' check(status in ('suggested','confirmed','rejected','partial')),
  creates_due_to_from boolean not null default false,
  confirmed_by uuid references auth.users(id),
  confirmed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.inter_project_obligations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  creditor_project_id uuid references public.projects(id) on delete set null,
  debtor_project_id uuid references public.projects(id) on delete set null,
  amount numeric not null default 0,
  settled_amount numeric not null default 0,
  source_transfer_id uuid references public.transfer_pairs(id) on delete set null,
  description text,
  status text not null default 'open' check(status in ('open','partially_settled','settled','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.transaction_rules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  rule_name text not null,
  match_field text not null check(match_field in ('narration','counterparty','reference','any_text')),
  pattern text not null,
  classification text,
  project_id uuid references public.projects(id) on delete set null,
  category_name text,
  transaction_type text,
  priority integer not null default 100,
  auto_apply boolean not null default false,
  learned_from_user_id uuid references auth.users(id),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_progress_updates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  progress_percent numeric not null check(progress_percent>=0 and progress_percent<=100),
  work_summary text,
  cost_to_complete_override numeric,
  update_date date not null default current_date,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  notification_type text not null,
  title text not null,
  body text,
  href text,
  entity_type text,
  entity_id uuid,
  priority text not null default 'normal' check(priority in ('low','normal','high','urgent')),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.project_relationships (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  relationship_type text not null check(relationship_type in ('client','sponsor','contact','worker','artisan','supplier','vendor','subcontractor','consultant','other')),
  display_name text not null,
  normalized_name text not null,
  match_terms text[] not null default '{}',
  direction_rule text not null default 'any' check(direction_rule in ('any','credit','debit')),
  default_classification text,
  default_category text,
  confidence numeric(5,2) not null default 90,
  active_from date,
  active_to date,
  source text,
  learned_from_transaction_id uuid references public.canonical_transactions(id) on delete set null,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  required_terms text[] not null default '{}',
  excluded_terms text[] not null default '{}',
  unique(project_id,relationship_type,normalized_name)
);

-- ---------------------------------------------------------------------------
-- RLS baseline for the restored objects. Later migrations deliberately tighten
-- these policies further.
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array[
    'project_commitments','project_exclusions','company_finance_settings','approval_rules',
    'project_budget_items','project_variations','approval_requests','approval_actions',
    'imprest_accounts','imprest_entries','transfer_pairs','inter_project_obligations',
    'transaction_rules','project_progress_updates','notifications','project_relationships'
  ] loop
    execute format('alter table public.%I enable row level security',t);
  end loop;
end $$;

drop policy if exists notifications_user_select on public.notifications;
create policy notifications_user_select on public.notifications for select to authenticated using(user_id=auth.uid());
drop policy if exists notifications_user_update on public.notifications;
create policy notifications_user_update on public.notifications for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());

drop policy if exists project_relationships_select on public.project_relationships;
create policy project_relationships_select on public.project_relationships for select to authenticated using(private.is_company_member(company_id));
drop policy if exists project_relationships_write on public.project_relationships;
create policy project_relationships_write on public.project_relationships for all to authenticated
using(private.is_company_owner(company_id) or private.has_permission(company_id,'projects.manage') or private.has_permission(company_id,'transactions.confirm'))
with check(private.is_company_owner(company_id) or private.has_permission(company_id,'projects.manage') or private.has_permission(company_id,'transactions.confirm'));

drop policy if exists company_role_emails_member_read on public.company_role_emails;
create policy company_role_emails_member_read on public.company_role_emails for select to authenticated using(private.is_company_member(company_id));
drop policy if exists company_role_emails_owner_manage on public.company_role_emails;
create policy company_role_emails_owner_manage on public.company_role_emails for all to authenticated using(private.is_company_owner(company_id)) with check(private.is_company_owner(company_id));

drop policy if exists interface_preferences_own on public.user_interface_preferences;
create policy interface_preferences_own on public.user_interface_preferences for all to authenticated
using(private.is_company_member(company_id) and user_id=auth.uid())
with check(private.is_company_member(company_id) and user_id=auth.uid());

drop policy if exists project_assignments_member_read on public.project_assignments;
create policy project_assignments_member_read on public.project_assignments for select to authenticated using(private.is_company_member(company_id));
drop policy if exists project_assignments_owner_manage on public.project_assignments;
create policy project_assignments_owner_manage on public.project_assignments for all to authenticated using(private.is_company_owner(company_id)) with check(private.is_company_owner(company_id));

drop policy if exists audit_log_owner_read on public.audit_log;
create policy audit_log_owner_read on public.audit_log for select to authenticated using(private.is_company_owner(company_id) or actor_user_id=auth.uid());

drop policy if exists project_commitments_member_select on public.project_commitments;
create policy project_commitments_member_select on public.project_commitments for select to authenticated
using(exists(select 1 from public.projects p where p.id=project_id and private.is_company_member(p.company_id)));
drop policy if exists project_commitments_owner_write on public.project_commitments;
create policy project_commitments_owner_write on public.project_commitments for all to authenticated
using(exists(select 1 from public.projects p where p.id=project_id and private.is_company_owner(p.company_id)))
with check(exists(select 1 from public.projects p where p.id=project_id and private.is_company_owner(p.company_id)));

drop policy if exists project_exclusions_member_select on public.project_exclusions;
create policy project_exclusions_member_select on public.project_exclusions for select to authenticated
using(exists(select 1 from public.projects p where p.id=project_id and private.is_company_member(p.company_id)));
drop policy if exists project_exclusions_owner_write on public.project_exclusions;
create policy project_exclusions_owner_write on public.project_exclusions for all to authenticated
using(exists(select 1 from public.projects p where p.id=project_id and private.is_company_owner(p.company_id)))
with check(exists(select 1 from public.projects p where p.id=project_id and private.is_company_owner(p.company_id)));

drop policy if exists finance_settings_member_read on public.company_finance_settings;
create policy finance_settings_member_read on public.company_finance_settings for select to authenticated using(private.is_company_member(company_id));
drop policy if exists finance_settings_owner_manage on public.company_finance_settings;
create policy finance_settings_owner_manage on public.company_finance_settings for all to authenticated using(private.is_company_owner(company_id)) with check(private.is_company_owner(company_id));

drop policy if exists approval_rules_member_read on public.approval_rules;
create policy approval_rules_member_read on public.approval_rules for select to authenticated using(private.is_company_member(company_id));
drop policy if exists approval_rules_manage on public.approval_rules;
create policy approval_rules_manage on public.approval_rules for all to authenticated using(private.has_permission(company_id,'settings.manage')) with check(private.has_permission(company_id,'settings.manage'));

drop policy if exists approval_requests_member_read on public.approval_requests;
create policy approval_requests_member_read on public.approval_requests for select to authenticated using(private.is_company_member(company_id));
drop policy if exists approval_requests_create on public.approval_requests;
create policy approval_requests_create on public.approval_requests for insert to authenticated with check(private.has_permission(company_id,'approvals.request'));
drop policy if exists approval_requests_manage on public.approval_requests;
create policy approval_requests_manage on public.approval_requests for update to authenticated using(private.has_permission(company_id,'approvals.manage')) with check(private.has_permission(company_id,'approvals.manage'));

drop policy if exists approval_actions_member_read on public.approval_actions;
create policy approval_actions_member_read on public.approval_actions for select to authenticated
using(exists(select 1 from public.approval_requests r where r.id=request_id and private.is_company_member(r.company_id)));
drop policy if exists approval_actions_create on public.approval_actions;
create policy approval_actions_create on public.approval_actions for insert to authenticated
with check(exists(select 1 from public.approval_requests r where r.id=request_id and (r.requested_by=auth.uid() or private.has_permission(r.company_id,'approvals.manage'))));

drop policy if exists transfer_pairs_member_read on public.transfer_pairs;
create policy transfer_pairs_member_read on public.transfer_pairs for select to authenticated using(private.is_company_member(company_id));
drop policy if exists transfer_pairs_manage on public.transfer_pairs;
create policy transfer_pairs_manage on public.transfer_pairs for all to authenticated using(private.has_permission(company_id,'transactions.confirm')) with check(private.has_permission(company_id,'transactions.confirm'));

drop policy if exists obligations_member_read on public.inter_project_obligations;
create policy obligations_member_read on public.inter_project_obligations for select to authenticated using(private.is_company_member(company_id));
drop policy if exists obligations_manage on public.inter_project_obligations;
create policy obligations_manage on public.inter_project_obligations for all to authenticated using(private.has_permission(company_id,'transactions.confirm')) with check(private.has_permission(company_id,'transactions.confirm'));

drop policy if exists transaction_rules_member_read on public.transaction_rules;
create policy transaction_rules_member_read on public.transaction_rules for select to authenticated using(private.is_company_member(company_id));
drop policy if exists transaction_rules_manage on public.transaction_rules;
create policy transaction_rules_manage on public.transaction_rules for all to authenticated using(private.has_permission(company_id,'transactions.confirm')) with check(private.has_permission(company_id,'transactions.confirm'));

-- Project-scope tables.
do $$
declare t text;
begin
  foreach t in array array['project_budget_items','project_variations','imprest_accounts','project_progress_updates'] loop
    execute format('drop policy if exists %I_member_read on public.%I',t,t);
    execute format('create policy %I_member_read on public.%I for select to authenticated using (private.is_company_member(private.project_company(project_id)))',t,t);
    execute format('drop policy if exists %I_manage on public.%I',t,t);
    execute format('create policy %I_manage on public.%I for all to authenticated using (private.has_permission(private.project_company(project_id),''projects.manage'')) with check (private.has_permission(private.project_company(project_id),''projects.manage''))',t,t);
  end loop;
end $$;

drop policy if exists imprest_entries_member_read on public.imprest_entries;
create policy imprest_entries_member_read on public.imprest_entries for select to authenticated
using(exists(select 1 from public.imprest_accounts ia where ia.id=imprest_account_id and private.is_company_member(private.project_company(ia.project_id))));
drop policy if exists imprest_entries_manage on public.imprest_entries;
create policy imprest_entries_manage on public.imprest_entries for all to authenticated
using(exists(select 1 from public.imprest_accounts ia where ia.id=imprest_account_id and private.has_permission(private.project_company(ia.project_id),'imprest.manage')))
with check(exists(select 1 from public.imprest_accounts ia where ia.id=imprest_account_id and private.has_permission(private.project_company(ia.project_id),'imprest.manage')));

-- Private project media bucket used by the project profile workflow.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('project-media','project-media',false,10485760,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=10485760,allowed_mime_types=excluded.allowed_mime_types;

-- Seed default role permissions. Owners bypass this matrix.
insert into public.position_permissions(position_id,permission_id,scope)
select pos.id,perm.id,
  case when pos.interface_family='project_manager' then 'assigned_projects'::public.permission_scope else 'company_wide'::public.permission_scope end
from public.positions pos cross join public.permissions perm
where pos.is_system_template=true
and (
  pos.interface_family='md_owner'
  or (pos.interface_family='accountant_cfo' and perm.code in (
    'company.view','projects.view','transactions.view','transactions.create','transactions.confirm','transactions.post',
    'payments.approve','payments.pay','reconciliation.manage','reports.view','reports.export','accounts.manage',
    'statements.upload','commitments.manage','approvals.request','approvals.manage','treasury.view','imprest.manage','documents.upload'
  ))
  or (pos.interface_family='project_director' and perm.code in (
    'company.view','projects.view','projects.manage','transactions.view','payments.approve','profitability.view',
    'reports.view','reports.export','budgets.manage','commitments.manage','approvals.request','approvals.manage',
    'treasury.view','variations.manage','statements.upload','progress.update','documents.upload'
  ))
  or (pos.interface_family='project_manager' and perm.code in (
    'projects.view','transactions.view','transactions.create','reports.view','commitments.manage','approvals.request','imprest.manage','progress.update','documents.upload'
  ))
)
on conflict(position_id,permission_id) do update set scope=excluded.scope;

insert into public.company_finance_settings(company_id)
select id from public.companies on conflict(company_id) do nothing;

-- A lightweight statement review queue is required by the current web UI.
create or replace function public.statement_review_queue(
  target_import uuid,
  target_view text default 'review',
  target_keyword text default null,
  target_limit integer default 50,
  target_offset integer default 0
)
returns table(row_id uuid,total_count bigint)
language sql
security definer
set search_path=''
as $$
  with access_check as (
    select si.id from public.statement_imports si
    where si.id=target_import and private.is_company_member(si.company_id)
  ), filtered as (
    select sr.id,sr.row_index
    from public.statement_rows sr join access_check ac on ac.id=sr.import_id
    where (target_keyword is null or btrim(target_keyword)='' or coalesce(sr.narration,'') ilike '%'||target_keyword||'%')
      and case lower(coalesce(target_view,'review'))
        when 'posted' then exists(
          select 1 from public.statement_row_transaction_links l
          join public.canonical_transactions ct on ct.id=l.canonical_transaction_id
          where l.statement_row_id=sr.id and l.is_primary=true and ct.status in ('confirmed','confirmed_reconciliation_only')
        )
        when 'known' then sr.detection_status='already_known'::public.row_detection_status and not exists(
          select 1 from public.statement_row_transaction_links l
          join public.canonical_transactions ct on ct.id=l.canonical_transaction_id
          where l.statement_row_id=sr.id and l.is_primary=true and ct.status in ('confirmed','confirmed_reconciliation_only')
        )
        when 'all' then true
        else not exists(select 1 from public.statement_row_transaction_links l where l.statement_row_id=sr.id and l.is_primary=true)
             and sr.detection_status<>'already_known'::public.row_detection_status
      end
  )
  select f.id,count(*) over() from filtered f order by f.row_index
  limit greatest(1,least(coalesce(target_limit,50),200))
  offset greatest(coalesce(target_offset,0),0);
$$;

grant execute on function public.statement_review_queue(uuid,text,text,integer,integer) to authenticated;
