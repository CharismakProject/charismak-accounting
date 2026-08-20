-- White-label company identity used by onboarding and every exported report.

create table if not exists public.company_branding (
  company_id uuid primary key references public.companies(id) on delete cascade,
  display_name text not null,
  legal_name text,
  rc_number text,
  tax_number text,
  address text,
  phone text,
  email text,
  website text,
  primary_color text not null default '#073F65' check (primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  secondary_color text not null default '#0B8B64' check (secondary_color ~ '^#[0-9A-Fa-f]{6}$'),
  report_footer text,
  logo_path text,
  letterhead_header_path text,
  letterhead_footer_path text,
  onboarding_complete boolean not null default false,
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.company_branding(company_id, display_name, legal_name)
select id, name, name from public.companies
on conflict(company_id) do nothing;

alter table public.company_branding enable row level security;
revoke all on table public.company_branding from anon, authenticated;
grant select, insert, update on table public.company_branding to authenticated;

drop policy if exists company_branding_member_select on public.company_branding;
create policy company_branding_member_select
on public.company_branding for select to authenticated
using (
  exists (
    select 1 from public.company_memberships m
    where m.company_id = company_branding.company_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
  )
);

drop policy if exists company_branding_owner_insert on public.company_branding;
create policy company_branding_owner_insert
on public.company_branding for insert to authenticated
with check (
  exists (
    select 1 from public.company_memberships m
    where m.company_id = company_branding.company_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.is_owner
  )
);

drop policy if exists company_branding_owner_update on public.company_branding;
create policy company_branding_owner_update
on public.company_branding for update to authenticated
using (
  exists (
    select 1 from public.company_memberships m
    where m.company_id = company_branding.company_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.is_owner
  )
)
with check (
  exists (
    select 1 from public.company_memberships m
    where m.company_id = company_branding.company_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.is_owner
  )
);

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values (
  'company-branding',
  'company-branding',
  false,
  5242880,
  array['image/png','image/jpeg','image/webp','image/svg+xml']
)
on conflict(id) do update set
  public = false,
  file_size_limit = 5242880,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists company_branding_assets_select on storage.objects;
create policy company_branding_assets_select
on storage.objects for select to authenticated
using (
  bucket_id = 'company-branding'
  and exists (
    select 1 from public.company_memberships m
    where m.company_id::text = (storage.foldername(name))[1]
      and m.user_id = (select auth.uid())
      and m.status = 'active'
  )
);

drop policy if exists company_branding_assets_insert on storage.objects;
create policy company_branding_assets_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'company-branding'
  and exists (
    select 1 from public.company_memberships m
    where m.company_id::text = (storage.foldername(name))[1]
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.is_owner
  )
);

drop policy if exists company_branding_assets_update on storage.objects;
create policy company_branding_assets_update
on storage.objects for update to authenticated
using (
  bucket_id = 'company-branding'
  and exists (
    select 1 from public.company_memberships m
    where m.company_id::text = (storage.foldername(name))[1]
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.is_owner
  )
)
with check (
  bucket_id = 'company-branding'
  and exists (
    select 1 from public.company_memberships m
    where m.company_id::text = (storage.foldername(name))[1]
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.is_owner
  )
);

drop policy if exists company_branding_assets_delete on storage.objects;
create policy company_branding_assets_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'company-branding'
  and exists (
    select 1 from public.company_memberships m
    where m.company_id::text = (storage.foldername(name))[1]
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.is_owner
  )
);

create or replace function private.create_company_branding_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.company_branding(company_id, display_name, legal_name)
  values(new.id, new.name, new.name)
  on conflict(company_id) do nothing;
  return new;
end;
$$;

revoke all on function private.create_company_branding_row() from public, anon, authenticated;

drop trigger if exists create_company_branding_after_company on public.companies;
create trigger create_company_branding_after_company
after insert on public.companies
for each row execute function private.create_company_branding_row();
