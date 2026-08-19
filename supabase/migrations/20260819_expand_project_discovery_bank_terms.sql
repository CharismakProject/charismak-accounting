create or replace function public.discover_statement_projects(target_import uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_company_id uuid; v_existing_matches integer:=0; v_relationship jsonb;
begin
  select si.company_id into v_company_id from public.statement_imports si where si.id=target_import;
  if v_company_id is null then raise exception 'Statement import not found'; end if;
  if not private.is_company_member(v_company_id) then raise exception 'Access denied'; end if;

  v_relationship:=public.apply_project_relationship_matches(target_import);

  insert into public.statement_project_matches(statement_row_id,project_id,confidence,reasons,status)
  select distinct sr.id,p.id,
    case
      when lower(coalesce(sr.narration,'')) like '%'||lower(p.project_code)||'%' then 98
      when length(split_part(p.project_code,'-',1))>=3 and lower(coalesce(sr.narration,'')) like '%'||lower(split_part(p.project_code,'-',1))||'%' then 94
      when length(p.name)>=4 and lower(coalesce(sr.narration,'')) like '%'||lower(p.name)||'%' then 92
      else 86 end::numeric,
    jsonb_build_array(jsonb_build_object('type','project_identity','matched_by','database_discovery')),
    'suggested'::public.match_decision_status
  from public.statement_rows sr
  join public.statement_imports si on si.id=sr.import_id
  join public.projects p on p.company_id=si.company_id and p.status in ('draft','active','on_hold')
  where sr.import_id=target_import and (
    lower(coalesce(sr.narration,'')) like '%'||lower(p.project_code)||'%'
    or (length(split_part(p.project_code,'-',1))>=3 and lower(coalesce(sr.narration,'')) like '%'||lower(split_part(p.project_code,'-',1))||'%')
    or (length(p.name)>=4 and lower(coalesce(sr.narration,'')) like '%'||lower(p.name)||'%')
    or exists(select 1 from unnest(p.aliases) a where length(a)>=3 and lower(coalesce(sr.narration,'')) like '%'||lower(a)||'%')
  ) on conflict(statement_row_id,project_id) do update
    set confidence=greatest(public.statement_project_matches.confidence,excluded.confidence),
        reasons=public.statement_project_matches.reasons||excluded.reasons;
  get diagnostics v_existing_matches=row_count;

  delete from public.statement_project_candidates c where c.import_id=target_import and c.status='suggested';
  with unmatched as (
    select sr.* from public.statement_rows sr where sr.import_id=target_import
      and not exists(select 1 from public.statement_project_matches spm where spm.statement_row_id=sr.id)
  ), memos as (
    select sr.*,trim(reverse(split_part(reverse(coalesce(sr.narration,'')),'|',1))) memo from unmatched sr
  ), tokens as (
    select distinct m.id row_id,m.transaction_date,m.signed_amount,m.memo,upper(x[1]) token
    from memos m cross join lateral regexp_matches(m.memo,'\m([A-Z][A-Z0-9-]{2,12})\M','g') x where m.memo<>''
  ), filtered as (
    select t.* from tokens t where t.token not in (
      'OPAY','MONIE','POINT','BANK','MOBILE','TRF','PAY','PAYMENT','TRANSACTION','MTN','VAT','POS','ATM','UBA','GTB','GTBANK','TAJBANK','ACCESS','STANBIC','IBTC','NGN','SAL','IOU','CPNL','CHARISMAK','CARD','DATA','REFUND','TRANSFER','OWEALTH','ABIODUN','CHRISTOPHER','AKINOLA','CHRIST','CHRISTOPHE','KOSSI','MARIUS','IBUKUN','MEGBA','MOB','UTO','SITE','CONSTRUCTION','FUND','FUNDS','BOQ','DPM','TABLE',
      'NIP','NIBSS','NEFT','RTGS','SWIFT','CHARGE','CHARGES','FEE','FEES','LEVY','STAMP','DUTY','SMS','ALERT','MAINT','MAINTENANCE','ACCOUNT','ACCT','CREDIT','DEBIT','WITHDRAWAL','DEPOSIT','CASH','ONLINE','WEB','USSD','TOKEN','REVERSAL','REVERS','INTEREST','COMMISSION','TAX','WHT','EMTL','REMARK','NARRATION','REFERENCE','BALANCE','AVAILABLE','OPENING','CLOSING'
    ) and t.token!~'^[0-9]+$'
      and not exists(select 1 from public.projects p where p.company_id=v_company_id and (upper(split_part(p.project_code,'-',1))=t.token or upper(p.project_code)=t.token or upper(split_part(p.name,' ',1))=t.token or exists(select 1 from unnest(p.aliases) a where upper(a)=t.token)))
  ), grouped as (
    select token,count(distinct row_id)::integer tx_count,
      coalesce(sum(case when signed_amount>0 then signed_amount else 0 end),0)::numeric money_in,
      coalesce(sum(case when signed_amount<0 then abs(signed_amount) else 0 end),0)::numeric money_out,
      min(transaction_date) first_date,max(transaction_date) last_date,(array_agg(distinct memo order by memo))[1:5] samples
    from filtered group by token having count(distinct row_id)>=3
  )
  insert into public.statement_project_candidates(import_id,candidate_key,suggested_name,suggested_code,confidence,evidence,status)
  select target_import,lower(g.token),g.token,left(g.token,16)||'-01',least(94,55+(g.tx_count*2))::numeric,
    jsonb_build_object('source','memo_keyword','keyword',g.token,'transaction_count',g.tx_count,'money_in',g.money_in,'money_out',g.money_out,'first_date',g.first_date,'last_date',g.last_date,'sample_memos',to_jsonb(g.samples)),
    'suggested'::public.project_candidate_status
  from grouped g order by g.tx_count desc
  on conflict(import_id,candidate_key) do update set suggested_name=excluded.suggested_name,suggested_code=excluded.suggested_code,confidence=excluded.confidence,evidence=excluded.evidence where public.statement_project_candidates.status='suggested';

  return jsonb_build_object(
    'existing_matches_added',v_existing_matches,
    'relationship_matches',v_relationship,
    'candidate_count',(select count(*) from public.statement_project_candidates c where c.import_id=target_import and c.status='suggested')
  );
end;
$function$;
