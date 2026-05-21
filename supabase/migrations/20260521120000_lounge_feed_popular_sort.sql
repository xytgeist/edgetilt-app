-- Phase J slice: Lounge home feed Popular sort. Canonical: supabase/lounge_feed_popular_phase_j.sql

create or replace function public.lounge_feed_popular_score(
  p_like_count integer,
  p_comment_count integer,
  p_repost_count integer,
  p_created_at timestamptz,
  p_as_of timestamptz default now()
)
returns numeric
language sql
stable
set search_path = public
as $$
  select
    (
      coalesce(p_like_count, 0)::numeric
      + coalesce(p_repost_count, 0)::numeric * 2
      + coalesce(p_comment_count, 0)::numeric * 2
    )
    / power(
      greatest(0, extract(epoch from (p_as_of - p_created_at)) / 3600.0) + 2,
      1.5
    );
$$;

comment on function public.lounge_feed_popular_score(integer, integer, integer, timestamptz, timestamptz) is
  'Weighted engagement (likes + 2×reposts + 2×comments) with gravity/time decay for Lounge Popular feed sort.';

create or replace function public.lounge_feed_posts_page(
  p_sort text default 'latest',
  p_following_user_ids uuid[] default null,
  p_limit integer default 29,
  p_as_of timestamptz default now(),
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null,
  p_cursor_popular_score numeric default null
)
returns setof public.community_feed_posts
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  lim integer;
  sort_popular boolean;
begin
  lim := greatest(1, least(coalesce(p_limit, 29), 60));
  sort_popular := lower(coalesce(p_sort, 'latest')) = 'popular';

  return query
  select c.*
  from public.community_feed_posts c
  left join public.profiles pr on pr.user_id = c.user_id
  where c.hidden_at is null
    and c.pinned = false
    and (pr.user_id is null or pr.banned_at is null)
    and (
      p_following_user_ids is null
      or c.user_id = any(p_following_user_ids)
    )
    and (
      (
        not sort_popular
        and (
          p_cursor_created_at is null
          or c.created_at < p_cursor_created_at
          or (c.created_at = p_cursor_created_at and c.id < p_cursor_id)
        )
      )
      or (
        sort_popular
        and (
          p_cursor_popular_score is null
          or public.lounge_feed_popular_score(
            c.like_count, c.comment_count, c.repost_count, c.created_at, p_as_of
          ) < p_cursor_popular_score
          or (
            public.lounge_feed_popular_score(
              c.like_count, c.comment_count, c.repost_count, c.created_at, p_as_of
            ) = p_cursor_popular_score
            and c.id < p_cursor_id
          )
        )
      )
    )
  order by
    case
      when sort_popular then public.lounge_feed_popular_score(
        c.like_count, c.comment_count, c.repost_count, c.created_at, p_as_of
      )
    end desc nulls last,
    case when not sort_popular then c.created_at end desc nulls last,
    c.id desc
  limit lim;
end;
$$;

comment on function public.lounge_feed_posts_page(text, uuid[], integer, timestamptz, timestamptz, uuid, numeric) is
  'Paginated Lounge home feed (unpinned). p_sort: latest | popular. Pass frozen p_as_of for stable Popular pagination.';

grant execute on function public.lounge_feed_popular_score(integer, integer, integer, timestamptz, timestamptz) to anon, authenticated;
grant execute on function public.lounge_feed_posts_page(text, uuid[], integer, timestamptz, timestamptz, uuid, numeric) to anon, authenticated;
