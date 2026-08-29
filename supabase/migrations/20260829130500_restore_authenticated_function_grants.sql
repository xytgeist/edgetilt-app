-- Restore EXECUTE grants to authenticated and service_role across public schema functions.
--
-- Why: The Stage 2 anon-execute lockdown mistakenly revoked EXECUTE on helper functions,
-- formatters, text extractors, and trigger utilities from `authenticated`.
--
-- In Postgres, table triggers (such as `set_guide_skins_search_text()` on `guides`) and
-- RLS helper expressions run under the context of the invoking role (`authenticated`).
-- When helper functions lack `EXECUTE` for `authenticated`, valid CRUD operations
-- (like saving a guide in `/slot-guide-form`) fail with "permission denied for function".
--
-- Authenticated operations remain strictly protected by table RLS policies and by internal
-- role/admin assertions (`assert_caller_is_admin()`, `auth.uid()`, `is_staff`, etc.)
-- inside SECURITY DEFINER functions.

do $$
begin
  grant execute on all functions in schema public to authenticated;
  grant execute on all functions in schema public to service_role;

  alter default privileges in schema public grant execute on functions to authenticated;
  alter default privileges in schema public grant execute on functions to service_role;
end $$;
