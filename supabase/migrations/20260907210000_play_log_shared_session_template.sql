-- Creator can change the game on a shared play (Edit Play picker).
-- Safe to re-run.

create or replace function public.play_log_set_shared_session_template(
  p_session_id uuid,
  p_template_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if p_template_id is null then
    raise exception 'template_id required';
  end if;

  if not exists (
    select 1
    from public.play_log_sessions s
    where s.id = p_session_id
      and s.created_by_user_id = v_uid
  ) then
    raise exception 'Only the creator can edit this shared play';
  end if;

  if not exists (
    select 1
    from public.play_log_game_templates t
    where t.id = p_template_id
      and (t.is_system = true or t.user_id = v_uid)
  ) then
    raise exception 'Invalid game template';
  end if;

  update public.play_log_sessions
  set
    template_id = p_template_id,
    updated_at = now()
  where id = p_session_id
    and created_by_user_id = v_uid;

  update public.play_log_entries
  set
    template_id = p_template_id,
    updated_at = now()
  where session_id = p_session_id;
end;
$$;

grant execute on function public.play_log_set_shared_session_template(uuid, uuid) to authenticated;
