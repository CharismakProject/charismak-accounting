-- DRAFT ONLY — DO NOT APPLY WITHOUT EXPLICIT REVIEW/AUTHORIZATION.
-- Depends on project_cost_bridge_v1.sql adding transactions.cost_code and construction_cost_codes.
-- Purpose: confirm cost codes on currently-unclassified posted project expenses only.
-- This function never changes transaction amount, project, date, accounts, category, title, kind or status.

create or replace function private.classify_project_expense_costs_v1_impl(
  target_project uuid,
  classifications jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  caller uuid := auth.uid();
  target_company uuid;
  requested_count integer;
  eligible_count integer;
  changed_count integer;
begin
  if caller is null then raise exception 'Authentication is required.' using errcode='42501'; end if;
  select p.company_id into target_company from public.projects p where p.id=target_project;
  if target_company is null then raise exception 'Project not found.' using errcode='P0002'; end if;
  if not private.has_company_role(target_company,array['md','accountant']::public.company_role[]) then
    raise exception 'Only an MD or Accountant can confirm actual-cost classifications.' using errcode='42501';
  end if;
  if classifications is null or jsonb_typeof(classifications)<>'array' then raise exception 'Classifications must be a JSON array.' using errcode='22023'; end if;
  requested_count:=jsonb_array_length(classifications);
  if requested_count<1 or requested_count>200 then raise exception 'Confirm between 1 and 200 expense classifications at once.' using errcode='22023'; end if;
  if exists(select 1 from (select x.transaction_id from jsonb_to_recordset(classifications) as x(transaction_id uuid,cost_code text,reason text) group by x.transaction_id having count(*)>1) d) then raise exception 'Duplicate transaction IDs are not allowed.' using errcode='23505'; end if;
  if exists(select 1 from jsonb_to_recordset(classifications) as x(transaction_id uuid,cost_code text,reason text) where x.transaction_id is null or not exists(select 1 from public.construction_cost_codes c where c.code=x.cost_code and c.is_active)) then raise exception 'One or more confirmed cost codes are invalid.' using errcode='23514'; end if;

  select count(*) into eligible_count
  from public.transactions t
  join jsonb_to_recordset(classifications) as x(transaction_id uuid,cost_code text,reason text) on x.transaction_id=t.id
  where t.project_id=target_project and t.company_id=target_company and t.kind='expense' and t.status='posted' and t.cost_code is null;
  if eligible_count<>requested_count then
    raise exception 'Every selected transaction must be an unclassified posted expense in this project. Existing classifications are not overwritten.' using errcode='23514';
  end if;

  insert into public.transaction_revisions(transaction_id,revision_type,before_data,after_data,reason,changed_by)
  select t.id,'cost_code_classification',jsonb_build_object('cost_code',t.cost_code),jsonb_build_object('cost_code',x.cost_code),coalesce(nullif(trim(x.reason),''),'Reviewed project cost-code classification.'),caller
  from public.transactions t
  join jsonb_to_recordset(classifications) as x(transaction_id uuid,cost_code text,reason text) on x.transaction_id=t.id
  where t.project_id=target_project and t.company_id=target_company and t.kind='expense' and t.status='posted' and t.cost_code is null;

  update public.transactions t
  set cost_code=x.cost_code,updated_at=now()
  from jsonb_to_recordset(classifications) as x(transaction_id uuid,cost_code text,reason text)
  where t.id=x.transaction_id and t.project_id=target_project and t.company_id=target_company and t.kind='expense' and t.status='posted' and t.cost_code is null;
  get diagnostics changed_count=row_count;
  if changed_count<>requested_count then raise exception 'Classification set changed during review. Refresh and try again.' using errcode='40001'; end if;
  return jsonb_build_object('status','classified','project_id',target_project,'classified_count',changed_count);
end;
$$;

revoke all on function private.classify_project_expense_costs_v1_impl(uuid,jsonb) from public,anon,authenticated;

create or replace function public.classify_project_expense_costs_v1(target_project uuid,classifications jsonb)
returns jsonb
language sql
security definer
set search_path=''
as $$ select private.classify_project_expense_costs_v1_impl(target_project,classifications); $$;

revoke all on function public.classify_project_expense_costs_v1(uuid,jsonb) from public,anon;
grant execute on function public.classify_project_expense_costs_v1(uuid,jsonb) to authenticated;
