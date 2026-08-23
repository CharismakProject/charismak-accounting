create index if not exists idx_transaction_intelligence_project
  on public.transaction_intelligence_decisions(project_id)
  where project_id is not null;

create index if not exists idx_transaction_intelligence_canonical_transaction
  on public.transaction_intelligence_decisions(canonical_transaction_id)
  where canonical_transaction_id is not null;

create index if not exists idx_transaction_intelligence_created_by
  on public.transaction_intelligence_decisions(created_by)
  where created_by is not null;
