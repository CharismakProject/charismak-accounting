alter table public.canonical_transactions
  add column if not exists entry_source text not null default 'system',
  add column if not exists approval_request_id uuid references public.approval_requests(id) on delete set null;

create index if not exists idx_canonical_transactions_approval_request
  on public.canonical_transactions(approval_request_id)
  where approval_request_id is not null;

create table if not exists public.manual_accounting_entries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  request_key uuid not null,
  entry_type text not null,
  canonical_transaction_id uuid not null references public.canonical_transactions(id) on delete cascade,
  related_transaction_id uuid references public.canonical_transactions(id) on delete set null,
  journal_entry_id uuid references public.journal_entries(id) on delete set null,
  approval_request_id uuid references public.approval_requests(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(company_id, request_key)
);

create index if not exists idx_manual_accounting_entries_transaction
  on public.manual_accounting_entries(canonical_transaction_id);
create index if not exists idx_manual_accounting_entries_related_transaction
  on public.manual_accounting_entries(related_transaction_id)
  where related_transaction_id is not null;
create index if not exists idx_manual_accounting_entries_journal
  on public.manual_accounting_entries(journal_entry_id)
  where journal_entry_id is not null;
create index if not exists idx_manual_accounting_entries_approval
  on public.manual_accounting_entries(approval_request_id)
  where approval_request_id is not null;
create index if not exists idx_manual_accounting_entries_company_created
  on public.manual_accounting_entries(company_id, created_at desc);

alter table public.manual_accounting_entries enable row level security;

drop policy if exists manual_accounting_entries_select on public.manual_accounting_entries;
create policy manual_accounting_entries_select on public.manual_accounting_entries
  for select to authenticated
  using (
    private.is_company_owner(company_id)
    or private.has_company_wide_permission(company_id, 'transactions.view')
    or private.has_permission(company_id, 'transactions.confirm')
  );

revoke all on public.manual_accounting_entries from public, anon, authenticated;
grant select on public.manual_accounting_entries to authenticated;

