-- Repair: restore unpaid paid-toggle alerts if 20260531300000 ran after 20260531310000
-- (31300000 replaced play_log_update_session_partners_paid without the unpaid branch).
-- Safe to run multiple times.

alter table public.activity_events
  drop constraint if exists activity_events_event_type_check;

alter table public.activity_events
  add constraint activity_events_event_type_check
  check (
    event_type in (
      'comment_on_post',
      'reply_to_comment',
      'mention_in_post',
      'mention_in_comment',
      'follow',
      'repost',
      'quote_repost',
      'bookmark',
      'like',
      'play_log_shared',
      'play_log_partner_paid',
      'play_log_partner_unpaid'
    )
  );

create or replace function public.play_log_notify_partner_marked_unpaid(
  p_session_id uuid,
  p_recipient uuid,
  p_actor uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry_id uuid;
begin
  if p_recipient is null or p_actor is null or p_recipient = p_actor then
    return;
  end if;

  select e.id
  into v_entry_id
  from public.play_log_entries e
  where e.session_id = p_session_id
    and e.user_id = p_recipient
  limit 1;

  if v_entry_id is null then
    return;
  end if;

  perform public.activity_events_insert_safe(
    p_recipient,
    p_actor,
    'play_log_partner_unpaid',
    null,
    null,
    v_entry_id
  );
end;
$$;

create or replace function public.play_log_update_session_partners_paid(
  p_session_id uuid,
  p_partners jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_partner jsonb;
  v_kind text;
  v_target uuid;
  v_guest text;
  v_paid boolean;
  v_was_paid boolean;
  v_updated int;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if p_partners is null or jsonb_typeof(p_partners) <> 'array' then
    raise exception 'partners required';
  end if;

  if not exists (
    select 1
    from public.play_log_sessions s
    where s.id = p_session_id
      and s.created_by_user_id = v_uid
  )
  and not exists (
    select 1
    from public.play_log_session_partners sp
    where sp.session_id = p_session_id
      and sp.participant_kind = 'user'
      and sp.user_id = v_uid
      and sp.is_manager = true
  ) then
    raise exception 'Only the creator or play manager can update paid status';
  end if;

  for v_partner in select jsonb_array_elements(p_partners)
  loop
    v_kind := v_partner->>'kind';
    v_paid := coalesce((v_partner->>'paid')::boolean, false);

    if v_kind = 'user' then
      v_target := (v_partner->>'user_id')::uuid;

      select sp.paid
      into v_was_paid
      from public.play_log_session_partners sp
      where sp.session_id = p_session_id
        and sp.participant_kind = 'user'
        and sp.user_id = v_target;

      update public.play_log_session_partners sp
      set paid = v_paid
      where sp.session_id = p_session_id
        and sp.participant_kind = 'user'
        and sp.user_id = v_target;

      get diagnostics v_updated = row_count;

      if v_updated > 0 and v_paid and not coalesce(v_was_paid, false) then
        perform public.play_log_notify_partner_marked_paid(p_session_id, v_target, v_uid);
      elsif v_updated > 0 and not v_paid and coalesce(v_was_paid, false) then
        perform public.play_log_notify_partner_marked_unpaid(p_session_id, v_target, v_uid);
      end if;
    elsif v_kind = 'guest' then
      v_guest := btrim(v_partner->>'guest_label');
      update public.play_log_session_partners sp
      set paid = v_paid
      where sp.session_id = p_session_id
        and sp.participant_kind = 'guest'
        and sp.guest_label = v_guest;
    end if;
  end loop;
end;
$$;

grant execute on function public.play_log_notify_partner_marked_unpaid(uuid, uuid, uuid) to authenticated;
grant execute on function public.play_log_update_session_partners_paid(uuid, jsonb) to authenticated;
