-- DRAFT ONLY — DO NOT APPLY WITHOUT EXPLICIT REVIEW.
-- Prerequisite: project-cost bridge V1.
-- Progress Valuation records physical completion against the approved internal BOQ/budget.
-- It never creates or updates Money transactions, commitments, forecasts or client billing records.

create table if not exists public.project_progress_valuations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  budget_id uuid not null references public.project_cost_budgets(id) on delete restrict,
  valuation_version integer not null check (valuation_version > 0),
  valuation_date date not null,
  status text not null default 'approved' check (status in ('approved','superseded')),
  physical_progress_percent numeric(7,4) not null check (physical_progress_percent between 0 and 100),
  earned_value numeric(18,2) not null check (earned_value >= 0),
  work_summary text,
  created_by uuid not null references auth.users(id),
  approved_by uuid not null references auth.users(id),
  approved_at timestamptz not null default now(),
  superseded_at timestamptz,
  created_at timestamptz not null default now(),
  constraint project_progress_valuations_version_unique unique(project_id,valuation_version)
);
create unique index if not exists project_progress_valuations_one_approved_idx on public.project_progress_valuations(project_id) where status='approved';
create index if not exists project_progress_valuations_project_idx on public.project_progress_valuations(project_id,valuation_date desc);

create table if not exists public.project_progress_valuation_lines (
  id uuid primary key default gen_random_uuid(),
  valuation_id uuid not null references public.project_progress_valuations(id) on delete cascade,
  budget_line_id uuid not null references public.project_cost_budget_lines(id) on delete restrict,
  source_line_id text not null,
  cost_code text not null references public.construction_cost_codes(code),
  description text not null,
  unit text,
  budget_quantity numeric(20,6),
  completed_quantity numeric(20,6),
  progress_percent numeric(7,4) not null check (progress_percent between 0 and 100),
  budget_amount numeric(18,2) not null check (budget_amount >= 0),
  earned_value numeric(18,2) not null check (earned_value >= 0),
  created_at timestamptz not null default now(),
  constraint project_progress_valuation_lines_unique unique(valuation_id,budget_line_id),
  constraint project_progress_completed_qty_check check (completed_quantity is null or completed_quantity >= 0)
);
create index if not exists project_progress_valuation_lines_valuation_idx on public.project_progress_valuation_lines(valuation_id,cost_code);

alter table public.project_progress_valuations enable row level security;
alter table public.project_progress_valuation_lines enable row level security;
revoke all on table public.project_progress_valuations from anon,authenticated;
revoke all on table public.project_progress_valuation_lines from anon,authenticated;
grant select on table public.project_progress_valuations to authenticated;
grant select on table public.project_progress_valuation_lines to authenticated;
grant all privileges on table public.project_progress_valuations to service_role;
grant all privileges on table public.project_progress_valuation_lines to service_role;

create policy project_progress_valuations_read on public.project_progress_valuations for select to authenticated using ((select private.can_view_project_cost(project_id)));
create policy project_progress_valuation_lines_read on public.project_progress_valuation_lines for select to authenticated using (exists(select 1 from public.project_progress_valuations v where v.id=valuation_id and (select private.can_view_project_cost(v.project_id))));

create or replace function private.approve_project_progress_valuation_v1(
  target_project_id uuid,
  valuation_date_value date,
  valuation_lines jsonb,
  work_summary_value text default null
) returns uuid
language plpgsql security definer set search_path=''
as $$
declare
  actor uuid := auth.uid();
  company uuid; budget uuid; direct_cost numeric; new_version integer; new_valuation uuid; previous_valuation uuid; previous_valuation_date date;
  budget_count integer; submitted_count integer; duplicate_count integer;
  b record; submitted jsonb; p numeric; completed numeric; prior_progress numeric; earned numeric; total_earned numeric := 0;
