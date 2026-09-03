-- DRAFT ONLY — apply after project-cost bridge, commitment/forecast and commitment-audit drafts.
-- A link allocates an existing posted Money expense to a commitment. It never creates or edits the Money transaction.

create table if not exists public.project_cost_commitment_payment_links (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  commitment_id uuid not null references public.project_cost_commitments(id) on delete cascade,
  transaction_id uuid not null references public.transactions(id) on delete restrict,
  allocated_amount numeric(18,2) not null check (allocated_amount > 0),
  status text not null default 'active' check (status in ('active','void')),
  note text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  voided_by uuid references auth.users(id),
  voided_at timestamptz,
  void_reason text,
  constraint project_cost_payment_link_void_check check ((status='active' and voided_at is null) or status='void')
);
create index if not exists project_cost_payment_links_project_idx on public.project_cost_commitment_payment_links(project_id,status,transaction_id);
create unique index if not exists project_cost_payment_links_one_active_pair_idx on public.project_cost_commitment_payment_links(commitment_id,transaction_id) where status='active';
alter table public.project_cost_commitment_payment_links enable row level security;
create policy project_cost_commitment_payment_links_read on public.project_cost_commitment_payment_links for select to authenticated using (private.can_view_project_cost(project_id));
revoke all on table public.project_cost_commitment_payment_links from anon;
revoke insert,update,delete,truncate,references,trigger on table public.project_cost_commitment_payment_links from authenticated;
grant select on table public.project_cost_commitment_payment_links to authenticated;
grant all privileges on table public.project_cost_commitment_payment_links to service_role;

create or replace function public.link_project_cost_payment_v1(
  target_project_id uuid,
  target_transaction_id uuid,
  target_commitment_id uuid,
  allocation_amount numeric,
  link_note text default null
) returns uuid
language plpgsql security definer set search_path=''
as $$
declare
  actor uuid:=auth.uid(); company uuid; tx_company uuid; tx_amount numeric; tx_code text; tx_allocated numeric;
  commitment_company uuid; commitment_code text; commitment_amount numeric; commitment_paid numeric; commitment_status text;
  before_snapshot jsonb; after_snapshot jsonb; new_link uuid;
begin
  if actor is null then raise exception 'Authentication required'; end if;
  if allocation_amount is null or allocation_amount <= 0 then raise exception 'Allocation amount must be greater than zero'; end if;
  select p.company_id into company from public.projects p join public.company_members m on m.company_id=p.company_id and m.user_id=actor and m.status='active' and m.role in ('md','accountant') where p.id=target_project_id;
  if company is null then raise exception 'Not authorised for project commitment payments'; end if;

  select t.company_id,t.amount,t.cost_code into tx_company,tx_amount,tx_code from public.transactions t where t.id=target_transaction_id and t.project_id=target_project_id and t.kind='expense' and t.status='posted' for update;
  if tx_company is null or tx_company<>company then raise exception 'Posted project expense not found'; end if;
  if tx_code is null then raise exception 'Classify this Money expense before linking it to a commitment'; end if;

  select c.company_id,c.cost_code,c.committed_amount,c.paid_amount,c.status,to_jsonb(c) into commitment_company,commitment_code,commitment_amount,commitment_paid,commitment_status,before_snapshot
  from public.project_cost_commitments c where c.id=target_commitment_id and c.project_id=target_project_id for update;
  if commitment_company is null or commitment_company<>company then raise exception 'Commitment not found'; end if;
  if commitment_status<>'open' then raise exception 'Only an open commitment can receive a payment link'; end if;
  if tx_code<>commitment_code then raise exception 'Money expense cost code % does not match commitment cost code %',tx_code,commitment_code; end if;

  select coalesce(sum(l.allocated_amount),0) into tx_allocated from public.project_cost_commitment_payment_links l where l.transaction_id=target_transaction_id and l.status='active';
  if tx_allocated+allocation_amount > tx_amount+0.005 then raise exception 'Payment allocations exceed the Money transaction amount'; end if;
  if commitment_paid+allocation_amount > commitment_amount+0.005 then raise exception 'Payment allocation exceeds the commitment unpaid balance'; end if;

  insert into public.project_cost_commitment_payment_links(company_id,project_id,commitment_id,transaction_id,allocated_amount,status,note,created_by)
  values(company,target_project_id,target_commitment_id,target_transaction_id,allocation_amount,'active',nullif(trim(link_note),''),actor) returning id into new_link;
  update public.project_cost_commitments set paid_amount=round(paid_amount+allocation_amount,2),updated_by=actor,updated_at=now() where id=target_commitment_id;
  select to_jsonb(c) into after_snapshot from public.project_cost_commitments c where c.id=target_commitment_id;
  insert into public.project_cost_commitment_revisions(commitment_id,project_id,revision_type,before_data,after_data,reason,changed_by)
  values(target_commitment_id,target_project_id,'payment_linked',before_snapshot,after_snapshot,concat('Money transaction ',target_transaction_id,' linked: ',allocation_amount),actor);
  return new_link;
