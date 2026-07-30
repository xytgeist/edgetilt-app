-- Catalog start times for buy-in window filtering + picker labels.
-- Apply on TEST first; prod only when Ryan promotes.

alter table public.poker_tournament_events
  add column if not exists starts_at timestamptz;

create index if not exists poker_tournament_events_catalog_starts_at_idx
  on public.poker_tournament_events (starts_at)
  where source = 'catalog' and starts_at is not null;

comment on column public.poker_tournament_events.starts_at is
  'Optional catalog flight start (timestamptz). Picker uses for ~24h buy-in window when set.';

-- Extend catalog upsert to persist starts_at.
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
  v_starts_at timestamptz;
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
    v_starts_at := nullif(trim(row->>'starts_at'), '')::timestamptz;

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
        starts_at = v_starts_at,
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
        starts_at = v_starts_at,
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
      starts_at,
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
      v_starts_at,
      null
    );
    v_upserted := v_upserted + 1;
  end loop;

  if p_prune_past then
    delete from public.poker_tournament_events
    where source = 'catalog'
      and (
        event_date < current_date
        or (starts_at is not null and starts_at < now() - interval '6 hours')
      );
    get diagnostics v_pruned = row_count;
  end if;

  return jsonb_build_object(
    'upserted', v_upserted,
    'skipped', v_skipped,
    'pruned', v_pruned
  );
end;
$$;
