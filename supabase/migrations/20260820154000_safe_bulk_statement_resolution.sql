-- Keep incomplete parser rows in review instead of crashing a bulk action.
create or replace function public.bulk_resolve_statement_rows(
  target_import uuid,
  target_resolution text,
  target_keyword text default null::text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_company uuid;
  v_account uuid;
  v_user uuid := auth.uid();
  v_count integer := 0;
  v_skipped integer := 0;
  v_now timestamptz := now();
  r record;
  v_tx uuid;
  v_class text;
  v_status text;
  v_is_posted boolean;
begin
  select company_id, financial_account_id
    into v_company, v_account
  from public.statement_imports
  where id = target_import;

  if v_company is null then
    raise exception 'Statement import not found';
  end if;

  if not (
    private.is_company_owner(v_company)
    or private.has_permission(v_company, 'transactions.confirm')
  ) then
    raise exception 'Access denied';
  end if;

  if target_resolution not in (
    'company_level',
    'personal_non_business',
    'internal_transfer',
    'reconciliation_only'
  ) then
    raise exception 'Unsupported bulk resolution';
  end if;

  select count(*)
    into v_skipped
  from public.statement_rows sr
  where sr.import_id = target_import
    and sr.detection_status <> 'already_known'::public.row_detection_status
    and not exists (
      select 1
      from public.statement_row_transaction_links l
      where l.statement_row_id = sr.id
        and l.is_primary = true
    )
    and (
      target_keyword is null
      or btrim(target_keyword) = ''
      or coalesce(sr.narration, '') ilike '%' || target_keyword || '%'
      or coalesce(sr.counterparty, '') ilike '%' || target_keyword || '%'
    )
    and (sr.signed_amount is null or sr.transaction_date is null);

  for r in
    select sr.*
    from public.statement_rows sr
    where sr.import_id = target_import
      and sr.detection_status <> 'already_known'::public.row_detection_status
      and sr.signed_amount is not null
      and sr.transaction_date is not null
      and not exists (
        select 1
        from public.statement_row_transaction_links l
        where l.statement_row_id = sr.id
          and l.is_primary = true
      )
      and (
        target_keyword is null
        or btrim(target_keyword) = ''
        or coalesce(sr.narration, '') ilike '%' || target_keyword || '%'
        or coalesce(sr.counterparty, '') ilike '%' || target_keyword || '%'
      )
    order by sr.row_index
  loop
    v_class := case target_resolution
      when 'personal_non_business' then 'personal_non_business'
      when 'internal_transfer' then 'internal_transfer'
      when 'reconciliation_only' then 'unknown'
      else case
        when r.signed_amount >= 0 then 'company_income'
        else 'company_expense'
      end
    end;
    v_status := case
      when target_resolution = 'reconciliation_only' then 'confirmed_reconciliation_only'
      else 'confirmed'
    end;
    v_is_posted := target_resolution <> 'reconciliation_only';

    insert into public.canonical_transactions(
      company_id,
      financial_account_id,
      project_id,
      transaction_date,
      value_date,
      narration,
      reference,
      counterparty,
      signed_amount,
      running_balance,
      normalized_fingerprint,
      classification,
      transaction_type,
      category_name,
      status,
      confirmed_by,
      confirmed_at,
      created_by,
      is_personal_non_business,
      is_internal_transfer,
      is_posted,
      posted_at,
      notes
    ) values (
      v_company,
      v_account,
      null,
      r.transaction_date,
      r.value_date,
      r.narration,
      r.reference,
      r.counterparty,
      r.signed_amount,
      r.running_balance,
      r.normalized_fingerprint,
      v_class,
      v_class,
      null,
      v_status,
      v_user,
      v_now,
      v_user,
      target_resolution = 'personal_non_business',
      target_resolution = 'internal_transfer',
      v_is_posted,
      case when v_is_posted then v_now else null end,
      'Bulk resolved from statement review: ' || target_resolution
    )
    returning id into v_tx;

    insert into public.statement_row_transaction_links(
      statement_row_id,
      canonical_transaction_id,
      confidence,
      reason,
      is_primary
    ) values (
      r.id,
      v_tx,
      100,
      jsonb_build_object(
        'matched_by', 'bulk_resolution',
        'resolution', target_resolution
      ),
      true
    );

    v_count := v_count + 1;
  end loop;

  update public.statement_imports si
  set rows_pending_review = (
        select count(*)
        from public.statement_rows sr
        where sr.import_id = target_import
          and sr.detection_status <> 'already_known'::public.row_detection_status
          and not exists (
            select 1
            from public.statement_row_transaction_links l
            where l.statement_row_id = sr.id
              and l.is_primary = true
          )
      ),
      updated_at = now()
  where si.id = target_import;

  return jsonb_build_object(
    'resolved', v_count,
    'skipped_incomplete', v_skipped,
    'resolution', target_resolution
  );
end;
$function$;

