-- DRAFT ONLY — fold into project_cost_import_rpc_v1.sql before final migration.
-- Avoid granting authenticated USAGE on the private schema.
-- These two public functions are the only intended RPC entry points and delegate
-- to private implementations that explicitly require auth.uid() and MD membership.

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
security definer
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

create or replace function public.approve_project_cost_budget_v1(target_budget uuid)
returns jsonb
language sql
security definer
set search_path=''
as $$
  select private.approve_project_cost_budget_v1_impl(target_budget);
$$;

revoke all on function public.approve_project_cost_budget_v1(uuid) from public,anon;
grant execute on function public.approve_project_cost_budget_v1(uuid) to authenticated;
