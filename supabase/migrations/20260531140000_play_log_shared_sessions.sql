-- Play Logbook — shared plays (sessions, partners, fan-out, Lounge notifications).

-- ---------------------------------------------------------------------------
-- 1) Sessions + partners
-- ---------------------------------------------------------------------------
create table if not exists public.play_log_sessions (
  id              uuid        primary key default gen_random_uuid(),
  created_by_user_id uuid     not null references auth.users(id) on delete cascade,
  template_id     uuid        not null references public.play_log_game_templates(id) on delete restrict,
  captured_at     timestamptz not null default now(),
  casino_name     text,
  notes           text,
  values          jsonb       not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists play_log_sessions_creator_idx
  on public.play_log_sessions (created_by_user_id, captured_at desc);

create table if not exists public.play_log_session_partners (
  id              uuid        primary key default gen_random_uuid(),
  session_id      uuid        not null references public.play_log_sessions(id) on delete cascade,
  participant_kind text       not null check (participant_kind in ('user', 'guest')),
  user_id         uuid        references auth.users(id) on delete cascade,
  guest_label     text,
  share_percent   numeric(6,2) not null check (share_percent > 0 and share_percent <= 100),
  sort_order      int         not null default 0,
  created_at      timestamptz not null default now(),
  constraint play_log_session_partners_user_chk check (
    (participant_kind = 'user' and user_id is not null and guest_label is null)
    or (participant_kind = 'guest' and user_id is null and guest_label is not null and btrim(guest_label) <> '')
  )
);

create unique index if not exists play_log_session_partners_user_unique
  on public.play_log_session_partners (session_id, user_id)
  where participant_kind = 'user' and user_id is not null;

create index if not exists play_log_session_partners_session_idx
  on public.play_log_session_partners (session_id, sort_order);

alter table public.play_log_entries
  add column if not exists session_id uuid references public.play_log_sessions(id) on delete cascade;

create index if not exists play_log_entries_session_idx
  on public.play_log_entries (session_id)
  where session_id is not null;

create unique index if not exists play_log_entries_session_user_unique
  on public.play_log_entries (session_id, user_id)
  where session_id is not null;

drop trigger if exists play_log_sessions_updated_at on public.play_log_sessions;
create trigger play_log_sessions_updated_at
  before update on public.play_log_sessions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2) activity_events — play_log_shared
-- ---------------------------------------------------------------------------
alter table public.activity_events
  add column if not exists play_log_entry_id uuid references public.play_log_entries(id) on delete cascade;

create index if not exists activity_events_play_log_entry_idx
  on public.activity_events (play_log_entry_id)
  where play_log_entry_id is not null;

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
      'play_log_shared'
    )
  );

create or replace function public.activity_events_insert_safe(
  p_recipient uuid,
  p_actor uuid,
  p_event_type text,
  p_post_id uuid default null,
  p_comment_id uuid default null,
  p_play_log_entry_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_recipient is null or p_actor is null or p_recipient = p_actor then
    return;
  end if;

  insert into public.activity_events (
    recipient_user_id,
    actor_user_id,
    event_type,
    post_id,
    comment_id,
    play_log_entry_id
  )
  values (p_recipient, p_actor, p_event_type, p_post_id, p_comment_id, p_play_log_entry_id);
exception
  when others then
    raise warning 'activity_events_insert_safe: %', sqlerrm;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3) RLS — sessions / partners
-- ---------------------------------------------------------------------------
alter table public.play_log_sessions enable row level security;
alter table public.play_log_session_partners enable row level security;

drop policy if exists play_log_sessions_select on public.play_log_sessions;
create policy play_log_sessions_select on public.play_log_sessions
  for select to authenticated
  using (
    created_by_user_id = auth.uid()
    or exists (
      select 1
      from public.play_log_entries e
      where e.session_id = play_log_sessions.id
        and e.user_id = auth.uid()
    )
  );

drop policy if exists play_log_session_partners_select on public.play_log_session_partners;
create policy play_log_session_partners_select on public.play_log_session_partners
  for select to authenticated
  using (
    exists (
      select 1
      from public.play_log_sessions s
      where s.id = play_log_session_partners.session_id
        and (
          s.created_by_user_id = auth.uid()
          or exists (
            select 1
            from public.play_log_entries e
            where e.session_id = s.id and e.user_id = auth.uid()
          )
        )
    )
  );

-- ---------------------------------------------------------------------------
-- 4) Helpers
-- ---------------------------------------------------------------------------
create or replace function public.play_log_partner_in_graph(p_creator uuid, p_target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profile_follows pf
    where pf.follower_id = p_creator and pf.following_id = p_target
  )
  or exists (
    select 1
    from public.profile_follows pf
    where pf.following_id = p_creator and pf.follower_id = p_target
  );
$$;

