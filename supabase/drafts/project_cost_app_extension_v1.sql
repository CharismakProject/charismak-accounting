-- DRAFT ONLY — DO NOT APPLY WITHOUT REVIEW.
-- Depends on project_cost_bridge_v1.sql.
-- Extends the shared project-cost bridge for the standalone Charismak App Estimate flow.

alter table public.project_source_links
  drop constraint if exists project_source_links_source_system_check;
alter table public.project_source_links
  add constraint project_source_links_source_system_check
  check (source_system in ('charismak_estimator','charismak_app_estimate'));

alter table public.project_cost_budget_lines
  drop constraint if exists project_cost_budget_lines_supply_responsibility_check;
alter table public.project_cost_budget_lines
  add constraint project_cost_budget_lines_supply_responsibility_check
  check (supply_responsibility in ('contractor','client','specialist','labour_only','unknown'));

create table if not exists public.project_cost_budget_materials (
  id uuid primary key default gen_random_uuid(),
  budget_id uuid not null references public.project_cost_budgets(id) on delete cascade,
  material_key text not null,
  material text not null,
  unit text not null,
  quantity numeric(20,6) not null check (quantity >= 0),
  sources jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  constraint project_cost_budget_materials_key_unique unique (budget_id,material_key),
  constraint project_cost_budget_materials_sources_array check (jsonb_typeof(sources)='array')
);

create index if not exists project_cost_budget_materials_budget_idx
  on public.project_cost_budget_materials(budget_id);

alter table public.project_cost_budget_materials enable row level security;
revoke all on table public.project_cost_budget_materials from anon;
grant select on table public.project_cost_budget_materials to authenticated;
grant select,insert,update,delete on table public.project_cost_budget_materials to service_role;

drop policy if exists project_cost_budget_materials_select_cost_roles on public.project_cost_budget_materials;
create policy project_cost_budget_materials_select_cost_roles
on public.project_cost_budget_materials for select to authenticated
using (exists (
  select 1 from public.project_cost_budgets budget
  where budget.id=budget_id
    and (select private.can_view_project_cost(budget.project_id))
));

-- No direct authenticated write policy is created for material snapshots.
-- Writes are intentionally restricted to the guarded approval RPC/service role.
