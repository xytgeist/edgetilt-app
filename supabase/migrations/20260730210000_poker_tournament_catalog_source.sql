-- Catalog rows for Live tournament picker (schedule feed).
-- User soft events stay source='user', day-of via ensureTournamentEvent().
-- Apply on TEST first; prod only when Ryan promotes.

alter table public.poker_tournament_events
  add column if not exists source text not null default 'user'
    check (source in ('user', 'catalog')),
  add column if not exists external_id text;

update public.poker_tournament_events
set source = 'user'
where source is distinct from 'user'
  and created_by is not null;

create unique index if not exists poker_tournament_events_catalog_external_uniq
  on public.poker_tournament_events (source, external_id)
  where source = 'catalog' and external_id is not null;

create index if not exists poker_tournament_events_catalog_date_idx
  on public.poker_tournament_events (event_date)
  where source = 'catalog';

-- Users cannot insert/update catalog rows directly.
drop policy if exists "poker_tournament_events_insert" on public.poker_tournament_events;
create policy "poker_tournament_events_insert"
  on public.poker_tournament_events for insert
  to authenticated
  with check (
    auth.uid() = created_by
    and source = 'user'
  );

drop policy if exists "poker_tournament_events_update" on public.poker_tournament_events;
create policy "poker_tournament_events_update"
  on public.poker_tournament_events for update
  to authenticated
  using (
    auth.uid() = created_by
    or (created_by is null and source = 'user')
  );

-- Mirror JS buildTournamentFingerprintKey() for catalog upserts.
create or replace function public.poker_tournament_fingerprint_key(
  p_venue_name text,
  p_event_date date,
  p_buy_in numeric,
  p_game_variant text,
  p_currency text
)
returns text
language plpgsql
immutable
as $$
declare
  v_venue text;
  v_game text;
  v_currency text;
  v_cents bigint;
begin
  v_venue := lower(trim(regexp_replace(coalesce(p_venue_name, ''), '\s+', ' ', 'g')));
  v_game := lower(trim(regexp_replace(coalesce(p_game_variant, ''), '\s+', ' ', 'g')));
  v_currency := upper(coalesce(nullif(trim(p_currency), ''), 'USD'));
  if p_event_date is null or v_venue = '' or p_buy_in is null then
    return null;
  end if;
  v_cents := round(p_buy_in * 100)::bigint;
  if v_cents is null then
    return null;
  end if;
  return v_venue || '|' || to_char(p_event_date, 'YYYY-MM-DD') || '|' || v_cents::text
    || '|' || v_game || '|' || v_currency;
end;
$$;

-- Service-role catalog upsert (+ optional prune of past catalog dates).
create or replace function public.upsert_poker_tournament_catalog(
  p_rows jsonb,
  p_prune_past boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  row jsonb;
  v_external_id text;
  v_venue text;
  v_date date;
  v_buy_in numeric(12, 2);
  v_game text;
  v_currency text;
  v_display text;
  v_fp text;
  v_existing public.poker_tournament_events;
  v_upserted integer := 0;
  v_skipped integer := 0;
  v_pruned integer := 0;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows must be a JSON array';
  end if;

  for row in select * from jsonb_array_elements(p_rows)
  loop
    v_external_id := nullif(trim(row->>'external_id'), '');
    v_venue := nullif(trim(row->>'venue_name'), '');
    v_date := (row->>'event_date')::date;
    v_buy_in := (row->>'buy_in')::numeric(12, 2);
    v_game := nullif(trim(row->>'game_variant'), '');
    v_currency := coalesce(nullif(trim(row->>'currency'), ''), 'USD');
    v_display := nullif(trim(row->>'display_name'), '');

    if v_external_id is null or v_venue is null or v_date is null or v_buy_in is null then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    v_fp := public.poker_tournament_fingerprint_key(v_venue, v_date, v_buy_in, v_game, v_currency);
    if v_fp is null then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    select * into v_existing
    from public.poker_tournament_events
    where source = 'catalog' and external_id = v_external_id;

    if found then
      update public.poker_tournament_events
      set
        fingerprint_key = v_fp,
        venue_name = v_venue,
        event_date = v_date,
        buy_in = v_buy_in,
        game_variant = v_game,
        currency = upper(v_currency),
        display_name = coalesce(v_display, display_name),
        updated_at = now()
      where id = v_existing.id;
      v_upserted := v_upserted + 1;
      continue;
    end if;

    select * into v_existing
    from public.poker_tournament_events
    where fingerprint_key = v_fp and fingerprint_sibling = 0;

    if found then
      if v_existing.source = 'user' then
        v_skipped := v_skipped + 1;
        continue;
      end if;
      update public.poker_tournament_events
      set
        source = 'catalog',
        external_id = v_external_id,
        venue_name = v_venue,
        event_date = v_date,
        buy_in = v_buy_in,
        game_variant = v_game,
        currency = upper(v_currency),
        display_name = coalesce(v_display, display_name),
        created_by = null,
        updated_at = now()
      where id = v_existing.id;
      v_upserted := v_upserted + 1;
      continue;
    end if;

    insert into public.poker_tournament_events (
      source,
      external_id,
      fingerprint_key,
      fingerprint_sibling,
      venue_name,
      event_date,
      buy_in,
      game_variant,
      currency,
      display_name,
      created_by
    ) values (
      'catalog',
      v_external_id,
      v_fp,
      0,
      v_venue,
      v_date,
      v_buy_in,
      v_game,
      upper(v_currency),
      v_display,
      null
    );
    v_upserted := v_upserted + 1;
  end loop;

  if p_prune_past then
    delete from public.poker_tournament_events
    where source = 'catalog'
      and event_date < current_date;
    get diagnostics v_pruned = row_count;
  end if;

  return jsonb_build_object(
    'upserted', v_upserted,
    'skipped', v_skipped,
    'pruned', v_pruned
  );
end;
$$;

revoke all on function public.poker_tournament_fingerprint_key(text, date, numeric, text, text) from public;
grant execute on function public.poker_tournament_fingerprint_key(text, date, numeric, text, text)
  to authenticated, service_role;

revoke all on function public.upsert_poker_tournament_catalog(jsonb, boolean) from public;
grant execute on function public.upsert_poker_tournament_catalog(jsonb, boolean) to service_role;

comment on column public.poker_tournament_events.source is
  'user = crowdsourced day-of soft event; catalog = seeded schedule for Live picker.';
comment on column public.poker_tournament_events.external_id is
  'Stable id for catalog upserts (source=catalog only).';
