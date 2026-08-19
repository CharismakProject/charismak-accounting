create or replace function public.link_statement_candidate(candidate_id uuid, target_project uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_import uuid;
  v_company uuid;
  v_keyword text;
  v_count integer := 0;
  v_reclassified integer := 0;
begin
  select c.import_id, si.company_id, upper(coalesce(c.evidence->>'keyword',c.suggested_name))
    into v_import,v_company,v_keyword
  from public.statement_project_candidates c
  join public.statement_imports si on si.id=c.import_id
  where c.id=candidate_id;

  if v_import is null then raise exception 'Candidate not found'; end if;
  if not private.is_company_member(v_company) then raise exception 'Access denied'; end if;
  if not exists(select 1 from public.projects p where p.id=target_project and p.company_id=v_company) then raise exception 'Project does not belong to company'; end if;

  insert into public.statement_project_matches(statement_row_id,project_id,confidence,reasons,status,decided_by,decided_at)
  select sr.id,target_project,96,
    jsonb_build_array(jsonb_build_object('type','candidate_keyword','keyword',v_keyword)),
    'confirmed'::public.match_decision_status,auth.uid(),now()
  from public.statement_rows sr
  where sr.import_id=v_import
    and upper(trim(reverse(split_part(reverse(coalesce(sr.narration,'')),'|',1)))) like '%'||v_keyword||'%'
  on conflict(statement_row_id,project_id) do update
    set status='confirmed',confidence=greatest(public.statement_project_matches.confidence,96),decided_by=auth.uid(),decided_at=now();
  get diagnostics v_count=row_count;

  with eligible as (
    select ct.id as tx_id, sr.signed_amount
    from public.statement_rows sr
    join public.statement_row_transaction_links l on l.statement_row_id=sr.id and l.is_primary=true
    join public.canonical_transactions ct on ct.id=l.canonical_transaction_id
    where sr.import_id=v_import
      and upper(trim(reverse(split_part(reverse(coalesce(sr.narration,'')),'|',1)))) like '%'||v_keyword||'%'
      and ct.status='confirmed_reconciliation_only'
      and coalesce(l.reason->>'matched_by','')='bulk_resolution'
      and coalesce(l.reason->>'resolution','')='reconciliation_only'
  ), changed as (
    update public.canonical_transactions ct
    set project_id=target_project,
        classification=case when e.signed_amount<0 then 'project_expense' else 'project_funding' end,
        transaction_type=case when e.signed_amount<0 then 'project_expense' else 'project_funding' end,
        category_name=case when e.signed_amount<0 then 'Uncategorised' else null end,
        funding_source=case when e.signed_amount>0 then 'other' else null end,
        status='confirmed',
        is_posted=true,
        posted_at=coalesce(ct.posted_at,now()),
        confirmed_by=auth.uid(),
        confirmed_at=now(),
        notes=concat_ws(' · ',nullif(ct.notes,''),'Reclassified from reconciliation-only after project candidate was confirmed.'),
        updated_at=now()
    from eligible e
    where ct.id=e.tx_id
    returning ct.id
  ) select count(*) into v_reclassified from changed;

  update public.statement_row_transaction_links l
  set confidence=96,
      reason=jsonb_build_object('matched_by','candidate_reclassification','keyword',v_keyword,'project_id',target_project,'previous_resolution','reconciliation_only')
  from public.statement_rows sr, public.canonical_transactions ct
  where l.statement_row_id=sr.id
    and l.canonical_transaction_id=ct.id
    and l.is_primary=true
    and sr.import_id=v_import
    and ct.project_id=target_project
    and upper(trim(reverse(split_part(reverse(coalesce(sr.narration,'')),'|',1)))) like '%'||v_keyword||'%'
    and ct.notes like '%Reclassified from reconciliation-only after project candidate was confirmed.%';

  update public.statement_project_candidates
  set status='merged',linked_project_id=target_project,decided_by=auth.uid(),decided_at=now()
  where id=candidate_id;

  perform public.refresh_project_financial_summary(target_project);

  return jsonb_build_object('linked_rows',v_count,'reclassified_rows',v_reclassified,'import_id',v_import);
end;
$function$;
