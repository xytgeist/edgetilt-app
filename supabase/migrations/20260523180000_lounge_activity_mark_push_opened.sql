-- Mark activity notification(s) read when the user opens the app from a Lounge push tap.

create or replace function public.lounge_activity_mark_push_opened(
  p_activity_event_id uuid default null,
  p_batch_id uuid default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count bigint := 0;
  v_uid uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    return 0;
  end if;

  if p_batch_id is not null then
    update public.activity_events ae
    set read_at = now()
    where ae.recipient_user_id = v_uid
      and ae.read_at is null
      and ae.id in (
        select bte.activity_event_id
        from public.activity_push_batch_events bte
        where bte.batch_id = p_batch_id
      );

    get diagnostics v_count = row_count;
    return v_count;
  end if;

  if p_activity_event_id is not null then
    update public.activity_events
    set read_at = now()
    where recipient_user_id = v_uid
      and read_at is null
      and id = p_activity_event_id;

    get diagnostics v_count = row_count;
    return v_count;
  end if;

  return 0;
end;
$$;

grant execute on function public.lounge_activity_mark_push_opened(uuid, uuid) to authenticated;
