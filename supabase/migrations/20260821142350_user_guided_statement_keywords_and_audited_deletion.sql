create or replace function public.discover_statement_projects_with_keywords(target_import uuid, target_keywords text[])
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_company uuid;
  v_keyword text;
  v_key text;
  v_count integer:=0;
  v_auto jsonb;
begin
  select si.company_id into v_company from public.statement_imports si where si.id=target_import;
  if v_company is null then raise exception 'Statement import not found'; end if;
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not private.is_company_member(v_company) then raise exception 'Access denied'; end if;

  v_auto:=public.discover_statement_projects(target_import);

  for v_keyword in
    select distinct trim(k)
    from unnest(coalesce(target_keywords,'{}'::text[])) k
    where length(trim(k))>=2
  loop
    v_key:=lower(regexp_replace(v_keyword,'[^a-zA-Z0-9]+','_','g'));
    if v_key='' then continue; end if;

    insert into public.statement_project_candidates(import_id,candidate_key,suggested_name,suggested_code,confidence,evidence,status)
    select target_import,'user_'||left(v_key,56),v_keyword,
      left(trim(both '-' from regexp_replace(upper(v_keyword),'[^A-Z0-9]+','-','g')),16)||'-01',100,
      jsonb_build_object(
        'source','user_keyword','keyword',v_keyword,'transaction_count',count(*)::integer,
        'money_in',coalesce(sum(case when sr.signed_amount>0 then sr.signed_amount else 0 end),0),
        'money_out',coalesce(sum(case when sr.signed_amount<0 then abs(sr.signed_amount) else 0 end),0),
        'first_date',min(sr.transaction_date),'last_date',max(sr.transaction_date),
        'sample_memos',to_jsonb((array_agg(distinct coalesce(sr.narration,sr.counterparty,sr.reference,'') order by coalesce(sr.narration,sr.counterparty,sr.reference,'')))[1:5])
      ),'suggested'::public.project_candidate_status
    from public.statement_rows sr
    where sr.import_id=target_import and (
      coalesce(sr.narration,'') ilike '%'||v_keyword||'%'
      or coalesce(sr.counterparty,'') ilike '%'||v_keyword||'%'
      or coalesce(sr.reference,'') ilike '%'||v_keyword||'%'
    )
    having count(*)>0
    on conflict(import_id,candidate_key) do update
      set suggested_name=excluded.suggested_name,suggested_code=excluded.suggested_code,
          confidence=excluded.confidence,evidence=excluded.evidence
      where public.statement_project_candidates.status='suggested';
    if found then v_count:=v_count+1; end if;
  end loop;

  return jsonb_build_object(
    'keyword_candidates',v_count,
    'candidate_count',(select count(*) from public.statement_project_candidates c where c.import_id=target_import and c.status='suggested'),
    'automatic_discovery',v_auto
  );
end;
$function$;

revoke all on function public.discover_statement_projects_with_keywords(uuid,text[]) from public;
grant execute on function public.discover_statement_projects_with_keywords(uuid,text[]) to authenticated;

create or replace function public.delete_statement_import_with_audit(target_import uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_company uuid;
  v_doc uuid;
  v_project uuid;
  v_import jsonb;
  v_document jsonb;
  v_path text;
  v_bucket text;
  v_virtual boolean:=false;
  v_tx_ids uuid[];
  v_email text;
begin
  select si.company_id,si.document_id,to_jsonb(si),to_jsonb(sd),sd.storage_path,
         coalesce(sd.metadata->>'bucket','universal-intake'),
         coalesce((sd.metadata->>'virtual_sheet')::boolean,false),sd.project_id
  into v_company,v_doc,v_import,v_document,v_path,v_bucket,v_virtual,v_project
  from public.statement_imports si join public.source_documents sd on sd.id=si.document_id
  where si.id=target_import;
  if v_company is null then raise exception 'Statement import not found'; end if;
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not (private.is_company_owner(v_company) or private.has_permission(v_company,'statements.upload')) then raise exception 'Access denied'; end if;

  select array_agg(distinct l.canonical_transaction_id)
  into v_tx_ids
  from public.statement_row_transaction_links l
  join public.statement_rows sr on sr.id=l.statement_row_id
  where sr.import_id=target_import
    and not exists(
      select 1 from public.statement_row_transaction_links other_l
      join public.statement_rows other_sr on other_sr.id=other_l.statement_row_id
      where other_l.canonical_transaction_id=l.canonical_transaction_id and other_sr.import_id<>target_import
    )
    and not exists(select 1 from public.document_evidence_links de where de.canonical_transaction_id=l.canonical_transaction_id)
    and not exists(select 1 from public.canonical_transactions rev where rev.reversal_of=l.canonical_transaction_id);

  select email into v_email from auth.users where id=auth.uid();
  insert into public.audit_log(company_id,actor_user_id,actor_email,acting_interface,action,entity_type,entity_id,project_id,before_data,after_data,context)
  values(v_company,auth.uid(),v_email,private.current_interface(v_company),'delete','statement_import',target_import,v_project,
         jsonb_build_object('statement_import',v_import,'document',v_document),null,
         jsonb_build_object('reason','user_deleted_import','generated_transactions_removed',coalesce(cardinality(v_tx_ids),0)));

  if v_tx_ids is not null then delete from public.canonical_transactions where id=any(v_tx_ids); end if;
  delete from public.source_documents where id=v_doc;

  return jsonb_build_object('deleted',true,'document_id',v_doc,'storage_path',v_path,'bucket',v_bucket,'virtual_sheet',v_virtual);
end;
$function$;

revoke all on function public.delete_statement_import_with_audit(uuid) from public;
grant execute on function public.delete_statement_import_with_audit(uuid) to authenticated;

create or replace function public.delete_source_document_with_audit(target_document uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_company uuid;
  v_project uuid;
  v_document jsonb;
  v_path text;
  v_bucket text;
  v_virtual boolean:=false;
  v_email text;
begin
  select sd.company_id,sd.project_id,to_jsonb(sd),sd.storage_path,
         coalesce(sd.metadata->>'bucket','universal-intake'),coalesce((sd.metadata->>'virtual_sheet')::boolean,false)
  into v_company,v_project,v_document,v_path,v_bucket,v_virtual
  from public.source_documents sd where sd.id=target_document;
  if v_company is null then raise exception 'Document not found'; end if;
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not private.is_company_owner(v_company) then raise exception 'Only a company owner can delete source documents currently'; end if;
  if exists(select 1 from public.statement_imports si where si.document_id=target_document) then
    raise exception 'Delete this file from Statement History so statement-generated accounting can be cleaned safely';
  end if;

  select email into v_email from auth.users where id=auth.uid();
  insert into public.audit_log(company_id,actor_user_id,actor_email,acting_interface,action,entity_type,entity_id,project_id,before_data,after_data,context)
  values(v_company,auth.uid(),v_email,private.current_interface(v_company),'delete','source_document',target_document,v_project,v_document,null,jsonb_build_object('reason','user_deleted_document'));

  delete from public.source_documents where id=target_document;
  return jsonb_build_object('deleted',true,'storage_path',v_path,'bucket',v_bucket,'virtual_sheet',v_virtual);
end;
$function$;

revoke all on function public.delete_source_document_with_audit(uuid) from public;
grant execute on function public.delete_source_document_with_audit(uuid) to authenticated;
