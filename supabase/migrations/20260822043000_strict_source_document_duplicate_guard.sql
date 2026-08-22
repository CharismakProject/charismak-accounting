-- Exact source-document duplication must be blocked across document types.
-- A file first uploaded as `other` and later detected as `bank_statement`
-- is still the same source evidence and must not be registered twice.

begin;

alter table public.source_documents
  drop constraint if exists source_documents_company_id_document_type_file_hash_key;

alter table public.source_documents
  add constraint source_documents_company_id_file_hash_key
  unique (company_id, file_hash);

comment on constraint source_documents_company_id_file_hash_key on public.source_documents is
  'Prevents the same exact uploaded file from being registered twice for one company, regardless of document type or filename.';

commit;
