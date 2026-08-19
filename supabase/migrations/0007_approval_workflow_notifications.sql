create or replace function public.notify_approval_workflow()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_priority text;
  v_title text;
  v_body text;
begin
  v_priority := case when new.urgency::text in ('urgent','emergency') or new.status::text = 'emergency_retrospective' then 'high' else 'normal' end;

  if tg_op = 'INSERT' then
    v_title := case when new.status::text = 'emergency_retrospective' then 'Emergency request needs review' else 'New approval request' end;
    v_body := coalesce(new.description,'Approval request') || case when coalesce(new.amount,0) > 0 then ' · ₦' || to_char(new.amount,'FM999,999,999,990.00') else '' end;

    insert into public.notifications(company_id,user_id,notification_type,title,body,href,entity_type,entity_id,priority)
    select distinct new.company_id, cm.user_id, 'approval_requested', v_title, v_body, '/approvals', 'approval_request', new.id, v_priority
    from public.company_memberships cm
    left join public.membership_positions mp on mp.membership_id = cm.id
    left join public.positions p on p.id = mp.position_id
    where cm.company_id = new.company_id
      and cm.status::text = 'active'
      and (cm.is_owner = true or p.interface_family::text in ('accountant_cfo','project_director'));

    return new;
  end if;

  if tg_op = 'UPDATE' and old.status is distinct from new.status then
    v_title := case new.status::text
      when 'approved' then 'Request approved'
      when 'partially_approved' then 'Request partly approved'
      when 'rejected' then 'Request rejected'
      when 'returned' then 'Request returned for review'
      when 'paid' then 'Approved request paid'
      else 'Request status updated'
    end;
    v_body := coalesce(new.description,'Approval request') || ' · ' || replace(new.status::text,'_',' ');

    insert into public.notifications(company_id,user_id,notification_type,title,body,href,entity_type,entity_id,priority)
    values(new.company_id,new.requested_by,'approval_status_changed',v_title,v_body,'/approvals','approval_request',new.id,
      case when new.status::text in ('rejected','returned') then 'high' else 'normal' end);
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_notify_approval_workflow on public.approval_requests;
create trigger trg_notify_approval_workflow
after insert or update of status on public.approval_requests
for each row execute function public.notify_approval_workflow();
