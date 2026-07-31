-- AP guide content protection: block PostgREST bulk markdown exfiltration; serve via entitlement RPC + audit.
-- Client mirror: src/features/guides/guideAccess.js (keep FREE_GUIDE_SLUGS + starter_weekly_drop_free_guide_slugs in sync).

-- ---------------------------------------------------------------------------
-- Skins search text (list/search without content_markdown)
-- ---------------------------------------------------------------------------
alter table public.guides
  add column if not exists skins_search_text text not null default '';

comment on column public.guides.skins_search_text is
  'Lowercase Skins section body for client search. Synced from content_markdown via trigger.';

create or replace function public.guide_extract_skins_search_text(p_markdown text)
returns text
language plpgsql
immutable
as $$
declare
  v_cleaned text;
  v_chunk text;
  v_header text;
  v_nl int;
  v_body text;
  v_skins text := '';
begin
  if p_markdown is null or btrim(p_markdown) = '' then
    return '';
  end if;

  v_cleaned := regexp_replace(p_markdown, '^#\s[^\n]*\n+', '', 'n');
  v_cleaned := regexp_replace(v_cleaned, '^---\s*\n', '', 'gm');

  for v_chunk in
    select unnest(regexp_split_to_array(v_cleaned, E'\n## '))
  loop
    if btrim(v_chunk) = '' then
      continue;
    end if;
    v_nl := strpos(v_chunk, E'\n');
    if v_nl = 0 then
      v_header := btrim(v_chunk);
      v_body := '';
    else
      v_header := btrim(substring(v_chunk from 1 for v_nl - 1));
      v_body := btrim(substring(v_chunk from v_nl + 1));
    end if;
    if v_header ~* 'Skins' then
      v_skins := v_body;
      exit;
    end if;
  end loop;

  return v_skins;
end;
$$;

comment on function public.guide_extract_skins_search_text(text) is
  'Extract ## Skins body from compiled AP guide markdown (mirrors parseGuideMarkdown).';

create or replace function public.guides_sync_skins_search_text()
returns trigger
language plpgsql
as $$
begin
  new.skins_search_text := lower(public.guide_extract_skins_search_text(new.content_markdown));
  return new;
end;
$$;

drop trigger if exists guides_sync_skins_search_text_trg on public.guides;
create trigger guides_sync_skins_search_text_trg
  before insert or update of content_markdown
  on public.guides
  for each row
  execute function public.guides_sync_skins_search_text();

update public.guides g
set skins_search_text = lower(public.guide_extract_skins_search_text(g.content_markdown))
where g.skins_search_text = ''
   or g.skins_search_text is distinct from lower(public.guide_extract_skins_search_text(g.content_markdown));

-- ---------------------------------------------------------------------------
-- Entitlement helpers (mirror guideAccess.js)
-- ---------------------------------------------------------------------------
create or replace function public.normalize_guide_access_slug(p_slug text)
returns text
language sql
immutable
as $$
  select case
    when lower(trim(coalesce(p_slug, ''))) = 'legends-of-the-phoenix' then 'legend-of-the-phoenix'
    else lower(trim(coalesce(p_slug, '')))
  end;
$$;

create or replace function public.guide_is_pro_only(p_slug text)
returns boolean
language sql
immutable
as $$
  select public.normalize_guide_access_slug(p_slug) = 'buffalo-diamond';
$$;

create or replace function public.guide_code_default_requires_slots_edge(p_slug text)
returns boolean
language sql
stable
as $$
  select not (
    public.normalize_guide_access_slug(p_slug) = any (public.starter_weekly_drop_free_guide_slugs())
  );
$$;

create or replace function public.guide_requires_slots_edge(p_slug text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select g.requires_slots_edge
      from public.content_access_gates g
      where g.content_kind = 'guide'
        and g.content_key = public.normalize_guide_access_slug(p_slug)
    ),
    public.guide_code_default_requires_slots_edge(p_slug)
  );
$$;

revoke all on function public.guide_requires_slots_edge(text) from public;
grant execute on function public.guide_requires_slots_edge(text) to authenticated, anon;

create or replace function public.guide_access_user_is_staff(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.user_id = p_user_id
      and p.role in ('admin', 'moderator')
  );
$$;

revoke all on function public.guide_access_user_is_staff(uuid) from public;
grant execute on function public.guide_access_user_is_staff(uuid) to authenticated, anon;

