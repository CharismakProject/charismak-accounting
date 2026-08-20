drop policy if exists source_documents_own_intake_update on public.source_documents;
create policy source_documents_own_intake_update on public.source_documents
for update to authenticated
using (
  uploaded_by=auth.uid()
  and document_type='other'::source_document_type
  and project_id is null
)
with check (
  uploaded_by=auth.uid()
  and (
    (document_type='other'::source_document_type and project_id is null)
    or (document_type='bank_statement'::source_document_type and private.has_permission(company_id,'statements.upload'))
    or (project_id is not null and private.can_access_project(company_id,project_id))
  )
);
