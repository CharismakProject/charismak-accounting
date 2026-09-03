-- DRAFT ONLY — apply only with project_cost_commitment_forecast_v1.sql.
-- Adds immutable before/after history for commitment creation and edits.

create table if not exists public.project_cost_commitment_revisions (
  id uuid primary key default gen_random_uuid(),
  commitment_id uuid not null references public.project_cost_commitments(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  revision_type text not null check (revision_type in ('created','updated')),
  before_data jsonb,
  after_data jsonb not null,
  changed_by uuid not null references auth.users(id),
  changed_at timestamptz not null default now()
);
create index if not exists project_cost_commitment_revisions_commitment_idx
  on public.project_cost_commitment_revisions(commitment_id,changed_at desc);
create index if not exists project_cost_commitment_revisions_project_idx
  on public.project_cost_commitment_revisions(project_id,changed_at desc);

alter table public.project_cost_commitment_revisions enable row level security;
create policy project_cost_commitment_revisions_read
  on public.project_cost_commitment_revisions
  for select to authenticated
  using (private.can_view_project_cost(project_id));

revoke all on table public.project_cost_commitment_revisions from anon;
revoke insert,update,delete,truncate,references,trigger
  on table public.project_cost_commitment_revisions from authenticated;
grant select on table public.project_cost_commitment_revisions to authenticated;
grant all privileges on table public.project_cost_commitment_revisions to service_role;

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
  before_snapshot jsonb;
  after_snapshot jsonb;
begin
  if actor is null then raise exception 'Authentication required'; end if;
  if commitment_cost_code !~ '^(0[1-9]|1[0-9]|20)$' then raise exception 'Invalid cost code'; end if;
  if commitment_status not in ('open','closed','cancelled') then raise exception 'Invalid commitment status'; end if;
  if commitment_amount < 0 or commitment_paid_amount < 0 or commitment_paid_amount > commitment_amount then raise exception 'Invalid commitment amounts'; end if;
  if commitment_status='closed' and round(commitment_paid_amount,2)<>round(commitment_amount,2) then raise exception 'Closed commitment must be fully paid'; end if;

  select p.company_id into company
  from public.projects p
  join public.company_members m
    on m.company_id=p.company_id
   and m.user_id=actor
   and m.status='active'
   and m.role in ('md','accountant')
  where p.id=target_project_id;
  if company is null then raise exception 'Not authorised for project cost commitments'; end if;

  if commitment_id is null then
    insert into public.project_cost_commitments(
      company_id,project_id,cost_code,description,committed_amount,paid_amount,status,due_date,note,created_by,updated_by
    ) values(
      company,target_project_id,commitment_cost_code,trim(commitment_description),commitment_amount,commitment_paid_amount,
      commitment_status,commitment_due_date,nullif(trim(commitment_note),''),actor,actor
    ) returning id,to_jsonb(public.project_cost_commitments.*) into result_id,after_snapshot;

    insert into public.project_cost_commitment_revisions(
      commitment_id,project_id,revision_type,before_data,after_data,changed_by
    ) values(result_id,target_project_id,'created',null,after_snapshot,actor);
  else
    select to_jsonb(existing.*) into before_snapshot
    from public.project_cost_commitments existing
    where existing.id=commitment_id
      and existing.project_id=target_project_id
      and existing.company_id=company
    for update;
    if before_snapshot is null then raise exception 'Commitment not found'; end if;

    update public.project_cost_commitments updated set
      cost_code=commitment_cost_code,
      description=trim(commitment_description),
      committed_amount=commitment_amount,
      paid_amount=commitment_paid_amount,
      status=commitment_status,
      due_date=commitment_due_date,
      note=nullif(trim(commitment_note),''),
      updated_by=actor,
      updated_at=now()
    where updated.id=commitment_id
    returning id,to_jsonb(updated.*) into result_id,after_snapshot;

    insert into public.project_cost_commitment_revisions(
      commitment_id,project_id,revision_type,before_data,after_data,changed_by
    ) values(result_id,target_project_id,'updated',before_snapshot,after_snapshot,actor);
  end if;

  return result_id;
end;
$$;

revoke all on function public.save_project_cost_commitment_v1(uuid,uuid,text,text,numeric,numeric,text,date,text)
  from public,anon;
grant execute on function public.save_project_cost_commitment_v1(uuid,uuid,text,text,numeric,numeric,text,date,text)
  to authenticated;
