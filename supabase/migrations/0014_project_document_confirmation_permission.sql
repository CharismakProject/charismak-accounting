insert into public.permissions(code,description)
values('documents.confirm','Review project document extraction and apply confirmed commercial/accounting effect')
on conflict(code) do nothing;

insert into public.position_permissions(position_id,permission_id,scope)
select p.id,perm.id,
  case when p.interface_family='project_manager' then 'assigned_projects'::public.permission_scope else 'company_wide'::public.permission_scope end
from public.positions p cross join public.permissions perm
where perm.code='documents.confirm'
  and (
    p.interface_family='md_owner'
    or p.interface_family='project_director'
    or (p.interface_family='accountant_cfo' and p.name in ('Accountant / CFO','Finance Manager','Senior Accountant'))
  )
on conflict do nothing;

drop policy if exists project_document_applications_write on public.project_document_applications;
create policy project_document_applications_write on public.project_document_applications for all
using(private.is_company_owner(company_id) or private.has_permission(company_id,'documents.confirm'))
with check(private.is_company_owner(company_id) or private.has_permission(company_id,'documents.confirm'));
