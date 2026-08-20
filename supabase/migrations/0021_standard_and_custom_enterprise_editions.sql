-- Keep the self-serve product focused on small and medium contractors while
-- retaining configuration hooks for individually validated enterprise work.

alter table public.companies
  add column if not exists product_edition text not null default 'standard',
  add column if not exists enterprise_capabilities jsonb not null default '{}'::jsonb;

alter table public.companies
  drop constraint if exists companies_product_edition_check;

alter table public.companies
  add constraint companies_product_edition_check
  check (product_edition in ('standard', 'enterprise_custom'));

alter table public.companies
  alter column active_project_limit set default 25;

update public.companies
set active_project_limit = 25
where product_edition = 'standard'
  and active_project_limit = 10;

comment on column public.companies.product_edition is
  'Standard is the self-serve small/medium contractor product. Custom enterprise is enabled only for individually scoped large-company deployments.';

comment on column public.companies.enterprise_capabilities is
  'Explicit custom-enterprise feature flags. Standard workspaces ignore these flags.';

-- No public SECURITY DEFINER feature-gate function is created here. The existing
-- company SELECT policy already limits edition metadata to active members, and
-- enterprise capabilities should be checked in privileged, feature-specific
-- policies only when an enterprise integration is actually implemented.
