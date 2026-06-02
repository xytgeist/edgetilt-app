-- chat_dm batches were scheduled in SQL but only flushed by pg_cron — if cron is slow/missing,
-- DMs never push. After scheduling, invoke lounge-send-activity-push with batchId; Edge waits
-- for scheduled_send_at (60s debounce) then sends. pg_cron flush remains a backup.

begin;

-- void → uuid return type requires drop first (CREATE OR REPLACE cannot change return type).
drop function if exists public.activity_push_schedule_batch(public.activity_events);

create or replace function public.activity_push_schedule_batch(p_event public.activity_events)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch_key text;
  v_batch_id uuid;
  v_debounce interval;
begin
  if p_event.event_type not in ('like', 'bookmark', 'chat_dm') then
    return null;
  end if;

  v_debounce := case
    when p_event.event_type = 'chat_dm' then interval '60 seconds'
    else interval '10 seconds'
  end;

  if p_event.event_type = 'chat_dm' then
    if p_event.chat_room_id is null then
      return null;
    end if;
    v_batch_key := 'chat_dm:' || p_event.chat_room_id::text;
  else
    v_batch_key :=
      p_event.event_type || ':' ||
      coalesce(p_event.post_id::text, '') || ':' ||
      coalesce(p_event.comment_id::text, '');
  end if;

  select b.id
  into v_batch_id
  from public.activity_push_batches b
  where b.recipient_user_id = p_event.recipient_user_id
    and b.batch_key = v_batch_key
    and b.sent_at is null
  for update;

  if v_batch_id is not null then
    update public.activity_push_batches
    set scheduled_send_at = now() + v_debounce,
        updated_at = now()
    where id = v_batch_id;
  else
    insert into public.activity_push_batches (
      recipient_user_id,
      event_type,
      post_id,
      comment_id,
      chat_room_id,
      batch_key,
      scheduled_send_at
    )
    values (
      p_event.recipient_user_id,
      p_event.event_type,
      p_event.post_id,
      p_event.comment_id,
      case when p_event.event_type = 'chat_dm' then p_event.chat_room_id else null end,
      v_batch_key,
      now() + v_debounce
    )
    returning id into v_batch_id;
  end if;

  insert into public.activity_push_batch_events (batch_id, activity_event_id)
  values (v_batch_id, p_event.id)
  on conflict do nothing;

  return v_batch_id;
exception
  when others then
    raise warning 'activity_push_schedule_batch: %', sqlerrm;
    return null;
end;
$$;

comment on function public.activity_push_schedule_batch(public.activity_events) is
  'Like/bookmark: batch per post/comment (10s debounce). chat_dm: batch per room (60s debounce). Returns batch id.';

create or replace function public.activity_events_enqueue_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch_id uuid;
begin
  if new.event_type in ('like', 'bookmark') then
    perform public.activity_push_schedule_batch(new);
  elsif new.event_type = 'chat_dm' then
    v_batch_id := public.activity_push_schedule_batch(new);
    if v_batch_id is not null then
      perform public.activity_push_invoke_lounge_edge(
        jsonb_build_object('batchId', v_batch_id)
      );
    end if;
  else
    perform public.activity_push_invoke_lounge_edge(
      jsonb_build_object('activityEventId', new.id)
    );
  end if;
  return new;
exception
  when others then
    raise warning 'activity_events_enqueue_push: %', sqlerrm;
    return new;
end;
$$;

comment on function public.activity_events_enqueue_push() is
  'Like/bookmark → 10s batch (cron flush). chat_dm → 60s batch + immediate Edge invoke (Edge waits). Other types → immediate Edge push.';

commit;
