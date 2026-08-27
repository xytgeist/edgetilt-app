-- Stage 1 of the anon-execute lockdown.
--
-- Background: `revoke all on function ... from public` does not remove anon's
-- EXECUTE bit on Supabase, because anon/authenticated get explicit grants from
-- ALTER DEFAULT PRIVILEGES. Every SECURITY DEFINER helper we ever shipped is
-- therefore callable with the public anon key. Verified on test: a logged-out
-- anon key got 200s out of admin_ops_monitor_freemium_funnel and
-- admin_ops_monitor_starter_pool_stats. Verified by definition on production:
-- poker_stable_backer_adjust_balance(uuid, numeric) writes a bankroll balance
-- with no caller check at all, and every invoke_* wrapper pulls a service_role
-- key out of the vault to fire an Edge function.
--
-- This stage covers the reachable, unguarded, state-changing surface: functions
-- that are SECURITY DEFINER, anon-executable, callable over PostgREST (not
-- triggers), have no caller guard, and either write rows, read vault secrets, or
-- call net.http_post.
--
-- Safe because these are internal helpers and cron wrappers: pg_cron runs them
-- as postgres, Edge/scripts run them as service_role, and parent SECURITY
-- DEFINER RPCs call them as the function owner. None of those paths consult the
-- anon or authenticated ACL.
--
-- Deliberately NOT touched here:
--   * read-only helpers ... RLS policies and views evaluate some of them as the
--     querying role, so revoking would break row access.
--   * guest claim flows (%guest%claim%) ... those serve logged-out users by design.
--   * functions with a caller guard (auth.uid/jwt/role, *is_admin*, *is_staff*).
--   * client-called writers ... they keep authenticated and lose only anon.
--
-- The target set is computed live rather than hardcoded, because test and
-- production have drifted on which helpers exist.

do $$
declare
  r record;
  v_client_called text[] := array[
    -- called directly from the browser (src/features/**), so authenticated must keep EXECUTE
    'poker_stable_detach_stake_sessions_to_personal',
    'poker_tournament_swap_try_settle'
  ];
  v_policy_body text;
  v_view_body text;
  v_revoked_anon int := 0;
  v_revoked_auth int := 0;
begin
  select coalesce(string_agg(
           coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') || ' ' ||
           coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), ''), ' '), '')
    into v_policy_body
    from pg_policy pol;

  select coalesce(string_agg(pg_get_viewdef(c.oid), ' '), '')
    into v_view_body
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('v', 'm');

  for r in
    select p.oid,
           p.proname,
           pg_get_function_identity_arguments(p.oid) as ident_args,
           has_function_privilege('authenticated', p.oid, 'execute') as auth_exec
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prokind = 'f'
       and p.prosecdef
       and has_function_privilege('anon', p.oid, 'execute')
       and pg_catalog.pg_get_function_result(p.oid) <> 'trigger'
       and p.proname not like '%guest%claim%'
       -- no caller guard
       and pg_get_functiondef(p.oid) not ilike '%auth.uid()%'
       and pg_get_functiondef(p.oid) not ilike '%auth.jwt()%'
       and pg_get_functiondef(p.oid) not ilike '%auth.role()%'
       and pg_get_functiondef(p.oid) not ilike '%assert_caller_is_admin%'
       and pg_get_functiondef(p.oid) not ilike '%is_admin%'
       and pg_get_functiondef(p.oid) not ilike '%is_staff%'
       -- state-changing or secret-reading
       and (pg_get_functiondef(p.oid) ilike '%net.http_post%'
            or pg_get_functiondef(p.oid) ilike '%decrypted_secret%'
            or pg_get_functiondef(p.oid) ~* '\m(insert|update|delete)\M')
       -- never revoke something a policy or view leans on
       and v_policy_body not ilike '%' || p.proname || '%'
       and v_view_body not ilike '%' || p.proname || '%'
  loop
    -- Order matters. Much of this surface is executable by anon only because
    -- EXECUTE was granted to PUBLIC, and `revoke ... from anon` is a no-op
    -- against a PUBLIC grant (the same shape as the bug this migration fixes).
    -- So: pin service_role explicitly first, then drop PUBLIC, then drop the
    -- per-role grants. Without the pin, dropping PUBLIC could take Edge
    -- functions and scripts down with it.
    execute format(
      'grant execute on function public.%I(%s) to service_role',
      r.proname, r.ident_args
    );
    execute format(
      'revoke all on function public.%I(%s) from public',
      r.proname, r.ident_args
    );
    execute format(
      'revoke all on function public.%I(%s) from anon',
      r.proname, r.ident_args
    );
    v_revoked_anon := v_revoked_anon + 1;

    if r.proname = any (v_client_called) then
      -- browser calls these as authenticated, so re-assert that grant after the
      -- PUBLIC revoke above
      execute format(
        'grant execute on function public.%I(%s) to authenticated',
        r.proname, r.ident_args
      );
    else
      execute format(
        'revoke all on function public.%I(%s) from authenticated',
        r.proname, r.ident_args
      );
      if r.auth_exec then
        v_revoked_auth := v_revoked_auth + 1;
      end if;
    end if;
  end loop;

  -- admin_ops_* internal helpers. These are read-only so they fall outside the
  -- writer sweep above, but two of them were confirmed returning live business
  -- metrics to a logged-out anon key on test (freemium funnel, starter pool
  -- stats) because they carry no guard of their own. The browser only ever calls
  -- admin_ops_monitor_snapshot / admin_ops_monitor_live_pulse, both SECURITY
  -- DEFINER, so they reach these helpers as the owner regardless of role grants.
  for r in
    select p.proname, pg_get_function_identity_arguments(p.oid) as ident_args
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prokind = 'f'
       and p.proname like 'admin_ops_%'
       and p.proname not in ('admin_ops_monitor_snapshot', 'admin_ops_monitor_live_pulse')
       and pg_catalog.pg_get_function_result(p.oid) <> 'trigger'
  loop
    execute format('grant execute on function public.%I(%s) to service_role', r.proname, r.ident_args);
    execute format('revoke all on function public.%I(%s) from public', r.proname, r.ident_args);
    execute format('revoke all on function public.%I(%s) from anon', r.proname, r.ident_args);
    execute format('revoke all on function public.%I(%s) from authenticated', r.proname, r.ident_args);
  end loop;

  raise notice 'anon-execute lockdown: revoked anon on % function(s), authenticated on % function(s)',
    v_revoked_anon, v_revoked_auth;
end
$$;
