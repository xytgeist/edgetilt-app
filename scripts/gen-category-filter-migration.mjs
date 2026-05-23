import fs from 'node:fs'

const src = fs.readFileSync('supabase/migrations/20260520190000_lounge_search_relevance_ranking.sql', 'utf8')
const start = src.indexOf('create or replace function public.lounge_search(')
const end = src.indexOf('revoke all on function public.lounge_search')
let fn = src.slice(start, end)

fn = fn.replace(
  'p_comments_offset integer default 0\n)',
  'p_comments_offset integer default 0,\n  p_category_slugs text[] default null\n)',
)
fn = fn.replace(
  '  match_needle text;\nbegin',
  '  match_needle text;\n  has_category_filter boolean;\n  category_slugs text[];\nbegin',
)
fn = fn.replace(
  `  term := public.lounge_normalize_search_term(p_query);
  if char_length(term) < 2 then`,
  `  term := public.lounge_normalize_search_term(p_query);
  category_slugs := coalesce(p_category_slugs, '{}'::text[]);
  if cardinality(category_slugs) > 0 then
    category_slugs := (
      select coalesce(array_agg(distinct s), '{}'::text[])
      from unnest(category_slugs) as s
      where s = any(public.lounge_allowed_category_slugs())
    );
  end if;
  has_category_filter := cardinality(category_slugs) > 0;
  if char_length(term) < 2 and not has_category_filter then`,
)
fn = fn.replace(
  '  if is_handle_query and char_length(handle_term) < 2 then',
  '  if is_handle_query and char_length(handle_term) < 2 and not has_category_filter then',
)
fn = fn.replace(
  '      c.stream_video_height,\n      case',
  '      c.stream_video_height,\n      c.category_pills,\n      c.repost_target_unavailable,\n      case',
)
fn = fn.replace(
  `      and (pr.user_id is null or pr.banned_at is null)
      and (
        case`,
  `      and (pr.user_id is null or pr.banned_at is null)
      and (not has_category_filter or c.category_pills && category_slugs)
      and (
        char_length(term) < 2
        or (
        case`,
)
fn = fn.replace(
  `          )
        end
      )
  ),
  ordered as (
    select *
    from candidates
    order by
      bucket asc,`,
  `          )
        end
        )
      )
  ),
  ordered as (
    select *
    from candidates
    order by
      bucket asc,`,
)

const profStart = fn.indexOf('  v_posts_count := jsonb_array_length(v_posts);\n\n  with matched as (')
const commStart = fn.indexOf('  v_profiles_count := jsonb_array_length(v_profiles);\n\n  with candidates as (')
if (profStart >= 0 && commStart >= 0) {
  const profBlock = fn.slice(profStart + '  v_posts_count := jsonb_array_length(v_posts);\n\n'.length, commStart)
  const wrappedProf =
    '  v_posts_count := jsonb_array_length(v_posts);\n\n' +
    '  if char_length(term) >= 2 then\n' +
    profBlock +
    '  else\n    v_profiles := \'[]\'::jsonb;\n    v_profiles_has_more := false;\n    v_profiles_count := 0;\n  end if;\n\n'
  fn = fn.slice(0, profStart) + wrappedProf + fn.slice(commStart)
}

fn = fn.replace(
  '  v_profiles_count := jsonb_array_length(v_profiles);\n\n  with candidates as (',
  '  if not has_category_filter and char_length(term) >= 2 then\n  with candidates as (',
)
fn = fn.replace(
  '  into v_comments, v_comments_has_more;\n\n  v_comments_count := jsonb_array_length(v_comments);',
  `  into v_comments, v_comments_has_more;

  v_comments_count := jsonb_array_length(v_comments);
  else
    v_comments := '[]'::jsonb;
    v_comments_has_more := false;
    v_comments_count := 0;
  end if;`,
)

const header = `-- Category pill filter for Lounge home feed + search.
-- Apply after 20260525120000_community_feed_posts_category_pills.sql

create or replace function public.lounge_allowed_category_slugs()
returns text[]
language sql
immutable
set search_path = public
as $$
  select array[
    'ap_slots','ap_tables','poker','gaming','tabletop',
    'investing','trading','stocks','crypto','collectibles'
  ]::text[];
$$;

revoke all on function public.lounge_feed_posts_page(text, uuid[], integer, timestamptz, timestamptz, uuid, numeric) from public;

create or replace function public.lounge_feed_posts_page(
  p_sort text default 'latest',
  p_following_user_ids uuid[] default null,
  p_limit integer default 29,
  p_as_of timestamptz default now(),
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null,
  p_cursor_popular_score numeric default null,
  p_category_slugs text[] default null
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
  category_slugs text[];
  has_category_filter boolean;
begin
  lim := greatest(1, least(coalesce(p_limit, 29), 60));
  sort_popular := lower(coalesce(p_sort, 'latest')) = 'popular';
  category_slugs := coalesce(p_category_slugs, '{}'::text[]);
  if cardinality(category_slugs) > 0 then
    category_slugs := (
      select coalesce(array_agg(distinct s), '{}'::text[])
      from unnest(category_slugs) as s
      where s = any(public.lounge_allowed_category_slugs())
    );
  end if;
  has_category_filter := cardinality(category_slugs) > 0;

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
    and (not has_category_filter or c.category_pills && category_slugs)
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

grant execute on function public.lounge_feed_posts_page(text, uuid[], integer, timestamptz, timestamptz, uuid, numeric, text[]) to anon, authenticated;

revoke all on function public.lounge_search(text, text, integer, integer, integer, integer, integer, integer) from public;

`

const footer = `
revoke all on function public.lounge_search(
  text, text, integer, integer, integer, integer, integer, integer, text[]
) from public;
grant execute on function public.lounge_search(
  text, text, integer, integer, integer, integer, integer, integer, text[]
) to authenticated;
`

const out = header + fn + footer
fs.writeFileSync('supabase/migrations/20260525140000_lounge_category_filter_search_feed.sql', out)
console.log('wrote', out.length, 'bytes')
