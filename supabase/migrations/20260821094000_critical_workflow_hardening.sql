-- Critical workflow hardening: self-service company onboarding, atomic approvals,
-- atomic internal transfers with ledger posting, and defensive numeric constraints.

alter table public.approval_requests
  drop constraint if exists approval_requests_amount_nonnegative,
  drop constraint if exists approval_requests_approved_amount_bounds,
  drop constraint if exists approval_requests_paid_amount_bounds;
alter table public.approval_requests
  add constraint approval_requests_amount_nonnegative check (amount >= 0),
  add constraint approval_requests_approved_amount_bounds check (approved_amount >= 0 and approved_amount <= amount),
  add constraint approval_requests_paid_amount_bounds check (paid_amount >= 0 and paid_amount <= approved_amount);

alter table public.membership_permission_overrides
  drop constraint if exists membership_permission_overrides_approval_limit_nonnegative,
  drop constraint if exists membership_permission_overrides_payment_limit_nonnegative;
alter table public.membership_permission_overrides
  add constraint membership_permission_overrides_approval_limit_nonnegative check (approval_limit is null or approval_limit >= 0),
  add constraint membership_permission_overrides_payment_limit_nonnegative check (payment_limit is null or payment_limit >= 0);

alter table public.project_progress_updates
  drop constraint if exists project_progress_updates_ctc_nonnegative;
alter table public.project_progress_updates
  add constraint project_progress_updates_ctc_nonnegative check (cost_to_complete_override is null or cost_to_complete_override >= 0);

alter table public.transfer_pairs
  drop constraint if exists transfer_pairs_positive_amount,
  drop constraint if exists transfer_pairs_distinct_accounts;
alter table public.transfer_pairs
  add constraint transfer_pairs_positive_amount check (amount > 0) not valid,
  add constraint transfer_pairs_distinct_accounts check (
    from_account_id is null or to_account_id is null or from_account_id <> to_account_id
  ) not valid;

