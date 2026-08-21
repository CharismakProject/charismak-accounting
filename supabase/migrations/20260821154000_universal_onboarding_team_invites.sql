alter table public.companies add column if not exists onboarding_completed boolean not null default false;
alter table public.company_invites add column if not exists project_ids uuid[] not null default '{}'::uuid[];
alter table public.company_invites add column if not exists can_view_cost boolean not null default true;
alter table public.company_invites add column if not exists can_request boolean not null default true;
alter table public.company_invites add column if not exists can_approve boolean not null default false;

create or replace function public.owner_create_team_invite(target_company uuid,target_email text,target_position_code text,target_project_ids uuid[] default '{}'::uuid[],view_cost boolean default true,can_request boolean default true,can_approve boolean default false)
returns uuid language plpgsql security definer set search_path=''
as $$
declare v_id uuid;v_email text:=lower(trim(coalesce(target_email,'')));v_bad integer;
begin
  if not private.is_company_owner(target_company) then raise exception 'Owner access required'; end if;
  if v_email='' or position('@' in v_email)=0 then raise exception 'Valid email required'; end if;
  if not exists(select 1 from public.positions p where p.code=target_position_code and (p.is_system_template=true or p.company_id=target_company)) then raise exception 'Position not found'; end if;
  select count(*) into v_bad from unnest(coalesce(target_project_ids,'{}'::uuid[])) x where not exists(select 1 from public.projects p where p.id=x and p.company_id=target_company);
  if v_bad>0 then raise exception 'One or more selected projects do not belong to this company'; end if;
  if exists(select 1 from public.company_memberships cm join auth.users u on u.id=cm.user_id where cm.company_id=target_company and cm.status='active' and lower(coalesce(u.email,''))=v_email) then raise exception 'This email is already an active company member'; end if;
  insert into public.company_invites(company_id,email,position_code,is_owner,invited_by,project_ids,can_view_cost,can_request,can_approve)
  values(target_company,v_email,target_position_code,false,auth.uid(),coalesce(target_project_ids,'{}'::uuid[]),view_cost,can_request,can_approve)
  on conflict(company_id,email) do update set position_code=excluded.position_code,invited_by=auth.uid(),project_ids=excluded.project_ids,can_view_cost=excluded.can_view_cost,can_request=excluded.can_request,can_approve=excluded.can_approve,accepted_at=null returning id into v_id;
  insert into public.audit_log(company_id,actor_user_id,actor_email,action,entity_type,entity_id,context)
  values(target_company,auth.uid(),(select email from auth.users where id=auth.uid()),'team.invite.created','company_invite',v_id,jsonb_build_object('email',v_email,'position_code',target_position_code,'project_ids',coalesce(target_project_ids,'{}'::uuid[])));
  return v_id;
end;$$;
grant execute on function public.owner_create_team_invite(uuid,text,text,uuid[],boolean,boolean,boolean) to authenticated;

create or replace function public.accept_pending_company_invite()
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_user uuid:=auth.uid();v_email text;v_invite public.company_invites%rowtype;v_membership uuid;v_position uuid;v_project uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  select lower(coalesce(email,'')) into v_email from auth.users where id=v_user;
  select * into v_invite from public.company_invites where lower(email)=v_email and accepted_at is null order by created_at asc limit 1;
  if v_invite.id is null then return jsonb_build_object('accepted',false,'reason','no_pending_invite'); end if;
  insert into public.company_memberships(company_id,user_id,status,is_owner) values(v_invite.company_id,v_user,'active',false)
  on conflict(company_id,user_id) do update set status='active',is_owner=false returning id into v_membership;
  select id into v_position from public.positions where code=v_invite.position_code and (is_system_template=true or company_id=v_invite.company_id) order by is_system_template desc,created_at asc limit 1;
  if v_position is not null then
    update public.membership_positions set is_primary=false where membership_id=v_membership;
    insert into public.membership_positions(membership_id,position_id,is_primary) values(v_membership,v_position,true) on conflict(membership_id,position_id) do update set is_primary=true;
  end if;
  foreach v_project in array coalesce(v_invite.project_ids,'{}'::uuid[]) loop
    insert into public.project_assignments(company_id,project_id,membership_id,assignment_role,can_view_cost,can_request,can_approve,created_by)
    values(v_invite.company_id,v_project,v_membership,v_invite.position_code,v_invite.can_view_cost,v_invite.can_request,v_invite.can_approve,v_invite.invited_by) on conflict do nothing;
  end loop;
  update public.company_invites set accepted_at=now() where id=v_invite.id;
  insert into public.audit_log(company_id,actor_user_id,actor_email,action,entity_type,entity_id,context)
  values(v_invite.company_id,v_user,v_email,'team.invite.accepted','company_membership',v_membership,jsonb_build_object('invite_id',v_invite.id,'position_code',v_invite.position_code));
  return jsonb_build_object('accepted',true,'company_id',v_invite.company_id,'membership_id',v_membership,'position_code',v_invite.position_code);
end;$$;
grant execute on function public.accept_pending_company_invite() to authenticated;

create or replace function public.complete_company_onboarding(target_company uuid)
returns boolean language plpgsql security definer set search_path=''
as $$
begin
  if not private.is_company_owner(target_company) then raise exception 'Owner access required'; end if;
  update public.companies set onboarding_completed=true,updated_at=now() where id=target_company;
  insert into public.audit_log(company_id,actor_user_id,actor_email,action,entity_type,entity_id,context)
  values(target_company,auth.uid(),(select email from auth.users where id=auth.uid()),'onboarding.completed','company',target_company,'{}'::jsonb);
  return true;
end;$$;
grant execute on function public.complete_company_onboarding(uuid) to authenticated;

create or replace function public.accept_company_invite_on_signup()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_invite public.company_invites%rowtype;v_membership_id uuid;v_position_id uuid;v_project uuid;
begin
  select ci.* into v_invite from public.company_invites ci where lower(ci.email)=lower(coalesce(new.email,'')) and ci.accepted_at is null order by ci.created_at asc limit 1;
  if v_invite.id is null then return new; end if;
  insert into public.company_memberships(company_id,user_id,status,is_owner) values(v_invite.company_id,new.id,'active',false)
  on conflict(company_id,user_id) do update set status='active',is_owner=false returning id into v_membership_id;
  select p.id into v_position_id from public.positions p where p.code=v_invite.position_code and (p.is_system_template=true or p.company_id=v_invite.company_id) order by p.is_system_template desc,p.created_at asc limit 1;
  if v_position_id is not null then insert into public.membership_positions(membership_id,position_id,is_primary) values(v_membership_id,v_position_id,true) on conflict(membership_id,position_id) do update set is_primary=true; end if;
  foreach v_project in array coalesce(v_invite.project_ids,'{}'::uuid[]) loop
    insert into public.project_assignments(company_id,project_id,membership_id,assignment_role,can_view_cost,can_request,can_approve,created_by)
    values(v_invite.company_id,v_project,v_membership_id,v_invite.position_code,v_invite.can_view_cost,v_invite.can_request,v_invite.can_approve,v_invite.invited_by) on conflict do nothing;
  end loop;
  update public.company_invites set accepted_at=now() where id=v_invite.id;
  return new;
end;$$;
