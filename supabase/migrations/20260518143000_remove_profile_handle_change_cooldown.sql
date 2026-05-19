-- Remove 7-day handle change cooldown. Keep `handle_changed_at` stamped on handle updates (audit only).

create or replace function public.profiles_enforce_handle_change_cooldown()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;
  if lower(trim(coalesce(old.handle, ''))) is not distinct from lower(trim(coalesce(new.handle, ''))) then
    return new;
  end if;
  new.handle_changed_at := timezone('utc', now());
  return new;
end;
$$;

comment on column public.profiles.handle_changed_at is
  'When the user last changed `handle` (audit; no cooldown enforced).';
