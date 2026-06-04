-- Repair: feed_comments INSERT must emit activity_events (comment_on_post / reply_to_comment)
-- for in-app Alerts + web push. Comments were landing in feed_comments but no
-- activity_events row → no push (e.g. selena "Test noti" comment 2026-06-04).
-- Idempotent recreate of Phase H1 trigger + function.

create or replace function public.activity_events_on_feed_comment_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post_owner uuid;
  v_parent_owner uuid;
  v_primary_recipient uuid;
begin
  if new.hidden_at is not null then
    return new;
  end if;

  select cfp.user_id
    into v_post_owner
  from public.community_feed_posts cfp
  where cfp.id = new.post_id;

  if new.parent_id is null then
    v_primary_recipient := v_post_owner;
    perform public.activity_events_insert_safe(
      v_post_owner,
      new.user_id,
      'comment_on_post',
      new.post_id,
      new.id
    );
  else
    select fc.user_id
      into v_parent_owner
    from public.feed_comments fc
    where fc.id = new.parent_id;

    v_primary_recipient := v_parent_owner;
    perform public.activity_events_insert_safe(
      v_parent_owner,
      new.user_id,
      'reply_to_comment',
      new.post_id,
      new.id
    );
  end if;

  perform public.activity_events_emit_mentions(
    new.user_id,
    new.body,
    'mention_in_comment',
    new.post_id,
    new.id,
    v_primary_recipient
  );

  return new;
exception
  when others then
    raise warning 'activity_events_on_feed_comment_insert: %', sqlerrm;
    return new;
end;
$$;

comment on function public.activity_events_on_feed_comment_insert() is
  'After feed_comments INSERT: comment_on_post / reply_to_comment activity_events (+ mention_in_comment).';

drop trigger if exists trg_activity_events_feed_comment_insert on public.feed_comments;
create trigger trg_activity_events_feed_comment_insert
  after insert on public.feed_comments
  for each row
  execute function public.activity_events_on_feed_comment_insert();
