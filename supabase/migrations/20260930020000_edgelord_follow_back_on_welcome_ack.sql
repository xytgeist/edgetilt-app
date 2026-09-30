-- @edgelord follows a new member only after they tap "Got it" on the Lounge welcome /
-- Community Guidelines screen (profiles.lounge_welcome_seen_at goes null -> set).
-- Signup still makes the new member follow @edgelord.

create or replace function public.profiles_auto_follow_edgelord_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_edgelord_id uuid;
begin
  select p.user_id
  into v_edgelord_id
  from public.profiles p
  where lower(trim(p.handle)) = 'edgelord'
  limit 1;

  if v_edgelord_id is null then
    raise warning 'profiles_auto_follow_edgelord_after_insert: no profile with handle edgelord';
    return new;
  end if;

  if new.user_id = v_edgelord_id then
    return new;
  end if;

  insert into public.profile_follows (follower_id, following_id)
  values (new.user_id, v_edgelord_id)
  on conflict do nothing;

  return new;
exception
  when others then
    raise warning 'profiles_auto_follow_edgelord_after_insert: %', sqlerrm;
    return new;
end;
$$;

comment on function public.profiles_auto_follow_edgelord_after_insert() is
  'AFTER INSERT on profiles: new user follows @edgelord. @edgelord follows back on welcome ack (profiles_edgelord_follow_back_on_welcome_ack). Never blocks profile insert.';

create or replace function public.profiles_edgelord_follow_back_on_welcome_ack()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_edgelord_id uuid;
begin
  if old.lounge_welcome_seen_at is not null or new.lounge_welcome_seen_at is null then
    return new;
  end if;

  select p.user_id
  into v_edgelord_id
  from public.profiles p
  where lower(trim(p.handle)) = 'edgelord'
  limit 1;

  if v_edgelord_id is null or new.user_id = v_edgelord_id then
    return new;
  end if;

  insert into public.profile_follows (follower_id, following_id)
  values (v_edgelord_id, new.user_id)
  on conflict do nothing;

  return new;
exception
  when others then
    raise warning 'profiles_edgelord_follow_back_on_welcome_ack: %', sqlerrm;
    return new;
end;
$$;

drop trigger if exists profiles_edgelord_follow_back_on_welcome_ack on public.profiles;
create trigger profiles_edgelord_follow_back_on_welcome_ack
  after update of lounge_welcome_seen_at on public.profiles
  for each row
  execute function public.profiles_edgelord_follow_back_on_welcome_ack();

comment on function public.profiles_edgelord_follow_back_on_welcome_ack() is
  'AFTER UPDATE of lounge_welcome_seen_at (null -> set, i.e. first "Got it" on the Lounge welcome): @edgelord follows the member. Never blocks the update.';
