-- DM push: first message in a quiet period → immediate Edge push; follow-ups within 60s → batched.

begin;

create or replace function public.activity_push_schedule_batch(p_event public.activity_events)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch_key text;
  v_batch_id uuid;
  v_debounce interval := interval '10 seconds';
begin
  if p_event.event_type not in ('like', 'bookmark') then
    return null;
  end if;

  v_batch_key :=
    p_event.event_type || ':' ||
    coalesce(p_event.post_id::text, '') || ':' ||
    coalesce(p_event.comment_id::text, '');

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
      batch_key,
      scheduled_send_at
    )
    values (
      p_event.recipient_user_id,
      p_event.event_type,
      p_event.post_id,
      p_event.comment_id,
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
  'Like/bookmark: batch per post/comment (10s debounce). chat_dm uses activity_push_enqueue_chat_dm.';

create or replace function public.activity_push_enqueue_chat_dm(p_event public.activity_events)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch_key text;
  v_batch_id uuid;
  v_debounce interval := interval '60 seconds';
  v_recent_sent boolean;
begin
  if p_event.chat_room_id is null then
    return;
  end if;

  v_batch_key := 'chat_dm:' || p_event.chat_room_id::text;

  -- Open debounced batch: extend timer and wait-path Edge invoke.
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

    insert into public.activity_push_batch_events (batch_id, activity_event_id)
    values (v_batch_id, p_event.id)
    on conflict do nothing;

    perform public.activity_push_invoke_lounge_edge(
      jsonb_build_object('batchId', v_batch_id)
    );
    return;
  end if;

  -- Within 60s of a prior push in this room → start/extend debounced batch.
  select exists (
    select 1
    from public.activity_push_batches b
    where b.recipient_user_id = p_event.recipient_user_id
      and b.batch_key = v_batch_key
      and b.sent_at is not null
      and b.sent_at > now() - v_debounce
  ) into v_recent_sent;

  if v_recent_sent then
    insert into public.activity_push_batches (
      recipient_user_id,
      event_type,
      chat_room_id,
      batch_key,
      scheduled_send_at
    )
    values (
      p_event.recipient_user_id,
      'chat_dm',
      p_event.chat_room_id,
      v_batch_key,
      now() + v_debounce
    )
    returning id into v_batch_id;

    insert into public.activity_push_batch_events (batch_id, activity_event_id)
    values (v_batch_id, p_event.id)
    on conflict do nothing;

    perform public.activity_push_invoke_lounge_edge(
      jsonb_build_object('batchId', v_batch_id)
    );
    return;
  end if;

  -- First message after quiet period: immediate push, then record burst window.
  perform public.activity_push_invoke_lounge_edge(
    jsonb_build_object('activityEventId', p_event.id)
  );

  insert into public.activity_push_batches (
    recipient_user_id,
    event_type,
    chat_room_id,
    batch_key,
    scheduled_send_at,
    sent_at
  )
  values (
    p_event.recipient_user_id,
    'chat_dm',
    p_event.chat_room_id,
    v_batch_key,
    now(),
    now()
  )
  returning id into v_batch_id;

  insert into public.activity_push_batch_events (batch_id, activity_event_id)
  values (v_batch_id, p_event.id)
  on conflict do nothing;
exception
  when others then
    raise warning 'activity_push_enqueue_chat_dm: %', sqlerrm;
end;
$$;

comment on function public.activity_push_enqueue_chat_dm(public.activity_events) is
  'chat_dm: first message in quiet period → immediate push; follow-ups within 60s → debounced batch per room.';

create or replace function public.activity_events_enqueue_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.event_type in ('like', 'bookmark') then
    perform public.activity_push_schedule_batch(new);
  elsif new.event_type = 'chat_dm' then
    perform public.activity_push_enqueue_chat_dm(new);
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
  'Like/bookmark → 10s batch (cron flush). chat_dm → first immediate, then 60s batch. Other types → immediate Edge push.';

commit;
