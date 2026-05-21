-- Phase H1 extension — like activity notifications.
-- Apply on test after prior activity_events migrations.

alter table public.activity_events
  drop constraint if exists activity_events_event_type_check;

alter table public.activity_events
  add constraint activity_events_event_type_check
  check (
    event_type in (
      'comment_on_post',
      'reply_to_comment',
      'mention_in_post',
      'mention_in_comment',
      'follow',
      'repost',
      'quote_repost',
      'bookmark',
      'like'
    )
  );

create or replace function public.activity_events_on_post_like_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  select cfp.user_id
    into v_owner
  from public.community_feed_posts cfp
  where cfp.id = new.post_id
    and cfp.hidden_at is null;

  if v_owner is not null then
    perform public.activity_events_insert_safe(
      v_owner,
      new.user_id,
      'like',
      new.post_id,
      null
    );
  end if;

  return new;
exception
  when others then
    raise warning 'activity_events_on_post_like_insert: %', sqlerrm;
    return new;
end;
$$;

drop trigger if exists trg_activity_events_post_like_insert on public.post_likes;
create trigger trg_activity_events_post_like_insert
  after insert on public.post_likes
  for each row
  execute function public.activity_events_on_post_like_insert();

create or replace function public.activity_events_on_feed_comment_like_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_post_id uuid;
begin
  select fc.user_id, fc.post_id
    into v_owner, v_post_id
  from public.feed_comments fc
  where fc.id = new.comment_id
    and fc.hidden_at is null;

  if v_owner is not null and v_post_id is not null then
    perform public.activity_events_insert_safe(
      v_owner,
      new.user_id,
      'like',
      v_post_id,
      new.comment_id
    );
  end if;

  return new;
exception
  when others then
    raise warning 'activity_events_on_feed_comment_like_insert: %', sqlerrm;
    return new;
end;
$$;

drop trigger if exists trg_activity_events_feed_comment_like_insert on public.feed_comment_likes;
create trigger trg_activity_events_feed_comment_like_insert
  after insert on public.feed_comment_likes
  for each row
  execute function public.activity_events_on_feed_comment_like_insert();

comment on function public.activity_events_on_post_like_insert() is
  'Notify post owner when someone likes their post (insert only; unlike is silent).';

comment on function public.activity_events_on_feed_comment_like_insert() is
  'Notify comment author when someone likes their comment (insert only).';
