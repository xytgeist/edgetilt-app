drop function if exists public.record_app_section_visit(text);

create or replace function public.record_app_section_visit(
  p_section_id text,
  p_sub_section_id text default null,
  p_event_kind text default 'visit'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_section text := lower(btrim(coalesce(p_section_id, '')));
  v_sub_section text := nullif(lower(btrim(coalesce(p_sub_section_id, ''))), '');
  v_event_kind text := lower(btrim(coalesce(p_event_kind, 'visit')));
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if v_section = '' then
    raise exception 'section_id required';
  end if;

  if v_event_kind not in ('visit', 'session_recorded') then
    raise exception 'invalid event_kind: %', v_event_kind;
  end if;

  if v_event_kind = 'session_recorded' and v_section not in ('play-logbook', 'poker-bankroll') then
    raise exception 'session_recorded not allowed for section: %', v_section;
  end if;

  if v_event_kind = 'visit'
    and v_sub_section is not null
    and v_section = 'calculators'
    and v_sub_section not in (
      'phoenix',
      'buffalo-link',
      'buffalo-diamond',
      'stackup',
      'mhb',
      'wof-collectors-edition'
    )
  then
    raise exception 'invalid calculator key: %', v_sub_section;
  end if;

  if v_event_kind = 'session_recorded'
    and v_section = 'poker-bankroll'
    and v_sub_section is not null
    and v_sub_section not in ('cash', 'tournament')
  then
    raise exception 'invalid poker session type: %', v_sub_section;
  end if;

  insert into public.app_section_visits (user_id, section_id, sub_section_id, event_kind)
  values (auth.uid(), v_section, v_sub_section, v_event_kind);
exception
  when check_violation then
    raise exception 'invalid section_id: %', v_section;
end;
$$;
