-- QA hardening: project-aware permissions and database invariants.

create or replace function private.has_project_permission(target_company uuid, target_project uuid, target_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    private.is_company_owner(target_company)
    or private.has_company_wide_permission(target_company, target_permission)
    or exists (
      select 1
      from public.company_memberships m
      join public.membership_permission_overrides o on o.membership_id=m.id and o.allowed=true
      join public.permissions p on p.id=o.permission_id
      join public.project_assignments pa on pa.membership_id=m.id and pa.company_id=target_company and pa.project_id=target_project
      where m.company_id=target_company and m.user_id=auth.uid() and m.status='active'
        and p.code=target_permission
        and coalesce(o.scope,'assigned_projects'::public.permission_scope) in ('assigned_projects'::public.permission_scope,'selected_projects'::public.permission_scope)
    )
    or exists (
      select 1
      from public.company_memberships m
      join public.membership_positions mp on mp.membership_id=m.id
      join public.position_permissions pp on pp.position_id=mp.position_id
      join public.permissions p on p.id=pp.permission_id
      join public.project_assignments pa on pa.membership_id=m.id and pa.company_id=target_company and pa.project_id=target_project
      where m.company_id=target_company and m.user_id=auth.uid() and m.status='active'
        and p.code=target_permission
        and pp.scope in ('assigned_projects'::public.permission_scope,'selected_projects'::public.permission_scope)
        and not exists (
          select 1 from public.membership_permission_overrides denied
          where denied.membership_id=m.id and denied.permission_id=p.id and denied.allowed=false
        )
    );
$$;

revoke all on function private.has_project_permission(uuid,uuid,text) from public;
grant execute on function private.has_project_permission(uuid,uuid,text) to authenticated;

-- Project request permissions must stay inside the user's assigned project scope.
drop policy if exists approval_requests_create on public.approval_requests;
create policy approval_requests_create on public.approval_requests for insert to authenticated
with check (
  private.is_company_owner(company_id)
  or (project_id is null and private.has_company_wide_permission(company_id,'approvals.request'))
  or (project_id is not null and private.has_project_permission(company_id,project_id,'approvals.request'))
);

drop policy if exists approval_requests_manage on public.approval_requests;
create policy approval_requests_manage on public.approval_requests for update to authenticated
using (
  private.is_company_owner(company_id)
  or (project_id is null and private.has_company_wide_permission(company_id,'approvals.manage'))
  or (project_id is not null and private.has_project_permission(company_id,project_id,'approvals.manage'))
)
with check (
  private.is_company_owner(company_id)
  or (project_id is null and private.has_company_wide_permission(company_id,'approvals.manage'))
  or (project_id is not null and private.has_project_permission(company_id,project_id,'approvals.manage'))
);

drop policy if exists project_commitments_permission_write on public.project_commitments;
create policy project_commitments_permission_write on public.project_commitments for all to authenticated
using (
  exists(select 1 from public.projects p where p.id=project_id and (
    private.is_company_owner(p.company_id)
    or private.has_company_wide_permission(p.company_id,'projects.manage')
    or private.has_project_permission(p.company_id,p.id,'commitments.manage')
  ))
)
with check (
  exists(select 1 from public.projects p where p.id=project_id and (
    private.is_company_owner(p.company_id)
    or private.has_company_wide_permission(p.company_id,'projects.manage')
    or private.has_project_permission(p.company_id,p.id,'commitments.manage')
  ))
);

drop policy if exists imprest_entries_manage on public.imprest_entries;
create policy imprest_entries_manage on public.imprest_entries for all to authenticated
using (
  exists(select 1 from public.imprest_accounts ia join public.projects p on p.id=ia.project_id
    where ia.id=imprest_account_id and private.has_project_permission(p.company_id,p.id,'imprest.manage'))
)
with check (
  exists(select 1 from public.imprest_accounts ia join public.projects p on p.id=ia.project_id
    where ia.id=imprest_account_id and private.has_project_permission(p.company_id,p.id,'imprest.manage'))
);

drop policy if exists project_progress_updates_write on public.project_progress_updates;
create policy project_progress_updates_write on public.project_progress_updates for all to authenticated
using (
  exists(select 1 from public.projects p where p.id=project_id and (
    private.is_company_owner(p.company_id)
    or private.has_company_wide_permission(p.company_id,'projects.manage')
    or private.has_project_permission(p.company_id,p.id,'progress.update')
  ))
)
with check (
  exists(select 1 from public.projects p where p.id=project_id and (
    private.is_company_owner(p.company_id)
    or private.has_company_wide_permission(p.company_id,'projects.manage')
    or private.has_project_permission(p.company_id,p.id,'progress.update')
  ))
);

-- AI interpretation is readable to project users, but only reviewers/finance/directors can mutate it.
drop policy if exists project_document_intelligence_write on public.project_document_intelligence;
create policy project_document_intelligence_write on public.project_document_intelligence for all to authenticated
using (private.has_project_permission(company_id,project_id,'documents.confirm'))
with check (private.has_project_permission(company_id,project_id,'documents.confirm'));

-- Project document mutation now requires the document permission, not merely project visibility.
drop policy if exists source_documents_permission_write on public.source_documents;
create policy source_documents_permission_write on public.source_documents for all to authenticated
using (
  private.is_company_owner(company_id)
  or (document_type='bank_statement'::public.source_document_type and private.has_company_wide_permission(company_id,'statements.upload'))
  or (project_id is not null and private.has_project_permission(company_id,project_id,'documents.upload'))
)
with check (
  private.is_company_owner(company_id)
  or (document_type='bank_statement'::public.source_document_type and private.has_company_wide_permission(company_id,'statements.upload'))
  or (project_id is not null and private.has_project_permission(company_id,project_id,'documents.upload'))
);

drop policy if exists source_documents_universal_intake_insert on public.source_documents;
create policy source_documents_universal_intake_insert on public.source_documents for insert to authenticated
with check (
  document_type='other'::public.source_document_type and project_id is null and uploaded_by=auth.uid()
  and (private.is_company_owner(company_id) or private.has_company_wide_permission(company_id,'documents.upload') or private.has_company_wide_permission(company_id,'statements.upload'))
);

drop policy if exists source_documents_own_intake_update on public.source_documents;
create policy source_documents_own_intake_update on public.source_documents for update to authenticated
using (uploaded_by=auth.uid() and document_type='other'::public.source_document_type and project_id is null)
with check (
  uploaded_by=auth.uid() and (
    (document_type='other'::public.source_document_type and project_id is null)
    or (document_type='bank_statement'::public.source_document_type and private.has_company_wide_permission(company_id,'statements.upload'))
    or (project_id is not null and private.has_project_permission(company_id,project_id,'documents.upload'))
  )
);

-- Monetary records reject impossible states even if a client bypasses the UI.
alter table public.approval_requests drop constraint if exists approval_requests_amount_positive;
alter table public.approval_requests add constraint approval_requests_amount_positive check (amount > 0);
alter table public.approval_requests drop constraint if exists approval_requests_approved_amount_range;
alter table public.approval_requests add constraint approval_requests_approved_amount_range check (approved_amount is null or (approved_amount >= 0 and approved_amount <= amount));
alter table public.approval_requests drop constraint if exists approval_requests_paid_amount_range;
alter table public.approval_requests add constraint approval_requests_paid_amount_range check (paid_amount is null or (paid_amount >= 0 and paid_amount <= coalesce(approved_amount,amount)));

alter table public.transfer_pairs drop constraint if exists transfer_pairs_amount_positive;
alter table public.transfer_pairs add constraint transfer_pairs_amount_positive check (amount > 0);
alter table public.transfer_pairs drop constraint if exists transfer_pairs_meaningful_route;
alter table public.transfer_pairs add constraint transfer_pairs_meaningful_route check (
  from_account_id is not null or from_project_id is not null
);
alter table public.transfer_pairs drop constraint if exists transfer_pairs_meaningful_destination;
alter table public.transfer_pairs add constraint transfer_pairs_meaningful_destination check (
  to_account_id is not null or to_project_id is not null
);
alter table public.transfer_pairs drop constraint if exists transfer_pairs_not_same_source_destination;
alter table public.transfer_pairs add constraint transfer_pairs_not_same_source_destination check (
  not (
    from_account_id is not null and from_account_id=to_account_id
    and coalesce(from_project_id,'00000000-0000-0000-0000-000000000000'::uuid)=coalesce(to_project_id,'00000000-0000-0000-0000-000000000000'::uuid)
  )
);

alter table public.inter_project_obligations drop constraint if exists inter_project_obligations_amount_positive;
alter table public.inter_project_obligations add constraint inter_project_obligations_amount_positive check (amount > 0);
alter table public.inter_project_obligations drop constraint if exists inter_project_obligations_distinct_projects;
alter table public.inter_project_obligations add constraint inter_project_obligations_distinct_projects check (creditor_project_id <> debtor_project_id);
alter table public.inter_project_obligations drop constraint if exists inter_project_obligations_settled_range;
alter table public.inter_project_obligations add constraint inter_project_obligations_settled_range check (settled_amount >= 0 and settled_amount <= amount);
