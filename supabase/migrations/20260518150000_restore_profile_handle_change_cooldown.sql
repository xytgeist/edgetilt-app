-- Restore 7-day handle change cooldown (one handle change per rolling week).

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
  if old.handle_changed_at is not null
     and old.handle_changed_at > (timezone('utc', now()) - interval '7 days') then
    raise exception 'PROFILE_HANDLE_CHANGE_COOLDOWN'
      using message = 'You can only change your handle once every 7 days. Try again later.';
  end if;
  new.handle_changed_at := timezone('utc', now());
  return new;
end;
$$;

comment on column public.profiles.handle_changed_at is
  'When the user last changed `handle`; used to enforce at most one handle change per 7 days.';