create or replace function public.play_log_partners_sum_valid(p_partners jsonb)
returns boolean
language plpgsql
immutable
as $$
declare
  v_sum numeric;
begin
  if p_partners is null or jsonb_typeof(p_partners) <> 'array' or jsonb_array_length(p_partners) = 0 then
    return false;
  end if;
  select coalesce(sum((elem->>'share_percent')::numeric), 0)
  into v_sum
  from jsonb_array_elements(p_partners) as elem;
  return abs(v_sum - 100) < 0.02;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5) Partner picker RPC (followers ∪ following)
-- ---------------------------------------------------------------------------
create or replace function public.play_log_partner_candidates()
returns table (
  user_id uuid,
  handle text,
  display_name text,
  avatar_url text,
  role text,
  is_og boolean
)
language sql
stable
security invoker
set search_path = public
as $$
  with edges as (
    select pf.following_id as uid
    from public.profile_follows pf
    where pf.follower_id = auth.uid()
    union
    select pf.follower_id as uid
    from public.profile_follows pf
    where pf.following_id = auth.uid()
  ),
  ids as (
    select distinct e.uid
    from edges e
    where e.uid is not null and e.uid <> auth.uid()
  )
  select
    p.user_id,
    p.handle,
    p.display_name,
    p.avatar_url,
    p.role,
    coalesce(p.is_og, false) as is_og
  from ids
  join public.profiles p on p.user_id = ids.uid
  order by coalesce(nullif(btrim(p.display_name), ''), p.handle) asc nulls last;
$$;

grant execute on function public.play_log_partner_candidates() to authenticated;

-- ---------------------------------------------------------------------------
-- 6) Save shared session (fan-out + notifications)
-- ---------------------------------------------------------------------------
create or replace function public.play_log_save_shared_session(
  p_template_id uuid,
  p_captured_at timestamptz,
  p_casino_name text,
  p_notes text,
  p_values jsonb,
  p_partners jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_session_id uuid;
  v_partner jsonb;
  v_kind text;
  v_target uuid;
  v_guest text;
  v_pct numeric;
  v_sort int := 0;
  v_entry_id uuid;
  v_has_extra_partner boolean := false;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if p_template_id is null then
    raise exception 'template_id required';
  end if;

  if not public.play_log_partners_sum_valid(p_partners) then
    raise exception 'Partner shares must total 100%%';
  end if;

  if not exists (
    select 1 from public.play_log_game_templates t
    where t.id = p_template_id and (t.is_system = true or t.user_id = v_uid)
  ) then
    raise exception 'Invalid game template';
  end if;

  for v_partner in select jsonb_array_elements(p_partners)
  loop
    v_kind := v_partner->>'kind';
    v_pct := (v_partner->>'share_percent')::numeric;
    if v_kind = 'user' then
      v_target := (v_partner->>'user_id')::uuid;
      if v_target is null then
        raise exception 'Invalid partner user';
      end if;
      if v_target <> v_uid and not public.play_log_partner_in_graph(v_uid, v_target) then
        raise exception 'Partner must follow you or be someone you follow';
      end if;
      if v_target <> v_uid then
        v_has_extra_partner := true;
      end if;
    elsif v_kind = 'guest' then
      v_guest := btrim(v_partner->>'guest_label');
      if v_guest is null or v_guest = '' then
        raise exception 'Guest name required';
      end if;
      v_has_extra_partner := true;
    else
      raise exception 'Invalid partner kind';
    end if;
    if v_pct is null or v_pct <= 0 or v_pct > 100 then
      raise exception 'Invalid share percent';
    end if;
  end loop;

  if not v_has_extra_partner then
    raise exception 'Add at least one partner or save without shared session';
  end if;

  if not exists (
    select 1
    from jsonb_array_elements(p_partners) elem
    where elem->>'kind' = 'user' and (elem->>'user_id')::uuid = v_uid
  ) then
    raise exception 'Include yourself in partners';
  end if;

  insert into public.play_log_sessions (
    created_by_user_id,
    template_id,
    captured_at,
    casino_name,
    notes,
    values
  )
  values (
    v_uid,
    p_template_id,
    coalesce(p_captured_at, now()),
    nullif(btrim(p_casino_name), ''),
    nullif(btrim(p_notes), ''),
    coalesce(p_values, '{}'::jsonb)
  )
  returning id into v_session_id;

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
      v_session_id,
      v_kind,
      case when v_kind = 'user' then (v_partner->>'user_id')::uuid else null end,
      case when v_kind = 'guest' then btrim(v_partner->>'guest_label') else null end,
      v_pct,
      v_sort
    );

    if v_kind = 'user' then
      v_target := (v_partner->>'user_id')::uuid;
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
        v_session_id,
        p_template_id,
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
  end loop;

  return jsonb_build_object(
    'session_id', v_session_id,
    'creator_entry_id', (
      select e.id
      from public.play_log_entries e
      where e.session_id = v_session_id and e.user_id = v_uid
      limit 1
    )
  );