create or replace function public.create_company_workspace(company_name text, desired_slug text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_name text := btrim(coalesce(company_name,''));
  v_slug text;
  v_company uuid;
  v_membership uuid;
  v_owner_position uuid;
  v_attempt integer := 0;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if length(v_name) < 2 then raise exception 'Enter a company name'; end if;
  if length(v_name) > 160 then raise exception 'Company name is too long'; end if;

  if exists (
    select 1 from public.company_memberships
    where user_id=v_user and status='active'
  ) then
    raise exception 'This account already belongs to an active company workspace';
  end if;

  v_slug := lower(regexp_replace(coalesce(nullif(btrim(desired_slug),''),v_name),'[^a-zA-Z0-9]+','-','g'));
  v_slug := trim(both '-' from v_slug);
  if v_slug = '' then v_slug := 'company'; end if;
  v_slug := left(v_slug,60);

  while exists(select 1 from public.companies where slug=v_slug) loop
    v_attempt := v_attempt + 1;
    v_slug := left(v_slug,50) || '-' || substr(replace(gen_random_uuid()::text,'-',''),1,6);
    if v_attempt > 5 then raise exception 'Could not allocate a unique company identifier'; end if;
  end loop;

  insert into public.companies(name,slug)
  values(v_name,v_slug)
  returning id into v_company;

  insert into public.company_memberships(company_id,user_id,status,is_owner)
  values(v_company,v_user,'active',true)
  returning id into v_membership;

  select id into v_owner_position
  from public.positions
  where code='MD_OWNER' and is_system_template=true
  order by created_at asc
  limit 1;

  if v_owner_position is not null then
    insert into public.membership_positions(membership_id,position_id,is_primary)
    values(v_membership,v_owner_position,true)
    on conflict(membership_id,position_id) do update set is_primary=true;
  end if;

  insert into public.company_branding(company_id,display_name,updated_by)
  values(v_company,v_name,v_user)
  on conflict(company_id) do nothing;

  insert into public.company_finance_settings(company_id)
  values(v_company)
  on conflict(company_id) do nothing;

  insert into public.user_interface_preferences(company_id,user_id,active_interface)
  values(v_company,v_user,'md_owner'::public.interface_family)
  on conflict(company_id,user_id) do update set active_interface=excluded.active_interface,switched_at=now();

  perform private.seed_default_chart_of_accounts(v_company);

  return jsonb_build_object('company_id',v_company,'membership_id',v_membership,'slug',v_slug,'name',v_name);
end;
$$;

grant execute on function public.create_company_workspace(text,text) to authenticated;

create or replace function private.effective_approval_limit(target_company uuid, target_permission text)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_membership uuid;
  v_permission uuid;
  v_override public.membership_permission_overrides%rowtype;
  v_has_unlimited boolean := false;
  v_limit numeric;
begin
  if private.is_company_owner(target_company) then return null; end if;

  select id into v_membership
  from public.company_memberships
  where company_id=target_company and user_id=auth.uid() and status='active'
  limit 1;
  if v_membership is null then return 0; end if;

  select id into v_permission from public.permissions where code=target_permission limit 1;
  if v_permission is null then return 0; end if;

  select * into v_override
  from public.membership_permission_overrides
  where membership_id=v_membership and permission_id=v_permission
  limit 1;

  if v_override.id is not null then
    if not v_override.allowed then return 0; end if;
    return v_override.approval_limit;
  end if;

  select bool_or(pp.approval_limit is null), max(pp.approval_limit)
    into v_has_unlimited,v_limit
  from public.membership_positions mp
  join public.position_permissions pp on pp.position_id=mp.position_id
  where mp.membership_id=v_membership and pp.permission_id=v_permission;

  if coalesce(v_has_unlimited,false) then return null; end if;
  return coalesce(v_limit,0);
end;
$$;

revoke execute on function private.effective_approval_limit(uuid,text) from public,anon,authenticated;

create or replace function public.decide_approval_request_atomic(
  target_request uuid,
  target_action text,
  target_approved_amount numeric default null,
  target_comments text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.approval_requests%rowtype;
  v_approved numeric := 0;
  v_status text;
  v_limit numeric;
  v_action_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_request
  from public.approval_requests
  where id=target_request
  for update;
  if v_request.id is null then raise exception 'Approval request not found'; end if;

  if not (private.is_company_owner(v_request.company_id) or private.has_permission(v_request.company_id,'approvals.manage')) then
    raise exception 'You do not have permission to decide this request';
  end if;

  if v_request.status not in ('pending','emergency_retrospective') then
    raise exception 'This request has already been decided or is not awaiting a decision';
  end if;

  if target_action='approve' then
    v_approved := v_request.amount;
    v_status := 'approved';
  elsif target_action='partial_approve' then
    if target_approved_amount is null or target_approved_amount <= 0 then
      raise exception 'Partial approval must be greater than zero';
    end if;
    if target_approved_amount >= v_request.amount then
      raise exception 'Partial approval must be less than the requested amount; use full approval instead';
    end if;
    v_approved := target_approved_amount;
    v_status := 'partially_approved';
  elsif target_action='reject' then
    v_approved := 0;
    v_status := 'rejected';
  elsif target_action='return' then
    v_approved := 0;
    v_status := 'returned';
  else
    raise exception 'Unsupported approval decision';
  end if;

  if target_action in ('approve','partial_approve') then
    v_limit := private.effective_approval_limit(v_request.company_id,'approvals.manage');
    if v_limit is not null and v_approved > v_limit then
      raise exception 'Approval amount exceeds your delegated approval limit';
    end if;
  end if;

  update public.approval_requests
  set status=v_status,
      approved_amount=v_approved,
      decided_at=now(),
      updated_at=now()
  where id=v_request.id;

  insert into public.approval_actions(request_id,actor_user_id,action,amount,comments,acting_interface)
  values(
    v_request.id,
    auth.uid(),
    target_action,
    case when target_action in ('approve','partial_approve') then v_approved else null end,
    nullif(btrim(coalesce(target_comments,'')),''),
    private.current_interface(v_request.company_id)
  )
  returning id into v_action_id;

  return jsonb_build_object('request_id',v_request.id,'action_id',v_action_id,'status',v_status,'approved_amount',v_approved);
end;
$$;

grant execute on function public.decide_approval_request_atomic(uuid,text,numeric,text) to authenticated;

create or replace function public.record_internal_transfer_atomic(
  target_company uuid,
  target_transfer_date date,
  target_amount numeric,
  target_from_account uuid,
  target_to_account uuid,
  target_from_project uuid default null,
  target_to_project uuid default null,
  target_description text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_transfer uuid;
  v_debit_tx uuid;
  v_credit_tx uuid;
  v_obligation uuid;
  v_journal uuid;
  v_cash_account uuid;
  v_reference text;
  v_creates_due boolean;
begin
  if v_actor is null then raise exception 'Authentication required'; end if;
  if not (private.is_company_owner(target_company) or (private.has_permission(target_company,'transactions.create') and private.has_permission(target_company,'transactions.post'))) then
    raise exception 'You do not have permission to post internal transfers';
  end if;
  if target_amount is null or target_amount <= 0 then raise exception 'Transfer amount must be greater than zero'; end if;
  if target_from_account is null or target_to_account is null then raise exception 'Choose both source and destination financial accounts'; end if;
  if target_from_account=target_to_account then raise exception 'Source and destination accounts must be different'; end if;

  if not exists(select 1 from public.financial_accounts where id=target_from_account and company_id=target_company and is_active=true) then
    raise exception 'Source account is not available in this company';
  end if;
  if not exists(select 1 from public.financial_accounts where id=target_to_account and company_id=target_company and is_active=true) then
    raise exception 'Destination account is not available in this company';
  end if;
  if target_from_project is not null and not exists(select 1 from public.projects where id=target_from_project and company_id=target_company) then
    raise exception 'Source project is not available in this company';
  end if;
  if target_to_project is not null and not exists(select 1 from public.projects where id=target_to_project and company_id=target_company) then
    raise exception 'Destination project is not available in this company';
  end if;

  v_creates_due := target_from_project is not null and target_to_project is not null and target_from_project<>target_to_project;

  insert into public.transfer_pairs(
    company_id,transfer_date,amount,from_account_id,to_account_id,from_project_id,to_project_id,
    status,creates_due_to_from,confirmed_by,confirmed_at
  ) values(
    target_company,coalesce(target_transfer_date,current_date),target_amount,target_from_account,target_to_account,
    target_from_project,target_to_project,'confirmed',v_creates_due,v_actor,now()
  ) returning id into v_transfer;

  v_reference := 'TRF-' || upper(substr(replace(v_transfer::text,'-',''),1,12));

  insert into public.canonical_transactions(
    company_id,financial_account_id,project_id,transaction_date,narration,reference,signed_amount,
    classification,transaction_type,status,is_internal_transfer,is_posted,posted_at,created_by,confirmed_by,confirmed_at,notes
  ) values(
    target_company,target_from_account,null,coalesce(target_transfer_date,current_date),
    coalesce(nullif(btrim(target_description),''),'Internal transfer'),v_reference,-target_amount,
    'internal_transfer','internal_transfer','confirmed',true,true,now(),v_actor,v_actor,now(),
    'Manual internal transfer: source account'
  ) returning id into v_debit_tx;

  insert into public.canonical_transactions(
    company_id,financial_account_id,project_id,transaction_date,narration,reference,signed_amount,
    classification,transaction_type,status,is_internal_transfer,is_posted,posted_at,created_by,confirmed_by,confirmed_at,notes
  ) values(
    target_company,target_to_account,null,coalesce(target_transfer_date,current_date),
    coalesce(nullif(btrim(target_description),''),'Internal transfer'),v_reference,target_amount,
    'internal_transfer','internal_transfer','confirmed',true,true,now(),v_actor,v_actor,now(),
    'Manual internal transfer: destination account'
  ) returning id into v_credit_tx;

  update public.transfer_pairs
  set debit_transaction_id=v_debit_tx,credit_transaction_id=v_credit_tx
  where id=v_transfer;

  if v_creates_due then
    insert into public.inter_project_obligations(
      company_id,creditor_project_id,debtor_project_id,amount,source_transfer_id,description,status
    ) values(
      target_company,target_from_project,target_to_project,target_amount,v_transfer,
      coalesce(nullif(btrim(target_description),''),'Inter-project funding transfer'),'open'
    ) returning id into v_obligation;
  end if;

  perform private.seed_default_chart_of_accounts(target_company);
  select id into v_cash_account from public.chart_of_accounts where company_id=target_company and code='1000' limit 1;
  if v_cash_account is null then raise exception 'Bank & Cash ledger account is missing'; end if;

  insert into public.journal_entries(company_id,entry_date,reference,description,source_type,source_id,status,created_by)
  values(
    target_company,coalesce(target_transfer_date,current_date),v_reference,
    coalesce(nullif(btrim(target_description),''),'Internal transfer'),
    'internal_transfer',v_transfer,'draft',v_actor
  ) returning id into v_journal;

  insert into public.journal_lines(entry_id,account_id,financial_account_id,description,debit,credit)
  values
    (v_journal,v_cash_account,target_to_account,'Transfer into destination account',target_amount,0),
    (v_journal,v_cash_account,target_from_account,'Transfer out of source account',0,target_amount);

  update public.journal_entries
  set status='posted',posted_by=v_actor,posted_at=now(),updated_at=now()
  where id=v_journal;

  insert into public.canonical_journal_links(canonical_transaction_id,journal_entry_id)
  values(v_debit_tx,v_journal),(v_credit_tx,v_journal)
  on conflict(canonical_transaction_id) do nothing;

  return jsonb_build_object(
    'transfer_id',v_transfer,
    'debit_transaction_id',v_debit_tx,
    'credit_transaction_id',v_credit_tx,
    'journal_entry_id',v_journal,
    'inter_project_obligation_id',v_obligation,
    'reference',v_reference
  );
end;
$$;

grant execute on function public.record_internal_transfer_atomic(uuid,date,numeric,uuid,uuid,uuid,uuid,text) to authenticated;
