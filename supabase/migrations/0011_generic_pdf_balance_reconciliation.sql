create or replace function public.reconcile_generic_pdf_statement(target_import uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_summary_debit numeric;
  v_summary_credit numeric;
  v_opening numeric;
  v_calc_debit numeric:=0;
  v_calc_credit numeric:=0;
  v_summary_ids uuid[];
  v_opening_ids uuid[];
  v_company uuid;
  v_account uuid;
  v_rows integer;
  v_new integer;
  v_known integer;
  v_exceptions integer;
  v_start date;
  v_end date;
begin
  select si.company_id,si.financial_account_id into v_company,v_account from public.statement_imports si where si.id=target_import;
  if v_company is null then raise exception 'Statement import not found'; end if;

  select sr.debit,sr.credit,array_agg(sr.id) into v_summary_debit,v_summary_credit,v_summary_ids
  from public.statement_rows sr
  where sr.import_id=target_import and lower(coalesce(sr.narration,'')) like '%total debit%' and lower(coalesce(sr.narration,'')) like '%total credit%'
  group by sr.debit,sr.credit order by min(sr.row_index) limit 1;

  select sr.running_balance,array_agg(sr.id) into v_opening,v_opening_ids
  from public.statement_rows sr
  where sr.import_id=target_import and lower(coalesce(sr.narration,'')) like '%opening balance%'
    and (lower(coalesce(sr.narration,'')) like '%trans date%' or lower(coalesce(sr.narration,'')) like '%value date%')
  group by sr.running_balance order by min(sr.row_index) limit 1;

  if v_summary_debit is null or v_summary_credit is null or v_opening is null then
    return jsonb_build_object('applied',false,'reason','summary_or_opening_balance_not_reliably_detected');
  end if;

  if exists(
    select 1 from public.statement_row_transaction_links l join public.statement_rows sr on sr.id=l.statement_row_id
    where sr.import_id=target_import and sr.id=any(coalesce(v_summary_ids,'{}'::uuid[])) and l.is_primary=true
  ) then
    return jsonb_build_object('applied',false,'reason','summary_row_already_linked_to_accounting_transaction');
  end if;

  with actual as (
    select sr.id,sr.row_index,sr.signed_amount,sr.running_balance,
           lag(sr.running_balance,1,v_opening) over(order by sr.row_index) as previous_balance
    from public.statement_rows sr
    where sr.import_id=target_import
      and not (sr.id=any(coalesce(v_summary_ids,'{}'::uuid[])))
      and not (sr.id=any(coalesce(v_opening_ids,'{}'::uuid[])))
  ), calc as (
    select id,row_index,coalesce(signed_amount,case when running_balance is not null and previous_balance is not null then round((running_balance-previous_balance)::numeric,2) end) as amount
    from actual
  )
  select coalesce(sum(abs(amount)) filter(where amount<0),0),coalesce(sum(amount) filter(where amount>0),0)
  into v_calc_debit,v_calc_credit from calc;

  if abs(v_calc_debit-abs(v_summary_debit))>0.02 or abs(v_calc_credit-abs(v_summary_credit))>0.02 then
    return jsonb_build_object('applied',false,'reason','reconstructed_totals_do_not_match_statement','statement_debit',v_summary_debit,'statement_credit',v_summary_credit,'calculated_debit',v_calc_debit,'calculated_credit',v_calc_credit);
  end if;

  with actual as (
    select sr.id,sr.row_index,sr.signed_amount,sr.running_balance,
           lag(sr.running_balance,1,v_opening) over(order by sr.row_index) as previous_balance
    from public.statement_rows sr
    where sr.import_id=target_import
      and not (sr.id=any(coalesce(v_summary_ids,'{}'::uuid[])))
      and not (sr.id=any(coalesce(v_opening_ids,'{}'::uuid[])))
  ), calc as (
    select id,coalesce(signed_amount,case when running_balance is not null and previous_balance is not null then round((running_balance-previous_balance)::numeric,2) end) as amount
    from actual
  )
  update public.statement_rows sr
  set signed_amount=calc.amount,
      debit=case when calc.amount<0 then abs(calc.amount) else null end,
      credit=case when calc.amount>0 then calc.amount else null end,
      normalized_fingerprint=null,
      detection_status=case when calc.amount is null then 'needs_review'::public.row_detection_status else 'new'::public.row_detection_status end,
      raw_payload=coalesce(sr.raw_payload,'{}'::jsonb)||jsonb_build_object('parser','generic_bank_pdf_balance_v2','parse_confidence',0.99,'direction_source','running_balance_delta_verified_against_statement_totals')
  from calc where sr.id=calc.id;

  delete from public.statement_row_transaction_links where statement_row_id=any(coalesce(v_summary_ids,'{}'::uuid[])||coalesce(v_opening_ids,'{}'::uuid[]));
  delete from public.statement_rows where id=any(coalesce(v_summary_ids,'{}'::uuid[])||coalesce(v_opening_ids,'{}'::uuid[]));

  update public.statement_rows set row_index=-row_index where import_id=target_import;
  with ranked as (select id,row_number() over(order by abs(row_index))::int as new_index from public.statement_rows where import_id=target_import)
  update public.statement_rows sr set row_index=ranked.new_index from ranked where sr.id=ranked.id;

  update public.statement_rows sr
  set normalized_fingerprint=pg_catalog.encode(extensions.digest(concat_ws('|',coalesce(sr.transaction_date::text,''),regexp_replace(regexp_replace(lower(trim(coalesce(sr.reference,''))),'\s+',' ','g'),'[^a-z0-9 ._\-/]','','g'),regexp_replace(regexp_replace(coalesce(sr.signed_amount::text,''),'(\.[0-9]*?)0+$','\1'),'\.$',''),regexp_replace(regexp_replace(lower(trim(coalesce(sr.narration,''))),'\s+',' ','g'),'[^a-z0-9 ._\-/]','','g'),regexp_replace(regexp_replace(lower(trim(coalesce(sr.counterparty,''))),'\s+',' ','g'),'[^a-z0-9 ._\-/]','','g')),'sha256'),'hex')
  where sr.import_id=target_import;

  update public.statement_rows sr
  set detection_status=case
    when sr.transaction_date is null or sr.signed_amount is null then 'needs_review'::public.row_detection_status
    when exists(select 1 from public.canonical_transactions ct where ct.company_id=v_company and ct.normalized_fingerprint=sr.normalized_fingerprint and ct.reversed_at is null) then 'already_known'::public.row_detection_status
    when exists(select 1 from public.statement_rows prior join public.statement_imports pi on pi.id=prior.import_id where prior.import_id<>target_import and pi.company_id=v_company and (v_account is null or pi.financial_account_id=v_account) and prior.normalized_fingerprint=sr.normalized_fingerprint) then 'already_known'::public.row_detection_status
    else 'new'::public.row_detection_status end
  where sr.import_id=target_import;

  select count(*),count(*) filter(where detection_status='new'),count(*) filter(where detection_status='already_known'),count(*) filter(where detection_status='needs_review'),min(transaction_date),max(transaction_date)
  into v_rows,v_new,v_known,v_exceptions,v_start,v_end from public.statement_rows where import_id=target_import;

  update public.statement_imports
  set parser_name='generic_bank_pdf_balance_v2',parser_confidence=0.99,
      parse_warnings=jsonb_build_array('Debit/credit directions verified from running-balance deltas and matched exactly to the statement total debit and total credit figures.'),
      rows_total=v_rows,rows_new=v_new,rows_already_known=v_known,rows_need_review=v_exceptions,rows_pending_review=v_new+v_exceptions,period_start=v_start,period_end=v_end,updated_at=now()
  where id=target_import;

  return jsonb_build_object('applied',true,'rows',v_rows,'newRows',v_new,'alreadyKnown',v_known,'exceptions',v_exceptions,'statementDebit',v_summary_debit,'statementCredit',v_summary_credit);
end;
$function$;

create or replace function public.auto_reconcile_generic_pdf_statement()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  if new.parser_name='generic_bank_pdf_v1' and old.parser_name is distinct from new.parser_name then
    perform public.reconcile_generic_pdf_statement(new.id);
  end if;
  return new;
end;
$function$;

drop trigger if exists statement_import_generic_pdf_reconcile on public.statement_imports;
create trigger statement_import_generic_pdf_reconcile
after update of parser_name on public.statement_imports
for each row execute function public.auto_reconcile_generic_pdf_statement();
