-- DRAFT ONLY — DO NOT APPLY WITHOUT REVIEW.
-- Depends on project_cost_bridge_v1.sql and project_cost_app_extension_v1.sql.
-- Creates one live project + one approved Budget Baseline atomically from a reviewed Charismak App Estimate.
-- It does NOT create or modify transactions, funding, commitments, journal entries or financial accounts.

create or replace function private.create_app_project_from_estimate_v1_impl(
  target_company uuid,
  source_workspace_id text,
  source_estimate_id text,
  source_version integer,
  source_fingerprint text,
  project_name text,
  project_location text,
  project_code text,
  project_client_name text,
  project_type text,
  project_start_date date,
  project_expected_end_date date,
  project_description text,
  budget_currency_code text,
  budget_direct_cost numeric,
  budget_allowance_total numeric,
  budget_internal_cost numeric,
  budget_contract_value_snapshot numeric,
  budget_lines jsonb,
  budget_allowances jsonb default '[]'::jsonb,
  budget_materials jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  caller uuid := auth.uid();
  existing_project uuid;
  existing_budget uuid;
  existing_version integer;
  existing_budget_status text;
  existing_source_version integer;
  existing_fingerprint text;
  new_project uuid;
  new_budget uuid;
  line_total numeric(18,2);
  allowance_total numeric(18,2);
  line_count integer;
  allowance_count integer;
  material_count integer;
begin
  if caller is null then raise exception 'Authentication is required.' using errcode='42501'; end if;
  if not private.has_company_role(target_company,array['md']::public.company_role[]) then raise exception 'Only an MD can approve an Estimate into a live project.' using errcode='42501'; end if;

  source_workspace_id := nullif(trim(source_workspace_id),'');
  source_estimate_id := nullif(trim(source_estimate_id),'');
  source_fingerprint := nullif(trim(source_fingerprint),'');
  project_name := nullif(trim(project_name),'');
  project_location := nullif(trim(project_location),'');
  project_code := nullif(trim(project_code),'');
  project_client_name := nullif(trim(project_client_name),'');
  project_type := nullif(trim(project_type),'');
  project_description := nullif(trim(project_description),'');
  budget_currency_code := upper(nullif(trim(budget_currency_code),''));

  if source_workspace_id is null or source_estimate_id is null or source_fingerprint is null then raise exception 'Reviewed source identity and fingerprint are required.' using errcode='22023'; end if;
  if source_version is null or source_version < 1 then raise exception 'Source version must be at least 1.' using errcode='22023'; end if;
  if project_name is null or project_location is null then raise exception 'Project name and location are required.' using errcode='22023'; end if;
  if project_start_date is not null and project_expected_end_date is not null and project_expected_end_date < project_start_date then raise exception 'Expected completion date cannot be before project start date.' using errcode='22023'; end if;
  if budget_currency_code is null or budget_currency_code !~ '^[A-Z]{3}$' then raise exception 'Currency must be a three-letter code.' using errcode='22023'; end if;
  if coalesce(budget_direct_cost,-1)<0 or coalesce(budget_allowance_total,-1)<0 or coalesce(budget_internal_cost,-1)<0 or (budget_contract_value_snapshot is not null and budget_contract_value_snapshot<0) then raise exception 'Budget amounts must be non-negative.' using errcode='22023'; end if;
  if round(budget_direct_cost+budget_allowance_total,2)<>round(budget_internal_cost,2) then raise exception 'Internal budget must equal Direct Cost plus allowances.' using errcode='23514'; end if;
  if jsonb_typeof(budget_lines)<>'array' or jsonb_array_length(budget_lines)=0 then raise exception 'At least one reviewed budget line is required.' using errcode='22023'; end if;
  if budget_allowances is null then budget_allowances:='[]'::jsonb; end if;
  if budget_materials is null then budget_materials:='[]'::jsonb; end if;
  if jsonb_typeof(budget_allowances)<>'array' or jsonb_typeof(budget_materials)<>'array' then raise exception 'Allowances and materials must be JSON arrays.' using errcode='22023'; end if;

  select l.project_id,b.id,b.budget_version,b.status,l.source_version,l.source_fingerprint
  into existing_project,existing_budget,existing_version,existing_budget_status,existing_source_version,existing_fingerprint
  from public.project_source_links l
  left join public.project_cost_budgets b on b.source_link_id=l.id
  where l.company_id=target_company and l.source_system='charismak_app_estimate' and l.source_project_id=source_workspace_id
  order by b.budget_version desc nulls last limit 1;

  if existing_project is not null then
    if existing_source_version=source_version and existing_fingerprint=source_fingerprint and existing_budget is not null and existing_budget_status='approved' then
      return jsonb_build_object('status','existing','project_id',existing_project,'budget_id',existing_budget,'budget_version',existing_version,'budget_status','approved');
    end if;
    raise exception 'This reviewed Estimate workspace is already linked with different content or version.' using errcode='23505';
  end if;

  select count(*),coalesce(round(sum(x.amount),2),0) into line_count,line_total
  from jsonb_to_recordset(budget_lines) as x(source_line_id text,cost_code text,description text,unit text,quantity numeric,rate numeric,amount numeric,supply_responsibility text);

  if exists(select 1 from (select trim(x.source_line_id) id from jsonb_to_recordset(budget_lines) as x(source_line_id text) group by trim(x.source_line_id) having count(*)>1) d) then raise exception 'Duplicate budget source line IDs are not allowed.' using errcode='23505'; end if;
  if exists(select 1 from jsonb_to_recordset(budget_lines) as x(source_line_id text,cost_code text,description text,unit text,quantity numeric,rate numeric,amount numeric,supply_responsibility text) where nullif(trim(x.source_line_id),'') is null or nullif(trim(x.description),'') is null or x.amount is null or x.amount<0 or (x.quantity is not null and x.quantity<0) or (x.rate is not null and x.rate<0) or x.supply_responsibility not in ('contractor','specialist','labour_only') or not exists(select 1 from public.construction_cost_codes c where c.code=x.cost_code and c.is_active)) then raise exception 'One or more reviewed budget lines are invalid.' using errcode='23514'; end if;
  if round(line_total,2)<>round(budget_direct_cost,2) then raise exception 'Budget line total must equal reviewed contractor Direct Cost.' using errcode='23514'; end if;

  select count(*),coalesce(round(sum(x.amount),2),0) into allowance_count,allowance_total from jsonb_to_recordset(budget_allowances) as x(source_allowance_id text,kind text,description text,amount numeric);
  if exists(select 1 from jsonb_to_recordset(budget_allowances) as x(source_allowance_id text,kind text,description text,amount numeric) where nullif(trim(x.source_allowance_id),'') is null or nullif(trim(x.description),'') is null or x.kind not in ('contingency','other') or x.amount is null or x.amount<0) then raise exception 'One or more budget allowances are invalid.' using errcode='23514'; end if;
  if exists(select 1 from (select trim(x.source_allowance_id) id from jsonb_to_recordset(budget_allowances) as x(source_allowance_id text) group by trim(x.source_allowance_id) having count(*)>1) d) then raise exception 'Duplicate allowance IDs are not allowed.' using errcode='23505'; end if;
  if round(allowance_total,2)<>round(budget_allowance_total,2) then raise exception 'Allowance details must equal reviewed allowance total.' using errcode='23514'; end if;

  select count(*) into material_count from jsonb_to_recordset(budget_materials) as x(material_key text,material text,unit text,quantity numeric,sources jsonb);
  if exists(select 1 from jsonb_to_recordset(budget_materials) as x(material_key text,material text,unit text,quantity numeric,sources jsonb) where nullif(trim(x.material_key),'') is null or nullif(trim(x.material),'') is null or nullif(trim(x.unit),'') is null or x.quantity is null or x.quantity<0 or coalesce(jsonb_typeof(x.sources),'array')<>'array') then raise exception 'One or more material schedule rows are invalid.' using errcode='23514'; end if;
  if exists(select 1 from (select trim(x.material_key) id from jsonb_to_recordset(budget_materials) as x(material_key text) group by trim(x.material_key) having count(*)>1) d) then raise exception 'Duplicate material keys are not allowed.' using errcode='23505'; end if;

  insert into public.projects(company_id,project_code,name,location,status,reported_progress,created_by,client_name,project_type,contract_value,start_date,expected_end_date,description)
  values(target_company,project_code,project_name,project_location,'active',0,caller,project_client_name,project_type,case when budget_contract_value_snapshot is null then null else round(budget_contract_value_snapshot,2) end,project_start_date,project_expected_end_date,project_description)
  returning id into new_project;

  insert into public.project_source_links(company_id,project_id,source_system,source_project_id,source_estimate_id,source_version,source_fingerprint,created_by)
  values(target_company,new_project,'charismak_app_estimate',source_workspace_id,source_estimate_id,source_version,source_fingerprint,caller);

  insert into public.project_cost_budgets(company_id,project_id,source_link_id,budget_version,status,currency_code,direct_cost,allowance_total,internal_cost_budget,contract_value_snapshot,source_fingerprint,created_by,approved_by,approved_at)
  select target_company,new_project,l.id,1,'approved',budget_currency_code,round(budget_direct_cost,2),round(budget_allowance_total,2),round(budget_internal_cost,2),case when budget_contract_value_snapshot is null then null else round(budget_contract_value_snapshot,2) end,source_fingerprint,caller,caller,now()
  from public.project_source_links l where l.company_id=target_company and l.project_id=new_project and l.source_system='charismak_app_estimate' and l.source_project_id=source_workspace_id
  returning id into new_budget;

  insert into public.project_cost_budget_lines(budget_id,source_line_id,cost_code,description,unit,quantity,rate,amount,supply_responsibility)
  select new_budget,trim(x.source_line_id),x.cost_code,trim(x.description),nullif(trim(x.unit),''),x.quantity,x.rate,round(x.amount,2),x.supply_responsibility
  from jsonb_to_recordset(budget_lines) as x(source_line_id text,cost_code text,description text,unit text,quantity numeric,rate numeric,amount numeric,supply_responsibility text);

  if allowance_count>0 then
    insert into public.project_cost_budget_allowances(budget_id,source_allowance_id,kind,description,amount)
    select new_budget,trim(x.source_allowance_id),x.kind,trim(x.description),round(x.amount,2)
    from jsonb_to_recordset(budget_allowances) as x(source_allowance_id text,kind text,description text,amount numeric);
  end if;

  if material_count>0 then
    insert into public.project_cost_budget_materials(budget_id,material_key,material,unit,quantity,sources)
    select new_budget,trim(x.material_key),trim(x.material),trim(x.unit),x.quantity,coalesce(x.sources,'[]'::jsonb)
    from jsonb_to_recordset(budget_materials) as x(material_key text,material text,unit text,quantity numeric,sources jsonb);
  end if;

  return jsonb_build_object('status','created','project_id',new_project,'budget_id',new_budget,'budget_version',1,'budget_status','approved','line_count',line_count,'allowance_count',allowance_count,'material_count',material_count);
end;
$$;

revoke all on function private.create_app_project_from_estimate_v1_impl(uuid,text,text,integer,text,text,text,text,text,text,date,date,text,text,numeric,numeric,numeric,numeric,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant usage on schema private to authenticated;
grant execute on function private.create_app_project_from_estimate_v1_impl(uuid,text,text,integer,text,text,text,text,text,text,date,date,text,text,numeric,numeric,numeric,numeric,jsonb,jsonb,jsonb) to authenticated;

create or replace function public.create_app_project_from_estimate_v1(
  target_company uuid,
  source_workspace_id text,
  source_estimate_id text,
  source_version integer,
  source_fingerprint text,
  project_name text,
  project_location text,
  project_code text,
  project_client_name text,
  project_type text,
  project_start_date date,
  project_expected_end_date date,
  project_description text,
  budget_currency_code text,
  budget_direct_cost numeric,
  budget_allowance_total numeric,
  budget_internal_cost numeric,
  budget_contract_value_snapshot numeric,
  budget_lines jsonb,
  budget_allowances jsonb default '[]'::jsonb,
  budget_materials jsonb default '[]'::jsonb
)
returns jsonb
language sql
security invoker
set search_path=''
as $$
  select private.create_app_project_from_estimate_v1_impl(target_company,source_workspace_id,source_estimate_id,source_version,source_fingerprint,project_name,project_location,project_code,project_client_name,project_type,project_start_date,project_expected_end_date,project_description,budget_currency_code,budget_direct_cost,budget_allowance_total,budget_internal_cost,budget_contract_value_snapshot,budget_lines,budget_allowances,budget_materials);
$$;

revoke all on function public.create_app_project_from_estimate_v1(uuid,text,text,integer,text,text,text,text,text,text,date,date,text,text,numeric,numeric,numeric,numeric,jsonb,jsonb,jsonb) from public,anon;
grant execute on function public.create_app_project_from_estimate_v1(uuid,text,text,integer,text,text,text,text,text,text,date,date,text,text,numeric,numeric,numeric,numeric,jsonb,jsonb,jsonb) to authenticated;

-- Intentionally absent: INSERT/UPDATE on public.transactions, financial accounts, journals or commitments.
