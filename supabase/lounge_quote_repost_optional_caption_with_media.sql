-- Patch: quote repost with media but no caption (run once on DBs that already applied `lounge_plain_reposts.sql`
-- with the old "non-empty caption" rule). New installs: use updated `lounge_plain_reposts.sql` instead.

create or replace function public.community_feed_posts_validate_quote_repost()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  has_images boolean;
begin
  if new.repost_of_post_id is null then
    return new;
  end if;

  if new.repost_of_post_id = new.id then
    raise exception 'Cannot quote-repost a post onto itself';
  end if;

  if not exists (
    select 1
    from public.community_feed_posts c
    where c.id = new.repost_of_post_id
      and c.hidden_at is null
  ) then
    if exists (select 1 from public.community_feed_posts c where c.id = new.repost_of_post_id) then
      raise exception 'Cannot quote a hidden post';
    else
      raise exception 'Original post not found';
    end if;
  end if;

  if coalesce(new.is_plain_repost, false) = true then
    if length(trim(coalesce(new.caption, ''))) > 0 then
      raise exception 'Plain repost must have an empty caption';
    end if;
  else
    has_images :=
      new.image_urls is not null
      and jsonb_typeof(new.image_urls) = 'array'
      and jsonb_array_length(new.image_urls) > 0;

    if length(trim(coalesce(new.caption, ''))) < 1 then
      if not (
        has_images
        or length(trim(coalesce(new.media_url, ''))) > 0
        or length(trim(coalesce(new.gif_url, ''))) > 0
      ) then
        raise exception 'Quote repost requires a comment or media (image or GIF)';
      end if;
    end if;
  end if;

  return new;
end;
$$;
