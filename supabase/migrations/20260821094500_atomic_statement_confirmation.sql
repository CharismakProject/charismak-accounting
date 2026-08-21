-- Confirm one statement transaction in a single database transaction.

create or replace function public.confirm_statement_transaction_atomic(
  target_row uuid,
  target_import uuid,
  target_classification text,
  target_project uuid default null,
  target_category text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_statement public.statement_imports%rowtype;
  v_row public.statement_rows%rowtype;
  v_existing uuid;
  v_transaction uuid;
  v_project uuid := target_project;
  v_category text;
  v_party text;
  v_pending integer;
  v_now timestamptz := now();
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_statement from public.statement_imports where id=target_import for update;
  if v_statement.id is null then raise exception 'Statement import not found'; end if;
  if not (private.is_company_owner(v_statement.company_id) or private.has_permission(v_statement.company_id,'transactions.confirm')) then
    raise exception 'You do not have permission to confirm statement transactions';
  end if;

  if target_classification not in (
    'project_expense','project_funding','company_expense','company_income','company_financing',
    'personal_non_business','internal_transfer'
  ) then
    raise exception 'Choose a valid accounting classification before confirming this transaction';
  end if;

  select * into v_row
  from public.statement_rows
  where id=target_row and import_id=target_import
  for update;
  if v_row.id is null then raise exception 'Statement row not found'; end if;
  if v_row.transaction_date is null or v_row.signed_amount is null then
    raise exception 'This row needs a valid transaction date and amount before it can be confirmed';
  end if;

  select canonical_transaction_id into v_existing
  from public.statement_row_transaction_links
  where statement_row_id=target_row and is_primary=true
  limit 1;
  if v_existing is not null then
    return jsonb_build_object('already_recorded',true,'transaction_id',v_existing);
  end if;

  if target_classification in ('project_expense','project_funding') then
    if v_project is null then raise exception 'Choose a project for project funding or project expense'; end if;
    if not exists(select 1 from public.projects where id=v_project and company_id=v_statement.company_id) then
      raise exception 'Selected project is not in this company workspace';
    end if;
    if not (
      private.is_company_owner(v_statement.company_id)
      or private.has_company_wide_permission(v_statement.company_id,'transactions.confirm')
      or private.can_access_project(v_statement.company_id,v_project)
    ) then
      raise exception 'Selected project is not accessible to this user';
    end if;
  else
    v_project := null;
  end if;

  v_category := case
    when target_classification in ('project_expense','company_expense')
      then coalesce(nullif(btrim(coalesce(target_category,'')),''),'Uncategorised')
    else null
  end;

  insert into public.canonical_transactions(
    company_id,financial_account_id,project_id,transaction_date,value_date,narration,reference,counterparty,
    signed_amount,running_balance,normalized_fingerprint,classification,transaction_type,category_name,
    is_personal_non_business,is_internal_transfer,is_posted,posted_at,status,created_by,confirmed_by,confirmed_at
  ) values(
    v_statement.company_id,v_statement.financial_account_id,v_project,v_row.transaction_date,v_row.value_date,
    v_row.narration,v_row.reference,v_row.counterparty,v_row.signed_amount,v_row.running_balance,v_row.normalized_fingerprint,
    target_classification,target_classification,v_category,
    target_classification='personal_non_business',target_classification='internal_transfer',true,v_now,'confirmed',auth.uid(),auth.uid(),v_now
  ) returning id into v_transaction;

  insert into public.statement_row_transaction_links(
    statement_row_id,canonical_transaction_id,confidence,reason,is_primary
  ) values(
    target_row,v_transaction,100,
    jsonb_build_object('matched_by','user_confirmation','classification',target_classification),true
  );

  if target_classification in ('project_expense','project_funding') and v_project is not null then
    v_party := nullif(btrim(coalesce(v_row.counterparty,'')),'');
    if v_party is null then
      v_party := nullif(btrim((regexp_match(coalesce(v_row.narration,''),'transfer\\s+(?:to|from)\\s+([^|]+)','i'))[1]),'');
    end if;
    if v_party is not null then
      perform public.learn_project_relationship(
        v_project,
        v_party,
        case when target_classification='project_funding' then 'sponsor' else 'vendor' end,
        target_classification,
        case when target_classification='project_expense' then v_category else null end,
        'confirmed_statement_transaction',
        v_transaction
      );
    end if;
    perform public.refresh_project_financial_summary(v_project);
  end if;

  select count(*) into v_pending
  from public.statement_rows sr
  where sr.import_id=target_import
    and sr.detection_status <> 'already_known'::public.row_detection_status
    and not exists(
      select 1 from public.statement_row_transaction_links l
      where l.statement_row_id=sr.id and l.is_primary=true
    );

  update public.statement_imports
  set rows_pending_review=v_pending,updated_at=v_now
  where id=target_import;

  return jsonb_build_object('already_recorded',false,'transaction_id',v_transaction,'rows_pending_review',v_pending);
end;
$$;

grant execute on function public.confirm_statement_transaction_atomic(uuid,uuid,text,uuid,text) to authenticated;
