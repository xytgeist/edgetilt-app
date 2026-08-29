-- Restore EXECUTE permissions to authenticated and service_role for all admin_ops functions.
-- All admin_ops functions internally enforce authentication and play_log_viewer_is_admin() checks.

do $$
declare
  r record;
begin
  for r in
    select p.proname,
           pg_get_function_identity_arguments(p.oid) as ident_args
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname like 'admin_ops%'
  loop
    -- Revoke from public and anon
    execute format(
      'revoke all on function public.%I(%s) from public, anon',
      r.proname,
      r.ident_args
    );
    -- Grant to authenticated and service_role
    execute format(
      'grant execute on function public.%I(%s) to authenticated, service_role',
      r.proname,
      r.ident_args
    );
  end loop;
end $$;
