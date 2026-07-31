create or replace function public.record_app_section_visit(p_section_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_section text := lower(btrim(coalesce(p_section_id, '')));
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if v_section = '' then
    raise exception 'section_id required';
  end if;

  insert into public.app_section_visits (user_id, section_id)
  values (auth.uid(), v_section);
exception
  when check_violation then
    raise exception 'invalid section_id: %', v_section;
end;
$$;
