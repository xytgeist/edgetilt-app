-- Admin: remove an X handle from a Lounge bot tracker (Bot Portal).
-- Queue rows keep history via source_id ON DELETE SET NULL.

create or replace function public.admin_lounge_bot_remove_x_source(
  p_source_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_handle text;
  v_bot uuid;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if not public.play_log_viewer_is_admin() then raise exception 'admin only'; end if;
  if p_source_id is null then raise exception 'p_source_id required'; end if;

  delete from public.lounge_bot_x_sources s
  where s.id = p_source_id
  returning s.x_handle, s.bot_user_id into v_handle, v_bot;

  if v_handle is null then
    raise exception 'X source not found';
  end if;

  return jsonb_build_object(
    'ok', true,
    'id', p_source_id,
    'x_handle', v_handle,
    'bot_user_id', v_bot
  );
end;
$$;

revoke all on function public.admin_lounge_bot_remove_x_source(uuid) from public;
grant execute on function public.admin_lounge_bot_remove_x_source(uuid) to authenticated;
