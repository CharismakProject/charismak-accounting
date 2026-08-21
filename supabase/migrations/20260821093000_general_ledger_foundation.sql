-- Double-entry accounting foundation for company-level reporting and project job costing.

create table if not exists public.chart_of_accounts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null,
  name text not null,
  account_type text not null check (account_type in ('asset','liability','equity','income','expense')),
  subtype text,
  normal_balance text not null check (normal_balance in ('debit','credit')),
  is_system boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, code)
);

create table if not exists public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  entry_date date not null,
  reference text,
  description text,
  source_type text,
  source_id uuid,
  status text not null default 'draft' check (status in ('draft','posted','reversed')),
  reversal_of uuid references public.journal_entries(id) on delete set null,
  created_by uuid references auth.users(id),
  posted_by uuid references auth.users(id),
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.journal_lines (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.journal_entries(id) on delete cascade,
  account_id uuid not null references public.chart_of_accounts(id),
  financial_account_id uuid references public.financial_accounts(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  description text,
  debit numeric(18,2) not null default 0 check (debit >= 0),
  credit numeric(18,2) not null default 0 check (credit >= 0),
  created_at timestamptz not null default now(),
  check ((debit > 0 and credit = 0) or (credit > 0 and debit = 0))
);

create table if not exists public.canonical_journal_links (
  canonical_transaction_id uuid primary key references public.canonical_transactions(id) on delete cascade,
  journal_entry_id uuid not null references public.journal_entries(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists idx_chart_of_accounts_company on public.chart_of_accounts(company_id, is_active, code);
create index if not exists idx_journal_entries_company_date on public.journal_entries(company_id, entry_date desc);
create index if not exists idx_journal_lines_entry on public.journal_lines(entry_id);
create index if not exists idx_journal_lines_project on public.journal_lines(project_id) where project_id is not null;
create index if not exists idx_journal_lines_financial_account on public.journal_lines(financial_account_id) where financial_account_id is not null;

alter table public.chart_of_accounts enable row level security;
alter table public.journal_entries enable row level security;
alter table public.journal_lines enable row level security;
alter table public.canonical_journal_links enable row level security;

drop policy if exists chart_of_accounts_read on public.chart_of_accounts;
create policy chart_of_accounts_read on public.chart_of_accounts for select using (
  private.is_company_owner(company_id)
  or private.has_company_wide_permission(company_id,'transactions.view')
  or private.has_company_wide_permission(company_id,'reports.view')
);

drop policy if exists chart_of_accounts_manage on public.chart_of_accounts;
create policy chart_of_accounts_manage on public.chart_of_accounts for all using (
  private.is_company_owner(company_id) or private.has_permission(company_id,'accounts.manage')
) with check (
  private.is_company_owner(company_id) or private.has_permission(company_id,'accounts.manage')
);

drop policy if exists journal_entries_read on public.journal_entries;
create policy journal_entries_read on public.journal_entries for select using (
  private.is_company_owner(company_id)
  or private.has_company_wide_permission(company_id,'transactions.view')
  or private.has_company_wide_permission(company_id,'reports.view')
);

drop policy if exists journal_entries_write on public.journal_entries;
create policy journal_entries_write on public.journal_entries for all using (
  private.is_company_owner(company_id) or private.has_permission(company_id,'transactions.post')
) with check (
  private.is_company_owner(company_id) or private.has_permission(company_id,'transactions.post')
);

drop policy if exists journal_lines_read on public.journal_lines;
create policy journal_lines_read on public.journal_lines for select using (
  exists (
    select 1 from public.journal_entries je
    where je.id=journal_lines.entry_id
      and (
        private.is_company_owner(je.company_id)
        or private.has_company_wide_permission(je.company_id,'transactions.view')
        or private.has_company_wide_permission(je.company_id,'reports.view')
      )
  )
);

drop policy if exists journal_lines_write on public.journal_lines;
create policy journal_lines_write on public.journal_lines for all using (
  exists (
    select 1 from public.journal_entries je
    where je.id=journal_lines.entry_id
      and (private.is_company_owner(je.company_id) or private.has_permission(je.company_id,'transactions.post'))
  )
) with check (
  exists (
    select 1 from public.journal_entries je
    where je.id=journal_lines.entry_id
      and (private.is_company_owner(je.company_id) or private.has_permission(je.company_id,'transactions.post'))
  )
);

drop policy if exists canonical_journal_links_read on public.canonical_journal_links;
create policy canonical_journal_links_read on public.canonical_journal_links for select using (
  exists (
    select 1
    from public.journal_entries je
    where je.id=canonical_journal_links.journal_entry_id
      and (
        private.is_company_owner(je.company_id)
        or private.has_company_wide_permission(je.company_id,'transactions.view')
        or private.has_company_wide_permission(je.company_id,'reports.view')
      )
  )
);

drop policy if exists canonical_journal_links_write on public.canonical_journal_links;
create policy canonical_journal_links_write on public.canonical_journal_links for all using (
  exists (
    select 1
    from public.journal_entries je
    where je.id=canonical_journal_links.journal_entry_id
      and (private.is_company_owner(je.company_id) or private.has_permission(je.company_id,'transactions.post'))
  )
) with check (
  exists (
    select 1
    from public.journal_entries je
    where je.id=canonical_journal_links.journal_entry_id
      and (private.is_company_owner(je.company_id) or private.has_permission(je.company_id,'transactions.post'))
  )
);

create or replace function private.seed_default_chart_of_accounts(target_company uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.chart_of_accounts(company_id,code,name,account_type,subtype,normal_balance,is_system)
  values
    (target_company,'1000','Bank & Cash','asset','cash_and_bank','debit',true),
    (target_company,'1100','Accounts Receivable','asset','trade_receivable','debit',true),
    (target_company,'1200','Retention Receivable','asset','retention_receivable','debit',true),
    (target_company,'1300','Other Receivables','asset','other_receivable','debit',true),
    (target_company,'2000','Accounts Payable','liability','trade_payable','credit',true),
    (target_company,'2100','Client Advances / Unearned Revenue','liability','client_advance','credit',true),
    (target_company,'2200','Director / Owner Loans','liability','owner_loan','credit',true),
    (target_company,'2300','Internal Clearing','liability','internal_clearing','credit',true),
    (target_company,'3000','Owners Equity','equity','owners_equity','credit',true),
    (target_company,'4000','Contract Revenue','income','project_revenue','credit',true),
    (target_company,'4100','Other Company Income','income','other_income','credit',true),
    (target_company,'5000','Project Direct Costs','expense','project_direct_cost','debit',true),
    (target_company,'5100','Direct Labour','expense','project_labour','debit',true),
    (target_company,'5200','Direct Materials','expense','project_materials','debit',true),
    (target_company,'5300','Subcontractors','expense','subcontractors','debit',true),
    (target_company,'6000','Company Overheads','expense','company_overhead','debit',true),
    (target_company,'6100','Staff Costs','expense','staff_costs','debit',true),
    (target_company,'6200','Administration & Office','expense','administration','debit',true),
    (target_company,'6300','Software & IT','expense','software_it','debit',true),
    (target_company,'6400','Transport & Travel','expense','transport_travel','debit',true),
    (target_company,'6500','Professional Fees','expense','professional_fees','debit',true),
    (target_company,'7000','Finance Costs','expense','finance_costs','debit',true),
    (target_company,'9990','Suspense / Unclassified','asset','suspense','debit',true)
  on conflict(company_id,code) do nothing;
end;
$$;

create or replace function private.seed_default_chart_on_company_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.seed_default_chart_of_accounts(new.id);
  return new;
end;
$$;

drop trigger if exists trg_seed_default_chart_of_accounts on public.companies;
create trigger trg_seed_default_chart_of_accounts
after insert on public.companies
for each row execute function private.seed_default_chart_on_company_insert();

do $$
declare r record;
begin
  for r in select id from public.companies loop
    perform private.seed_default_chart_of_accounts(r.id);
  end loop;
end $$;

create or replace function public.post_journal_entry(target_entry uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company uuid;
  v_status text;
  v_debits numeric;
  v_credits numeric;
  v_lines integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select company_id,status into v_company,v_status
  from public.journal_entries where id=target_entry for update;
  if v_company is null then raise exception 'Journal entry not found'; end if;
  if not (private.is_company_owner(v_company) or private.has_permission(v_company,'transactions.post')) then
    raise exception 'You do not have permission to post journal entries';
  end if;
  if v_status <> 'draft' then raise exception 'Only draft journal entries can be posted'; end if;

  select coalesce(sum(debit),0),coalesce(sum(credit),0),count(*)
    into v_debits,v_credits,v_lines
  from public.journal_lines where entry_id=target_entry;

  if v_lines < 2 then raise exception 'A journal entry requires at least two lines'; end if;
  if round(v_debits,2) <> round(v_credits,2) then raise exception 'Journal entry is not balanced'; end if;
  if round(v_debits,2) <= 0 then raise exception 'Journal entry total must be greater than zero'; end if;

  update public.journal_entries
  set status='posted',posted_by=auth.uid(),posted_at=now(),updated_at=now()
  where id=target_entry;

  return jsonb_build_object('entry_id',target_entry,'debits',v_debits,'credits',v_credits,'lines',v_lines,'status','posted');
end;
$$;

revoke execute on function private.seed_default_chart_of_accounts(uuid) from public,anon,authenticated;
revoke execute on function private.seed_default_chart_on_company_insert() from public,anon,authenticated;
grant execute on function public.post_journal_entry(uuid) to authenticated;
