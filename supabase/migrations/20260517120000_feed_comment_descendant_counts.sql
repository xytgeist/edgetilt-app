-- Count every visible reply at any depth: post.comment_count = all comments on the post;
-- feed_comments.comment_count = all visible descendants below that comment (any depth).

alter table public.feed_comments
  add column if not exists comment_count integer not null default 0;

comment on column public.feed_comments.comment_count is
  'Denormalized count of visible replies in this comment''s subtree (all depths); maintained by trg_feed_comments_touch.';

create or replace function public.feed_comments_bump_ancestor_counts(
  p_post_id uuid,
  p_parent_id uuid,
  p_delta integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  cur uuid := p_parent_id;
begin
  if p_delta = 0 or p_post_id is null then
    return;
  end if;

  perform set_config('lounge.denorm_feed_counters', '1', true);

  update public.community_feed_posts
    set comment_count = greatest(0, comment_count + p_delta)
    where id = p_post_id;

  while cur is not null loop
    update public.feed_comments
      set comment_count = greatest(0, comment_count + p_delta)
      where id = cur;
    select c.parent_id into cur
    from public.feed_comments c
    where c.id = cur;
  end loop;

  perform set_config('lounge.denorm_feed_counters', '', true);
exception
  when others then
    perform set_config('lounge.denorm_feed_counters', '', true);
    raise;
end;
$$;

create or replace function public.feed_comments_touch_post_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.hidden_at is null then
      perform public.feed_comments_bump_ancestor_counts(new.post_id, new.parent_id, 1);
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    if old.hidden_at is null then
      perform public.feed_comments_bump_ancestor_counts(old.post_id, old.parent_id, -1);
    end if;
    return old;
  elsif tg_op = 'UPDATE' then
    if old.hidden_at is null and new.hidden_at is not null then
      perform public.feed_comments_bump_ancestor_counts(old.post_id, old.parent_id, -1);
    elsif old.hidden_at is not null and new.hidden_at is null then
      perform public.feed_comments_bump_ancestor_counts(new.post_id, new.parent_id, 1);
    end if;
    return new;
  end if;
  return null;
exception
  when others then
    perform set_config('lounge.denorm_feed_counters', '', true);
    raise;
end;
$$;

drop trigger if exists trg_feed_comments_touch on public.feed_comments;
create trigger trg_feed_comments_touch
  after insert or delete or update of hidden_at on public.feed_comments
  for each row
  execute function public.feed_comments_touch_post_count();

-- Backfill post totals (all visible comments, any depth).
update public.community_feed_posts p
set comment_count = coalesce(
  (
    select count(*)::integer
    from public.feed_comments c
    where c.post_id = p.id
      and c.hidden_at is null
  ),
  0
);

-- Backfill per-comment subtree totals (visible descendants only).
with recursive descendants as (
  select
    c.id as root_id,
    c.id as node_id
  from public.feed_comments c
  where c.hidden_at is null
  union all
  select
    d.root_id,
    ch.id
  from descendants d
  join public.feed_comments ch on ch.parent_id = d.node_id and ch.hidden_at is null
)
update public.feed_comments fc
set comment_count = coalesce(
  (
    select greatest(0, count(*)::integer - 1)
    from descendants d
    where d.root_id = fc.id
  ),
  0
)
where fc.hidden_at is null;
