drop policy if exists transaction_intelligence_update on public.transaction_intelligence_decisions;

create policy transaction_intelligence_update on public.transaction_intelligence_decisions
  for update to authenticated
  using (
    private.is_company_member(company_id)
    and created_by=(select auth.uid())
  )
  with check (
    private.is_company_member(company_id)
    and created_by=(select auth.uid())
    and exists(
      select 1
      from public.statement_imports si
      join public.statement_rows sr on sr.import_id=si.id
      where si.id=import_id
        and sr.id=statement_row_id
        and si.company_id=company_id
    )
  );
