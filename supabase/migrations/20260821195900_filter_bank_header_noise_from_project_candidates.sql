create or replace function private.filter_statement_project_candidate_noise()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if lower(coalesce(new.evidence->>'source',''))='user_keyword' then return new; end if;
  if upper(trim(coalesce(new.suggested_name,''))) = any(array['CBN','NDIC','MFB','DETAILS','CREDITS','DEBITS']) then return null; end if;
  return new;
end;
$$;

drop trigger if exists statement_project_candidate_noise_guard on public.statement_project_candidates;
create trigger statement_project_candidate_noise_guard
before insert or update on public.statement_project_candidates
for each row execute function private.filter_statement_project_candidate_noise();

delete from public.statement_project_candidates
where status='suggested'
  and lower(coalesce(evidence->>'source',''))<>'user_keyword'
  and upper(trim(coalesce(suggested_name,''))) = any(array['CBN','NDIC','MFB','DETAILS','CREDITS','DEBITS']);
