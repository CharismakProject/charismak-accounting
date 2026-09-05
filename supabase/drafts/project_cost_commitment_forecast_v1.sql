-- DRAFT ONLY — DO NOT APPLY WITHOUT REVIEW.
-- Extends the reviewed project-cost bridge with commitments and Cost-to-Complete snapshots.
-- Forecast convention: reviewed Cost-to-Complete is ALL expected future cost from the review date,
-- including known unpaid commitments. Unpaid commitments must never be added again to forecast final cost.

create table if not exists public.project_cost_commitments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  cost_code text not null references public.construction_cost_codes(code),
  description text not null check (length(trim(description)) >= 2),
  committed_amount numeric(18,2) not null check (committed_amount >= 0),
  paid_amount numeric(18,2) not null default 0 check (paid_amount >= 0),
  status text not null default 'open' check (status in ('open','closed','cancelled')),
  due_date date,
  note text,
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_cost_commitments_paid_check check (paid_amount <= committed_amount),
  constraint project_cost_commitments_closed_check check (status <> 'closed' or round(paid_amount,2)=round(committed_amount,2))
);
create index if not exists project_cost_commitments_project_idx on public.project_cost_commitments(project_id,status,cost_code);

create table if not exists public.project_cost_forecasts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  forecast_version integer not null default 1 check (forecast_version > 0),
  status text not null default 'approved' check (status in ('approved','superseded')),
  reviewed_at timestamptz not null,
  note text,
  created_by uuid not null references auth.users(id),
  approved_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  superseded_at timestamptz,
  constraint project_cost_forecasts_version_unique unique(project_id,forecast_version)
);
create unique index if not exists project_cost_forecasts_one_approved_idx on public.project_cost_forecasts(project_id) where status='approved';

create table if not exists public.project_cost_forecast_lines (
  id uuid primary key default gen_random_uuid(),
  forecast_id uuid not null references public.project_cost_forecasts(id) on delete cascade,
  cost_code text not null references public.construction_cost_codes(code),
  forecast_cost_to_complete numeric(18,2) not null check (forecast_cost_to_complete >= 0),
  note text,
  created_at timestamptz not null default now(),
  constraint project_cost_forecast_lines_code_unique unique(forecast_id,cost_code)
);
create index if not exists project_cost_forecast_lines_forecast_idx on public.project_cost_forecast_lines(forecast_id,cost_code);

alter table public.project_cost_commitments enable row level security;
alter table public.project_cost_forecasts enable row level security;
alter table public.project_cost_forecast_lines enable row level security;

create policy project_cost_commitments_read on public.project_cost_commitments for select to authenticated using (private.can_view_project_cost(project_id));
create policy project_cost_forecasts_read on public.project_cost_forecasts for select to authenticated using (private.can_view_project_cost(project_id));
create policy project_cost_forecast_lines_read on public.project_cost_forecast_lines for select to authenticated using (
  exists(select 1 from public.project_cost_forecasts f where f.id=forecast_id and private.can_view_project_cost(f.project_id))
);

revoke all on table public.project_cost_commitments,public.project_cost_forecasts,public.project_cost_forecast_lines from anon;
revoke insert,update,delete,truncate,references,trigger on table public.project_cost_commitments,public.project_cost_forecasts,public.project_cost_forecast_lines from authenticated;
grant select on table public.project_cost_commitments,public.project_cost_forecasts,public.project_cost_forecast_lines to authenticated;
grant all privileges on table public.project_cost_commitments,public.project_cost_forecasts,public.project_cost_forecast_lines to service_role;

