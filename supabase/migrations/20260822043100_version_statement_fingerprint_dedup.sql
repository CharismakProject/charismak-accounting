-- Keep transaction-level duplicate detection reproducible in source control.
-- This complements exact-file SHA-256 duplicate protection: if a bank exports
-- the same transactions in a different file, normalized fingerprints prevent
-- the transactions from becoming new accounting entries again.

create or replace function public.finalize_statement_import(target_import uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_company uuid;
  v_account uuid;
  v_rows integer;
  v_new integer;
  v_known integer;
  v_exceptions integer;
  v_pending integer;
  v_posted integer;
  v_start date;
  v_end date;
begin
  select si.company_id,si.financial_account_id into v_company,v_account
  from public.statement_imports si where si.id=target_import;
  if v_company is null then raise exception 'Statement import not found'; end if;
  if auth.uid() is not null and not (private.is_company_owner(v_company) or private.has_permission(v_company,'statements.upload')) then raise exception 'Access denied'; end if;

  update public.statement_rows sr
  set normalized_fingerprint=pg_catalog.encode(extensions.digest(concat_ws('|',coalesce(sr.transaction_date::text,''),regexp_replace(regexp_replace(lower(trim(coalesce(sr.reference,''))),'\s+',' ','g'),'[^a-z0-9 ._\-/]','','g'),regexp_replace(regexp_replace(coalesce(sr.signed_amount::text,''),'(\.[0-9]*?)0+$','\1'),'\.$',''),regexp_replace(regexp_replace(lower(trim(coalesce(sr.narration,''))),'\s+',' ','g'),'[^a-z0-9 ._\-/]','','g'),regexp_replace(regexp_replace(lower(trim(coalesce(sr.counterparty,''))),'\s+',' ','g'),'[^a-z0-9 ._\-/]','','g')),'sha256'),'hex')
  where sr.import_id=target_import and sr.normalized_fingerprint is null;

  update public.canonical_transactions ct
  set normalized_fingerprint=sr.normalized_fingerprint,updated_at=now()
  from public.statement_row_transaction_links l join public.statement_rows sr on sr.id=l.statement_row_id
  where sr.import_id=target_import and l.canonical_transaction_id=ct.id and l.is_primary=true and ct.normalized_fingerprint is null and sr.normalized_fingerprint is not null and ct.reversed_at is null;

  update public.statement_rows sr
  set detection_status=case
    when sr.transaction_date is null or sr.signed_amount is null then 'needs_review'::public.row_detection_status
    when exists(
      select 1 from public.statement_row_transaction_links l
      join public.canonical_transactions linked on linked.id=l.canonical_transaction_id
      where l.statement_row_id=sr.id and l.is_primary=true and linked.reversed_at is null
        and coalesce(l.reason->>'matched_by','')='normalized_fingerprint'
    ) then 'already_known'::public.row_detection_status
    when exists(
      select 1 from public.statement_row_transaction_links l
      join public.canonical_transactions linked on linked.id=l.canonical_transaction_id
      where l.statement_row_id=sr.id and l.is_primary=true and linked.reversed_at is null
    ) then 'new'::public.row_detection_status
    when exists(
      select 1 from public.canonical_transactions ct
      where ct.company_id=v_company and (v_account is null or ct.financial_account_id=v_account)
        and ct.normalized_fingerprint=sr.normalized_fingerprint and ct.reversed_at is null
    ) then 'already_known'::public.row_detection_status
    when exists(
      select 1 from public.statement_rows prior join public.statement_imports pi on pi.id=prior.import_id
      where prior.import_id<>target_import and pi.company_id=v_company and (v_account is null or pi.financial_account_id=v_account)
        and prior.normalized_fingerprint=sr.normalized_fingerprint
    ) then 'already_known'::public.row_detection_status
    else 'new'::public.row_detection_status end
  where sr.import_id=target_import;

  insert into public.statement_row_transaction_links(statement_row_id,canonical_transaction_id,confidence,reason,is_primary)
  select sr.id,ct.id,100,jsonb_build_object('matched_by','normalized_fingerprint'),true
  from public.statement_rows sr
  join public.canonical_transactions ct on ct.company_id=v_company and (v_account is null or ct.financial_account_id=v_account) and ct.normalized_fingerprint=sr.normalized_fingerprint and ct.reversed_at is null
  where sr.import_id=target_import
    and not exists(select 1 from public.statement_row_transaction_links l join public.canonical_transactions linked on linked.id=l.canonical_transaction_id where l.statement_row_id=sr.id and l.is_primary=true and linked.reversed_at is null)
  on conflict(statement_row_id,canonical_transaction_id) do nothing;

  select count(*),count(*) filter(where detection_status='new'),count(*) filter(where detection_status='already_known'),count(*) filter(where detection_status='needs_review'),min(transaction_date),max(transaction_date)
  into v_rows,v_new,v_known,v_exceptions,v_start,v_end from public.statement_rows where import_id=target_import;

  select count(*) into v_posted from public.statement_rows sr
  where sr.import_id=target_import and exists(select 1 from public.statement_row_transaction_links l join public.canonical_transactions ct on ct.id=l.canonical_transaction_id where l.statement_row_id=sr.id and l.is_primary=true and ct.reversed_at is null and ct.status in ('confirmed','confirmed_reconciliation_only'));

  select count(*) into v_pending from public.statement_rows sr
  where sr.import_id=target_import and sr.detection_status<>'already_known'::public.row_detection_status
    and not exists(select 1 from public.statement_row_transaction_links l join public.canonical_transactions ct on ct.id=l.canonical_transaction_id where l.statement_row_id=sr.id and l.is_primary=true and ct.reversed_at is null);

  update public.statement_imports set period_start=v_start,period_end=v_end,status=case when v_pending=0 then 'confirmed'::public.import_status else 'needs_review'::public.import_status end,rows_total=v_rows,rows_new=v_new,rows_already_known=v_known,rows_need_review=v_exceptions,rows_pending_review=v_pending,analysed_at=coalesce(analysed_at,now()),updated_at=now() where id=target_import;
  return jsonb_build_object('rows',v_rows,'newRows',v_new,'alreadyKnown',v_known,'exceptions',v_exceptions,'pendingReview',v_pending,'posted',v_posted,'periodStart',v_start,'periodEnd',v_end);
end;$function$;

revoke all on function public.finalize_statement_import(uuid) from public;
grant execute on function public.finalize_statement_import(uuid) to authenticated;