end;
$$;

create or replace function public.void_project_cost_payment_link_v1(
  target_project_id uuid,
  target_link_id uuid,
  void_reason_value text
) returns uuid
language plpgsql security definer set search_path=''
as $$
declare
  actor uuid:=auth.uid(); company uuid; link_commitment uuid; link_amount numeric; before_snapshot jsonb; after_snapshot jsonb; commitment_status text; commitment_amount numeric; new_paid numeric;
begin
  if actor is null then raise exception 'Authentication required'; end if;
  if nullif(trim(void_reason_value),'') is null then raise exception 'Void reason is required'; end if;
  select p.company_id into company from public.projects p join public.company_members m on m.company_id=p.company_id and m.user_id=actor and m.status='active' and m.role in ('md','accountant') where p.id=target_project_id;
  if company is null then raise exception 'Not authorised for project commitment payments'; end if;
  select l.commitment_id,l.allocated_amount into link_commitment,link_amount from public.project_cost_commitment_payment_links l where l.id=target_link_id and l.project_id=target_project_id and l.company_id=company and l.status='active' for update;
  if link_commitment is null then raise exception 'Active payment link not found'; end if;
  select c.status,c.committed_amount,to_jsonb(c),greatest(c.paid_amount-link_amount,0) into commitment_status,commitment_amount,before_snapshot,new_paid from public.project_cost_commitments c where c.id=link_commitment for update;
  update public.project_cost_commitment_payment_links set status='void',voided_by=actor,voided_at=now(),void_reason=trim(void_reason_value) where id=target_link_id;
  update public.project_cost_commitments set paid_amount=round(new_paid,2),status=case when commitment_status='closed' and new_paid+0.005<commitment_amount then 'open' else commitment_status end,updated_by=actor,updated_at=now() where id=link_commitment;
  select to_jsonb(c) into after_snapshot from public.project_cost_commitments c where c.id=link_commitment;
  insert into public.project_cost_commitment_revisions(commitment_id,project_id,revision_type,before_data,after_data,reason,changed_by)
  values(link_commitment,target_project_id,'payment_unlinked',before_snapshot,after_snapshot,trim(void_reason_value),actor);
  return link_commitment;
end;
$$;

-- Once payment links exist, ordinary commitment edits must preserve the linked ledger.
-- The input paid amount is the total paid value (opening/manual paid + confirmed active links).
create or replace function public.save_project_cost_commitment_v1(
  target_project_id uuid,
  commitment_id uuid,
  commitment_cost_code text,
  commitment_description text,
  commitment_amount numeric,
  commitment_paid_amount numeric,
  commitment_status text,
  commitment_due_date date default null,
  commitment_note text default null
) returns uuid
language plpgsql security definer set search_path=''
as $$
declare
  actor uuid:=auth.uid(); company uuid; result_id uuid; before_snapshot jsonb; after_snapshot jsonb;
  previous_cost_code text; active_link_total numeric:=0;
