-- X bots may post direct to Lounge (review_mode=automatic) or keep editorial inbox.
-- Editorial inbox: bulk hard-delete for current status (+ optional bot filter).

begin;

alter table public.lounge_bot_accounts
  drop constraint if exists lounge_bot_accounts_review_mode_pipeline;

alter table public.lounge_bot_accounts
  add constraint lounge_bot_accounts_review_mode_pipeline
  check (
    (pipeline = 'x' and review_mode in ('editorial', 'automatic'))
    or (pipeline in ('odds_api', 'market_news', 'farm') and review_mode = 'automatic')
    or (pipeline = 'manual' and review_mode = 'editorial')
  );

comment on constraint lounge_bot_accounts_review_mode_pipeline on public.lounge_bot_accounts is
  'X may be editorial (inbox) or automatic (publish on ingest). Odds/news/farm stay automatic; manual stays editorial.';

create or replace function public.admin_lounge_bot_set_review_mode(
  p_user_id uuid,
  p_review_mode text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.lounge_bot_accounts%rowtype;
  v_mode text := lower(trim(coalesce(p_review_mode, '')));
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if not public.play_log_viewer_is_admin() then raise exception 'admin only'; end if;
  if p_user_id is null then raise exception 'p_user_id required'; end if;
  if v_mode not in ('editorial', 'automatic') then
    raise exception 'review_mode must be editorial or automatic';
  end if;

  select * into v_row from public.lounge_bot_accounts where user_id = p_user_id for update;
  if not found then raise exception 'bot not found'; end if;
  if v_row.pipeline <> 'x' then
    raise exception 'review_mode toggle is only for X tracker bots';
  end if;

  update public.lounge_bot_accounts
  set review_mode = v_mode, updated_at = now()
  where user_id = p_user_id
  returning * into v_row;

  return jsonb_build_object(
    'ok', true,
    'user_id', v_row.user_id,
    'slug', v_row.slug,
    'pipeline', v_row.pipeline,
    'review_mode', v_row.review_mode
  );
end;
$$;

revoke all on function public.admin_lounge_bot_set_review_mode(uuid, text) from public;
grant execute on function public.admin_lounge_bot_set_review_mode(uuid, text) to authenticated;

comment on function public.admin_lounge_bot_set_review_mode(uuid, text) is
  'Admin: set X bot review_mode to editorial (inbox) or automatic (publish on ingest).';

create or replace function public.admin_lounge_bot_queue_delete_all(
  p_status text,
  p_bot_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text := lower(trim(coalesce(p_status, '')));
  v_row public.lounge_bot_queue%rowtype;
  v_deleted int := 0;
  v_deleted_posts int := 0;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if not public.play_log_viewer_is_admin() then raise exception 'admin only'; end if;
  if v_status not in ('pending_review', 'scheduled', 'published', 'skipped', 'failed') then
    raise exception 'p_status required (pending_review|scheduled|published|skipped|failed)';
  end if;

  for v_row in
    select *
    from public.lounge_bot_queue q
    where q.status = v_status
      and (p_bot_user_id is null or q.bot_user_id = p_bot_user_id)
    order by q.created_at asc
    for update
  loop
    if v_row.status = 'published' and v_row.published_post_id is not null then
      delete from public.community_feed_posts where id = v_row.published_post_id;
      if found then v_deleted_posts := v_deleted_posts + 1; end if;
    end if;
    delete from public.lounge_bot_queue where id = v_row.id;
    v_deleted := v_deleted + 1;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'status', v_status,
    'bot_user_id', p_bot_user_id,
    'deleted', v_deleted,
    'deleted_posts', v_deleted_posts
  );
end;
$$;

revoke all on function public.admin_lounge_bot_queue_delete_all(text, uuid) from public;
grant execute on function public.admin_lounge_bot_queue_delete_all(text, uuid) to authenticated;

comment on function public.admin_lounge_bot_queue_delete_all(text, uuid) is
  'Admin: hard-delete all editorial queue rows for a status (+ optional bot). Published rows also delete linked feed posts.';

notify pgrst, 'reload schema';

commit;
