-- DRAFT ONLY — fold into the final project-cost migration before application.
-- The review-first RPCs are the only supported authenticated mutation path.

revoke insert,update,delete,truncate,references,trigger
  on table public.project_source_links
  from authenticated;
revoke insert,update,delete,truncate,references,trigger
  on table public.project_cost_budgets
  from authenticated;
revoke insert,update,delete,truncate,references,trigger
  on table public.project_cost_budget_lines
  from authenticated;
revoke insert,update,delete,truncate,references,trigger
  on table public.project_cost_budget_allowances
  from authenticated;

-- Read access still requires the RLS policies from project_cost_bridge_v1.sql.
grant select on table public.project_source_links to authenticated;
grant select on table public.project_cost_budgets to authenticated;
grant select on table public.project_cost_budget_lines to authenticated;
grant select on table public.project_cost_budget_allowances to authenticated;

-- Server maintenance remains possible without widening browser/client permissions.
grant all privileges on table public.project_source_links to service_role;
grant all privileges on table public.project_cost_budgets to service_role;
grant all privileges on table public.project_cost_budget_lines to service_role;
grant all privileges on table public.project_cost_budget_allowances to service_role;
