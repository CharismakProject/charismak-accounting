create or replace function private.statement_mentions_account(
  source_text text,
  institution_name text,
  account_number text
)
returns boolean
language sql
immutable
set search_path=''
as $function$
  select
    case
      when length(right(regexp_replace(coalesce(account_number,''),'[^0-9]','','g'),3))=3
        and position(right(regexp_replace(coalesce(account_number,''),'[^0-9]','','g'),3)
          in regexp_replace(coalesce(source_text,''),'[^0-9]','','g'))>0 then true
      when lower(coalesce(institution_name,'')) like '%uba%'
        and lower(coalesce(source_text,'')) ~ '(united bank for africa|\buba\b)' then true
      when lower(coalesce(institution_name,'')) like '%opay%'
        and lower(coalesce(source_text,'')) like '%opay%' then true
      when lower(coalesce(institution_name,'')) like '%access%'
        and lower(coalesce(source_text,'')) like '%access bank%' then true
      when lower(coalesce(institution_name,'')) like '%carbon%'
        and lower(coalesce(source_text,'')) like '%carbon%' then true
      when lower(coalesce(institution_name,'')) like '%zenith%'
        and lower(coalesce(source_text,'')) like '%zenith bank%' then true
      when lower(coalesce(institution_name,'')) like '%stanbic%'
        and lower(coalesce(source_text,'')) like '%stanbic%' then true
      when lower(coalesce(institution_name,'')) like '%first bank%'
        and lower(coalesce(source_text,'')) ~ '(first bank|firstbank)' then true
      when lower(coalesce(institution_name,'')) like '%guaranty%'
        and lower(coalesce(source_text,'')) ~ '(guaranty trust|gtbank|gt bank)' then true
      else false
    end;
$function$;

create unique index if not exists transfer_pairs_debit_unique
  on public.transfer_pairs(debit_transaction_id)
  where debit_transaction_id is not null and status<>'rejected';

create unique index if not exists transfer_pairs_credit_unique
  on public.transfer_pairs(credit_transaction_id)
  where credit_transaction_id is not null and status<>'rejected';