begin
  if actor is null then raise exception 'Authentication required'; end if;
  if valuation_date_value is null then raise exception 'Valuation date is required'; end if;
  if valuation_date_value > current_date then raise exception 'Valuation date cannot be in the future'; end if;
  if jsonb_typeof(valuation_lines) <> 'array' then raise exception 'Valuation lines must be an array'; end if;
  if length(coalesce(work_summary_value,'')) > 3000 then raise exception 'Progress summary is too long'; end if;

  select p.company_id,b.id,b.direct_cost into company,budget,direct_cost
  from public.projects p
  join public.company_members m on m.company_id=p.company_id and m.user_id=actor and m.status='active' and m.role in ('md','accountant')
  join public.project_cost_budgets b on b.project_id=p.id and b.status='approved'
  where p.id=target_project_id;
  if company is null or budget is null then raise exception 'Approved project budget not found or user not authorised'; end if;

  select count(*) into budget_count from public.project_cost_budget_lines where budget_id=budget;
  select count(*) into submitted_count from jsonb_array_elements(valuation_lines);
  select count(*) into duplicate_count from (select item->>'budget_line_id' id,count(*) n from jsonb_array_elements(valuation_lines) item group by 1 having count(*)>1) d;
  if duplicate_count>0 then raise exception 'Duplicate progress budget lines are not allowed'; end if;
  if submitted_count<>budget_count then raise exception 'A progress valuation must contain every approved budget line'; end if;

  select id,valuation_date into previous_valuation,previous_valuation_date from public.project_progress_valuations where project_id=target_project_id and status='approved' for update;
  if previous_valuation_date is not null and valuation_date_value < previous_valuation_date then raise exception 'Valuation date cannot be earlier than the current approved valuation date %',previous_valuation_date; end if;
  select coalesce(max(valuation_version),0)+1 into new_version from public.project_progress_valuations where project_id=target_project_id;

  -- Supersede inside the same database transaction before inserting the next approved row.
  -- Any later validation/insert failure rolls this change back atomically.
  if previous_valuation is not null then update public.project_progress_valuations set status='superseded',superseded_at=now() where id=previous_valuation; end if;
  insert into public.project_progress_valuations(company_id,project_id,budget_id,valuation_version,valuation_date,status,physical_progress_percent,earned_value,work_summary,created_by,approved_by)
  values(company,target_project_id,budget,new_version,valuation_date_value,'approved',0,0,nullif(trim(work_summary_value),''),actor,actor)
  returning id into new_valuation;

  for b in select id,source_line_id,cost_code,description,unit,quantity,amount from public.project_cost_budget_lines where budget_id=budget order by created_at,id loop
    select item into submitted from jsonb_array_elements(valuation_lines) item where item->>'budget_line_id'=b.id::text limit 1;
    if submitted is null then raise exception 'Missing approved budget line %',b.id; end if;
    completed := nullif(submitted->>'completed_quantity','')::numeric;
    if completed is not null then
      if completed<0 then raise exception 'Completed quantity cannot be negative for %',b.id; end if;
      if b.quantity is null or b.quantity<=0 then raise exception 'Completed quantity cannot be used where approved quantity is unavailable for %',b.id; end if;
      if completed>b.quantity+0.000001 then raise exception 'Completed quantity exceeds approved quantity for %',b.id; end if;
      p := round((completed/b.quantity)*100,4);
    else
      p := nullif(submitted->>'progress_percent','')::numeric;
      if p is null then raise exception 'Progress percent is required for %',b.id; end if;
    end if;
    if p<0 or p>100 then raise exception 'Progress must be between 0 and 100 for %',b.id; end if;
    if previous_valuation is not null then
      select progress_percent into prior_progress from public.project_progress_valuation_lines where valuation_id=previous_valuation and budget_line_id=b.id;
      if prior_progress is not null and p+0.0001<prior_progress then raise exception 'Progress cannot reduce from % to % for budget line % without a correction workflow',prior_progress,p,b.id; end if;
    end if;
    earned := round(b.amount*p/100,2); total_earned := total_earned+earned;
    insert into public.project_progress_valuation_lines(valuation_id,budget_line_id,source_line_id,cost_code,description,unit,budget_quantity,completed_quantity,progress_percent,budget_amount,earned_value)
    values(new_valuation,b.id,b.source_line_id,b.cost_code,b.description,b.unit,b.quantity,completed,p,b.amount,earned);
  end loop;

  update public.project_progress_valuations set earned_value=round(total_earned,2),physical_progress_percent=case when direct_cost>0 then round(total_earned/direct_cost*100,4) else 0 end where id=new_valuation;
  return new_valuation;
end;
$$;

revoke all on function private.approve_project_progress_valuation_v1(uuid,date,jsonb,text) from public,anon;
grant execute on function private.approve_project_progress_valuation_v1(uuid,date,jsonb,text) to authenticated;

create or replace function public.approve_project_progress_valuation_v1(target_project_id uuid,valuation_date_value date,valuation_lines jsonb,work_summary_value text default null)
returns uuid language sql security invoker set search_path='' as $$ select private.approve_project_progress_valuation_v1(target_project_id,valuation_date_value,valuation_lines,work_summary_value); $$;
revoke all on function public.approve_project_progress_valuation_v1(uuid,date,jsonb,text) from public,anon;
grant execute on function public.approve_project_progress_valuation_v1(uuid,date,jsonb,text) to authenticated;
