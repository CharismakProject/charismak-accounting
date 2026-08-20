insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('project-documents','project-documents',false,20971520,array['application/pdf','text/csv','application/csv','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.openxmlformats-officedocument.wordprocessingml.document','image/jpeg','image/png','image/webp'])
on conflict(id) do update set file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;

create or replace function private.storage_project_id(object_name text)
returns uuid
language plpgsql
stable security definer
set search_path=''
as $$
declare
  folders text[];
begin
  folders:=storage.foldername(object_name);
  if array_length(folders,1)<2 then return null; end if;
  return folders[2]::uuid;
exception when others then
  return null;
end;
$$;

create table if not exists public.project_document_intelligence(
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  document_id uuid not null unique references public.source_documents(id) on delete cascade,
  analysis_status text not null default 'pending' check(analysis_status in('pending','analysing','ready','failed')),
  review_status text not null default 'pending' check(review_status in('pending','confirmed','ignored','needs_attention')),
  detected_subtype text,
  confidence numeric not null default 0 check(confidence>=0 and confidence<=100),
  title text,
  document_reference text,
  related_reference text,
  client_name text,
  project_name text,
  document_date date,
  subtotal numeric,
  discount_amount numeric,
  vat_amount numeric,
  grand_total numeric,
  suggested_effect text,
  extracted_fields jsonb not null default '{}'::jsonb,
  extracted_line_items jsonb not null default '[]'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  raw_text_preview text,
  analysis_version text,
  analysed_at timestamptz,
  reviewed_by uuid,
  reviewed_at timestamptz,
  confirmed_effect text,
  confirmed_amount numeric,
  confirmation_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_document_applications(
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  document_id uuid not null unique references public.source_documents(id) on delete cascade,
  effect text not null,
  amount numeric,
  applied_data jsonb not null default '{}'::jsonb,
  applied_by uuid,
  applied_at timestamptz not null default now()
);

create table if not exists public.project_contract_items(
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  source_document_id uuid references public.source_documents(id) on delete set null,
  section_name text,
  item_code text,
  description text not null,
  unit text,
  quantity numeric,
  rate numeric,
  amount numeric,
  item_status text not null default 'active',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_project_doc_intel_project on public.project_document_intelligence(project_id,created_at desc);
create index if not exists idx_project_contract_items_project on public.project_contract_items(project_id,sort_order);

alter table public.project_document_intelligence enable row level security;
alter table public.project_document_applications enable row level security;
alter table public.project_contract_items enable row level security;

drop policy if exists project_document_intelligence_select on public.project_document_intelligence;
create policy project_document_intelligence_select on public.project_document_intelligence for select using(private.can_access_project(company_id,project_id));
drop policy if exists project_document_intelligence_write on public.project_document_intelligence;
create policy project_document_intelligence_write on public.project_document_intelligence for all using(private.can_access_project(company_id,project_id)) with check(private.can_access_project(company_id,project_id));

drop policy if exists project_document_applications_select on public.project_document_applications;
create policy project_document_applications_select on public.project_document_applications for select using(private.can_access_project(company_id,project_id));
drop policy if exists project_document_applications_write on public.project_document_applications;
create policy project_document_applications_write on public.project_document_applications for all using(private.is_company_owner(company_id) or private.has_permission(company_id,'projects.manage') or private.has_permission(company_id,'budgets.manage') or private.has_permission(company_id,'variations.manage')) with check(private.is_company_owner(company_id) or private.has_permission(company_id,'projects.manage') or private.has_permission(company_id,'budgets.manage') or private.has_permission(company_id,'variations.manage'));

drop policy if exists project_contract_items_select on public.project_contract_items;
create policy project_contract_items_select on public.project_contract_items for select using(private.can_access_project(company_id,project_id));
drop policy if exists project_contract_items_write on public.project_contract_items;
create policy project_contract_items_write on public.project_contract_items for all using(private.is_company_owner(company_id) or private.has_permission(company_id,'projects.manage') or private.has_permission(company_id,'budgets.manage')) with check(private.is_company_owner(company_id) or private.has_permission(company_id,'projects.manage') or private.has_permission(company_id,'budgets.manage'));

drop policy if exists project_docs_select on storage.objects;
create policy project_docs_select on storage.objects for select using(bucket_id='project-documents' and private.can_access_project(private.storage_company_id(name),private.storage_project_id(name)));
drop policy if exists project_docs_insert on storage.objects;
create policy project_docs_insert on storage.objects for insert with check(bucket_id='project-documents' and private.can_access_project(private.storage_company_id(name),private.storage_project_id(name)) and (private.is_company_owner(private.storage_company_id(name)) or private.has_permission(private.storage_company_id(name),'documents.upload')));
drop policy if exists project_docs_update on storage.objects;
create policy project_docs_update on storage.objects for update using(bucket_id='project-documents' and private.can_access_project(private.storage_company_id(name),private.storage_project_id(name)) and (private.is_company_owner(private.storage_company_id(name)) or private.has_permission(private.storage_company_id(name),'documents.upload'))) with check(bucket_id='project-documents' and private.can_access_project(private.storage_company_id(name),private.storage_project_id(name)) and (private.is_company_owner(private.storage_company_id(name)) or private.has_permission(private.storage_company_id(name),'documents.upload')));
drop policy if exists project_docs_delete on storage.objects;
create policy project_docs_delete on storage.objects for delete using(bucket_id='project-documents' and private.can_access_project(private.storage_company_id(name),private.storage_project_id(name)) and (private.is_company_owner(private.storage_company_id(name)) or private.has_permission(private.storage_company_id(name),'documents.upload')));
