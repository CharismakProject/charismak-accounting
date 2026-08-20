drop policy if exists intake_batches_member_access on public.intake_batches;
drop policy if exists intake_items_member_access on public.intake_items;

create policy intake_batches_select on public.intake_batches for select to authenticated
using (created_by=auth.uid() or private.is_company_owner(company_id) or private.has_company_wide_permission(company_id,'documents.confirm') or private.has_company_wide_permission(company_id,'transactions.confirm') or private.has_company_wide_permission(company_id,'statements.upload'));
create policy intake_batches_insert on public.intake_batches for insert to authenticated
with check (created_by=auth.uid() and (private.is_company_owner(company_id) or private.has_permission(company_id,'documents.upload') or private.has_permission(company_id,'statements.upload')));
create policy intake_batches_update on public.intake_batches for update to authenticated
using (created_by=auth.uid() or private.is_company_owner(company_id) or private.has_company_wide_permission(company_id,'documents.confirm') or private.has_company_wide_permission(company_id,'transactions.confirm'))
with check (created_by=auth.uid() or private.is_company_owner(company_id) or private.has_company_wide_permission(company_id,'documents.confirm') or private.has_company_wide_permission(company_id,'transactions.confirm'));

create policy intake_items_select on public.intake_items for select to authenticated
using (private.is_company_owner(company_id) or private.has_company_wide_permission(company_id,'documents.confirm') or private.has_company_wide_permission(company_id,'transactions.confirm') or exists(select 1 from public.intake_batches b where b.id=batch_id and b.created_by=auth.uid()));
create policy intake_items_insert on public.intake_items for insert to authenticated
with check (exists(select 1 from public.intake_batches b where b.id=batch_id and b.company_id=intake_items.company_id and b.created_by=auth.uid()));
create policy intake_items_update on public.intake_items for update to authenticated
using (private.is_company_owner(company_id) or private.has_company_wide_permission(company_id,'documents.confirm') or private.has_company_wide_permission(company_id,'transactions.confirm') or exists(select 1 from public.intake_batches b where b.id=batch_id and b.created_by=auth.uid()))
with check (private.is_company_owner(company_id) or private.has_company_wide_permission(company_id,'documents.confirm') or private.has_company_wide_permission(company_id,'transactions.confirm') or exists(select 1 from public.intake_batches b where b.id=batch_id and b.created_by=auth.uid()));

drop policy if exists source_documents_universal_intake_insert on public.source_documents;
create policy source_documents_universal_intake_insert on public.source_documents for insert to authenticated
with check (document_type='other'::source_document_type and project_id is null and uploaded_by=auth.uid() and (private.is_company_owner(company_id) or private.has_permission(company_id,'documents.upload') or private.has_permission(company_id,'statements.upload')));
drop policy if exists source_documents_own_intake_select on public.source_documents;
create policy source_documents_own_intake_select on public.source_documents for select to authenticated
using (uploaded_by=auth.uid() and document_type='other'::source_document_type and project_id is null);

drop policy if exists universal_intake_read on storage.objects;
drop policy if exists universal_intake_insert on storage.objects;
drop policy if exists universal_intake_delete on storage.objects;
create policy universal_intake_insert on storage.objects for insert to authenticated
with check (bucket_id='universal-intake' and exists (select 1 from public.company_memberships m where m.user_id=auth.uid() and m.status='active' and m.company_id::text=(storage.foldername(name))[1] and (m.is_owner or private.has_permission(m.company_id,'documents.upload') or private.has_permission(m.company_id,'statements.upload'))));
create policy universal_intake_read on storage.objects for select to authenticated
using (bucket_id='universal-intake' and exists (select 1 from public.source_documents d where d.storage_path=storage.objects.name and (d.uploaded_by=auth.uid() or private.is_company_owner(d.company_id) or (d.project_id is not null and private.can_access_project(d.company_id,d.project_id)) or (d.document_type='bank_statement'::source_document_type and private.has_permission(d.company_id,'statements.upload')) or private.has_company_wide_permission(d.company_id,'documents.confirm'))));
create policy universal_intake_delete on storage.objects for delete to authenticated
using (bucket_id='universal-intake' and exists (select 1 from public.source_documents d where d.storage_path=storage.objects.name and (d.uploaded_by=auth.uid() or private.is_company_owner(d.company_id))));
