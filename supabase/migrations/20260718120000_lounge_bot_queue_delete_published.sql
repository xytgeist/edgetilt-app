-- Editorial inbox: allow removing published queue rows (delete feed post + free dedupe key).

create or replace function public.admin_lounge_bot_queue_delete(p_queue_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.lounge_bot_queue%rowtype;
  v_deleted_post_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if not public.play_log_viewer_is_admin() then raise exception 'admin only'; end if;
  if p_queue_id is null then raise exception 'p_queue_id required'; end if;

  select * into v_row from public.lounge_bot_queue where id = p_queue_id for update;
  if not found then raise exception 'queue row not found'; end if;

  v_deleted_post_id := v_row.published_post_id;

  if v_row.status = 'published' and v_row.published_post_id is not null then
    delete from public.community_feed_posts where id = v_row.published_post_id;
  end if;

  delete from public.lounge_bot_queue where id = p_queue_id;

  return jsonb_build_object(
    'ok', true,
    'id', v_row.id,
    'status', v_row.status,
    'external_key', v_row.external_key,
    'deleted_post_id', v_deleted_post_id
  );
end;
$$;

revoke all on function public.admin_lounge_bot_queue_delete(uuid) from public;
grant execute on function public.admin_lounge_bot_queue_delete(uuid) to authenticated;

comment on function public.admin_lounge_bot_queue_delete(uuid) is
  'Admin discard: hard-delete editorial queue row. Published rows also delete linked feed post.';

notify pgrst, 'reload schema';