create or replace function private.post_manual_transaction_atomic(
  request_key uuid,
  target_company uuid,
  target_account uuid,
  target_project uuid,
  entry_kind text,
  entry_date date,
  entry_amount numeric,
  entry_narration text,
  entry_reference text default null,
  entry_counterparty text default null,
  entry_category text default null,
  entry_funding_source text default null,
  entry_notes text default null,
  target_approval_request uuid default null
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid:=auth.uid();
  v_existing public.manual_accounting_entries%rowtype;
  v_classification text;
  v_signed numeric;
  v_project uuid:=target_project;
  v_funding_source text:=nullif(btrim(entry_funding_source),'');
  v_category text:=nullif(btrim(entry_category),'');
  v_transaction uuid;
  v_journal uuid;
  v_approved numeric;
  v_paid numeric;
  v_payment numeric;
  v_approval_status text;
  v_action_status text;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if request_key is null then raise exception 'Request key is required'; end if;
  if target_company is null then raise exception 'Company is required'; end if;
  if not (
    private.is_company_owner(target_company)
    or private.has_permission(target_company,'transactions.confirm')
  ) then raise exception 'You do not have permission to post accounting transactions'; end if;

  select * into v_existing
  from public.manual_accounting_entries mae
  where mae.company_id=target_company and mae.request_key=post_manual_transaction_atomic.request_key;
  if v_existing.id is not null then
    return jsonb_build_object(
      'posted',true,'already_recorded',true,'entry_id',v_existing.id,
      'transaction_id',v_existing.canonical_transaction_id,
      'related_transaction_id',v_existing.related_transaction_id,
      'journal_entry_id',v_existing.journal_entry_id
    );
  end if;

  if entry_kind not in (
    'project_funding','company_project_funding','project_expense','company_expense',
    'company_income','company_financing','project_advance','reimbursement','personal_non_business'
  ) then raise exception 'Unsupported manual entry type'; end if;
  if entry_date is null or entry_date>current_date then raise exception 'Use a valid transaction date that is not in the future'; end if;
  if entry_amount is null or entry_amount<=0 or entry_amount>1000000000000 then raise exception 'Amount must be greater than zero'; end if;
  if nullif(btrim(entry_narration),'') is null then raise exception 'Description is required'; end if;

  perform 1 from public.financial_accounts fa
  where fa.id=target_account and fa.company_id=target_company and fa.is_active=true
  for update;
  if not found then raise exception 'Financial account not found in this company'; end if;

  if v_project is not null then
    perform 1 from public.projects p
    where p.id=v_project and p.company_id=target_company and p.status<>'archived';
    if not found then raise exception 'Project not found in this company'; end if;
  end if;

  if entry_kind in ('project_funding','company_project_funding','project_expense','project_advance') and v_project is null then
    raise exception 'Select the project for this transaction';
  end if;
  if entry_kind='reimbursement' and v_project is null then
    v_classification:='company_expense';
  end if;
  if entry_kind in ('project_expense','company_expense','reimbursement') and v_category is null then
    raise exception 'Select or enter an expense category';
  end if;

  v_classification:=case entry_kind
    when 'project_funding' then 'project_funding'
    when 'company_project_funding' then 'project_funding'
    when 'project_expense' then 'project_expense'
    when 'company_expense' then 'company_expense'
    when 'company_income' then 'company_income'
    when 'company_financing' then 'company_financing'
    when 'project_advance' then 'project_advance'
    when 'reimbursement' then case when v_project is null then 'company_expense' else 'project_expense' end
    when 'personal_non_business' then 'personal_non_business'
  end;

  v_signed:=case when entry_kind in ('project_expense','company_expense','project_advance','reimbursement','personal_non_business')
    then -abs(entry_amount) else abs(entry_amount) end;

  if entry_kind='project_funding' then
    v_funding_source:=coalesce(v_funding_source,'client');
  elsif entry_kind='company_project_funding' then
    v_funding_source:='company';
  elsif entry_kind='company_financing' then
    v_funding_source:=coalesce(v_funding_source,'other');
  else
    v_funding_source:=null;
  end if;
  if v_funding_source is not null and v_funding_source not in ('client','company','other') then
    raise exception 'Funding source must be client, company or other';
  end if;

  if entry_kind not in ('project_funding','company_project_funding','project_expense','project_advance','reimbursement') then
    v_project:=null;
  end if;

  if target_approval_request is not null then
    if not (
      private.is_company_owner(target_company)
      or (
        private.has_permission(target_company,'approvals.manage')
        and private.has_permission(target_company,'transactions.confirm')
      )
    ) then raise exception 'You do not have permission to pay approved requests'; end if;

    select ar.approved_amount,ar.paid_amount,ar.status
      into v_approved,v_paid,v_approval_status
    from public.approval_requests ar
    where ar.id=target_approval_request and ar.company_id=target_company
    for update;
    if v_approval_status is null then raise exception 'Approval request not found'; end if;
    if v_approval_status not in ('approved','partially_approved','partially_paid') then
      raise exception 'Only approved requests can be paid';
    end if;
    v_payment:=abs(entry_amount);
    if v_payment>coalesce(v_approved,0)-coalesce(v_paid,0) then
      raise exception 'Payment exceeds the approved unpaid amount';
    end if;
  end if;

  insert into public.canonical_transactions(
    company_id,financial_account_id,project_id,transaction_date,narration,reference,counterparty,
    signed_amount,normalized_fingerprint,classification,transaction_type,category_name,status,
    funding_source,is_personal_non_business,is_internal_transfer,is_posted,posted_at,
    created_by,confirmed_by,confirmed_at,notes,entry_source,approval_request_id
  ) values (
    target_company,target_account,v_project,entry_date,btrim(entry_narration),nullif(btrim(entry_reference),''),
    nullif(btrim(entry_counterparty),''),v_signed,'manual:'||request_key::text,v_classification,v_classification,
    case when entry_kind='project_advance' then coalesce(v_category,'Site advance / imprest') else v_category end,
    'confirmed',v_funding_source,entry_kind='personal_non_business',false,true,now(),
    v_user,v_user,now(),nullif(btrim(entry_notes),''),
    case when target_approval_request is null then 'manual' else 'approval_payment' end,target_approval_request
  ) returning id into v_transaction;

  select cjl.journal_entry_id into v_journal
  from public.canonical_journal_links cjl where cjl.canonical_transaction_id=v_transaction;

  update public.financial_accounts
  set current_balance=coalesce(current_balance,0)+v_signed,
      balance_as_of=greatest(coalesce(balance_as_of,entry_date),entry_date),
      updated_at=now()
  where id=target_account;

  insert into public.manual_accounting_entries(
    company_id,request_key,entry_type,canonical_transaction_id,journal_entry_id,
    approval_request_id,created_by
  ) values (
    target_company,request_key,entry_kind,v_transaction,v_journal,target_approval_request,v_user
  ) returning id into v_existing.id;

  if target_approval_request is not null then
    v_paid:=coalesce(v_paid,0)+v_payment;
    v_action_status:=case when v_paid>=coalesce(v_approved,0) then 'paid' else 'partially_paid' end;
    update public.approval_requests
    set paid_amount=v_paid,status=v_action_status,updated_at=now()
    where id=target_approval_request;
    insert into public.approval_actions(
      request_id,actor_user_id,action,amount,comments,acting_interface
    ) values (
      target_approval_request,v_user,'mark_paid',v_payment,
      'Payment posted to accounting transaction '||v_transaction::text,
      private.current_interface(target_company)
    );
  end if;

  if v_project is not null then
    perform public.refresh_project_financial_summary(v_project);
  end if;

  return jsonb_build_object(
    'posted',true,'already_recorded',false,'entry_id',v_existing.id,
    'transaction_id',v_transaction,'journal_entry_id',v_journal,
    'signed_amount',v_signed,'classification',v_classification,'project_id',v_project
  );
end;
$$;

create or replace function public.post_manual_transaction_atomic(
  request_key uuid,
  target_company uuid,
  target_account uuid,
  target_project uuid,
  entry_kind text,
  entry_date date,
  entry_amount numeric,
  entry_narration text,
  entry_reference text default null,
  entry_counterparty text default null,
  entry_category text default null,
  entry_funding_source text default null,
  entry_notes text default null,
  target_approval_request uuid default null
) returns jsonb
language sql
security invoker
set search_path=''
as $$
  select private.post_manual_transaction_atomic(
    request_key,target_company,target_account,target_project,entry_kind,entry_date,entry_amount,
    entry_narration,entry_reference,entry_counterparty,entry_category,entry_funding_source,
    entry_notes,target_approval_request
  );
$$;

create or replace function private.post_manual_transfer_atomic(
  request_key uuid,
  target_company uuid,
  from_account uuid,
  to_account uuid,
  from_project uuid,
  to_project uuid,
  transfer_date date,
  transfer_amount numeric,
  transfer_description text,
  transfer_reference text default null
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid:=auth.uid();
  v_existing public.manual_accounting_entries%rowtype;
  v_debit uuid;
  v_credit uuid;
  v_journal uuid;
  v_transfer uuid;
  v_bank uuid;
  v_creates_due boolean:=false;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if request_key is null then raise exception 'Request key is required'; end if;
  if not (
    private.is_company_owner(target_company)
    or private.has_permission(target_company,'transactions.confirm')
  ) then raise exception 'You do not have permission to confirm transfers'; end if;

  select * into v_existing from public.manual_accounting_entries mae
  where mae.company_id=target_company and mae.request_key=post_manual_transfer_atomic.request_key;
  if v_existing.id is not null then
    return jsonb_build_object(
      'posted',true,'already_recorded',true,'entry_id',v_existing.id,
      'debit_transaction_id',v_existing.canonical_transaction_id,
      'credit_transaction_id',v_existing.related_transaction_id,
      'journal_entry_id',v_existing.journal_entry_id
    );
  end if;

  if from_account is null or to_account is null or from_account=to_account then
    raise exception 'Select two different financial accounts';
  end if;
  if transfer_date is null or transfer_date>current_date then raise exception 'Use a valid transfer date that is not in the future'; end if;
  if transfer_amount is null or transfer_amount<=0 or transfer_amount>1000000000000 then raise exception 'Transfer amount must be greater than zero'; end if;
  if nullif(btrim(transfer_description),'') is null then raise exception 'Transfer description is required'; end if;

  perform 1 from public.financial_accounts fa
  where fa.id in (from_account,to_account) and fa.company_id=target_company and fa.is_active=true
  order by fa.id for update;
  if (select count(*) from public.financial_accounts fa where fa.id in (from_account,to_account) and fa.company_id=target_company and fa.is_active=true)<>2 then
    raise exception 'Both financial accounts must belong to this company';
  end if;

  if from_project is not null and not exists(select 1 from public.projects p where p.id=from_project and p.company_id=target_company and p.status<>'archived') then
    raise exception 'Source project not found in this company';
  end if;
  if to_project is not null and not exists(select 1 from public.projects p where p.id=to_project and p.company_id=target_company and p.status<>'archived') then
    raise exception 'Destination project not found in this company';
  end if;
  v_creates_due:=from_project is not null and to_project is not null and from_project<>to_project;

  insert into public.canonical_transactions(
    company_id,financial_account_id,project_id,transaction_date,narration,reference,signed_amount,
    normalized_fingerprint,classification,transaction_type,status,is_internal_transfer,is_posted,
    posted_at,created_by,confirmed_by,confirmed_at,notes,entry_source
  ) values (
    target_company,from_account,from_project,transfer_date,btrim(transfer_description),nullif(btrim(transfer_reference),''),
    -abs(transfer_amount),'manual:'||request_key::text||':debit','internal_transfer','internal_transfer','confirmed',true,true,
    now(),v_user,v_user,now(),'Manual internal transfer:'||request_key::text,'manual_transfer'
  ) returning id into v_debit;

  insert into public.canonical_transactions(
    company_id,financial_account_id,project_id,transaction_date,narration,reference,signed_amount,
    normalized_fingerprint,classification,transaction_type,status,is_internal_transfer,is_posted,
    posted_at,created_by,confirmed_by,confirmed_at,notes,entry_source
  ) values (
    target_company,to_account,to_project,transfer_date,btrim(transfer_description),nullif(btrim(transfer_reference),''),
    abs(transfer_amount),'manual:'||request_key::text||':credit','internal_transfer','internal_transfer','confirmed',true,true,
    now(),v_user,v_user,now(),'Manual internal transfer:'||request_key::text,'manual_transfer'
  ) returning id into v_credit;

  perform private.assert_open_accounting_period(target_company,transfer_date);
  perform private.seed_default_chart_of_accounts(target_company);
  v_bank:=private.account_id(target_company,'1000');
  if v_bank is null then raise exception 'Bank and cash ledger account is missing'; end if;

  insert into public.journal_entries(
    company_id,entry_date,reference,description,source_type,source_id,status,created_by,posted_by,posted_at
  ) values (
    target_company,transfer_date,nullif(btrim(transfer_reference),''),btrim(transfer_description),
    'manual_internal_transfer',v_debit,'posted',v_user,v_user,now()
  ) returning id into v_journal;

  insert into public.journal_lines(
    entry_id,account_id,financial_account_id,project_id,description,debit,credit
  ) values
    (v_journal,v_bank,to_account,null,'Transfer received',abs(transfer_amount),0),
    (v_journal,v_bank,from_account,null,'Transfer sent',0,abs(transfer_amount));

  insert into public.canonical_journal_links(canonical_transaction_id,journal_entry_id)
  values(v_debit,v_journal),(v_credit,v_journal);

  insert into public.transfer_pairs(
    company_id,transfer_date,amount,from_account_id,to_account_id,from_project_id,to_project_id,
    debit_transaction_id,credit_transaction_id,status,creates_due_to_from,confirmed_by,confirmed_at
  ) values (
    target_company,transfer_date,abs(transfer_amount),from_account,to_account,from_project,to_project,
    v_debit,v_credit,'confirmed',v_creates_due,v_user,now()
  ) returning id into v_transfer;

  if v_creates_due then
    insert into public.inter_project_obligations(
      company_id,creditor_project_id,debtor_project_id,amount,source_transfer_id,description,status
    ) values (
      target_company,from_project,to_project,abs(transfer_amount),v_transfer,btrim(transfer_description),'open'
    );
  end if;

  update public.financial_accounts
  set current_balance=coalesce(current_balance,0)-abs(transfer_amount),
      balance_as_of=greatest(coalesce(balance_as_of,transfer_date),transfer_date),updated_at=now()
  where id=from_account;
  update public.financial_accounts
  set current_balance=coalesce(current_balance,0)+abs(transfer_amount),
      balance_as_of=greatest(coalesce(balance_as_of,transfer_date),transfer_date),updated_at=now()
  where id=to_account;

  insert into public.manual_accounting_entries(
    company_id,request_key,entry_type,canonical_transaction_id,related_transaction_id,
    journal_entry_id,created_by
  ) values (
    target_company,request_key,'internal_transfer',v_debit,v_credit,v_journal,v_user
  ) returning id into v_existing.id;

  return jsonb_build_object(
    'posted',true,'already_recorded',false,'entry_id',v_existing.id,'transfer_id',v_transfer,
    'debit_transaction_id',v_debit,'credit_transaction_id',v_credit,'journal_entry_id',v_journal,
    'creates_due_to_from',v_creates_due
  );
end;
$$;

create or replace function public.post_manual_transfer_atomic(
  request_key uuid,
  target_company uuid,
  from_account uuid,
  to_account uuid,
  from_project uuid,
  to_project uuid,
  transfer_date date,
  transfer_amount numeric,
  transfer_description text,
  transfer_reference text default null
) returns jsonb
language sql
security invoker
set search_path=''
as $$
  select private.post_manual_transfer_atomic(
    request_key,target_company,from_account,to_account,from_project,to_project,
    transfer_date,transfer_amount,transfer_description,transfer_reference
  );
$$;

create or replace function private.reverse_manual_transaction_atomic(
  request_key uuid,
  target_company uuid,
  target_transaction uuid,
  reversal_reason text
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid:=auth.uid();
  v_entry public.manual_accounting_entries%rowtype;
  v_tx public.canonical_transactions%rowtype;
  v_existing public.manual_accounting_entries%rowtype;
  v_reversal uuid;
  v_journal uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if not (private.is_company_owner(target_company) or private.has_permission(target_company,'transactions.confirm')) then
    raise exception 'You do not have permission to reverse accounting transactions';
  end if;
  if nullif(btrim(reversal_reason),'') is null then raise exception 'Give a reason for the reversal'; end if;

  select * into v_existing from public.manual_accounting_entries mae
  where mae.company_id=target_company and mae.request_key=reverse_manual_transaction_atomic.request_key;
  if v_existing.id is not null then
    return jsonb_build_object('reversed',true,'already_recorded',true,'reversal_transaction_id',v_existing.canonical_transaction_id);
  end if;

  select mae.* into v_entry from public.manual_accounting_entries mae
  where mae.company_id=target_company and mae.canonical_transaction_id=target_transaction
  order by mae.created_at limit 1;
  if v_entry.id is null then raise exception 'Only manual transactions can be reversed here'; end if;
  if v_entry.related_transaction_id is not null then raise exception 'Record a correcting transfer instead of reversing one side of a transfer'; end if;
  if v_entry.approval_request_id is not null then raise exception 'Reverse an approval payment through the approval workflow'; end if;

  select * into v_tx from public.canonical_transactions ct
  where ct.id=target_transaction and ct.company_id=target_company for update;
  if v_tx.id is null then raise exception 'Transaction not found'; end if;
  if v_tx.reversed_at is not null or exists(select 1 from public.canonical_transactions r where r.reversal_of=v_tx.id) then
    raise exception 'Transaction has already been reversed';
  end if;

  insert into public.canonical_transactions(
    company_id,financial_account_id,project_id,transaction_date,narration,reference,counterparty,
    signed_amount,normalized_fingerprint,classification,transaction_type,category_name,status,
    funding_source,is_personal_non_business,is_internal_transfer,is_posted,posted_at,
    created_by,confirmed_by,confirmed_at,reversal_of,notes,entry_source
  ) values (
    target_company,v_tx.financial_account_id,v_tx.project_id,current_date,
    'Reversal: '||coalesce(v_tx.narration,'Manual transaction'),v_tx.reference,v_tx.counterparty,
    -v_tx.signed_amount,'manual:'||request_key::text||':reversal',v_tx.classification,v_tx.transaction_type,
    v_tx.category_name,'confirmed',v_tx.funding_source,v_tx.is_personal_non_business,v_tx.is_internal_transfer,
    true,now(),v_user,v_user,now(),v_tx.id,btrim(reversal_reason),'manual_reversal'
  ) returning id into v_reversal;

  update public.canonical_transactions set reversed_at=now() where id=v_tx.id;
  update public.financial_accounts
  set current_balance=coalesce(current_balance,0)-v_tx.signed_amount,
      balance_as_of=greatest(coalesce(balance_as_of,current_date),current_date),updated_at=now()
  where id=v_tx.financial_account_id;

  select cjl.journal_entry_id into v_journal from public.canonical_journal_links cjl
  where cjl.canonical_transaction_id=v_reversal;

  insert into public.manual_accounting_entries(
    company_id,request_key,entry_type,canonical_transaction_id,journal_entry_id,created_by
  ) values (
    target_company,request_key,'reversal',v_reversal,v_journal,v_user
  );

  if v_tx.project_id is not null then perform public.refresh_project_financial_summary(v_tx.project_id); end if;
  return jsonb_build_object('reversed',true,'already_recorded',false,'original_transaction_id',v_tx.id,'reversal_transaction_id',v_reversal,'journal_entry_id',v_journal);
end;
$$;

create or replace function public.reverse_manual_transaction_atomic(
  request_key uuid,
  target_company uuid,
  target_transaction uuid,
  reversal_reason text
) returns jsonb
language sql
security invoker
set search_path=''
as $$
  select private.reverse_manual_transaction_atomic(request_key,target_company,target_transaction,reversal_reason);
$$;

create or replace function private.ensure_canonical_journal(target_transaction uuid)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare v_tx public.canonical_transactions%rowtype; v_existing uuid; v_entry uuid; v_bank uuid; v_counter uuid; v_amount numeric; v_counter_code text; v_counter_name text; v_project uuid; v_actor uuid;
begin
  select * into v_tx from public.canonical_transactions where id=target_transaction;
  if v_tx.id is null or not coalesce(v_tx.is_posted,false) or v_tx.status<>'confirmed' or v_tx.classification is null or v_tx.signed_amount is null or v_tx.signed_amount=0 then return null; end if;
  select journal_entry_id into v_existing from public.canonical_journal_links where canonical_transaction_id=v_tx.id; if v_existing is not null then return v_existing; end if;
  if v_tx.classification='internal_transfer' and coalesce(v_tx.notes,'') like 'Manual internal transfer:%' then return null; end if;
  perform private.assert_open_accounting_period(v_tx.company_id,v_tx.transaction_date); perform private.seed_default_chart_of_accounts(v_tx.company_id);
  v_bank:=private.account_id(v_tx.company_id,'1000');
  v_counter_code:=case v_tx.classification when 'project_expense' then '5000' when 'company_expense' then '6000' when 'project_funding' then '2100' when 'company_income' then '4100' when 'company_financing' then '2250' when 'project_advance' then '1300' when 'personal_non_business' then '1350' when 'internal_transfer' then '2300' when 'receivable_payment' then '1100' when 'payable_payment' then '2000' else '9990' end;
  select id,name into v_counter,v_counter_name from public.chart_of_accounts where company_id=v_tx.company_id and code=v_counter_code limit 1; if v_bank is null or v_counter is null then raise exception 'Required ledger account is missing'; end if;
  v_amount:=abs(v_tx.signed_amount); v_project:=case when v_tx.classification in ('project_expense','project_funding','project_advance','receivable_payment','payable_payment') then v_tx.project_id else null end; v_actor:=coalesce(v_tx.confirmed_by,v_tx.created_by);
  insert into public.journal_entries(company_id,entry_date,reference,description,source_type,source_id,status,created_by,posted_by,posted_at) values(v_tx.company_id,v_tx.transaction_date,v_tx.reference,coalesce(v_tx.narration,'Financial transaction'),'canonical_transaction',v_tx.id,'posted',v_actor,v_actor,now()) returning id into v_entry;
  if v_tx.signed_amount>0 then
    insert into public.journal_lines(entry_id,account_id,financial_account_id,project_id,description,debit,credit) values(v_entry,v_bank,v_tx.financial_account_id,null,'Cash / bank movement',v_amount,0),(v_entry,v_counter,null,v_project,coalesce(v_tx.category_name,v_counter_name),0,v_amount);
  else
    insert into public.journal_lines(entry_id,account_id,financial_account_id,project_id,description,debit,credit) values(v_entry,v_counter,null,v_project,coalesce(v_tx.category_name,v_counter_name),v_amount,0),(v_entry,v_bank,v_tx.financial_account_id,null,'Cash / bank movement',0,v_amount);
  end if;
  insert into public.canonical_journal_links(canonical_transaction_id,journal_entry_id) values(v_tx.id,v_entry) on conflict(canonical_transaction_id) do nothing; return v_entry;
end $$;

revoke all on function private.post_manual_transaction_atomic(uuid,uuid,uuid,uuid,text,date,numeric,text,text,text,text,text,text,uuid) from public,anon;
revoke all on function private.post_manual_transfer_atomic(uuid,uuid,uuid,uuid,uuid,uuid,date,numeric,text,text) from public,anon;
revoke all on function private.reverse_manual_transaction_atomic(uuid,uuid,uuid,text) from public,anon;
grant execute on function private.post_manual_transaction_atomic(uuid,uuid,uuid,uuid,text,date,numeric,text,text,text,text,text,text,uuid) to authenticated;
grant execute on function private.post_manual_transfer_atomic(uuid,uuid,uuid,uuid,uuid,uuid,date,numeric,text,text) to authenticated;
grant execute on function private.reverse_manual_transaction_atomic(uuid,uuid,uuid,text) to authenticated;

revoke all on function public.post_manual_transaction_atomic(uuid,uuid,uuid,uuid,text,date,numeric,text,text,text,text,text,text,uuid) from public,anon;
revoke all on function public.post_manual_transfer_atomic(uuid,uuid,uuid,uuid,uuid,uuid,date,numeric,text,text) from public,anon;
revoke all on function public.reverse_manual_transaction_atomic(uuid,uuid,uuid,text) from public,anon;
grant execute on function public.post_manual_transaction_atomic(uuid,uuid,uuid,uuid,text,date,numeric,text,text,text,text,text,text,uuid) to authenticated;
grant execute on function public.post_manual_transfer_atomic(uuid,uuid,uuid,uuid,uuid,uuid,date,numeric,text,text) to authenticated;
grant execute on function public.reverse_manual_transaction_atomic(uuid,uuid,uuid,text) to authenticated;
