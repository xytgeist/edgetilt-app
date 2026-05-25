-- Auto-stamp updated_at on every UPDATE to guides and machines.
-- Apply on both test and prod Supabase projects.
--
-- Run once in the SQL editor:
--   \i supabase/guides_updated_at_trigger.sql
-- or paste the contents directly.

-- ── shared trigger function ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ── guides ────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_guides_updated_at ON public.guides;
CREATE TRIGGER trg_guides_updated_at
  BEFORE UPDATE ON public.guides
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ── machines ──────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_machines_updated_at ON public.machines;
CREATE TRIGGER trg_machines_updated_at
  BEFORE UPDATE ON public.machines
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();
