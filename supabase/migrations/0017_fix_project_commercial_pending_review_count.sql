create or replace view public.project_commercial_positions with (security_invoker=true) as
select
  p.id as project_id,
  p.company_id,
  p.project_code,
  p.name as project_name,
  coalesce(sum(a.amount) filter (where a.commercial_role='base_scope'),0)::numeric as base_scope,
  coalesce(sum(a.amount) filter (where a.commercial_role='additional_scope'),0)::numeric as additional_scope,
  coalesce(sum(a.amount) filter (where a.commercial_role='variation'),0)::numeric as variations,
  coalesce(sum(a.amount) filter (where a.commercial_role in ('base_scope','additional_scope','variation')),0)::numeric as identified_commercial_value,
  coalesce(sum(a.amount) filter (where a.billing_role='client_invoice'),0)::numeric as documented_client_invoices,
  coalesce(sum(a.amount) filter (where a.commercial_role in ('base_scope','additional_scope','variation') and a.approval_status='approved'),0)::numeric as approved_commercial_value,
  (select count(*)::integer from public.project_document_intelligence i where i.project_id=p.id and i.review_status='pending') as documents_needing_review
from public.projects p
left join public.project_document_applications a on a.project_id=p.id
group by p.id,p.company_id,p.project_code,p.name;

grant select on public.project_commercial_positions to authenticated;
