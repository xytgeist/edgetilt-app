-- Persist Lounge first-run onboarding (welcome, hints, dock menu layout intro) per account.

BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS lounge_welcome_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS lounge_slots_menu_hint_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS lounge_fab_hint_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS lounge_dock_menu_layout_intro_seen_at timestamptz;

COMMENT ON COLUMN public.profiles.lounge_welcome_seen_at IS
  'Community Guidelines welcome modal acknowledged in Lounge.';
COMMENT ON COLUMN public.profiles.lounge_slots_menu_hint_seen_at IS
  'Slots menu helper overlay dismissed in Lounge.';
COMMENT ON COLUMN public.profiles.lounge_fab_hint_seen_at IS
  'Dock FAB helper overlay dismissed in Lounge.';
COMMENT ON COLUMN public.profiles.lounge_dock_menu_layout_intro_seen_at IS
  'Dock menu layout picker / FAB setup intro completed (Wheel vs Edge or FAB reposition).';

COMMIT;
