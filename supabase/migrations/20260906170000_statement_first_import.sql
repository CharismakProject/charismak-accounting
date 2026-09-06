alter table public.import_batches alter column project_id drop not null;

alter table public.import_rows
  add column if not exists project_id uuid references public.projects(id) on delete restrict;

drop policy if exists import_batches_select_project on public.import_batches;
create policy import_batches_select_project on public.import_batches
for select using (
  (select private.has_company_role(import_batches.company_id, array['md','accountant']::public.company_role[]))
  or (
    import_batches.project_id is not null
    and (select private.has_project_access(import_batches.project_id))
  )
);

drop policy if exists import_rows_select_project on public.import_rows;
create policy import_rows_select_project on public.import_rows
for select using (
  exists (
    select 1
    from public.import_batches batch
    where batch.id = import_rows.import_batch_id
      and (
        (select private.has_company_role(batch.company_id, array['md','accountant']::public.company_role[]))
        or (
          coalesce(import_rows.project_id, batch.project_id) is not null
          and (select private.has_project_access(coalesce(import_rows.project_id, batch.project_id)))
        )
      )
  )
);

create or replace function public.stage_import_batch(
  target_company_id uuid,
  target_project_id uuid,
  target_account_id uuid,
  import_filename text,
  import_source_type text,
  parsed_rows jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_batch_id uuid;
  source_row jsonb;
  source_kind public.transaction_kind;
  source_date date;
  source_amount numeric(18,2);
  source_title text;
  source_fingerprint text;
  source_status text;
  row_project_id uuid;
  ready_count integer := 0;
  duplicate_count integer := 0;
  review_count integer := 0;
  total_count integer := 0;
begin
  if not (select private.has_company_role(
    target_company_id, array['md','accountant']::public.company_role[]
  )) then
    raise exception 'Only the MD or Accountant can import official account activity';
  end if;

  if target_project_id is not null and not exists (
    select 1 from public.projects project
    where project.id = target_project_id and project.company_id = target_company_id
  ) then
    raise exception 'Project does not belong to company';
  end if;

  if not exists (
    select 1 from public.financial_accounts account
    where account.id = target_account_id
      and account.company_id = target_company_id
      and account.is_active
  ) then
    raise exception 'Financial account is not available';
  end if;

  if import_source_type not in ('bank_statement', 'project_ledger') then
    raise exception 'Unsupported import source';
  end if;
  if jsonb_typeof(parsed_rows) <> 'array' or jsonb_array_length(parsed_rows) = 0 then
    raise exception 'No import rows were supplied';
  end if;

  insert into public.import_batches (
    company_id, project_id, financial_account_id, source_type,
    original_filename, created_by
  ) values (
    target_company_id, target_project_id, target_account_id, import_source_type,
    trim(import_filename), (select auth.uid())
  ) returning id into new_batch_id;

  for source_row in select value from jsonb_array_elements(parsed_rows)
  loop
    total_count := total_count + 1;
    source_kind := (source_row ->> 'kind')::public.transaction_kind;
    source_date := (source_row ->> 'date')::date;
    source_amount := round((source_row ->> 'amount')::numeric, 2);
    source_title := left(trim(coalesce(source_row ->> 'title', 'Imported transaction')), 180);
    row_project_id := nullif(source_row ->> 'projectId', '')::uuid;
    if row_project_id is null then row_project_id := target_project_id; end if;

    if row_project_id is not null and not exists (
      select 1 from public.projects project
      where project.id = row_project_id and project.company_id = target_company_id
    ) then
      raise exception 'Row project does not belong to company at source row %', source_row ->> 'rowNumber';
    end if;

    if source_kind not in ('income', 'expense') or source_amount <= 0 or length(source_title) < 2 then
      raise exception 'Invalid transaction data at source row %', source_row ->> 'rowNumber';
    end if;

    source_fingerprint := md5(concat_ws('|',
      coalesce(row_project_id::text, 'unassigned'),
      target_account_id::text,
      source_kind::text,
      source_date::text,
      source_amount::text,
      lower(source_title)
    ));

    if row_project_id is null or coalesce((source_row ->> 'needsReview')::boolean, false) then
      source_status := 'needs_review';
      review_count := review_count + 1;
    elsif exists (
      select 1
      from public.import_rows previous_row
      where previous_row.company_id = target_company_id
        and previous_row.fingerprint = source_fingerprint
        and previous_row.status = 'imported'
    ) or exists (
      select 1
      from public.transactions transaction
      where transaction.company_id = target_company_id
        and transaction.project_id = row_project_id
        and transaction.source_account_id = target_account_id
        and transaction.kind = source_kind
        and transaction.transaction_date = source_date
        and transaction.amount = source_amount
        and lower(trim(transaction.title)) = lower(source_title)
        and transaction.status <> 'void'
    ) then
      source_status := 'duplicate';
      duplicate_count := duplicate_count + 1;
    else
      source_status := 'ready';
      ready_count := ready_count + 1;
    end if;

    insert into public.import_rows (
      import_batch_id, company_id, project_id, row_number, transaction_date, kind,
      amount, title, description, category_name, party_name, fingerprint,
      status, review_reason, raw_data
    ) values (
      new_batch_id,
      target_company_id,
      row_project_id,
      (source_row ->> 'rowNumber')::integer,
      source_date,
      source_kind,
      source_amount,
      source_title,
      nullif(trim(source_row ->> 'description'), ''),
      nullif(trim(source_row ->> 'category'), ''),
      nullif(trim(source_row ->> 'party'), ''),
      source_fingerprint,
      source_status,
      nullif(trim(source_row ->> 'reviewReason'), ''),
      coalesce(source_row -> 'raw', '{}'::jsonb)
    );
  end loop;

  update public.import_batches
  set total_rows = total_count,
      ready_rows = ready_count,
      duplicate_rows = duplicate_count,
      needs_review_rows = review_count
  where id = new_batch_id;

  return jsonb_build_object(
    'importId', new_batch_id,
    'total', total_count,
    'ready', ready_count,
    'duplicates', duplicate_count,
    'needsReview', review_count
  );
end;
$$;

create or replace function public.confirm_import_batch(target_import_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_batch public.import_batches%rowtype;
  staged_row public.import_rows%rowtype;
  category_id uuid;
  contact_id uuid;
  transaction_id uuid;
  imported_count integer := 0;
begin
  select * into target_batch
  from public.import_batches batch
  where batch.id = target_import_id
  for update;

  if target_batch.id is null then raise exception 'Import batch was not found'; end if;
  if target_batch.status <> 'staged' then raise exception 'This import batch has already been processed'; end if;
  if not (select private.has_company_role(
    target_batch.company_id, array['md','accountant']::public.company_role[]
  )) then
    raise exception 'Only the MD or Accountant can confirm an import';
  end if;
  if target_batch.financial_account_id is null then
    raise exception 'Choose the statement account before confirming the import';
  end if;

  for staged_row in
    select * from public.import_rows import_row
    where import_row.import_batch_id = target_import_id
      and import_row.status = 'ready'
    order by import_row.row_number
  loop
    if staged_row.project_id is null then
      raise exception 'A ready statement row has no project assignment';
    end if;

    category_id := null;
    contact_id := null;

    if staged_row.category_name is not null then
      insert into public.categories (company_id, name, kind)
      values (target_batch.company_id, staged_row.category_name, staged_row.kind::text)
      on conflict (company_id, name, kind) do update set name = excluded.name
      returning id into category_id;
    end if;

    if staged_row.party_name is not null and staged_row.party_name <> 'Not specified' then
      select contact.id into contact_id
      from public.contacts contact
      where contact.company_id = target_batch.company_id
        and lower(contact.display_name) = lower(staged_row.party_name)
      order by contact.created_at
      limit 1;
      if contact_id is null then
        insert into public.contacts (company_id, display_name, contact_type, created_by)
        values (
          target_batch.company_id,
          staged_row.party_name,
          case when staged_row.kind = 'income' then 'client' else 'supplier' end,
          (select auth.uid())
        ) returning id into contact_id;
      end if;
    end if;

    transaction_id := public.record_transaction(
      target_batch.company_id,
      staged_row.project_id,
      staged_row.kind,
      staged_row.amount,
      staged_row.title,
      staged_row.transaction_date,
      target_batch.financial_account_id,
      null,
      category_id,
      contact_id,
      staged_row.description
    );

    update public.import_rows
    set status = 'imported', created_transaction_id = transaction_id
    where id = staged_row.id;
    imported_count := imported_count + 1;
  end loop;

  update public.import_batches
  set status = case when needs_review_rows > 0 then 'confirmed_with_review' else 'confirmed' end,
      imported_rows = imported_count,
      confirmed_at = now()
  where id = target_import_id;

  return jsonb_build_object(
    'importId', target_import_id,
    'imported', imported_count,
    'duplicates', target_batch.duplicate_rows,
    'needsReview', target_batch.needs_review_rows
  );
end;
$$;
