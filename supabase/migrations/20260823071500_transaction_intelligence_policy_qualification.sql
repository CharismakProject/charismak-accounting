drop policy if exists transaction_intelligence_insert on public.transaction_intelligence_decisions;
create policy transaction_intelligence_insert on public.transaction_intelligence_decisions
  for insert to authenticated
  with check (
    private.is_company_member(transaction_intelligence_decisions.company_id)
    and transaction_intelligence_decisions.created_by=(select auth.uid())
    and exists(
      select 1
      from public.statement_imports si
      join public.statement_rows sr on sr.import_id=si.id
      where si.id=transaction_intelligence_decisions.import_id
        and sr.id=transaction_intelligence_decisions.statement_row_id
        and si.company_id=transaction_intelligence_decisions.company_id
    )
  );

drop policy if exists transaction_intelligence_update on public.transaction_intelligence_decisions;
create policy transaction_intelligence_update on public.transaction_intelligence_decisions
  for update to authenticated
  using (
    private.is_company_member(transaction_intelligence_decisions.company_id)
    and transaction_intelligence_decisions.created_by=(select auth.uid())
  )
  with check (
    private.is_company_member(transaction_intelligence_decisions.company_id)
    and transaction_intelligence_decisions.created_by=(select auth.uid())
    and exists(
      select 1
      from public.statement_imports si
      join public.statement_rows sr on sr.import_id=si.id
      where si.id=transaction_intelligence_decisions.import_id
        and sr.id=transaction_intelligence_decisions.statement_row_id
        and si.company_id=transaction_intelligence_decisions.company_id
    )
  );
