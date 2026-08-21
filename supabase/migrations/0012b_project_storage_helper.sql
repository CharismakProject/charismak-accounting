-- Project document migrations use a project id encoded in the second storage
-- path segment: <company>/<project>/.... Keep the parser private and defensive.

create or replace function private.storage_project_id(object_name text)
returns uuid
language plpgsql
stable
security definer
set search_path=''
as $$
declare project_folder text;
begin
  project_folder := (storage.foldername(object_name))[2];
  if project_folder is null then return null; end if;
  return project_folder::uuid;
exception when others then return null;
end;
$$;

revoke all on function private.storage_project_id(text) from public,anon,authenticated;
