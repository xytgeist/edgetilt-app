-- UFC Fighter Metrics & Octagon Grappling/Striking Efficiency table
-- Provides official UFC Stats metrics (SLpM, SApM, Str Acc/Def, TD Avg/Def, Sub Avg, Finish Rates)
-- and automated UFC 4-Desk Syndicate card execution for Scott, Rocco, Chedda, and Tank.

do $$
begin
  -- 1. Create table
  create table if not exists public.ufc_fighter_metrics (
    id uuid default gen_random_uuid() primary key,
    fighter_name text not null unique,
    division text not null,
    reach_inches numeric not null default 70.0,
    stance text not null check (stance in ('Orthodox', 'Southpaw', 'Switch')),
    slpm numeric not null default 4.0,
    sapm numeric not null default 3.0,
    str_acc numeric not null default 50.0,
    str_def numeric not null default 55.0,
    td_avg numeric not null default 1.5,
    td_acc numeric not null default 40.0,
    td_def numeric not null default 65.0,
    sub_avg numeric not null default 0.5,
    finish_rate numeric not null default 55.0,
    ko_finish_rate numeric not null default 35.0,
    sub_finish_rate numeric not null default 20.0,
    is_custom_override boolean not null default false,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
  );

  -- 2. Enable RLS
  alter table public.ufc_fighter_metrics enable row level security;

  -- 3. Public read policy
  drop policy if exists "Public read ufc_fighter_metrics" on public.ufc_fighter_metrics;
  create policy "Public read ufc_fighter_metrics"
    on public.ufc_fighter_metrics
    for select
    using (true);

  -- 4. Staff & Service role update policy
  drop policy if exists "Staff and service manage ufc_fighter_metrics" on public.ufc_fighter_metrics;
  create policy "Staff and service manage ufc_fighter_metrics"
    on public.ufc_fighter_metrics
    for all
    using (
      auth.role() = 'service_role'
      or exists (
        select 1 from public.profiles
        where profiles.user_id = auth.uid()
          and profiles.role in ('admin', 'moderator', 'staff')
      )
    )
    with check (
      auth.role() = 'service_role'
      or exists (
        select 1 from public.profiles
        where profiles.user_id = auth.uid()
          and profiles.role in ('admin', 'moderator', 'staff')
      )
    );

  -- 5. Seed initial baseline metrics for top active UFC fighters
  insert into public.ufc_fighter_metrics (
    fighter_name, division, reach_inches, stance, slpm, sapm, str_acc, str_def, td_avg, td_acc, td_def, sub_avg, finish_rate, ko_finish_rate, sub_finish_rate
  ) values
    ('Sean O''Malley', 'Bantamweight', 72.0, 'Switch', 7.29, 3.52, 61, 62, 0.45, 42, 62, 0.5, 71, 65, 6),
    ('Merab Dvalishvili', 'Bantamweight', 68.0, 'Orthodox', 4.48, 2.39, 41, 62, 6.43, 36, 80, 0.3, 24, 18, 6),
    ('Umar Nurmagomedov', 'Bantamweight', 69.0, 'Southpaw', 4.75, 0.76, 69, 78, 4.51, 50, 100, 0.6, 53, 12, 41),
    ('Song Yadong', 'Bantamweight', 67.0, 'Orthodox', 4.38, 3.74, 42, 59, 0.65, 42, 74, 0.3, 57, 43, 14),
    ('Cory Sandhagen', 'Bantamweight', 70.0, 'Switch', 5.33, 3.84, 44, 57, 1.36, 33, 65, 0.4, 53, 41, 12),
    ('Petr Yan', 'Bantamweight', 67.0, 'Switch', 5.11, 4.02, 53, 60, 1.71, 52, 85, 0.2, 47, 41, 6),
    ('Ilia Topuria', 'Featherweight', 69.0, 'Orthodox', 4.40, 3.35, 46, 65, 1.92, 56, 92, 1.3, 87, 33, 54),
    ('Max Holloway', 'Featherweight', 69.0, 'Orthodox', 7.17, 4.73, 48, 59, 0.27, 53, 84, 0.3, 50, 42, 8),
    ('Alexander Volkanovski', 'Featherweight', 71.5, 'Orthodox', 6.19, 3.42, 57, 59, 1.78, 38, 70, 0.2, 62, 50, 12),
    ('Diego Lopes', 'Featherweight', 72.5, 'Orthodox', 3.24, 4.12, 55, 42, 0.88, 50, 45, 4.5, 88, 40, 48),
    ('Movsar Evloev', 'Featherweight', 72.5, 'Orthodox', 4.71, 2.74, 49, 61, 4.41, 49, 71, 0.3, 39, 17, 22),
    ('Islam Makhachev', 'Lightweight', 70.5, 'Southpaw', 2.46, 1.24, 60, 61, 3.17, 61, 90, 1.1, 65, 19, 46),
    ('Arman Tsarukyan', 'Lightweight', 72.5, 'Orthodox', 3.89, 1.94, 48, 54, 3.27, 36, 75, 0.8, 64, 41, 23),
    ('Justin Gaethje', 'Lightweight', 70.0, 'Orthodox', 7.03, 7.50, 60, 53, 0.13, 25, 75, 0.0, 84, 80, 4),
    ('Dustin Poirier', 'Lightweight', 72.0, 'Southpaw', 5.45, 4.29, 51, 53, 1.36, 36, 63, 1.2, 77, 50, 27),
    ('Charles Oliveira', 'Lightweight', 74.0, 'Orthodox', 3.54, 3.19, 54, 51, 2.32, 41, 55, 2.7, 91, 29, 62),
    ('Belal Muhammad', 'Welterweight', 72.0, 'Orthodox', 4.55, 3.64, 43, 60, 2.20, 35, 93, 0.2, 25, 21, 4),
    ('Shavkat Rakhmonov', 'Welterweight', 77.0, 'Orthodox', 4.38, 2.61, 59, 53, 1.49, 50, 100, 1.5, 100, 44, 56),
    ('Leon Edwards', 'Welterweight', 74.0, 'Southpaw', 2.75, 2.34, 53, 54, 1.23, 34, 70, 0.4, 41, 32, 9),
    ('Kamaru Usman', 'Welterweight', 76.0, 'Switch', 4.57, 3.14, 52, 58, 2.82, 45, 97, 0.1, 50, 45, 5),
    ('Ian Garry', 'Welterweight', 74.5, 'Orthodox', 6.27, 3.65, 56, 53, 0.58, 75, 69, 0.0, 53, 47, 6),
    ('Jack Della Maddalena', 'Welterweight', 73.0, 'Switch', 7.20, 4.83, 53, 67, 0.27, 20, 71, 0.5, 82, 71, 11),
    ('Dricus Du Plessis', 'Middleweight', 76.0, 'Switch', 6.49, 4.77, 55, 55, 3.00, 50, 40, 1.3, 90, 43, 47),
    ('Israel Adesanya', 'Middleweight', 80.0, 'Switch', 3.93, 3.11, 48, 56, 0.06, 14, 77, 0.2, 67, 67, 0),
    ('Sean Strickland', 'Middleweight', 76.0, 'Orthodox', 5.92, 4.17, 41, 62, 0.85, 64, 77, 0.2, 52, 38, 14),
    ('Robert Whittaker', 'Middleweight', 73.5, 'Orthodox', 4.58, 3.42, 42, 60, 0.81, 38, 82, 0.0, 58, 38, 20),
    ('Khamzat Chimaev', 'Middleweight', 75.0, 'Orthodox', 4.09, 3.25, 58, 55, 3.99, 46, 100, 2.7, 85, 46, 39),
    ('Alex Pereira', 'Light Heavyweight', 79.0, 'Orthodox', 5.10, 3.65, 63, 51, 0.18, 100, 70, 0.0, 83, 83, 0),
    ('Magomed Ankalaev', 'Light Heavyweight', 75.0, 'Southpaw', 3.64, 2.25, 53, 59, 1.02, 31, 86, 0.1, 58, 53, 5),
    ('Jiri Prochazka', 'Light Heavyweight', 80.5, 'Orthodox', 5.75, 5.43, 55, 40, 0.68, 100, 68, 0.3, 97, 87, 10),
    ('Jan Blachowicz', 'Light Heavyweight', 78.0, 'Orthodox', 3.41, 2.87, 49, 54, 1.06, 53, 68, 0.2, 62, 31, 31),
    ('Jon Jones', 'Heavyweight', 84.5, 'Orthodox', 4.30, 2.22, 58, 64, 1.85, 45, 95, 0.5, 63, 37, 26),
    ('Tom Aspinall', 'Heavyweight', 78.0, 'Orthodox', 7.72, 2.77, 66, 67, 3.32, 100, 100, 1.7, 100, 73, 27),
    ('Ciryl Gane', 'Heavyweight', 81.0, 'Orthodox', 5.08, 2.20, 59, 62, 0.61, 21, 55, 0.2, 67, 50, 17),
    ('Alexander Volkov', 'Heavyweight', 80.0, 'Orthodox', 4.86, 3.00, 57, 54, 0.49, 62, 73, 0.1, 73, 63, 10),
    ('Alexandre Pantoja', 'Flyweight', 67.0, 'Orthodox', 4.32, 3.90, 49, 51, 2.20, 44, 67, 1.1, 68, 29, 39),
    ('Brandon Royval', 'Flyweight', 68.0, 'Southpaw', 4.36, 3.73, 44, 49, 0.70, 50, 60, 1.8, 81, 25, 56),
    ('Brandon Moreno', 'Flyweight', 70.0, 'Orthodox', 3.80, 3.40, 43, 56, 1.73, 45, 65, 0.5, 67, 24, 43)
  on conflict (fighter_name) do nothing;

  -- 6. Update invoke_lounge_odds_poll with ufc_slate_card
  execute $func$
    create or replace function public.invoke_lounge_odds_poll(p_action text, p_force boolean default false)
    returns void
    language plpgsql
    security definer
    set search_path = public, vault, net, cron, extensions, pg_temp
    as $body$
    declare
      service_key text;
      base_url text;
      req_id bigint;
      bot record;
      action text;
      body jsonb;
    begin
      action := lower(btrim(coalesce(p_action, '')));
      if action not in ('poll_edges', 'poll_live', 'daily_slates', 'best_bet_hour', 'value_bet_radar', 'grade_picks', 'predictive_pick', 'nfl_slate_card', 'nfl_wong_teaser', 'nfl_primetime_spotlight', 'nfl_halftime_pivot', 'nfl_anytime_td', 'nfl_live_middle_arb', 'weekly_syndicate_recap', 'calibrate_persona_models', 'ufc_slate_card') then
        raise warning 'invoke_lounge_odds_poll: action must be valid odds poll action (got %)', p_action;
        return;
      end if;

      select btrim(ds.decrypted_secret)
      into service_key
      from vault.decrypted_secrets as ds
      where ds.name = 'lounge_odds_poll_service_role_key'
      limit 1;

      select btrim(ds.decrypted_secret)
      into base_url
      from vault.decrypted_secrets as ds
      where ds.name = 'lounge_odds_poll_project_url'
      limit 1;

      if service_key is null or service_key = '' then
        raise warning 'invoke_lounge_odds_poll: add vault secret lounge_odds_poll_service_role_key (service_role JWT)';
        return;
      end if;

      if base_url is null or btrim(base_url) = '' then
        raise warning 'invoke_lounge_odds_poll: add vault secret lounge_odds_poll_project_url';
        return;
      end if;

      if service_key ~* '^bearer\s+' then
        service_key := btrim(regexp_replace(service_key, '^[Bb]earer\s+', ''));
      end if;

      base_url := rtrim(btrim(base_url), '/');

      for bot in
        select a.slug
        from public.lounge_bot_accounts a
        where a.pipeline = 'odds_api'
          and a.run_state = 'running'
          and a.enabled = true
        order by a.slug
      loop
        body := jsonb_build_object(
          'slug', bot.slug,
          'action', action,
          'force', coalesce(p_force, false)
        );

        select net.http_post(
          url := base_url || '/functions/v1/lounge-odds-poll',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || service_key
          ),
          body := body,
          timeout_milliseconds := 60000
        ) into req_id;
      end loop;
    end;
    $body$;
  $func$;

  -- 7. Helper function to invoke UFC slate card drop
  execute 'drop function if exists public.invoke_lounge_odds_ufc_card(text);';
  execute 'drop function if exists public.invoke_lounge_odds_ufc_card(boolean);';
  execute $func$
    create or replace function public.invoke_lounge_odds_ufc_card(p_force boolean default false)
    returns void
    language plpgsql
    security definer
    set search_path = public, extensions
    as $body$
    begin
      perform public.invoke_lounge_odds_poll(
        'ufc_slate_card',
        p_force
      );
    end;
    $body$;
  $func$;

  execute 'revoke all on function public.invoke_lounge_odds_ufc_card(boolean) from public, anon';
  execute 'grant execute on function public.invoke_lounge_odds_ufc_card(boolean) to authenticated, service_role';

  -- 8. Schedule Saturday Morning UFC Syndicate Card Drop (9:00 AM PT / 16:00 UTC)
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'lounge_bot_ufc_saturday_card') then
      perform cron.unschedule('lounge_bot_ufc_saturday_card');
    end if;

    perform cron.schedule(
      'lounge_bot_ufc_saturday_card',
      '0 16 * * 6', -- Saturday @ 9:00 AM PT (16:00 UTC)
      'select public.invoke_lounge_odds_ufc_card(false)'
    );
  end if;

end $$;
