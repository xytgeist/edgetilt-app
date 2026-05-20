-- Phase G — Lounge server search (authenticated only): posts + profiles + comments.
-- Apply on test after feed + profiles foundation (`feed_phase_a_profiles_public_read.sql`).
-- Client: `src/features/lounge/loungeSearchApi.js`, `LoungeDockSlidePanels.jsx`.

create extension if not exists pg_trgm with schema extensions;

-- Trgm indexes for ILIKE / similarity on captions, game titles, and profile fields.
create index if not exists community_feed_posts_search_caption_trgm_idx
  on public.community_feed_posts using gin (lower(caption) extensions.gin_trgm_ops);

create index if not exists community_feed_posts_search_game_trgm_idx
  on public.community_feed_posts using gin (lower(game_title) extensions.gin_trgm_ops);

create index if not exists profiles_search_handle_trgm_idx
  on public.profiles using gin (lower(handle) extensions.gin_trgm_ops);

create index if not exists profiles_search_display_name_trgm_idx
  on public.profiles using gin (lower(display_name) extensions.gin_trgm_ops);

create index if not exists feed_comments_search_body_trgm_idx
  on public.feed_comments using gin (lower(body) extensions.gin_trgm_ops);

create or replace function public.lounge_normalize_search_term(p_query text)
returns text
language sql
immutable
as $$
  select left(lower(trim(both from coalesce(p_query, ''))), 128);
$$;

comment on function public.lounge_normalize_search_term(text) is
  'Trim, lower-case, and cap Lounge search input at 128 chars.';

