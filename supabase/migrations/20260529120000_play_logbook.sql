-- ============================================================
-- Play Logbook schema
-- Run on Supabase test (and prod when promoted).
-- ============================================================

-- ── Metric catalog (shared field definitions) ─────────────────

create table if not exists public.play_log_metric_defs (
  slug        text        primary key,
  label       text        not null,
  value_type  text        not null check (value_type in ('integer', 'money', 'decimal', 'text')),
  sort_order  int         not null default 0
);

-- ── Game templates (system + user custom) ─────────────────────

create table if not exists public.play_log_game_templates (
  id               uuid        primary key default gen_random_uuid(),
  user_id          uuid        references auth.users(id) on delete cascade,
  slug             text,
  display_name     text        not null,
  machine_slug     text,
  calculator_slug  text,
  metric_slugs         text[]      not null,
  custom_metric_defs   jsonb       not null default '[]'::jsonb,
  is_system            boolean     not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint play_log_templates_system_no_user check (
    (is_system = true and user_id is null) or (is_system = false and user_id is not null)
  )
);

create unique index if not exists play_log_game_templates_system_slug_unique
  on public.play_log_game_templates (slug)
  where is_system = true and slug is not null;

create index if not exists play_log_game_templates_user_idx
  on public.play_log_game_templates (user_id)
  where user_id is not null;

-- ── Captured play rows ────────────────────────────────────────

