-- Home feed category filter: exclude unchecked pills (all shown by default).
-- Apply after 20260525140000_lounge_category_filter_search_feed.sql (or instead of its feed half if not applied yet).
-- Postgres cannot rename params via CREATE OR REPLACE — drop the prior signature first.

drop function if exists public.lounge_feed_posts_page(text, uuid[], integer, timestamptz, timestamptz, uuid, numeric, text[]);
drop function if exists public.lounge_feed_posts_page(text, uuid[], integer, timestamptz, timestamptz, uuid, numeric);

create function public.lounge_feed_posts_page(
  p_sort text default 'latest',
  p_following_user_ids uuid[] default null,
  p_limit integer default 29,
  p_as_of timestamptz default now(),
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null,
  p_cursor_popular_score numeric default null,
  p_excluded_category_slugs text[] default null
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
  excluded_slugs text[];
  has_exclusion_filter boolean;
begin
  lim := greatest(1, least(coalesce(p_limit, 29), 60));
  sort_popular := lower(coalesce(p_sort, 'latest')) = 'popular';
  excluded_slugs := coalesce(p_excluded_category_slugs, '{}'::text[]);
  if cardinality(excluded_slugs) > 0 then
    excluded_slugs := (
      select coalesce(array_agg(distinct s), '{}'::text[])
      from unnest(excluded_slugs) as s
      where s = any(public.lounge_allowed_category_slugs())
    );
  end if;
  has_exclusion_filter := cardinality(excluded_slugs) > 0;

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
      not has_exclusion_filter
      or not (coalesce(c.category_pills, '{}'::text[]) && excluded_slugs)
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

grant execute on function public.lounge_feed_posts_page(
  text, uuid[], integer, timestamptz, timestamptz, uuid, numeric, text[]
) to anon, authenticated;
