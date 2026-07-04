-- Bot portal: reply as bot on any visible Lounge post (not only bot-owned posts).

create or replace function public.admin_lounge_bot_post_comment(
  p_bot_user_id uuid,
  p_post_id uuid,
  p_body text,
  p_parent_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_body text;
  v_comment_id uuid;
  v_cap integer;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;
  if not public.play_log_viewer_is_admin() then
    raise exception 'admin only';
  end if;

  if not exists (
    select 1 from public.lounge_bot_accounts a where a.user_id = p_bot_user_id
  ) then
    raise exception 'bot not found';
  end if;

  v_cap := public.lounge_feed_caption_max_for_user(p_bot_user_id);
  v_body := left(trim(coalesce(p_body, '')), v_cap);
  if char_length(trim(v_body)) < 1 then
    raise exception 'comment body required';
  end if;

  if not exists (
    select 1
    from public.community_feed_posts c
    where c.id = p_post_id
      and c.hidden_at is null
  ) then
    raise exception 'post not found';
  end if;

  if p_parent_id is not null then
    if not exists (
      select 1
      from public.feed_comments fc
      where fc.id = p_parent_id
        and fc.post_id = p_post_id
        and fc.hidden_at is null
    ) then
      raise exception 'parent comment not found on this post';
    end if;
  end if;

  insert into public.feed_comments (post_id, user_id, parent_id, body)
  values (p_post_id, p_bot_user_id, p_parent_id, v_body)
  returning id into v_comment_id;

  return jsonb_build_object(
    'ok', true,
    'comment_id', v_comment_id,
    'post_id', p_post_id,
    'parent_id', p_parent_id
  );
end;
$$;

comment on function public.admin_lounge_bot_post_comment(uuid, uuid, text, uuid) is
  'Admin bot portal: comment or reply on any visible feed post as the bot (2000 cap for bots).';
