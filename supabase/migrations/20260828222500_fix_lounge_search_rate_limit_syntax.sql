-- Fix search rate limit syntax and grant permissions
create or replace function public.lounge_search_enforce_rate_limit()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_kind text := 'lounge_search';
  v_window interval := interval '5 minutes';
  v_limit integer := 30;
  v_window_start timestamptz;
  v_count integer;
  v_oldest_in_window timestamptz;
  v_retry_seconds integer;
  v_role text;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'LOUNGE_SEARCH_AUTH_REQUIRED';
  end if;

  select role into v_role from public.profiles where user_id = v_uid;
  if v_role in ('admin', 'moderator') then
    return;
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

    raise exception 'Rate limit exceeded: retry_in_seconds=% (max % searches per % minutes)',
      v_retry_seconds,
      v_limit,
      extract(epoch from v_window) / 60
      using errcode = 'P0001';
  end if;

  insert into public.rate_limit_events (user_id, kind, window_start)
  values (v_uid, v_kind, date_trunc('minute', now()));
end;
$$;
