-- OCR is useful for extracting and matching scanned records, but money read from an
-- image is not strong enough evidence for unattended accounting. Keep OCR statement
-- rows populated and matched, but require a user confirmation before posting.

create or replace function public.auto_post_statement_matches(target_import uuid, minimum_confidence numeric default 94)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_company uuid;
  v_account uuid;
  v_actor uuid:=auth.uid();
  v_posted integer:=0;
  v_company_posted integer:=0;
  v_pending integer:=0;
  v_known integer:=0;
  v_project uuid;
  v_tx uuid;
  r record;
  v_class text;
  v_category text;
  v_funding_source text;
  v_is_ocr boolean:=false;
begin
  select si.company_id,si.financial_account_id into v_company,v_account from public.statement_imports si where si.id=target_import;
  if v_company is null then raise exception 'Statement import not found'; end if;
  if auth.uid() is not null and not (private.is_company_owner(v_company) or private.has_permission(v_company,'transactions.confirm')) then raise exception 'Access denied'; end if;

  select exists(
    select 1 from public.statement_rows sr
    where sr.import_id=target_import
      and coalesce(sr.raw_payload->>'parser','')='browser_ocr_v1'
  ) into v_is_ocr;

  if v_is_ocr then
    select count(*) into v_known from public.statement_rows sr
    where sr.import_id=target_import and sr.detection_status='already_known';

    select count(*) into v_pending from public.statement_rows sr
    where sr.import_id=target_import
      and sr.detection_status in ('new','needs_review','changed','possible_duplicate')
      and not exists(
        select 1 from public.statement_row_transaction_links l
        where l.statement_row_id=sr.id and l.is_primary=true
      );

    update public.statement_imports si
    set rows_auto_posted=0,
        rows_pending_review=v_pending,
        rows_already_known=v_known,
        status=case when v_pending=0 then 'confirmed'::public.import_status else 'needs_review'::public.import_status end,
        updated_at=now()
    where si.id=target_import;

    return jsonb_build_object(
      'autoPosted',0,
      'companyAutoPosted',0,
      'pendingReview',v_pending,
      'alreadyKnown',v_known,
      'minimumConfidence',minimum_confidence,
      'reviewRequired',true,
      'reason','ocr_statement_requires_confirmation'
    );
  end if;

  -- Company-context first: explicit CPNL/Charismak business expenses must not be swallowed by project matching.
  for r in
    select sr.id,sr.transaction_date,sr.value_date,sr.narration,sr.reference,sr.counterparty,sr.signed_amount,sr.running_balance,sr.normalized_fingerprint
    from public.statement_rows sr
    where sr.import_id=target_import and sr.detection_status='new' and sr.transaction_date is not null and sr.signed_amount<0
      and lower(coalesce(sr.narration,'')) ~ '(cpnl|charismak)'
      and lower(coalesce(sr.narration,'')) ~ '(staff|house|rent|accommodation|toiletr|bedsheet|pillow|mattress|fan|stool|cleaning|support|travel|flight|stipend|allowance|subscription|chatgpt|canva|domain|email|account set|acct set|boq|tender|office|admin)'
      and not exists(select 1 from public.statement_row_transaction_links l where l.statement_row_id=sr.id and l.is_primary=true)
    order by sr.row_index
  loop
    v_category:=case
      when lower(r.narration) ~ '(house|rent|accommodation|toiletr|bedsheet|pillow|mattress|fan|stool|cleaning)' then 'Staff Accommodation'
      when lower(r.narration) ~ '(flight|travel|transport)' then 'Staff Welfare & Travel'
      when lower(r.narration) ~ '(stipend|allowance|supervisor fee|supervisor fees)' then 'Staff Allowances'
      when lower(r.narration) ~ '(chatgpt|canva|subscription)' then 'Software & Subscriptions'
      when lower(r.narration) ~ '(domain|email)' then 'IT & Digital Services'
      when lower(r.narration) ~ '(boq|tender)' then 'Professional Services / Tendering'
      when lower(r.narration) ~ '(account set|acct set|office|admin)' then 'Business Administration & Setup'
      else 'Staff Welfare & Support' end;

    insert into public.canonical_transactions(company_id,financial_account_id,project_id,transaction_date,value_date,narration,reference,counterparty,signed_amount,running_balance,normalized_fingerprint,classification,category_name,status,confirmed_by,confirmed_at,transaction_type,is_personal_non_business,is_internal_transfer,is_posted,posted_at,created_by,notes)
    values(v_company,v_account,null,r.transaction_date,r.value_date,r.narration,r.reference,r.counterparty,r.signed_amount,r.running_balance,r.normalized_fingerprint,'company_expense',v_category,'confirmed',v_actor,now(),'company_expense',false,false,true,now(),v_actor,'Auto-posted from explicit CPNL/Charismak company-context narration.') returning id into v_tx;
    insert into public.statement_row_transaction_links(statement_row_id,canonical_transaction_id,confidence,reason,is_primary)
    values(r.id,v_tx,99,jsonb_build_object('matched_by','company_context','classification','company_expense','category',v_category),true);
    update public.statement_project_matches set status='rejected',decided_by=v_actor,decided_at=now() where statement_row_id=r.id and status<>'rejected';
    v_company_posted:=v_company_posted+1;
  end loop;

  for r in
    select sr.id,sr.transaction_date,sr.value_date,sr.narration,sr.reference,sr.counterparty,sr.signed_amount,sr.running_balance,sr.normalized_fingerprint,
      best.project_id,best.confidence,best.reasons,
      rel.default_classification rel_classification,rel.default_category rel_category,rel.relationship_type rel_type
    from public.statement_rows sr
    join lateral (
      select spm.project_id,spm.confidence,spm.reasons from public.statement_project_matches spm
      where spm.statement_row_id=sr.id and spm.confidence>=minimum_confidence and spm.status<>'rejected'
      order by spm.confidence desc,spm.created_at asc limit 1
    ) best on true
    left join lateral (
      select pr.default_classification,pr.default_category,pr.relationship_type
      from jsonb_array_elements(best.reasons) j
      join public.project_relationships pr on pr.id=nullif(j->>'relationship_id','')::uuid
      where j->>'type'='project_relationship' limit 1
    ) rel on true
    where sr.import_id=target_import and sr.detection_status='new' and sr.transaction_date is not null and sr.signed_amount is not null
      and not exists(select 1 from public.statement_row_transaction_links l where l.statement_row_id=sr.id and l.is_primary=true)
      and 1=(select count(*) from public.statement_project_matches spm2 where spm2.statement_row_id=sr.id and spm2.confidence>=minimum_confidence and spm2.status<>'rejected')
      and (sr.signed_amount<0 or rel.default_classification='project_funding')
      and lower(coalesce(sr.narration,'')) !~ '(cpnl|charismak)'
    order by sr.row_index
  loop
    v_class:=case when r.signed_amount>0 then 'project_funding' else coalesce(r.rel_classification,'project_expense') end;
    if v_class not in ('project_expense','project_funding') then v_class:=case when r.signed_amount<0 then 'project_expense' else 'project_funding' end; end if;
    v_category:=case when v_class='project_expense' then coalesce(r.rel_category,'Uncategorised') else null end;
    v_funding_source:=case when v_class='project_funding' and r.rel_type in ('client','sponsor') then 'client' when v_class='project_funding' then 'other' else null end;

    insert into public.canonical_transactions(company_id,financial_account_id,project_id,transaction_date,value_date,narration,reference,counterparty,signed_amount,running_balance,normalized_fingerprint,classification,category_name,status,confirmed_by,confirmed_at,transaction_type,funding_source,is_posted,posted_at,created_by,notes)
    values(v_company,v_account,r.project_id,r.transaction_date,r.value_date,r.narration,r.reference,r.counterparty,r.signed_amount,r.running_balance,r.normalized_fingerprint,v_class,v_category,'confirmed',v_actor,now(),v_class,v_funding_source,true,now(),v_actor,'Auto-posted from a unique high-confidence statement project/relationship match.') returning id into v_tx;
    insert into public.statement_row_transaction_links(statement_row_id,canonical_transaction_id,confidence,reason,is_primary)
    values(r.id,v_tx,r.confidence,jsonb_build_object('matched_by','auto_project_match','confidence',r.confidence,'project_id',r.project_id,'classification',v_class,'category',v_category,'funding_source',v_funding_source),true);
    update public.statement_project_matches set status='confirmed',decided_by=v_actor,decided_at=now() where statement_row_id=r.id and project_id=r.project_id;
    v_posted:=v_posted+1;
  end loop;

  for v_project in
    select distinct ct.project_id from public.canonical_transactions ct
    join public.statement_row_transaction_links l on l.canonical_transaction_id=ct.id and l.is_primary=true
    join public.statement_rows sr on sr.id=l.statement_row_id
    where sr.import_id=target_import and ct.project_id is not null
  loop
    perform public.refresh_project_financial_summary(v_project);
  end loop;

  select count(*) into v_known from public.statement_rows sr where sr.import_id=target_import and sr.detection_status='already_known';
  select count(*) into v_pending from public.statement_rows sr where sr.import_id=target_import and sr.detection_status in ('new','needs_review','changed','possible_duplicate') and not exists(select 1 from public.statement_row_transaction_links l where l.statement_row_id=sr.id and l.is_primary=true);
  update public.statement_imports si set rows_auto_posted=(select count(*) from public.statement_row_transaction_links l join public.statement_rows sr on sr.id=l.statement_row_id where sr.import_id=target_import and l.is_primary=true and l.reason->>'matched_by' in ('auto_project_match','company_context')),rows_pending_review=v_pending,rows_already_known=v_known,status=case when v_pending=0 then 'confirmed'::public.import_status else 'needs_review'::public.import_status end,updated_at=now() where si.id=target_import;
  return jsonb_build_object('autoPosted',v_posted,'companyAutoPosted',v_company_posted,'pendingReview',v_pending,'alreadyKnown',v_known,'minimumConfidence',minimum_confidence);
end;
$function$;

revoke all on function public.auto_post_statement_matches(uuid,numeric) from public;
grant execute on function public.auto_post_statement_matches(uuid,numeric) to authenticated;
