-- DRAFT ONLY — DO NOT APPLY WITHOUT EXPLICIT REVIEW.
-- Prerequisites: project_cost_bridge_v1.sql and project_progress_valuation_v1.sql.
-- PM field reports are evidence-backed proposals. Only MD approval can turn one into an authoritative Progress Valuation.
-- This draft never creates or edits Money transactions, commitments, forecasts, invoices or client receivables.

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('project-progress-evidence','project-progress-evidence',false,10485760,array['image/jpeg','image/png','image/webp','application/pdf']::text[])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create table if not exists public.project_progress_field_submissions(
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  budget_id uuid not null references public.project_cost_budgets(id) on delete restrict,
  submission_version integer not null check(submission_version>0),
  report_date date not null,
  status text not null default 'submitted' check(status in ('submitted','changes_requested','approved','declined')),
  site_summary text not null,
  evidence_token uuid not null,
  submitted_by uuid not null references auth.users(id),
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  review_notes text,
  approved_valuation_id uuid references public.project_progress_valuations(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_progress_field_submission_version_unique unique(project_id,submission_version),
  constraint project_progress_field_submission_summary_check check(length(trim(site_summary)) between 3 and 3000),
  constraint project_progress_field_review_state_check check(
    (status='submitted' and reviewed_by is null and reviewed_at is null and approved_valuation_id is null)
    or (status in ('changes_requested','declined') and reviewed_by is not null and reviewed_at is not null and approved_valuation_id is null and length(trim(coalesce(review_notes,'')))>=3)
    or (status='approved' and reviewed_by is not null and reviewed_at is not null and approved_valuation_id is not null)
  )
);
create unique index if not exists project_progress_field_one_pending_idx on public.project_progress_field_submissions(project_id) where status='submitted';
create index if not exists project_progress_field_project_idx on public.project_progress_field_submissions(project_id,submitted_at desc);
create index if not exists project_progress_field_submitter_idx on public.project_progress_field_submissions(submitted_by,submitted_at desc);

create table if not exists public.project_progress_field_submission_lines(
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.project_progress_field_submissions(id) on delete cascade,
  budget_line_id uuid not null references public.project_cost_budget_lines(id) on delete restrict,
  source_line_id text not null,
  cost_code text not null references public.construction_cost_codes(code),
  description text not null,
  unit text,
  budget_quantity numeric(20,6),
  reported_completed_quantity numeric(20,6),
  reported_progress_percent numeric(7,4) not null check(reported_progress_percent between 0 and 100),
  line_note text,
  created_at timestamptz not null default now(),
  constraint project_progress_field_line_unique unique(submission_id,budget_line_id),
  constraint project_progress_field_line_qty_check check(reported_completed_quantity is null or reported_completed_quantity>=0),
  constraint project_progress_field_line_note_check check(line_note is null or length(line_note)<=1000)
);
create index if not exists project_progress_field_lines_submission_idx on public.project_progress_field_submission_lines(submission_id,cost_code);

create table if not exists public.project_progress_field_evidence(
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.project_progress_field_submissions(id) on delete cascade,
  file_name text not null,
  mime_type text not null check(mime_type in ('image/jpeg','image/png','image/webp','application/pdf')),
  size_bytes bigint not null check(size_bytes between 1 and 10485760),
  storage_bucket text not null default 'project-progress-evidence' check(storage_bucket='project-progress-evidence'),
  storage_path text not null unique,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists project_progress_field_evidence_submission_idx on public.project_progress_field_evidence(submission_id);

create or replace function private.is_active_assigned_project_pm(target_project_id uuid,target_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path='' as $$
  select target_user_id is not null and exists(
    select 1
    from public.projects p
    join public.company_members m on m.company_id=p.company_id and m.user_id=target_user_id and m.status='active' and m.role='pm'
    join public.project_assignments a on a.project_id=p.id and a.company_member_id=m.id and a.unassigned_at is null
    where p.id=target_project_id
  );
$$;
revoke all on function private.is_active_assigned_project_pm(uuid,uuid) from public,anon;
grant execute on function private.is_active_assigned_project_pm(uuid,uuid) to authenticated;

create or replace function private.can_read_field_progress_submission(target_submission_id uuid,target_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path='' as $$
  select target_user_id is not null and exists(
    select 1 from public.project_progress_field_submissions s
    where s.id=target_submission_id and (
      s.submitted_by=target_user_id
      or private.has_company_role(s.company_id,array['md']::company_role[])
    )
  );
$$;
revoke all on function private.can_read_field_progress_submission(uuid,uuid) from public,anon;
grant execute on function private.can_read_field_progress_submission(uuid,uuid) to authenticated;

alter table public.project_progress_field_submissions enable row level security;
alter table public.project_progress_field_submission_lines enable row level security;
alter table public.project_progress_field_evidence enable row level security;
revoke all on table public.project_progress_field_submissions from anon,authenticated;
revoke all on table public.project_progress_field_submission_lines from anon,authenticated;
revoke all on table public.project_progress_field_evidence from anon,authenticated;
grant select on table public.project_progress_field_submissions to authenticated;
grant select on table public.project_progress_field_submission_lines to authenticated;
grant select on table public.project_progress_field_evidence to authenticated;
grant all privileges on table public.project_progress_field_submissions to service_role;
grant all privileges on table public.project_progress_field_submission_lines to service_role;
grant all privileges on table public.project_progress_field_evidence to service_role;

drop policy if exists project_progress_field_submissions_read on public.project_progress_field_submissions;
create policy project_progress_field_submissions_read on public.project_progress_field_submissions for select to authenticated
using(submitted_by=(select auth.uid()) or (select private.has_company_role(company_id,array['md']::company_role[])));
drop policy if exists project_progress_field_lines_read on public.project_progress_field_submission_lines;
create policy project_progress_field_lines_read on public.project_progress_field_submission_lines for select to authenticated
using((select private.can_read_field_progress_submission(submission_id)));
drop policy if exists project_progress_field_evidence_read on public.project_progress_field_evidence;
create policy project_progress_field_evidence_read on public.project_progress_field_evidence for select to authenticated
using((select private.can_read_field_progress_submission(submission_id)));

-- Private evidence bucket path contract: <project_id>/<actor_uid>/<evidence_token>/<filename>.
drop policy if exists project_progress_evidence_insert_pm on storage.objects;
create policy project_progress_evidence_insert_pm on storage.objects for insert to authenticated
with check(
  bucket_id='project-progress-evidence'
  and split_part(name,'/',2)=(select auth.uid())::text
  and split_part(name,'/',3)~'^[0-9a-fA-F-]{36}$'
  and (select private.is_active_assigned_project_pm(split_part(name,'/',1)::uuid))
);
drop policy if exists project_progress_evidence_select_actor_md on storage.objects;
create policy project_progress_evidence_select_actor_md on storage.objects for select to authenticated
using(
  bucket_id='project-progress-evidence' and (
    split_part(name,'/',2)=(select auth.uid())::text
    or exists(
      select 1 from public.projects p
      where p.id=split_part(name,'/',1)::uuid
        and (select private.has_company_role(p.company_id,array['md']::company_role[]))
    )
  )
);
drop policy if exists project_progress_evidence_delete_unsubmitted_pm on storage.objects;
create policy project_progress_evidence_delete_unsubmitted_pm on storage.objects for delete to authenticated
using(
  bucket_id='project-progress-evidence'
  and split_part(name,'/',2)=(select auth.uid())::text
  and (select private.is_active_assigned_project_pm(split_part(name,'/',1)::uuid))
  and not exists(select 1 from public.project_progress_field_evidence e where e.storage_path=name)
);

-- Safe work-item reader for PMs. No internal rate, amount, earned value, profit or Money fields are returned.
create or replace function private.get_project_progress_work_items_v1(target_project_id uuid)
returns table(
  budget_line_id uuid,
  source_line_id text,
  cost_code text,
  description text,
  unit text,
  approved_quantity numeric,
  prior_progress_percent numeric,
  prior_completed_quantity numeric
)
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); company uuid; budget uuid; latest uuid;
begin
  if actor is null then raise exception 'Authentication required'; end if;
  select p.company_id into company from public.projects p where p.id=target_project_id;
  if company is null then raise exception 'Project not found'; end if;
  if not private.is_active_assigned_project_pm(target_project_id,actor) and not private.has_company_role(company,array['md']::company_role[]) then raise exception 'Project progress access denied'; end if;
  select b.id into budget from public.project_cost_budgets b where b.project_id=target_project_id and b.status='approved';
  if budget is null then raise exception 'Approved Budget Baseline is required'; end if;
  select v.id into latest from public.project_progress_valuations v where v.project_id=target_project_id and v.status='approved';
  return query
    select bl.id,bl.source_line_id,bl.cost_code,bl.description,bl.unit,bl.quantity,
      coalesce(pl.progress_percent,0)::numeric,pl.completed_quantity
    from public.project_cost_budget_lines bl
    left join public.project_progress_valuation_lines pl on pl.valuation_id=latest and pl.budget_line_id=bl.id
    where bl.budget_id=budget
    order by bl.created_at,bl.id;
end;
$$;
revoke all on function private.get_project_progress_work_items_v1(uuid) from public,anon;
grant execute on function private.get_project_progress_work_items_v1(uuid) to authenticated;
create or replace function public.get_project_progress_work_items_v1(target_project_id uuid)
returns table(budget_line_id uuid,source_line_id text,cost_code text,description text,unit text,approved_quantity numeric,prior_progress_percent numeric,prior_completed_quantity numeric)
language sql security invoker set search_path='' as $$ select * from private.get_project_progress_work_items_v1(target_project_id); $$;
revoke all on function public.get_project_progress_work_items_v1(uuid) from public,anon;
grant execute on function public.get_project_progress_work_items_v1(uuid) to authenticated;

create or replace function private.submit_project_field_progress_v1(
  target_project_id uuid,
  report_date_value date,
  site_summary_value text,
  field_lines jsonb,
  evidence_token_value uuid
) returns uuid
language plpgsql security definer set search_path='' as $$
declare
  actor uuid:=auth.uid(); company uuid; budget uuid; latest uuid; latest_date date; submission uuid; new_version integer;
  budget_count integer; submitted_count integer; duplicate_count integer; evidence_count integer;
  b record; item jsonb; completed numeric; progress numeric; prior_progress numeric; object_row record;
begin
  if actor is null then raise exception 'Authentication required'; end if;
  if not private.is_active_assigned_project_pm(target_project_id,actor) then raise exception 'Only an active assigned PM can submit field progress'; end if;
  if report_date_value is null or report_date_value>current_date then raise exception 'Report date is invalid'; end if;
  if length(trim(coalesce(site_summary_value,'')))<3 or length(site_summary_value)>3000 then raise exception 'Site summary must be between 3 and 3000 characters'; end if;
  if jsonb_typeof(field_lines)<>'array' then raise exception 'Field progress lines must be an array'; end if;
  if evidence_token_value is null then raise exception 'Evidence token is required'; end if;

  select p.company_id,b.id into company,budget from public.projects p join public.project_cost_budgets b on b.project_id=p.id and b.status='approved' where p.id=target_project_id;
  if company is null or budget is null then raise exception 'Approved Budget Baseline is required'; end if;
  select v.id,v.valuation_date into latest,latest_date from public.project_progress_valuations v where v.project_id=target_project_id and v.status='approved';
  if latest_date is not null and report_date_value<latest_date then raise exception 'Field report date cannot precede the latest approved progress date %',latest_date; end if;
  if exists(select 1 from public.project_progress_field_submissions s where s.project_id=target_project_id and s.status='submitted') then raise exception 'A field progress report is already awaiting MD review'; end if;

  select count(*) into budget_count from public.project_cost_budget_lines where budget_id=budget;
  select count(*) into submitted_count from jsonb_array_elements(field_lines);
  select count(*) into duplicate_count from(select item->>'budget_line_id' id,count(*) n from jsonb_array_elements(field_lines)item group by 1 having count(*)>1)d;
  if duplicate_count>0 then raise exception 'Duplicate field progress lines are not allowed'; end if;
  if submitted_count<>budget_count then raise exception 'A PM field report must contain every approved work item'; end if;

  select count(*) into evidence_count from storage.objects o
  where o.bucket_id='project-progress-evidence' and o.name like target_project_id::text||'/'||actor::text||'/'||evidence_token_value::text||'/%';
  if evidence_count<1 or evidence_count>8 then raise exception 'Attach between 1 and 8 site evidence files'; end if;
  if exists(
    select 1 from storage.objects o
    where o.bucket_id='project-progress-evidence' and o.name like target_project_id::text||'/'||actor::text||'/'||evidence_token_value::text||'/%'
      and (
        coalesce((o.metadata->>'size')::bigint,0) not between 1 and 10485760
        or coalesce(o.metadata->>'mimetype','') not in ('image/jpeg','image/png','image/webp','application/pdf')
      )
  ) then raise exception 'One or more evidence files have an invalid type or size'; end if;

  select coalesce(max(submission_version),0)+1 into new_version from public.project_progress_field_submissions where project_id=target_project_id;
  insert into public.project_progress_field_submissions(company_id,project_id,budget_id,submission_version,report_date,status,site_summary,evidence_token,submitted_by)
  values(company,target_project_id,budget,new_version,report_date_value,'submitted',trim(site_summary_value),evidence_token_value,actor)
  returning id into submission;

  for b in select id,source_line_id,cost_code,description,unit,quantity from public.project_cost_budget_lines where budget_id=budget order by created_at,id loop
    select x into item from jsonb_array_elements(field_lines)x where x->>'budget_line_id'=b.id::text limit 1;
    if item is null then raise exception 'Missing approved work item %',b.id; end if;
    completed:=nullif(item->>'reported_completed_quantity','')::numeric;
    if completed is not null then
      if completed<0 then raise exception 'Completed quantity cannot be negative for %',b.id; end if;
      if b.quantity is null or b.quantity<=0 then raise exception 'Completed quantity cannot be used where approved quantity is unavailable for %',b.id; end if;
      if completed>b.quantity+0.000001 then raise exception 'Completed quantity exceeds approved quantity for %',b.id; end if;
      progress:=round(completed/b.quantity*100,4);
    else
      progress:=nullif(item->>'reported_progress_percent','')::numeric;
      if progress is null then raise exception 'Progress percent is required for %',b.id; end if;
    end if;
    if progress<0 or progress>100 then raise exception 'Progress must be between 0 and 100 for %',b.id; end if;
    prior_progress:=0;
    if latest is not null then select coalesce(pl.progress_percent,0) into prior_progress from public.project_progress_valuation_lines pl where pl.valuation_id=latest and pl.budget_line_id=b.id; prior_progress:=coalesce(prior_progress,0); end if;
    if progress+0.0001<prior_progress then raise exception 'Reported progress cannot reduce below current approved progress for %',b.id; end if;
    if length(coalesce(item->>'line_note',''))>1000 then raise exception 'Line note is too long for %',b.id; end if;
    insert into public.project_progress_field_submission_lines(submission_id,budget_line_id,source_line_id,cost_code,description,unit,budget_quantity,reported_completed_quantity,reported_progress_percent,line_note)
    values(submission,b.id,b.source_line_id,b.cost_code,b.description,b.unit,b.quantity,completed,progress,nullif(trim(item->>'line_note'),''));
  end loop;

  for object_row in select o.name,coalesce(o.metadata->>'mimetype','') mime,coalesce((o.metadata->>'size')::bigint,0) bytes from storage.objects o where o.bucket_id='project-progress-evidence' and o.name like target_project_id::text||'/'||actor::text||'/'||evidence_token_value::text||'/%' order by o.name loop
    insert into public.project_progress_field_evidence(submission_id,file_name,mime_type,size_bytes,storage_path,created_by)
    values(submission,regexp_replace(object_row.name,'^.*/',''),object_row.mime,object_row.bytes,object_row.name,actor);
  end loop;
  return submission;
end;
$$;
revoke all on function private.submit_project_field_progress_v1(uuid,date,text,jsonb,uuid) from public,anon;
grant execute on function private.submit_project_field_progress_v1(uuid,date,text,jsonb,uuid) to authenticated;
create or replace function public.submit_project_field_progress_v1(target_project_id uuid,report_date_value date,site_summary_value text,field_lines jsonb,evidence_token_value uuid)
returns uuid language sql security invoker set search_path='' as $$ select private.submit_project_field_progress_v1(target_project_id,report_date_value,site_summary_value,field_lines,evidence_token_value); $$;
revoke all on function public.submit_project_field_progress_v1(uuid,date,text,jsonb,uuid) from public,anon;
grant execute on function public.submit_project_field_progress_v1(uuid,date,text,jsonb,uuid) to authenticated;

create or replace function private.review_project_field_progress_v1(target_submission_id uuid,decision_value text,review_notes_value text default null)
returns uuid
language plpgsql security definer set search_path='' as $$
declare
  actor uuid:=auth.uid(); s record; current_budget uuid; valuation uuid; valuation_lines jsonb;
begin
  if actor is null then raise exception 'Authentication required'; end if;
  if decision_value not in ('approve','changes_requested','decline') then raise exception 'Invalid field progress review decision'; end if;
  select * into s from public.project_progress_field_submissions where id=target_submission_id for update;
  if s.id is null then raise exception 'Field progress submission not found'; end if;
  if not private.has_company_role(s.company_id,array['md']::company_role[]) then raise exception 'Only MD can review PM field progress'; end if;
  if s.status<>'submitted' then raise exception 'This field progress submission has already been reviewed'; end if;
  if decision_value<>'approve' and length(trim(coalesce(review_notes_value,'')))<3 then raise exception 'Review notes are required when requesting changes or declining'; end if;
  select b.id into current_budget from public.project_cost_budgets b where b.project_id=s.project_id and b.status='approved';
  if current_budget is null or current_budget<>s.budget_id then raise exception 'The approved Budget Baseline changed after PM submission. Request a fresh field report'; end if;

  if decision_value='approve' then
    select jsonb_agg(jsonb_build_object('budget_line_id',l.budget_line_id,'progress_percent',l.reported_progress_percent,'completed_quantity',l.reported_completed_quantity) order by l.created_at,l.id)
    into valuation_lines from public.project_progress_field_submission_lines l where l.submission_id=s.id;
    valuation:=private.approve_project_progress_valuation_v1(s.project_id,s.report_date,valuation_lines,s.site_summary);
    update public.project_progress_field_submissions set status='approved',reviewed_by=actor,reviewed_at=now(),review_notes=nullif(trim(review_notes_value),''),approved_valuation_id=valuation,updated_at=now() where id=s.id;
    return valuation;
  end if;

  update public.project_progress_field_submissions set status=case when decision_value='changes_requested' then 'changes_requested' else 'declined' end,reviewed_by=actor,reviewed_at=now(),review_notes=trim(review_notes_value),updated_at=now() where id=s.id;
  return null;
end;
$$;
revoke all on function private.review_project_field_progress_v1(uuid,text,text) from public,anon;
grant execute on function private.review_project_field_progress_v1(uuid,text,text) to authenticated;
create or replace function public.review_project_field_progress_v1(target_submission_id uuid,decision_value text,review_notes_value text default null)
returns uuid language sql security invoker set search_path='' as $$ select private.review_project_field_progress_v1(target_submission_id,decision_value,review_notes_value); $$;
revoke all on function public.review_project_field_progress_v1(uuid,text,text) from public,anon;
grant execute on function public.review_project_field_progress_v1(uuid,text,text) to authenticated;
