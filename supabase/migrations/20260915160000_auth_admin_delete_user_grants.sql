-- GoTrue admin.deleteUser runs as supabase_auth_admin, then DELETE FROM auth.users.
-- CASCADE / SET NULL into public.* needs table GRANT plus an RLS policy (this role
-- does not have BYPASSRLS). Postgres superuser deletes succeed; Auth returns
-- "Database error deleting user" without these privileges.
-- Does not change any foreign-key actions.

DO $$
DECLARE
  r record;
  pol text;
BEGIN
  EXECUTE 'GRANT USAGE ON SCHEMA public TO supabase_auth_admin';

  FOR r IN
    SELECT n.nspname, c.relname, c.relrowsecurity
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
  LOOP
    BEGIN
      EXECUTE format(
        'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE %I.%I TO supabase_auth_admin',
        r.nspname,
        r.relname
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'grant skipped %.%: %', r.nspname, r.relname, SQLERRM;
    END;

    IF r.relrowsecurity THEN
      pol := 'et_auth_admin_' || substr(md5(r.nspname || '.' || r.relname), 1, 20);
      BEGIN
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', pol, r.nspname, r.relname);
        EXECUTE format(
          'CREATE POLICY %I ON %I.%I FOR ALL TO supabase_auth_admin USING (true) WITH CHECK (true)',
          pol,
          r.nspname,
          r.relname
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'policy skipped %.%: %', r.nspname, r.relname, SQLERRM;
      END;
    END IF;
  END LOOP;

  ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO supabase_auth_admin;
END $$;
