create table if not exists public.intake_batches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  status text not null default 'processing' check (status in ('processing','ready','needs_review','completed','failed')),
  total_files integer not null default 0,
  processed_files integer not null default 0,
  needs_review_count integer not null default 0,
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.intake_items (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.intake_batches(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  document_id uuid not null references public.source_documents(id) on delete cascade,
  detected_type text,
  detected_project_id uuid references public.projects(id) on delete set null,
  confidence numeric(5,2),
  status text not null default 'processing' check (status in ('processing','ready','needs_review','applied','failed')),
  suggested_action jsonb not null default '{}'::jsonb,
  message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(document_id)
);

alter table public.intake_batches enable row level security;
alter table public.intake_items enable row level security;

drop policy if exists intake_batches_member_access on public.intake_batches;
create policy intake_batches_member_access on public.intake_batches for all to authenticated
using (exists (select 1 from public.company_memberships m where m.company_id=intake_batches.company_id and m.user_id=auth.uid() and m.status='active'))
with check (exists (select 1 from public.company_memberships m where m.company_id=intake_batches.company_id and m.user_id=auth.uid() and m.status='active'));

drop policy if exists intake_items_member_access on public.intake_items;
create policy intake_items_member_access on public.intake_items for all to authenticated
using (exists (select 1 from public.company_memberships m where m.company_id=intake_items.company_id and m.user_id=auth.uid() and m.status='active'))
with check (exists (select 1 from public.company_memberships m where m.company_id=intake_items.company_id and m.user_id=auth.uid() and m.status='active'));

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('universal-intake','universal-intake',false,20971520,null)
on conflict (id) do update set public=false,file_size_limit=20971520;

drop policy if exists universal_intake_read on storage.objects;
create policy universal_intake_read on storage.objects for select to authenticated
using (bucket_id='universal-intake' and exists (
  select 1 from public.company_memberships m where m.user_id=auth.uid() and m.status='active' and m.company_id::text=(storage.foldername(name))[1]
));

drop policy if exists universal_intake_insert on storage.objects;
create policy universal_intake_insert on storage.objects for insert to authenticated
with check (bucket_id='universal-intake' and exists (
  select 1 from public.company_memberships m where m.user_id=auth.uid() and m.status='active' and m.company_id::text=(storage.foldername(name))[1]
));

drop policy if exists universal_intake_delete on storage.objects;
create policy universal_intake_delete on storage.objects for delete to authenticated
using (bucket_id='universal-intake' and exists (
  select 1 from public.company_memberships m where m.user_id=auth.uid() and m.status='active' and m.company_id::text=(storage.foldername(name))[1]
));

create or replace view public.project_commercial_positions with (security_invoker=true) as
select
  p.id as project_id,
  p.company_id,
  p.project_code,
  p.name as project_name,
  coalesce(sum(a.amount) filter (where a.commercial_role='base_scope'),0)::numeric as base_scope,
  coalesce(sum(a.amount) filter (where a.commercial_role='additional_scope'),0)::numeric as additional_scope,
  coalesce(sum(a.amount) filter (where a.commercial_role='variation'),0)::numeric as variations,
  coalesce(sum(a.amount) filter (where a.commercial_role in ('base_scope','additional_scope','variation')),0)::numeric as identified_commercial_value,
  coalesce(sum(a.amount) filter (where a.billing_role='client_invoice'),0)::numeric as documented_client_invoices,
  coalesce(sum(a.amount) filter (where a.commercial_role in ('base_scope','additional_scope','variation') and a.approval_status='approved'),0)::numeric as approved_commercial_value,
  count(*) filter (where i.review_status='pending')::integer as documents_needing_review
from public.projects p
left join public.project_document_applications a on a.project_id=p.id
left join public.project_document_intelligence i on i.project_id=p.id and i.document_id=a.document_id
group by p.id,p.company_id,p.project_code,p.name;

grant select on public.project_commercial_positions to authenticated;

create or replace function public.refresh_project_commercial_position(p_project_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_identified numeric; v_invoiced numeric;
begin
  if not exists (
    select 1 from public.projects p join public.company_memberships m on m.company_id=p.company_id
    where p.id=p_project_id and m.user_id=auth.uid() and m.status='active'
  ) then raise exception 'Project access denied'; end if;
  select identified_commercial_value, documented_client_invoices into v_identified,v_invoiced
  from public.project_commercial_positions where project_id=p_project_id;
  update public.project_financial_summaries
  set expected_contract_revenue=coalesce(v_identified,0), invoiced_amount=greatest(coalesce(invoiced_amount,0),coalesce(v_invoiced,0)), updated_at=now()
  where project_id=p_project_id;
end $$;
revoke all on function public.refresh_project_commercial_position(uuid) from public;
grant execute on function public.refresh_project_commercial_position(uuid) to authenticated;
