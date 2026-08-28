-- Stage 2 of the anon-execute lockdown: comprehensive ACL lockdown for all remaining RPCs.
--
-- Stage 1 secured state-changing definer writers, secrets, and HTTP endpoints.
-- Stage 2 addresses the remaining RPC attack surface across the entire database:
--
-- 1. Legitimate Public & Policy RPCs (KEPT for anon & authenticated):
--    - Guest claim preview & claim flows (poker_stable_guest_*, poker_tournament_swap_claim_*)
--    - Public referral & offer resolvers (resolve_affiliate_ref, get_creator_fan_offer)
--    - RLS policy and SQL view dependency functions (poker_stable_user_can_access_deal,
--      has_creator_fan_sub, lounge_viewer_is_subscriber_or_staff, etc.)
--
-- 2. Authenticated-Only RPCs (REVOKED from anon, KEPT for authenticated & service_role):
--    - Client-facing functions called from the frontend web/app (src/**)
--    - Functions with internal auth.uid(), auth.jwt(), is_admin, or is_staff guards
--    - Closing anon execute prevents unauthenticated access attempts at the API layer.
--
-- 3. Internal-Only Helpers (REVOKED from anon & authenticated, KEPT for service_role):
--    - Internal ledger math, triggers, periodic settle, cron drop jobs, formatting helpers
--    - Called only by Postgres triggers, pg_cron, or parent SECURITY DEFINER functions.

do $$
declare
  r record;
  v_policy_body text;
  v_view_body text;
  v_revoked_anon_auth_kept int := 0;
  v_revoked_internal_all int := 0;
  v_skipped_public int := 0;
begin
  -- Capture all RLS policy expressions
  select coalesce(string_agg(
           coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') || ' ' ||
           coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), ''), ' '), '')
    into v_policy_body
    from pg_policy pol;

  -- Capture all SQL view definitions
  select coalesce(string_agg(pg_get_viewdef(c.oid), ' '), '')
    into v_view_body
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('v', 'm');

  for r in
    select p.oid,
           p.proname,
           pg_get_function_identity_arguments(p.oid) as ident_args,
           pg_get_functiondef(p.oid) as func_def,
           p.prosecdef as is_secdef
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prokind = 'f'
       and has_function_privilege('anon', p.oid, 'execute')
       and pg_catalog.pg_get_function_result(p.oid) <> 'trigger'
  loop
    -- Check if function is a legitimate public/guest endpoint or needed by RLS policies/views
    if r.proname like '%guest%claim%'
       or r.proname like '%claim_preview%'
       or r.proname like '%claim_by_email%'
       or r.proname in ('resolve_affiliate_ref', 'get_creator_fan_offer')
       or v_policy_body ilike '%' || r.proname || '%'
       or v_view_body ilike '%' || r.proname || '%'
    then
      v_skipped_public := v_skipped_public + 1;
      -- Keep public access intact for legitimate guest / policy functions
      continue;
    end if;

    -- Always pin service_role first so Edge functions and system jobs never lose access
    execute format(
      'grant execute on function public.%I(%s) to service_role',
      r.proname, r.ident_args
    );

    -- Revoke from public
    execute format(
      'revoke all on function public.%I(%s) from public',
      r.proname, r.ident_args
    );

    -- Check if function is client-callable or has caller guards (auth.uid, is_admin, etc.)
    if r.func_def ilike '%auth.uid()%'
       or r.func_def ilike '%auth.jwt()%'
       or r.func_def ilike '%auth.role()%'
       or r.func_def ilike '%assert_caller_is_admin%'
       or r.func_def ilike '%is_admin%'
       or r.func_def ilike '%is_staff%'
       or r.proname in (
         'chat_rooms_for_user',
         'chat_archived_rooms_for_user',
         'get_platform_sub_room_id',
         'admin_lounge_bot_ops_snapshot',
         'admin_affiliate_portal_snapshot',
         'lounge_search',
         'lounge_search_cashtag_posts',
         'lounge_search_hashtag_posts'
       )
    then
      -- Category 2: Keep for authenticated users, revoke from anon
      execute format(
        'grant execute on function public.%I(%s) to authenticated',
        r.proname, r.ident_args
      );
      execute format(
        'revoke all on function public.%I(%s) from anon',
        r.proname, r.ident_args
      );
      v_revoked_anon_auth_kept := v_revoked_anon_auth_kept + 1;
    else
      -- Category 3: Internal only, revoke from both anon and authenticated
      execute format(
        'revoke all on function public.%I(%s) from anon',
        r.proname, r.ident_args
      );
      execute format(
        'revoke all on function public.%I(%s) from authenticated',
        r.proname, r.ident_args
      );
      v_revoked_internal_all := v_revoked_internal_all + 1;
    end if;
  end loop;

  raise notice 'Stage 2 Anon-Execute Lockdown Complete:';
  raise notice '  - % functions revoked from anon (authenticated retained)', v_revoked_anon_auth_kept;
  raise notice '  - % internal functions fully locked down (service_role only)', v_revoked_internal_all;
  raise notice '  - % public/guest/policy functions preserved', v_skipped_public;
end $$;