create or replace function public.save_project_cost_commitment_v1(
  target_project_id uuid,
  commitment_id uuid,
  commitment_cost_code text,
  commitment_description text,
  commitment_amount numeric,
  commitment_paid_amount numeric,
  commitment_status text,
  commitment_due_date date default null,
  commitment_note text default null
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  actor uuid := auth.uid();
  company uuid;
  result_id uuid;
begin
  if actor is null then raise exception 'Authentication required'; end if;
  if commitment_cost_code !~ '^(0[1-9]|1[0-9]|20)$' then raise exception 'Invalid cost code'; end if;
  if commitment_status not in ('open','closed','cancelled') then raise exception 'Invalid commitment status'; end if;
  if commitment_amount < 0 or commitment_paid_amount < 0 or commitment_paid_amount > commitment_amount then raise exception 'Invalid commitment amounts'; end if;
  if commitment_status='closed' and round(commitment_paid_amount,2)<>round(commitment_amount,2) then raise exception 'Closed commitment must be fully paid'; end if;

  select p.company_id into company from public.projects p
  join public.company_members m on m.company_id=p.company_id and m.user_id=actor and m.status='active' and m.role in ('md','accountant')
  where p.id=target_project_id;
  if company is null then raise exception 'Not authorised for project cost commitments'; end if;

  if commitment_id is null then
    insert into public.project_cost_commitments(company_id,project_id,cost_code,description,committed_amount,paid_amount,status,due_date,note,created_by,updated_by)
    values(company,target_project_id,commitment_cost_code,trim(commitment_description),commitment_amount,commitment_paid_amount,commitment_status,commitment_due_date,nullif(trim(commitment_note),''),actor,actor)
    returning id into result_id;
  else
    update public.project_cost_commitments set
      cost_code=commitment_cost_code,description=trim(commitment_description),committed_amount=commitment_amount,paid_amount=commitment_paid_amount,status=commitment_status,due_date=commitment_due_date,note=nullif(trim(commitment_note),''),updated_by=actor,updated_at=now()
    where id=commitment_id and project_id=target_project_id and company_id=company returning id into result_id;
    if result_id is null then raise exception 'Commitment not found'; end if;
  end if;
  return result_id;
end;
$$;

create or replace function public.approve_project_cost_forecast_v1(
  target_project_id uuid,
  reviewed_at_value timestamptz,
  forecast_lines jsonb,
  forecast_note text default null
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  actor uuid := auth.uid();
  company uuid;
  next_version integer;
  new_forecast uuid;
  line jsonb;
  code text;
  ctc numeric;
  unpaid numeric;
begin
  if actor is null then raise exception 'Authentication required'; end if;
  if reviewed_at_value is null then raise exception 'Review date is required'; end if;
  if jsonb_typeof(forecast_lines) <> 'array' then raise exception 'Forecast lines must be an array'; end if;

  select p.company_id into company from public.projects p
  join public.company_members m on m.company_id=p.company_id and m.user_id=actor and m.status='active' and m.role in ('md','accountant')
  where p.id=target_project_id;
  if company is null then raise exception 'Not authorised for project cost forecast'; end if;

  if exists (
    select 1
    from jsonb_array_elements(forecast_lines) submitted(value)
    group by submitted.value->>'costCode'
    having count(*) > 1
  ) then
    raise exception 'Forecast contains duplicate cost codes';
  end if;

  -- Validate every submitted line first.
  for line in select value from jsonb_array_elements(forecast_lines)
  loop
    code := line->>'costCode';
    begin
      ctc := (line->>'amount')::numeric;
    exception when invalid_text_representation then
      raise exception 'Invalid forecast line amount for cost code %',coalesce(code,'(missing)');
    end;
    if code is null or code !~ '^(0[1-9]|1[0-9]|20)$' or ctc is null or ctc < 0 then raise exception 'Invalid forecast line'; end if;
  end loop;

  -- Server-side completeness guard: every cost code with an open unpaid commitment
  -- must be present in the submitted forecast and its CTC must cover that balance.
  -- This cannot be bypassed by omitting a row from a custom/direct client request.
  for code,unpaid in
    select commitment.cost_code,
           round(sum(greatest(commitment.committed_amount-commitment.paid_amount,0)),2)
    from public.project_cost_commitments commitment
    where commitment.project_id=target_project_id
      and commitment.status='open'
    group by commitment.cost_code
    having sum(greatest(commitment.committed_amount-commitment.paid_amount,0)) > 0
  loop
    select coalesce(
      sum((submitted.value->>'amount')::numeric),
      0
    ) into ctc
    from jsonb_array_elements(forecast_lines) submitted(value)
    where submitted.value->>'costCode'=code;

    if ctc + 0.005 < unpaid then
      raise exception 'Forecast CTC for cost code % is below unpaid commitments',code;
    end if;
  end loop;

  update public.project_cost_forecasts set status='superseded',superseded_at=now() where project_id=target_project_id and status='approved';
  select coalesce(max(forecast_version),0)+1 into next_version from public.project_cost_forecasts where project_id=target_project_id;
  insert into public.project_cost_forecasts(company_id,project_id,forecast_version,status,reviewed_at,note,created_by,approved_by)
  values(company,target_project_id,next_version,'approved',reviewed_at_value,nullif(trim(forecast_note),''),actor,actor)
  returning id into new_forecast;

  for line in select value from jsonb_array_elements(forecast_lines)
  loop
    code := line->>'costCode'; ctc := (line->>'amount')::numeric;
    insert into public.project_cost_forecast_lines(forecast_id,cost_code,forecast_cost_to_complete,note)
    values(new_forecast,code,ctc,nullif(trim(line->>'note'),''));
  end loop;
  return new_forecast;
end;
$$;

revoke all on function public.save_project_cost_commitment_v1(uuid,uuid,text,text,numeric,numeric,text,date,text) from public,anon;
revoke all on function public.approve_project_cost_forecast_v1(uuid,timestamptz,jsonb,text) from public,anon;
grant execute on function public.save_project_cost_commitment_v1(uuid,uuid,text,text,numeric,numeric,text,date,text) to authenticated;
grant execute on function public.approve_project_cost_forecast_v1(uuid,timestamptz,jsonb,text) to authenticated;
