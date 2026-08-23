create table if not exists public.transaction_intelligence_decisions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  import_id uuid not null references public.statement_imports(id) on delete cascade,
  statement_row_id uuid not null references public.statement_rows(id) on delete cascade,
  engine_version text not null,
  model_id text not null,
  project_id uuid references public.projects(id) on delete set null,
  source_project_code text,
  destination_project_code text,
  proposed_classification text not null,
  proposed_category text,
  proposed_funding_source text,
  model_confidence numeric not null default 0 check (model_confidence between 0 and 100),
  accounting_confidence numeric not null default 0 check (accounting_confidence between 0 and 100),
  decision_status text not null default 'needs_review' check (decision_status in ('validated','needs_review','auto_posted','rejected','superseded')),
  auto_post_eligible boolean not null default false,
  deterministic_override boolean not null default false,
  deterministic_checks jsonb not null default '{}'::jsonb,
  evidence jsonb not null default '[]'::jsonb,
  explanation text,
  canonical_transaction_id uuid references public.canonical_transactions(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  applied_at timestamptz,
  unique(statement_row_id,engine_version)
);

create index if not exists idx_transaction_intelligence_import_status
  on public.transaction_intelligence_decisions(import_id,decision_status,created_at desc);
create index if not exists idx_transaction_intelligence_company
  on public.transaction_intelligence_decisions(company_id,created_at desc);

alter table public.transaction_intelligence_decisions enable row level security;

drop policy if exists transaction_intelligence_select on public.transaction_intelligence_decisions;
create policy transaction_intelligence_select on public.transaction_intelligence_decisions
  for select to authenticated
  using (private.is_company_member(company_id));

drop policy if exists transaction_intelligence_insert on public.transaction_intelligence_decisions;
create policy transaction_intelligence_insert on public.transaction_intelligence_decisions
  for insert to authenticated
  with check (
    private.is_company_member(company_id)
    and created_by=(select auth.uid())
    and exists(
      select 1 from public.statement_imports si
      join public.statement_rows sr on sr.import_id=si.id
      where si.id=import_id and sr.id=statement_row_id and si.company_id=company_id
    )
  );

drop policy if exists transaction_intelligence_update on public.transaction_intelligence_decisions;
create policy transaction_intelligence_update on public.transaction_intelligence_decisions
  for update to authenticated
  using (private.is_company_member(company_id))
  with check (private.is_company_member(company_id));

grant select,insert,update on public.transaction_intelligence_decisions to authenticated;
revoke all on public.transaction_intelligence_decisions from anon;

create or replace function public.transaction_intelligence_candidates(
  target_import uuid,
  target_engine_version text,
  target_limit integer default 24
) returns table(
  row_id uuid,
  row_index integer,
  transaction_date date,
  narration text,
  counterparty text,
  reference text,
  signed_amount numeric,
  running_balance numeric,
  best_project_id uuid,
  best_project_code text,
  best_project_confidence numeric,
  best_project_reasons jsonb
) language plpgsql security definer set search_path='' as $$
declare v_company uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select company_id into v_company from public.statement_imports where id=target_import;
  if v_company is null then raise exception 'Statement import not found'; end if;
  if not (
    private.is_company_owner(v_company)
    or private.has_permission(v_company,'transactions.confirm')
    or private.has_permission(v_company,'statements.upload')
  ) then raise exception 'Access denied'; end if;

  return query
  select sr.id,sr.row_index,sr.transaction_date,sr.narration,sr.counterparty,sr.reference,
         sr.signed_amount,sr.running_balance,best.project_id,p.project_code,best.confidence,best.reasons
  from public.statement_rows sr
  left join lateral (
    select spm.project_id,spm.confidence,spm.reasons
    from public.statement_project_matches spm
    where spm.statement_row_id=sr.id and spm.status<>'rejected'
    order by spm.confidence desc,spm.created_at asc limit 1
  ) best on true
  left join public.projects p on p.id=best.project_id
  where sr.import_id=target_import
    and sr.transaction_date is not null and sr.signed_amount is not null
    and not exists(
      select 1 from public.statement_row_transaction_links l
      where l.statement_row_id=sr.id and l.is_primary=true
    )
    and not exists(
      select 1 from public.transaction_intelligence_decisions tid
      where tid.statement_row_id=sr.id and tid.engine_version=target_engine_version
        and tid.decision_status in ('validated','needs_review','auto_posted')
    )
  order by
    case when best.project_id is not null then 0 else 1 end,
    coalesce(best.confidence,0) desc,
    abs(sr.signed_amount) desc,
    sr.row_index
  limit greatest(1,least(coalesce(target_limit,24),24));
end;
$$;

create or replace function public.transaction_intelligence_candidate_count(
  target_import uuid,
  target_engine_version text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_company uuid; v_remaining integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select company_id into v_company from public.statement_imports where id=target_import;
  if v_company is null or not private.is_company_member(v_company) then raise exception 'Access denied'; end if;
  select count(*) into v_remaining
  from public.statement_rows sr
  where sr.import_id=target_import and sr.transaction_date is not null and sr.signed_amount is not null
    and not exists(select 1 from public.statement_row_transaction_links l where l.statement_row_id=sr.id and l.is_primary=true)
    and not exists(
      select 1 from public.transaction_intelligence_decisions tid
      where tid.statement_row_id=sr.id and tid.engine_version=target_engine_version
        and tid.decision_status in ('validated','needs_review','auto_posted')
    );
  return jsonb_build_object('remaining',v_remaining);
end;
$$;

revoke all on function public.transaction_intelligence_candidates(uuid,text,integer) from public,anon;
revoke all on function public.transaction_intelligence_candidate_count(uuid,text) from public,anon;
grant execute on function public.transaction_intelligence_candidates(uuid,text,integer) to authenticated;
grant execute on function public.transaction_intelligence_candidate_count(uuid,text) to authenticated;

