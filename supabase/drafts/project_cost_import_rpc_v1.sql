-- DRAFT ONLY — DO NOT APPLY WITHOUT REVIEW.
-- Depends on project_cost_bridge_v1.sql.
-- Atomic review-first Estimator -> Accounting persistence for the inspected live schema.

create or replace function private.stage_estimator_budget_v1_impl(
  target_company uuid,
  target_project uuid,
  estimator_project_id text,
  estimator_estimate_id text,
  estimator_version integer,
  estimator_fingerprint text,
  estimator_price_basis_at timestamptz,
  budget_currency_code text,
  budget_direct_cost numeric,
  budget_allowance_total numeric,
  budget_internal_cost numeric,
  budget_contract_value_snapshot numeric,
  budget_lines jsonb,
  budget_allowances jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  caller uuid := auth.uid();
  source_link public.project_source_links%rowtype;
  existing_budget public.project_cost_budgets%rowtype;
  next_budget_version integer;
  new_budget_id uuid;
  line_total numeric(18,2);
  allowance_total numeric(18,2);
  line_count integer;
  allowance_count integer;
  duplicate_line_count integer;
  invalid_line_count integer;
  stale_source boolean := false;
begin
  if caller is null then
    raise exception 'Authentication is required.' using errcode='42501';
  end if;

  if not private.has_company_role(target_company,array['md']::company_role[]) then
    raise exception 'Only an MD can stage an Estimator budget.' using errcode='42501';
  end if;

  if not exists (
    select 1 from public.projects p
    where p.id=target_project and p.company_id=target_company
  ) then
    raise exception 'Target project is not in the selected company.' using errcode='23503';
  end if;

  estimator_project_id := nullif(trim(estimator_project_id),'');
  estimator_estimate_id := nullif(trim(estimator_estimate_id),'');
  estimator_fingerprint := nullif(trim(estimator_fingerprint),'');
  budget_currency_code := upper(nullif(trim(budget_currency_code),''));

  if estimator_project_id is null or estimator_fingerprint is null then
    raise exception 'Estimator project ID and source fingerprint are required.' using errcode='22023';
  end if;
  if estimator_version is null or estimator_version < 1 then
    raise exception 'Estimator version must be at least 1.' using errcode='22023';
  end if;
  if budget_currency_code is null or budget_currency_code !~ '^[A-Z]{3}$' then
    raise exception 'Currency must be a three-letter code.' using errcode='22023';
  end if;
  if coalesce(budget_direct_cost,-1) < 0
     or coalesce(budget_allowance_total,-1) < 0
     or coalesce(budget_internal_cost,-1) < 0
     or (budget_contract_value_snapshot is not null and budget_contract_value_snapshot < 0) then
    raise exception 'Budget amounts must be non-negative.' using errcode='22023';
  end if;
  if round(budget_direct_cost + budget_allowance_total,2) <> round(budget_internal_cost,2) then
    raise exception 'Internal budget must equal direct cost plus allowances.' using errcode='23514';
  end if;

  if jsonb_typeof(budget_lines) <> 'array' or jsonb_array_length(budget_lines)=0 then
    raise exception 'At least one reviewed budget line is required.' using errcode='22023';
  end if;
  if budget_allowances is null then budget_allowances := '[]'::jsonb; end if;
  if jsonb_typeof(budget_allowances) <> 'array' then
    raise exception 'Budget allowances must be a JSON array.' using errcode='22023';
  end if;

  select count(*),coalesce(round(sum(x.amount),2),0)
  into line_count,line_total
  from jsonb_to_recordset(budget_lines) as x(
    source_line_id text,
    cost_code text,
    description text,
    unit text,
    quantity numeric,
    rate numeric,
    amount numeric,
    supply_responsibility text
  );

  select count(*)
  into duplicate_line_count
  from (
    select x.source_line_id
    from jsonb_to_recordset(budget_lines) as x(source_line_id text)
    group by x.source_line_id
    having count(*) > 1
  ) duplicates;

  select count(*)
  into invalid_line_count
  from jsonb_to_recordset(budget_lines) as x(
    source_line_id text,
    cost_code text,
    description text,
    unit text,
    quantity numeric,
    rate numeric,
    amount numeric,
    supply_responsibility text
  )
  where nullif(trim(x.source_line_id),'') is null
     or nullif(trim(x.description),'') is null
     or x.amount is null or x.amount < 0
     or (x.quantity is not null and x.quantity < 0)
     or (x.rate is not null and x.rate < 0)
     or x.supply_responsibility not in ('contractor','client','unknown')
     or not exists (select 1 from public.construction_cost_codes c where c.code=x.cost_code and c.is_active);

  if duplicate_line_count > 0 then
    raise exception 'Duplicate source line IDs are not allowed.' using errcode='23505';
  end if;
  if invalid_line_count > 0 then
    raise exception 'One or more budget lines failed review validation.' using errcode='23514';
  end if;
  if round(line_total,2) <> round(budget_direct_cost,2) then
    raise exception 'Budget line total must equal reviewed direct cost.' using errcode='23514';
  end if;

  select count(*),coalesce(round(sum(x.amount),2),0)
  into allowance_count,allowance_total
  from jsonb_to_recordset(budget_allowances) as x(
    source_allowance_id text,
    kind text,
    description text,
    amount numeric
  );

  if exists (
    select 1
    from jsonb_to_recordset(budget_allowances) as x(
      source_allowance_id text,
      kind text,
      description text,
      amount numeric
    )
    where nullif(trim(x.source_allowance_id),'') is null
       or nullif(trim(x.description),'') is null
       or x.kind not in ('contingency','other')
       or x.amount is null or x.amount < 0
  ) then
    raise exception 'One or more budget allowances failed review validation.' using errcode='23514';
  end if;

  if exists (
    select 1
    from (
      select x.source_allowance_id
      from jsonb_to_recordset(budget_allowances) as x(source_allowance_id text)
      group by x.source_allowance_id
      having count(*) > 1
    ) duplicate_allowances
  ) then
    raise exception 'Duplicate source allowance IDs are not allowed.' using errcode='23505';
  end if;

  if round(allowance_total,2) <> round(budget_allowance_total,2) then
    raise exception 'Allowance detail total must equal reviewed allowance budget.' using errcode='23514';
  end if;

  select * into existing_budget
  from public.project_cost_budgets b
  where b.company_id=target_company and b.source_fingerprint=estimator_fingerprint
  limit 1;

  if found then
    if existing_budget.project_id <> target_project then
      raise exception 'This Estimator fingerprint is already linked to another project.' using errcode='23505';
    end if;
    return jsonb_build_object(
      'status','existing',
      'budget_id',existing_budget.id,
      'budget_version',existing_budget.budget_version,
      'budget_status',existing_budget.status
    );
  end if;

  select * into source_link
  from public.project_source_links l
  where l.company_id=target_company
    and l.source_system='charismak_estimator'
    and l.source_project_id=estimator_project_id
  for update;

  if found then
    if source_link.project_id <> target_project then
      raise exception 'This Estimator project is already linked to another Accounting project.' using errcode='23505';
    end if;
    stale_source := source_link.source_version > estimator_version;
    if stale_source then
      raise exception 'A newer Estimator version is already linked. Refresh before staging.' using errcode='40001';
    end if;
    if source_link.source_version = estimator_version
       and source_link.source_fingerprint is not null
       and source_link.source_fingerprint <> estimator_fingerprint then
      raise exception 'Estimator version conflict: same version has different reviewed content.' using errcode='23505';
    end if;

    update public.project_source_links
    set source_estimate_id=estimator_estimate_id,
        source_version=estimator_version,
        source_fingerprint=estimator_fingerprint,
        price_basis_at=estimator_price_basis_at,
        updated_at=now()
    where id=source_link.id
    returning * into source_link;
  else
    insert into public.project_source_links(
      company_id,project_id,source_system,source_project_id,source_estimate_id,
      source_version,source_fingerprint,price_basis_at,created_by
    ) values (
      target_company,target_project,'charismak_estimator',estimator_project_id,estimator_estimate_id,
      estimator_version,estimator_fingerprint,estimator_price_basis_at,caller
    ) returning * into source_link;
  end if;

  select coalesce(max(b.budget_version),0)+1
  into next_budget_version
  from public.project_cost_budgets b
  where b.project_id=target_project;

  insert into public.project_cost_budgets(
    company_id,project_id,source_link_id,budget_version,status,currency_code,
    direct_cost,allowance_total,internal_cost_budget,contract_value_snapshot,
    source_fingerprint,price_basis_at,created_by
  ) values (
    target_company,target_project,source_link.id,next_budget_version,'draft',budget_currency_code,
    round(budget_direct_cost,2),round(budget_allowance_total,2),round(budget_internal_cost,2),
    case when budget_contract_value_snapshot is null then null else round(budget_contract_value_snapshot,2) end,
    estimator_fingerprint,estimator_price_basis_at,caller
  ) returning id into new_budget_id;

  insert into public.project_cost_budget_lines(
    budget_id,source_line_id,cost_code,description,unit,quantity,rate,amount,supply_responsibility
  )
  select
    new_budget_id,
    trim(x.source_line_id),
    x.cost_code,
    trim(x.description),
    nullif(trim(x.unit),''),
    x.quantity,
    x.rate,
    round(x.amount,2),
    x.supply_responsibility
  from jsonb_to_recordset(budget_lines) as x(
    source_line_id text,
    cost_code text,
    description text,
    unit text,
    quantity numeric,
    rate numeric,
    amount numeric,
    supply_responsibility text
  );

  if allowance_count > 0 then
    insert into public.project_cost_budget_allowances(
      budget_id,source_allowance_id,kind,description,amount
    )
    select
      new_budget_id,
      trim(x.source_allowance_id),
      x.kind,
      trim(x.description),
      round(x.amount,2)
    from jsonb_to_recordset(budget_allowances) as x(
      source_allowance_id text,
      kind text,
      description text,
      amount numeric
    );
  end if;

  return jsonb_build_object(
    'status','staged',
    'budget_id',new_budget_id,
    'budget_version',next_budget_version,
    'budget_status','draft',
    'line_count',line_count,
    'allowance_count',allowance_count
  );
end;
$$;

revoke all on function private.stage_estimator_budget_v1_impl(
  uuid,uuid,text,text,integer,text,timestamptz,text,numeric,numeric,numeric,numeric,jsonb,jsonb
) from public,anon;
grant execute on function private.stage_estimator_budget_v1_impl(
  uuid,uuid,text,text,integer,text,timestamptz,text,numeric,numeric,numeric,numeric,jsonb,jsonb
) to authenticated;

create or replace function public.stage_estimator_budget_v1(
  target_company uuid,
  target_project uuid,
  estimator_project_id text,
  estimator_estimate_id text,
  estimator_version integer,
  estimator_fingerprint text,
  estimator_price_basis_at timestamptz,
  budget_currency_code text,
  budget_direct_cost numeric,
  budget_allowance_total numeric,
  budget_internal_cost numeric,
  budget_contract_value_snapshot numeric,
  budget_lines jsonb,
  budget_allowances jsonb default '[]'::jsonb
)
returns jsonb
language sql
security invoker
set search_path=''
as $$
  select private.stage_estimator_budget_v1_impl(
    target_company,target_project,estimator_project_id,estimator_estimate_id,
    estimator_version,estimator_fingerprint,estimator_price_basis_at,budget_currency_code,
    budget_direct_cost,budget_allowance_total,budget_internal_cost,budget_contract_value_snapshot,
    budget_lines,budget_allowances
  );
$$;

revoke all on function public.stage_estimator_budget_v1(
  uuid,uuid,text,text,integer,text,timestamptz,text,numeric,numeric,numeric,numeric,jsonb,jsonb
) from public,anon;
grant execute on function public.stage_estimator_budget_v1(
  uuid,uuid,text,text,integer,text,timestamptz,text,numeric,numeric,numeric,numeric,jsonb,jsonb
) to authenticated;

create or replace function private.approve_project_cost_budget_v1_impl(target_budget uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  caller uuid := auth.uid();
  budget public.project_cost_budgets%rowtype;
begin
  if caller is null then
    raise exception 'Authentication is required.' using errcode='42501';
  end if;

  select * into budget
  from public.project_cost_budgets b
  where b.id=target_budget
  for update;

  if not found then
    raise exception 'Budget not found.' using errcode='P0002';
  end if;

  if not private.has_company_role(budget.company_id,array['md']::company_role[]) then
    raise exception 'Only an MD can approve a project cost budget.' using errcode='42501';
  end if;

  if budget.status='approved' then
    return jsonb_build_object(
      'status','already_approved',
      'budget_id',budget.id,
      'budget_version',budget.budget_version
    );
  end if;

  if budget.status <> 'draft' then
    raise exception 'Only a draft budget can be approved.' using errcode='23514';
  end if;

  update public.project_cost_budgets
  set status='superseded',superseded_at=now(),updated_at=now()
  where project_id=budget.project_id and status='approved' and id<>budget.id;

  update public.project_cost_budgets
  set status='approved',approved_by=caller,approved_at=now(),updated_at=now()
  where id=budget.id;

  return jsonb_build_object(
    'status','approved',
    'budget_id',budget.id,
    'budget_version',budget.budget_version,
    'project_id',budget.project_id
  );
end;
$$;

revoke all on function private.approve_project_cost_budget_v1_impl(uuid) from public,anon;
grant execute on function private.approve_project_cost_budget_v1_impl(uuid) to authenticated;

create or replace function public.approve_project_cost_budget_v1(target_budget uuid)
returns jsonb
language sql
security invoker
set search_path=''
as $$
  select private.approve_project_cost_budget_v1_impl(target_budget);
$$;

revoke all on function public.approve_project_cost_budget_v1(uuid) from public,anon;
grant execute on function public.approve_project_cost_budget_v1(uuid) to authenticated;

-- Contract value is intentionally not updated by either RPC.
-- Commercial contract changes require a separate explicit action/review decision.
