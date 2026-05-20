-- Strongest text matches first (word-boundary > substring > fuzzy), then Top/Latest tie-break.
-- Returns search_relevance on posts + comments for client merge sort.
-- Apply after 20260520180000 (or 20260520181000 volatile fix).

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

-- Patch lounge_search ordering + expose search_relevance (requires 20180000 body).
create or replace function public.lounge_search(
  p_query text,
  p_sort text default 'engagement',
  p_posts_limit integer default 20,
  p_posts_offset integer default 0,
  p_profiles_limit integer default 20,
  p_profiles_offset integer default 0,
  p_comments_limit integer default 15,
  p_comments_offset integer default 0
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  term text;
  hash_term text;
  handle_term text;
  keyword_term text;
  is_word boolean;
  is_handle_query boolean;
  has_handle_keyword boolean;
  sort_recent boolean;
  posts_lim int;
  posts_off int;
  profiles_lim int;
  profiles_off int;
  comments_lim int;
  comments_off int;
  v_posts jsonb := '[]'::jsonb;
  v_profiles jsonb := '[]'::jsonb;
  v_comments jsonb := '[]'::jsonb;
  v_posts_has_more boolean := false;
  v_profiles_has_more boolean := false;
  v_comments_has_more boolean := false;
  v_posts_count int := 0;
  v_profiles_count int := 0;
  v_comments_count int := 0;
  rest text;
  sp int;
  match_needle text;
begin
  perform public.lounge_search_enforce_rate_limit();
  perform set_config('statement_timeout', '5000', true);

  term := public.lounge_normalize_search_term(p_query);
  if char_length(term) < 2 then
    return jsonb_build_object(
      'posts', '[]'::jsonb,
      'profiles', '[]'::jsonb,
      'comments', '[]'::jsonb,
      'pagination', jsonb_build_object(
        'posts_has_more', false,
        'profiles_has_more', false,
        'comments_has_more', false
      )
    );
  end if;

  keyword_term := '';
  is_handle_query := left(term, 1) = '@';

  if is_handle_query then
    rest := trim(both from substring(term from 2));
    sp := position(' ' in rest);
    if sp > 0 then
      handle_term := trim(both from substring(rest from 1 for sp - 1));
      keyword_term := trim(both from substring(rest from sp + 1));
    else
      handle_term := rest;
    end if;
  else
    handle_term := term;
    if left(handle_term, 1) = '@' then
      handle_term := substring(handle_term from 2);
    end if;
  end if;

  if is_handle_query and char_length(handle_term) < 2 then
    return jsonb_build_object(
      'posts', '[]'::jsonb,
      'profiles', '[]'::jsonb,
      'comments', '[]'::jsonb,
      'pagination', jsonb_build_object(
        'posts_has_more', false,
        'profiles_has_more', false,
        'comments_has_more', false
      )
    );
  end if;

  has_handle_keyword := is_handle_query and char_length(keyword_term) >= 2;

  hash_term := case when has_handle_keyword then keyword_term else term end;
  if left(hash_term, 1) = '#' then
    hash_term := substring(hash_term from 2);
  elsif left(hash_term, 1) = '@' then
    hash_term := substring(hash_term from 2);
  end if;
  is_word := char_length(hash_term) > 0 and position(' ' in hash_term) = 0;
  sort_recent := lower(coalesce(p_sort, 'engagement')) = 'recent';
  match_needle := case
    when has_handle_keyword then keyword_term
    when is_handle_query then handle_term
    else term
  end;

  posts_lim := greatest(1, least(coalesce(p_posts_limit, 20), 80));
  posts_off := greatest(0, coalesce(p_posts_offset, 0));
  profiles_lim := greatest(1, least(coalesce(p_profiles_limit, 20), 40));
  profiles_off := greatest(0, coalesce(p_profiles_offset, 0));
  comments_lim := greatest(1, least(coalesce(p_comments_limit, 15), 60));
  comments_off := greatest(0, coalesce(p_comments_offset, 0));

  with candidates as (
    select
      c.id,
      c.caption,
      c.game_title,
      c.game_slug,
      c.user_id,
      c.created_at,
      c.edited_at,
      c.pinned,
      c.like_count,
      c.comment_count,
      c.repost_count,
      c.repost_of_post_id,
      c.repost_of_comment_id,
      c.is_plain_repost,
      c.media_url,
      c.gif_url,
      c.image_urls,
      c.stream_video_uid,
      c.stream_poster_url,
      c.stream_video_width,
      c.stream_video_height,
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
        public.lounge_search_match_relevance(c.caption, match_needle),
        public.lounge_search_match_relevance(c.game_title, match_needle)
      ) as search_relevance
    from public.community_feed_posts c
    left join public.profiles pr on pr.user_id = c.user_id
    where c.hidden_at is null
      and (pr.user_id is null or pr.banned_at is null)
      and (
        case
          when is_handle_query then (
            (
              exists (
                select 1
                from public.profiles ap
                where ap.user_id = c.user_id
                  and ap.banned_at is null
                  and (
                    public.lounge_search_text_matches(ap.handle, handle_term)
                    or extensions.similarity(lower(ap.handle), handle_term) > 0.15
                  )
              )
              or lower(c.caption) ~ (
                '(^|[^[:alnum:]_])@'
                || regexp_replace(handle_term, '([.*+?^${}()|\[\]\\])', '\\\1', 'g')
                || '([^[:alnum:]_]|$)'
              )
            )
            and (
              not has_handle_keyword
              or public.lounge_search_text_matches(c.caption, keyword_term)
              or public.lounge_search_text_matches(c.game_title, keyword_term)
              or extensions.similarity(lower(coalesce(c.caption, '')), keyword_term) > 0.15
              or extensions.similarity(lower(coalesce(c.game_title, '')), keyword_term) > 0.15
              or (is_word and public.lounge_search_text_matches(c.caption, '#' || hash_term))
            )
          )
          else (
            public.lounge_search_text_matches(c.caption, term)
            or public.lounge_search_text_matches(c.game_title, term)
            or extensions.similarity(lower(coalesce(c.caption, '')), term) > 0.15
            or extensions.similarity(lower(coalesce(c.game_title, '')), term) > 0.15
            or (is_word and public.lounge_search_text_matches(c.caption, '#' || hash_term))
          )
        end
      )
  ),
  ordered as (
    select *
    from candidates
    order by
      bucket asc,
      search_relevance desc,
      case when sort_recent then created_at end desc nulls last,
      case when not sort_recent then score end desc nulls last,
      created_at desc
    limit posts_lim + 1
    offset posts_off
  )
  select
    coalesce(
      (
        select jsonb_agg(to_jsonb(p) - 'bucket' - 'score')
        from (
          select *
          from ordered
          limit posts_lim
        ) p
      ),
      '[]'::jsonb
    ),
    (select count(*) > posts_lim from ordered)
  into v_posts, v_posts_has_more;

  v_posts_count := jsonb_array_length(v_posts);

  with matched as (
    select
      p.user_id,
      p.handle,
      p.display_name,
      p.avatar_url,
      p.role,
      coalesce(p.is_og, false) as is_og,
      p.about_me,
      case
        when is_handle_query and lower(p.handle) = handle_term then 0
        when is_handle_query and starts_with(lower(p.handle), handle_term) then 1
        when not is_handle_query and lower(p.handle) = handle_term then 0
        when not is_handle_query and starts_with(lower(p.handle), handle_term) then 1
        when not is_handle_query and starts_with(lower(coalesce(p.display_name, '')), term) then 2
        when not is_handle_query and public.lounge_search_text_matches(p.about_me, term) then 3
        else 4
      end as rank_bucket,
      extensions.similarity(lower(p.handle), handle_term) as handle_sim,
      greatest(
        extensions.similarity(lower(coalesce(p.display_name, '')), term),
        extensions.similarity(lower(coalesce(p.about_me, '')), term)
      ) as profile_sim
    from public.profiles p
    where p.banned_at is null
      and (
        case
          when is_handle_query then (
            public.lounge_search_text_matches(p.handle, handle_term)
            or extensions.similarity(lower(p.handle), handle_term) > 0.15
          )
          else (
            public.lounge_search_text_matches(p.handle, handle_term)
            or public.lounge_search_text_matches(p.display_name, term)
            or public.lounge_search_text_matches(p.about_me, term)
            or extensions.similarity(lower(p.handle), handle_term) > 0.15
            or extensions.similarity(lower(coalesce(p.display_name, '')), term) > 0.15
            or extensions.similarity(lower(coalesce(p.about_me, '')), term) > 0.15
          )
        end
      )
  ),
  ordered as (
    select *
    from matched
    order by rank_bucket asc, handle_sim desc, profile_sim desc, display_name asc
    limit profiles_lim + 1
    offset profiles_off
  )
  select
    coalesce(
      (
        select jsonb_agg(to_jsonb(p) - 'rank_bucket' - 'handle_sim' - 'profile_sim')
        from (
          select user_id, handle, display_name, avatar_url, role, is_og, about_me
          from ordered
          limit profiles_lim
        ) p
      ),
      '[]'::jsonb
    ),
    (select count(*) > profiles_lim from ordered)
  into v_profiles, v_profiles_has_more;

  v_profiles_count := jsonb_array_length(v_profiles);

  with candidates as (
    select
      fc.id,
      fc.post_id,
      fc.user_id,
      fc.parent_id,
      fc.body,
      fc.created_at,
      fc.edited_at,
      fc.comment_count,
      fc.like_count,
      fc.repost_count,
      fc.bookmark_count,
      fc.media_url,
      fc.gif_url,
      fc.image_urls,
      fc.stream_video_uid,
      fc.stream_poster_url,
      fc.stream_video_width,
      fc.stream_video_height,
      (
        coalesce(fc.like_count, 0)
        + coalesce(fc.comment_count, 0)
        + coalesce(fc.repost_count, 0)
      ) as score,
      public.lounge_search_match_relevance(
        fc.body,
        case when has_handle_keyword then keyword_term else term end
      ) as search_relevance
    from public.feed_comments fc
    inner join public.community_feed_posts p on p.id = fc.post_id
    left join public.profiles pr on pr.user_id = fc.user_id
    left join public.profiles post_pr on post_pr.user_id = p.user_id
    where fc.hidden_at is null
      and p.hidden_at is null
      and (pr.user_id is null or pr.banned_at is null)
      and (post_pr.user_id is null or post_pr.banned_at is null)
      and (
        case
          when has_handle_keyword then (
            (
              public.lounge_search_text_matches(fc.body, keyword_term)
              or extensions.similarity(lower(coalesce(fc.body, '')), keyword_term) > 0.15
            )
            and (
              (
                pr.user_id is not null
                and (
                  public.lounge_search_text_matches(pr.handle, handle_term)
                  or extensions.similarity(lower(pr.handle), handle_term) > 0.15
                )
              )
              or (
                post_pr.user_id is not null
                and (
                  public.lounge_search_text_matches(post_pr.handle, handle_term)
                  or extensions.similarity(lower(post_pr.handle), handle_term) > 0.15
                )
              )
            )
          )
          else (
            public.lounge_search_text_matches(fc.body, term)
            or extensions.similarity(lower(coalesce(fc.body, '')), term) > 0.15
          )
        end
      )
  ),
  ordered as (
    select *
    from candidates
    order by
      search_relevance desc,
      case when sort_recent then created_at end desc nulls last,
      case when not sort_recent then score end desc nulls last,
      created_at desc
    limit comments_lim + 1
    offset comments_off
  )
  select
    coalesce(
      (
        select jsonb_agg(to_jsonb(c) - 'score')
        from (
          select *
          from ordered
          limit comments_lim
        ) c
      ),
      '[]'::jsonb
    ),
    (select count(*) > comments_lim from ordered)
  into v_comments, v_comments_has_more;

  v_comments_count := jsonb_array_length(v_comments);

  perform public.lounge_search_log_analytics(
    term,
    coalesce(p_sort, 'engagement'),
    v_posts_count,
    v_profiles_count,
    v_comments_count,
    posts_off,
    comments_off,
    profiles_off
  );

  return jsonb_build_object(
    'posts', v_posts,
    'profiles', v_profiles,
    'comments', v_comments,
    'pagination', jsonb_build_object(
      'posts_has_more', coalesce(v_posts_has_more, false),
      'profiles_has_more', coalesce(v_profiles_has_more, false),
      'comments_has_more', coalesce(v_comments_has_more, false)
    )
  );
end;
$$;

revoke all on function public.lounge_search(
  text, text, integer, integer, integer, integer, integer, integer
) from public;
grant execute on function public.lounge_search(
  text, text, integer, integer, integer, integer, integer, integer
) to authenticated;