create table if not exists public.play_log_entries (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references auth.users(id) on delete cascade,
  template_id  uuid        not null references public.play_log_game_templates(id) on delete restrict,
  captured_at  timestamptz not null default now(),
  casino_name  text,
  notes        text,
  values       jsonb       not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists play_log_entries_user_captured_idx
  on public.play_log_entries (user_id, captured_at desc);

create index if not exists play_log_entries_template_idx
  on public.play_log_entries (template_id);

-- ── updated_at ────────────────────────────────────────────────

drop trigger if exists play_log_game_templates_updated_at on public.play_log_game_templates;
create trigger play_log_game_templates_updated_at
  before update on public.play_log_game_templates
  for each row execute function public.set_updated_at();

drop trigger if exists play_log_entries_updated_at on public.play_log_entries;
create trigger play_log_entries_updated_at
  before update on public.play_log_entries
  for each row execute function public.set_updated_at();

-- ── RLS ───────────────────────────────────────────────────────

alter table public.play_log_metric_defs      enable row level security;
alter table public.play_log_game_templates   enable row level security;
alter table public.play_log_entries          enable row level security;

drop policy if exists "play_log_metric_defs_select" on public.play_log_metric_defs;
create policy "play_log_metric_defs_select"
  on public.play_log_metric_defs for select
  to authenticated
  using (true);

drop policy if exists "play_log_templates_select" on public.play_log_game_templates;
create policy "play_log_templates_select"
  on public.play_log_game_templates for select
  to authenticated
  using (is_system = true or auth.uid() = user_id);

drop policy if exists "play_log_templates_insert" on public.play_log_game_templates;
create policy "play_log_templates_insert"
  on public.play_log_game_templates for insert
  to authenticated
  with check (is_system = false and auth.uid() = user_id);

drop policy if exists "play_log_templates_update" on public.play_log_game_templates;
create policy "play_log_templates_update"
  on public.play_log_game_templates for update
  to authenticated
  using (is_system = false and auth.uid() = user_id);

drop policy if exists "play_log_templates_delete" on public.play_log_game_templates;
create policy "play_log_templates_delete"
  on public.play_log_game_templates for delete
  to authenticated
  using (is_system = false and auth.uid() = user_id);

drop policy if exists "play_log_entries_select" on public.play_log_entries;
create policy "play_log_entries_select"
  on public.play_log_entries for select
  using (auth.uid() = user_id);

drop policy if exists "play_log_entries_insert" on public.play_log_entries;
create policy "play_log_entries_insert"
  on public.play_log_entries for insert
  with check (auth.uid() = user_id);

drop policy if exists "play_log_entries_update" on public.play_log_entries;
create policy "play_log_entries_update"
  on public.play_log_entries for update
  using (auth.uid() = user_id);

drop policy if exists "play_log_entries_delete" on public.play_log_entries;
create policy "play_log_entries_delete"
  on public.play_log_entries for delete
  using (auth.uid() = user_id);

-- ── Seed metric defs + system templates ───────────────────────

insert into public.play_log_metric_defs (slug, label, value_type, sort_order) values
  ('counter',           'Counter Start',        'integer', 10),
  ('bet_size',          'Bet size',             'money',   20),
  ('denom',             'Denom',                'money',   30),
  ('spin_count',        'Spins',                'integer', 40),
  ('bonus_count',       'Bonuses',              'integer', 50),
  ('money_in',          'Cash in',              'money',   60),
  ('money_out',         'Cash out',             'money',   70),
  ('counter_at_hit',    'Counter Pop',          'integer', 80),
  ('mega',              'Mega',                 'integer', 90),
  ('grand',             'Grand',                'integer', 100),
  ('major',             'Major',                'integer', 110),
  ('minor',             'Minor',                'integer', 120),
  ('mini',              'Mini',                 'integer', 130),
  ('target_bonus_paid', 'Target bonus paid',    'money',   140)
on conflict (slug) do update set
  label = excluded.label,
  value_type = excluded.value_type,
  sort_order = excluded.sort_order;

insert into public.play_log_game_templates (
  slug, display_name, machine_slug, calculator_slug, metric_slugs, is_system, user_id
)
select v.slug, v.display_name, v.machine_slug, v.calculator_slug, v.metric_slugs, true, null::uuid
from (values
  (
    'phoenix-link',
    'Phoenix Link',
    'phoenix-link',
    'phoenix',
    array['counter','bet_size','denom','spin_count','bonus_count','money_in','money_out','counter_at_hit']::text[]
  ),
  (
    'buffalo-link',
    'Buffalo Link',
    'buffalo-ascension',
    'buffalo',
    array['counter','bet_size','denom','spin_count','bonus_count','money_in','money_out','counter_at_hit']::text[]
  ),
  (
    'stack-up-pays',
    'Stack Up Pays',
    'stack-up-pays',
    'stackup',
    array['bet_size','denom','mega','grand','major','minor','mini','spin_count','money_in','money_out','target_bonus_paid']::text[]
  ),
  (
    'must-hit-by',
    'Must Hit By (generic)',
    null::text,
    'mhb',
    array['counter','bet_size','denom','spin_count','bonus_count','money_in','money_out','counter_at_hit']::text[]
  )
) as v(slug, display_name, machine_slug, calculator_slug, metric_slugs)
where not exists (
  select 1
  from public.play_log_game_templates t
  where t.is_system = true and t.slug = v.slug
);

update public.play_log_game_templates t
set
  display_name = v.display_name,
  machine_slug = v.machine_slug,
  calculator_slug = v.calculator_slug,
  metric_slugs = v.metric_slugs,
  updated_at = now()
from (values
  (
    'phoenix-link',
    'Phoenix Link',
    'phoenix-link',
    'phoenix',
    array['counter','bet_size','denom','spin_count','bonus_count','money_in','money_out','counter_at_hit']::text[]
  ),
  (
    'buffalo-link',
    'Buffalo Link',
    'buffalo-ascension',
    'buffalo',
    array['counter','bet_size','denom','spin_count','bonus_count','money_in','money_out','counter_at_hit']::text[]
  ),
  (
    'stack-up-pays',
    'Stack Up Pays',
    'stack-up-pays',
    'stackup',
    array['bet_size','denom','mega','grand','major','minor','mini','spin_count','money_in','money_out','target_bonus_paid']::text[]
  ),
  (
    'must-hit-by',
    'Must Hit By (generic)',
    null::text,
    'mhb',
    array['counter','bet_size','denom','spin_count','bonus_count','money_in','money_out','counter_at_hit']::text[]
  )
) as v(slug, display_name, machine_slug, calculator_slug, metric_slugs)
where t.is_system = true and t.slug = v.slug;
