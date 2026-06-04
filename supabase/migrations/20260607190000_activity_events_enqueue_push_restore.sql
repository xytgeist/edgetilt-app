-- Repair activity_events_enqueue_push after 20260603190000 accidentally replaced
-- activity_push_invoke_lounge_edge (vault + apikey) with net.http_post using
-- current_setting('app.supabase_url') / app.lounge_activity_push_secret — unset on
-- Supabase, so comment/reply/mention/follow/repost/play_log/chat_group_invite pushes
-- never reached the Edge function. chat_dm path was unaffected (uses enqueue_chat_dm).

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
  'Like/bookmark → 10s batch (cron flush). chat_dm → first immediate, then 60s batch. Other types → immediate Edge push via vault secrets.';