create or replace function public.guide_access_user_has_full_slots_edge(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.user_has_entitlement(p_user_id, 'slots-edge')
    or public.user_has_entitlement(p_user_id, 'slots-edge-lifetime')
    or coalesce(
      (select p.has_active_subscription from public.profiles p where p.user_id = p_user_id),
      false
    );
$$;

revoke all on function public.guide_access_user_has_full_slots_edge(uuid) from public;
grant execute on function public.guide_access_user_has_full_slots_edge(uuid) to authenticated, anon;

create or replace function public.user_can_open_guide(
  p_slug text,
  p_user_id uuid default auth.uid(),
  p_release_year smallint default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_slug text := public.normalize_guide_access_slug(p_slug);
  v_has_starter boolean := false;
  v_pool_exhausted boolean := false;
begin
  if v_slug = '' then
    return false;
  end if;

  if p_user_id is not null then
    if public.guide_access_user_is_staff(p_user_id) then
      return true;
    end if;
    if public.guide_access_user_has_full_slots_edge(p_user_id) then
      return true;
    end if;
  end if;

  if public.guide_is_pro_only(v_slug) then
    return false;
  end if;

  if p_user_id is not null and public.user_has_entitlement(p_user_id, 'slots-edge-starter') then
    v_has_starter := true;
    if p_release_year is not null and p_release_year <= 2019 then
      return true;
    end if;
    if exists (
      select 1
      from public.starter_weekly_guide_unlocks u
      where u.user_id = p_user_id
        and lower(trim(u.guide_slug)) = v_slug
    ) then
      return true;
    end if;
    v_pool_exhausted := public.starter_has_exhausted_weekly_drop_pool(p_user_id);
    if v_pool_exhausted
      and p_release_year is not null
      and p_release_year >= 2020
      and not (v_slug = any (public.starter_weekly_drop_free_guide_slugs()))
    then
      return true;
    end if;
  end if;

  return not public.guide_requires_slots_edge(v_slug);
end;
$$;

comment on function public.user_can_open_guide(text, uuid, smallint) is
  'Server-side AP guide open check. Mirror guideAccess.canOpenGuide(); keep in sync with guideAccess.js.';

revoke all on function public.user_can_open_guide(text, uuid, smallint) from public;
grant execute on function public.user_can_open_guide(text, uuid, smallint) to authenticated, anon;

-- ---------------------------------------------------------------------------
-- Audit + rate limit
-- ---------------------------------------------------------------------------
create table if not exists public.guide_read_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  guide_id uuid references public.guides (id) on delete set null,
  guide_slug text not null,
  granted boolean not null,
  deny_reason text,
  created_at timestamptz not null default now()
);

create index if not exists guide_read_events_created_at_idx
  on public.guide_read_events (created_at desc);

create index if not exists guide_read_events_user_granted_created_idx
  on public.guide_read_events (user_id, created_at desc)
  where granted = true;

create index if not exists guide_read_events_anon_granted_created_idx
  on public.guide_read_events (created_at desc)
  where user_id is null and granted = true;

comment on table public.guide_read_events is
  'Granted/denied AP guide content reads via get_guide_content(). Admin aggregates in admin_ops_security_snapshot().';

alter table public.guide_read_events enable row level security;

drop policy if exists guide_read_events_admin_select on public.guide_read_events;
create policy guide_read_events_admin_select
  on public.guide_read_events
  for select
  to authenticated
  using (public.play_log_viewer_is_admin());

create or replace function public.guide_content_read_rate_limit_exceeded(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_user_id is not null then (
      select count(*) >= 120
      from public.guide_read_events e
      where e.user_id = p_user_id
        and e.granted = true
        and e.created_at >= now() - interval '1 hour'
    )
    else (
      select count(*) >= 300
      from public.guide_read_events e
      where e.user_id is null
        and e.granted = true
        and e.created_at >= now() - interval '1 hour'
    )
  end;
$$;

revoke all on function public.guide_content_read_rate_limit_exceeded(uuid) from public;

create or replace function public.guide_log_read_event(
  p_user_id uuid,
  p_guide_id uuid,
  p_guide_slug text,
  p_granted boolean,
  p_deny_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.guide_read_events (user_id, guide_id, guide_slug, granted, deny_reason)
  values (p_user_id, p_guide_id, coalesce(p_guide_slug, ''), coalesce(p_granted, false), p_deny_reason);
exception
  when others then
    raise warning 'guide_log_read_event: %', sqlerrm;
end;
$$;

revoke all on function public.guide_log_read_event(uuid, uuid, text, boolean, text) from public;

-- ---------------------------------------------------------------------------
-- Member-facing content fetch
-- ---------------------------------------------------------------------------
create or replace function public.get_guide_content(p_slug text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_norm text := public.normalize_guide_access_slug(p_slug);
  v_row record;
  v_can_open boolean;
  v_deny text;
begin
  if v_norm = '' then
    perform public.guide_log_read_event(v_uid, null, v_norm, false, 'missing_slug');
    raise exception 'guide not found' using errcode = 'P0002';
  end if;

  select
    g.id,
    g.slug,
    g.title,
    g.content_markdown,
    m.release_year
  into v_row
  from public.guides g
  left join public.machines m on m.id = g.machine_id
  where g.published = true
    and (
      public.normalize_guide_access_slug(g.slug) = v_norm
      or public.normalize_guide_access_slug(m.slug) = v_norm
    )
  order by g.updated_at desc nulls last
  limit 1;

  if v_row.id is null then
    perform public.guide_log_read_event(v_uid, null, v_norm, false, 'not_found');
    raise exception 'guide not found' using errcode = 'P0002';
  end if;

  v_can_open := public.user_can_open_guide(v_norm, v_uid, v_row.release_year);

  if not v_can_open then
    perform public.guide_log_read_event(v_uid, v_row.id, v_norm, false, 'access_denied');
    raise exception 'guide access denied' using errcode = '42501';
  end if;

  if public.guide_content_read_rate_limit_exceeded(v_uid) then
    perform public.guide_log_read_event(v_uid, v_row.id, v_norm, false, 'rate_limit');
    raise exception 'guide read rate limit exceeded' using errcode = '53300';
  end if;

  perform public.guide_log_read_event(v_uid, v_row.id, v_norm, true, null);

  return jsonb_build_object(
    'id', v_row.id,
    'slug', v_row.slug,
    'title', v_row.title,
    'content_markdown', v_row.content_markdown
  );
end;
$$;

comment on function public.get_guide_content(text) is
  'Entitlement-checked AP guide markdown fetch. Replaces direct SELECT on guides.content_markdown.';

revoke all on function public.get_guide_content(text) from public;
grant execute on function public.get_guide_content(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Admin slot-guide-form load (admin role only)
-- ---------------------------------------------------------------------------
create or replace function public.admin_get_guide_for_edit(p_guide_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if not public.play_log_viewer_is_admin() then
    raise exception 'admin only';
  end if;

  select jsonb_build_object(
    'id', g.id,
    'slug', g.slug,
    'title', g.title,
    'content_markdown', g.content_markdown,
    'card_ev_threshold', g.card_ev_threshold,
    'published', g.published,
    'thumbnail_url', g.thumbnail_url,
    'created_at', g.created_at,
    'updated_at', g.updated_at,
    'machines', (
      select jsonb_build_object(
        'id', m.id,
        'slug', m.slug,
        'name', m.name,
        'manufacturer', m.manufacturer,
        'type', m.type,
        'difficulty', m.difficulty,
        'popularity', m.popularity,
        'nerf_risk', m.nerf_risk,
        'volatility_index', m.volatility_index,
        'popularity_summary', m.popularity_summary,
        'release_year', m.release_year,
        'has_calculator', m.has_calculator,
        'calculator_slug', m.calculator_slug,
        'thumbnail_url', m.thumbnail_url
      )
      from public.machines m
      where m.id = g.machine_id
    )
  )
  into v_row
  from public.guides g
  where g.id = p_guide_id;

  if v_row is null then
    raise exception 'guide not found' using errcode = 'P0002';
  end if;

  return v_row;
end;
$$;

comment on function public.admin_get_guide_for_edit(uuid) is
  'Admin slot-guide-form: load full guide row including content_markdown without column grant.';

revoke all on function public.admin_get_guide_for_edit(uuid) from public;
grant execute on function public.admin_get_guide_for_edit(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Revoke direct markdown reads (PostgREST scrape vector)
-- ---------------------------------------------------------------------------
revoke select (content_markdown) on table public.guides from anon, authenticated;