create or replace function public.detect_statement_internal_transfers(target_import uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_company uuid;
  v_account uuid;
  v_actor uuid:=auth.uid();
  v_source_institution text;
  v_source_number text;
  v_matches integer:=0;
  v_candidate_count integer;
  v_new_transaction uuid;
  v_old_project uuid;
  r record;
  m record;
begin
  select si.company_id,si.financial_account_id,fa.institution_name,fa.account_number_masked
  into v_company,v_account,v_source_institution,v_source_number
  from public.statement_imports si
  left join public.financial_accounts fa on fa.id=si.financial_account_id
  where si.id=target_import;

  if v_company is null then raise exception 'Statement import not found'; end if;
  if not (private.is_company_owner(v_company) or private.has_permission(v_company,'transactions.confirm')) then
    raise exception 'Access denied';
  end if;

  for r in
    select sr.*
    from public.statement_rows sr
    where sr.import_id=target_import
      and sr.transaction_date is not null
      and sr.signed_amount is not null
      and not exists(
        select 1 from public.statement_row_transaction_links l
        join public.canonical_transactions linked on linked.id=l.canonical_transaction_id
        where l.statement_row_id=sr.id and l.is_primary=true and linked.reversed_at is null
      )
    order by sr.row_index
  loop
    v_candidate_count:=0;

    for m in
      select ct.id,ct.financial_account_id,ct.project_id,fa.institution_name,fa.account_number_masked
      from public.canonical_transactions ct
      join public.financial_accounts fa on fa.id=ct.financial_account_id
      where ct.company_id=v_company
        and ct.reversed_at is null
        and ct.financial_account_id is not null
        and ct.financial_account_id is distinct from v_account
        and ct.signed_amount=-r.signed_amount
        and abs(ct.transaction_date-r.transaction_date)<=2
        and not exists(
          select 1 from public.transfer_pairs tp
          where tp.status<>'rejected' and (tp.debit_transaction_id=ct.id or tp.credit_transaction_id=ct.id)
        )
        and (
          private.statement_mentions_account(ct.narration,v_source_institution,v_source_number)
          or private.statement_mentions_account(r.narration,fa.institution_name,fa.account_number_masked)
        )
      order by abs(ct.transaction_date-r.transaction_date),ct.created_at
      limit 2
    loop
      v_candidate_count:=v_candidate_count+1;
      exit when v_candidate_count>1;
    end loop;

    if v_candidate_count=1 then
      v_old_project:=m.project_id;

      insert into public.canonical_transactions(
        company_id,financial_account_id,project_id,transaction_date,value_date,narration,reference,counterparty,
        signed_amount,running_balance,normalized_fingerprint,classification,category_name,status,confirmed_by,
        confirmed_at,transaction_type,funding_source,is_personal_non_business,is_internal_transfer,is_posted,
        posted_at,created_by,notes
      ) values(
        v_company,v_account,null,r.transaction_date,r.value_date,r.narration,r.reference,r.counterparty,
        r.signed_amount,r.running_balance,r.normalized_fingerprint,'internal_transfer',null,'confirmed',v_actor,
        now(),'internal_transfer',null,false,true,true,now(),v_actor,
        'Automatically correlated with the opposite side in another company-controlled bank or wallet account.'
      ) returning id into v_new_transaction;

      insert into public.statement_row_transaction_links(statement_row_id,canonical_transaction_id,confidence,reason,is_primary)
      values(r.id,v_new_transaction,99,jsonb_build_object(
        'matched_by','cross_account_transfer','opposite_transaction_id',m.id,
        'amount',abs(r.signed_amount),'date_difference_days',abs(r.transaction_date-(select transaction_date from public.canonical_transactions where id=m.id))
      ),true);

      update public.canonical_transactions
      set project_id=null,classification='internal_transfer',category_name=null,transaction_type='internal_transfer',
          funding_source=null,is_internal_transfer=true,status='confirmed',is_posted=true,
          confirmed_by=coalesce(confirmed_by,v_actor),confirmed_at=coalesce(confirmed_at,now()),updated_at=now(),
          notes=concat_ws(E'\n',notes,'Correlated with the opposite side in another company-controlled bank or wallet account.')
      where id=m.id;

      insert into public.transfer_pairs(
        company_id,transfer_date,amount,from_account_id,to_account_id,debit_transaction_id,credit_transaction_id,
        status,creates_due_to_from,confirmed_by,confirmed_at
      ) values(
        v_company,least(r.transaction_date,(select transaction_date from public.canonical_transactions where id=m.id)),abs(r.signed_amount),
        case when r.signed_amount<0 then v_account else m.financial_account_id end,
        case when r.signed_amount>0 then v_account else m.financial_account_id end,
        case when r.signed_amount<0 then v_new_transaction else m.id end,
        case when r.signed_amount>0 then v_new_transaction else m.id end,
        'confirmed',false,v_actor,now()
      );

      if v_old_project is not null then perform public.refresh_project_financial_summary(v_old_project); end if;
      v_matches:=v_matches+1;
    end if;
  end loop;

  update public.statement_imports si
  set rows_pending_review=(
        select count(*) from public.statement_rows sr
        where sr.import_id=target_import and not exists(
          select 1 from public.statement_row_transaction_links l
          join public.canonical_transactions linked on linked.id=l.canonical_transaction_id
          where l.statement_row_id=sr.id and l.is_primary=true and linked.reversed_at is null
        )
      ),updated_at=now()
  where si.id=target_import;

  return jsonb_build_object('matchedTransfers',v_matches,'method','opposite_amount_date_and_account_evidence');
end;
$function$;

revoke all on function public.detect_statement_internal_transfers(uuid) from public,anon;
grant execute on function public.detect_statement_internal_transfers(uuid) to authenticated;

revoke all on function private.statement_mentions_account(text,text,text) from public,anon,authenticated;
