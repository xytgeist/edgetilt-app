-- Fix broken rate limiter if 20260518000000_rate_limit_staff_bypass.sql was applied:
-- `public.profiles` PK is `user_id`, not `id`. Wrong column caused post insert to fail with
-- "column id does not exist" and surface the Upload failed modal in Lounge.

create or replace function public.community_feed_posts_enforce_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_kind text := 'community_post_create';
  v_window interval := interval '10 minutes';
  v_limit integer := 30;
  v_window_start timestamptz;
  v_count integer;
  v_oldest_in_window timestamptz;
  v_retry_seconds integer;
  v_role text;
begin
  -- Service-role / SQL-editor writes may not carry auth context; skip limiter there.
  v_uid := auth.uid();
  if v_uid is null then
    return new;
  end if;

  -- Staff (admin / moderator) are exempt from the rate limit.
  select role into v_role from public.profiles where user_id = v_uid;
  if v_role in ('admin', 'moderator') then
    return new;
  end if;

  v_window_start := now() - v_window;

  select count(*)
  into v_count
  from public.rate_limit_events e
  where e.user_id = v_uid
    and e.kind = v_kind
    and e.created_at >= v_window_start;

  if v_count >= v_limit then
    select min(e.created_at)
    into v_oldest_in_window
    from public.rate_limit_events e
    where e.user_id = v_uid
      and e.kind = v_kind
      and e.created_at >= v_window_start;

    v_retry_seconds := greatest(
      1,
      ceil(extract(epoch from ((coalesce(v_oldest_in_window, now()) + v_window) - now())))::int
    );

    raise exception 'Rate limit exceeded: retry_in_seconds=% (max % posts per % minutes)', v_retry_seconds, v_limit, extract(epoch from v_window) / 60
      using errcode = 'P0001';
  end if;

  insert into public.rate_limit_events (user_id, kind, window_start)
  values (v_uid, v_kind, date_trunc('minute', now()));

  return new;
end;
$$;

-- Clear jail from failed attempts during the broken window.
delete from public.rate_limit_events where kind = 'community_post_create';
