-- Play Logbook — creator can update partner attributions when editing a shared play.

drop function if exists public.play_log_update_shared_session(uuid, timestamptz, text, text, jsonb);

create or replace function public.play_log_update_shared_session(
  p_session_id uuid,
  p_captured_at timestamptz,
  p_casino_name text,
  p_notes text,
  p_values jsonb,
  p_partners jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_template_id uuid;
  v_existing_users uuid[];
  v_partner jsonb;
  v_kind text;
  v_target uuid;
  v_guest text;
  v_pct numeric;
  v_sort int := 0;
  v_entry_id uuid;
  v_is_new_user boolean;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if p_partners is null or jsonb_typeof(p_partners) <> 'array' then
    raise exception 'partners required';
  end if;

  if not public.play_log_partners_sum_valid(p_partners) then
    raise exception 'Partner shares must total 100%%';
  end if;

  if not exists (
    select 1
    from jsonb_array_elements(p_partners) elem
    where elem->>'kind' = 'user' and (elem->>'user_id')::uuid = v_uid
  ) then
    raise exception 'Include yourself in partners';
  end if;

  select s.template_id
  into v_template_id
  from public.play_log_sessions s
  where s.id = p_session_id
    and s.created_by_user_id = v_uid;

  if v_template_id is null then
    raise exception 'Only the creator can edit this shared play';
  end if;

  select coalesce(array_agg(sp.user_id), '{}'::uuid[])
  into v_existing_users
  from public.play_log_session_partners sp
  where sp.session_id = p_session_id
    and sp.participant_kind = 'user'
    and sp.user_id is not null;

  for v_partner in select jsonb_array_elements(p_partners)
  loop
    v_kind := v_partner->>'kind';
    v_pct := (v_partner->>'share_percent')::numeric;

    if v_kind = 'user' then
      v_target := (v_partner->>'user_id')::uuid;
      if v_target is null then
        raise exception 'Invalid partner user';
      end if;
      v_is_new_user := not (v_target = any (v_existing_users));
      if v_target <> v_uid
         and v_is_new_user
         and not public.play_log_partner_in_graph(v_uid, v_target) then
        raise exception 'Partner must follow you or be someone you follow';
      end if;
    elsif v_kind = 'guest' then
      v_guest := btrim(v_partner->>'guest_label');
      if v_guest is null or v_guest = '' then
        raise exception 'Guest name required';
      end if;
    else
      raise exception 'Invalid partner kind';
    end if;

    if v_pct is null or v_pct <= 0 or v_pct > 100 then
      raise exception 'Invalid share percent';
    end if;
  end loop;

  update public.play_log_sessions s
  set
    captured_at = coalesce(p_captured_at, s.captured_at),
    casino_name = nullif(btrim(p_casino_name), ''),
    notes = nullif(btrim(p_notes), ''),
    values = coalesce(p_values, s.values),
    updated_at = now()
  where s.id = p_session_id
    and s.created_by_user_id = v_uid;

  update public.play_log_entries e
  set
    captured_at = coalesce(p_captured_at, e.captured_at),
    casino_name = nullif(btrim(p_casino_name), ''),
    notes = nullif(btrim(p_notes), ''),
    values = coalesce(p_values, e.values),
    updated_at = now()
  where e.session_id = p_session_id;

  delete from public.play_log_entries e
  where e.session_id = p_session_id
    and not exists (
      select 1
      from jsonb_array_elements(p_partners) elem
      where elem->>'kind' = 'user'
        and (elem->>'user_id')::uuid = e.user_id
    );

  delete from public.play_log_session_partners sp
  where sp.session_id = p_session_id;

  for v_partner in select jsonb_array_elements(p_partners)
  loop
    v_kind := v_partner->>'kind';
    v_pct := (v_partner->>'share_percent')::numeric;
    v_sort := v_sort + 1;

    insert into public.play_log_session_partners (
      session_id,
      participant_kind,
      user_id,
      guest_label,
      share_percent,
      sort_order
    )
    values (
      p_session_id,
      v_kind,
      case when v_kind = 'user' then (v_partner->>'user_id')::uuid else null end,
      case when v_kind = 'guest' then btrim(v_partner->>'guest_label') else null end,
      v_pct,
      v_sort
    );

    if v_kind = 'user' then
      v_target := (v_partner->>'user_id')::uuid;

      select e.id
      into v_entry_id
      from public.play_log_entries e
      where e.session_id = p_session_id
        and e.user_id = v_target
      limit 1;

      if v_entry_id is null then
        insert into public.play_log_entries (
          user_id,
          session_id,
          template_id,
          captured_at,
          casino_name,
          notes,
          values
        )
        values (
          v_target,
          p_session_id,
          v_template_id,
          coalesce(p_captured_at, now()),
          nullif(btrim(p_casino_name), ''),
          nullif(btrim(p_notes), ''),
          coalesce(p_values, '{}'::jsonb)
        )
        returning id into v_entry_id;

        if v_target <> v_uid then
          perform public.activity_events_insert_safe(
            v_target,
            v_uid,
            'play_log_shared',
            null,
            null,
            v_entry_id
          );
        end if;
      end if;
    end if;
  end loop;
end;
$$;

grant execute on function public.play_log_update_shared_session(uuid, timestamptz, text, text, jsonb, jsonb) to authenticated;
