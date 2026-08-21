-- Restored from the production migration history so a fresh database can be
-- rebuilt deterministically before project/financial migrations are applied.

create schema if not exists private;

create or replace function private.is_company_member(target_company uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.company_memberships m
    where m.company_id = target_company
      and m.user_id = auth.uid()
      and m.status = 'active'
  );
$$;

grant usage on schema private to authenticated;
grant execute on function private.is_company_member(uuid) to authenticated;

alter policy companies_member_select on public.companies
using (private.is_company_member(id));

alter policy memberships_company_select on public.company_memberships
using (private.is_company_member(company_id));

alter policy positions_company_select on public.positions
using (company_id is null or private.is_company_member(company_id));

drop function if exists public.is_company_member(uuid);

alter table public.permissions enable row level security;

drop policy if exists permissions_authenticated_select on public.permissions;
create policy permissions_authenticated_select on public.permissions
for select to authenticated
using (true);

drop policy if exists membership_positions_member_select on public.membership_positions;
create policy membership_positions_member_select on public.membership_positions
for select to authenticated
using (
  exists (
    select 1
    from public.company_memberships m
    where m.id = membership_positions.membership_id
      and private.is_company_member(m.company_id)
  )
);

drop policy if exists position_permissions_member_select on public.position_permissions;
create policy position_permissions_member_select on public.position_permissions
for select to authenticated
using (
  exists (
    select 1
    from public.positions p
    where p.id = position_permissions.position_id
      and (p.company_id is null or private.is_company_member(p.company_id))
  )
);

drop policy if exists membership_overrides_member_select on public.membership_permission_overrides;
create policy membership_overrides_member_select on public.membership_permission_overrides
for select to authenticated
using (
  exists (
    select 1
    from public.company_memberships m
    where m.id = membership_permission_overrides.membership_id
      and private.is_company_member(m.company_id)
  )
);

revoke all on function private.is_company_member(uuid) from public;
revoke all on schema private from anon;
