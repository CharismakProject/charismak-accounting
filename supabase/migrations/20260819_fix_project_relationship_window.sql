create or replace function public.apply_project_relationship_matches(target_import uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_company uuid; v_added integer:=0; v_ambiguous integer:=0;
begin
  select company_id into v_company from public.statement_imports where id=target_import;
  if v_company is null then raise exception 'Statement import not found'; end if;
  if not (private.is_company_owner(v_company) or private.has_permission(v_company,'transactions.confirm') or private.has_permission(v_company,'statements.upload')) then raise exception 'Access denied'; end if;

  with match_rows as (
    select sr.id row_id,pr.project_id,pr.id relationship_id,pr.confidence,pr.updated_at
    from public.statement_rows sr
    join public.project_relationships pr on pr.company_id=v_company and pr.is_active
      and (pr.active_from is null or sr.transaction_date>=pr.active_from)
      and (pr.active_to is null or sr.transaction_date<=pr.active_to)
      and (pr.direction_rule='any' or (pr.direction_rule='credit' and sr.signed_amount>0) or (pr.direction_rule='debit' and sr.signed_amount<0))
      and (
        private.normalized_party(coalesce(sr.counterparty,''))=pr.normalized_name
        or private.normalized_party(coalesce(sr.narration,'')) like '%'||pr.normalized_name||'%'
        or exists(select 1 from unnest(pr.match_terms) term where length(term)>=3 and private.normalized_party(coalesce(sr.narration,'')) like '%'||private.normalized_party(term)||'%')
      )
      and (
        cardinality(pr.required_terms)=0
        or exists(select 1 from unnest(pr.required_terms) term where length(term)>=2 and private.normalized_party(coalesce(sr.narration,'')) like '%'||private.normalized_party(term)||'%')
      )
      and not exists(
        select 1 from unnest(pr.excluded_terms) term
        where length(term)>=2 and private.normalized_party(coalesce(sr.narration,'')) like '%'||private.normalized_party(term)||'%'
      )
    where sr.import_id=target_import
      and not exists(select 1 from public.statement_row_transaction_links l where l.statement_row_id=sr.id and l.is_primary=true)
  ), match_counts as (
    select row_id,count(distinct project_id)::integer project_match_count
    from match_rows group by row_id
  ), candidate as (
    select mr.row_id,mr.project_id,mr.relationship_id,mr.confidence,mc.project_match_count,
      row_number() over(partition by mr.row_id order by mr.confidence desc,mr.updated_at desc) rn
    from match_rows mr join match_counts mc on mc.row_id=mr.row_id
  )
  insert into public.statement_project_matches(statement_row_id,project_id,confidence,reasons,status)
  select c.row_id,c.project_id,
    case when c.project_match_count=1 then least(99,c.confidence) else least(84,c.confidence) end,
    jsonb_build_array(jsonb_build_object('type','project_relationship','relationship_id',c.relationship_id,'project_match_count',c.project_match_count)),
    'suggested'::public.match_decision_status
  from candidate c where c.rn=1
  on conflict(statement_row_id,project_id) do update
    set confidence=greatest(public.statement_project_matches.confidence,excluded.confidence),
        reasons=public.statement_project_matches.reasons||excluded.reasons;
  get diagnostics v_added=row_count;

  select count(*) into v_ambiguous from (
    select sr.id
    from public.statement_rows sr
    join public.project_relationships pr on pr.company_id=v_company and pr.is_active
      and (pr.direction_rule='any' or (pr.direction_rule='credit' and sr.signed_amount>0) or (pr.direction_rule='debit' and sr.signed_amount<0))
      and (private.normalized_party(coalesce(sr.counterparty,''))=pr.normalized_name or private.normalized_party(coalesce(sr.narration,'')) like '%'||pr.normalized_name||'%')
      and not exists(select 1 from unnest(pr.excluded_terms) term where length(term)>=2 and private.normalized_party(coalesce(sr.narration,'')) like '%'||private.normalized_party(term)||'%')
    where sr.import_id=target_import group by sr.id having count(distinct pr.project_id)>1
  ) q;

  return jsonb_build_object('relationship_matches_added',v_added,'ambiguous_relationship_rows',v_ambiguous);
end;
$function$;