begin
  if actor is null then raise exception 'Authentication required'; end if;
  if commitment_cost_code !~ '^(0[1-9]|1[0-9]|20)$' then raise exception 'Invalid cost code'; end if;
  if commitment_status not in ('open','closed','cancelled') then raise exception 'Invalid commitment status'; end if;
  if commitment_amount < 0 or commitment_paid_amount < 0 or commitment_paid_amount > commitment_amount then raise exception 'Invalid commitment amounts'; end if;
  if commitment_status='closed' and round(commitment_paid_amount,2)<>round(commitment_amount,2) then raise exception 'Closed commitment must be fully paid'; end if;
  select p.company_id into company from public.projects p join public.company_members m on m.company_id=p.company_id and m.user_id=actor and m.status='active' and m.role in ('md','accountant') where p.id=target_project_id;
  if company is null then raise exception 'Not authorised for project cost commitments'; end if;

  if commitment_id is null then
    insert into public.project_cost_commitments(company_id,project_id,cost_code,description,committed_amount,paid_amount,status,due_date,note,created_by,updated_by)
    values(company,target_project_id,commitment_cost_code,trim(commitment_description),commitment_amount,commitment_paid_amount,commitment_status,commitment_due_date,nullif(trim(commitment_note),''),actor,actor)
    returning id into result_id;
    select to_jsonb(c) into after_snapshot from public.project_cost_commitments c where c.id=result_id;
    insert into public.project_cost_commitment_revisions(commitment_id,project_id,revision_type,before_data,after_data,reason,changed_by)
    values(result_id,target_project_id,'created',null,after_snapshot,'Commitment created.',actor);
  else
    select c.cost_code,to_jsonb(c) into previous_cost_code,before_snapshot from public.project_cost_commitments c where c.id=commitment_id and c.project_id=target_project_id and c.company_id=company for update;
    if before_snapshot is null then raise exception 'Commitment not found'; end if;
    select coalesce(sum(l.allocated_amount),0) into active_link_total from public.project_cost_commitment_payment_links l where l.commitment_id=commitment_id and l.status='active';
    if active_link_total>0.005 and commitment_cost_code<>previous_cost_code then raise exception 'Void active payment links before changing the commitment cost code'; end if;
    if active_link_total>0.005 and commitment_status='cancelled' then raise exception 'Void active payment links before cancelling the commitment'; end if;
    if commitment_paid_amount+0.005<active_link_total then raise exception 'Paid amount cannot be below confirmed payment-link allocations'; end if;
    update public.project_cost_commitments set cost_code=commitment_cost_code,description=trim(commitment_description),committed_amount=commitment_amount,paid_amount=commitment_paid_amount,status=commitment_status,due_date=commitment_due_date,note=nullif(trim(commitment_note),''),updated_by=actor,updated_at=now() where id=commitment_id returning id into result_id;
    select to_jsonb(c) into after_snapshot from public.project_cost_commitments c where c.id=result_id;
    insert into public.project_cost_commitment_revisions(commitment_id,project_id,revision_type,before_data,after_data,reason,changed_by)
    values(result_id,target_project_id,'updated',before_snapshot,after_snapshot,'Commitment details updated with linked-payment safeguards.',actor);
  end if;
  return result_id;
end;
$$;

revoke all on function public.link_project_cost_payment_v1(uuid,uuid,uuid,numeric,text) from public,anon;
revoke all on function public.void_project_cost_payment_link_v1(uuid,uuid,text) from public,anon;
revoke all on function public.save_project_cost_commitment_v1(uuid,uuid,text,text,numeric,numeric,text,date,text) from public,anon;
grant execute on function public.link_project_cost_payment_v1(uuid,uuid,uuid,numeric,text) to authenticated;
grant execute on function public.void_project_cost_payment_link_v1(uuid,uuid,text) to authenticated;
grant execute on function public.save_project_cost_commitment_v1(uuid,uuid,text,text,numeric,numeric,text,date,text) to authenticated;