create or replace function public.lounge_escape_like_pattern(p text)
returns text
language sql
immutable
as $$
  select replace(replace(replace(coalesce(p, ''), E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_');
$$;

comment on function public.lounge_escape_like_pattern(text) is
  'Escape %, _, and \\ for LIKE ... ESCAPE ''\\'' (safe substring patterns).';

create or replace function public.lounge_search_text_matches(haystack text, needle text)
returns boolean
language sql
stable
as $$
  select
    coalesce(needle, '') <> ''
    and (
      lower(coalesce(haystack, '')) like '%' || public.lounge_escape_like_pattern(needle) || '%' escape '\'
      or (
        char_length(needle) >= 3
        and extensions.similarity(lower(coalesce(haystack, '')), needle) > 0.15
      )
    );
$$;

comment on function public.lounge_search_text_matches(text, text) is
  'Escaped LIKE substring (GIN trgm-friendly) OR pg_trgm similarity when needle length >= 3.';

create or replace function public.lounge_search_match_relevance(haystack text, needle text)
returns numeric
language plpgsql
stable
as $$
declare
  h text := lower(coalesce(haystack, ''));
  n text := lower(trim(both from coalesce(needle, '')));
  words text[];
  w text;
  total_w numeric := 0;
  acc numeric := 0;
  w_weight numeric;
  w_score numeric;
  full_score numeric := 0;
begin
  if n = '' or h = '' then
    return 0;
  end if;

  if h like '%' || public.lounge_escape_like_pattern(n) || '%' escape '\' then
    return 1.0 + coalesce(extensions.similarity(h, n), 0) * 0.05;
  end if;

  words := regexp_split_to_array(n, '\s+');
  foreach w in array words loop
    w := trim(both from w);
    if w = '' then
      continue;
    end if;
    if w in ('the', 'for', 'and', 'or', 'a', 'an', 'to', 'in', 'on', 'at', 'is', 'it', 'of') then
      continue;
    end if;

    w_weight := case
      when char_length(w) >= 5 then 1.0
      when char_length(w) >= 4 then 0.9
      when char_length(w) >= 3 then 0.75
      else 0.5
    end;
    total_w := total_w + w_weight;

    w_score := 0;
    if h ~ (
      '(^|[^[:alnum:]_])'
      || regexp_replace(w, '([.*+?^${}()|\[\]\\])', '\\\1', 'g')
      || '([^[:alnum:]_]|$)'
    ) then
      w_score := 1.0;
    elsif h ~ (
      '(^|[^[:alnum:]_])'
      || regexp_replace(w, '([.*+?^${}()|\[\]\\])', '\\\1', 'g')
    ) then
      w_score := 0.88;
    elsif h like '%' || public.lounge_escape_like_pattern(w) || '%' escape '\' then
      w_score := 0.62;
    elsif char_length(w) >= 3 then
      w_score := greatest(
        coalesce(extensions.word_similarity(w, h), 0),
        coalesce(extensions.similarity(h, w), 0)
      ) * 0.5;
      if w_score < 0.08 then
        w_score := 0;
      end if;
    end if;

    acc := acc + w_score * w_weight;
  end loop;

  if total_w > 0 then
    full_score := acc / total_w;
  elsif char_length(n) >= 3 then
    full_score := coalesce(extensions.similarity(h, n), 0);
  end if;

  if char_length(n) >= 3 then
    full_score := greatest(
      full_score,
      coalesce(extensions.similarity(h, n), 0) * 0.32,
      coalesce(extensions.word_similarity(n, h), 0) * 0.38
    );
  end if;

  return round(full_score::numeric, 6);
end;
$$;

comment on function public.lounge_search_match_relevance(text, text) is
  'Lounge search ranking: full phrase > word-boundary tokens > substring > pg_trgm fuzzy (stop words skipped).';

-- Shared rate limit for lounge_search_* RPCs (~30 logical searches / 5 min; staff exempt).
create or replace function public.lounge_search_enforce_rate_limit()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_kind text := 'lounge_search';
  v_window interval := interval '5 minutes';
  v_limit integer := 30;
  v_window_start timestamptz;
  v_count integer;
  v_oldest_in_window timestamptz;
  v_retry_seconds integer;
  v_role text;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'LOUNGE_SEARCH_AUTH_REQUIRED'
      using message = 'Sign in to search the Lounge.';
  end if;

  select role into v_role from public.profiles where user_id = v_uid;
  if v_role in ('admin', 'moderator') then
    return;
  end if;

  v_window_start := now() - v_window;

  select count(*)
  into v_count
  from public.rate_limit_events e
  where e.user_id = v_uid
    and e.kind = v_kind
    and e.created_at >= v_window_start;

  if v_count >= v_limit then
    select min(e.created_at)
    into v_oldest_in_window
    from public.rate_limit_events e
    where e.user_id = v_uid
      and e.kind = v_kind
      and e.created_at >= v_window_start;

    v_retry_seconds := greatest(
      1,
      ceil(extract(epoch from ((coalesce(v_oldest_in_window, now()) + v_window) - now())))::int
    );

    raise exception 'Rate limit exceeded: retry_in_seconds=% (max % searches per % minutes)', v_retry_seconds, v_limit, extract(epoch from v_window) / 60
      using errcode = 'P0001';
  end if;

  insert into public.rate_limit_events (user_id, kind, window_start)
  values (v_uid, v_kind, date_trunc('minute', now()));
end;
$$;

create or replace function public.lounge_search_posts(
  p_query text,
  p_limit integer default 40,
  p_offset integer default 0,
  p_sort text default 'engagement'
)
returns table (
  id uuid,
  caption text,
  game_title text,
  game_slug text,
  user_id uuid,
  created_at timestamptz,
  edited_at timestamptz,
  pinned boolean,
  like_count integer,
  comment_count integer,
  repost_count integer,
  repost_of_post_id uuid,
  repost_of_comment_id uuid,
  is_plain_repost boolean,
  media_url text,
  gif_url text,
  image_urls jsonb,
  stream_video_uid text,
  stream_poster_url text,
  stream_video_width integer,
  stream_video_height integer
)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  term text;
  hash_term text;
  handle_term text;
  lim int;
  off int;
  is_word boolean;
  is_handle_query boolean;
  sort_recent boolean;
begin
  perform public.lounge_search_enforce_rate_limit();
  perform set_config('statement_timeout', '5000', true);

  term := public.lounge_normalize_search_term(p_query);
  if char_length(term) < 2 then
    return;
  end if;

  is_handle_query := left(term, 1) = '@';
  handle_term := term;
  if left(handle_term, 1) = '@' then
    handle_term := substring(handle_term from 2);
  end if;
  if is_handle_query and char_length(handle_term) < 2 then
    return;
  end if;

  hash_term := term;
  if left(hash_term, 1) = '#' then
    hash_term := substring(hash_term from 2);
  elsif left(hash_term, 1) = '@' then
    hash_term := substring(hash_term from 2);
  end if;
  is_word := char_length(hash_term) > 0 and position(' ' in hash_term) = 0;
  lim := greatest(1, least(coalesce(p_limit, 40), 80));
  off := greatest(0, coalesce(p_offset, 0));
  sort_recent := lower(coalesce(p_sort, 'engagement')) = 'recent';

  return query
  with candidates as (
    select
      c.*,
      case
        when is_handle_query then 0
        when is_word
          and lower(c.caption) ~ (
            '(^|[^[:alnum:]_])#'
            || regexp_replace(hash_term, '([.*+?^${}()|\[\]\\])', '\\\1', 'g')
            || '([^[:alnum:]_]|$)'
          )
          then 0
        when is_word
          and lower(c.caption) ~ (
            '#'
            || regexp_replace(hash_term, '([.*+?^${}()|\[\]\\])', '\\\1', 'g')
            || '[[:alnum:]_]'
          )
          then 1
        else 2
      end as bucket,
      (
        coalesce(c.like_count, 0)
        + coalesce(c.comment_count, 0)
        + coalesce(c.repost_count, 0)
      ) as score,
      greatest(
        extensions.similarity(lower(coalesce(c.caption, '')), case when is_handle_query then handle_term else term end),
        extensions.similarity(lower(coalesce(c.game_title, '')), case when is_handle_query then handle_term else term end)
      ) as sim_score
    from public.community_feed_posts c
    left join public.profiles pr on pr.user_id = c.user_id
    where c.hidden_at is null
      and (pr.user_id is null or pr.banned_at is null)
      and (
        case
          when is_handle_query then (
            exists (
              select 1
              from public.profiles ap
              where ap.user_id = c.user_id
                and ap.banned_at is null
                and (
                  strpos(lower(ap.handle), handle_term) > 0
                  or extensions.similarity(lower(ap.handle), handle_term) > 0.15
                )
            )
            or lower(c.caption) ~ (
              '(^|[^[:alnum:]_])@'
              || regexp_replace(handle_term, '([.*+?^${}()|\[\]\\])', '\\\1', 'g')
              || '([^[:alnum:]_]|$)'
            )
          )
          else (
            strpos(lower(coalesce(c.caption, '')), term) > 0
            or strpos(lower(coalesce(c.game_title, '')), term) > 0
            or extensions.similarity(lower(coalesce(c.caption, '')), term) > 0.15
            or extensions.similarity(lower(coalesce(c.game_title, '')), term) > 0.15
            or (is_word and strpos(lower(coalesce(c.caption, '')), '#' || hash_term) > 0)
          )
        end
      )
  )
  select
    candidates.id,
    candidates.caption,
    candidates.game_title,
    candidates.game_slug,
    candidates.user_id,
    candidates.created_at,
    candidates.edited_at,
    candidates.pinned,
    candidates.like_count,
    candidates.comment_count,
    candidates.repost_count,
    candidates.repost_of_post_id,
    candidates.repost_of_comment_id,
    candidates.is_plain_repost,
    candidates.media_url,
    candidates.gif_url,
    candidates.image_urls,
    candidates.stream_video_uid,
    candidates.stream_poster_url,
    candidates.stream_video_width,
    candidates.stream_video_height
  from candidates
  order by
    candidates.bucket asc,
    case when sort_recent then candidates.created_at end desc nulls last,
    case when not sort_recent then candidates.score end desc nulls last,
    candidates.sim_score desc,
    case when sort_recent then candidates.score end desc nulls last,
    candidates.created_at desc
  limit lim
  offset off;
end;
$$;

create or replace function public.lounge_search_profiles(
  p_query text,
  p_limit integer default 20,
  p_sort text default 'engagement'
)
returns table (
  user_id uuid,
  handle text,
  display_name text,
  avatar_url text,
  role text,
  is_og boolean,
  about_me text
)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  term text;
  handle_term text;
  lim int;
  is_handle_query boolean;
begin
  perform public.lounge_search_enforce_rate_limit();
  perform set_config('statement_timeout', '5000', true);

  term := public.lounge_normalize_search_term(p_query);
  if char_length(term) < 2 then
    return;
  end if;

  is_handle_query := left(term, 1) = '@';
  handle_term := term;
  if left(handle_term, 1) = '@' then
    handle_term := substring(handle_term from 2);
  end if;
  if is_handle_query and char_length(handle_term) < 2 then
    return;
  end if;

  lim := greatest(1, least(coalesce(p_limit, 20), 40));

  return query
  select
    p.user_id,
    p.handle,
    p.display_name,
    p.avatar_url,
    p.role,
    coalesce(p.is_og, false),
    p.about_me
  from public.profiles p
  where p.banned_at is null
    and (
      case
        when is_handle_query then (
          strpos(lower(p.handle), handle_term) > 0
          or extensions.similarity(lower(p.handle), handle_term) > 0.15
        )
        else (
          strpos(lower(p.handle), handle_term) > 0
          or strpos(lower(coalesce(p.display_name, '')), term) > 0
          or extensions.similarity(lower(p.handle), handle_term) > 0.15
          or extensions.similarity(lower(coalesce(p.display_name, '')), term) > 0.15
        )
      end
    )
  order by
    case
      when is_handle_query and lower(p.handle) = handle_term then 0
      when is_handle_query and starts_with(lower(p.handle), handle_term) then 1
      when not is_handle_query and lower(p.handle) = handle_term then 0
      when not is_handle_query and starts_with(lower(p.handle), handle_term) then 1
      when not is_handle_query and starts_with(lower(coalesce(p.display_name, '')), term) then 2
      else 3
    end,
    extensions.similarity(lower(p.handle), handle_term) desc,
    extensions.similarity(lower(coalesce(p.display_name, '')), term) desc,
    p.display_name asc
  limit lim;
end;
$$;

create or replace function public.lounge_search_comments(
  p_query text,
  p_limit integer default 30,
  p_offset integer default 0,
  p_sort text default 'engagement'
)
returns table (
  id uuid,
  post_id uuid,
  user_id uuid,
  parent_id uuid,
  body text,
  created_at timestamptz,
  edited_at timestamptz,
  comment_count integer,
  like_count integer,
  repost_count integer,
  bookmark_count integer,
  media_url text,
  gif_url text,
  image_urls jsonb,
  stream_video_uid text,
  stream_poster_url text,
  stream_video_width integer,
  stream_video_height integer
)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  term text;
  lim int;
  off int;
  sort_recent boolean;
begin
  perform public.lounge_search_enforce_rate_limit();
  perform set_config('statement_timeout', '5000', true);

  term := public.lounge_normalize_search_term(p_query);
  if char_length(term) < 2 then
    return;
  end if;

  lim := greatest(1, least(coalesce(p_limit, 30), 60));
  off := greatest(0, coalesce(p_offset, 0));
  sort_recent := lower(coalesce(p_sort, 'engagement')) = 'recent';

  return query
  with candidates as (
    select
      fc.*,
      (
        coalesce(fc.like_count, 0)
        + coalesce(fc.comment_count, 0)
        + coalesce(fc.repost_count, 0)
      ) as score,
      extensions.similarity(lower(coalesce(fc.body, '')), term) as sim_score
    from public.feed_comments fc
    inner join public.community_feed_posts p on p.id = fc.post_id
    left join public.profiles pr on pr.user_id = fc.user_id
    left join public.profiles post_pr on post_pr.user_id = p.user_id
    where fc.hidden_at is null
      and p.hidden_at is null
      and (pr.user_id is null or pr.banned_at is null)
      and (post_pr.user_id is null or post_pr.banned_at is null)
      and (
        strpos(lower(coalesce(fc.body, '')), term) > 0
        or extensions.similarity(lower(coalesce(fc.body, '')), term) > 0.15
      )
  )
  select
    candidates.id,
    candidates.post_id,
    candidates.user_id,
    candidates.parent_id,
    candidates.body,
    candidates.created_at,
    candidates.edited_at,
    candidates.comment_count,
    candidates.like_count,
    candidates.repost_count,
    candidates.bookmark_count,
    candidates.media_url,
    candidates.gif_url,
    candidates.image_urls,
    candidates.stream_video_uid,
    candidates.stream_poster_url,
    candidates.stream_video_width,
    candidates.stream_video_height
  from candidates
  order by
    case when sort_recent then candidates.created_at end desc nulls last,
    case when not sort_recent then candidates.score end desc nulls last,
    candidates.sim_score desc,
    case when sort_recent then candidates.score end desc nulls last,
    candidates.created_at desc
  limit lim
  offset off;
end;
$$;

revoke all on function public.lounge_search_posts(text, integer, integer, text) from public;
revoke all on function public.lounge_search_profiles(text, integer, text) from public;
revoke all on function public.lounge_search_comments(text, integer, integer, text) from public;
grant execute on function public.lounge_search_posts(text, integer, integer, text) to authenticated;
grant execute on function public.lounge_search_profiles(text, integer, text) to authenticated;
grant execute on function public.lounge_search_comments(text, integer, integer, text) to authenticated;

-- Bundled RPC + analytics + index-aware helpers: migration 20260520170000_lounge_search_bundled.sql
-- @handle + keyword ("@selena buffalo"): migration 20260520180000_lounge_search_handle_keyword.sql
-- Client calls public.lounge_search() only; split RPC execute revoked from authenticated there.
