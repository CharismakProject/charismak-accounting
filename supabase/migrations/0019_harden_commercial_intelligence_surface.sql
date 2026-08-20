alter view public.project_commercial_rollups set (security_invoker = true);
revoke execute on function public.refresh_project_commercial_position(uuid) from anon;
revoke execute on function public.refresh_project_commercial_position(uuid) from public;
grant execute on function public.refresh_project_commercial_position(uuid) to authenticated;