end;
$$;

grant execute on function public.play_log_save_shared_session(uuid, timestamptz, text, text, jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 7) Update / delete session (creator only)
-- ---------------------------------------------------------------------------
create or replace function public.play_log_update_shared_session(
  p_session_id uuid,
  p_captured_at timestamptz,
  p_casino_name text,
  p_notes text,
  p_values jsonb
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

  update public.play_log_sessions s
  set
    captured_at = coalesce(p_captured_at, s.captured_at),
    casino_name = nullif(btrim(p_casino_name), ''),
    notes = nullif(btrim(p_notes), ''),
    values = coalesce(p_values, s.values),
    updated_at = now()
  where s.id = p_session_id
    and s.created_by_user_id = v_uid;

  if not found then
    raise exception 'Only the creator can edit this shared play';
  end if;

  update public.play_log_entries e
  set
    captured_at = coalesce(p_captured_at, e.captured_at),
    casino_name = nullif(btrim(p_casino_name), ''),
    notes = nullif(btrim(p_notes), ''),
    values = coalesce(p_values, e.values),
    updated_at = now()
  where e.session_id = p_session_id;
end;
$$;

grant execute on function public.play_log_update_shared_session(uuid, timestamptz, text, text, jsonb) to authenticated;

create or replace function public.play_log_delete_shared_session(p_session_id uuid)
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

  delete from public.play_log_sessions s
  where s.id = p_session_id
    and s.created_by_user_id = v_uid;

  if not found then
    raise exception 'Only the creator can delete this shared play for everyone';
  end if;
end;
$$;

grant execute on function public.play_log_delete_shared_session(uuid) to authenticated;

create or replace function public.play_log_session_partners_list(p_session_id uuid)
returns table (
  id uuid,
  participant_kind text,
  user_id uuid,
  guest_label text,
  share_percent numeric,
  sort_order int,
  handle text,
  display_name text,
  avatar_url text
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    sp.id,
    sp.participant_kind,
    sp.user_id,
    sp.guest_label,
    sp.share_percent,
    sp.sort_order,
    p.handle,
    p.display_name,
    p.avatar_url
  from public.play_log_session_partners sp
  join public.play_log_sessions s on s.id = sp.session_id
  left join public.profiles p on p.user_id = sp.user_id
  where sp.session_id = p_session_id
    and (
      s.created_by_user_id = auth.uid()
      or exists (
        select 1
        from public.play_log_entries e
        where e.session_id = s.id and e.user_id = auth.uid()
      )
    )
  order by sp.sort_order asc;
$$;

grant execute on function public.play_log_session_partners_list(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 8) Lounge activity page — play log fields
-- ---------------------------------------------------------------------------
drop function if exists public.lounge_activity_events_page(integer, timestamptz, uuid);

create or replace function public.lounge_activity_events_page(
  p_limit integer default 30,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null
)
returns table (
  id uuid,
  event_type text,
  post_id uuid,
  comment_id uuid,
  play_log_entry_id uuid,
  read_at timestamptz,
  created_at timestamptz,
  actor_user_id uuid,
  actor_handle text,
  actor_display_name text,
  actor_avatar_url text,
  actor_role text,
  actor_is_og boolean,
  play_log_game_name text,
  play_log_share_percent numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    ae.id,
    ae.event_type,
    ae.post_id,
    ae.comment_id,
    ae.play_log_entry_id,
    ae.read_at,
    ae.created_at,
    ae.actor_user_id,
    p.handle as actor_handle,
    p.display_name as actor_display_name,
    p.avatar_url as actor_avatar_url,
    p.role as actor_role,
    coalesce(p.is_og, false) as actor_is_og,
    tpl.display_name as play_log_game_name,
    sp.share_percent as play_log_share_percent
  from public.activity_events ae
  join public.profiles p on p.user_id = ae.actor_user_id
  left join public.play_log_entries ple on ple.id = ae.play_log_entry_id
  left join public.play_log_game_templates tpl on tpl.id = ple.template_id
  left join public.play_log_session_partners sp
    on sp.session_id = ple.session_id
   and sp.user_id = auth.uid()
   and sp.participant_kind = 'user'
  where ae.recipient_user_id = auth.uid()
    and (
      p_before_created_at is null
      or p_before_id is null
      or (ae.created_at, ae.id) < (p_before_created_at, p_before_id)
    )
  order by ae.created_at desc, ae.id desc
  limit greatest(1, least(coalesce(p_limit, 30), 50));
$$;

grant execute on function public.lounge_activity_events_page(integer, timestamptz, uuid) to authenticated;
