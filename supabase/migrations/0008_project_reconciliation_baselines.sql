create table if not exists public.project_reconciliation_baselines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  period_start date,
  as_of_date date not null,
  source_label text not null,
  source_notes text,
  funding_received numeric(18,2) not null default 0,
  company_funding numeric(18,2) not null default 0,
  other_financing numeric(18,2) not null default 0,
  confirmed_expenditure numeric(18,2) not null default 0,
  outstanding_commitments numeric(18,2) not null default 0,
  category_breakdown jsonb not null default '[]'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(project_id,as_of_date,source_label)
);

alter table public.project_reconciliation_baselines enable row level security;

drop policy if exists project_reconciliation_baselines_select on public.project_reconciliation_baselines;
create policy project_reconciliation_baselines_select on public.project_reconciliation_baselines
for select using (private.is_company_member(company_id));

drop policy if exists project_reconciliation_baselines_manage on public.project_reconciliation_baselines;
create policy project_reconciliation_baselines_manage on public.project_reconciliation_baselines
for all using (private.is_company_owner(company_id) or private.has_permission(company_id,'projects.manage'))
with check (private.is_company_owner(company_id) or private.has_permission(company_id,'projects.manage'));

create or replace function public.refresh_project_financial_summary(target_project uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_company uuid;
  v_base_date date;
  v_period_start date;
  v_base_client numeric:=0;
  v_base_company numeric:=0;
  v_base_other numeric:=0;
  v_base_expense numeric:=0;
  v_base_commitments numeric:=0;
  v_base_categories jsonb:='[]'::jsonb;
  v_client_funding numeric:=0;
  v_company_funding numeric:=0;
  v_other_financing numeric:=0;
  v_expense numeric:=0;
  v_commitments numeric:=0;
  v_start date;
  v_end date;
  v_cash numeric:=0;
begin
  select p.company_id into v_company from public.projects p where p.id=target_project;
  if v_company is null then raise exception 'Project not found'; end if;
  if auth.uid() is not null and not (private.is_company_owner(v_company) or private.has_permission(v_company,'transactions.confirm') or private.has_permission(v_company,'projects.manage')) then raise exception 'Access denied'; end if;

  select b.as_of_date,b.period_start,b.funding_received,b.company_funding,b.other_financing,b.confirmed_expenditure,b.outstanding_commitments,b.category_breakdown
  into v_base_date,v_period_start,v_base_client,v_base_company,v_base_other,v_base_expense,v_base_commitments,v_base_categories
  from public.project_reconciliation_baselines b
  where b.project_id=target_project
  order by b.as_of_date desc,b.created_at desc
  limit 1;

  v_base_client:=coalesce(v_base_client,0);
  v_base_company:=coalesce(v_base_company,0);
  v_base_other:=coalesce(v_base_other,0);
  v_base_expense:=coalesce(v_base_expense,0);
  v_base_commitments:=coalesce(v_base_commitments,0);
  v_base_categories:=coalesce(v_base_categories,'[]'::jsonb);

  select
    coalesce(sum(case when ct.classification='project_funding' and ct.signed_amount>0 and coalesce(ct.funding_source,'client')='client' and coalesce(ct.is_personal_non_business,false)=false and coalesce(ct.is_internal_transfer,false)=false then ct.signed_amount else 0 end),0),
    coalesce(sum(case when ct.classification='project_funding' and ct.signed_amount>0 and ct.funding_source='company' and coalesce(ct.is_personal_non_business,false)=false then ct.signed_amount else 0 end),0),
    coalesce(sum(case when ct.classification='project_funding' and ct.signed_amount>0 and ct.funding_source='other' and coalesce(ct.is_personal_non_business,false)=false then ct.signed_amount else 0 end),0),
    coalesce(sum(case when ct.classification='project_expense' and ct.signed_amount<0 and coalesce(ct.is_personal_non_business,false)=false and coalesce(ct.is_internal_transfer,false)=false then abs(ct.signed_amount) else 0 end),0),
    min(ct.transaction_date),max(ct.transaction_date)
  into v_client_funding,v_company_funding,v_other_financing,v_expense,v_start,v_end
  from public.canonical_transactions ct
  where ct.project_id=target_project
    and ct.status in ('confirmed','confirmed_reconciliation_only')
    and ct.reversal_of is null and ct.reversed_at is null
    and (v_base_date is null or ct.transaction_date>v_base_date);

  v_client_funding:=v_base_client+coalesce(v_client_funding,0);
  v_company_funding:=v_base_company+coalesce(v_company_funding,0);
  v_other_financing:=v_base_other+coalesce(v_other_financing,0);
  v_expense:=v_base_expense+coalesce(v_expense,0);
  v_commitments:=v_base_commitments;
  v_cash:=v_client_funding+v_company_funding+v_other_financing-v_expense;
  v_start:=coalesce(v_period_start,v_start,v_base_date);
  v_end:=greatest(coalesce(v_end,v_base_date),coalesce(v_base_date,v_end));

  insert into public.project_financial_summaries(project_id,funding_received,company_funding,other_financing,confirmed_expenditure,actual_paid_cost,cash_balance,outstanding_commitments,funding_surplus_shortfall,reporting_period_start,reporting_period_end,updated_at)
  values(target_project,v_client_funding,v_company_funding,v_other_financing,v_expense,v_expense,v_cash,v_commitments,v_cash-v_commitments,v_start,v_end,now())
  on conflict(project_id) do update set
    funding_received=excluded.funding_received,
    company_funding=excluded.company_funding,
    other_financing=excluded.other_financing,
    confirmed_expenditure=excluded.confirmed_expenditure,
    actual_paid_cost=excluded.actual_paid_cost,
    cash_balance=excluded.cash_balance,
    outstanding_commitments=excluded.outstanding_commitments,
    funding_surplus_shortfall=excluded.funding_surplus_shortfall,
    reporting_period_start=excluded.reporting_period_start,
    reporting_period_end=excluded.reporting_period_end,
    updated_at=now();

  delete from public.project_cost_categories pcc where pcc.project_id=target_project;

  if jsonb_typeof(v_base_categories)='array' then
    insert into public.project_cost_categories(project_id,category_name,amount,sort_order,updated_at)
    select target_project,x.category_name,x.amount,row_number() over(order by x.amount desc)::integer,now()
    from jsonb_to_recordset(v_base_categories) as x(category_name text,amount numeric)
    where x.category_name is not null and coalesce(x.amount,0)<>0;
  end if;

  insert into public.project_cost_categories(project_id,category_name,amount,sort_order,updated_at)
  select target_project,coalesce(nullif(btrim(ct.category_name),''),'Uncategorised'),sum(abs(ct.signed_amount)),100+row_number() over(order by sum(abs(ct.signed_amount)) desc)::integer,now()
  from public.canonical_transactions ct
  where ct.project_id=target_project and ct.classification='project_expense' and ct.signed_amount<0
    and ct.status in ('confirmed','confirmed_reconciliation_only') and ct.reversal_of is null and ct.reversed_at is null
    and (v_base_date is null or ct.transaction_date>v_base_date)
  group by coalesce(nullif(btrim(ct.category_name),''),'Uncategorised')
  on conflict(project_id,category_name) do update set amount=public.project_cost_categories.amount+excluded.amount,updated_at=now();

  return jsonb_build_object('project_id',target_project,'baseline_as_of',v_base_date,'client_funding',v_client_funding,'company_funding',v_company_funding,'other_financing',v_other_financing,'expenditure',v_expense,'cash',v_cash,'commitments',v_commitments,'position',v_cash-v_commitments);
end;
$function$;

-- Current Charismak test workspace baseline supplied in the certified Jahi fund retirement statement.
-- On a fresh database this seed is a no-op until JAHI-01 exists.
insert into public.project_reconciliation_baselines(
  company_id,project_id,period_start,as_of_date,source_label,source_notes,
  funding_received,company_funding,other_financing,confirmed_expenditure,outstanding_commitments,category_breakdown
)
select p.company_id,p.id,date '2026-03-16',date '2026-07-08',
  'Jahi Fund Retirement Statement - 8 Jul 2026',
  'Certified reconciliation supplied by Charismak Project Nigeria Limited; Access Bank and OPay statement-backed position through the reporting period. Salary and personal tip excluded from project funding.',
  12600000.00,0,0,12357117.40,950000.00,
  jsonb_build_array(
    jsonb_build_object('category_name','Masonry Works','amount',1764037.20),
    jsonb_build_object('category_name','Tiling Works','amount',3545009.30),
    jsonb_build_object('category_name','Skirting Cutting Works','amount',999950.00),
    jsonb_build_object('category_name','Ceiling Works','amount',1000000.00),
    jsonb_build_object('category_name','Cement','amount',406309.30),
    jsonb_build_object('category_name','Temporary Works / Scaffolding','amount',1908718.60),
    jsonb_build_object('category_name','Plumbing','amount',560500.00),
    jsonb_build_object('category_name','Finishes','amount',200000.00),
    jsonb_build_object('category_name','Site Operations','amount',857555.80),
    jsonb_build_object('category_name','Waterproofing Works','amount',580000.00),
    jsonb_build_object('category_name','Site Materials / Precast','amount',68037.20),
    jsonb_build_object('category_name','Other Jahi Works','amount',467000.00)
  )
from public.projects p
where p.project_code='JAHI-01'
on conflict(project_id,as_of_date,source_label) do update set
  period_start=excluded.period_start,
  source_notes=excluded.source_notes,
  funding_received=excluded.funding_received,
  company_funding=excluded.company_funding,
  other_financing=excluded.other_financing,
  confirmed_expenditure=excluded.confirmed_expenditure,
  outstanding_commitments=excluded.outstanding_commitments,
  category_breakdown=excluded.category_breakdown;

do $$
declare v_project uuid;
begin
  select id into v_project from public.projects where project_code='JAHI-01' limit 1;
  if v_project is not null then perform public.refresh_project_financial_summary(v_project); end if;
end $$;
