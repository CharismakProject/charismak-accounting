-- DRAFT ONLY — apply after project_cost_commitment_payment_link_v1.sql.
-- Protects an active commitment allocation from becoming stale when its Money transaction is corrected.
-- Linking/unlinking never edits the Money transaction itself.

create or replace function private.guard_linked_project_cost_payment_transaction_mutation()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if exists (
    select 1
    from public.project_cost_commitment_payment_links link
    where link.transaction_id=old.id
      and link.status='active'
  ) and (
    new.amount is distinct from old.amount
    or new.project_id is distinct from old.project_id
    or new.kind is distinct from old.kind
    or new.status is distinct from old.status
    or new.cost_code is distinct from old.cost_code
  ) then
    raise exception 'Void active commitment payment links before changing a linked Money transaction';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_linked_project_cost_payment_transaction_mutation() from public,anon,authenticated;

drop trigger if exists guard_linked_project_cost_payment_transaction_mutation on public.transactions;
create trigger guard_linked_project_cost_payment_transaction_mutation
before update of amount,project_id,kind,status,cost_code on public.transactions
for each row execute function private.guard_linked_project_cost_payment_transaction_mutation();
