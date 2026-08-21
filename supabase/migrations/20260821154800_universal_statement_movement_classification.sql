create or replace function public.auto_classify_statement_account_movements(target_import uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_company uuid;v_account uuid;v_actor uuid:=auth.uid();v_tx uuid;v_internal integer:=0;v_income integer:=0;v_discovery jsonb:='{}'::jsonb;r record;
begin
  select si.company_id,si.financial_account_id into v_company,v_account from public.statement_imports si where si.id=target_import;
  if v_company is null then raise exception 'Statement import not found'; end if;
  if auth.uid() is not null and not (private.is_company_owner(v_company) or private.has_permission(v_company,'transactions.confirm') or private.has_permission(v_company,'statements.upload')) then raise exception 'Access denied'; end if;
  for r in select sr.* from public.statement_rows sr where sr.import_id=target_import and sr.transaction_date is not null and sr.signed_amount is not null and not exists(select 1 from public.statement_row_transaction_links l where l.statement_row_id=sr.id and l.is_primary=true) and (lower(coalesce(sr.narration,'')) like 'owealth withdrawal%' or lower(coalesce(sr.narration,'')) like 'auto-save to owealth%' or lower(coalesce(sr.narration,'')) like 'owealth deposit%' or lower(coalesce(sr.narration,'')) like 'owealth interest earned%') order by sr.row_index loop
    if lower(coalesce(r.narration,'')) like 'owealth interest earned%' then
      insert into public.canonical_transactions(company_id,financial_account_id,project_id,transaction_date,value_date,narration,reference,counterparty,signed_amount,running_balance,normalized_fingerprint,classification,category_name,status,transaction_type,is_personal_non_business,is_internal_transfer,is_posted,posted_at,created_by,confirmed_by,confirmed_at,notes)
      values(v_company,v_account,null,r.transaction_date,r.value_date,r.narration,r.reference,r.counterparty,r.signed_amount,r.running_balance,r.normalized_fingerprint,'company_income','Interest Income','confirmed','company_income',false,false,true,now(),v_actor,v_actor,now(),'Automatically recognised interest from an explicitly identified OWealth transaction.') returning id into v_tx;v_income:=v_income+1;
    else
      insert into public.canonical_transactions(company_id,financial_account_id,project_id,transaction_date,value_date,narration,reference,counterparty,signed_amount,running_balance,normalized_fingerprint,classification,category_name,status,transaction_type,is_personal_non_business,is_internal_transfer,is_posted,posted_at,created_by,confirmed_by,confirmed_at,notes)
      values(v_company,v_account,null,r.transaction_date,r.value_date,r.narration,r.reference,r.counterparty,r.signed_amount,r.running_balance,r.normalized_fingerprint,'internal_transfer',null,'confirmed','internal_transfer',false,true,true,now(),v_actor,v_actor,now(),'Automatically recognised an explicitly identified OWealth transfer movement.') returning id into v_tx;v_internal:=v_internal+1;
    end if;
    insert into public.statement_row_transaction_links(statement_row_id,canonical_transaction_id,confidence,reason,is_primary) values(r.id,v_tx,100,jsonb_build_object('matched_by','explicit_account_movement_pattern'),true);
  end loop;
  begin v_discovery:=coalesce(public.discover_statement_projects(target_import),'{}'::jsonb); exception when others then v_discovery:=jsonb_build_object('warning',sqlerrm); end;
  return jsonb_build_object('internalTransfers',v_internal,'interestIncome',v_income,'projectDiscovery',v_discovery);
end;$$;
grant execute on function public.auto_classify_statement_account_movements(uuid) to authenticated;

create or replace function public.auto_classify_opay_account_movements(target_import uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$begin return public.auto_classify_statement_account_movements(target_import);end;$$;
grant execute on function public.auto_classify_opay_account_movements(uuid) to authenticated;
